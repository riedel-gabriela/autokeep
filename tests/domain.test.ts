import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyAverage, enrichVehicle, type Reading } from '../src/shared/domain.js';
import { maintenanceNotice, pushEndpoint } from '../src/server/push.js';

const now = new Date('2026-11-17T12:00:00Z');
const reading = (day: number, odometer: number): Reading => ({
  id: String(day),
  measuredAt: `2026-11-${day}T12:00:00Z`,
  odometer,
  source: 'MANUAL',
});
const base = {
  id: 'car',
  organizationId: 'org',
  name: 'Carro',
  plate: 'ABC1D23',
  year: 2024,
  oilType: 'MINERAL' as const,
  trackingMode: 'MANUAL' as const,
  currentOdometer: 14000,
  lastUpdateDate: '2026-11-17T12:00:00Z',
  lastOilChangeKm: 10000,
  lastOilChangeDate: '2026-01-01T12:00:00Z',
  historicalEntries: [],
};

test('média usa as três últimas leituras e pondera intervalos desiguais', () => {
  assert.equal(
    dailyAverage([reading(10, 0), reading(11, 900), reading(13, 1000), reading(17, 1600)]),
    700 / 6,
  );
  assert.equal(dailyAverage([reading(17, 100)]), 0);
});

test('tempo vence mesmo com quilometragem disponível', () => {
  const vehicle = enrichVehicle({ ...base, lastOilChangeDate: '2025-11-17T12:00:00Z' }, now);
  assert.equal(vehicle.status.level, 'DUE');
  assert.equal(vehicle.status.trigger, 'TIME');
});

test('pré-alerta de distância e projeção preservam a leitura real', () => {
  const vehicle = enrichVehicle(
    {
      ...base,
      currentOdometer: 14600,
      lastUpdateDate: '2026-11-16T12:00:00Z',
      historicalEntries: [reading(15, 14500), reading(16, 14600)],
    },
    now,
  );
  assert.equal(vehicle.currentOdometer, 14600);
  assert.equal(vehicle.predictedOdometer, 14700);
  assert.equal(vehicle.status.level, 'WARNING');
  assert.equal(vehicle.status.trigger, 'DISTANCE');
});

test('limites de óleo e calibração manual são independentes da atribuição', () => {
  const vehicle = enrichVehicle(
    { ...base, oilType: 'SYNTHETIC', lastUpdateDate: '2026-10-01T12:00:00Z' },
    now,
  );
  assert.equal(vehicle.status.distanceRemainingKm, 8000);
  assert.equal(vehicle.calibrationDue, true);
  assert.equal(
    enrichVehicle({ ...base, trackingMode: 'OBD2', lastUpdateDate: '2026-10-01T12:00:00Z' }, now)
      .calibrationDue,
    false,
  );
});

test('push diferencia vencimento por tempo e distância e mantém a identidade do aviso', () => {
  const notice = (odometer: number, lastOilChangeDate = base.lastOilChangeDate) =>
    maintenanceNotice(
      enrichVehicle({ ...base, currentOdometer: odometer, lastOilChangeDate }, now),
    );
  assert.equal(notice(14000), undefined);
  const warning = notice(14700);
  assert.match(warning!.body, /faltam 300 km/);
  assert.equal(notice(14800)?.id, warning!.id);
  const distanceDue = notice(15000);
  assert.notEqual(distanceDue?.id, warning!.id);
  assert.match(distanceDue!.body, /limite de quilometragem atingido/);
  const timeDue = notice(14000, '2025-11-17T12:00:00Z');
  assert.match(timeDue!.body, /prazo atingido/);
  assert.match(
    notice(15000, '2025-11-17T12:00:00Z')!.body,
    /quilometragem atingido e prazo atingido/,
  );
});

test('push aceita somente endpoints HTTPS de provedores de navegador', () => {
  assert.ok(pushEndpoint.safeParse('https://fcm.googleapis.com/fcm/send/subscription').success);
  assert.ok(pushEndpoint.safeParse('https://web.push.apple.com/subscription').success);
  for (const endpoint of [
    'http://fcm.googleapis.com/push',
    'https://fcm.googleapis.com@127.0.0.1/push',
    'https://fcm.googleapis.com.example.com/push',
    'https://fcm.googleapis.com:8080/push',
  ]) {
    assert.equal(pushEndpoint.safeParse(endpoint).success, false);
  }
});

test('limite de distância vencido sem média não é classificado como prazo temporal', () => {
  const vehicle = enrichVehicle({ ...base, currentOdometer: 15000 }, now);
  assert.equal(vehicle.status.level, 'DUE');
  assert.equal(vehicle.status.trigger, 'DISTANCE');
  assert.equal(vehicle.status.projectedDueDate, now.toISOString());
});
