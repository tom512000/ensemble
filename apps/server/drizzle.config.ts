import { defineConfig } from 'drizzle-kit';
import { config } from './src/config.js';
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: config.DATABASE_URL ?? 'postgresql://ensemble:ensemble_dev@localhost:55432/ensemble',
  },
});
