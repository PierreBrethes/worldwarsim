import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COUNTRY_BY_NATION, NATIONS, inkByClaimedCountry } from './nations';

const worldCountries = new Set(
  (JSON.parse(readFileSync('public/world.json', 'utf8')) as { countries: Array<{ n: string }> })
    .countries.map((country) => country.n),
);

describe('nations sit on countries that exist', () => {
  /**
   * The world is named in English by Natural Earth while nations are game ids: nothing
   * matches by accident. A table entry that misses is silent — the map stays neutral and
   * nobody notices. That is exactly the bug this test engraves.
   */
  it('gives every nation a country present in world.json', () => {
    for (const nation of NATIONS) {
      expect(worldCountries.has(COUNTRY_BY_NATION[nation])).toBe(true);
    }
  });

  it('never lets two nations share a country', () => {
    const countries = NATIONS.map((nation) => COUNTRY_BY_NATION[nation]);
    expect(new Set(countries).size).toBe(countries.length);
  });
});

describe('ink follows the player, not the country name', () => {
  it('only inks nations actually claimed', () => {
    const inks = inkByClaimedCountry([
      { nation: 'france', ink: '#3f5a7d' },
      { nation: 'japan', ink: '#a44a5e' },
    ]);
    expect(inks.get('France')).toBe('#3f5a7d');
    expect(inks.get('Japan')).toBe('#a44a5e');
    expect(inks.has('Germany')).toBe(false);
  });

  it('ignores a player without a nation', () => {
    expect(inkByClaimedCountry([{ nation: null, ink: '#000' }]).size).toBe(0);
    expect(inkByClaimedCountry([{ nation: 'kaspar', ink: '#000' }]).size).toBe(0);
  });
});
