import type { LonLat } from '../src/domain/geo';
import { distanceKm } from '../src/domain/geo';
import type { BuildingKey, DepositKey, Nation } from '../src/domain/ids';
import { foundationFor } from './constants';
import { ADM0_BY_NATION, NATION_BY_COUNTRY, isNation } from '../src/domain/nations';
import { DEPOSIT_REGIONS, depositOfRegion } from '../src/domain/world';
import indexAsset from '../public/region-index.json';
import { fail } from './errors';

/**
 * The map, as a rule reads it. Two baked assets and no geometry: `deposits.json` says what a
 * region holds — read through `src/domain/world.ts`, which serves the same table to the board
 * since decision 65a: the ground is public, and one file says it to both ends —
 * `region-index.json` names it, says which country it belongs to, whether it
 * touches the sea, and **where it stands** — one lon/lat point per region, the pole of
 * inaccessibility of its largest ring. Placement never loads `regions.json`: its 2.5 MB of
 * contours only enter the separate plunder return crossing module, where the exact admin-1
 * boundary is the rule rather than a proximity check.
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
    deposit: depositOfRegion(regionId),
  };
}

/**
 * **Where a building stands.** A building is its region's point — the pole of inaccessibility of
 * `region-index.json` — **except a port**, which carries the coast point the player picked at
 * the placement (ADR 0013, revision of 04/09): a ship leaves from the water, and a large region
 * has several coasts.
 *
 * Every reading of a building's position goes through here and through nothing else. The
 * alternative is eleven `regionFacts(building.regionId).point` that each have to remember the
 * exception — and the one that forgets sends a convoy inland to embark.
 *
 * A port put up before the field existed carries no point and reads at its centroid, as it
 * always did: nothing is backfilled (the lesson of 27/08 on `buildings.seasonId`), and the
 * tolerance leaves with the next wipe.
 */
export function pointOfBuilding(building: {
  readonly regionId: string;
  readonly point?: { readonly lon: number; readonly lat: number } | undefined;
}): LonLat | null {
  if (building.point !== undefined) return [building.point.lon, building.point.lat];
  return regionFacts(building.regionId)?.point ?? null;
}

/**
 * The region whose point stands closest to a lon/lat — **which region is nearest, and nothing
 * more**. It answered "whose ground this is" until the borders were tested: a pole of
 * inaccessibility says where a region is and never where it stops, so three frontier points out
 * of six fell to the neighbouring country. `hostAtPoint` reads the polygon now, and this
 * function is left with the one question it can actually answer.
 *
 * Its single caller founds an outpost: what it wants is the region a column is standing on, to
 * see whether it already carries a building of the founder's. A neighbour answering instead
 * costs nothing there — it is a courtesy refusal, not a rule keyed on a host.
 */
export function nearestRegion(point: LonLat): RegionFacts | null {
  const closest = Object.entries(POINT_OF_REGION).reduce<{ id: string; km: number } | null>(
    (best, [regionId, regionPoint]) => {
      if (regionPoint === undefined) return best;
      const km = distanceKm(point, regionPoint);
      return best === null || km < best.km ? { id: regionId, km } : best;
    },
    null,
  );
  return closest === null ? null : regionFacts(closest.id);
}

/**
 * **La région où un avant-poste se tient**, et la seule fonction qui réponde : ce qu'il tient,
 * couvre, atteint et relève commence par elle (précision de l'ADR 0020 §1 du 04/09). Un point
 * tient toujours le sol qu'il occupe, quelle que soit la taille de la région — mesurer la
 * distance à son pôle d'inaccessibilité laissait un avant-poste sibérien ne pas tenir la région
 * où il est planté.
 *
 * Le client la nomme à la fondation ; les points d'avant le champ se relisent par la géographie
 * — **repli, jusqu'au wipe** — et le pays borne cette lecture, faute de quoi un point planté sur
 * une frontière se verrait chez le voisin.
 */
export function regionOfOutpost(outpost: {
  readonly regionId?: string | undefined;
  readonly point: { readonly lon: number; readonly lat: number };
  readonly hostCountry: string;
}): string | null {
  if (outpost.regionId !== undefined) return outpost.regionId;
  return nearestRegionOf([outpost.point.lon, outpost.point.lat], outpost.hostCountry)?.id ?? null;
}

/**
 * La région d'un pays dont le point est le plus proche — le repli ci-dessus, et rien d'autre ne
 * l'appelle. Un pays que l'index ne connaît pas n'a aucune région, donc aucune réponse.
 *
 * **Mémoïsée sur le point**, parce que le repli est chaud tant que la saison en cours porte des
 * avant-postes d'avant le champ : la vue demande le site de chacune des régions de son pays, et
 * chacune de ces demandes relit la portée de chaque point. La réponse est une fonction pure des
 * assets cuits, et le cache est borné par le nombre de points d'un isolat. Il part avec le repli,
 * au prochain wipe.
 */
const NEAREST_OF: Map<string, RegionFacts | null> = new Map();

export function nearestRegionOf(point: LonLat, country: string): RegionFacts | null {
  const key = `${country}:${point[0]},${point[1]}`;
  const known = NEAREST_OF.get(key);
  if (known !== undefined) return known;
  const closest = regionsOf(country).reduce<{ facts: RegionFacts; km: number } | null>(
    (best, facts) => {
      const km = distanceKm(point, facts.point);
      return best === null || km < best.km ? { facts, km } : best;
    },
    null,
  );
  const answer = closest === null ? null : closest.facts;
  NEAREST_OF.set(key, answer);
  return answer;
}

export const homeCountryOf = (nation: string | null): string | null =>
  isNation(nation) ? ADM0_BY_NATION[nation] : null;

/**
 * **Which of the five deposits a country's ground holds — presence, never a count.** Built once
 * per isolate off the baked asset, because it is a fact about the map and not about a season:
 * a nation is never annexed (ADR 0004), so what it holds at home it holds for the whole game.
 *
 * It is what the season's foundation is computed from (`foundationOwed`): a player is owed the
 * extractors his own ground can carry, and nothing else — a `farm` where there is bread, an
 * `oilWell` only where there is oil.
 */
const DEPOSITS_BY_COUNTRY: ReadonlyMap<string, ReadonlySet<DepositKey>> = (() => {
  const held = new Map<string, Set<DepositKey>>();
  for (const [regionId, deposit] of DEPOSIT_REGIONS) {
    const country = COUNTRY_OF_REGION[regionId];
    if (country === undefined) continue;
    const seen = held.get(country) ?? new Set<DepositKey>();
    seen.add(deposit);
    held.set(country, seen);
  }
  return held;
})();

const NOTHING: ReadonlySet<DepositKey> = new Set();

/** A nation whose flag is not taken yet holds nothing — the empty set, never a throw: the
 *  lobby reads a player before he has picked, and an empty foundation is the honest answer. */
export const homeDepositsOf = (nation: string | null): ReadonlySet<DepositKey> => {
  const country = homeCountryOf(nation);
  return (country === null ? undefined : DEPOSITS_BY_COUNTRY.get(country)) ?? NOTHING;
};

/** The whole foundation of a nation, owed or already standing — what `foundationOwed` counts
 *  down from, and what a placement budget leaves out of its count (ADR 0020 §10). */
export const foundationOf = (nation: string | null): ReadonlyArray<BuildingKey> =>
  foundationFor(homeDepositsOf(nation));

/**
 * **What the season still owes this nation, in placement order.** The join of the two halves:
 * the rule is `foundationFor` in `constants.ts`, the ground is the map above.
 *
 * It lives here and not beside the rule because `constants.ts` is read by the client — the
 * screens price and cap against it — and an import of this file from there would put the whole
 * region index in the bundle. Nothing on the client imports `regions.ts`, and nothing should.
 *
 * A key held on several regions consumes one debt each time, so the two mines a country with
 * iron and coal is owed are two free placements and the third is paid for like anything else.
 */
export function foundationOwed(
  nation: string | null,
  standing: ReadonlyArray<BuildingKey>,
): ReadonlyArray<BuildingKey> {
  const owed = [...foundationOf(nation)];
  for (const key of standing) {
    const rank = owed.indexOf(key);
    if (rank >= 0) owed.splice(rank, 1);
  }
  return owed;
}

/**
 * **`world.json` names a country in English, every rule keys on its `adm0_a3`, and this bridges
 * the two — for the eight playable nations only.** It answers the empty string everywhere else,
 * which is why it must never be asked about a point: a point in Arabia is not a point in no
 * country. `hostAtPoint` in `routes.ts` is the function for that, and it reads the code off the
 * polygon the point falls in rather than off a table of eight.
 */
export const adm0Of = (worldCountry: string | null): string => {
  const nation = worldCountry === null ? undefined : NATION_BY_COUNTRY.get(worldCountry);
  return nation === undefined ? '' : ADM0_BY_NATION[nation];
};

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
/**
 * **Toute la carte, construite une fois et à la demande.** La couleur de possession est la
 * seule règle qui ait besoin des 4 589 régions d'un coup (`domain/control.ts`) : tout le reste
 * lit une région par son identifiant, ou le sol d'un pays. Le cache est paresseux pour cette
 * raison — un isolat qui ne sert que des mouvements ne paie jamais ces objets.
 */
let everyRegion: ReadonlyArray<RegionFacts> | null = null;

export function allRegions(): ReadonlyArray<RegionFacts> {
  everyRegion ??= Object.keys(COUNTRY_OF_REGION)
    .map((regionId) => regionFacts(regionId))
    .filter((facts): facts is RegionFacts => facts !== null);
  return everyRegion;
}

/** Cuit par pays, à la demande : la vue relit tout le sol national à chaque chargement du
 *  plateau, et le balayage des 4 589 clés y était refait à chaque fois. Même contrat
 *  qu'`allRegions` — un fait de la carte, jamais de la saison. */
const REGIONS_OF: Map<string, ReadonlyArray<RegionFacts>> = new Map();

export function regionsOf(country: string): ReadonlyArray<RegionFacts> {
  const known = REGIONS_OF.get(country);
  if (known !== undefined) return known;
  const found: Array<RegionFacts> = [];
  for (const regionId of Object.keys(COUNTRY_OF_REGION)) {
    if (COUNTRY_OF_REGION[regionId] !== country) continue;
    const facts = regionFacts(regionId);
    if (facts) found.push(facts);
  }
  REGIONS_OF.set(country, found);
  return found;
}
