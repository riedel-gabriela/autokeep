export type OilType = 'MINERAL' | 'SEMI_SYNTHETIC' | 'SYNTHETIC';
export type TrackingMode = 'MANUAL' | 'OBD2';
export type Role = 'ADMIN' | 'DRIVER';
export type OrganizationKind = 'PERSONAL' | 'FLEET';
export type Reading = {
  id: string;
  odometer: number;
  measuredAt: string;
  source: 'MANUAL' | 'OBD2';
};
export type MaintenanceStatus = {
  level: 'OK' | 'WARNING' | 'DUE';
  trigger: 'DISTANCE' | 'TIME' | null;
  distanceRemainingKm: number;
  daysRemaining: number;
  projectedDueDate: string;
};
export type Vehicle = {
  id: string;
  organizationId: string;
  name: string;
  plate: string;
  year: number;
  oilType: OilType;
  trackingMode: TrackingMode;
  currentOdometer: number;
  lastUpdateDate: string;
  lastOilChangeKm: number;
  lastOilChangeDate: string;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  avgDailyKm: number;
  predictedOdometer: number;
  calibrationDue: boolean;
  historicalEntries: Reading[];
  status: MaintenanceStatus;
};
export type Membership = {
  organizationId: string;
  companyName: string;
  kind: OrganizationKind;
  role: Role;
};
export type Session = {
  user: { id: string; name: string; email: string };
  memberships: Membership[];
};
export type Member = { id: string; name: string; email: string; role: Role; assignedCount: number };
export type OilChange = {
  id: string;
  odometer: number;
  changedAt: string;
  oilType: OilType;
  actorName: string;
};
export type AuditEvent = {
  id: string;
  action: string;
  actorName: string;
  vehicleName: string | null;
  createdAt: string;
};
export type Notification = {
  id: string;
  vehicleId: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};
export const OIL_LIMITS: Record<OilType, number> = {
  MINERAL: 5000,
  SEMI_SYNTHETIC: 8000,
  SYNTHETIC: 12000,
};
export const OIL_LABELS: Record<OilType, string> = {
  MINERAL: 'Mineral',
  SEMI_SYNTHETIC: 'Semissintético',
  SYNTHETIC: 'Sintético',
};
export const DAY = 86_400_000;

// A média é ponderada pelos dias entre as três últimas leituras reais.
export function dailyAverage(readings: Reading[]): number {
  const sorted = [...readings]
    .sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt))
    .slice(-3);
  if (sorted.length < 2) return 0;
  const first = sorted[0],
    last = sorted[sorted.length - 1];
  const days = (Date.parse(last.measuredAt) - Date.parse(first.measuredAt)) / DAY;
  return days >= 1 ? Math.max(0, (last.odometer - first.odometer) / days) : 0;
}

export function enrichVehicle(
  base: Omit<Vehicle, 'avgDailyKm' | 'predictedOdometer' | 'status' | 'calibrationDue'>,
  now = new Date(),
): Vehicle {
  const avgDailyKm = dailyAverage(base.historicalEntries);
  const elapsedDays = Math.max(0, (now.getTime() - Date.parse(base.lastUpdateDate)) / DAY);
  const predictedOdometer = base.currentOdometer + avgDailyKm * elapsedDays;
  const distanceRemainingKm = OIL_LIMITS[base.oilType] - (predictedOdometer - base.lastOilChangeKm);
  const timeDue = Date.parse(base.lastOilChangeDate) + 365 * DAY;
  const daysRemaining = Math.ceil((timeDue - now.getTime()) / DAY);
  const distanceDue =
    avgDailyKm > 0 ? now.getTime() + (distanceRemainingKm / avgDailyKm) * DAY : Infinity;
  const trigger =
    distanceRemainingKm <= 0 || daysRemaining <= 0
      ? distanceDue <= timeDue
        ? 'DISTANCE'
        : 'TIME'
      : distanceRemainingKm <= 500 || daysRemaining <= 30
        ? distanceRemainingKm <= 500 && (daysRemaining > 30 || distanceDue <= timeDue)
          ? 'DISTANCE'
          : 'TIME'
        : null;
  const level = distanceRemainingKm <= 0 || daysRemaining <= 0 ? 'DUE' : trigger ? 'WARNING' : 'OK';
  return {
    ...base,
    avgDailyKm,
    predictedOdometer,
    calibrationDue:
      base.trackingMode === 'MANUAL' && base.historicalEntries.length < 3 && elapsedDays >= 30,
    status: {
      level,
      trigger,
      distanceRemainingKm,
      daysRemaining,
      projectedDueDate: new Date(Math.min(timeDue, distanceDue)).toISOString(),
    },
  };
}
