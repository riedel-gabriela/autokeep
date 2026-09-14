import { describe, expect, it } from "vitest";
import { calculateAverageDailyKm, calculateMaintenanceStatus, calibrationMilestone, estimateOdometer } from "./maintenance.js";

describe("maintenance rules", () => {
  it("uses the first reached clock", () => {
    const result = calculateMaintenanceStatus({
      oilType: "MINERAL", currentOdometer: 15_100, lastOilChangeKm: 10_000,
      lastOilChangeDate: "2026-08-01T00:00:00.000Z", avgDailyKm: 20,
    }, new Date("2026-09-14T00:00:00.000Z"));
    expect(result.level).toBe("DUE");
    expect(result.trigger).toBe("DISTANCE");
  });

  it("warns thirty days before the annual limit", () => {
    const result = calculateMaintenanceStatus({
      oilType: "FULL_SYNTHETIC", currentOdometer: 10_100, lastOilChangeKm: 10_000,
      lastOilChangeDate: "2025-10-14T00:00:00.000Z", avgDailyKm: 0,
    }, new Date("2026-09-14T00:00:00.000Z"));
    expect(result.level).toBe("WARNING");
    expect(result.daysRemaining).toBe(30);
  });

  it("calculates a moving average from at most three readings", () => {
    const average = calculateAverageDailyKm([
      { date: "2026-01-01T00:00:00.000Z", odometer: 1_000, source: "MANUAL" },
      { date: "2026-01-11T00:00:00.000Z", odometer: 1_200, source: "MANUAL" },
      { date: "2026-01-21T00:00:00.000Z", odometer: 1_500, source: "MANUAL" },
      { date: "2026-01-31T00:00:00.000Z", odometer: 1_900, source: "MANUAL" },
    ]);
    expect(average).toBe(35);
  });

  it("projects odometer and calibration milestones", () => {
    expect(estimateOdometer(1_000, "2026-09-04T00:00:00.000Z", 20, new Date("2026-09-14T00:00:00.000Z"))).toBe(1_200);
    expect(calibrationMilestone(
      [{ date: "2026-07-01T00:00:00.000Z", odometer: 1_000, source: "MANUAL" }],
      "2026-07-01T00:00:00.000Z", new Date("2026-08-01T00:00:00.000Z"),
    )).toBe(30);
  });
});
