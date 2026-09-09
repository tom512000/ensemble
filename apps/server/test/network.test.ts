import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import {
  DEFAULT_SETTINGS,
  getBins,
  type ClientEvents,
  type CommandInput,
  type GuestSession,
  type Reply,
  type RoomState,
  type ServerEvents,
} from '@ensemble/shared';
import { createApp } from '../src/app.js';
type Client = Socket<ServerEvents, ClientEvents>;
function request(client: Client, input: CommandInput, requestId = randomUUID()) {
  return new Promise<Reply>((resolve, reject) =>
    client
      .timeout(3000)
      .emit('command', { ...input, requestId }, (error: Error | null, reply: Reply) =>
        error ? reject(error) : resolve(reply),
      ),
  );
}
function nextRoom(client: Client, predicate: (room: RoomState) => boolean) {
  return new Promise<RoomState>((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('room:state', handler);
      reject(new Error('Room update timed out'));
    }, 3000);
    const handler = (room: RoomState) => {
      if (predicate(room)) {
        clearTimeout(timer);
        client.off('room:state', handler);
        resolve(room);
      }
    };
    client.on('room:state', handler);
  });
}
describe('real Socket.IO clients', () => {
  let server: Awaited<ReturnType<typeof createApp>>;
  let url: string;
  let clients: Client[];
  beforeEach(async () => {
    server = await createApp({ logger: false });
    url = await server.app.listen({ port: 0, host: '127.0.0.1' });
    clients = [];
  });
  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    await server.app.close();
  });
  async function guest(nickname: string) {
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { nickname },
    });
    return response.json<GuestSession>();
  }
  async function connect(session: GuestSession) {
    const client: Client = io(url, {
      auth: { token: session.token },
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once('session:ready', () => resolve());
      client.once('connect_error', reject);
      client.connect();
    });
    return client;
  }
  async function setup() {
    const aliceSession = await guest('Alice'),
      bobSession = await guest('Bob');
    const alice = await connect(aliceSession),
      bob = await connect(bobSession);
    const created = await request(alice, {
      type: 'room:create',
      gameId: 'sorting',
      settings: { ...DEFAULT_SETTINGS, bottleCount: 6, colorCount: 3 },
    });
    if (!created.ok) throw new Error(created.error.message);
    const code = created.data.code!;
    const presence = nextRoom(alice, (room) => room.players.length === 2);
    expect((await request(bob, { type: 'room:join', code })).ok).toBe(true);
    await presence;
    const aStart = nextRoom(alice, (room) => room.status === 'playing'),
      bStart = nextRoom(bob, (room) => room.status === 'playing');
    expect((await request(alice, { type: 'game:start', code })).ok).toBe(true);
    const [aState, bState] = await Promise.all([aStart, bStart]);
    expect(aState.game).toEqual(bState.game);
    return { alice, bob, aliceSession, bobSession, code, game: aState.game! };
  }
  it('runs two distinct sockets with shared state, live cursor/movement, exclusive grab and synchronized victory', async () => {
    const { alice, bob, aliceSession, code, game } = await setup();
    expect(alice.id).not.toBe(bob.id);
    const cursor = new Promise((resolve) => bob.once('motion', resolve));
    alice.emit('motion', { type: 'cursor:move', code, position: { x: 0.25, y: 0.45 }, seq: 1 });
    expect(await cursor).toMatchObject({
      type: 'cursor:move',
      playerId: aliceSession.id,
      position: { x: 0.25, y: 0.45 },
    });
    const first = game.bottles[0]!;
    const drag = { code, roundId: game.roundId, bottleId: first.id, dragId: randomUUID() };
    expect((await request(alice, { ...drag, type: 'bottle:grab' })).ok).toBe(true);
    const conflict = await request(bob, { ...drag, dragId: randomUUID(), type: 'bottle:grab' });
    expect(conflict).toMatchObject({ ok: false, error: { code: 'BOTTLE_BUSY' } });
    const movement = new Promise((resolve) => bob.once('motion', resolve));
    alice.emit('motion', { ...drag, type: 'bottle:move', position: { x: 0.4, y: 0.5 }, seq: 2 });
    expect(await movement).toMatchObject({
      type: 'bottle:move',
      bottleId: first.id,
      position: { x: 0.4, y: 0.5 },
    });
    const firstBin = getBins(3).find((bin) => bin.color === first.color)!;
    const sorted = new Promise((resolve) => bob.once('bottle:state', resolve));
    expect(
      (
        await request(alice, {
          ...drag,
          type: 'bottle:release',
          position: { x: firstBin.x + 0.05, y: 0.18 },
        })
      ).ok,
    ).toBe(true);
    expect(await sorted).toMatchObject({ bottle: { id: first.id, sorted: true, lock: null } });
    const aWon = nextRoom(alice, (room) => room.status === 'finished'),
      bWon = nextRoom(bob, (room) => room.status === 'finished');
    for (const bottle of game.bottles.slice(1)) {
      const input = { code, roundId: game.roundId, bottleId: bottle.id, dragId: randomUUID() };
      expect((await request(alice, { ...input, type: 'bottle:grab' })).ok).toBe(true);
      const bin = getBins(3).find((bin) => bin.color === bottle.color)!;
      expect(
        (
          await request(alice, {
            ...input,
            type: 'bottle:release',
            position: { x: bin.x + 0.05, y: 0.18 },
          })
        ).ok,
      ).toBe(true);
    }
    const [aFinal, bFinal] = await Promise.all([aWon, bWon]);
    expect(aFinal.game).toEqual(bFinal.game);
    expect(aFinal.game!.bottles.every((b) => b.sorted)).toBe(true);
  });
  it('recovers a dropped socket and releases its bottle lock', async () => {
    const { alice, bob, aliceSession, code, game } = await setup();
    const drag = {
      code,
      roundId: game.roundId,
      bottleId: game.bottles[0]!.id,
      dragId: randomUUID(),
    };
    await request(alice, { ...drag, type: 'bottle:grab' });
    const left = nextRoom(bob, (room) =>
      room.players.some((p) => p.id === aliceSession.id && !p.connected),
    );
    alice.disconnect();
    const state = await left;
    expect(state.game!.bottles[0]!.lock).toBeNull();
    const restored = nextRoom(bob, (room) => room.players.every((p) => p.connected));
    const newSocket = await connect(aliceSession);
    await restored;
    const resync = nextRoom(newSocket, (room) => room.code === code);
    await request(newSocket, { type: 'room:sync', code });
    expect((await resync).game!.roundId).toBe(game.roundId);
  });
  it('deduplicates critical commands across socket reconnections', async () => {
    const session = await guest('Alice');
    const first = await connect(session);
    const id = randomUUID();
    const input = {
      type: 'room:create' as const,
      gameId: 'sorting' as const,
      settings: DEFAULT_SETTINGS,
    };
    const original = await request(first, input, id);
    expect(await request(first, input, id)).toEqual(original);
    first.disconnect();
    const second = await connect(session);
    expect(await request(second, input, id)).toEqual(original);
    expect(server.rooms.list()).toHaveLength(1);
  });
  it('enforces origin and session validation, including invalid payloads', async () => {
    expect(
      (
        await server.app.inject({
          method: 'POST',
          url: '/api/sessions',
          payload: { nickname: '<script>' },
        })
      ).statusCode,
    ).toBe(400);
    const unauthorized = io(url, {
      auth: { token: 'invented' },
      transports: ['websocket'],
      reconnection: false,
    });
    clients.push(unauthorized);
    const error = await new Promise<Error>((resolve) =>
      unauthorized.once('connect_error', resolve),
    );
    expect(error.message).toBe('SESSION_EXPIRED');
    const session = await guest('Alice');
    const badOrigin = io(url, {
      auth: { token: session.token },
      transports: ['websocket'],
      extraHeaders: { Origin: 'https://untrusted.example' },
      reconnection: false,
    });
    clients.push(badOrigin);
    expect(
      await new Promise<Error>((resolve) => badOrigin.once('connect_error', resolve)),
    ).toBeInstanceOf(Error);
    const client = await connect(session);
    expect(await request(client, { type: 'room:join', code: 'bad' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
  });
  it('rejects spam commands with actionable acknowledgements', async () => {
    const client = await connect(await guest('Alice'));
    const replies = await Promise.all(
      Array.from({ length: 40 }, () => request(client, { type: 'room:join', code: 'ZZZZZZ' })),
    );
    expect(replies.some((reply) => !reply.ok && reply.error.code === 'RATE_LIMITED')).toBe(true);
  });
  it('exposes liveness and database readiness independently', async () => {
    expect((await server.app.inject('/api/health')).statusCode).toBe(200);
    expect((await server.app.inject('/api/ready')).json()).toMatchObject({
      status: 'ready',
      persistence: 'disabled',
    });
  });
});
