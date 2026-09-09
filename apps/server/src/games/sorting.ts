import { randomUUID } from 'node:crypto';
import {
  binAt,
  COLORS,
  LOCK_TTL_MS,
  MAX_SHAPES,
  objectWidth,
  type Bottle,
  type Point,
  type SortingState,
} from '@ensemble/shared';
import type { GameDefinition } from './definition.js';
import { requireCondition } from '../platform/errors.js';
import { binSlot, layoutBins, scatter } from './layout.js';

export const sortingGame: GameDefinition<SortingState> = {
  id: 'sorting',
  create(settings, now) {
    const bins = layoutBins(settings.colorCount);
    const size = objectWidth(settings.bottleCount);
    const positions = scatter(settings.bottleCount, bins, size);
    const colors = Array.from(
      { length: settings.bottleCount },
      (_, i) => COLORS[i % settings.colorCount]!,
    );
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j]!, colors[i]!];
    }
    const shapes = Math.min(settings.shapeCount, MAX_SHAPES);
    return {
      roundId: randomUUID(),
      startedAt: now,
      finishedAt: null,
      bins,
      bottles: colors.map((color, i) => {
        const position = positions[i]!;
        return {
          id: 'b' + i,
          color,
          shape: Math.floor(Math.random() * shapes),
          tilt: (Math.random() - 0.5) * 18,
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
  requireCondition(!bottle.sorted, 'ALREADY_SORTED', 'Cet objet est déjà à sa place.');
  requireCondition(
    !bottle.lock ||
      bottle.lock.expiresAt <= now ||
      (bottle.lock.playerId === playerId && bottle.lock.dragId === dragId),
    'BOTTLE_BUSY',
    'Un autre joueur tient déjà cet objet.',
  );
  bottle.lock = { playerId, dragId, expiresAt: now + LOCK_TTL_MS };
}
export function owns(bottle: Bottle, playerId: string, dragId: string, now: number) {
  requireCondition(
    bottle.lock?.playerId === playerId &&
      bottle.lock.dragId === dragId &&
      bottle.lock.expiresAt > now,
    'LOCK_LOST',
    'La prise a été libérée. Attrapez à nouveau l’objet.',
  );
}
export function release(
  state: SortingState,
  bottle: Bottle,
  position: Point,
  bottleCount: number,
  playerId: string,
) {
  const bin = binAt(position, state.bins);
  bottle.lock = null;
  if (bin?.color === bottle.color) {
    const stored = state.bottles.filter((b) => b.sorted && b.color === bottle.color).length;
    bottle.position = binSlot(bin, stored, objectWidth(bottleCount));
    bottle.sorted = true;
    bottle.sortedBy = playerId;
  } else {
    bottle.position = { ...bottle.home };
  }
  return bottle.sorted;
}
