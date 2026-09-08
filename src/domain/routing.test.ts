import { describe, expect, it } from 'vitest';
import type { World } from './world';
import {
  COST_BY_MEDIUM,
  TRANSFER_COST,
  buildGrid,
  coastCellsIn,
  computeRoute,
  countryAt,
  isCoastCell,
  routeMedium,
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
    [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ] as const;
  return {
    sphere: { minX: 0, maxX: 100, minY: 0, maxY: 50 },
    outline,
    countries: [
      {
        name: 'Westland',
        adm0: 'WST',
        representativePoint: [20, 25],
        lonLat: [-108, 0],
        rings: [rectangle(10, 20, 30, 30)],
      },
      {
        name: 'Eastland',
        adm0: 'EST',
        representativePoint: [60, 25],
        lonLat: [36, 0],
        rings: [rectangle(40, 20, 80, 30)],
      },
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

/**
 * The one reading a port is placed against (ADR 0013, revision of 04/09). Westland is a
 * rectangle from x=10 to x=30: x=29 is its eastern shore, x=20 its middle, x=35 open water.
 */
describe('a coast cell', () => {
  it('is land with the sea beside it', () => {
    expect(isCoastCell(grid, toLonLat(29.5, 25.5))).toBe(true);
  });

  it('is not the inland of the same island', () => {
    expect(isCoastCell(grid, toLonLat(20.5, 25.5))).toBe(false);
  });

  it('is not the water off it — a quay stands on the ground', () => {
    expect(isCoastCell(grid, toLonLat(35.5, 25.5))).toBe(false);
  });

  /**
   * The box is a region's, so it is the caller that cuts: what comes back is every shore of the
   * rectangle, and the ones that stand inside the region are sifted by whoever holds the
   * polygons (`MapEngine.setPlacing`).
   */
  it('gathers the shores of a box, and only land ones', () => {
    const cells = coastCellsIn(grid, [8, 18, 32, 32]);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((cell) => isCoastCell(grid, cell.lonLat))).toBe(true);
    expect(cells.some((cell) => Math.round(cell.x) === 20 && Math.round(cell.y) === 25)).toBe(
      false,
    );
  });

  it('finds nothing in a box of open sea', () => {
    expect(coastCellsIn(grid, [32, 22, 38, 28])).toEqual([]);
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

  it('does not move a sea destination to the nearest land', () => {
    expect(computeRoute(grid, toLonLat(20, 25), toLonLat(32, 25), 'land')).toBeNull();
  });
});

/**
 * **Une route combinée finit à la côte** (décision 72a, 04/09) : elle embarque, traverse et pose
 * la colonne sur la plage visée. Le dernier pas sort de l'eau — c'est un débarquement, pas une
 * marche — et il compte dans la jambe de mer ; les deux franchissements de la ligne d'eau se
 * paient tous les deux, l'embarquement comme la mise à terre.
 */
describe('combined routes', () => {
  it('embarks, crosses and lands on the shore aimed at — two transfers, no walk ashore', () => {
    const route = computeRoute(grid, toLonLat(20, 25), toLonLat(40, 25), 'combined');
    expect(route).not.toBeNull();
    expect(route!.legs.map((leg) => leg.medium)).toEqual(['land', 'sea']);
    const expected =
      route!.legs[0]!.distanceUnits * COST_BY_MEDIUM.land +
      route!.legs[1]!.distanceUnits * COST_BY_MEDIUM.sea +
      2 * TRANSFER_COST;
    expect(route!.costUnits).toBeCloseTo(expected, 6);
  });

  /** L'intérieur des terres n'est plus routable pour elle : la grille refuse de contourner le
   *  refus que la visée oppose déjà (`LANDING_NEEDS_A_COAST`). */
  it('leads nowhere inland: the boots do not walk out of the sea', () => {
    expect(computeRoute(grid, toLonLat(20, 25), toLonLat(60, 25), 'combined')).toBeNull();
  });
});

describe('naval routes', () => {
  it('does not move an inland destination to the nearest sea', () => {
    expect(computeRoute(grid, toLonLat(35, 25), toLonLat(60, 25), 'naval')).toBeNull();
  });

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
      countries: Array<{
        n: string;
        a: string;
        c: [number, number];
        ll: [number, number];
        p: [number, number][][];
      }>;
    };
    const world: World = {
      sphere: raw.meta.sphere,
      outline: raw.meta.outline,
      countries: raw.countries.map((c) => ({
        name: c.n,
        adm0: c.a,
        representativePoint: c.c,
        lonLat: c.ll,
        rings: c.p,
      })),
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

/**
 * The one question a lon/lat cannot answer alone, and the reason the rings are on the server at
 * all: a destination owes a rest window to whoever holds the ground it lands on.
 */
describe('the country under a point', () => {
  const realWorld = async (): Promise<World> => {
    const { readFileSync } = await import('node:fs');
    const raw = JSON.parse(readFileSync('public/world.json', 'utf8')) as {
      meta: { sphere: World['sphere']; outline: World['outline'] };
      countries: Array<{
        n: string;
        a: string;
        c: [number, number];
        ll: [number, number];
        p: [number, number][][];
      }>;
    };
    return {
      sphere: raw.meta.sphere,
      outline: raw.meta.outline,
      countries: raw.countries.map((c) => ({
        name: c.n,
        adm0: c.a,
        representativePoint: c.c,
        lonLat: c.ll,
        rings: c.p,
      })),
    };
  };

  it('codes the land, and answers nothing at sea', async () => {
    const world = await realWorld();
    expect(countryAt(world, [25.2, 44.6])).toBe('ROU');
    expect(countryAt(world, [2.35, 48.86])).toBe('FRA');
    expect(countryAt(world, [-30, 40])).toBeNull();
  });
});

/**
 * The medium is read off the legs and never off the mode: a pile carrying a hull routes
 * `combined` even when the road gets there dry, and the card must say what the trip is, not
 * what the pile was allowed to use.
 */
describe('routeMedium', () => {
  it('names the one medium a single-leg route walks', () => {
    expect(routeMedium([{ medium: 'land', distanceUnits: 12 }])).toBe('land');
    expect(routeMedium([{ medium: 'sea', distanceUnits: 12 }])).toBe('sea');
  });

  it('names the crossing when the road and the water are both in it', () => {
    expect(
      routeMedium([
        { medium: 'land', distanceUnits: 3 },
        { medium: 'sea', distanceUnits: 9 },
        { medium: 'land', distanceUnits: 2 },
      ]),
    ).toBe('combined');
  });

  it('flies as soon as a leg is airborne', () => {
    expect(routeMedium([{ medium: 'air', distanceUnits: 40 }])).toBe('air');
  });
});
