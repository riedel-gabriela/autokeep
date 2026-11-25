import { createHash } from 'node:crypto';
import { sendNotification, setVapidDetails } from 'web-push';
import { z } from 'zod';
import type { Vehicle } from '../shared/domain.js';
import { claimDelivery, get, isConditionalFailure, put, query, removeOwned } from './dynamo.js';

const publicKey = process.env.PUSH_PUBLIC_KEY;
const privateKey = process.env.PUSH_PRIVATE_KEY;
const subject = process.env.PUSH_SUBJECT;
export const pushPublicKey = publicKey && privateKey && subject ? publicKey : undefined;
if (pushPublicKey) setVapidDetails(subject!, pushPublicKey, privateKey!);

export const pushPartition = 'WEB_PUSH';
const day = 86_400_000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const subscriptionKey = (endpoint: string) => `SUB#${hash(endpoint)}`;

export const pushEndpoint = z
  .string()
  .max(2048)
  .refine((endpoint) => {
    try {
      const url = new URL(endpoint);
      const host = url.hostname;
      return (
        url.protocol === 'https:' &&
        !url.port &&
        !url.username &&
        !url.password &&
        !url.hash &&
        (host === 'fcm.googleapis.com' ||
          host === 'updates.push.services.mozilla.com' ||
          host.endsWith('.push.apple.com') ||
          host.endsWith('.notify.windows.com'))
      );
    } catch {
      return false;
    }
  });
export const pushSubscription = z
  .object({
    endpoint: pushEndpoint,
    keys: z
      .object({
        p256dh: z.string().regex(/^B[A-Za-z0-9_-]{86}$/),
        auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
      })
      .strict(),
  })
  .strict();

export function maintenanceNotice(vehicle: Vehicle) {
  const { level, daysRemaining, distanceRemainingKm } = vehicle.status;
  if (level === 'OK') return;
  const due = level === 'DUE';
  const conditions: string[] = [];
  if (distanceRemainingKm <= (due ? 0 : 500)) {
    conditions.push(
      due ? 'limite de quilometragem atingido' : `faltam ${Math.ceil(distanceRemainingKm)} km`,
    );
  }
  if (daysRemaining <= (due ? 0 : 30)) {
    conditions.push(due ? 'prazo atingido' : `faltam ${daysRemaining} dias`);
  }
  return {
    id: hash(
      JSON.stringify([vehicle.id, vehicle.lastOilChangeDate, vehicle.lastOilChangeKm, level]),
    ),
    title: due ? 'Hora de trocar o óleo' : 'Troca de óleo se aproximando',
    body: `${vehicle.name}: ${conditions.join(' e ')}.`,
  };
}

export async function deliverMaintenancePush(
  visibleVehicles: (userId: string) => Promise<Vehicle[]>,
) {
  if (!pushPublicKey) return;
  const subscriptions = await query(pushPartition, 'SUB#');
  const subscriptionsByUser = new Map<string, typeof subscriptions>();
  for (const subscription of subscriptions) {
    const devices = subscriptionsByUser.get(subscription.userId) ?? [];
    devices.push(subscription);
    subscriptionsByUser.set(subscription.userId, devices);
  }
  for (const [userId, devices] of subscriptionsByUser) {
    try {
      for (const vehicle of await visibleVehicles(userId)) {
        const notice = maintenanceNotice(vehicle);
        if (!notice) continue;
        const payload = JSON.stringify(notice);
        for (const device of devices) {
          const subscription = pushSubscription.safeParse({
            endpoint: device.endpoint,
            keys: { auth: device.auth, p256dh: device.p256dh },
          });
          if (!subscription.success) continue;
          const deliveryPk = `PUSH#${device.sk}#${userId}`;
          const deliverySk = `NOTICE#${notice.id}`;
          try {
            await claimDelivery(deliveryPk, deliverySk, Date.now() + 120_000);
          } catch (error) {
            if (isConditionalFailure(error)) continue;
            throw error;
          }
          try {
            const current = await get(pushPartition, device.sk);
            if (current?.userId !== userId) continue;
            await sendNotification(subscription.data, payload, {
              TTL: 4 * 3600,
              timeout: 4000,
            });
            await put(deliveryPk, deliverySk, { ttl: Math.floor((Date.now() + 400 * day) / 1000) });
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410)
              await removeOwned(pushPartition, device.sk, userId);
            else console.error(JSON.stringify({ event: 'maintenance_push_failed', status }));
          }
        }
      }
    } catch {
      console.error(JSON.stringify({ event: 'maintenance_push_recipient_failed' }));
    }
  }
}
