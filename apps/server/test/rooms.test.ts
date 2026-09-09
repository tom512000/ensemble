import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  binAt,
  DEFAULT_SETTINGS,
  MAX_BOTTLES,
  MAX_SHAPES,
  LOCK_TTL_MS,
  RECONNECT_GRACE_MS,
  commandSchema,
  motionSchema,
  type CommandInput,
} from '@ensemble/shared';
import { RoomManager } from '../src/platform/rooms.js';
import { SessionStore, type Session } from '../src/platform/sessions.js';
import { TokenBucket } from '../src/platform/rate-limit.js';

describe('authoritative cooperative rooms', () => {
  let sessions: SessionStore, rooms: RoomManager, alice: Session, bob: Session, now: number;
  beforeEach(() => {
    now = 1_000_000;
    sessions = new SessionStore();
    rooms = new RoomManager(sessions, () => now);
    alice = sessions.create('Alice');
    bob = sessions.create('Bob');
  });
  const settings = { ...DEFAULT_SETTINGS, bottleCount: 6, maxPlayers: 2, colorCount: 3 };
  function send(session: Session, command: CommandInput) {
    return rooms.handle(session, { ...command, requestId: randomUUID() });
  }
  // Crates are laid out randomly per round, so every test reads them back from the state.
  const binsOf = (code: string) => rooms.snapshot(code).game!.bins;
  const center = (bin: { x: number; y: number; width: number; height: number }) => ({
    x: bin.x + bin.width / 2,
    y: bin.y + bin.height / 2,
  });
  function prepare() {
    const code = rooms.create(alice, settings);
    rooms.join(bob, code);
    rooms.start(alice, code);
    return code;
  }
  function take(code: string, player = alice, index = 0) {
    const game = rooms.snapshot(code).game!;
    const bottle = game.bottles[index]!;
    const input = { code, roundId: game.roundId, bottleId: bottle.id, dragId: randomUUID() };
    send(player, { ...input, type: 'bottle:grab' });
    return { ...input, bottle };
  }
  it('creates a shareable lobby with an opaque session token', () => {
    const code = rooms.create(alice, settings);
    const room = rooms.snapshot(code);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(room.hostId).toBe(alice.id);
    expect(room.status).toBe('lobby');
    expect(room.settings).toEqual(settings);
    expect(JSON.stringify(room)).not.toContain(alice.token);
  });
  it('joins idempotently and assigns different colors', () => {
    const code = rooms.create(alice, settings);
    rooms.join(bob, code);
    rooms.join(bob, code);
    expect(rooms.snapshot(code).players).toHaveLength(2);
    expect(new Set(rooms.snapshot(code).players.map((p) => p.color)).size).toBe(2);
  });
  it('rejects full rooms, missing rooms, and a second room for the same session', () => {
    const code = rooms.create(alice, settings);
    rooms.join(bob, code);
    expect(() => rooms.join(sessions.create('Charlie'), code)).toThrow('complète');
    expect(() => rooms.join(sessions.create('Denis'), 'ZZZZZZ')).toThrow('introuvable');
    expect(() => rooms.create(alice, settings)).toThrow('actuelle');
  });
  it('reserves disconnected seats then removes players and transfers host', () => {
    const code = rooms.create(alice, settings);
    rooms.join(bob, code);
    rooms.disconnect(alice);
    expect(() => rooms.join(sessions.create('Charlie'), code)).toThrow('complète');
    now += RECONNECT_GRACE_MS + 1;
    rooms.sweep();
    expect(rooms.snapshot(code).hostId).toBe(bob.id);
    expect(alice.roomCode).toBeNull();
    rooms.leave(bob, code);
    expect(rooms.list()).toHaveLength(0);
  });
  it('checks host permissions and capacity when editing settings', () => {
    const code = rooms.create(alice, DEFAULT_SETTINGS);
    rooms.join(bob, code);
    rooms.join(sessions.create('Clara'), code);
    expect(() => rooms.start(bob, code)).toThrow('hôte');
    expect(() => rooms.update(bob, code, settings)).toThrow('hôte');
    expect(() => rooms.update(alice, code, settings)).toThrow('capacité');
  });
  it('generates server state once and rejects late joins or another start', () => {
    const code = prepare();
    const game = rooms.snapshot(code).game!;
    expect(game.bottles).toHaveLength(6);
    expect(new Set(game.bottles.map((b) => b.id)).size).toBe(6);
    expect(() => rooms.start(alice, code)).toThrow('commencé');
    expect(() => rooms.join(sessions.create('Clara'), code)).toThrow('commencé');
  });
  it('scatters objects clear of every crate and never on a grid', () => {
    // The densest board the settings allow: the maximum objects over the fewest colours.
    const dense = {
      bottleCount: MAX_BOTTLES,
      maxPlayers: 2,
      colorCount: 3,
      shapeCount: MAX_SHAPES,
    };
    const code = rooms.create(alice, dense);
    rooms.start(alice, code);
    const bottles = rooms.snapshot(code).game!.bottles;
    const bins = binsOf(code);
    expect(bins).toHaveLength(3);
    for (const bottle of bottles) {
      expect(binAt(bottle.position, bins)).toBeUndefined();
      expect(bottle.position.x).toBeGreaterThanOrEqual(0);
      expect(bottle.position.x).toBeLessThanOrEqual(1);
      expect(bottle.position.y).toBeGreaterThanOrEqual(0);
      expect(bottle.position.y).toBeLessThanOrEqual(1);
      expect(bottle.home).toEqual(bottle.position);
      expect(Math.abs(bottle.tilt)).toBeLessThanOrEqual(9);
      expect(bottle.shape).toBeGreaterThanOrEqual(0);
      expect(bottle.shape).toBeLessThan(MAX_SHAPES);
    }
    // A grid of this many objects would reuse roughly 25 x values across its columns.
    // A scatter spreads them over hundreds, which is the difference being asserted here.
    const columns = new Set(bottles.map((b) => b.position.x.toFixed(3)));
    expect(columns.size).toBeGreaterThan(bottles.length / 2);
    const rows = new Set(bottles.map((b) => b.position.y.toFixed(3)));
    expect(rows.size).toBeGreaterThan(bottles.length / 2);
    // Every colour must fit its shelf, so a full board can actually be completed.
    for (const bin of bins) {
      const ofColour = bottles.filter((b) => b.color === bin.color);
      for (const bottle of ofColour) {
        const held = take(code, alice, bottles.indexOf(bottle));
        send(alice, { ...held, type: 'bottle:release', position: center(bin) });
      }
      for (const stored of rooms
        .snapshot(code)
        .game!.bottles.filter((b) => b.color === bin.color)) {
        expect(stored.sorted).toBe(true);
        expect(stored.position.y).toBeLessThanOrEqual(bin.y + bin.height);
        expect(stored.position.x).toBeGreaterThanOrEqual(bin.x);
        expect(stored.position.x).toBeLessThanOrEqual(bin.x + bin.width);
      }
    }
    expect(rooms.snapshot(code).status).toBe('finished');
  });
  it('allows only one holder and one bottle per player', () => {
    const code = prepare();
    const held = take(code);
    expect(() => send(bob, { ...held, type: 'bottle:grab', dragId: randomUUID() })).toThrow('déjà');
    expect(() => take(code, alice, 1)).toThrow('Une bouteille');
    expect(() =>
      send(bob, { ...held, type: 'bottle:release', position: { x: 0.5, y: 0.1 } }),
    ).toThrow('libérée');
  });
  it('validates drops against the server bins and restores wrong drops', () => {
    const code = prepare();
    const held = take(code);
    const bins = binsOf(code);
    const wrong = bins.find((b) => b.color !== held.bottle.color)!;
    send(alice, { ...held, type: 'bottle:release', position: center(wrong) });
    const bottle = rooms.snapshot(code).game!.bottles[0]!;
    expect(bottle.sorted).toBe(false);
    expect(bottle.lock).toBeNull();
    expect(bottle.position).toEqual(bottle.home);
    const next = take(code);
    const correct = bins.find((b) => b.color === next.bottle.color)!;
    send(alice, { ...next, type: 'bottle:release', position: center(correct) });
    expect(rooms.snapshot(code).game!.bottles[0]!.sorted).toBe(true);
    expect(rooms.snapshot(code).players[0]!.sorted).toBe(1);
  });
  it('expires locks and rejects old drag packets after reacquisition', () => {
    const code = prepare();
    const old = take(code);
    now += LOCK_TTL_MS + 1;
    rooms.sweep();
    expect(rooms.snapshot(code).game!.bottles[0]!.lock).toBeNull();
    take(code);
    expect(() =>
      rooms.motion(alice, { ...old, type: 'bottle:move', position: { x: 0.4, y: 0.4 }, seq: 1 }),
    ).toThrow('libérée');
  });
  it('renews leases, cancels grabs, and unlocks on disconnect', () => {
    const code = prepare();
    const held = take(code);
    now += 2500;
    rooms.motion(alice, { ...held, type: 'bottle:move', position: { x: 0.5, y: 0.5 }, seq: 1 });
    now += 1000;
    rooms.sweep();
    expect(rooms.snapshot(code).game!.bottles[0]!.lock).not.toBeNull();
    send(alice, { ...held, type: 'bottle:cancel' });
    expect(rooms.snapshot(code).game!.bottles[0]!.lock).toBeNull();
    take(code);
    rooms.disconnect(alice);
    expect(rooms.snapshot(code).game!.bottles[0]!.lock).toBeNull();
  });
  it('reconnects during play with the same identity and state', () => {
    const code = prepare();
    const roundId = rooms.snapshot(code).game!.roundId;
    rooms.disconnect(bob);
    now += 1000;
    rooms.reconnect(bob);
    expect(rooms.snapshot(code).players.find((p) => p.id === bob.id)?.connected).toBe(true);
    expect(rooms.snapshot(code).game!.roundId).toBe(roundId);
  });
  it('finishes exactly once, records contributions, and returns to the lobby', () => {
    const code = prepare();
    const results: string[] = [];
    rooms.hooks.finished = (result) => results.push(result.id);
    for (let i = 0; i < 6; i++) {
      const player = i % 2 ? bob : alice;
      const held = take(code, player, i);
      const bin = binsOf(code).find((b) => b.color === held.bottle.color)!;
      now += 100;
      send(player, { ...held, type: 'bottle:release', position: center(bin) });
    }
    expect(rooms.snapshot(code).status).toBe('finished');
    expect(results).toHaveLength(1);
    expect(rooms.snapshot(code).players.map((p) => p.sorted)).toEqual([3, 3]);
    rooms.restart(alice, code);
    expect(rooms.snapshot(code).status).toBe('lobby');
    expect(rooms.snapshot(code).game).toBeNull();
  });
  it('bounds the room lifetime and room capacity of the process', () => {
    const capped = new RoomManager(sessions, () => now, 1);
    const code = capped.create(alice, settings);
    expect(() => capped.create(bob, settings)).toThrow('occupées');
    now += 4 * 3_600_000 + 1;
    capped.sweep();
    expect(capped.list()).toHaveLength(0);
    expect(alice.roomCode).toBeNull();
    expect(() => capped.snapshot(code)).toThrow('introuvable');
  });
  it('rejects malformed, excessive and nonfinite browser input', () => {
    expect(commandSchema.safeParse({ type: 'game:win', requestId: randomUUID() }).success).toBe(
      false,
    );
    expect(
      commandSchema.safeParse({
        type: 'room:create',
        requestId: randomUUID(),
        gameId: 'sorting',
        settings: { ...settings, bottleCount: 10_000 },
      }).success,
    ).toBe(false);
    for (const x of [-0.1, 1.1, Infinity, NaN])
      expect(
        motionSchema.safeParse({
          type: 'cursor:move',
          code: 'ABC234',
          position: { x, y: 0.5 },
          seq: 1,
        }).success,
      ).toBe(false);
  });
  it('limits bursts and refills budgets with time', () => {
    const bucket = new TokenBucket(2, 1, () => now);
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
    now += 1000;
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
  });
});
