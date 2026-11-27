import express, { type ErrorRequestHandler, type Response } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { parseCookie } from 'cookie';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import * as oidc from 'openid-client';
import { enrichVehicle, type Membership, type Vehicle } from '../shared/domain.js';
import { AppError, check } from './errors.js';
import {
  get,
  put,
  query,
  remove,
  removeOwned,
  take,
  writeRegistration,
  isConditionalFailure,
} from './dynamo.js';
import {
  deliverMaintenancePush,
  pushEndpoint,
  pushPartition,
  pushPublicKey,
  pushSubscription,
  subscriptionKey,
} from './push.js';
import { googleCallbackPath, googleConfiguration, googleEnabled } from './google.js';
import { createVehicleSchema, oilChangeSchema, readingSchema, uuid } from './validation.js';

const origin = process.env.APP_ORIGIN || 'http://localhost:8080';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const userKey = (id: string) => `USER#${id}`;
const orgKey = (id: string) => `ORG#${id}`;
const carKey = (id: string) => `CAR#${id}`;
const userPublic = (user: Record<string, any>) => ({
  id: user.id,
  name: user.name,
  email: user.email,
});
const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const browserTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const googleStartInput = z.object({}).strict();
const oauthLifetime = 10 * 60_000;
const oauthCookie = 'autokeep_google';
const secureCookies = origin.startsWith('https://');
const googleOAuthRequired = process.env.AUTH_MODE === 'google';
const developmentLoginEnabled =
  process.env.NODE_ENV === 'development' &&
  process.env.DEV_LOGIN_ENABLED === 'true' &&
  !googleOAuthRequired;
const developmentUser = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'Ana Souza',
  email: 'ana@autokeep.local',
};
const oauthCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: secureCookies,
  path: googleCallbackPath,
};

async function userByEmail(address: string) {
  const pointer = await get(`EMAIL#${address}`, 'USER');
  return pointer ? get(userKey(pointer.userId), 'PROFILE') : undefined;
}

async function openSession(res: Response, userId: string) {
  const memberships = await userMemberships(userId);
  for (const membership of memberships) await audit(membership.organizationId, userId, 'LOGIN');
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + 12 * 60 * 60_000;
  await put(`SESSION#${digest(token)}`, 'SESSION', {
    userId,
    expiresAt,
    ttl: Math.floor(expiresAt / 1000),
  });
  res.cookie('autokeep_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: secureCookies,
    maxAge: 12 * 60 * 60_000,
    path: '/',
  });
  return memberships;
}

async function registerGoogleAccount(address: string, name: string, identityKey: string) {
  const userId = randomUUID();
  await writeRegistration([
    { pk: userKey(userId), sk: 'PROFILE', data: { id: userId, name, email: address } },
    { pk: `EMAIL#${address}`, sk: 'USER', data: { userId } },
    { pk: identityKey, sk: 'USER', data: { userId } },
  ]);
  return userId;
}

async function userMemberships(id: string): Promise<Membership[]> {
  const memberships: Membership[] = [];
  for (const link of await query(userKey(id), 'ORG#')) {
    const organization = await get(orgKey(link.organizationId), 'PROFILE');
    if (organization?.kind === 'PERSONAL' && link.role === 'ADMIN') {
      memberships.push({
        organizationId: link.organizationId,
        companyName: organization.name,
        kind: 'PERSONAL',
        role: 'ADMIN',
      });
    }
  }
  if (memberships.length) return memberships;
  // Stable ID makes provisioning idempotent without moving or deleting legacy data.
  const hex = digest(`personal-garage:${id}`);
  const organizationId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  await put(orgKey(organizationId), 'PROFILE', {
    id: organizationId,
    name: 'Minha garagem',
    kind: 'PERSONAL',
  });
  await put(orgKey(organizationId), `MEMBER#${id}`, { userId: id, role: 'ADMIN' });
  await put(userKey(id), `ORG#${organizationId}`, { organizationId, role: 'ADMIN' });
  return [{ organizationId, companyName: 'Minha garagem', kind: 'PERSONAL', role: 'ADMIN' }];
}

async function member(orgId: string, userId: string) {
  const link = await get(orgKey(orgId), `MEMBER#${userId}`);
  const organization = await get(orgKey(orgId), 'PROFILE');
  check(
    link?.role === 'ADMIN' && organization?.kind === 'PERSONAL',
    403,
    'FORBIDDEN',
    'Você não tem acesso a esta garagem.',
  );
}

async function findCar(orgId: string, id: string) {
  const car = await get(orgKey(orgId), `CAR#${id}`);
  check(car && !car.archivedAt, 404, 'VEHICLE_NOT_FOUND', 'Veículo não encontrado.');
  return car;
}

async function readings(id: string, limit?: number) {
  return query(carKey(id), 'READING#', limit);
}

async function presentCar(car: Record<string, any>): Promise<Vehicle> {
  const history = await readings(car.id, 3);
  return enrichVehicle({
    id: car.id,
    organizationId: car.organizationId,
    name: car.name,
    plate: car.plate,
    year: car.year,
    oilType: car.oilType,
    trackingMode: car.trackingMode,
    currentOdometer: car.currentOdometer,
    lastUpdateDate: car.lastUpdateDate,
    lastOilChangeKm: car.lastOilChangeKm,
    lastOilChangeDate: car.lastOilChangeDate,
    historicalEntries: history.slice(0, 3).map((r) => ({
      id: r.id,
      odometer: r.odometer,
      measuredAt: r.measuredAt,
      source: r.source,
    })),
  });
}

export async function runMaintenancePush() {
  await deliverMaintenancePush(async (userId) => {
    const vehicles: Vehicle[] = [];
    for (const membership of await userMemberships(userId)) {
      for (const car of await query(orgKey(membership.organizationId), 'CAR#')) {
        if (!car.archivedAt) vehicles.push(await presentCar(car));
      }
    }
    return vehicles;
  });
}

async function audit(orgId: string, userId: string, action: string, vehicleId?: string) {
  const time = now();
  await put(orgKey(orgId), `AUDIT#${time}#${randomUUID()}`, {
    id: randomUUID(),
    action,
    actorId: userId,
    vehicleId: vehicleId || null,
    createdAt: time,
  });
}

async function seedDevelopmentUser() {
  if (!developmentLoginEnabled) return;
  if (!(await get(userKey(developmentUser.id), 'PROFILE'))) {
    await put(userKey(developmentUser.id), 'PROFILE', developmentUser);
  }
  await userMemberships(developmentUser.id);
}

let initialized: Promise<void> | undefined;
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.AWS_LAMBDA_FUNCTION_NAME ? 1 : false);
  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(express.json({ limit: '16kb' }));
  api.use(async (req, _res, next) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        check(
          req.headers.origin === new URL(origin).origin,
          403,
          'INVALID_ORIGIN',
          'Origem da solicitação não permitida.',
        );
        check(req.is('application/json'), 415, 'JSON_REQUIRED', 'Envie os dados no formato JSON.');
      }
      initialized ??= seedDevelopmentUser().catch((error) => {
        initialized = undefined;
        throw error;
      });
      await initialized;
      next();
    } catch (error) {
      next(error);
    }
  });
  api.get('/health', async (_req, res) => {
    await get('META', 'SEED');
    res.json({ status: 'ok' });
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  api.get('/auth/providers', (_req, res) =>
    res.json({
      google: googleEnabled && !developmentLoginEnabled,
      development: developmentLoginEnabled,
      password: false,
    }),
  );
  api.post('/auth/dev-login', loginLimiter, async (req, res) => {
    check(developmentLoginEnabled, 404, 'NOT_FOUND', 'Recurso não encontrado.');
    z.object({}).strict().parse(req.body);
    const user = await get(userKey(developmentUser.id), 'PROFILE');
    check(user, 503, 'DEV_USER_UNAVAILABLE', 'Conta de desenvolvimento indisponível.');
    const memberships = await openSession(res, user.id);
    res.json({ user: userPublic(user), memberships });
  });
  if (googleEnabled) {
    api.post('/auth/google/start', loginLimiter, async (req, res) => {
      googleStartInput.parse(req.body);
      const config = await googleConfiguration();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const verifier = oidc.randomPKCECodeVerifier();
      const browserToken = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + oauthLifetime;
      const url = oidc.buildAuthorizationUrl(config, {
        redirect_uri: new URL(googleCallbackPath, origin).href,
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: 'S256',
      });
      await put(
        `OAUTH#${digest(browserToken)}`,
        'GOOGLE',
        {
          state,
          nonce,
          verifier,
          expiresAt,
          ttl: Math.floor(expiresAt / 1000),
        },
        true,
      );
      res.cookie(oauthCookie, browserToken, { ...oauthCookieOptions, maxAge: oauthLifetime });
      res.json({ url: url.href });
    });
    api.get('/auth/google/callback', async (req, res) => {
      if (req.method !== 'GET') return void res.sendStatus(405);
      res.setHeader('Referrer-Policy', 'no-referrer');
      let stage = 'read_oauth_state';
      try {
        const browserToken = browserTokenSchema.safeParse(
          parseCookie(req.headers.cookie || '')[oauthCookie],
        );
        check(browserToken.success, 400, 'OAUTH_STATE', 'Login expirado.');
        const key = `OAUTH#${digest(browserToken.data)}`;
        const pending = await get(key, 'GOOGLE');
        check(
          pending && pending.expiresAt > Date.now() && pending.state === req.query.state,
          400,
          'OAUTH_STATE',
          'Login expirado.',
        );
        const attempt = await take(key, 'GOOGLE');
        check(attempt, 400, 'OAUTH_STATE', 'Login expirado.');
        res.clearCookie(oauthCookie, oauthCookieOptions);
        const callback = new URL(googleCallbackPath, origin);
        callback.search = new URL(req.originalUrl, origin).search;
        stage = 'load_google_config';
        const config = await googleConfiguration();
        stage = 'exchange_google_code';
        const tokens = await oidc.authorizationCodeGrant(config, callback, {
          expectedState: attempt.state,
          expectedNonce: attempt.nonce,
          pkceCodeVerifier: attempt.verifier,
        });
        const claims = tokens.claims();
        check(claims?.sub, 400, 'OAUTH_IDENTITY', 'Identidade Google inválida.');
        stage = 'find_google_identity';
        const identityKey = `OIDC#${digest(JSON.stringify([claims.iss, claims.sub]))}`;
        const identity = await get(identityKey, 'USER');
        let userId: string;
        if (identity) {
          userId = identity.userId;
        } else {
          const address = email.safeParse(claims.email);
          check(
            claims.email_verified === true && address.success,
            403,
            'OAUTH_EMAIL',
            'Use um e-mail Google verificado.',
          );
          const existingUser = await userByEmail(address.data);
          if (existingUser) {
            await put(identityKey, 'USER', { userId: existingUser.id }, true);
            userId = existingUser.id;
          } else {
            const name = (
              (typeof claims.name === 'string' && claims.name.trim()) ||
              address.data
            ).slice(0, 100);
            userId = await registerGoogleAccount(address.data, name, identityKey);
          }
        }
        stage = 'open_session';
        check(await get(userKey(userId), 'PROFILE'), 403, 'OAUTH_IDENTITY', 'Conta indisponível.');
        await openSession(res, userId);
        res.redirect(303, '/');
      } catch (error) {
        const code = error instanceof AppError ? error.code : 'OAUTH_FAILED';
        const errorName = error instanceof Error ? error.name : 'UnknownError';
        const oauthError = error instanceof oidc.ResponseBodyError ? error.error : undefined;
        const oauthStatus = error instanceof oidc.ResponseBodyError ? error.status : undefined;
        console.error(
          JSON.stringify({
            event: 'google_login_failed',
            stage,
            code,
            errorName,
            oauthError,
            oauthStatus,
          }),
        );
        res.redirect(303, `/?googleError=${code}`);
      }
    });
  }
  api.use(async (req, res, next) => {
    try {
      const token = parseCookie(req.headers.cookie || '').autokeep_session;
      check(
        token && /^[A-Za-z0-9_-]{43}$/.test(token),
        401,
        'UNAUTHENTICATED',
        'Entre na sua conta para continuar.',
      );
      const sessionHash = digest(token);
      const session = await get(`SESSION#${sessionHash}`, 'SESSION');
      check(
        session && session.expiresAt > Date.now(),
        401,
        'SESSION_EXPIRED',
        'Sua sessão expirou. Entre novamente.',
      );
      const user = await get(userKey(session.userId), 'PROFILE');
      check(user, 401, 'SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
      res.locals.user = user;
      res.locals.sessionHash = sessionHash;
      next();
    } catch (error) {
      next(error);
    }
  });
  api.get('/session', async (_req, res) =>
    res.json({
      user: userPublic(res.locals.user),
      memberships: await userMemberships(res.locals.user.id),
    }),
  );
  api.post('/auth/logout', async (req, res) => {
    for (const membership of await userMemberships(res.locals.user.id)) {
      await audit(membership.organizationId, res.locals.user.id, 'LOGOUT');
    }
    const endpoint = pushEndpoint.safeParse(req.body?.pushEndpoint);
    if (endpoint.success)
      await removeOwned(pushPartition, subscriptionKey(endpoint.data), res.locals.user.id);
    await remove(`SESSION#${res.locals.sessionHash}`, 'SESSION');
    res.clearCookie('autokeep_session', { path: '/', httpOnly: true, sameSite: 'strict' });
    res.status(204).end();
  });
  api.get('/push/config', (_req, res) => res.json({ publicKey: pushPublicKey ?? null }));
  api.post('/push/subscription', async (req, res) => {
    check(pushPublicKey, 503, 'PUSH_DISABLED', 'Notificações push indisponíveis neste ambiente.');
    const { endpoint, keys } = pushSubscription.parse(req.body);
    const key = subscriptionKey(endpoint);
    const userId = res.locals.user.id;
    const existing = await get(pushPartition, key);
    if (existing) {
      check(
        existing.userId === userId,
        409,
        'PUSH_ALREADY_LINKED',
        'Este navegador está vinculado a outra conta.',
      );
    } else {
      await put(pushPartition, key, { userId, endpoint, ...keys }, true);
    }
    res.status(204).end();
  });
  api.delete('/push/subscription', async (req, res) => {
    const endpoint = pushEndpoint.parse(req.body?.endpoint);
    await removeOwned(pushPartition, subscriptionKey(endpoint), res.locals.user.id);
    res.status(204).end();
  });
  api.get('/me/organizations', async (_req, res) =>
    res.json({ organizations: await userMemberships(res.locals.user.id) }),
  );
  api.param('organizationId', async (_req, res, next, raw) => {
    try {
      res.locals.organizationId = uuid.parse(raw);
      await member(raw, res.locals.user.id);
      next();
    } catch (error) {
      next(error);
    }
  });
  api.param('vehicleId', async (_req, res, next, raw) => {
    try {
      res.locals.vehicleId = uuid.parse(raw);
      res.locals.vehicle = await findCar(res.locals.organizationId, raw);
      next();
    } catch (error) {
      next(error);
    }
  });
  const org = '/organizations/:organizationId';
  const car = `${org}/vehicles/:vehicleId`;
  api.get(`${org}/dashboard`, async (_req, res) => {
    const all = await query(orgKey(res.locals.organizationId), 'CAR#');
    const visible = all.filter((vehicle) => !vehicle.archivedAt);
    res.json({ vehicles: await Promise.all(visible.map(presentCar)) });
  });
  api.post(`${org}/vehicles`, async (req, res) => {
    const input = createVehicleSchema.parse(req.body);
    const id = randomUUID(),
      time = now(),
      orgId = res.locals.organizationId,
      userId = res.locals.user.id;
    await put(
      orgKey(orgId),
      `CAR#${id}`,
      {
        id,
        organizationId: orgId,
        name: input.name,
        plate: input.plate,
        year: input.year,
        oilType: input.oilType,
        trackingMode: input.trackingMode,
        currentOdometer: input.currentOdometer,
        lastUpdateDate: time,
        lastOilChangeKm: input.lastOilChangeKm,
        lastOilChangeDate: input.lastOilChangeDate,
      },
      true,
    );
    await put(carKey(id), `READING#${time}#${randomUUID()}`, {
      id: randomUUID(),
      odometer: input.currentOdometer,
      measuredAt: time,
      source: 'MANUAL',
      actorId: userId,
    });
    await put(carKey(id), `OIL#${input.lastOilChangeDate}#${randomUUID()}`, {
      id: randomUUID(),
      odometer: input.lastOilChangeKm,
      changedAt: input.lastOilChangeDate,
      oilType: input.oilType,
      actorId: userId,
    });
    await audit(orgId, userId, 'VEHICLE_CREATED', id);
    res.status(201).json({ id });
  });
  api.get(car, async (_req, res) => res.json({ vehicle: await presentCar(res.locals.vehicle) }));
  api.post(`${car}/odometer`, async (req, res) => {
    const input = readingSchema.parse(req.body),
      v = res.locals.vehicle,
      time = input.measuredAt;
    check(
      input.odometer >= v.currentOdometer,
      400,
      'ODOMETER_DECREASE',
      'A quilometragem deve ser igual ou maior que a última leitura real.',
    );
    check(
      Date.parse(time) > Date.parse(v.lastUpdateDate),
      400,
      'READING_OUT_OF_ORDER',
      'Use uma data posterior à última leitura.',
    );
    await put(carKey(v.id), `READING#${time}#${randomUUID()}`, {
      id: randomUUID(),
      odometer: input.odometer,
      measuredAt: time,
      source: input.source,
      actorId: res.locals.user.id,
    });
    await put(orgKey(v.organizationId), `CAR#${v.id}`, {
      ...v,
      currentOdometer: input.odometer,
      lastUpdateDate: time,
    });
    await audit(v.organizationId, res.locals.user.id, 'ODOMETER_UPDATED', v.id);
    res.status(201).json({ ok: true });
  });
  api.post(`${car}/oil-changes`, async (req, res) => {
    const input = oilChangeSchema.parse(req.body),
      v = res.locals.vehicle;
    check(
      Date.parse(input.changedAt) > Date.parse(v.lastOilChangeDate) &&
        input.odometer >= v.lastOilChangeKm,
      400,
      'OIL_CHANGE_OUT_OF_ORDER',
      'A troca deve ser posterior à última manutenção, sem reduzir a quilometragem.',
    );
    const all = await readings(v.id);
    const lower = all
      .filter((r) => r.measuredAt <= input.changedAt)
      .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
    const upper = all
      .filter((r) => r.measuredAt >= input.changedAt)
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))[0];
    check(
      (!lower || input.odometer >= lower.odometer) && (!upper || input.odometer <= upper.odometer),
      400,
      'INCONSISTENT_ODOMETER',
      'A quilometragem da troca não corresponde às leituras registradas nessa data.',
    );
    await put(carKey(v.id), `OIL#${input.changedAt}#${randomUUID()}`, {
      id: randomUUID(),
      odometer: input.odometer,
      changedAt: input.changedAt,
      oilType: input.oilType,
      actorId: res.locals.user.id,
    });
    const update = {
      ...v,
      oilType: input.oilType,
      lastOilChangeKm: input.odometer,
      lastOilChangeDate: input.changedAt,
    };
    if (input.changedAt > v.lastUpdateDate) {
      check(
        input.odometer >= v.currentOdometer,
        400,
        'ODOMETER_DECREASE',
        'A quilometragem não pode diminuir.',
      );
      update.currentOdometer = input.odometer;
      update.lastUpdateDate = input.changedAt;
      await put(carKey(v.id), `READING#${input.changedAt}#${randomUUID()}`, {
        id: randomUUID(),
        odometer: input.odometer,
        measuredAt: input.changedAt,
        source: 'MANUAL',
        actorId: res.locals.user.id,
      });
    }
    await put(orgKey(v.organizationId), `CAR#${v.id}`, update);
    await audit(v.organizationId, res.locals.user.id, 'OIL_CHANGED', v.id);
    res.status(201).json({ ok: true });
  });
  api.get(`${car}/history`, async (_req, res) => {
    const v = res.locals.vehicle;
    const rs = (await readings(v.id, 100)).map((r) => ({
      id: r.id,
      odometer: r.odometer,
      measuredAt: r.measuredAt,
      source: r.source,
    }));
    const oils = await query(carKey(v.id), 'OIL#', 100);
    const oilChanges = await Promise.all(
      oils.map(async (o) => ({
        id: o.id,
        odometer: o.odometer,
        changedAt: o.changedAt,
        oilType: o.oilType,
        actorName: (await get(userKey(o.actorId), 'PROFILE'))?.name || '',
      })),
    );
    res.json({ readings: rs, oilChanges });
  });
  api.delete(car, async (_req, res) => {
    const v = res.locals.vehicle;
    await put(orgKey(v.organizationId), `CAR#${v.id}`, {
      ...v,
      archivedAt: now(),
    });
    await audit(v.organizationId, res.locals.user.id, 'VEHICLE_ARCHIVED', v.id);
    res.status(204).end();
  });
  api.get(`${org}/audit`, async (_req, res) => {
    const logs = await query(orgKey(res.locals.organizationId), 'AUDIT#', 100);
    const events = await Promise.all(
      logs.map(async (log) => ({
        id: log.id,
        action: log.action,
        actorName: (await get(userKey(log.actorId), 'PROFILE'))?.name || '',
        vehicleName: log.vehicleId
          ? (await get(orgKey(res.locals.organizationId), `CAR#${log.vehicleId}`))?.name || null
          : null,
        createdAt: log.createdAt,
      })),
    );
    res.json({ events });
  });
  api.get(`${org}/notifications`, async (_req, res) => {
    const orgId = res.locals.organizationId,
      user = res.locals.user;
    // Evaluate only vehicles visible to this recipient; no table scans or paid scheduler.
    const cars = (await query(orgKey(orgId), 'CAR#')).filter((vehicle) => !vehicle.archivedAt);
    const partition = `NOTIFY#${orgId}#${user.id}`;
    for (const car of cars) {
      const v = await presentCar(car);
      if (v.status.level === 'OK' && !v.calibrationDue) continue;
      const event = `${v.id}:${v.lastOilChangeDate}:${v.status.level}:${v.calibrationDue}`;
      const id = digest(event),
        key = `NOTICE#${id}`;
      if (!(await get(partition, key))) {
        const title =
          v.status.level === 'DUE'
            ? 'Hora de trocar o óleo'
            : v.status.level === 'WARNING'
              ? 'Próxima troca no radar'
              : 'Atualize sua quilometragem';
        const body =
          v.status.level === 'OK'
            ? `${v.name}: registre uma nova leitura para calibrar a previsão.`
            : `${v.name} · ${v.plate}: ${Math.max(0, Math.floor(v.status.distanceRemainingKm))} km ou ${Math.max(0, v.status.daysRemaining)} dias para a troca.`;
        const notification = {
          id,
          vehicleId: v.id,
          title,
          body,
          createdAt: now(),
          readAt: null,
        };
        try {
          await put(partition, key, notification, true);
        } catch (error) {
          if (!isConditionalFailure(error)) throw error;
        }
      }
    }
    const notifications = (await query(partition, 'NOTICE#'))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100)
      .map(({ pk, sk, emailSentAt, ...notification }) => notification);
    res.json({ notifications });
  });
  api.post(`${org}/notifications/read`, async (_req, res) => {
    const partition = `NOTIFY#${res.locals.organizationId}#${res.locals.user.id}`;
    for (const notification of await query(partition, 'NOTICE#')) {
      if (!notification.readAt)
        await put(partition, notification.sk, { ...notification, readAt: now() });
    }
    res.json({ ok: true });
  });
  api.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Recurso não encontrado.')));
  app.use('/api', api);
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const errorId = randomUUID();
    if (error instanceof AppError)
      return void res
        .status(error.status)
        .json({ code: error.code, message: error.message, errorId });
    if (error instanceof ZodError || (error instanceof SyntaxError && 'body' in error))
      return void res.status(400).json({
        code: 'INVALID_INPUT',
        message: 'Confira os campos e as datas informadas.',
        errorId,
      });
    if (isConditionalFailure(error))
      return void res
        .status(409)
        .json({ code: 'ALREADY_EXISTS', message: 'Este registro já existe.', errorId });
    console.error(
      JSON.stringify({ event: 'request_failed', errorId, code: (error as Error)?.message }),
    );
    res.status(503).json({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Serviço temporariamente indisponível.',
      errorId,
    });
  };
  app.use(errors);
  return app;
}
