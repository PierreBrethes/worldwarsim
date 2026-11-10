import { describe, expect, it } from 'vitest';
import { decodeAtlas, type AtlasFile } from './atlas';
import { LAND_SHARE, LEAST_SITE_SCALE, landSideAt, siteCeiling } from './site-ceiling';

describe('siteCeiling', () => {
  /** The land a footprint of 1 fills to its share exactly. */
  const fitted = 1 / LAND_SHARE;

  it('leaves a site whole on a land it takes no more than its share of', () => {
    expect(siteCeiling(1, fitted)).toBeCloseTo(1, 9);
    expect(siteCeiling(1, 10 * fitted)).toBe(1);
  });

  it('brings a site down to its share of a land too small for it', () => {
    expect(siteCeiling(1, 0.6 * fitted)).toBeCloseTo(0.6, 9);
    expect(siteCeiling(2, 0.6 * fitted)).toBeCloseTo(Math.max(LEAST_SITE_SCALE, 0.3), 9);
  });

  it('caps a wide site lower than a narrow one on the same land', () => {
    expect(siteCeiling(2, fitted)).toBeLessThan(siteCeiling(1.2, fitted));
  });

  it('never brings a site under the size it still reads at, however small its land', () => {
    expect(siteCeiling(1, 0.01 * fitted)).toBe(LEAST_SITE_SCALE);
    expect(siteCeiling(1, 0)).toBe(LEAST_SITE_SCALE);
  });

  it('leaves whole a site whose land is not known', () => {
    expect(siteCeiling(1, null)).toBe(1);
  });
});

/**
 * Two regions of X side by side, A holding a lake, and Y made of a strip C and its islet:
 *
 *   (0,4)───(4,4)───(8,4)
 *     │  A ▫  │   B   │      ▫ the lake, (1,1)–(2,2)      C: (10,0)–(11,1) and (10,2)–(19,3)
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
  [
    [10, 2],
    [19, 2],
    [19, 3],
    [10, 3],
    [10, 2],
  ],
];
const FILE: AtlasFile = {
  type: 'Topology',
  transform: { scale: [1, 1], translate: [0, 0] },
  objects: {
    regions: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', arcs: [[1, 0], [4]], id: 'A', properties: { country: 'X', name: 'Aa' } },
        { type: 'Polygon', arcs: [[2, ~0]], id: 'B', properties: { country: 'X', name: 'Bb' } },
        {
          type: 'MultiPolygon',
          arcs: [[[3]], [[5]]],
          id: 'C',
          properties: { country: 'Y', name: 'Cc' },
        },
      ],
    },
    lakes: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[~4]] }] },
  },
  arcs: ABSOLUTE.map((arc) =>
    arc.map(([x, y], i) => (i === 0 ? [x!, y!] : [x! - arc[i - 1]![0]!, y! - arc[i - 1]![1]!])),
  ),
};

describe('landSideAt', () => {
  const atlas = decodeAtlas(FILE);

  it('is the side of the square as large as the region under the point', () => {
    expect(landSideAt(atlas, [6, 2])).toBeCloseTo(4, 6);
  });

  it('leaves the lake out of the land', () => {
    expect(landSideAt(atlas, [3, 3])).toBeCloseTo(Math.sqrt(15), 6);
  });

  it('reads the piece of the region under the point, not the whole region', () => {
    expect(landSideAt(atlas, [10.5, 0.5])).toBeCloseTo(1, 6);
    expect(landSideAt(atlas, [15, 2.5])).toBeCloseTo(3, 6);
  });

  it('reads the same land wherever the point stands on it, its edge included', () => {
    expect(landSideAt(atlas, [7.99, 0.01])).toBeCloseTo(4, 6);
  });

  it('reads the land beside a point just off its shore: a port stands on the coast', () => {
    expect(landSideAt(atlas, [8.1, 2])).toBeCloseTo(4, 6);
    expect(landSideAt(atlas, [10.5, 1.2])).toBeCloseTo(1, 6);
  });

  it('knows no land under a point out at sea', () => {
    expect(landSideAt(atlas, [9, 2])).toBeNull();
    expect(landSideAt(atlas, [30, 30])).toBeNull();
  });
});
