import { describe, expect, it } from 'vitest';
import { battleTracesOf, cratersOf, MAX_CRATERS, TRACE_MS } from './battle-traces';
import type { CombatReport } from './player-view';

const NOON = new Date(2026, 10, 26, 12, 0, 0).getTime();
const HOUR = 3_600_000;

const report = (
  id: string,
  at: number,
  lost: readonly [mine: number, theirs: number] = [5, 5],
  extra: Partial<CombatReport> = {},
): CombatReport => ({
  id,
  at,
  cause: 'arrival',
  side: 'attacker',
  won: true,
  hostCountry: 'FRA',
  point: { lon: 2.35, lat: 48.85 },
  outpostId: null,
  outpostDisabled: false,
  mine: { troops: 2, lost: lost[0], routed: 0, destroyed: 0 },
  theirs: { troops: 2, lost: lost[1], routed: 0, destroyed: 0 },
  ...extra,
});

describe('battleTracesOf (#642)', () => {
  it('pose une trace au point de chaque combat sur terre, à l’encre pleine quand il est frais', () => {
    expect(battleTracesOf([report('a', NOON)], NOON)).toEqual([
      { id: 'a', point: [2.35, 48.85], craters: 2, ink: 1 },
    ]);
  });

  it('pâlit avec l’âge et s’efface à TRACE_MS', () => {
    const half = battleTracesOf([report('a', NOON)], NOON + TRACE_MS / 2);
    expect(half[0]!.ink).toBeCloseTo(0.5);
    expect(battleTracesOf([report('a', NOON)], NOON + TRACE_MS)).toEqual([]);
    expect(TRACE_MS).toBe(24 * HOUR);
  });

  it('ne pose rien en mer : les épaves sont une autre trace (#643)', () => {
    expect(battleTracesOf([report('a', NOON, [5, 5], { atSea: true })], NOON)).toEqual([]);
  });

  it('pose le bombardement au point visé, chez l’attaquant comme chez la cible', () => {
    const target = { lon: 13.4, lat: 52.5 };
    const struck = (side: 'attacker' | 'defender') =>
      battleTracesOf(
        [
          report('b', NOON, [0, 30], {
            cause: 'bombardment',
            side,
            point: target,
            firedFrom: { lon: 12, lat: 52 },
          }),
        ],
        NOON,
      )[0]!.point;
    expect(struck('attacker')).toEqual([13.4, 52.5]);
    expect(struck('defender')).toEqual([13.4, 52.5]);
  });

  it('un combat en deux dépêches ne laisse qu’une trace', () => {
    expect(battleTracesOf([report('a', NOON), report('a', NOON)], NOON)).toHaveLength(1);
  });

  it('une horloge en retard sur le serveur voit le combat frais', () => {
    expect(battleTracesOf([report('a', NOON + 5_000)], NOON)[0]!.ink).toBe(1);
  });
});

describe('cratersOf', () => {
  it('compte les pertes des deux camps, par paliers, un cratère au moins', () => {
    expect(cratersOf(report('a', NOON, [0, 0]))).toBe(1);
    expect(cratersOf(report('a', NOON, [4, 5]))).toBe(1);
    expect(cratersOf(report('a', NOON, [5, 5]))).toBe(2);
    expect(cratersOf(report('a', NOON, [20, 20]))).toBe(3);
    expect(cratersOf(report('a', NOON, [60, 40]))).toBe(4);
    expect(cratersOf(report('a', NOON, [900, 900]))).toBe(MAX_CRATERS);
  });
});
