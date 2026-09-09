import { randomUUID } from 'node:crypto';
import {
  binAt,
  COLORS,
  getBins,
  LOCK_TTL_MS,
  type Bottle,
  type Point,
  type SortingState,
} from '@ensemble/shared';
import type { GameDefinition } from './definition.js';
import { requireCondition } from '../platform/errors.js';

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export const sortingGame: GameDefinition<SortingState> = {
  id: 'sorting',
  create(settings, now) {
    const columns = Math.min(10, Math.ceil(Math.sqrt(settings.bottleCount * 1.7)));
    const rows = Math.ceil(settings.bottleCount / columns);
    const colors = Array.from(
      { length: settings.bottleCount },
      (_, i) => COLORS[i % settings.colorCount]!,
    );
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j]!, colors[i]!];
    }
    return {
      roundId: randomUUID(),
      startedAt: now,
      finishedAt: null,
      bottles: colors.map((color, i) => {
        // A loose grid keeps every bottle reachable; the jitter keeps it from looking like a table.
        const spread = (amount: number) => (Math.random() - 0.5) * 2 * amount;
        const position = {
          x: clamp(
            0.08 + (i % columns) * (0.84 / Math.max(1, columns - 1)) + spread(0.022),
            0.05,
            0.95,
          ),
          y: clamp(
            0.46 + Math.floor(i / columns) * (0.44 / Math.max(1, rows - 1)) + spread(0.026),
            0.42,
            0.94,
          ),
        };
        return {
          id: 'b' + i,
          color,
          shape: Math.floor(Math.random() * 3),
          tilt: spread(9),
          position,
          home: { ...position },
          sorted: false,
          sortedBy: null,
          lock: null,
        };
      }),
    };
  },
  isFinished: (state) => state.bottles.every((b) => b.sorted),
};

export function grab(bottle: Bottle, playerId: string, dragId: string, now: number) {
  requireCondition(!bottle.sorted, 'ALREADY_SORTED', 'Cette bouteille est déjà à sa place.');
  requireCondition(
    !bottle.lock ||
      bottle.lock.expiresAt <= now ||
      (bottle.lock.playerId === playerId && bottle.lock.dragId === dragId),
    'BOTTLE_BUSY',
    'Un autre joueur tient déjà cette bouteille.',
  );
  bottle.lock = { playerId, dragId, expiresAt: now + LOCK_TTL_MS };
}
export function owns(bottle: Bottle, playerId: string, dragId: string, now: number) {
  requireCondition(
    bottle.lock?.playerId === playerId &&
      bottle.lock.dragId === dragId &&
      bottle.lock.expiresAt > now,
    'LOCK_LOST',
    'La prise a été libérée. Attrapez à nouveau la bouteille.',
  );
}
export function release(
  state: SortingState,
  bottle: Bottle,
  position: Point,
  colorCount: number,
  playerId: string,
) {
  const bin = binAt(position, colorCount);
  bottle.lock = null;
  if (bin?.color === bottle.color) {
    const sameColor = state.bottles.filter((b) => b.sorted && b.color === bottle.color).length;
    const target = getBins(colorCount).find((b) => b.color === bottle.color)!;
    // A compact 5-column shelf supports up to 20 bottles per color.
    bottle.position = {
      x: target.x + target.width * (0.14 + (sameColor % 5) * 0.18),
      y: target.y + 0.1 + Math.floor(sameColor / 5) * 0.038,
    };
    bottle.sorted = true;
    bottle.sortedBy = playerId;
  } else {
    bottle.position = { ...bottle.home };
  }
  return bottle.sorted;
}
