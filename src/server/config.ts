import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  APP_ORIGIN: z.url().default('http://localhost:8080'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(16),
  DEMO_PASSWORD: z.string().min(16),
  SEED_DEMO: z.enum(['true', 'false']).default('true'),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) throw new Error('INVALID_CONFIGURATION');
export const config = parsed.data;
if (config.NODE_ENV === 'production') throw new Error('LOCAL_AUTH_NOT_ALLOWED_IN_PRODUCTION');
