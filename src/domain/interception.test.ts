import { describe, expect, it } from 'vitest';
import { distanceKm, type LonLat } from './geo';
import { firstInterception, positionAt, sightingsAlong, type MarchingForce } from './interception';

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
});

describe('the first contact on the road', () => {
  it('is the garrison whose radius the column walks into', () => {
    const contact = firstInterception({
      mine: column('mine', 0, 10),
      standing: [{ id: 'outpost:far', point: [9, 0] }],
      marching: [],
      radiusKm: 200,
    });

    expect(contact).not.toBeNull();
    expect(contact!.withId).toBe('outpost:far');
    // Two hundred kilometres short of the point, so a bit before the eighth degree.
    expect(contact!.point[0]).toBeGreaterThan(6.5);
    expect(contact!.point[0]).toBeLessThan(9);
  });

  it('ignores a garrison the road never comes near', () => {
    expect(
      firstInterception({
        mine: column('mine', 0, 10),
        standing: [{ id: 'outpost:aside', point: [5, 40] }],
        marching: [],
        radiusKm: 200,
      }),
    ).toBeNull();
  });

  it('catches a column coming the other way, at the hour they cross', () => {
    const contact = firstInterception({
      mine: column('mine', 0, 10),
      standing: [],
      marching: [column('movement:theirs', 10, 0)],
      radiusKm: 200,
    });

    expect(contact).not.toBeNull();
    expect(contact!.withId).toBe('movement:theirs');
    expect(contact!.at / HOUR).toBeGreaterThan(3);
    expect(contact!.at / HOUR).toBeLessThan(7);
  });

  it('lets a column pass behind one that has already gone by', () => {
    // They walk the same road in the same direction, six hours apart: nobody ever catches up.
    expect(
      firstInterception({
        mine: column('mine', 0, 10, 6 * HOUR),
        standing: [],
        marching: [column('movement:ahead', 0, 10)],
        radiusKm: 200,
      }),
    ).toBeNull();
  });

  it('keeps the earliest of two contacts', () => {
    const contact = firstInterception({
      mine: column('mine', 0, 10),
      standing: [
        { id: 'outpost:late', point: [9, 0] },
        { id: 'outpost:early', point: [3, 0] },
      ],
      marching: [],
      radiusKm: 200,
    });

    expect(contact!.withId).toBe('outpost:early');
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
