import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { nicknameSchema } from '@ensemble/shared';
import { z } from 'zod';
import { SessionStore } from './platform/sessions.js';
import { RoomManager } from './platform/rooms.js';
import { GameError } from './platform/errors.js';
import { attachTransport } from './transport.js';
import { PostgresResults, ResultQueue, type ResultRepository } from './db/results.js';

export interface AppOptions {
  origins?: string[];
  databaseUrl?: string;
  repository?: ResultRepository;
  logger?: boolean;
  logLevel?: string;
  trustProxy?: boolean;
  maxRooms?: number;
}
export async function createApp(options: AppOptions = {}) {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: options.logLevel ?? 'info',
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
    trustProxy: options.trustProxy ?? false,
    bodyLimit: 8192,
  });
  const origins = options.origins ?? ['http://localhost:5175', 'http://127.0.0.1:5175'];
  await app.register(cors, { origin: origins });
  await app.register(helmet);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  const sessions = new SessionStore();
  const rooms = new RoomManager(sessions, Date.now, options.maxRooms);
  const repository =
    options.repository ??
    (options.databaseUrl ? new PostgresResults(options.databaseUrl, app.log) : null);
  const queue = new ResultQueue(repository, app.log);
  const transport = attachTransport(app, sessions, rooms, origins);
  rooms.hooks.finished = (result) => queue.enqueue(result);
  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'ensemble',
    uptime: Math.floor(process.uptime()),
  }));
  app.get('/api/ready', async (_request, reply) => {
    const ready = !repository || (await repository.healthy());
    return reply.code(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'unavailable',
      persistence: repository ? 'postgresql' : 'disabled',
      pendingResults: queue.size,
    });
  });
  app.get('/api/games', async () => ({ games: [{ id: 'sorting', name: 'À sa place' }] }));
  app.get('/api/rooms', async () => ({ rooms: rooms.list() }));
  app.post(
    '/api/sessions',
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const result = z.object({ nickname: nicknameSchema }).strict().safeParse(request.body);
      if (!result.success)
        return reply
          .code(400)
          .send({ message: result.error.issues[0]?.message ?? 'Pseudo invalide.' });
      const session = sessions.create(result.data.nickname);
      return reply
        .code(201)
        .send({ id: session.id, nickname: session.nickname, token: session.token });
    },
  );
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof GameError)
      return reply.code(400).send({ code: error.code, message: error.message });
    const status =
      error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (status >= 500) app.log.error({ err: error }, 'HTTP request failed');
    return reply.code(status).send({
      message:
        status === 429
          ? 'Trop de demandes. Réessayez dans une minute.'
          : status < 500
            ? 'Requête invalide.'
            : 'Le serveur a rencontré un problème.',
    });
  });
  const sweep = setInterval(() => rooms.sweep(), 500);
  sweep.unref();
  app.addHook('preClose', async () => {
    clearInterval(sweep);
    await transport.close();
  });
  app.addHook('onClose', async () => {
    await queue.close();
  });
  return { app, rooms, sessions, io: transport.io };
}
