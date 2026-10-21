import { describe, expect, it } from 'vitest';
import type { RegionType } from '@/domain/ids';
import { codesFromMasks, depthsFromCodes, terrainCode, texelsOf } from './terrain-drawings';

describe('terrainCode', () => {
  it('leaves the plain bare and gives each drawn type its own code', () => {
    expect(terrainCode('plain')).toBe(0);
    const drawn: RegionType[] = ['forest', 'jungle', 'mountain', 'desert', 'tundra'];
    expect(drawn.map(terrainCode).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('codesFromMasks', () => {
  it('writes only valid codes: a half-covered edge is one type or none, never a blend', () => {
    const forest = [255, 200, 128, 127, 0, 90];
    const mountain = [0, 90, 255, 255, 60, 90];
    const codes = codesFromMasks([forest, mountain], 6);
    const valid = new Set([0, 40, 80]);
    expect([...codes].every((code) => valid.has(code))).toBe(true);
    expect([...codes]).toEqual([40, 40, 80, 80, 0, 0]);
  });
});

describe('depthsFromCodes', () => {
  it('counts each cell from the nearest cell of another code, the grid edge not being one', () => {
    const codes = [0, 40, 40, 40, 40, 40, 0, 40, 40, 80, 80];
    expect([...depthsFromCodes(codes, 11, 1)]).toEqual([0, 1, 2, 3, 2, 1, 0, 1, 1, 1, 2]);
  });

  it('reads a massif whole: what tells two regions of a type apart is gone from the codes', () => {
    // Two forest regions side by side are one block of 40s: the middle column is deepest.
    const codes = [
      0, 0, 0, 0, 0, 0, 40, 40, 40, 0, 0, 40, 40, 40, 0, 0, 40, 40, 40, 0, 0, 0, 0, 0, 0,
    ];
    const depths = depthsFromCodes(codes, 5, 5);
    expect(depths[12]).toBe(2);
    expect(depths[6]).toBe(1);
  });

  it('measures a diagonal at its length, not in steps', () => {
    const codes = [0, 40, 40, 40, 40, 40, 40, 40, 40];
    expect(depthsFromCodes(codes, 3, 3)[8]).toBeCloseTo(2 * Math.SQRT2, 5);
  });
});

describe('texelsOf', () => {
  // A forest, then a mountain, then twelve plain cells: one massif of two types.
  const codes = new Uint8Array([40, 40, 40, 120, 120, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const texels = texelsOf(codes, codes.length, 1);
  const red = [...texels].filter((_, i) => i % 2 === 0);
  const green = [...texels].filter((_, i) => i % 2 === 1);

  it('keeps each code, and tells how many cells away another code is', () => {
    expect(red.map((byte) => Math.round(byte / 40) * 40)).toEqual([...codes]);
    expect(red.map((byte, i) => byte - codes[i]!)).toEqual([
      3, 2, 1, 1, 2, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it('gives the massif one depth across its types, above the plain and falling all the way', () => {
    const steps = green.slice(1).map((byte, i) => byte - green[i]!);
    expect(steps.slice(2).every((step) => step < 0)).toBe(true);
    expect(green[2]).toBeGreaterThan(green[5]!);
    expect(green[5]).toBeGreaterThan(128);
    expect(green[6]).toBeLessThan(128);
  });
});
