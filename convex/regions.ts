import type { LonLat } from '../src/domain/geo';
import type { DepositKey, Nation } from '../src/domain/ids';
import { ADM0_BY_NATION, isNation } from '../src/domain/nations';
import depositsAsset from '../public/deposits.json';
import indexAsset from '../public/region-index.json';
import { fail } from './errors';

/**
 * The map, as a rule reads it. Two baked assets and no geometry: `deposits.json` says what a
 * region holds, `region-index.json` names it, says which country it belongs to, whether it
 * touches the sea, and **where it stands** — one lon/lat point per region, the pole of
 * inaccessibility of its largest ring. `regions.json` itself never comes near the server — it
 * weighs 2.5 MB of polygons drawn for the screen, and no placement rule needs a polygon to
 * refuse a port.
 *
 * The point is what makes a region a place rather than a name: an outpost's reach is measured
 * in kilometres from it (ADR 0015), and a land movement leaves from the point of the region
 * its barracks stands on. A region is still never a *unit of count* — the ban of ADR 0015
 * stands, and it is the reason the reach is a radius and not a ring of neighbours.
 *
 * The name travels with the facts on purpose: the client would otherwise have to fetch those
 * 2.5 MB to write "Nord" next to a mine. A region name is a proper noun out of Natural Earth,
 * not a label to translate — `fr.ts` has nothing to say about it.
 *
 * Both files are generated (`scripts/generate-deposits.mjs`, `scripts/generate-region-index.mjs`)
 * and never edited by hand.
 */

const NAME_OF_REGION = indexAsset.name as Readonly<Record<string, string | undefined>>;
const COUNTRY_OF_REGION = indexAsset.country as Readonly<Record<string, string | undefined>>;
const COASTAL = new Set<string>(indexAsset.coastal);
const POINT_OF_REGION = indexAsset.point as unknown as Readonly<Record<string, LonLat | undefined>>;
const DEPOSIT_OF_REGION = depositsAsset as Readonly<Record<string, DepositKey | undefined>>;

export type RegionFacts = {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly coastal: boolean;
  readonly point: LonLat;
  readonly deposit: DepositKey | null;
};

/**
 * A region the index cannot place answers `null`, exactly like one it does not know: a rule
 * that cannot measure a distance to it cannot decide anything about it either. The generator
 * refuses to bake such a region, so this only fires on an asset left behind by a regeneration.
 */
export function regionFacts(regionId: string): RegionFacts | null {
  const country = COUNTRY_OF_REGION[regionId];
  const point = POINT_OF_REGION[regionId];
  if (country === undefined || point === undefined) return null;
  return {
    id: regionId,
    name: NAME_OF_REGION[regionId] ?? regionId,
    country,
    coastal: COASTAL.has(regionId),
    point,
    deposit: DEPOSIT_OF_REGION[regionId] ?? null,
  };
}

export const homeCountryOf = (nation: string | null): string | null =>
  isNation(nation) ? ADM0_BY_NATION[nation] : null;

/**
 * Where the headquarters already stands when a season opens (ADR 0015): the 1940 capital, as
 * an admin-1 code of `region-index.json`. **A nation has a capital, it does not build one** —
 * the single exception to "a building is put up or it does not exist", written here rather
 * than emerging from a floor in `levelOf`.
 *
 * Natural Earth cuts as it pleases, so three of the eight need saying out loud.
 */
const CAPITAL_REGION: Readonly<Record<Nation, string>> = {
  france: 'FRA-5333', // Paris
  uk: 'GBR-2080', // Westminster — Greater London is cut into boroughs, Whitehall sits in this one
  usa: 'USA-3556', // District of Columbia — never USA-3519, which is Washington the state
  ussr: 'RUS-2365', // Moskva, the city — never RUS-2364, the oblast wrapped around it
  germany: 'DEU-1599', // Berlin
  japan: 'JPN-1860', // Tokyo
  italy: 'ITA-5422', // Roma
  china: 'CHN-1154', // Chongqing — Nanking fell in 1937, the Republic has fallen back up the Yangtze
};

/**
 * A capital that resolves to nothing would hand a player no headquarters, hence no slots and
 * no buildable anything — a symptom appearing hours away from its cause. So it fails at the
 * launch instead, loudly.
 *
 * The table travels as a parameter for one reason: it is the only way to test that refusal
 * without shipping a broken code.
 */
export function capitalRegionOf(nation: Nation, table = CAPITAL_REGION): string {
  const regionId = table[nation];
  const facts = regionId === undefined ? null : regionFacts(regionId);
  if (facts === null || facts.country !== ADM0_BY_NATION[nation]) {
    fail('UNKNOWN_CAPITAL_REGION', { nation, regionId: regionId ?? null });
  }
  return regionId;
}

/**
 * Every region of a country. The view used to serve only the ones carrying a deposit, on the
 * grounds that an empty region said nothing a player acts on — that stopped being true the day
 * building moved onto the map: a barracks, an airfield or a warehouse goes anywhere at home,
 * and the construction panel has to know a region's facts before offering it.
 *
 * The whole home country is at most two hundred and thirty entries of four short fields, and
 * it is the player's own ground: nothing here is another player's business.
 */
export function regionsOf(country: string): ReadonlyArray<RegionFacts> {
  const found: Array<RegionFacts> = [];
  for (const regionId of Object.keys(COUNTRY_OF_REGION)) {
    if (COUNTRY_OF_REGION[regionId] !== country) continue;
    const facts = regionFacts(regionId);
    if (facts) found.push(facts);
  }
  return found;
}
