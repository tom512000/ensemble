import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WANTED_SETTINGS,
  HEAD_TRAITS,
  WANTED_HEADS,
  type HeadLook,
  type WantedSettings,
} from '@ensemble/shared';
import { buildLevel, levelPlan, pickHead, createWanted } from '../src/games/wanted.js';

const key = (look: HeadLook) => HEAD_TRAITS.map((t) => look[t]).join('-');
const paces: WantedSettings['pace'][] = ['douce', 'normale', 'corsee'];

describe('tout seul : génération des niveaux', () => {
  it('laisse exactement une tête sans jumelle, à tous les niveaux et à tous les rythmes', () => {
    for (const pace of paces) {
      const settings: WantedSettings = { ...DEFAULT_WANTED_SETTINGS, pace, levels: 15 };
      for (let level = 1; level <= settings.levels; level++) {
        const { heads, targetId } = buildLevel(settings, level, 0);
        const counts = new Map<string, number>();
        for (const head of heads) counts.set(key(head.look), (counts.get(key(head.look)) ?? 0) + 1);
        const alone = [...counts.entries()].filter(([, n]) => n === 1);
        expect(alone, `niveau ${level} (${pace})`).toHaveLength(1);
        const target = heads.find((h) => h.id === targetId)!;
        expect(key(target.look)).toBe(alone[0]![0]);
      }
    }
  });

  it('fait monter la difficulté sur trois leviers à la fois', () => {
    const settings: WantedSettings = { ...DEFAULT_WANTED_SETTINGS, levels: 15, pace: 'normale' };
    const first = levelPlan(settings, 1);
    const last = levelPlan(settings, 15);
    expect(last.heads).toBeGreaterThan(first.heads);
    expect(last.groups).toBeGreaterThanOrEqual(first.groups);
    // Le levier décisif : l'intruse se distingue par de moins en moins de traits.
    expect(last.distance).toBeLessThan(first.distance);
    expect(last.distance).toBeGreaterThanOrEqual(1);
  });

  it('borne la foule et garde au moins deux têtes par groupe', () => {
    const settings: WantedSettings = { ...DEFAULT_WANTED_SETTINGS, pace: 'corsee', levels: 15 };
    for (let level = 1; level <= 15; level++) {
      const plan = levelPlan(settings, level);
      const { heads } = buildLevel(settings, level, 0);
      expect(heads.length).toBeLessThanOrEqual(WANTED_HEADS.max);
      expect(heads.length).toBe(plan.heads);
      expect(plan.groups * 2).toBeLessThanOrEqual(plan.heads - 1);
      for (const head of heads) {
        expect(head.position.x).toBeGreaterThanOrEqual(0);
        expect(head.position.x).toBeLessThanOrEqual(1);
        expect(head.position.y).toBeGreaterThanOrEqual(0);
        expect(head.position.y).toBeLessThanOrEqual(1);
      }
      expect(new Set(heads.map((h) => h.id)).size).toBe(heads.length);
    }
  });
});

describe('tout seul : désignation arbitrée par le serveur', () => {
  const settings: WantedSettings = { ...DEFAULT_WANTED_SETTINGS, levels: 3, startHeads: 8 };

  it('refuse une mauvaise tête, la compte, et ne change pas de niveau', () => {
    const state = createWanted(settings, 1000);
    const wrong = state.heads.find((h) => h.id !== state.targetId)!;
    const result = pickHead(state, settings, 'alice', wrong.id, 2000);
    expect(result.correct).toBe(false);
    expect(state.level).toBe(1);
    expect(state.misses.alice).toBe(1);
  });

  it('monte d’un niveau sur la bonne tête et renouvelle la foule', () => {
    const state = createWanted(settings, 1000);
    const before = state.heads.map((h) => h.id).join(',');
    const result = pickHead(state, settings, 'alice', state.targetId, 2000);
    expect(result).toMatchObject({ correct: true, finished: false });
    expect(state.level).toBe(2);
    expect(state.lastFound).toMatchObject({ playerId: 'alice', level: 1 });
    expect(state.heads.length).toBeGreaterThanOrEqual(8);
    expect(state.heads.map((h) => h.id).join(',')).not.toBe(before);
  });

  it('termine la partie au dernier niveau et refuse toute désignation ensuite', () => {
    const state = createWanted(settings, 1000);
    for (let level = 1; level < settings.levels; level++)
      pickHead(state, settings, 'alice', state.targetId, 1000 + level);
    expect(state.level).toBe(settings.levels);
    const last = pickHead(state, settings, 'bob', state.targetId, 9000);
    expect(last).toMatchObject({ correct: true, finished: true });
    expect(state.finishedAt).toBe(9000);
    expect(() => pickHead(state, settings, 'bob', state.targetId, 9100)).toThrow('terminée');
  });

  it('rejette une tête qui n’est pas sur le plateau', () => {
    const state = createWanted(settings, 1000);
    expect(() => pickHead(state, settings, 'alice', 'inconnue', 2000)).toThrow(
      'plus sur le plateau',
    );
  });
});
