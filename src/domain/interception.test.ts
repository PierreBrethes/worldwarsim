import { describe, expect, it } from 'vitest';
import { distanceKm, type LonLat } from './geo';
import {
  INTERCEPTION_SAMPLES,
  lineCrossingOf,
  mediumAt,
  mobileSighting,
  passesAlong,
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

/**
 * **La reprise** (ADR 0037 §6, décision du 02/11) : entrée dans la vigie d'un Fort, la colonne
 * repart de là où elle est vers sa nouvelle arrivée, plus lente sur tout le reste du trajet. Le
 * pion ne recule jamais : avant l'entrée il marche à l'allure du départ, après à la nouvelle.
 */
describe('a column resumed at a Fort', () => {
  /** Partie à 0 pour 10 h, retenue à 4 h, et arrivée repoussée à 16 h. */
  const resumed: MarchingForce = {
    ...column('held', 0, 10),
    arrivesAt: 16 * HOUR,
    resumed: { at: 4 * HOUR, share: 0.4 },
  };

  it('walks the stretch before the entry at the pace of its departure', () => {
    expect(positionAt(resumed, 2 * HOUR)[0]).toBeCloseTo(2, 6);
    expect(positionAt(resumed, 4 * HOUR)[0]).toBeCloseTo(4, 6);
  });

  it('walks the rest of its road from the entry to its new arrival, slower', () => {
    expect(positionAt(resumed, 10 * HOUR)[0]).toBeCloseTo(7, 6);
    expect(positionAt(resumed, 16 * HOUR)[0]).toBeCloseTo(10, 6);
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

  /** **Un passage par entrée dans le cercle** (#373) : la sortie entre deux ne se voit pas. */
  it('gives one pass per entry into the radius, and the window the hull of them', () => {
    const outAndBack: MarchingForce = {
      id: 'loop',
      points: [
        ...Array.from({ length: 11 }, (_, step) => [step, 0] as LonLat),
        ...Array.from({ length: 10 }, (_, step) => [9 - step, 0] as LonLat),
      ],
      departedAt: 0,
      arrivesAt: 20 * HOUR,
    };
    const watchers = [{ id: 'camp', point: [7, 0] as LonLat, radiusKm: 150 }];
    const passes = passesAlong({ mine: outAndBack, watchers });
    expect(passes).toHaveLength(2);
    expect(passes[0]!.to).toBeLessThan(10 * HOUR);
    expect(passes[1]!.from).toBeGreaterThan(10 * HOUR);
    expect(sightingsAlong({ mine: outAndBack, watchers })).toEqual([
      { id: 'camp', from: passes[0]!.from, to: passes[1]!.to },
    ]);
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
    const from = Math.max(observer.departedAt, target.departedAt);
    const to = Math.min(observer.arrivesAt, target.arrivesAt);
    if (to < from || radiusKm <= 0) return null;
    let opened: number | null = null;
    let closed: number | null = null;
    for (let index = 0; index <= INTERCEPTION_SAMPLES; index += 1) {
      const at = from + ((to - from) * index) / INTERCEPTION_SAMPLES;
      if (at < after) continue;
      const medium = mediumAt(observer, at);
      if (medium === null || medium !== mediumAt(target, at)) continue;
      if (distanceKm(positionAt(observer, at), positionAt(target, at)) > radiusKm) continue;
      opened ??= at;
      closed = at;
    }
    return opened === null || closed === null ? null : { from: opened, to: closed };
  };
  const walkedWatchers = (mine: MarchingForce, watchers: ReadonlyArray<Watcher>, after: number) => {
    const span = mine.arrivesAt - mine.departedAt;
    if (span <= 0 || watchers.length === 0) return [];
    const windows = new Map<string, { from: number; to: number }>();
    for (let index = 0; index <= INTERCEPTION_SAMPLES; index += 1) {
      const at = mine.departedAt + index * (span / INTERCEPTION_SAMPLES);
      if (at < after) continue;
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
          /** Read again later, the same window, cut at the later instant — never a moved one. */
          const later = after + random() * HOUR;
          const reread = mobileSighting({ observer, target, radiusKm, after: later });
          if (expected === null || expected.to < later) expect(reread).toBeNull();
          else if (expected.from >= later) expect(reread).toEqual(expected);
          else expect(reread?.to).toBe(expected.to);
          if (expected === null) missed += 1;
          else seen += 1;
        }
      }
      expect(seen).toBeGreaterThan(50);
      expect(missed).toBeGreaterThan(50);
    });
  }
});

/** **La ligne de guet** (ADR 0037 §10, #377) : le premier franchissement d'un segment, à l'heure
 *  d'un échantillon de la grille du trajet, jamais affinée. */
describe('a column crossing a watch line', () => {
  const march = column('mine', 0, 10);
  const sampleAt = (index: number) => (10 * HOUR * index) / INTERCEPTION_SAMPLES;

  it('is caught at the first sample past the line, where the line stands', () => {
    const crossing = lineCrossingOf(march, [[5.1, -1], [5.1, 1]], 0);
    /** 24 samples a degree: 5.1° falls between samples 122 and 123. */
    expect(crossing?.at).toBe(sampleAt(123));
    expect(crossing?.point[0]).toBeCloseTo(5.1, 9);
    expect(crossing?.point[1]).toBeCloseTo(0, 9);
  });

  it('is not caught past either end of the line, nor by a line it never reaches', () => {
    expect(lineCrossingOf(march, [[5.1, 0.5], [5.1, 2]], 0)).toBeNull();
    expect(lineCrossingOf(march, [[12, -1], [12, 1]], 0)).toBeNull();
    expect(lineCrossingOf(march, [[0, 1], [10, 1]], 0)).toBeNull();
  });

  it('keeps its hour when read again before it, and forgets a crossing already past', () => {
    expect(lineCrossingOf(march, [[5.1, -1], [5.1, 1]], sampleAt(122) + 1)?.at).toBe(sampleAt(123));
    expect(lineCrossingOf(march, [[5.1, -1], [5.1, 1]], sampleAt(123) + 1)).toBeNull();
  });

  it('answers only the first crossing still ahead', () => {
    const outAndBack: MarchingForce = {
      id: 'loop',
      points: [
        [0, 0],
        [10, 0],
        [0, 0],
      ],
      departedAt: 0,
      arrivesAt: 20 * HOUR,
    };
    const line: [LonLat, LonLat] = [[5.1, -1], [5.1, 1]];
    const first = lineCrossingOf(outAndBack, line, 0)!;
    const second = lineCrossingOf(outAndBack, line, first.at + 1)!;
    expect(first.at).toBeLessThan(10 * HOUR);
    expect(second.at).toBeGreaterThan(10 * HOUR);
    expect(second.point[0]).toBeCloseTo(5.1, 9);
  });

  it('answers what a walk of every sample answers, on random scenes', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let caught = 0;
    for (let scene = 0; scene < 200; scene += 1) {
      const force: MarchingForce = {
        id: `f${scene}`,
        points: Array.from({ length: 2 + Math.floor(random() * 6) }, () => [
          random() * 40 - 20,
          random() * 40 - 20,
        ]) as ReadonlyArray<LonLat>,
        departedAt: 0,
        arrivesAt: 10 * HOUR,
      };
      const a: LonLat = [random() * 40 - 20, random() * 40 - 20];
      const line: [LonLat, LonLat] = [a, [a[0] + random() * 10 - 5, a[1] + random() * 10 - 5]];
      const after = random() * 5 * HOUR;
      const expected = walkedCrossing(force, line, after);
      const crossing = lineCrossingOf(force, line, after);
      expect(crossing?.at).toBe(expected?.at);
      if (expected === null) continue;
      caught += 1;
      expect(crossing!.point[0]).toBeCloseTo(expected.point[0], 9);
      expect(crossing!.point[1]).toBeCloseTo(expected.point[1], 9);
    }
    expect(caught).toBeGreaterThan(20);
  });
});

/** Every pair of samples, in order, with no box: the reference the pruned walk must match. */
function walkedCrossing(force: MarchingForce, [a, b]: [LonLat, LonLat], after: number) {
  const side = (p: LonLat, q: LonLat, r: LonLat) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const sampleAt = (index: number) =>
    force.departedAt + ((force.arrivesAt - force.departedAt) * index) / INTERCEPTION_SAMPLES;
  for (let index = 1; index <= INTERCEPTION_SAMPLES; index += 1) {
    const at = sampleAt(index);
    if (at < after) continue;
    const p = positionAt(force, sampleAt(index - 1));
    const q = positionAt(force, at);
    if (side(a, b, p) >= 0 === side(a, b, q) >= 0) continue;
    if (side(p, q, a) * side(p, q, b) > 0) continue;
    const t = side(a, b, p) / (side(a, b, p) - side(a, b, q));
    return { at, point: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t] as LonLat };
  }
  return null;
}
