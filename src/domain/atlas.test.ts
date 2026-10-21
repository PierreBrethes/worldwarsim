import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeAtlas, findCrossings, type AtlasFile, type AtlasRegion } from './atlas';

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
  },
  arcs: deltas(ABSOLUTE),
};
/** The near level: the same arcs, A's outer edge with one more point. */
const NEAR = deltas(ABSOLUTE.map((arc, i) => (i === 1 ? [[4, 4], [2, 4], ...arc.slice(1)] : arc)));

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

  it('names both segments of a crossing', () => {
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
      [0, 0],
      [1, 1],
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
    expect(findCrossings(touching)).toHaveLength(2);
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
    expect(findCrossings(folded)).toHaveLength(2);
  });
});

describe('public/atlas.json', () => {
  const baked = (name: string) => JSON.parse(readFileSync(`public/${name}`, 'utf8'));
  const file = baked('atlas.json') as AtlasFile;
  const nearArcs = baked('atlas-near.json') as number[][][];
  const absolute = (arcs: number[][][]) =>
    arcs.map((arc) => {
      let [x, y] = [0, 0];
      return arc.map(([dx, dy]) => [(x += dx!), (y += dy!)]);
    });

  it('carries the near arcs one for one', () => {
    expect(nearArcs).toHaveLength(file.arcs.length);
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
    ['near', nearArcs],
  ])('crosses no arc with another at the %s level, straits and fjords included', (_, arcs) => {
    expect(findCrossings(absolute(arcs))).toEqual([]);
  });

  /**
   * A gap between two regions would be a hole in the land. There are two, and both are in
   * Natural Earth: the Caspian, and the Southern Patagonian Ice Field Chile and Argentina
   * never finished dividing.
   */
  it('leaves no gap between regions', () => {
    const land = decodeAtlas(file, nearArcs)
      .shapes(() => 'land', 'near')
      .get('land')!;
    const holes = land.flatMap(({ holes }) => holes).map((hole) => area(hole));
    expect(holes.sort((a, b) => a - b)).toEqual([expect.closeTo(0.21, 2), expect.closeTo(55.9, 1)]);
  });
});
