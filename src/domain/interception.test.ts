import { describe, expect, it } from 'vitest';
import { distanceKm, type LonLat } from './geo';
import {
  INTERCEPTION_SAMPLES,
  mediumAt,
  mobileSighting,
  positionAt,
  sightingsAlong,
  type MarchingForce,
  type Watcher,
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

/**
 * **Le tri est un raccourci, jamais une autre réponse** (#145). `mobileSighting` et
 * `sightingsAlong` écartent les tronçons de temps que deux boîtes séparent de plus que le rayon ;
 * sur des scènes denses, au ras de l'antiméridien comme du cercle polaire, et sur des routes
 * mixtes, ils rendent exactement ce que rend la marche de chaque échantillon.
 */
describe('the pruned walk answers what the full walk answers', () => {
  const walkedPair = (
    observer: MarchingForce,
    target: MarchingForce,
    radiusKm: number,
    after: number,
  ) => {
    const from = Math.max(after, observer.departedAt, target.departedAt);
    const to = Math.min(observer.arrivesAt, target.arrivesAt);
    if (to < from || radiusKm <= 0) return null;
    let opened: number | null = null;
    let closed: number | null = null;
    for (let index = 0; index <= INTERCEPTION_SAMPLES; index += 1) {
      const at = from + ((to - from) * index) / INTERCEPTION_SAMPLES;
      const medium = mediumAt(observer, at);
      if (medium === null || medium !== mediumAt(target, at)) continue;
      if (distanceKm(positionAt(observer, at), positionAt(target, at)) > radiusKm) continue;
      opened ??= at;
      closed = at;
    }
    return opened === null || closed === null ? null : { from: opened, to: closed };
  };
  const walkedWatchers = (mine: MarchingForce, watchers: ReadonlyArray<Watcher>, after: number) => {
    const startedAt = Math.max(mine.departedAt, after);
    const span = mine.arrivesAt - startedAt;
    if (span <= 0 || watchers.length === 0) return [];
    const windows = new Map<string, { from: number; to: number }>();
    for (let index = 0; index <= INTERCEPTION_SAMPLES; index += 1) {
      const at = startedAt + index * (span / INTERCEPTION_SAMPLES);
      const here = positionAt(mine, at);
      for (const watcher of watchers) {
        if (distanceKm(here, watcher.point) > watcher.radiusKm) continue;
        const window = windows.get(watcher.id);
        if (window === undefined) windows.set(watcher.id, { from: at, to: at });
        else window.to = at;
      }
    }
    return [...windows].map(([id, window]) => ({ id, from: window.from, to: window.to }));
  };

  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const MEDIUMS = ['land', 'sea', 'air'] as const;
  const force = (id: string, center: LonLat, spread: number): MarchingForce => {
    const points: LonLat[] = [];
    let here: LonLat = [
      center[0] + (random() * 2 - 1) * spread,
      center[1] + (random() * 2 - 1) * spread,
    ];
    for (let step = 0, steps = 2 + Math.floor(random() * 10); step < steps; step += 1) {
      points.push([((here[0] + 540) % 360) - 180, Math.max(-85, Math.min(85, here[1]))]);
      here = [here[0] + (random() * 2 - 1) * spread, here[1] + (random() * 2 - 1) * spread];
    }
    /** Mostly one land leg, so that mediums agree often enough for distance to decide. */
    const mixed = random() < 0.3;
    const legs = Array.from({ length: mixed ? 1 + Math.floor(random() * 3) : 1 }, () => ({
      medium: mixed ? MEDIUMS[Math.floor(random() * MEDIUMS.length)]! : ('land' as const),
      distanceUnits: 1 + random() * 5,
    }));
    const departedAt = -random() * 5 * HOUR;
    return {
      id,
      points,
      ...(random() < 0.3
        ? {}
        : { legs, distanceUnits: legs.reduce((sum, leg) => sum + leg.distanceUnits, 0) }),
      ...(random() < 0.5 ? {} : { landCost: 0.6 }),
      departedAt,
      arrivesAt: departedAt + (1 + random() * 20) * HOUR,
    };
  };

  for (const center of [
    [8, 50],
    [179.5, -10],
    [20, 78],
  ] as const) {
    it(`agrees on every pair and every watcher around ${String(center)}`, () => {
      const forces = Array.from({ length: 40 }, (_, k) => force(`f${String(k)}`, center, 1.5));
      const watchers: Watcher[] = Array.from({ length: 60 }, (_, k) => ({
        id: `w${String(k)}`,
        point: [
          ((center[0] + (random() * 2 - 1) * 4 + 540) % 360) - 180,
          center[1] + (random() * 2 - 1) * 4,
        ],
        radiusKm: 10 + random() * 200,
      }));
      let seen = 0;
      let missed = 0;
      for (const observer of forces) {
        const after = -random() * 2 * HOUR;
        expect(sightingsAlong({ mine: observer, watchers, after })).toEqual(
          walkedWatchers(observer, watchers, after),
        );
        for (const target of forces) {
          if (target === observer) continue;
          const radiusKm = 10 + random() * 150;
          const expected = walkedPair(observer, target, radiusKm, after);
          expect(mobileSighting({ observer, target, radiusKm, after })).toEqual(expected);
          /** The detection pass serves one window to both columns when their radii agree. */
          expect(walkedPair(target, observer, radiusKm, after)).toEqual(expected);
          if (expected === null) missed += 1;
          else seen += 1;
        }
      }
      expect(seen).toBeGreaterThan(50);
      expect(missed).toBeGreaterThan(50);
    });
  }
});
