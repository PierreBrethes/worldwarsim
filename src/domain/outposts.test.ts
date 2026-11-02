import { describe, expect, it } from 'vitest';
import { depotCapacity } from '../../convex/constants';
import type { LonLat } from './geo';
import {
  drawnLiaisonsOf,
  isOnWatch,
  liaisonsOf,
  linkedRelays,
  lookoutCoalPerHour,
  effectiveSpecialty,
  lookoutKmOf,
  nearestOutpost,
  patrolRefusalOf,
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

  /** **Le Guet voit au rayon entier** (ADR 0037 §5) ; en chantier de changement, il guette en
   *  généraliste dès le départ (§7, décision du 01/11). */
  it('watches the whole reach as a Guet, and half of it while changing trade', () => {
    expect([2, 3].map((level) => lookoutKmOf({ level, specialty: 'lookout' }))).toEqual([180, 240]);
    expect(lookoutKmOf({ level: 2, specialty: 'store' })).toBe(90);
    expect(lookoutKmOf({ level: 2, specialty: 'lookout', changingTo: 'fort' })).toBe(90);
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

  /** **Le dessin épure, la règle non** (ADR 0037 §8, #375) : sans le côté long d'un triangle. */
  it('draws a triangle without its long side', () => {
    expect(drawnLiaisonsOf([at('a', 0), at('b', 100), at('c', 200)])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);
  });

  it('keeps the long side when the nearer point is in liaison with one end only', () => {
    // c sits nearer to both, but its small reach does not touch b's.
    expect(drawnLiaisonsOf([at('a', 0, 240), at('b', 350), at('c', 100, 1)])).toEqual([
      ['a', 'b'],
      ['a', 'c'],
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

/** **Pendant le chantier de changement, le point agit en généraliste** (ADR 0037 §7). */
describe('the specialty an outpost acts on', () => {
  it('reads an outpost from before the field as a generalist', () => {
    expect(effectiveSpecialty({})).toBe('general');
  });

  it('acts on its specialty, and as a generalist while a change runs', () => {
    expect(effectiveSpecialty({ specialty: 'store' })).toBe('store');
    expect(effectiveSpecialty({ specialty: 'store', changingTo: 'lookout' })).toBe('general');
    expect(effectiveSpecialty({ specialty: 'store', changingTo: null })).toBe('store');
  });

  /** **Le Magasin double son dépôt** (ADR 0037 §3, erratum du 01/11) : 1 600 et 2 400. */
  it('doubles the depot of a Magasin, and only its', () => {
    expect([2, 3].map((level) => depotCapacity(level, 'store'))).toEqual([1600, 2400]);
    expect([2, 3].map((level) => depotCapacity(level, 'fort'))).toEqual([800, 1200]);
  });
});

/** **Une ronde tourne sur une liaison tracée** (ADR 0037 §10, #376) : le contrat, avant le geste. */
describe('the refusal of a patrol', () => {
  const ready = {
    role: 'infantry' as const,
    pieces: 1,
    aboard: false,
    busy: false,
    stationedAt: 'a',
    liaison: ['b', 'a'] as const,
    drawn: [['a', 'b'] as const, ['b', 'c'] as const],
    patrolled: [['c', 'b'] as const],
    slots: { used: 1, total: 2 },
  };

  it('lets one land combat troop, standing at an end, onto a drawn liaison either way round', () => {
    expect(patrolRefusalOf(ready)).toBeNull();
    expect(patrolRefusalOf({ ...ready, role: 'armor', liaison: ['a', 'b'] })).toBeNull();
    expect(patrolRefusalOf({ ...ready, role: 'artillery' })).toBeNull();
  });

  it('says why not, in the order the hand meets it', () => {
    expect(patrolRefusalOf({ ...ready, pieces: 2 })).toEqual({ code: 'PATROL_ONE_TROOP' });
    expect(patrolRefusalOf({ ...ready, role: 'landTransport' })).toEqual({
      code: 'PATROL_LAND_COMBAT_ONLY',
    });
    expect(patrolRefusalOf({ ...ready, role: 'fighter' })).toEqual({
      code: 'PATROL_LAND_COMBAT_ONLY',
    });
    expect(patrolRefusalOf({ ...ready, aboard: true })).toEqual({ code: 'STILL_ABOARD' });
    expect(patrolRefusalOf({ ...ready, busy: true })).toEqual({ code: 'PATROL_BUSY' });
    expect(patrolRefusalOf({ ...ready, liaison: ['a', 'c'] })).toEqual({
      code: 'PATROL_NOT_DRAWN',
    });
    expect(patrolRefusalOf({ ...ready, stationedAt: 'c', liaison: ['a', 'b'] })).toEqual({
      code: 'PATROL_NOT_AT_END',
    });
    expect(patrolRefusalOf({ ...ready, stationedAt: 'c', liaison: ['b', 'c'] })).toEqual({
      code: 'PATROL_TAKEN',
    });
    expect(patrolRefusalOf({ ...ready, slots: { used: 2, total: 2 } })).toEqual({
      code: 'MOVEMENT_IN_FLIGHT',
      maximum: 2,
    });
  });
});
