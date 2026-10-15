import { randomUUID } from 'node:crypto';
import type {
  Vehicle,
  Reading,
  Membership,
  OilType,
  TrackingMode,
  Role,
  OrganizationKind,
} from '../shared/domain.js';
import { enrichVehicle } from '../shared/domain.js';
import { type Db, rows, pool } from './db.js';
import { check } from './errors.js';

export type User = { id: string; name: string; email: string; password_hash: string };
export type StoredVehicle = {
  id: string;
  organization_id: string;
  name: string;
  plate: string;
  year: number;
  oil_type: OilType;
  tracking_mode: TrackingMode;
  current_odometer: number;
  last_update_date: Date;
  last_oil_change_km: number;
  last_oil_change_date: Date;
  assigned_driver_id: string | null;
  assigned_driver_name?: string | null;
};
export async function memberships(userId: string): Promise<Membership[]> {
  return rows(
    pool,
    'SELECT o.id AS organizationId, o.name AS companyName, o.kind, m.role FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=? ORDER BY o.created_at,o.id',
    [userId],
  );
}
export async function membership(db: Db, orgId: string, userId: string, lock = false) {
  const sql = lock
    ? 'SELECT m.role, o.kind FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=? FOR UPDATE'
    : 'SELECT m.role, o.kind FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=?';
  const [member] = await rows<{ role: Role; kind: OrganizationKind }>(db, sql, [orgId, userId]);
  check(member, 403, 'FORBIDDEN', 'Você não tem acesso a este espaço.');
  return member;
}
export async function vehicle(
  db: Db,
  orgId: string,
  vehicleId: string,
  userId: string,
  lock = false,
) {
  const member = await membership(db, orgId, userId);
  const sql = lock
    ? 'SELECT * FROM vehicles WHERE id=? AND organization_id=? AND archived_at IS NULL FOR UPDATE'
    : 'SELECT v.*,u.name AS assigned_driver_name FROM vehicles v LEFT JOIN users u ON u.id=v.assigned_driver_id WHERE v.id=? AND v.organization_id=? AND v.archived_at IS NULL';
  const [v] = await rows<StoredVehicle>(db, sql, [vehicleId, orgId]);
  check(
    v && (member.role === 'ADMIN' || v.assigned_driver_id === userId),
    404,
    'VEHICLE_NOT_FOUND',
    'Veículo não encontrado.',
  );
  return v;
}
export async function presentVehicle(db: Db, v: StoredVehicle): Promise<Vehicle> {
  const readings = await rows<{
    id: string;
    odometer: number;
    measured_at: Date;
    source: Reading['source'];
  }>(
    db,
    'SELECT id,odometer,measured_at,source FROM readings WHERE vehicle_id=? ORDER BY measured_at DESC LIMIT 3',
    [v.id],
  );
  return enrichVehicle({
    id: v.id,
    organizationId: v.organization_id,
    name: v.name,
    plate: v.plate,
    year: v.year,
    oilType: v.oil_type,
    trackingMode: v.tracking_mode,
    currentOdometer: v.current_odometer,
    lastUpdateDate: v.last_update_date.toISOString(),
    lastOilChangeKm: v.last_oil_change_km,
    lastOilChangeDate: v.last_oil_change_date.toISOString(),
    assignedDriverId: v.assigned_driver_id,
    assignedDriverName: v.assigned_driver_name ?? null,
    historicalEntries: readings.map((r) => ({
      id: r.id,
      odometer: r.odometer,
      measuredAt: r.measured_at.toISOString(),
      source: r.source,
    })),
  });
}
export async function visibleVehicles(orgId: string, userId: string) {
  const member = await membership(pool, orgId, userId);
  const list = await rows<StoredVehicle>(
    pool,
    "SELECT v.*,u.name AS assigned_driver_name FROM vehicles v LEFT JOIN users u ON u.id=v.assigned_driver_id WHERE v.organization_id=? AND v.archived_at IS NULL AND (? = 'ADMIN' OR v.assigned_driver_id=?) ORDER BY v.created_at,v.id",
    [orgId, member.role, userId],
  );
  return Promise.all(list.map((v) => presentVehicle(pool, v)));
}
export async function audit(
  db: Db,
  orgId: string | null,
  actorId: string,
  action: string,
  vehicleId: string | null = null,
) {
  await db.execute(
    'INSERT INTO audit_logs (id,organization_id,actor_id,vehicle_id,action) VALUES (?,?,?,?,?)',
    [randomUUID(), orgId, actorId, vehicleId, action],
  );
}
