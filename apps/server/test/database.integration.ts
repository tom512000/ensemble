import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import pg from 'pg';
import { DEFAULT_SETTINGS } from '@ensemble/shared';
import { PostgresResults } from '../src/db/results.js';
import type { CompletedResult } from '../src/platform/rooms.js';
const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error('Définir TEST_DATABASE_URL explicitement pour tester la persistance PostgreSQL.');
const app = Fastify({ logger: false });
const repo = new PostgresResults(url, app.log);
const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
const result: CompletedResult = {
  id: randomUUID(),
  roomId: randomUUID(),
  code: 'TEST23',
  gameId: 'sorting',
  settings: DEFAULT_SETTINGS,
  startedAt: Date.now() - 3000,
  finishedAt: Date.now(),
  players: [
    {
      id: randomUUID(),
      nickname: 'Test persistance',
      color: '#486b52',
      connected: true,
      sorted: 30,
    },
  ],
};
try {
  assert.equal(await repo.healthy(), true, 'La migration game_results doit être appliquée');
  await repo.save(result);
  await repo.save(result);
  const records = await pool.query<{
    id: string;
    settings: unknown;
    players: unknown;
    duration_ms: number;
  }>('select id, settings, players, duration_ms from game_results where id = $1', [result.id]);
  assert.equal(records.rowCount, 1, 'Une manche ne doit pas être dupliquée');
  assert.deepEqual(records.rows[0]!.settings, result.settings);
  assert.deepEqual(records.rows[0]!.players, result.players);
  assert.equal(records.rows[0]!.duration_ms, result.finishedAt - result.startedAt);
  console.info('PostgreSQL : migration, insertion, données et idempotence vérifiées.');
} finally {
  await pool.query('delete from game_results where id = $1', [result.id]);
  await pool.end();
  await repo.close();
  await app.close();
}
