import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { DEFAULT_SETTINGS } from '@ensemble/shared';
import { ResultQueue, type ResultRepository } from '../src/db/results.js';
import type { CompletedResult } from '../src/platform/rooms.js';

describe('result persistence queue', () => {
  it('retains a failed write and retries without losing its round identifier', async () => {
    let available = false;
    const saved: string[] = [];
    const repo: ResultRepository = {
      save: async (result) => {
        if (!available) throw new Error('temporary database failure');
        saved.push(result.id);
      },
      healthy: async () => available,
      close: async () => {},
    };
    const app = Fastify({ logger: false });
    const queue = new ResultQueue(repo, app.log);
    const result: CompletedResult = {
      id: randomUUID(),
      roomId: randomUUID(),
      code: 'ABC234',
      gameId: 'sorting',
      settings: DEFAULT_SETTINGS,
      startedAt: 100,
      finishedAt: 1000,
      players: [],
    };
    queue.enqueue(result);
    await queue.flush();
    expect(queue.size).toBe(1);
    expect(saved).toEqual([]);
    available = true;
    await queue.flush();
    expect(queue.size).toBe(0);
    expect(saved).toEqual([result.id]);
    await queue.close();
    await app.close();
  });
});
