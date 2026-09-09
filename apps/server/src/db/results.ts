import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import type { CompletedResult } from '../platform/rooms.js';
import { gameResults } from './schema.js';

export interface ResultRepository {
  save(result: CompletedResult): Promise<void>;
  healthy(): Promise<boolean>;
  close(): Promise<void>;
}
export class PostgresResults implements ResultRepository {
  private pool: pg.Pool;
  private db;
  constructor(url: string, logger: FastifyBaseLogger) {
    this.pool = new pg.Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 3000,
      statement_timeout: 5000,
    });
    this.pool.on('error', (error) => logger.error({ err: error }, 'PostgreSQL pool error'));
    this.db = drizzle(this.pool);
  }
  async save(result: CompletedResult) {
    await this.db
      .insert(gameResults)
      .values({
        ...result,
        startedAt: new Date(result.startedAt),
        finishedAt: new Date(result.finishedAt),
        durationMs: Math.max(0, result.finishedAt - result.startedAt),
      })
      .onConflictDoNothing();
  }
  async healthy() {
    try {
      await this.pool.query('select id from game_results limit 0');
      return true;
    } catch {
      return false;
    }
  }
  async close() {
    await this.pool.end();
  }
}
export class ResultQueue {
  private pending = new Map<string, CompletedResult>();
  private flushing: Promise<void> | null = null;
  private interval: ReturnType<typeof setInterval>;
  constructor(
    private repository: ResultRepository | null,
    private logger: FastifyBaseLogger,
  ) {
    this.interval = setInterval(() => {
      void this.flush();
    }, 5000);
    this.interval.unref();
  }
  get size() {
    return this.pending.size;
  }
  enqueue(result: CompletedResult) {
    if (!this.repository) return;
    if (this.pending.size >= 1000) {
      this.logger.error(
        { resultId: result.id },
        'Result queue full; result could not be persisted',
      );
      return;
    }
    this.pending.set(result.id, result);
    void this.flush();
  }
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.write().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }
  private async write() {
    for (const [id, result] of this.pending) {
      try {
        await this.repository!.save(result);
        this.pending.delete(id);
      } catch (error) {
        this.logger.error(
          { err: error, resultId: id },
          'Result persistence failed; retry scheduled',
        );
        break;
      }
    }
  }
  async close() {
    clearInterval(this.interval);
    await this.flush();
    await this.repository?.close();
  }
}
