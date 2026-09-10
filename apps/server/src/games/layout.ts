import {
  COLORS,
  OBJECT_ASPECT,
  WORLD,
  type Bin,
  type BinEdge,
  type BottleColor,
  type Point,
} from '@ensemble/shared';

export type Rng = () => number;

/**
 * Normalised coordinates are stretched by the 12:7 board, so anything that should look
 * evenly spaced is reasoned about in board pixels and converted back at the end.
 */
const toX = (px: number) => px / WORLD.width;
const toY = (px: number) => px / WORLD.height;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const BIN_SPAN = 190;
const BIN_DEPTH = 150;
const BIN_MARGIN = 14;
const BIN_GAP = 26;
const EDGES: BinEdge[] = ['top', 'right', 'bottom', 'left'];

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function binRect(edge: BinEdge, along: number): Omit<Bin, 'color'> {
  const horizontal = edge === 'top' || edge === 'bottom';
  const width = horizontal ? toX(BIN_SPAN) : toX(BIN_DEPTH);
  const height = horizontal ? toY(BIN_DEPTH) : toY(BIN_SPAN);
  const x = horizontal
    ? toX(along)
    : edge === 'left'
      ? toX(BIN_MARGIN)
      : 1 - toX(BIN_MARGIN) - width;
  const y = horizontal
    ? edge === 'top'
      ? toY(BIN_MARGIN)
      : 1 - toY(BIN_MARGIN) - height
    : toY(along);
  return { edge, x, y, width, height };
}

/**
 * Crates land at a free random spot along their edge instead of a fixed row, so no two
 * rounds look alike. Candidates are rejected against every crate already placed, not just
 * the ones sharing an edge, because two edges meet at a corner. If the random draws are
 * unlucky the track is scanned end to end, so a round can never fail to lay out.
 */
export function layoutBins(colorCount: number, rng: Rng = Math.random): Bin[] {
  const colors: BottleColor[] = shuffle([...COLORS.slice(0, colorCount)], rng);
  const edgeOrder = shuffle(EDGES, rng);
  const bins: Bin[] = [];
  const gapX = toX(BIN_GAP);
  const gapY = toY(BIN_GAP);
  const collides = (candidate: Omit<Bin, 'color'>) =>
    bins.some(
      (other) =>
        candidate.x < other.x + other.width + gapX &&
        other.x < candidate.x + candidate.width + gapX &&
        candidate.y < other.y + other.height + gapY &&
        other.y < candidate.y + candidate.height + gapY,
    );
  colors.forEach((color, index) => {
    const edge = edgeOrder[index % edgeOrder.length]!;
    const horizontal = edge === 'top' || edge === 'bottom';
    const track = Math.max(
      0,
      (horizontal ? WORLD.width : WORLD.height) - BIN_MARGIN * 2 - BIN_SPAN,
    );
    let rect: Omit<Bin, 'color'> | undefined;
    for (let attempt = 0; attempt < 60 && !rect; attempt++) {
      const candidate = binRect(edge, BIN_MARGIN + rng() * track);
      if (!collides(candidate)) rect = candidate;
    }
    for (let step = 0; step <= 48 && !rect; step++) {
      const candidate = binRect(edge, BIN_MARGIN + (track * step) / 48);
      if (!collides(candidate)) rect = candidate;
    }
    // Every remaining edge is worth trying before giving up on a free spot.
    for (const fallbackEdge of EDGES) {
      for (let step = 0; step <= 48 && !rect; step++) {
        const span = Math.max(
          0,
          (fallbackEdge === 'top' || fallbackEdge === 'bottom' ? WORLD.width : WORLD.height) -
            BIN_MARGIN * 2 -
            BIN_SPAN,
        );
        const candidate = binRect(fallbackEdge, BIN_MARGIN + (span * step) / 48);
        if (!collides(candidate)) rect = candidate;
      }
    }
    bins.push({ color, ...(rect ?? binRect(edge, BIN_MARGIN)) });
  });
  return bins;
}

/**
 * Stratified sampling: one object per cell, jittered inside a safe box so neighbours keep
 * their distance. That reads as a natural mess while guaranteeing what the board depends
 * on: an object's centre is never covered by a neighbour, so everything stays grabbable.
 *
 * The cell size starts from the ideal spacing and shrinks until enough cells fall outside
 * the crates, which is what lets a very full board still be laid out.
 */
export function scatter(
  count: number,
  bins: Bin[],
  objectSize: number,
  rng: Rng = Math.random,
): Point[] {
  const widthPx = objectSize * WORLD.width;
  const halfX = objectSize / 2;
  const halfY = toY((widthPx * 100) / 64 / 2);
  const area = {
    x0: halfX + toX(8),
    y0: halfY + toY(8),
    x1: 1 - halfX - toX(8),
    y1: 1 - halfY - toY(8),
  };
  const blocked = bins.map((bin) => ({
    x0: bin.x - halfX - toX(6),
    y0: bin.y - halfY - toY(6),
    x1: bin.x + bin.width + halfX + toX(6),
    y1: bin.y + bin.height + halfY + toY(6),
  }));
  const free = (x: number, y: number) =>
    !blocked.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);

  const spanXpx = Math.max(1, (area.x1 - area.x0) * WORLD.width);
  const spanYpx = Math.max(1, (area.y1 - area.y0) * WORLD.height);
  const heightPx = widthPx * OBJECT_ASPECT;
  // Cells take the shape of an object rather than being square. Square cells leave tall
  // objects far apart sideways while stacking them vertically, which is exactly what a busy
  // board looked like: tidy columns of overlapping bottles.
  let scale = Math.max(
    0.6,
    Math.sqrt((spanXpx * spanYpx) / Math.max(1, count * 1.3 * widthPx * heightPx)),
  );

  for (let attempt = 0; attempt < 40; attempt++, scale *= 0.96) {
    const cols = Math.max(1, Math.floor(spanXpx / Math.max(1, widthPx * 0.95 * scale)));
    const rows = Math.max(1, Math.floor(spanYpx / Math.max(1, heightPx * 0.62 * scale)));
    const cellW = (area.x1 - area.x0) / cols;
    const cellH = (area.y1 - area.y0) / rows;
    const cells: Point[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = area.x0 + (col + 0.5) * cellW;
        const y = area.y0 + (row + 0.5) * cellH;
        if (free(x, y)) cells.push({ x, y });
      }
    }
    if (cells.length < count) continue;
    // Whatever the jitter does, neighbours stay far enough apart that no object can cover
    // another one's centre, which is what has to stay clickable.
    const jitterX = Math.max(0, (cellW - toX(widthPx * 0.9)) / 2);
    const jitterY = Math.max(0, (cellH - toY(heightPx * 0.54)) / 2);
    return shuffle(cells, rng)
      .slice(0, count)
      .map((cell) => {
        const x = clamp(cell.x + (rng() - 0.5) * 2 * jitterX, area.x0, area.x1);
        const y = clamp(cell.y + (rng() - 0.5) * 2 * jitterY, area.y0, area.y1);
        return free(x, y) ? { x, y } : cell;
      });
  }
  // Unreachable for the allowed settings; still never place an object inside a crate.
  return Array.from({ length: count }, () => {
    for (let tries = 0; tries < 200; tries++) {
      const x = area.x0 + rng() * (area.x1 - area.x0);
      const y = area.y0 + rng() * (area.y1 - area.y0);
      if (free(x, y)) return { x, y };
    }
    return { x: (area.x0 + area.x1) / 2, y: (area.y0 + area.y1) / 2 };
  });
}

/**
 * Where the nth object of a colour sits once stored. The shelf wraps into layers so a very
 * full crate piles up instead of spilling out; the board also shows a count per crate.
 */
export function binSlot(bin: Bin, index: number, objectSize: number): Point {
  const itemW = objectSize * 0.52;
  const itemH = toY((itemW * WORLD.width * 100) / 64);
  const padX = toX(10);
  const label = bin.height * 0.3;
  const innerW = Math.max(itemW, bin.width - padX * 2 - itemW);
  const innerH = Math.max(itemH * 0.6, bin.height - label - toY(10) - itemH);
  const cols = Math.max(1, Math.floor(innerW / (itemW * 0.92)) + 1);
  const rows = Math.max(1, Math.floor(innerH / (itemH * 0.5)) + 1);
  const slots = cols * rows;
  const slot = index % slots;
  const layer = Math.floor(index / slots);
  const col = slot % cols;
  const row = Math.floor(slot / cols);
  const x =
    bin.x + padX + itemW / 2 + (cols === 1 ? 0 : (col * innerW) / (cols - 1 || 1)) + toX(layer * 3);
  const y =
    bin.y +
    label +
    itemH / 2 +
    (rows === 1 ? 0 : (row * innerH) / (rows - 1 || 1)) +
    toY(layer * 2);
  // A deep pile must still read as being inside its crate.
  return {
    x: clamp(x, bin.x + itemW / 2, bin.x + bin.width - itemW / 2),
    y: clamp(y, bin.y + label, bin.y + bin.height - itemH / 2),
  };
}
