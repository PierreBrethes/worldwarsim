import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import projectionAsset from '../../public/projection.json';
import { projectLonLat } from './routing';
import {
  decodeAtlas,
  findCrossings,
  type AtlasFile,
  type AtlasRegion,
  type NearFile,
} from './atlas';

/**
 * Two regions of X side by side, A holding a lake, and an islet C of Y:
 *
 *   (0,4)───(4,4)───(8,4)
 *     │  A ▫  │   B   │      ▫ the lake, (1,1)–(2,2)      C: (10,0)–(11,1)
 *   (0,0)───(4,0)───(8,0)
 */
const ABSOLUTE = [
  [
    [4, 0],
    [4, 4],
  ],
  [
    [4, 4],
    [0, 4],
    [0, 0],
    [4, 0],
  ],
  [
    [4, 0],
    [8, 0],
    [8, 4],
    [4, 4],
  ],
  [
    [10, 0],
    [11, 0],
    [11, 1],
    [10, 1],
    [10, 0],
  ],
  [
    [1, 1],
    [1, 2],
    [2, 2],
    [2, 1],
    [1, 1],
  ],
];
const deltas = (arcs: number[][][]) =>
  arcs.map((arc) =>
    arc.map(([x, y], i) => (i === 0 ? [x!, y!] : [x! - arc[i - 1]![0]!, y! - arc[i - 1]![1]!])),
  );

const FILE: AtlasFile = {
  type: 'Topology',
  transform: { scale: [1, 1], translate: [0, 0] },
  objects: {
    regions: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', arcs: [[1, 0], [4]], id: 'A', properties: { country: 'X', name: 'Aa' } },
        { type: 'Polygon', arcs: [[2, ~0]], id: 'B', properties: { country: 'X', name: 'Bb' } },
        { type: 'MultiPolygon', arcs: [[[3]]], id: 'C', properties: { country: 'Y', name: 'Cc' } },
      ],
    },
    lakes: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[~4]] }] },
  },
  arcs: deltas(ABSOLUTE),
};
/** The near level: the same arcs, A's outer edge with one more point. */
const NEAR = {
  transform: FILE.transform,
  arcs: deltas(ABSOLUTE.map((arc, i) => (i === 1 ? [[4, 4], [2, 4], ...arc.slice(1)] : arc))),
};

const area = (ring: Float32Array) => {
  let sum = 0;
  for (let i = 0, n = ring.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    sum += ring[2 * i]! * ring[2 * j + 1]! - ring[2 * j]! * ring[2 * i + 1]!;
  }
  return Math.abs(sum / 2);
};
const idOf = (region: AtlasRegion | null) => region?.id ?? null;

describe('decodeAtlas', () => {
  const atlas = decodeAtlas(FILE, NEAR);

  it('lists the regions with their country and name', () => {
    expect(atlas.regions).toEqual([
      { id: 'A', country: 'X', name: 'Aa' },
      { id: 'B', country: 'X', name: 'Bb' },
      { id: 'C', country: 'Y', name: 'Cc' },
    ]);
  });

  it('draws a border only where the predicate tells its two sides apart', () => {
    const coast = atlas.borders((left, right) => (left === null) !== (right === null), 'far');
    expect(coast.map(({ left, right }) => [idOf(left), idOf(right)])).toEqual([
      ['A', null],
      ['B', null],
      ['C', null],
      ['A', null],
    ]);
    const regionBorders = atlas.borders(
      (left, right) => !!left && !!right && left !== right,
      'far',
    );
    expect(regionBorders).toHaveLength(1);
  });

  it('tells a lake shore from the sea', () => {
    const shores = atlas.borders((left, right) => (left === null) !== (right === null), 'far');
    expect(shores.map(({ lake }) => lake)).toEqual([false, false, false, true]);
  });

  it('puts the left region on the left hand of the line', () => {
    const [shared] = atlas.borders((left, right) => !!left && !!right, 'far');
    expect([idOf(shared!.left), idOf(shared!.right)]).toEqual(['A', 'B']);
    expect([...shared!.points]).toEqual([4, 0, 4, 4]);
  });

  it('reads the near level only when asked for it', () => {
    const outer = (detail: 'near' | 'far') =>
      atlas.borders((left, right) => left?.id === 'A' && right === null, detail)[0]!.points.length /
      2;
    expect([outer('far'), outer('near')]).toEqual([4, 5]);
  });

  it('merges the regions sharing a key, keeping their holes', () => {
    const byCountry = atlas.shapes((region) => region.country, 'far');
    expect([...byCountry.keys()].sort()).toEqual(['X', 'Y']);
    const [x] = byCountry.get('X')!;
    expect(byCountry.get('X')).toHaveLength(1);
    expect(area(x!.outer)).toBe(32);
    expect(x!.holes.map(area)).toEqual([1]);
    expect(area(byCountry.get('Y')![0]!.outer)).toBe(1);
  });

  it('leaves out the regions whose key is null', () => {
    expect([...atlas.shapes((region) => (region.id === 'B' ? 'b' : null), 'far').keys()]).toEqual([
      'b',
    ]);
  });

  it('finds the region under a point, the sea and the lake holding none', () => {
    const at = (x: number, y: number) => idOf(atlas.regionAt([x, y], 'far'));
    expect([at(0.5, 0.5), at(6, 1), at(10.5, 0.5), at(1.5, 1.5), at(20, 20)]).toEqual([
      'A',
      'B',
      'C',
      null,
      null,
    ]);
  });

  /** Half-open, as the ray crosses an edge: a point on a line belongs to what lies east of it. */
  it('settles a point lying on a border or a coast', () => {
    const at = (x: number, y: number) => idOf(atlas.regionAt([x, y], 'far'));
    expect([at(4, 2), at(0, 2), at(8, 2)]).toEqual(['B', 'A', null]);
  });

  it('refuses the near level when its arcs were not given', () => {
    expect(() => decodeAtlas(FILE).borders(() => true, 'near')).toThrow();
  });

  it('skips a ring that simplification collapsed to a point', () => {
    const collapsed = {
      ...FILE,
      arcs: FILE.arcs.map((arc, i) =>
        i === 3
          ? [
              [10, 0],
              [0, 0],
            ]
          : arc,
      ),
    };
    const atlas = decodeAtlas(collapsed);
    expect(atlas.shapes((region) => region.country, 'far').has('Y')).toBe(false);
    expect(atlas.regionAt([10, 0], 'far')).toBeNull();
  });
});

describe('findCrossings', () => {
  it('passes arcs that only meet at their ends', () => {
    expect(findCrossings(ABSOLUTE)).toEqual([]);
  });

  it('pairs the two segments of a crossing', () => {
    const crossing = [
      [
        [0, 0],
        [4, 4],
        [0, 8],
      ],
      [
        [8, 8],
        [4, 0],
        [0, 4],
      ],
    ];
    expect(findCrossings(crossing)).toEqual([
      [
        [0, 0],
        [1, 1],
      ],
    ]);
  });

  it('counts a point resting on another segment as a crossing', () => {
    const touching = [
      [
        [0, 0],
        [4, 0],
      ],
      [
        [2, 3],
        [2, 0],
      ],
    ];
    expect(findCrossings(touching)).toHaveLength(1);
  });

  it('counts two segments folded on each other from a shared end', () => {
    const folded = [
      [
        [0, 0],
        [4, 0],
      ],
      [
        [0, 0],
        [2, 0],
      ],
    ];
    expect(findCrossings(folded)).toHaveLength(1);
  });
});

describe('public/atlas.json', () => {
  const baked = (name: string) => JSON.parse(readFileSync(`public/${name}`, 'utf8'));
  const file = baked('atlas.json') as AtlasFile;
  const near = baked('atlas-near.json') as NearFile;
  const absolute = (arcs: number[][][]) =>
    arcs.map((arc) => {
      let [x, y] = [0, 0];
      return arc.map(([dx, dy]) => [(x += dx!), (y += dy!)]);
    });

  it('carries the near arcs one for one', () => {
    expect(near.arcs).toHaveLength(file.arcs.length);
  });

  it.each(['far', 'near'] as const)('gives every region a shape at the %s level', (detail) => {
    const shaped = decodeAtlas(file, near).shapes((region) => region.id, detail);
    const shapeless = file.objects.regions.geometries.filter(({ id }) => !shaped.has(id));
    expect(shapeless.map(({ id }) => id)).toEqual([]);
  });

  it('gives each side of an arc to one region at most: no region overlaps another', () => {
    const sides = new Map<number, string>();
    const overlaps: string[] = [];
    for (const geometry of file.objects.regions.geometries)
      for (const ref of geometry.arcs.flat(2)) {
        const other = sides.get(ref);
        if (other !== undefined && other !== geometry.id)
          overlaps.push(`${other} / ${geometry.id}`);
        sides.set(ref, geometry.id);
      }
    expect(overlaps).toEqual([]);
  });

  it.each([
    ['far', file.arcs],
    ['near', near.arcs],
  ])('crosses no arc with another at the %s level, straits and fjords included', (_, arcs) => {
    expect(findCrossings(absolute(arcs))).toEqual([]);
  });

  const sample = ['FRA-2000', 'DEU-1601', 'DEU-DE21', 'DEU-DE22'];

  it('merges a few regions from their own arcs as from the whole atlas', () => {
    const atlas = decodeAtlas(file, near);
    const among = new Set(sample.filter((id) => atlas.regions.some((r) => r.id === id)));
    expect(among.size).toBeGreaterThan(0);
    const key = (region: { id: string }) => (among.has(region.id) ? 'x' : null);
    expect(atlas.shapes(key, 'near', among)).toEqual(atlas.shapes(key, 'near'));
  });

  it('outlines a region with the arcs that have it on one side', () => {
    const atlas = decodeAtlas(file, near);
    for (const { id } of atlas.regions.slice(0, 200)) {
      const outline = atlas.outline(id, 'near').map(({ points }) => points);
      const borders = atlas
        .borders((a, b) => (a?.id === id) !== (b?.id === id), 'near')
        .map(({ points }) => points);
      expect(new Set(outline)).toEqual(new Set(borders));
    }
  });

  /**
   * A gap between two regions would be a hole in the land, a sliver of a few hectares. The
   * land's holes are the great lakes (400 km² and more, ~0.03 u², a few tens of km² for a
   * lake's last fragment once simplified), the Caspian, and the Southern Patagonian Ice Field
   * Chile and Argentina never finished dividing.
   */
  it.each(['far', 'near'] as const)('leaves no gap between regions at the %s level', (detail) => {
    const land = decodeAtlas(file, near)
      .shapes(() => 'land', detail)
      .get('land')!;
    const slivers = land.flatMap(({ holes }) => holes).filter((hole) => area(hole) < 0.0005);
    expect(slivers.map((hole) => [hole[0], hole[1]])).toEqual([]);
  });

  /** The great lakes are water: no region, no deposit, no march across Constance. */
  it.each([
    ['Constance', 9.38, 47.62],
    ['Léman', 6.55, 46.43],
    ['Ladoga', 31.5, 61],
    ['Onega', 35.4, 61.7],
    ['Supérieur', -87.5, 47.7],
    ['Michigan', -87, 43.5],
    ['Huron', -82.5, 44.8],
    ['Érié', -81.3, 42.2],
    ['Ontario', -77.8, 43.6],
    ['Victoria', 33, -1],
    ['Tanganyika', 29.6, -6.2],
    ['Baïkal', 108, 53.3],
  ])('holds no region in lake %s', (_, lon, lat) => {
    const atlas = decodeAtlas(file, near);
    const point = projectLonLat(projectionAsset.outline as never, projectionAsset.sphere, [
      lon,
      lat,
    ]);
    expect([atlas.regionAt(point, 'near'), atlas.regionAt(point, 'far')]).toEqual([null, null]);
  });
});
