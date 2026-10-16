import express, { type RequestHandler, type ErrorRequestHandler } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { parseCookie } from 'cookie';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { enrichVehicle, type Membership, type Vehicle } from '../shared/domain.js';
import { AppError, check } from './errors.js';
import { get, put, query, remove, isConditionalFailure } from './dynamo.js';
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
const password = z.string().min(1).max(72);
const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const loginInput = z.object({ email, password }).strict();
const invitationInput = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

async function userByEmail(address: string) {
  const pointer = await get(`EMAIL#${address}`, 'USER');
  return pointer ? get(userKey(pointer.userId), 'PROFILE') : undefined;
}

async function userMemberships(id: string): Promise<Membership[]> {
  const links = await query(userKey(id), 'ORG#');
  return Promise.all(
    links.map(async (link) => {
      const org = await get(orgKey(link.organizationId), 'PROFILE');
      return {
        organizationId: link.organizationId,
        companyName: org?.name || '',
        kind: org?.kind,
        role: link.role,
      } as Membership;
    }),
  );
}

async function member(orgId: string, userId: string) {
  const link = await get(orgKey(orgId), `MEMBER#${userId}`);
  check(link, 403, 'FORBIDDEN', 'Você não tem acesso a este espaço.');
  const org = await get(orgKey(orgId), 'PROFILE');
  return { role: link.role as 'ADMIN' | 'DRIVER', kind: org?.kind as string };
}

async function findCar(orgId: string, id: string, userId: string, role?: string) {
  const car = await get(orgKey(orgId), `CAR#${id}`);
  check(
    car && !car.archivedAt && (role === 'ADMIN' || car.assignedDriverId === userId),
    404,
    'VEHICLE_NOT_FOUND',
    'Veículo não encontrado.',
  );
  return car;
}

async function readings(id: string, limit?: number) {
  return query(carKey(id), 'READING#', limit);
}

async function presentCar(car: Record<string, any>): Promise<Vehicle> {
  const history = await readings(car.id, 3);
  const driver = car.assignedDriverId
    ? await get(userKey(car.assignedDriverId), 'PROFILE')
    : undefined;
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
    assignedDriverId: car.assignedDriverId,
    assignedDriverName: driver?.name || null,
    historicalEntries: history.slice(0, 3).map((r) => ({
      id: r.id,
      odometer: r.odometer,
      measuredAt: r.measuredAt,
      source: r.source,
    })),
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

async function seedDemo() {
  if (process.env.SEED_DEMO !== 'true') return;
  const seed = await get('META', 'SEED');
  if (seed?.done) return;
  const demoPassword = process.env.DEMO_PASSWORD;
  check(
    demoPassword && demoPassword.length >= 16,
    503,
    'DEMO_PASSWORD_REQUIRED',
    'Configure a senha de demonstração.',
  );
  const passwordHash = await hash(demoPassword, 12);
  const users = [
    { id: 'a0000000-0000-4000-8000-000000000001', name: 'Ana Souza', email: 'ana@autokeep.local' },
    {
      id: 'a0000000-0000-4000-8000-000000000002',
      name: 'Marina Costa',
      email: 'marina@autokeep.local',
    },
    {
      id: 'a0000000-0000-4000-8000-000000000003',
      name: 'Lucas Almeida',
      email: 'lucas@autokeep.local',
    },
  ];
  for (const user of users) {
    await put(userKey(user.id), 'PROFILE', { ...user, passwordHash });
    await put(`EMAIL#${user.email}`, 'USER', { userId: user.id });
  }
  const personal = 'b0000000-0000-4000-8000-000000000001';
  const fleet = 'b0000000-0000-4000-8000-000000000002';
  await put(orgKey(personal), 'PROFILE', { id: personal, name: 'Minha garagem', kind: 'PERSONAL' });
  await put(orgKey(fleet), 'PROFILE', { id: fleet, name: 'Horizonte Logística', kind: 'FLEET' });
  for (const [orgId, userId, role] of [
    [personal, users[0].id, 'ADMIN'],
    [fleet, users[1].id, 'ADMIN'],
    [fleet, users[2].id, 'DRIVER'],
  ]) {
    await put(orgKey(orgId), `MEMBER#${userId}`, { userId, role });
    await put(userKey(userId), `ORG#${orgId}`, { organizationId: orgId, role });
  }
  const carId = 'c0000000-0000-4000-8000-000000000001';
  const lastDate = new Date(Date.now() - 75 * 86_400_000).toISOString();
  await put(orgKey(fleet), `CAR#${carId}`, {
    id: carId,
    organizationId: fleet,
    name: 'Fiat Strada',
    plate: 'GHT4J82',
    year: 2024,
    oilType: 'SEMI_SYNTHETIC',
    trackingMode: 'MANUAL',
    currentOdometer: 48360,
    lastUpdateDate: now(),
    lastOilChangeKm: 45000,
    lastOilChangeDate: lastDate,
    assignedDriverId: users[2].id,
  });
  await put(carKey(carId), `READING#${now()}#${randomUUID()}`, {
    id: randomUUID(),
    odometer: 48360,
    measuredAt: now(),
    source: 'MANUAL',
    actorId: users[2].id,
  });
  await put('META', 'SEED', { done: true });
}

let initialized: Promise<void> | undefined;
export function createCloudApp() {
  const app = express();
  app.disable('x-powered-by');
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
      initialized ??= seedDemo().catch((error) => {
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
  api.post('/auth/login', loginLimiter, async (req, res) => {
    const input = loginInput.parse(req.body);
    const user = await userByEmail(input.email);
    const valid = await compare(
      input.password,
      user?.passwordHash || '$2b$12$ylKop6NrdzvBR57FKgpFAus24xX1XJWbn90TliAu3Ln84h35jNAwu',
    );
    check(user && valid, 401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
    const token = randomBytes(32).toString('base64url');
    await put(`SESSION#${digest(token)}`, 'SESSION', {
      userId: user.id,
      expiresAt: Date.now() + 12 * 60 * 60_000,
      ttl: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    });
    res.cookie('autokeep_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: origin.startsWith('https://'),
      maxAge: 12 * 60 * 60_000,
      path: '/',
    });
    res.json({ user: userPublic(user), memberships: await userMemberships(user.id) });
  });
  api.post('/auth/register-invited', loginLimiter, async (req, res) => {
    const input = invitationInput
      .extend({ name: z.string().trim().min(2).max(100), password: password.min(12) })
      .parse(req.body);
    const invite = await get(`INVITE#${digest(input.token)}`, 'INVITE');
    check(
      invite && !invite.acceptedAt && invite.expiresAt > Date.now(),
      404,
      'INVITATION_INVALID',
      'Convite inválido ou expirado.',
    );
    check(
      !(await userByEmail(invite.email)),
      409,
      'ACCOUNT_EXISTS',
      'Este e-mail já tem conta. Entre para aceitar o convite.',
    );
    const id = randomUUID();
    await put(
      userKey(id),
      'PROFILE',
      { id, name: input.name, email: invite.email, passwordHash: await hash(input.password, 12) },
      true,
    );
    await put(`EMAIL#${invite.email}`, 'USER', { userId: id }, true);
    await put(orgKey(invite.organizationId), `MEMBER#${id}`, { userId: id, role: 'DRIVER' });
    await put(userKey(id), `ORG#${invite.organizationId}`, {
      organizationId: invite.organizationId,
      role: 'DRIVER',
    });
    await put(`INVITE#${digest(input.token)}`, 'INVITE', { ...invite, acceptedAt: now() });
    res.status(201).json({ ok: true });
  });
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
  api.post('/auth/logout', async (_req, res) => {
    await remove(`SESSION#${res.locals.sessionHash}`, 'SESSION');
    res.clearCookie('autokeep_session', { path: '/', httpOnly: true, sameSite: 'strict' });
    res.status(204).end();
  });
  api.get('/me/organizations', async (_req, res) =>
    res.json({ organizations: await userMemberships(res.locals.user.id) }),
  );
  api.post('/organizations', async (req, res) => {
    const input = z
      .object({
        companyName: z.string().trim().min(2).max(100),
        kind: z.enum(['PERSONAL', 'FLEET']).default('FLEET'),
      })
      .strict()
      .parse(req.body);
    const id = randomUUID(),
      userId = res.locals.user.id;
    await put(orgKey(id), 'PROFILE', { id, name: input.companyName, kind: input.kind }, true);
    await put(orgKey(id), `MEMBER#${userId}`, { userId, role: 'ADMIN' });
    await put(userKey(userId), `ORG#${id}`, { organizationId: id, role: 'ADMIN' });
    await audit(id, userId, 'ORGANIZATION_CREATED');
    res.status(201).json({ id });
  });
  api.post('/invitations/accept', async (req, res) => {
    const input = invitationInput.parse(req.body);
    const invite = await get(`INVITE#${digest(input.token)}`, 'INVITE');
    check(
      invite &&
        !invite.acceptedAt &&
        invite.expiresAt > Date.now() &&
        invite.email === res.locals.user.email,
      403,
      'INVITATION_INVALID',
      'O convite deve corresponder ao e-mail da sua conta e estar válido.',
    );
    await put(orgKey(invite.organizationId), `MEMBER#${res.locals.user.id}`, {
      userId: res.locals.user.id,
      role: 'DRIVER',
    });
    await put(userKey(res.locals.user.id), `ORG#${invite.organizationId}`, {
      organizationId: invite.organizationId,
      role: 'DRIVER',
    });
    await put(`INVITE#${digest(input.token)}`, 'INVITE', { ...invite, acceptedAt: now() });
    res.json({ ok: true });
  });
  api.param('organizationId', async (_req, res, next, raw) => {
    try {
      res.locals.organizationId = uuid.parse(raw);
      res.locals.membership = await member(raw, res.locals.user.id);
      next();
    } catch (error) {
      next(error);
    }
  });
  api.param('vehicleId', async (_req, res, next, raw) => {
    try {
      res.locals.vehicleId = uuid.parse(raw);
      res.locals.vehicle = await findCar(
        res.locals.organizationId,
        raw,
        res.locals.user.id,
        res.locals.membership.role,
      );
      next();
    } catch (error) {
      next(error);
    }
  });
  const admin: RequestHandler = (_req, res, next) => {
    try {
      check(
        res.locals.membership.role === 'ADMIN',
        403,
        'ADMIN_REQUIRED',
        'Esta ação é exclusiva do gestor.',
      );
      next();
    } catch (error) {
      next(error);
    }
  };
  const org = '/organizations/:organizationId';
  const car = `${org}/vehicles/:vehicleId`;
  api.get(`${org}/dashboard`, async (_req, res) => {
    const all = await query(orgKey(res.locals.organizationId), 'CAR#');
    const visible = all.filter(
      (v) =>
        !v.archivedAt &&
        (res.locals.membership.role === 'ADMIN' || v.assignedDriverId === res.locals.user.id),
    );
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
        assignedDriverId: res.locals.membership.role === 'DRIVER' ? userId : null,
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
  api.post(`${car}/oil-changes`, admin, async (req, res) => {
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
    const rs = (await readings(v.id))
      .slice(0, 100)
      .map((r) => ({ id: r.id, odometer: r.odometer, measuredAt: r.measuredAt, source: r.source }));
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
  api.put(`${car}/driver`, admin, async (req, res) => {
    const { driverId } = z.object({ driverId: uuid.nullable() }).strict().parse(req.body);
    const v = res.locals.vehicle;
    check(
      res.locals.membership.kind === 'FLEET',
      400,
      'FLEET_REQUIRED',
      'Atribuições estão disponíveis para frotas.',
    );
    if (driverId)
      check(
        (await member(v.organizationId, driverId)).role === 'DRIVER',
        400,
        'DRIVER_REQUIRED',
        'Selecione um motorista da frota.',
      );
    await put(orgKey(v.organizationId), `CAR#${v.id}`, { ...v, assignedDriverId: driverId });
    await audit(v.organizationId, res.locals.user.id, 'DRIVER_ASSIGNED', v.id);
    res.json({ ok: true });
  });
  api.delete(car, admin, async (_req, res) => {
    const v = res.locals.vehicle;
    await put(orgKey(v.organizationId), `CAR#${v.id}`, {
      ...v,
      archivedAt: now(),
      assignedDriverId: null,
    });
    await audit(v.organizationId, res.locals.user.id, 'VEHICLE_ARCHIVED', v.id);
    res.status(204).end();
  });
  api.get(`${org}/members`, admin, async (_req, res) => {
    const links = await query(orgKey(res.locals.organizationId), 'MEMBER#');
    const cars = await query(orgKey(res.locals.organizationId), 'CAR#');
    const members = await Promise.all(
      links.map(async (link) => {
        const user = await get(userKey(link.userId), 'PROFILE');
        return {
          id: link.userId,
          name: user?.name || '',
          email: user?.email || '',
          role: link.role,
          assignedCount: cars.filter((v) => !v.archivedAt && v.assignedDriverId === link.userId)
            .length,
        };
      }),
    );
    res.json({ members });
  });
  api.delete(`${org}/members/:memberId`, admin, async (req, res) => {
    const id = uuid.parse(req.params.memberId),
      orgId = res.locals.organizationId;
    check(
      (await member(orgId, id)).role === 'DRIVER',
      400,
      'CANNOT_REMOVE_ADMIN',
      'Gestores não podem ser removidos por esta ação.',
    );
    const cars = await query(orgKey(orgId), 'CAR#');
    check(
      !cars.some((v) => !v.archivedAt && v.assignedDriverId === id),
      409,
      'DRIVER_HAS_VEHICLES',
      'Desvincule os veículos antes de remover o motorista.',
    );
    await remove(orgKey(orgId), `MEMBER#${id}`);
    await remove(userKey(id), `ORG#${orgId}`);
    await audit(orgId, res.locals.user.id, 'MEMBER_REMOVED');
    res.status(204).end();
  });
  api.post(`${org}/invitations`, admin, async (req, res) => {
    check(
      res.locals.membership.kind === 'FLEET',
      400,
      'FLEET_REQUIRED',
      'Convites estão disponíveis para frotas.',
    );
    const { email: address } = z.object({ email }).strict().parse(req.body);
    const existing = await userByEmail(address);
    if (existing)
      check(
        !(await get(orgKey(res.locals.organizationId), `MEMBER#${existing.id}`)),
        409,
        'ALREADY_MEMBER',
        'Esta pessoa já faz parte da frota.',
      );
    const token = randomBytes(32).toString('base64url');
    await put(`INVITE#${digest(token)}`, 'INVITE', {
      email: address,
      organizationId: res.locals.organizationId,
      expiresAt: Date.now() + 7 * 86_400_000,
      ttl: Math.floor(Date.now() / 1000) + 7 * 86_400,
    });
    await audit(res.locals.organizationId, res.locals.user.id, 'INVITATION_CREATED');
    res.status(201).json({ invitationUrl: `${origin}/#invite=${token}`, expiresInDays: 7 });
  });
  api.get(`${org}/audit`, admin, async (_req, res) => {
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
  api.get(`${org}/notifications`, async (_req, res) => res.json({ notifications: [] }));
  api.post(`${org}/notifications/read`, async (_req, res) => res.json({ ok: true }));
  api.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Recurso não encontrado.')));
  app.use('/api', api);
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const errorId = randomUUID();
    if (error instanceof AppError)
      return void res
        .status(error.status)
        .json({ code: error.code, message: error.message, errorId });
    if (error instanceof ZodError || (error instanceof SyntaxError && 'body' in error))
      return void res
        .status(400)
        .json({
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
    res
      .status(503)
      .json({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Serviço temporariamente indisponível.',
        errorId,
      });
  };
  app.use(errors);
  return app;
}
