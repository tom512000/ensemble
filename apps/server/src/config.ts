import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3005),
  HOST: z.string().default('0.0.0.0'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5175,http://127.0.0.1:5175'),
  DATABASE_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  MAX_ROOMS: z.coerce.number().int().min(1).max(10_000).default(500),
});
export const config = schema.parse(process.env);
export const origins = config.CLIENT_ORIGIN.split(',').map((origin) => {
  const url = new URL(origin.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin.trim())
    throw new Error('CLIENT_ORIGIN doit contenir des origines HTTP(S) exactes, sans chemin.');
  return url.origin;
});
if (config.NODE_ENV === 'production' && !config.DATABASE_URL)
  throw new Error('DATABASE_URL est obligatoire en production.');
