import { describe, expect, it } from 'vitest';
import { ASSET_BY_NATION, assetOf, ASSETS } from './nation-assets';
import { NATIONS } from './nations';

describe('the one table of national assets (ADR 0039)', () => {
  it('gives four nations an asset and the four others none', () => {
    const held = NATIONS.filter((nation) => ASSET_BY_NATION[nation] !== null);
    expect(held.sort()).toEqual(['germany', 'japan', 'ussr', 'usa'].sort());
    expect(new Set(held.map((nation) => ASSET_BY_NATION[nation])).size).toBe(ASSETS.length);
  });

  it('reads no asset in a Blitz, nor for a seat without a nation', () => {
    expect(assetOf('usa', 'mondiale')).toBe('lendLease');
    expect(assetOf('usa', 'blitz')).toBeNull();
    expect(assetOf('france', 'mondiale')).toBeNull();
    expect(assetOf(null, 'mondiale')).toBeNull();
  });
});
