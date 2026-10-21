import type { LonLat } from './geo';
import { NATIONS, type Nation } from './ids';

export { NATIONS } from './ids';
export type { Nation } from './ids';

/**
 * **The one table of nation inks** (palette des nations, 14/10/2026): the board's grounds, the
 * masts, the telegraph — every colour a nation takes comes from here; the board draws it as a
 * dashed contour (ADR 0033). Printed inks of a 1940 atlas, eight families apart: France's blue,
 * the Empire's rose, the Soviet vermilion, a field-grey teal for Germany, the imperial purple of
 * Japan, Italy's olive green, China's ochre-yellow, America's viridian. Neighbours on the board are held
 * apart by test (`palette.test.ts`).
 */
export const INK_BY_NATION: Readonly<Record<Nation, string>> = {
  france: '#2a5ba8',
  uk: '#a83f68',
  usa: '#2d7a52',
  ussr: '#a8352a',
  germany: '#2b6974',
  japan: '#6a4796',
  italy: '#5a8224',
  china: '#937311',
};

/**
 * The English name of the country each playable nation sits on. The table is required because the
 * world is named in English by Natural Earth while nations are game ids: nothing coincides
 * by accident, everything goes through here.
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

/** Where a nation's board opens when nothing of its own calls the eye: the point the old
 *  `world.json` gave its country, kept here once the client stopped loading the world (ADR 0034). */
export const HOME_BY_NATION: Readonly<Record<Nation, LonLat>> = {
  france: [2.58, 46.96],
  uk: [-1.39, 52.7],
  usa: [-101.43, 39.23],
  ussr: [95.07, 61.14],
  germany: [9.57, 51.07],
  japan: [131.01, 30.83],
  italy: [10.64, 45.07],
  china: [106.98, 34.14],
};

/**
 * The Natural Earth `adm0_a3` of each nation — the code the atlas and `deposits.json`
 * key a region by. `COUNTRY_BY_NATION` above names the same country in English, the key the
 * old world was read by. Two keys, and no way to compare one to the other: that is the bug
 * ADR 0016 was written after.
 */
export const ADM0_BY_NATION: Readonly<Record<Nation, string>> = {
  france: 'FRA',
  uk: 'GBR',
  usa: 'USA',
  ussr: 'RUS',
  germany: 'DEU',
  japan: 'JPN',
  italy: 'ITA',
  china: 'CHN',
};

/**
 * The same seam as `NATION_BY_COUNTRY`, read from the code rather than from the English name.
 * It is the one the server, the regions and the outposts all speak, so it is the one a label
 * goes through (`countryLabel`).
 */
export const NATION_BY_ADM0: ReadonlyMap<string, Nation> = new Map(
  (Object.entries(ADM0_BY_NATION) as ReadonlyArray<[Nation, string]>).map(([nation, code]) => [
    code,
    nation,
  ]),
);

export const NATION_BY_COUNTRY: ReadonlyMap<string, Nation> = new Map(
  (Object.entries(COUNTRY_BY_NATION) as ReadonlyArray<[Nation, string]>).map(
    ([nation, country]) => [country, nation],
  ),
);

export const isNation = (value: unknown): value is Nation =>
  typeof value === 'string' && (NATIONS as ReadonlyArray<string>).includes(value);

export function nationInk(nation: string | null): string {
  return nation !== null && isNation(nation) ? INK_BY_NATION[nation] : '#6e6a5e';
}

/** The share of its light a nation ink keeps when it is set as small type on paper. */
const TYPE_LIGHT = 0.72;

/**
 * The same ink, deeper, for a name set small on the paper (the telegraph's sender): the board's
 * inks are made to read as washes and reach 3:1 as type, short of the body-text floor.
 */
export function typeInk(ink: string): string {
  const value = parseInt(ink.slice(1), 16);
  return `#${[16, 8, 0]
    .map((shift) =>
      Math.round(((value >> shift) & 255) * TYPE_LIGHT)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
