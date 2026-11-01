import { describe, expect, it } from 'vitest';
import type { LonLat } from './geo';
import {
  isOnWatch,
  liaisonsOf,
  linkedRelays,
  lookoutCoalPerHour,
  lookoutKmOf,
  nearestOutpost,
  reachingOutpost,
  withinReach,
} from './outposts';

const BUCHAREST: LonLat = [26.1, 44.43];
const PRAHOVA: LonLat = [26.01, 45.1];
const PARIS: LonLat = [2.27, 48.9];

describe('outpost reach', () => {
  it('has none without an outpost', () => {
    expect(nearestOutpost(PRAHOVA, [])).toBeNull();
    expect(withinReach(PRAHOVA, [])).toBe(false);
  });

  it('measures the nearest one, not the first', () => {
    const nearest = nearestOutpost(PRAHOVA, [{ point: PARIS }, { point: BUCHAREST }]);
    expect(nearest?.km).toBeCloseTo(75, 0);
  });

  /** The same radius covers a handful of Romanian counties and no French department from
   *  Paris: the count varies with the cutting, the kilometres do not. */
  it('opens a radius, not a ring of neighbours', () => {
    const outposts = [{ point: BUCHAREST, reachKm: 120 }];
    expect(withinReach(PRAHOVA, outposts)).toBe(true);
    expect(withinReach(PARIS, outposts)).toBe(false);
  });

  /**
   * **Chaque point porte son rayon** depuis qu'il suit son niveau (31/08) : le plus proche n'est
   * plus forcément celui qui couvre, et c'est celui qui couvre qui répond.
   */
  it('answers with the point that reaches, never with the nearest that does not', () => {
    const short = { point: PARIS, reachKm: 120, name: 'paris' };
    const long = { point: BUCHAREST, reachKm: 240, name: 'bucarest' };
    expect(reachingOutpost(PRAHOVA, [short, long])?.nearest.name).toBe('bucarest');
    expect(reachingOutpost(PRAHOVA, [{ ...long, reachKm: 60 }])).toBeNull();
  });
});

/** **Tout avant-poste guette** (ADR 0037 §2) : à mi-rayon, pour un charbon par heure et par niveau. */
describe('the lookout of an outpost', () => {
  it('watches half its reach: 60, 90 and 120 km', () => {
    expect([1, 2, 3].map((level) => lookoutKmOf({ level }))).toEqual([60, 90, 120]);
  });

  /** Un chantier ou un point désactivé ne guette pas : pas de cercle, pas de liaison. */
  it('keeps watch only standing and in service', () => {
    expect(isOnWatch({ standsAt: null, disabledMinutesLeft: null })).toBe(true);
    expect(isOnWatch({ standsAt: null, disabledMinutesLeft: 120 })).toBe(false);
    expect(isOnWatch({ standsAt: 5, disabledMinutesLeft: null })).toBe(false);
  });

  it('burns one coal an hour per level', () => {
    expect([1, 2, 3].map(lookoutCoalPerHour)).toEqual([1, 2, 3]);
  });
});

/** **Des rayons qui se touchent se relient d'eux-mêmes** (ADR 0037 §8) : distance ≤ somme. */
describe('the liaisons between outposts', () => {
  const east = (km: number): LonLat => [26 + km / (111.32 * Math.cos((45 * Math.PI) / 180)), 45];
  const at = (id: string, km: number, reachKm = 120) => ({ id, point: east(km), reachKm });

  it('links two points whose reaches touch, and not two that miss by a little', () => {
    expect(liaisonsOf([at('a', 0), at('b', 239)])).toEqual([['a', 'b']]);
    expect(liaisonsOf([at('a', 0), at('b', 241)])).toEqual([]);
  });

  it('reads each reach on its own: a level-three point reaches farther', () => {
    expect(liaisonsOf([at('a', 0, 240), at('b', 350)])).toEqual([['a', 'b']]);
  });

  it('keeps every pair that touches, the long side of a triangle too', () => {
    expect(liaisonsOf([at('a', 0), at('b', 100), at('c', 200)])).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ]);
  });

  it('hands the timing only the points in liaison: a lone point speeds nothing', () => {
    const relays = linkedRelays([at('a', 0), at('b', 200), at('alone', 2000)]);
    expect(relays).toEqual([
      { point: east(0), reachKm: 120 },
      { point: east(200), reachKm: 120 },
    ]);
    expect(linkedRelays([at('alone', 0)])).toEqual([]);
  });
});
