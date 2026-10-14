import { describe, expect, it } from 'vitest';
import { INDIRECT_FIRE } from '../../convex/constants';
import { distanceKm, type LonLat } from './geo';
import { bombardRefusalOf, emplacedAt } from './indirect-fire';
import { THEATRES } from './theatres';

const europe = THEATRES.find((theatre) => theatre.id === 'europe')!;
const battery: LonLat = [10, 50];
/** Un point plein est de la batterie, à `km` kilomètres. */
const east = (km: number): LonLat => [10 + km / (111.32 * Math.cos((50 * Math.PI) / 180)), 50];

const NOW = 1_000_000;
const ready = {
  roles: ['artillery'] as const,
  from: battery,
  to: east(100),
  theatre: europe,
  seen: true,
  emplacedAt: NOW - 30_000,
  reloadUntil: null,
  now: NOW,
};

describe('a bombardment', () => {
  it('fires on a seen unit between the dead zone and the range', () => {
    expect(distanceKm(battery, east(100))).toBeCloseTo(100, 0);
    expect(bombardRefusalOf(ready)).toBeNull();
  });

  it('cannot reach beyond its range', () => {
    expect(bombardRefusalOf({ ...ready, to: east(INDIRECT_FIRE.rangeKm + 5) })).toBe(
      'OUT_OF_RANGE',
    );
  });

  it('cannot fire into its dead zone', () => {
    expect(bombardRefusalOf({ ...ready, to: east(INDIRECT_FIRE.deadZoneKm - 5) })).toBe(
      'TOO_CLOSE',
    );
  });

  it('waits to be in battery after it stopped', () => {
    const settledAt = NOW - 10_000;
    expect(emplacedAt(settledAt)).toBe(settledAt + INDIRECT_FIRE.emplaceSeconds * 1000);
    expect(bombardRefusalOf({ ...ready, emplacedAt: emplacedAt(settledAt) })).toBe('NOT_EMPLACED');
  });

  it('waits for its reload', () => {
    expect(bombardRefusalOf({ ...ready, reloadUntil: NOW + 5_000 })).toBe('RELOADING');
    expect(bombardRefusalOf({ ...ready, reloadUntil: NOW - 1 })).toBeNull();
  });

  it('fires only on what the player sees', () => {
    expect(bombardRefusalOf({ ...ready, seen: false })).toBe('NOTHING_TO_ATTACK');
  });

  it('stays inside the theatre', () => {
    expect(bombardRefusalOf({ ...ready, to: [50, 50] })).toBe('OUTSIDE_THEATRE');
  });

  it('is the artillery’s order, alone, and a Blitz one', () => {
    expect(bombardRefusalOf({ ...ready, roles: ['infantry'] })).toBe('ARTILLERY_ONLY');
    expect(bombardRefusalOf({ ...ready, roles: ['artillery', 'artillery'] })).toBe('ONE_UNIT_ONLY');
    expect(bombardRefusalOf({ ...ready, theatre: null })).toBe('BLITZ_ONLY');
  });
});
