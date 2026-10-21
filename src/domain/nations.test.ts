import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADM0_BY_NATION, COUNTRY_BY_NATION, NATIONS } from './nations';

const atlasCountries = new Set(
  (
    JSON.parse(readFileSync('public/atlas.json', 'utf8')) as {
      objects: { regions: { geometries: Array<{ properties: { country: string } }> } };
    }
  ).objects.regions.geometries.map((region) => region.properties.country),
);

describe('nations sit on countries that exist', () => {
  /**
   * The atlas keys a region by its country's `adm0_a3` while nations are game ids: nothing
   * matches by accident. A table entry that misses is silent — the map stays neutral and
   * nobody notices. That is exactly the bug this test engraves.
   */
  it('gives every nation a country present in the atlas', () => {
    for (const nation of NATIONS) {
      expect(atlasCountries.has(ADM0_BY_NATION[nation])).toBe(true);
    }
  });

  it('never lets two nations share a country', () => {
    const countries = NATIONS.map((nation) => COUNTRY_BY_NATION[nation]);
    expect(new Set(countries).size).toBe(countries.length);
  });
});
