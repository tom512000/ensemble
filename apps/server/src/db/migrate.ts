import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { config } from '../config.js';
if (!config.DATABASE_URL)
  throw new Error('DATABASE_URL est nécessaire pour lancer les migrations.');
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  });
  console.info('Migrations PostgreSQL appliquées.');
} finally {
  await pool.end();
}
