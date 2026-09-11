import { Server } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import {
  commandSchema,
  motionSchema,
  type ClientEvents,
  type Reply,
  type ServerEvents,
} from '@ensemble/shared';
import { GameError } from './platform/errors.js';
import { TokenBucket } from './platform/rate-limit.js';
import type { Session, SessionStore } from './platform/sessions.js';
import type { RoomManager } from './platform/rooms.js';

interface SocketData {
  session: Session;
}
export function attachTransport(
  app: FastifyInstance,
  sessions: SessionStore,
  rooms: RoomManager,
  origins: string[],
) {
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>(app.server, {
    cors: { origin: origins, methods: ['GET', 'POST'] },
    allowRequest: (req, callback) =>
      callback(null, !req.headers.origin || origins.includes(req.headers.origin)),
    maxHttpBufferSize: 8192,
    // Valeurs proches des défauts de Socket.IO, choisies pour de vrais réseaux.
    // Des délais serrés conviennent en local mais pas derrière un proxy TLS : si la
    // connexion reste en long-polling, un aller-retour dépasse vite quelques secondes,
    // le serveur ferme la session, et la requête suivante portant ce sid repart en
    // « Session ID unknown » — la connexion ne s'établit alors jamais.
    pingInterval: 25_000,
    pingTimeout: 20_000,
    connectTimeout: 45_000,
  });
  const responses = new WeakMap<Session, Map<string, { fingerprint: string; reply: Reply }>>();
  let listTimer: ReturnType<typeof setTimeout> | undefined;
  rooms.hooks.state = (room) => {
    io.to(room.code).emit('room:state', room);
  };
  rooms.hooks.bottle = (code, roundId, bottle, players) => {
    io.to(code).emit('bottle:state', { code, roundId, bottle, players });
  };
  rooms.hooks.list = () => {
    listTimer ??= setTimeout(() => {
      listTimer = undefined;
      io.emit('rooms:list', rooms.list());
    }, 100);
  };
  rooms.hooks.closed = (code) => {
    io.to(code).emit('room:closed', {
      code: 'ROOM_CLOSED',
      message: 'Cette table a fermé. Retrouvez les autres parties.',
    });
    io.in(code).socketsLeave(code);
  };
  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth.token;
    const session =
      typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? sessions.get(token) : undefined;
    if (!session) return next(new Error('SESSION_EXPIRED'));
    socket.data.session = session;
    next();
  });
  io.on('connection', (socket) => {
    const session = socket.data.session;
    if (session.socketId) {
      const previous = io.sockets.sockets.get(session.socketId);
      previous?.emit('session:replaced');
      previous?.disconnect(true);
    }
    session.socketId = socket.id;
    session.lastSeen = Date.now();
    if (session.roomCode) void socket.join(session.roomCode);
    rooms.reconnect(session);
    socket.emit('session:ready', {
      id: session.id,
      nickname: session.nickname,
      roomCode: session.roomCode,
    });
    socket.emit('rooms:list', rooms.list());
    if (session.roomCode) socket.emit('room:state', rooms.snapshot(session.roomCode));
    const commands = new TokenBucket(25, 12);
    const motionBudget = new TokenBucket(100, 70);
    const allPackets = new TokenBucket(160, 110);
    const sequences = new Map<string, number>();
    const cache =
      responses.get(session) ?? new Map<string, { fingerprint: string; reply: Reply }>();
    responses.set(session, cache);
    socket.use((_packet, next) => {
      if (!allPackets.take()) {
        socket.disconnect(true);
        return;
      }
      next();
    });
    socket.on('command', (payload, ack) => {
      if (typeof ack !== 'function') return;
      if (!commands.take()) {
        ack({
          ok: false,
          error: { code: 'RATE_LIMITED', message: 'Un petit instant… Réessayez dans une seconde.' },
        });
        return;
      }
      const parsed = commandSchema.safeParse(payload);
      if (!parsed.success) {
        ack({
          ok: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Les informations reçues ne sont pas valides.',
          },
        });
        return;
      }
      const command = parsed.data;
      const fingerprint = JSON.stringify(command);
      const cached = cache.get(command.requestId);
      if (cached) {
        ack(
          cached.fingerprint === fingerprint
            ? cached.reply
            : {
                ok: false,
                error: {
                  code: 'REQUEST_CONFLICT',
                  message: 'Identifiant de requête déjà utilisé.',
                },
              },
        );
        return;
      }
      let reply: Reply;
      try {
        session.lastSeen = Date.now();
        const previousCode = session.roomCode;
        const data = rooms.handle(session, command);
        if (previousCode && previousCode !== session.roomCode) void socket.leave(previousCode);
        if (session.roomCode) {
          void socket.join(session.roomCode);
          if (['room:create', 'room:join', 'room:sync'].includes(command.type))
            socket.emit('room:state', rooms.snapshot(session.roomCode));
        }
        reply = { ok: true, data };
      } catch (error) {
        if (!(error instanceof GameError)) app.log.error({ err: error }, 'Command failed');
        reply = {
          ok: false,
          error: {
            code: error instanceof GameError ? error.code : 'INTERNAL_ERROR',
            message:
              error instanceof GameError ? error.message : 'Un problème est survenu. Réessayez.',
          },
        };
      }
      if (cache.size >= 128) cache.delete(cache.keys().next().value!);
      cache.set(command.requestId, { fingerprint, reply });
      ack(reply);
    });
    socket.on('motion', (payload) => {
      if (!motionBudget.take()) return;
      const parsed = motionSchema.safeParse(payload);
      if (!parsed.success) return;
      const motion = parsed.data;
      const key = motion.type;
      if ((sequences.get(key) ?? -1) >= motion.seq) return;
      sequences.set(key, motion.seq);
      try {
        rooms.motion(session, motion);
        session.lastSeen = Date.now();
        if (motion.type === 'cursor:move')
          socket.to(motion.code).volatile.emit('motion', {
            type: motion.type,
            playerId: session.id,
            position: motion.position,
          });
        else
          socket.to(motion.code).volatile.emit('motion', {
            type: motion.type,
            playerId: session.id,
            bottleId: motion.bottleId,
            dragId: motion.dragId,
            position: motion.position,
          });
      } catch {
        /* Ephemeral stale packets are intentionally discarded. */
      }
    });
    socket.on('disconnect', () => {
      if (session.socketId !== socket.id) return;
      session.socketId = null;
      session.lastSeen = Date.now();
      rooms.disconnect(session);
      if (session.roomCode)
        socket
          .to(session.roomCode)
          .volatile.emit('motion', { type: 'cursor:move', playerId: session.id, position: null });
    });
  });
  return {
    io,
    close: async () => {
      if (listTimer) clearTimeout(listTimer);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
