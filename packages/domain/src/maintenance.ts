import type { MaintenanceStatus, OdometerEntry, OilType, VehicleMaintenanceInput } from "./types.js";

export const OIL_INTERVAL_KM: Readonly<Record<OilType, number>> = {
  MINERAL: 5_000,
  SEMI_SYNTHETIC: 8_000,
  FULL_SYNTHETIC: 12_000,
};
export const TIME_LIMIT_DAYS = 365;
export const TIME_WARNING_DAYS = 30;
export const DISTANCE_WARNING_KM = 500;
const DAY_MS = 86_400_000;

function parseDate(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid date");
  return date;
}

export function daysBetween(start: string | Date, end: string | Date): number {
  const startDate = typeof start === "string" ? parseDate(start) : start;
  const endDate = typeof end === "string" ? parseDate(end) : end;
  return Math.max(0, (endDate.getTime() - startDate.getTime()) / DAY_MS);
}

export function calculateAverageDailyKm(entries: readonly OdometerEntry[]): number {
  const sorted = [...entries].sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()).slice(-3);
  if (sorted.length < 2) return 0;

  const samples: number[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (!previous || !current) continue;
    const days = daysBetween(previous.date, current.date);
    const distance = current.odometer - previous.odometer;
    if (days > 0 && distance >= 0) samples.push(distance / days);
  }
  if (samples.length === 0) return 0;
  return Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(2));
}

export function estimateOdometer(currentOdometer: number, lastUpdateDate: string, avgDailyKm: number, now = new Date()): number {
  const elapsedDays = daysBetween(lastUpdateDate, now);
  return Number((currentOdometer + elapsedDays * Math.max(0, avgDailyKm)).toFixed(1));
}

export function calculateMaintenanceStatus(input: VehicleMaintenanceInput, now = new Date()): MaintenanceStatus {
  const distanceLimit = OIL_INTERVAL_KM[input.oilType];
  const distanceRemainingKm = Number((input.lastOilChangeKm + distanceLimit - input.currentOdometer).toFixed(1));
  const daysElapsed = daysBetween(input.lastOilChangeDate, now);
  const daysRemaining = Math.ceil(TIME_LIMIT_DAYS - daysElapsed);
  const distanceDue = distanceRemainingKm <= 0;
  const timeDue = daysRemaining <= 0;
  const projectedDays = input.avgDailyKm > 0 ? distanceRemainingKm / input.avgDailyKm : null;

  let trigger: MaintenanceStatus["trigger"] = null;
  if (distanceDue || timeDue) {
    trigger = distanceDue && timeDue
      ? projectedDays !== null && projectedDays <= daysRemaining ? "DISTANCE" : "TIME"
      : distanceDue ? "DISTANCE" : "TIME";
  }

  const level = distanceDue || timeDue
    ? "DUE"
    : distanceRemainingKm <= DISTANCE_WARNING_KM || daysRemaining <= TIME_WARNING_DAYS ? "WARNING" : "OK";

  return {
    level,
    trigger,
    distanceRemainingKm,
    daysRemaining,
    projectedDueDate: projectedDays !== null && projectedDays >= 0
      ? new Date(now.getTime() + projectedDays * DAY_MS).toISOString()
      : null,
  };
}

export function calibrationMilestone(entries: readonly OdometerEntry[], createdAt: string, now = new Date()): 30 | 60 | null {
  if (entries.length >= 3) return null;
  const age = daysBetween(createdAt, now);
  if (entries.length === 1 && age >= 30) return 30;
  if (entries.length === 2 && age >= 60) return 60;
  return null;
}
