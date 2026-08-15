import { describe, expect, it } from 'vitest';
import type { World } from './world';
import {
  COST_BY_MEDIUM,
  TRANSFER_COST,
  buildGrid,
  computeRoute,
} from './routing';

/**
 * A toy world: 100×50 rectangular sphere (identity projection in x, linear latitudes in y),
 * two rectangular islands separated by 10 units of sea.
 */
function toyWorld(): World {
  const outline: Array<readonly [number, number, number, number]> = [];
  for (let latitude = -90; latitude <= 90; latitude++) {
    outline.push([latitude, 0, 100, ((90 - latitude) / 180) * 50]);
  }
  const rectangle = (x1: number, y1: number, x2: number, y2: number) =>
    [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] as const;
  return {
    sphere: { minX: 0, maxX: 100, minY: 0, maxY: 50 },
    outline,
    countries: [
      { name: 'Westland', representativePoint: [20, 25], lonLat: [-108, 0], rings: [rectangle(10, 20, 30, 30)] },
      { name: 'Eastland', representativePoint: [60, 25], lonLat: [36, 0], rings: [rectangle(40, 20, 80, 30)] },
    ],
  };
}

/** lon/lat that project onto (x, y) in the toy world: lon = (x/50 − 1)·180, linear y. */
const toLonLat = (x: number, y: number): [number, number] => [
  (x / 50 - 1) * 180,
  90 - (y / 50) * 180,
];

const grid = buildGrid(toyWorld(), 1);

describe('buildGrid', () => {
  it('classifies land, sea and void', () => {
    const cell = (x: number, y: number) => grid.cells[y * grid.width + x];
    expect(cell(20, 25)).toBe(1);
    expect(cell(35, 25)).toBe(2);
  });
});

describe('land routes', () => {
  it('stays on the same island', () => {
    const route = computeRoute(grid, toLonLat(12, 25), toLonLat(28, 25), 'land');
    expect(route).not.toBeNull();
    expect(route!.legs.every((leg) => leg.medium === 'land')).toBe(true);
  });

  it('never crosses the sea', () => {
    expect(computeRoute(grid, toLonLat(20, 25), toLonLat(60, 25), 'land')).toBeNull();
  });
});

describe('combined routes', () => {
  it('embarks, crosses, lands — two transfers at the advertised price', () => {
    const route = computeRoute(grid, toLonLat(20, 25), toLonLat(60, 25), 'combined');
    expect(route).not.toBeNull();
    const mediums = route!.legs.map((leg) => leg.medium);
    expect(mediums).toEqual(['land', 'sea', 'land']);
    const expected =
      route!.legs[0]!.distanceUnits * COST_BY_MEDIUM.land +
      route!.legs[1]!.distanceUnits * COST_BY_MEDIUM.sea +
      route!.legs[2]!.distanceUnits * COST_BY_MEDIUM.land +
      2 * TRANSFER_COST;
    expect(route!.costUnits).toBeCloseTo(expected, 6);
  });
});

describe('naval routes', () => {
  it('starts from the nearest coast and never touches land', () => {
    const route = computeRoute(grid, toLonLat(31, 25), toLonLat(39, 25), 'naval');
    expect(route).not.toBeNull();
    expect(route!.legs.every((leg) => leg.medium === 'sea')).toBe(true);
  });
});

describe('east-west wrapping', () => {
  it('the sea goes around the world edge when shorter', () => {
    const route = computeRoute(grid, toLonLat(5, 25), toLonLat(95, 25), 'naval');
    expect(route).not.toBeNull();
    // 10 units through the antimeridian versus ~80 through the center (islands block the way).
    expect(route!.distanceUnits).toBeLessThan(30);
  });

  it('air wraps too', () => {
    const direct = computeRoute(grid, toLonLat(5, 25), toLonLat(95, 25), 'air');
    expect(direct).not.toBeNull();
    expect(direct!.distanceUnits).toBeCloseTo(10, 1);
  });
});

describe('on the real world', () => {
  it('engraves the sea gates: Gibraltar stays open', async () => {
    const { readFileSync } = await import('node:fs');
    const raw = JSON.parse(readFileSync('public/world.json', 'utf8')) as {
      meta: { sphere: World['sphere']; outline: World['outline'] };
      countries: Array<{ n: string; c: [number, number]; ll: [number, number]; p: [number, number][][] }>;
    };
    const world: World = {
      sphere: raw.meta.sphere,
      outline: raw.meta.outline,
      countries: raw.countries.map((c) => ({ name: c.n, representativePoint: c.c, lonLat: c.ll, rings: c.p })),
    };
    const worldGrid = buildGrid(world);

    // Marseille → Casablanca by sea: without the Gibraltar gate, no path exists.
    const route = computeRoute(worldGrid, [5.4, 43.3], [-7.6, 33.6], 'naval');
    expect(route).not.toBeNull();
    expect(route!.legs.every((leg) => leg.medium === 'sea')).toBe(true);
    // ~17° of longitude + Atlantic coast: well below a trip around Africa (> 150 units).
    expect(route!.distanceUnits).toBeLessThan(40);

    // Paris → Berlin on foot, without embarking.
    const land = computeRoute(worldGrid, [2.35, 48.85], [13.4, 52.5], 'land');
    expect(land).not.toBeNull();
    expect(land!.legs.every((leg) => leg.medium === 'land')).toBe(true);
  });
});
