import { NATIONS, type Nation } from './ids';

export { NATIONS, DOCTRINES } from './ids';
export type { Nation, Doctrine } from './ids';

export const INK_BY_NATION: Readonly<Record<Nation, string>> = {
  france: '#3f5a7d',
  uk: '#4a4f7a',
  usa: '#4a7060',
  ussr: '#9d4638',
  germany: '#6e6a5e',
  japan: '#a44a5e',
  italy: '#a86c4a',
  china: '#b07434',
};

/**
 * The `monde.json` country each playable nation sits on. The table is required because the
 * world is named in English by Natural Earth while nations are game ids: nothing coincides
 * by accident, everything goes through here.
 *
 * **Carrying a nation's name is not owning it.** A country only takes a nation's ink once a
 * player has reserved that nation — see `inkByClaimedCountry`.
 */
export const COUNTRY_BY_NATION: Readonly<Record<Nation, string>> = {
  france: 'France',
  uk: 'United Kingdom',
  usa: 'United States of America',
  ussr: 'Russia',
  germany: 'Germany',
  japan: 'Japan',
  italy: 'Italy',
  china: 'China',
};

export const NATION_BY_COUNTRY: ReadonlyMap<string, Nation> = new Map(
  (Object.entries(COUNTRY_BY_NATION) as ReadonlyArray<[Nation, string]>).map(
    ([nation, country]) => [country, nation],
  ),
);

export const isNation = (value: unknown): value is Nation =>
  typeof value === 'string' && (NATIONS as ReadonlyArray<string>).includes(value);

/**
 * The countries to ink on the map, from the players actually present. A holder without a
 * nation colors nothing.
 */
export function inkByClaimedCountry(
  holders: ReadonlyArray<{ readonly nation: string | null; readonly ink: string }>,
): Map<string, string> {
  const inks = new Map<string, string>();
  for (const { nation, ink } of holders) {
    if (nation !== null && isNation(nation)) inks.set(COUNTRY_BY_NATION[nation], ink);
  }
  return inks;
}

export function nationInk(nation: string | null): string {
  return nation !== null && isNation(nation) ? INK_BY_NATION[nation] : '#6e6a5e';
}
