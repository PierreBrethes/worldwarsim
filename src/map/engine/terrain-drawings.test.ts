import { describe, expect, it } from 'vitest';
import type { RegionType } from '@/domain/ids';
import { codesFromMasks, terrainCode } from './terrain-drawings';

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
