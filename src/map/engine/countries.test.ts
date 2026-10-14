import { describe, expect, it } from 'vitest';
import { COAST_FLOOR_PX, coastWidthPx, splitOutlines } from './countries';

type Ring = ReadonlyArray<readonly [number, number]>;

describe('splitOutlines', () => {
  const left: Ring = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const right: Ring = [
    [1, 0],
    [2, 0],
    [2, 1],
    [1, 1],
  ];

  it('an edge two countries share is a border, drawn once; the rest is coast', () => {
    const { coast, borders } = splitOutlines([[left], [right]]);
    expect(borders).toEqual([
      [
        [1, 0],
        [1, 1],
      ],
    ]);
    expect(coast).toHaveLength(6);
  });

  it('the cut at the antimeridian, along the edge of the sheet, is no coast', () => {
    const sheet = [
      [-10, 0, 10, 0],
      [10, 0, 10, 1],
    ] as const;
    const { coast, borders } = splitOutlines([[left]], sheet);
    expect(borders).toHaveLength(0);
    expect(coast).toHaveLength(3);
    expect(coast).not.toContainEqual([
      [0, 0],
      [0, 1],
    ]);
  });

  it('a lone island is all coast', () => {
    const { coast, borders } = splitOutlines([[left]]);
    expect(borders).toHaveLength(0);
    expect(coast).toHaveLength(4);
  });
});

describe('coastWidthPx', () => {
  it('keeps its floor from afar', () => {
    expect(coastWidthPx(1)).toBe(COAST_FLOOR_PX);
  });

  it('grows with the zoom like ink on the sheet', () => {
    expect(coastWidthPx(0.001)).toBeGreaterThan(coastWidthPx(0.004));
    expect(coastWidthPx(0.001)).toBeGreaterThan(COAST_FLOOR_PX);
  });
});
