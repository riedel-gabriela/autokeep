import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { z, ZodError } from 'zod';
import { pool, rows, transaction } from './db.js';
import { AppError, check } from './errors.js';
import {
  authenticate,
  digest,
  login,
  loginLimiter,
  loginSchema,
  passwordSchema,
  protectWrites,
  setCookie,
} from './auth.js';
import {
  audit,
  membership,
  memberships,
  presentVehicle,
  vehicle,
  visibleVehicles,
} from './repository.js';
import { createVehicleSchema, oilChangeSchema, readingSchema, uuid } from './validation.js';
import { sendInvitation } from './mail.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(protectWrites, express.json({ limit: '16kb' }));
  api.get('/health', async (_req, res) => {
    await pool.execute('SELECT 1');
    res.json({ status: 'ok' });
  });
  api.post('/auth/login', loginLimiter, async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await login(input.email, input.password);
    setCookie(res, result.token);
    res.json({
      user: { id: result.user.id, name: result.user.name, email: result.user.email },
      memberships: await memberships(result.user.id),
    });
  });
  // O cadastro local só pode acontecer com um convite válido e vinculado ao e-mail.
  api.post('/auth/register-invited', loginLimiter, async (req, res) => {
    const input = z
      .object({
        token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        name: z.string().trim().min(2).max(100),
        password: passwordSchema.refine((v) => v.length >= 12),
      })
      .strict()
      .parse(req.body);
    const passwordHash = await hash(input.password, 12);
    await transaction(async (db) => {
      const [invite] = await rows<{ id: string; email: string; organization_id: string }>(
        db,
        'SELECT id,email,organization_id FROM invitations WHERE token_hash=? AND accepted_at IS NULL AND expires_at > UTC_TIMESTAMP(3) FOR UPDATE',
        [digest(input.token)],
      );
      check(invite, 404, 'INVITATION_INVALID', 'Convite inválido ou expirado.');
      check(
        !(await rows(db, 'SELECT id FROM users WHERE email=?', [invite.email])).length,
        409,
        'ACCOUNT_EXISTS',
        'Este e-mail já tem conta. Entre para aceitar o convite.',
      );
      const userId = randomUUID();
      await db.execute('INSERT INTO users (id,name,email,password_hash) VALUES (?,?,?,?)', [
        userId,
        input.name,
        invite.email,
        passwordHash,
      ]);
      await db.execute(
        "INSERT INTO memberships (organization_id,user_id,role) VALUES (?,?,'DRIVER')",
        [invite.organization_id, userId],
      );
      await db.execute('UPDATE invitations SET accepted_at=UTC_TIMESTAMP(3) WHERE id=?', [
        invite.id,
      ]);
      await audit(db, invite.organization_id, userId, 'INVITATION_ACCEPTED');
    });
    res.status(201).json({ ok: true });
  });
  api.use(authenticate);
  api.get('/session', async (_req, res) =>
    res.json({ user: res.locals.user, memberships: await memberships(res.locals.user.id) }),
  );
  api.post('/auth/logout', async (_req, res) => {
    await transaction(async (db) => {
      await db.execute('DELETE FROM sessions WHERE token_hash=?', [res.locals.sessionHash]);
      await audit(db, null, res.locals.user.id, 'LOGOUT');
    });
    res.clearCookie('autokeep_session', { path: '/', httpOnly: true, sameSite: 'strict' });
    res.status(204).end();
  });
  api.get('/me/organizations', async (_req, res) =>
    res.json({ organizations: await memberships(res.locals.user.id) }),
  );
  api.post('/organizations', async (req, res) => {
    const input = z
      .object({
        companyName: z.string().trim().min(2).max(100),
        kind: z.enum(['PERSONAL', 'FLEET']).default('FLEET'),
      })
      .strict()
      .parse(req.body);
    const id = randomUUID();
    await transaction(async (db) => {
      await db.execute('INSERT INTO organizations (id,name,kind) VALUES (?,?,?)', [
        id,
        input.companyName,
        input.kind,
      ]);
      await db.execute(
        "INSERT INTO memberships (organization_id,user_id,role) VALUES (?,?,'ADMIN')",
        [id, res.locals.user.id],
      );
      await audit(db, id, res.locals.user.id, 'ORGANIZATION_CREATED');
    });
    res.status(201).json({ id });
  });
  api.post('/invitations/accept', async (req, res) => {
    const input = z
      .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
      .strict()
      .parse(req.body);
    await transaction(async (db) => {
      const [invite] = await rows<{ id: string; email: string; organization_id: string }>(
        db,
        'SELECT id,email,organization_id FROM invitations WHERE token_hash=? AND accepted_at IS NULL AND expires_at > UTC_TIMESTAMP(3) FOR UPDATE',
        [digest(input.token)],
      );
      check(
        invite && invite.email === res.locals.user.email,
        403,
        'INVITATION_INVALID',
        'O convite deve corresponder ao e-mail da sua conta e estar válido.',
      );
      await db.execute(
        "INSERT IGNORE INTO memberships (organization_id,user_id,role) VALUES (?,?,'DRIVER')",
        [invite.organization_id, res.locals.user.id],
      );
      await db.execute('UPDATE invitations SET accepted_at=UTC_TIMESTAMP(3) WHERE id=?', [
        invite.id,
      ]);
      await audit(db, invite.organization_id, res.locals.user.id, 'INVITATION_ACCEPTED');
    });
    res.json({ ok: true });
  });
  api.param('organizationId', async (_req, res, next, raw) => {
    try {
      const organizationId = uuid.parse(raw);
      res.locals.organizationId = organizationId;
      res.locals.membership = await membership(pool, organizationId, res.locals.user.id);
      next();
    } catch (error) {
      next(error);
    }
  });
  api.param('vehicleId', async (_req, res, next, raw) => {
    try {
      res.locals.vehicleId = uuid.parse(raw);
      res.locals.vehicle = await vehicle(
        pool,
        res.locals.organizationId,
        res.locals.vehicleId,
        res.locals.user.id,
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
  api.get(`${org}/dashboard`, async (_req, res) =>
    res.json({ vehicles: await visibleVehicles(res.locals.organizationId, res.locals.user.id) }),
  );
  api.post(`${org}/vehicles`, async (req, res) => {
    const input = createVehicleSchema.parse(req.body);
    const id = randomUUID(),
      now = new Date(),
      userId = res.locals.user.id,
      orgId = res.locals.organizationId;
    await transaction(async (db) => {
      await db.execute(
        'INSERT INTO vehicles (id,organization_id,name,plate,year,oil_type,tracking_mode,current_odometer,last_update_date,last_oil_change_km,last_oil_change_date,assigned_driver_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          id,
          orgId,
          input.name,
          input.plate,
          input.year,
          input.oilType,
          input.trackingMode,
          input.currentOdometer,
          now,
          input.lastOilChangeKm,
          new Date(input.lastOilChangeDate),
          res.locals.membership.role === 'DRIVER' ? userId : null,
        ],
      );
      await db.execute(
        'INSERT INTO readings (id,vehicle_id,odometer,measured_at,source,actor_id) VALUES (?,?,?,?,?,?)',
        [randomUUID(), id, input.currentOdometer, now, 'MANUAL', userId],
      );
      await db.execute(
        'INSERT INTO oil_changes (id,vehicle_id,odometer,changed_at,oil_type,actor_id) VALUES (?,?,?,?,?,?)',
        [
          randomUUID(),
          id,
          input.lastOilChangeKm,
          new Date(input.lastOilChangeDate),
          input.oilType,
          userId,
        ],
      );
      await audit(db, orgId, userId, 'VEHICLE_CREATED', id);
    });
    res.status(201).json({ id });
  });
  api.get(car, async (_req, res) =>
    res.json({ vehicle: await presentVehicle(pool, res.locals.vehicle) }),
  );
  api.post(`${car}/odometer`, async (req, res) => {
    const input = readingSchema.parse(req.body),
      userId = res.locals.user.id,
      orgId = res.locals.organizationId,
      id = res.locals.vehicleId;
    await transaction(async (db) => {
      const v = await vehicle(db, orgId, id, userId, true);
      check(
        input.odometer >= v.current_odometer,
        400,
        'ODOMETER_DECREASE',
        'A quilometragem deve ser igual ou maior que a última leitura real.',
      );
      check(
        Date.parse(input.measuredAt) > v.last_update_date.getTime(),
        400,
        'READING_OUT_OF_ORDER',
        'Use uma data posterior à última leitura.',
      );
      await db.execute(
        'INSERT INTO readings (id,vehicle_id,odometer,measured_at,source,actor_id) VALUES (?,?,?,?,?,?)',
        [randomUUID(), id, input.odometer, new Date(input.measuredAt), input.source, userId],
      );
      await db.execute(
        'UPDATE vehicles SET current_odometer=?,last_update_date=? WHERE id=? AND organization_id=?',
        [input.odometer, new Date(input.measuredAt), id, orgId],
      );
      await audit(db, orgId, userId, 'ODOMETER_UPDATED', id);
    });
    res.status(201).json({ ok: true });
  });
  api.post(`${car}/oil-changes`, admin, async (req, res) => {
    const input = oilChangeSchema.parse(req.body),
      userId = res.locals.user.id,
      orgId = res.locals.organizationId,
      id = res.locals.vehicleId;
    await transaction(async (db) => {
      const v = await vehicle(db, orgId, id, userId, true);
      const changedAt = new Date(input.changedAt);
      check(
        changedAt > v.last_oil_change_date && input.odometer >= v.last_oil_change_km,
        400,
        'OIL_CHANGE_OUT_OF_ORDER',
        'A troca deve ser posterior à última manutenção, sem reduzir a quilometragem.',
      );
      // Para datas anteriores à última leitura, respeite também as leituras dos dois lados.
      const [bounds] = await rows<{ lowerKm: number | null; upperKm: number | null }>(
        db,
        'SELECT MAX(CASE WHEN measured_at <= ? THEN odometer END) AS lowerKm, MIN(CASE WHEN measured_at >= ? THEN odometer END) AS upperKm FROM readings WHERE vehicle_id=?',
        [changedAt, changedAt, id],
      );
      check(
        (bounds.lowerKm === null || input.odometer >= bounds.lowerKm) &&
          (bounds.upperKm === null || input.odometer <= bounds.upperKm),
        400,
        'INCONSISTENT_ODOMETER',
        'A quilometragem da troca não corresponde às leituras registradas nessa data.',
      );
      await db.execute(
        'INSERT INTO oil_changes (id,vehicle_id,odometer,changed_at,oil_type,actor_id) VALUES (?,?,?,?,?,?)',
        [randomUUID(), id, input.odometer, changedAt, input.oilType, userId],
      );
      await db.execute(
        'UPDATE vehicles SET oil_type=?,last_oil_change_km=?,last_oil_change_date=? WHERE id=? AND organization_id=?',
        [input.oilType, input.odometer, changedAt, id, orgId],
      );
      if (changedAt > v.last_update_date) {
        check(
          input.odometer >= v.current_odometer,
          400,
          'ODOMETER_DECREASE',
          'A quilometragem não pode diminuir.',
        );
        await db.execute(
          "INSERT INTO readings (id,vehicle_id,odometer,measured_at,source,actor_id) VALUES (?,?,?,?,'MANUAL',?)",
          [randomUUID(), id, input.odometer, changedAt, userId],
        );
        await db.execute('UPDATE vehicles SET current_odometer=?,last_update_date=? WHERE id=?', [
          input.odometer,
          changedAt,
          id,
        ]);
      }
      await audit(db, orgId, userId, 'OIL_CHANGED', id);
    });
    res.status(201).json({ ok: true });
  });
  api.get(`${car}/history`, async (_req, res) => {
    const readings = await rows<{ id: string; odometer: number; measuredAt: Date; source: string }>(
      pool,
      'SELECT id,odometer,measured_at AS measuredAt,source FROM readings WHERE vehicle_id=? ORDER BY measured_at DESC LIMIT 100',
      [res.locals.vehicleId],
    );
    const oilChanges = await rows(
      pool,
      'SELECT c.id,c.odometer,c.changed_at AS changedAt,c.oil_type AS oilType,u.name AS actorName FROM oil_changes c JOIN users u ON u.id=c.actor_id WHERE c.vehicle_id=? ORDER BY c.changed_at DESC LIMIT 100',
      [res.locals.vehicleId],
    );
    res.json({ readings, oilChanges });
  });
  api.put(`${car}/driver`, admin, async (req, res) => {
    const { driverId } = z.object({ driverId: uuid.nullable() }).strict().parse(req.body);
    const orgId = res.locals.organizationId,
      id = res.locals.vehicleId,
      userId = res.locals.user.id;
    check(
      res.locals.membership.kind === 'FLEET',
      400,
      'FLEET_REQUIRED',
      'Atribuições estão disponíveis para frotas.',
    );
    await transaction(async (db) => {
      if (driverId) {
        const member = await membership(db, orgId, driverId, true);
        check(member.role === 'DRIVER', 400, 'DRIVER_REQUIRED', 'Selecione um motorista da frota.');
      }
      await vehicle(db, orgId, id, userId, true);
      await db.execute(
        'UPDATE vehicles SET assigned_driver_id=? WHERE id=? AND organization_id=?',
        [driverId, id, orgId],
      );
      await audit(db, orgId, userId, 'DRIVER_ASSIGNED', id);
    });
    res.json({ ok: true });
  });
  api.delete(car, admin, async (_req, res) => {
    await transaction(async (db) => {
      await vehicle(db, res.locals.organizationId, res.locals.vehicleId, res.locals.user.id, true);
      await db.execute(
        'UPDATE vehicles SET archived_at=UTC_TIMESTAMP(3),assigned_driver_id=NULL WHERE id=? AND organization_id=?',
        [res.locals.vehicleId, res.locals.organizationId],
      );
      await audit(
        db,
        res.locals.organizationId,
        res.locals.user.id,
        'VEHICLE_ARCHIVED',
        res.locals.vehicleId,
      );
    });
    res.status(204).end();
  });
  api.get(`${org}/members`, admin, async (_req, res) => {
    const members = await rows(
      pool,
      'SELECT u.id,u.name,u.email,m.role,(SELECT COUNT(*) FROM vehicles v WHERE v.organization_id=m.organization_id AND v.assigned_driver_id=u.id AND v.archived_at IS NULL) AS assignedCount FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ORDER BY m.role,u.name',
      [res.locals.organizationId],
    );
    res.json({ members });
  });
  api.delete(`${org}/members/:memberId`, admin, async (req, res) => {
    const memberId = uuid.parse(req.params.memberId),
      orgId = res.locals.organizationId;
    await transaction(async (db) => {
      const target = await membership(db, orgId, memberId, true);
      check(
        target.role === 'DRIVER',
        400,
        'CANNOT_REMOVE_ADMIN',
        'Gestores não podem ser removidos por esta ação.',
      );
      check(
        !(
          await rows(
            db,
            'SELECT id FROM vehicles WHERE organization_id=? AND assigned_driver_id=? AND archived_at IS NULL FOR UPDATE',
            [orgId, memberId],
          )
        ).length,
        409,
        'DRIVER_HAS_VEHICLES',
        'Desvincule os veículos antes de remover o motorista.',
      );
      await db.execute('DELETE FROM memberships WHERE organization_id=? AND user_id=?', [
        orgId,
        memberId,
      ]);
      await audit(db, orgId, res.locals.user.id, 'MEMBER_REMOVED');
    });
    res.status(204).end();
  });
  api.post(`${org}/invitations`, admin, async (req, res) => {
    check(
      res.locals.membership.kind === 'FLEET',
      400,
      'FLEET_REQUIRED',
      'Convites estão disponíveis para frotas.',
    );
    const { email } = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
      })
      .strict()
      .parse(req.body);
    const orgId = res.locals.organizationId,
      token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    await transaction(async (db) => {
      check(
        !(
          await rows(
            db,
            'SELECT m.user_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND u.email=?',
            [orgId, email],
          )
        ).length,
        409,
        'ALREADY_MEMBER',
        'Esta pessoa já faz parte da frota.',
      );
      await db.execute(
        'INSERT INTO invitations (id,organization_id,email,token_hash,expires_at) VALUES (?,?,?,?,?)',
        [id, orgId, email, digest(token), new Date(Date.now() + 7 * 86_400_000)],
      );
      await audit(db, orgId, res.locals.user.id, 'INVITATION_CREATED');
    });
    const invitationUrl = await sendInvitation(email, token);
    res.status(201).json({ invitationUrl, expiresInDays: 7 });
  });
  api.get(`${org}/audit`, admin, async (_req, res) => {
    const events = await rows(
      pool,
      'SELECT a.id,a.action,u.name AS actorName,v.name AS vehicleName,a.created_at AS createdAt FROM audit_logs a JOIN users u ON u.id=a.actor_id LEFT JOIN vehicles v ON v.id=a.vehicle_id WHERE a.organization_id=? ORDER BY a.created_at DESC LIMIT 100',
      [res.locals.organizationId],
    );
    res.json({ events });
  });
  api.get(`${org}/notifications`, async (_req, res) => {
    const notifications = await rows(
      pool,
      "SELECT n.id,n.vehicle_id AS vehicleId,n.title,n.body,n.created_at AS createdAt,n.read_at AS readAt FROM notifications n JOIN vehicles v ON v.id=n.vehicle_id WHERE n.organization_id=? AND n.user_id=? AND v.archived_at IS NULL AND (?='ADMIN' OR v.assigned_driver_id=?) ORDER BY n.created_at DESC LIMIT 50",
      [
        res.locals.organizationId,
        res.locals.user.id,
        res.locals.membership.role,
        res.locals.user.id,
      ],
    );
    res.json({ notifications });
  });
  api.post(`${org}/notifications/read`, async (_req, res) => {
    await pool.execute(
      'UPDATE notifications SET read_at=UTC_TIMESTAMP(3) WHERE organization_id=? AND user_id=? AND read_at IS NULL',
      [res.locals.organizationId, res.locals.user.id],
    );
    res.json({ ok: true });
  });
  api.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Recurso não encontrado.')));
  app.use('/api', api);
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const errorId = randomUUID();
    if (error instanceof AppError) {
      res.status(error.status).json({ code: error.code, message: error.message, errorId });
      return;
    }
    if (error instanceof ZodError || (error instanceof SyntaxError && 'body' in error)) {
      res
        .status(400)
        .json({
          code: 'INVALID_INPUT',
          message: 'Confira os campos e as datas informadas.',
          errorId,
        });
      return;
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      res
        .status(409)
        .json({ code: 'ALREADY_EXISTS', message: 'Este registro já existe.', errorId });
      return;
    }
    console.error(JSON.stringify({ event: 'request_failed', errorId, code: 'INTERNAL_ERROR' }));
    res
      .status(500)
      .json({
        code: 'INTERNAL_ERROR',
        message: 'Não foi possível concluir. Tente novamente.',
        errorId,
      });
  };
  app.use(errors);
  return app;
}
