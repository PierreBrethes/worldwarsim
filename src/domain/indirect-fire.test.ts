import { describe, expect, it } from 'vitest';
import { contactKm, INDIRECT_FIRE } from '../../convex/constants';
import { distanceKm, type LonLat } from './geo';
import {
  bombardRefusalOf,
  bombardsWith,
  emplacedAt,
  fireReachOf,
  gunsReach,
} from './indirect-fire';
import { THEATRES } from './theatres';

const europe = THEATRES.find((theatre) => theatre.id === 'europe')!;
const pacific = THEATRES.find((theatre) => theatre.id === 'pacific')!;
const reach = fireReachOf(europe);
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
  reachable: true,
  emplacedAt: NOW - 30_000,
  reloadUntil: null,
  moving: false,
  aboard: false,
  now: NOW,
};

describe('a bombardment', () => {
  it('fires on a seen unit between the dead zone and the range', () => {
    expect(distanceKm(battery, east(100))).toBeCloseTo(100, 0);
    expect(bombardRefusalOf(ready)).toBeNull();
  });

  it('cannot reach beyond its range', () => {
    expect(bombardRefusalOf({ ...ready, to: east(reach.rangeKm + 5) })).toBe('OUT_OF_RANGE');
  });

  it('cannot fire into its dead zone', () => {
    expect(bombardRefusalOf({ ...ready, to: east(reach.deadZoneKm - 5) })).toBe('TOO_CLOSE');
  });

  it('reaches as far on its theatre: what Europe calls too far, the Pacific fires at (A2)', () => {
    const kmEast = reach.rangeKm + 50;
    expect(bombardRefusalOf({ ...ready, to: east(kmEast) })).toBe('OUT_OF_RANGE');
    const tokyo: LonLat = [140, 35];
    const offTokyo: LonLat = [140 + kmEast / (111.32 * Math.cos((35 * Math.PI) / 180)), 35];
    expect(fireReachOf(pacific).rangeKm).toBeGreaterThan(3 * reach.rangeKm);
    expect(bombardRefusalOf({ ...ready, theatre: pacific, from: tokyo, to: offTokyo })).toBeNull();
  });

  it('waits to be in battery after it stopped', () => {
    const settledAt = NOW - 10_000;
    expect(emplacedAt(settledAt)).toBe(settledAt + INDIRECT_FIRE.emplaceSeconds * 1000);
    expect(bombardRefusalOf({ ...ready, emplacedAt: emplacedAt(settledAt) })).toBe('NOT_EMPLACED');
  });

  it('fires at a halt, never on the road nor from aboard a transport', () => {
    expect(bombardRefusalOf({ ...ready, moving: true })).toBe('ON_THE_MOVE');
    expect(bombardRefusalOf({ ...ready, aboard: true })).toBe('ABOARD');
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

  it('is the artillery’s order, alone', () => {
    expect(bombardRefusalOf({ ...ready, roles: ['infantry'] })).toBe('ARTILLERY_ONLY');
    expect(bombardRefusalOf({ ...ready, roles: ['artillery', 'artillery'] })).toBe('ONE_UNIT_ONLY');
  });
});

/** **En Mondiale** (4.10) : des kilomètres, aucun théâtre, et des salves payées en crans. */
describe('the indirect fire of a Mondiale', () => {
  const mondiale = { ...ready, theatre: null };

  it('fires between its dead zone and its range, in kilometres', () => {
    const { rangeKm, deadZoneKm } = fireReachOf(null);
    expect(bombardRefusalOf({ ...mondiale, to: east((rangeKm + deadZoneKm) / 2) })).toBeNull();
    expect(bombardRefusalOf({ ...mondiale, to: east(deadZoneKm - 5) })).toBe('TOO_CLOSE');
    expect(bombardRefusalOf({ ...mondiale, to: east(rangeKm + 5) })).toBe('OUT_OF_RANGE');
  });

  it('keeps the battery and the dead zone over the contact radius', () => {
    expect(fireReachOf(null).deadZoneKm).toBeGreaterThan(contactKm(null));
    expect(bombardRefusalOf({ ...mondiale, moving: true })).toBe('ON_THE_MOVE');
    expect(bombardRefusalOf({ ...mondiale, emplacedAt: NOW + 1 })).toBe('NOT_EMPLACED');
  });

  it('stays silent out of rounds, and fires one gun at a time', () => {
    const to = east(fireReachOf(null).rangeKm / 2);
    expect(bombardRefusalOf({ ...mondiale, to, outOfRounds: true })).toBe('NO_ROUNDS');
    expect(bombardRefusalOf({ ...mondiale, to, roles: ['artillery', 'artillery'] })).toBe(
      'ONE_GUN_ONLY',
    );
    expect(bombardRefusalOf({ ...mondiale, to, roles: ['artillery', 'infantry'] })).toBe(
      'ARTILLERY_ONLY',
    );
  });

  it('wastes no salvo on what it cannot touch: nothing in the air', () => {
    expect(gunsReach('air')).toBe(false);
    expect(gunsReach('land') && gunsReach('sea')).toBe(true);
    expect(bombardRefusalOf({ ...ready, reachable: false })).toBe('OUT_OF_GUNS_REACH');
  });

  it('bombards with guns alone in a Mondiale, with any unit carrying one in a Blitz', () => {
    expect(bombardsWith(['artillery'], 'mondiale')).toBe(true);
    expect(bombardsWith(['artillery', 'infantry'], 'mondiale')).toBe(false);
    expect(bombardsWith(['landTransport', 'artillery'], 'blitz')).toBe(true);
    expect(bombardsWith([], 'mondiale')).toBe(false);
  });
});
