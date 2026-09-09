import { describe, expect, it } from 'vitest';
import { binAt, MAX_BOTTLES, objectWidth, WORLD, type Bin } from '@ensemble/shared';
import { binSlot, layoutBins, scatter } from '../src/games/layout.js';

// A seeded generator keeps these checks reproducible while still exercising real spread.
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
const overlaps = (a: Bin, b: Bin) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('crate layout and scatter', () => {
  it('places every crate against a border, inside the board and clear of the others', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const colorCount of [3, 4, 5, 6]) {
        const bins = layoutBins(colorCount, seeded(seed * colorCount));
        expect(bins).toHaveLength(colorCount);
        expect(new Set(bins.map((b) => b.color)).size).toBe(colorCount);
        for (const bin of bins) {
          expect(bin.x).toBeGreaterThanOrEqual(0);
          expect(bin.y).toBeGreaterThanOrEqual(0);
          expect(bin.x + bin.width).toBeLessThanOrEqual(1);
          expect(bin.y + bin.height).toBeLessThanOrEqual(1);
          // Hugging its edge is what makes the border layout readable.
          const touching =
            bin.edge === 'top'
              ? bin.y < 0.03
              : bin.edge === 'bottom'
                ? bin.y + bin.height > 0.97
                : bin.edge === 'left'
                  ? bin.x < 0.02
                  : bin.x + bin.width > 0.98;
          expect(touching).toBe(true);
        }
        for (let i = 0; i < bins.length; i++)
          for (let j = i + 1; j < bins.length; j++)
            expect(overlaps(bins[i]!, bins[j]!)).toBe(false);
      }
    }
  });

  it('uses more than one border once there are several crates', () => {
    const edges = new Set(
      [1, 2, 3, 4, 5].flatMap((seed) => layoutBins(4, seeded(seed * 977)).map((b) => b.edge)),
    );
    expect(edges.size).toBeGreaterThan(1);
  });

  it('keeps scattered objects apart, inside the board and off every crate', () => {
    const bins = layoutBins(6, seeded(7));
    const size = objectWidth(MAX_BOTTLES);
    const points = scatter(MAX_BOTTLES, bins, size, seeded(11));
    expect(points).toHaveLength(MAX_BOTTLES);
    for (const point of points) {
      expect(binAt(point, bins)).toBeUndefined();
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(1);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(1);
    }
    // No two objects may sit so close that one hides the other beyond reach.
    let closest = Infinity;
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) {
        const dx = (points[i]!.x - points[j]!.x) * WORLD.width;
        const dy = (points[i]!.y - points[j]!.y) * WORLD.height;
        closest = Math.min(closest, Math.hypot(dx, dy));
      }
    // Half an object is 0.78 of its width tall, so this is what keeps every centre clickable.
    expect(closest).toBeGreaterThan(objectWidth(MAX_BOTTLES) * WORLD.width * 0.78);
  });

  it('stacks a very full crate without letting objects escape it', () => {
    const bin = layoutBins(3, seeded(3))[0]!;
    const size = objectWidth(MAX_BOTTLES);
    for (let index = 0; index < 120; index++) {
      const slot = binSlot(bin, index, size);
      expect(slot.x).toBeGreaterThanOrEqual(bin.x);
      expect(slot.x).toBeLessThanOrEqual(bin.x + bin.width);
      expect(slot.y).toBeGreaterThanOrEqual(bin.y);
      expect(slot.y).toBeLessThanOrEqual(bin.y + bin.height);
    }
  });

  it('shrinks objects as the board fills so a busy round stays playable', () => {
    expect(objectWidth(20)).toBeGreaterThan(objectWidth(MAX_BOTTLES));
    expect(objectWidth(MAX_BOTTLES) * WORLD.width).toBeGreaterThanOrEqual(26);
  });
});
