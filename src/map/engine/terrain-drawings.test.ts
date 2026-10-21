import { describe, expect, it } from 'vitest';
import type { RegionType } from '@/domain/ids';
import { terrainCode } from './terrain-drawings';

describe('terrainCode', () => {
  it('leaves the plain bare and gives each drawn type its own code', () => {
    expect(terrainCode('plain')).toBe(0);
    const drawn: RegionType[] = ['forest', 'jungle', 'mountain', 'desert', 'tundra'];
    expect(drawn.map(terrainCode).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
