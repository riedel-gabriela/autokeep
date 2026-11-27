import type { OilChange, Reading } from '../shared/domain.js';

// Oil changes also generate an odometer reading; display that event only once.
export function visibleReadings(readings: Reading[], oilChanges: OilChange[]): Reading[] {
  const changes = new Set(
    oilChanges.map((change) => `${Date.parse(change.changedAt)}:${change.odometer}`),
  );
  return readings.filter(
    (reading) => !changes.has(`${Date.parse(reading.measuredAt)}:${reading.odometer}`),
  );
}
