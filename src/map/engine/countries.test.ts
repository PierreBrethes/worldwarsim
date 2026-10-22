import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeAtlas } from '@/domain/atlas';
import type { World } from '@/domain/world';
import projection from '../../../public/projection.json';
import {
  COAST_FLOOR_PX,
  COUNTRY_BORDER_MAX,
  COUNTRY_BORDER_REST,
  coastLines,
  coastWidthPx,
  levelAt,
} from './countries';
import { FULL_OPACITY } from './regions';
import { WorldFrame } from './frame';

describe('the coast', () => {
  const read = (name: string) => JSON.parse(readFileSync(`public/${name}`, 'utf8'));
  const atlas = decodeAtlas(read('atlas.json'), read('atlas-near.json'));
  const frame = new WorldFrame({ ...projection, countries: [] } as unknown as World);
  const offEdge = (x: number, y: number) => {
    const { westX, eastX } = frame.edgeAtLatitude(frame.lonLatAt(x, y)[1]);
    return Math.min(Math.abs(x - westX), Math.abs(x - eastX));
  };

  const segmentsOf = (lines: { points: Float32Array }[]) =>
    lines.flatMap(({ points }) =>
      Array.from({ length: points.length / 2 - 1 }, (_, i) => points.slice(2 * i, 2 * i + 4)),
    );
  const onSeam = ([ax, ay, bx, by]: Float32Array) =>
    Math.max(offEdge(ax!, ay!), offEdge(bx!, by!)) < 0.01;
  const nearEdge = ([ax, ay]: Float32Array) => offEdge(ax!, ay!) < 0.5;
  /** Fiji lies south of the equator, Chukotka north: the sheet's middle is y = 104. */
  const SHORES = [
    ['Chukotka', (y: number) => y < 104],
    ['Fiji', (y: number) => y > 104],
  ] as const;

  /** Chukotka and Fiji are cut at the antimeridian (ADR 0034): the cut has the sea on neither
   *  side, only the sheet's edge, and the boldest ink would underline the edge. */
  describe.each(['far', 'near'] as const)('at the %s level', (detail) => {
    const coast = segmentsOf(coastLines(atlas, detail, frame));
    const raw = segmentsOf(atlas.borders((a, b) => !a !== !b, detail));

    it.each(SHORES)('leaves out the cut of %s and keeps its shore up to it', (_, side) => {
      const there = (segment: Float32Array) => side(segment[1]!) && nearEdge(segment);
      expect(raw.filter((segment) => there(segment) && onSeam(segment)).length).toBeGreaterThan(0);
      expect(coast.filter((segment) => there(segment) && onSeam(segment))).toEqual([]);
      expect(coast.filter(there).length).toBeGreaterThan(0);
    });
  });
});

describe('coastWidthPx', () => {
  it('keeps its floor from afar', () => {
    expect(coastWidthPx(1)).toBe(0.75);
  });

  it('grows with the zoom like ink on the sheet', () => {
    expect(coastWidthPx(0.001)).toBeGreaterThan(coastWidthPx(0.004));
    expect(coastWidthPx(0.001)).toBeGreaterThan(COAST_FLOOR_PX);
  });
});

describe('levelAt', () => {
  it('comes near under 35 and goes far again over 37, holding between', () => {
    expect(levelAt('far', 36)).toBe('far');
    expect(levelAt('far', 34)).toBe('near');
    expect(levelAt('near', 36)).toBe('near');
    expect(levelAt('near', 38)).toBe('far');
  });
});

describe('the borders', () => {
  it('keeps the country border darker than the region border, at rest and at its fullest', () => {
    expect(COUNTRY_BORDER_REST).toBeGreaterThan(FULL_OPACITY);
    expect(COUNTRY_BORDER_MAX).toBeGreaterThanOrEqual(COUNTRY_BORDER_REST);
  });
});
