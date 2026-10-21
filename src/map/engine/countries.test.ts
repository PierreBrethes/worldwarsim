import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeAtlas } from '@/domain/atlas';
import type { World } from '@/domain/world';
import projection from '../../../public/projection.json';
import { COAST_FLOOR_PX, coastLines, coastWidthPx, levelAt } from './countries';
import { WorldFrame } from './frame';

describe('the coast', () => {
  const read = (name: string) => JSON.parse(readFileSync(`public/${name}`, 'utf8'));
  const atlas = decodeAtlas(read('atlas.json'), read('atlas-near.json'));
  const frame = new WorldFrame({ ...projection, countries: [] } as unknown as World);
  const offEdge = (x: number, y: number) => {
    const { westX, eastX } = frame.edgeAtLatitude(frame.lonLatAt(x, y)[1]);
    return Math.min(Math.abs(x - westX), Math.abs(x - eastX));
  };

  /** Chukotka and Fiji are cut at the antimeridian (ADR 0034): the cut has the sea on neither
   *  side, only the sheet's edge, and the boldest ink would underline the edge. */
  it.each(['far', 'near'] as const)('leaves out the cut at the antimeridian (%s)', (detail) => {
    const segments: [number, number, number, number][] = [];
    for (const { points } of coastLines(atlas, detail, frame))
      for (let i = 2; i < points.length; i += 2)
        segments.push([points[i - 2]!, points[i - 1]!, points[i]!, points[i + 1]!]);
    expect(
      segments.filter(([ax, ay, bx, by]) => Math.max(offEdge(ax, ay), offEdge(bx, by)) < 0.01),
    ).toEqual([]);
    // Chukotka keeps its shore up to the cut.
    const nearEdge = segments.filter(([ax, ay]) => offEdge(ax, ay) < 0.5 && ay < 40);
    expect(nearEdge.length).toBeGreaterThan(0);
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
  it('comes near under 25 and goes far again over 27, holding between', () => {
    expect(levelAt('far', 26)).toBe('far');
    expect(levelAt('far', 24)).toBe('near');
    expect(levelAt('near', 26)).toBe('near');
    expect(levelAt('near', 28)).toBe('far');
  });
});
