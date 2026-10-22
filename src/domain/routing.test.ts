import { describe, expect, it } from 'vitest';
import { decodeAtlas } from './atlas';
import { atlasWorld } from './atlas-world';
import type { Projection, World } from './world';
import { bearingDegrees, distanceKm, type LonLat } from './geo';
import gridAsset from '../../public/grid.json';
import projectionAsset from '../../public/projection.json';
import { refusalOf, type Column, type MovementAim } from './movement-orders';
import {
  COST_BY_MEDIUM,
  TRANSFER_COST,
  SEA_GATES,
  buildGrid,
  coastCellsIn,
  computeRoute,
  decodeGrid,
  type GridWorld,
  type RouteMode,
  groundAt,
  mooringOf,
  isCoastCell,
  isLandCell,
  isWalkableCell,
  landComponentCount,
  landMaskOf,
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

describe('landMaskOf', () => {
  it('marks every land cell 1 and every other cell 0', () => {
    const mask = landMaskOf(grid);
    const cell = (x: number, y: number) => mask[y * grid.width + x];
    for (let y = 0; y < grid.height; y += 7) {
      for (let x = 0; x < grid.width; x += 7) {
        const lonLat = [
          (((x + 0.5) * grid.step) / 100) * 360 - 180,
          90 - (((y + 0.5) * grid.step) / 50) * 180,
        ] as const;
        expect(cell(x, y)).toBe(isLandCell(grid, lonLat) ? 1 : 0);
      }
    }
    expect(mask.includes(1)).toBe(true);
    expect(mask.includes(0)).toBe(true);
  });
});

/** Le monde cuit, tel que le serveur le lit : l'atlas (ADR 0034), ce que le jouet ne peut pas
 *  dire — un isthme. */
const realWorld = async () => {
  const { readFileSync } = await import('node:fs');
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
  return atlasWorld(
    decodeAtlas(read('public/atlas.json'), read('public/atlas-near.json')),
    read('public/projection.json'),
  );
};

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

  /** A lake is water a hull cannot sail away on: no quay on its shore, Constance's included. */
  it('is not the shore of a lake', () => {
    const world = toyWorld();
    const lake = [
      [15, 23],
      [20, 23],
      [20, 27],
      [15, 27],
    ] as const;
    const westland = world.countries[0]!;
    const withLake = buildGrid(
      { ...world, countries: [{ ...westland, rings: [...westland.rings, lake] }] },
      1,
    );
    expect(withLake.cells[25 * withLake.width + 17]).toBe(2);
    expect(isCoastCell(withLake, toLonLat(14.5, 25.5))).toBe(false);
    expect(coastCellsIn(withLake, [12, 23, 23, 26])).toEqual([]);
  });

  /** A quay the atlas puts on a lake the grid draws: the hull has no route into it, so it
   *  moors at the nearest open water instead (#221). */
  it('moors a hull bound for a lake quay at open water, never in the lake', () => {
    const world = toyWorld();
    const lake = [
      [15, 23],
      [20, 23],
      [20, 27],
      [15, 27],
    ] as const;
    const westland = world.countries[0]!;
    const withLake = buildGrid(
      { ...world, countries: [{ ...westland, rings: [...westland.rings, lake] }] },
      1,
    );
    const quay = toLonLat(17.5, 25.5);
    const moored = mooringOf(withLake, quay);
    expect(moored).not.toBeNull();
    expect(moored).not.toEqual(quay);
    expect(isCoastCell(withLake, moored!) || groundAt(withLake, moored!) === 'sea').toBe(true);
    expect(mooringOf(withLake, toLonLat(29.5, 25.5))).toEqual(toLonLat(29.5, 25.5));
  });

  /** A lagoon on the shore, cut out of the land as the atlas cuts it, would join the sea at this
   *  mesh: its cells are lake, never sea. */
  it('is not the shore of a lake that touches the sea', () => {
    const lagoon = [
      [10, 22],
      [15, 22],
      [15, 28],
      [10, 28],
    ] as const;
    const world = toyWorld();
    const westland = world.countries[0]!;
    const withLagoon = buildGrid(
      {
        ...world,
        countries: [{ ...westland, rings: [...westland.rings, lagoon] }],
        lakes: [lagoon],
      },
      1,
    );
    expect(isLandCell(withLagoon, toLonLat(12.5, 25.5))).toBe(false);
    expect(isCoastCell(withLagoon, toLonLat(15.5, 25.5))).toBe(false);
    expect(computeRoute(withLagoon, toLonLat(5.5, 25.5), toLonLat(12.5, 25.5), 'naval')).toBeNull();
  });

  /** **Une règle, une fonction** (ADR 0015) : la visée et le serveur lisent le même sol, et la
   *  règle partagée refuse le lac avant la route qui n'existe pas. */
  it('reads a lake as a lake, so the order is refused before any route is sought', () => {
    const lagoon = [
      [10, 22],
      [15, 22],
      [15, 28],
      [10, 28],
    ] as const;
    const world = toyWorld();
    const westland = world.countries[0]!;
    const withLagoon = buildGrid(
      {
        ...world,
        countries: [{ ...westland, rings: [...westland.rings, lagoon] }],
        lakes: [lagoon],
      },
      1,
    );
    const [lon, lat] = toLonLat(12.5, 25.5);
    expect(groundAt(withLagoon, toLonLat(5.5, 25.5))).toBe('sea');
    expect(groundAt(withLagoon, toLonLat(20.5, 25.5))).toBe('land');
    const ground = groundAt(withLagoon, [lon, lat]);
    expect(ground).toBe('lake');
    const fleet: Column = {
      roles: ['cargo'],
      myRegionIds: new Set(),
      myOutpostIds: new Set(),
      departureBuildings: new Set(['port']),
      afloat: true,
      coastal: false,
    };
    const aim: MovementAim = { kind: 'point', lon, lat, ground, coastal: false, surveyed: false };
    expect(refusalOf('march', aim, fleet)).toBe('LAKE_TARGET');
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
    expect(cells.every((cell) => isCoastCell(grid, cell))).toBe(true);
    const inland = toLonLat(20.5, 25.5);
    expect(cells.some((cell) => Math.hypot(cell[0] - inland[0], cell[1] - inland[1]) < 1e-6)).toBe(
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
  /** Murmansk's point falls in a fjord narrower than a cell: the ship leaves from the open sea. */
  it('sails from Murmansk, whose nearest water is cut off from the sea', async () => {
    const route = computeRoute(buildGrid(await realWorld()), [33.0, 69.05], [-1.1, 50.8], 'naval');
    expect(route).not.toBeNull();
    // 45.32 on the staircase; the pulled thread (#231) is shorter, never longer.
    expect(route!.costUnits).toBeGreaterThan(44.03 * 0.99);
    expect(route!.costUnits).toBeLessThan(44.03 * 1.01);
  });

  it('engraves the sea gates: Gibraltar stays open', async () => {
    const world = await realWorld();
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
 * **Un canal est de l'eau et un gué.** Gravé en `SEA` comme un détroit, Panama coupait l'Amérique
 * du Nord de l'Amérique du Sud et Suez l'Afrique de l'Asie — une compagnie d'infanterie ne
 * passait plus du Panama à la Colombie, et la géométrie tranchait dans le sens exactement
 * inverse de celui que les portes maritimes promettaient. Les navires transitent, les colonnes
 * franchissent : ferries et ponts tournants existaient aux deux en 1940.
 */
describe('les canaux gravés', () => {
  let worldGrid: ReturnType<typeof buildGrid> | null = null;
  const gridOf = async () => {
    if (worldGrid === null) worldGrid = buildGrid(await realWorld());
    return worldGrid;
  };

  it('laisse une colonne franchir l’isthme de Panama', async () => {
    const route = computeRoute(await gridOf(), [-99.13, 19.43], [-74.07, 4.71], 'land');
    expect(route).not.toBeNull();
    expect(route!.legs.every((leg) => leg.medium === 'land')).toBe(true);
    // Par l'isthme, et non par un détour que le raster inventerait ailleurs.
    expect(route!.points.some(([lon, lat]) => lon > -81 && lon < -77 && lat > 7 && lat < 10)).toBe(
      true,
    );
  });

  it('laisse une colonne franchir l’isthme de Suez', async () => {
    const route = computeRoute(await gridOf(), [31.24, 30.04], [35.22, 31.78], 'land');
    expect(route).not.toBeNull();
    expect(route!.legs.every((leg) => leg.medium === 'land')).toBe(true);
  });

  /** L'Atlantique rejoint le Pacifique sans le cap Horn, qui vaut plus de cent cinquante unités. */
  it('fait transiter un navire de Colón à Balboa', async () => {
    const route = computeRoute(await gridOf(), [-79.9, 9.36], [-79.55, 8.95], 'naval');
    expect(route).not.toBeNull();
    expect(route!.legs.every((leg) => leg.medium === 'sea')).toBe(true);
    expect(route!.distanceUnits).toBeLessThan(5);
  });

  /** Et la Méditerranée la mer Rouge, sans doubler le Cap. */
  it('fait transiter un navire de Port-Saïd à Suez', async () => {
    const route = computeRoute(await gridOf(), [32.3, 31.26], [32.55, 29.97], 'naval');
    expect(route).not.toBeNull();
    expect(route!.legs.every((leg) => leg.medium === 'sea')).toBe(true);
    expect(route!.distanceUnits).toBeLessThan(5);
  });

  /** Un détroit naturel reste de la mer : c'est toute la différence entre les deux gravures. */
  it('ne laisse aucune colonne traverser la Manche ni Gibraltar', async () => {
    const grid = await gridOf();
    expect(computeRoute(grid, [1.31, 51.13], [1.85, 50.95], 'land')).toBeNull();
    expect(computeRoute(grid, [-5.6, 36.02], [-5.8, 35.78], 'land')).toBeNull();
  });

  /**
   * Le point choisi ne touche **que** le canal — aucune cellule de mer ne le borde — donc il ne
   * serait pas côtier si la berge d'un canal ne l'était pas. Colón, Balboa, Port-Saïd et Suez
   * sont des ports.
   */
  it('fait de la berge d’un canal une côte, et pas du milieu du Kansas', async () => {
    const grid = await gridOf();
    expect(isCoastCell(grid, [-79.176, 9.236])).toBe(true);
    expect(isCoastCell(grid, [-98.5, 38.5])).toBe(false);
  });
});

/**
 * **Une porte maritime ne découpe jamais une poche de terre.** Un détroit ajoute de l'eau là où
 * il y en a : il ne peut donc pas séparer deux terres qui se touchaient, et un canal, qu'on
 * franchit, ne le peut pas davantage si on le lit comme de la terre. C'est l'invariant, et c'est
 * la seule chose qui aurait pris Malacca — sa polyligne courait dans le Perak et le Pahang, sa
 * gravure détachait Kuala Lumpur de la péninsule, et aucun des trajets nommés ne passait par là.
 * Les portes se relisent une par une pour que l'échec dise laquelle.
 */
describe('les portes maritimes', () => {
  let world: GridWorld | null = null;
  const worldOf = async () => (world ??= await realWorld());

  it('laisse à la terre exactement les morceaux qu’elle avait', async () => {
    const bare = landComponentCount(buildGrid(await worldOf(), 0.25, []));
    for (const gate of SEA_GATES) {
      const engraved = buildGrid(await worldOf(), 0.25, [gate]);
      expect(
        landComponentCount(engraved, gate.kind === 'canal'),
        `la porte « ${gate.name} » découpe une poche de terre : sa polyligne passe dans les terres, ou le chenal est trop étroit pour le pinceau de trois cellules d'engravePassage.`,
      ).toBe(bare);
    }
    expect(landComponentCount(buildGrid(await worldOf()), true)).toBe(bare);
  }, 120000);

  /** Kuala Lumpur, la poche qu'on avait détachée, se rejoint à pied depuis Bangkok. */
  it('laisse une colonne descendre la péninsule malaise', async () => {
    const route = computeRoute(buildGrid(await worldOf()), [100.5, 13.75], [101.7, 3.14], 'land');
    expect(route).not.toBeNull();
    expect(route!.legs.every((leg) => leg.medium === 'land')).toBe(true);
  }, 120000);

  /**
   * Et le chenal reste navigable sans qu'on le grave : au pas de cette grille il fait quatre à
   * douze cellules d'eau. Contourner Sumatra passerait par la Sonde, six degrés au sud.
   */
  it('laisse un navire aller de Penang à Singapour par le détroit', async () => {
    const route = computeRoute(buildGrid(await worldOf()), [100.33, 5.41], [103.85, 1.29], 'naval');
    expect(route).not.toBeNull();
    expect(route!.legs.every((leg) => leg.medium === 'sea')).toBe(true);
    expect(Math.min(...route!.points.map(([, lat]) => lat))).toBeGreaterThan(0);
  }, 120000);
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

/**
 * **Un trajet va droit tant que rien ne le dévie** (#231). Le Dijkstra à huit voisins ne tourne
 * que par multiples de 45° ; le fil tiré sur son chemin, dans les mêmes milieux, ne garde que les
 * coudes que la côte impose.
 */
describe('the pulled thread', () => {
  const baked = decodeGrid(gridAsset, projectionAsset as unknown as Projection);

  /** The vertices where the thread turns by more than a few degrees, ends included. */
  const usefulVertices = (points: ReadonlyArray<LonLat>): number => {
    let turns = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const before = bearingDegrees(points[i - 1]!, points[i]!);
      const after = bearingDegrees(points[i]!, points[i + 1]!);
      const turn = Math.abs(((after - before + 540) % 360) - 180);
      if (turn > 3) turns++;
    }
    return turns + 2;
  };

  /** Two lands touching by a corner are a strait at this mesh, the Gulf of Suez among them: a
   *  hull goes through. Shutting such corners sent Alexandria round the Cape to Aden (#231). */
  it('sails a strait whose banks touch by a corner: Alexandria to Aden by Suez', () => {
    const route = computeRoute(baked, [29.8, 31.3], [45.2, 12.6], 'naval');
    expect(route).not.toBeNull();
    // By Suez about thirty units; round the Cape more than two hundred.
    expect(route!.distanceUnits).toBeLessThan(40);
  });

  it('goes straight from Paris to Berlin', () => {
    const route = computeRoute(baked, [2.35, 48.85], [13.4, 52.5], 'land');
    expect(route).not.toBeNull();
    expect(usefulVertices(route!.points)).toBe(2);
  });

  /** Every segment as the server reads it, linear in lon/lat (`positionAt`), stays on its medium. */
  it('never leaves its medium between two stored points', () => {
    const named: Array<[RouteMode, LonLat, LonLat]> = [
      ['naval', [-4.6, 48.3], [5.3, 43.2]],
      ['naval', [4, 55], [18, 55.5]],
      ['naval', [29.8, 31.3], [45.2, 12.6]],
      ['naval', [12.6, 45.2], [8.8, 44.3]],
      ['naval', [-1.6, 45.0], [4.0, 52.0]],
      ['naval', [72.6, 18.9], [104.0, 1.2]],
      ['naval', [140.0, 35.0], [122.5, 31.0]],
      ['naval', [-123.0, 37.6], [-73.5, 40.4]],
      ['naval', [-9.6, 38.6], [-43.0, -23.1]],
      ['naval', [140.2, 35.0], [-118.6, 33.6]],
      ['land', [12.5, 41.9], [23.7, 38.0]],
      ['land', [13.4, 52.5], [18.1, 59.3]],
      ['land', [49.9, 40.4], [58.4, 38.0]],
      ['land', [2.35, 48.85], [-3.7, 40.4]],
      ['land', [2.35, 48.85], [13.4, 52.5]],
      ['land', [3.4, 6.5], [36.8, -1.3]],
      ['land', [131.9, 43.1], [116.4, 39.9]],
      ['land', [31.2, 30.0], [44.4, 33.3]],
      ['land', [10.2, 36.8], [31.2, 30.0]],
    ];
    const strays: string[] = [];
    for (const [mode, from, to] of named) {
      const route = computeRoute(baked, from, to, mode);
      expect(route).not.toBeNull();
      const onCell = (point: LonLat) =>
        mode === 'land' ? isWalkableCell(baked, point) : groundAt(baked, point) === 'sea';
      /** A segment through a cell's exact corner grazes its neighbour by a sliver: two kilometres
       *  of tolerance, a fifteenth of a cell, against the hundreds a lon/lat chord strays by. */
      const onMedium = ([lon, lat]: LonLat) =>
        [
          [0, 0],
          [0.02, 0],
          [-0.02, 0],
          [0, 0.02],
          [0, -0.02],
        ].some(([dLon, dLat]) => onCell([lon + dLon!, lat + dLat!]));
      route!.points.forEach((a, index) => {
        const b = route!.points[index + 1];
        if (b === undefined || Math.abs(b[0] - a[0]) > 180) return;
        const samples = Math.ceil((distanceKm(a, b) / 28) * 8) + 1;
        for (let s = 1; s < samples; s++) {
          const t = s / samples;
          const point: LonLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          if (!onMedium(point)) {
            strays.push(`${mode} ${from} → ${to} at ${point}`);
            return;
          }
        }
      });
    }
    expect(strays).toEqual([]);
  });
});
