import { randomUUID } from 'node:crypto';
import {
  HEAD_TRAITS,
  TRAIT_CHOICES,
  WANTED_HEADS,
  WORLD,
  headWidth,
  type HeadLook,
  type WantedHead,
  type WantedSettings,
  type WantedState,
} from '@ensemble/shared';
import { requireCondition } from '../platform/errors.js';

/** L'intruse n'existe que côté serveur : le client ne reçoit jamais la réponse. */
export interface WantedInternal extends WantedState {
  targetId: string;
}

type Rng = () => number;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pick = <T>(items: readonly T[], rng: Rng) => items[Math.floor(rng() * items.length)]!;

/**
 * Trois leviers montent ensemble : la foule grossit, elle se divise en plus de groupes, et
 * surtout l'intruse se distingue par de moins en moins de traits. Le dernier levier est celui
 * qui fait vraiment la difficulté — chercher parmi 60 têtes qui diffèrent d'un seul détail est
 * bien plus dur que parmi 60 têtes franchement différentes.
 */
const PACES = {
  douce: { growth: 2.1, groupEvery: 3, floor: 2 },
  normale: { growth: 3.4, groupEvery: 2, floor: 1 },
  corsee: { growth: 5, groupEvery: 1.5, floor: 1 },
} as const;

export function levelPlan(settings: WantedSettings, level: number) {
  const pace = PACES[settings.pace];
  const step = Math.max(0, level - 1);
  const heads = clamp(
    Math.round(settings.startHeads + pace.growth * Math.pow(step, 1.22)),
    WANTED_HEADS.min,
    WANTED_HEADS.max,
  );
  const groups = clamp(2 + Math.floor(step / pace.groupEvery), 2, 6);
  const distance = Math.max(pace.floor, 3 - Math.floor(step / 3));
  return { heads, groups: Math.min(groups, Math.floor((heads - 1) / 2)), distance };
}

const sameLook = (a: HeadLook, b: HeadLook) => HEAD_TRAITS.every((t) => a[t] === b[t]);
const randomLook = (rng: Rng): HeadLook =>
  Object.fromEntries(
    HEAD_TRAITS.map((t) => [t, Math.floor(rng() * TRAIT_CHOICES[t])]),
  ) as unknown as HeadLook;

/** Décale `distance` traits d'un modèle, sans jamais retomber sur un autre modèle. */
function loneLook(base: HeadLook, others: HeadLook[], distance: number, rng: Rng): HeadLook {
  for (let attempt = 0; attempt < 60; attempt++) {
    const look: HeadLook = { ...base };
    const traits = [...HEAD_TRAITS].sort(() => rng() - 0.5).slice(0, distance);
    for (const trait of traits) {
      const choices = TRAIT_CHOICES[trait];
      look[trait] = (look[trait] + 1 + Math.floor(rng() * (choices - 1))) % choices;
    }
    if (!others.some((other) => sameLook(other, look))) return look;
  }
  // Repli déterministe : on pousse un trait jusqu'à obtenir une combinaison inédite.
  const look: HeadLook = { ...base };
  for (let i = 0; i < TRAIT_CHOICES.hair; i++) {
    look.hair = (look.hair + 1) % TRAIT_CHOICES.hair;
    if (!others.some((other) => sameLook(other, look))) return look;
  }
  look.eyes = (look.eyes + 1) % TRAIT_CHOICES.eyes;
  return look;
}

/** Une foule où chaque modèle a au moins un jumeau, et une seule tête n'en a aucun. */
export function buildLevel(
  settings: WantedSettings,
  level: number,
  now: number,
  rng: Rng = Math.random,
) {
  const plan = levelPlan(settings, level);
  const archetypes: HeadLook[] = [];
  while (archetypes.length < plan.groups) {
    const candidate = randomLook(rng);
    if (!archetypes.some((other) => sameLook(other, candidate))) archetypes.push(candidate);
  }
  const target = loneLook(pick(archetypes, rng), archetypes, plan.distance, rng);

  // Chaque groupe reçoit au moins deux têtes, sinon plusieurs seraient « seules ».
  const counts = new Array<number>(plan.groups).fill(2);
  let placed = plan.groups * 2;
  while (placed < plan.heads - 1) {
    counts[Math.floor(rng() * plan.groups)]!++;
    placed++;
  }

  const looks: HeadLook[] = [];
  counts.forEach((count, index) => {
    for (let i = 0; i < count; i++) looks.push({ ...archetypes[index]! });
  });
  const targetIndex = Math.floor(rng() * (looks.length + 1));
  looks.splice(targetIndex, 0, target);

  const positions = crowd(looks.length, rng);
  const heads: WantedHead[] = looks.map((look, i) => ({
    id: 'h' + i,
    position: positions[i]!,
    tilt: (rng() - 0.5) * 16,
    scale: 1,
    look,
  }));
  return { heads, targetId: heads[targetIndex]!.id, plan };
}

/** Grille brouillée : dense mais jamais deux têtes l'une sur l'autre. */
function crowd(count: number, rng: Rng) {
  const size = headWidth(count) * WORLD.width;
  const marginX = size / 2 + 10;
  const marginY = size / 2 + 10;
  const spanX = WORLD.width - marginX * 2;
  const spanY = WORLD.height - marginY * 2;
  let scale = Math.max(0.6, Math.sqrt((spanX * spanY) / Math.max(1, count * 1.45 * size * size)));
  for (let attempt = 0; attempt < 40; attempt++, scale *= 0.96) {
    const cols = Math.max(1, Math.floor(spanX / Math.max(1, size * scale)));
    const rows = Math.max(1, Math.floor(spanY / Math.max(1, size * scale)));
    if (cols * rows < count) continue;
    const cells: { x: number; y: number }[] = [];
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++)
        cells.push({
          x: marginX + (spanX * (col + 0.5)) / cols,
          y: marginY + (spanY * (row + 0.5)) / rows,
        });
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cells[i], cells[j]] = [cells[j]!, cells[i]!];
    }
    const jitterX = Math.max(0, (spanX / cols - size * 0.92) / 2);
    const jitterY = Math.max(0, (spanY / rows - size * 0.92) / 2);
    return cells.slice(0, count).map((cell) => ({
      x: clamp((cell.x + (rng() - 0.5) * 2 * jitterX) / WORLD.width, 0, 1),
      y: clamp((cell.y + (rng() - 0.5) * 2 * jitterY) / WORLD.height, 0, 1),
    }));
  }
  return Array.from({ length: count }, () => ({ x: rng(), y: rng() }));
}

export function createWanted(settings: WantedSettings, now: number): WantedInternal {
  const { heads, targetId } = buildLevel(settings, 1, now);
  return {
    roundId: randomUUID(),
    level: 1,
    levels: settings.levels,
    heads,
    startedAt: now,
    levelStartedAt: now,
    finishedAt: null,
    lastFound: null,
    misses: {},
    targetId,
  };
}

/** Une désignation : le serveur seul dit si c'était la bonne, et fait monter le niveau. */
export function pickHead(
  state: WantedInternal,
  settings: WantedSettings,
  playerId: string,
  headId: string,
  now: number,
) {
  requireCondition(!state.finishedAt, 'ROUND_OVER', 'Cette partie est terminée.');
  requireCondition(
    state.heads.some((head) => head.id === headId),
    'HEAD_NOT_FOUND',
    'Cette tête n’est plus sur le plateau.',
  );
  if (headId !== state.targetId) {
    state.misses[playerId] = (state.misses[playerId] ?? 0) + 1;
    return { correct: false as const };
  }
  state.lastFound = { playerId, headId, level: state.level };
  if (state.level >= state.levels) {
    state.finishedAt = now;
    return { correct: true as const, finished: true };
  }
  state.level++;
  state.levelStartedAt = now;
  const next = buildLevel(settings, state.level, now);
  state.heads = next.heads;
  state.targetId = next.targetId;
  return { correct: true as const, finished: false };
}
