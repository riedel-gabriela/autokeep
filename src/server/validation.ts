import { z } from 'zod';
export const uuid = z.uuid();
export const odometer = z.number().min(0).max(9_999_999.9).multipleOf(0.1);
export const pastDate = z.iso
  .datetime({ offset: true })
  .refine((v) => Date.parse(v) <= Date.now(), 'A data não pode estar no futuro.');
export const oilType = z.enum(['MINERAL', 'SEMI_SYNTHETIC', 'SYNTHETIC']);
export const createVehicleSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    plate: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/),
    year: z
      .number()
      .int()
      .min(1950)
      .max(new Date().getUTCFullYear() + 1),
    oilType,
    trackingMode: z.enum(['MANUAL', 'OBD2']),
    currentOdometer: odometer,
    lastOilChangeKm: odometer,
    lastOilChangeDate: pastDate,
  })
  .strict()
  .refine(
    (v) => v.lastOilChangeKm <= v.currentOdometer,
    'A troca não pode ter quilometragem maior que a atual.',
  );
export const readingSchema = z
  .object({ odometer, source: z.enum(['MANUAL', 'OBD2']), measuredAt: pastDate })
  .strict();
export const oilChangeSchema = z.object({ odometer, changedAt: pastDate, oilType }).strict();
