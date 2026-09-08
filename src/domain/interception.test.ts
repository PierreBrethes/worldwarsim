import { describe, expect, it } from 'vitest';
import { distanceKm, type LonLat } from './geo';
import {
  firstMobileEncounter,
  mediumAt,
  mobileSighting,
  positionAt,
  sightingsAlong,
  type MarchingForce,
} from './interception';

const HOUR = 3_600_000;

/** A straight run along the equator, one degree of longitude at a time. */
const column = (id: string, from: number, to: number, departedAt = 0): MarchingForce => ({
  id,
  points: Array.from({ length: Math.abs(to - from) + 1 }, (_, step) => [
    from + Math.sign(to - from) * step,
    0,
  ]) as ReadonlyArray<LonLat>,
  departedAt,
  arrivesAt: departedAt + 10 * HOUR,
});

describe('where a column stands at an instant', () => {
  const march = column('mine', 0, 10);

  it('is at its departure before it left and at its arrival after it landed', () => {
    expect(positionAt(march, -HOUR)).toEqual([0, 0]);
    expect(positionAt(march, 100 * HOUR)).toEqual([10, 0]);
  });

  it('walks its route at an even pace', () => {
    expect(positionAt(march, 5 * HOUR)[0]).toBeCloseTo(5, 6);
    expect(positionAt(march, 2 * HOUR)[0]).toBeCloseTo(2, 6);
  });

  it('crosses the antimeridian the short way', () => {
    const crossing: MarchingForce = {
      id: 'crossing',
      points: [
        [179, 0],
        [-179, 0],
      ],
      departedAt: 0,
      arrivesAt: HOUR,
    };
    expect(distanceKm(positionAt(crossing, HOUR / 2), [180, 0])).toBeLessThan(1);
  });

  it('waits at a transfer and follows the actual time of each medium', () => {
    const combined: MarchingForce = {
      id: 'combined',
      points: [
        [0, 0],
        [10, 0],
      ],
      legs: [
        { medium: 'land', distanceUnits: 5 },
        { medium: 'sea', distanceUnits: 5 },
      ],
      distanceUnits: 10,
      departedAt: 0,
      arrivesAt: HOUR,
    };

    expect(mediumAt(combined, HOUR * 0.1)).toBe('land');
    expect(mediumAt(combined, HOUR * 0.4)).toBeNull();
    expect(positionAt(combined, HOUR * 0.4)[0]).toBeCloseTo(5, 6);
    expect(mediumAt(combined, HOUR * 0.8)).toBe('sea');
  });
});

describe('mobile encounters derive from the order', () => {
  const mobile = (id: string, from: number, to: number, medium: 'land' | 'sea' | 'air') => ({
    ...column(id, from, to),
    legs: [{ medium, distanceUnits: Math.abs(to - from) }],
    distanceUnits: Math.abs(to - from),
  });

  it('lets two observing columns cross without a pass', () => {
    expect(
      firstMobileEncounter({
        a: mobile('a', 0, 10, 'land'),
        b: mobile('b', 10, 0, 'land'),
        rangeA: 100,
        rangeB: 100,
        engagesA: false,
        engagesB: false,
      }),
    ).toBeNull();
  });

  it('gives the initiative to the attacking column that detects the crossing', () => {
    const contact = firstMobileEncounter({
      a: mobile('attack', 0, 10, 'land'),
      b: mobile('march', 10, 0, 'land'),
      rangeA: 100,
      rangeB: 100,
      engagesA: true,
      engagesB: false,
    });

    expect(contact?.initiatorId).toBe('attack');
    expect(contact?.medium).toBe('land');
  });

  it('does not turn detection into fire across incompatible media', () => {
    expect(
      firstMobileEncounter({
        a: mobile('air', 0, 10, 'air'),
        b: mobile('ground', 10, 0, 'land'),
        rangeA: 500,
        rangeB: 500,
        engagesA: true,
        engagesB: true,
      }),
    ).toBeNull();
  });

  it('breaks an equal engagement tie by creation order, never by an identifier', () => {
    const laterNamedFirst = { ...mobile('z-last-name', 0, 10, 'land'), createdAt: 1 };
    const earlierNamedLast = { ...mobile('a-first-name', 10, 0, 'land'), createdAt: 2 };
    const contact = firstMobileEncounter({
      a: laterNamedFirst,
      b: earlierNamedLast,
      rangeA: 100,
      rangeB: 100,
      engagesA: true,
      engagesB: true,
    });

    expect(contact?.initiatorId).toBe('z-last-name');
  });

  it('lets a mobile detector reveal an observing column without engaging it', () => {
    expect(
      mobileSighting({
        observer: mobile('observer', 0, 10, 'land'),
        target: mobile('target', 10, 0, 'land'),
        radiusKm: 100,
      }),
    ).not.toBeNull();
  });
});

/**
 * **What a standing watcher sees pass** (ADR 0019 §5). A window rather than an event: the fog's
 * ledger stores when the thread entered the radius and when it left it
 * (`WWS/docs/technique/brouillard-et-fanout.md`).
 */
describe('what a posted watcher sees pass', () => {
  const march = column('mine', 0, 10);

  it('opens a window while the column is inside the radius and closes it after', () => {
    // One degree of longitude on the equator is some 111 km: only the fifth hour passes within
    // 150 km of a watcher standing on the fifth degree.
    const [seen] = sightingsAlong({
      mine: march,
      watchers: [{ id: 'camp', point: [5, 0], radiusKm: 150 }],
    });

    expect(seen).toBeDefined();
    expect(seen!.id).toBe('camp');
    expect(seen!.from).toBeGreaterThan(3 * HOUR);
    expect(seen!.to).toBeLessThan(7 * HOUR);
    expect(seen!.from).toBeLessThan(seen!.to);
  });

  it('answers nothing for a watcher the column never comes near', () => {
    expect(
      sightingsAlong({
        mine: march,
        watchers: [{ id: 'far', point: [5, 20], radiusKm: 150 }],
      }),
    ).toEqual([]);
  });

  it('gives every watcher a window of its own, and only one each', () => {
    const seen = sightingsAlong({
      mine: march,
      watchers: [
        { id: 'first', point: [2, 0], radiusKm: 150 },
        { id: 'second', point: [8, 0], radiusKm: 150 },
        { id: 'nobody', point: [2, 30], radiusKm: 150 },
      ],
    });

    expect(seen.map((sighting) => sighting.id).sort()).toEqual(['first', 'second']);
    expect(seen.find((sighting) => sighting.id === 'first')!.to).toBeLessThan(
      seen.find((sighting) => sighting.id === 'second')!.from,
    );
  });
});
