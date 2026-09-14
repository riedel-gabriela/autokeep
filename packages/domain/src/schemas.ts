import { z } from "zod";

const safeText = z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N} .,'&()/-]+$/u);
const odometer = z.number().finite().min(0).max(9_999_999.9);
const isoDateTime = z.string().datetime({ offset: true });

export const idSchema = z.string().uuid();
export const oilTypeSchema = z.enum(["MINERAL", "SEMI_SYNTHETIC", "FULL_SYNTHETIC"]);
export const trackingModeSchema = z.enum(["MANUAL", "OBD2"]);

export const createOrganizationSchema = z.object({ companyName: safeText }).strict();

export const createVehicleSchema = z
  .object({
    name: safeText,
    trackingMode: trackingModeSchema,
    oilType: oilTypeSchema,
    currentOdometer: odometer,
    lastOilChangeKm: odometer,
    lastOilChangeDate: isoDateTime,
  })
  .strict()
  .refine((value) => value.lastOilChangeKm <= value.currentOdometer, {
    message: "A quilometragem da troca não pode superar o odômetro atual",
  })
  .refine((value) => new Date(value.lastOilChangeDate).getTime() <= Date.now() + 300_000, {
    message: "A data da troca não pode estar no futuro",
  });

export const odometerUpdateSchema = z
  .object({
    odometer,
    source: z.enum(["MANUAL", "OBD2"]),
    measuredAt: isoDateTime,
  })
  .strict();

export const oilChangeSchema = z
  .object({ odometer, changedAt: isoDateTime, oilType: oilTypeSchema })
  .strict()
  .refine((value) => new Date(value.changedAt).getTime() <= Date.now() + 300_000, {
    message: "A data da troca não pode estar no futuro",
  });

export const invitationSchema = z.object({ email: z.string().trim().email().max(254) }).strict();
export const acceptInvitationSchema = z.object({ token: z.string().min(43).max(128) }).strict();
export const assignDriverSchema = z.object({ driverId: idSchema.nullable() }).strict();
