import { distanceKm, type LonLat } from './geo';
import type { BuildingKey } from './ids';
import { neighbourPairs } from './objective-placement';

/**
 * **La carte de départ d'une Blitz** (B7, B8 du 14/10). Même partage que les objectifs neutres
 * (`objective-placement.ts`) : la règle dit quoi mesurer et décide, le serveur mesure des routes
 * sur la grille et écrit. Un QG et une caserne par joueur, posés par la carte et non sur le sol
 * national — un Français joue le Pacifique —, puis des neutres : les proches, à la même distance
 * de route pour chacun, et les disputés, au milieu de la route entre deux voisins.
 *
 * **Ce qui est proche se mesure à pied** (`land`) : deux fantassins de départ marchent. Un QG dont
 * la caserne ou les neutres proches ne tombent pas à pied dans la tolérance de leur distance cible
 * est écarté — c'est ce qui tient un QG hors d'un îlot. L'écart entre QG et les disputés se
 * mesurent en combiné : on se dispute aussi par la mer.
 */
export type BlitzCandidate = {
  readonly regionId: string;
  readonly point: LonLat;
  /** Une côte où un quai existe : le serveur ne le dit que s'il a trouvé où amarrer. */
  readonly coastal: boolean;
};

export type BlitzMapRules = {
  readonly hqRing: number;
  /** Combien de tours de table on essaie. */
  readonly hqTries: number;
  /** Combien de candidates, des plus proches de la cible, on éprouve pour un QG. */
  readonly hqScan: number;
  /** En deçà de ce rapport entre le plus court et le plus long écart de QG, la carte est refusée. */
  readonly hqEvenness: number;
  /** L'écart permis autour d'une distance cible, en part de celle-ci. */
  readonly tolerance: number;
  readonly starting: ReadonlyArray<Ring>;
  readonly near: ReadonlyArray<Ring>;
  readonly disputed: ReadonlyArray<BuildingKey>;
  readonly spreadKm: number;
  readonly fairness: number;
};

type Ring = { readonly key: BuildingKey; readonly km: number };

export type BlitzSite = {
  readonly key: BuildingKey;
  readonly regionId: string;
  /** Le siège qui le tient au départ ; `null` : neutre. */
  readonly owner: string | null;
  /** Le siège dont c'est un neutre proche ; `null` pour un disputé ou un bâtiment de départ. */
  readonly near: string | null;
};

/** Kilomètres de route depuis le point d'une candidate, vers chaque candidate jointe sous `maxKm`. */
export type BlitzMeasure = (
  regionId: string,
  mode: 'land' | 'combined',
  maxKm: number,
) => ReadonlyMap<string, number>;

type Box = {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
};

/** `null` : aucun tour de table n'est équitable, et la partie ne se lance pas sur celui-là. */
export function planBlitzMap({
  seats,
  candidates,
  box,
  rules,
  seed,
  measure,
}: {
  readonly seats: ReadonlyArray<string>;
  readonly candidates: ReadonlyArray<BlitzCandidate>;
  readonly box: Box;
  readonly rules: BlitzMapRules;
  readonly seed: number;
  readonly measure: BlitzMeasure;
}): ReadonlyArray<BlitzSite> | null {
  const byId = new Map(candidates.map((candidate) => [candidate.regionId, candidate]));
  const rings = [...rules.starting, ...rules.near];
  const walkKm = Math.max(...rings.map((ring) => ring.km)) * (1 + rules.tolerance);
  const onFoot = (regionId: string) => measure(regionId, 'land', walkKm);

  const tries = headquartersTries(seats, candidates, box, rules, seed, byId, onFoot)
    .map((hqs) => ({ hqs, sites: aroundHeadquarters(seats, hqs, candidates, rules, byId, onFoot) }))
    .filter(
      (attempt): attempt is { hqs: ReadonlyArray<string>; sites: Array<BlitzSite> } =>
        attempt.sites !== null,
    );
  if (tries.length === 0) return null;

  /** **L'équité se mesure par la route**, mais seulement sur les deux tours les plus réguliers à
   *  vol d'oiseau : un champ combiné par QG et par tour coûterait des secondes au Pacifique. */
  const flying = (hqs: ReadonlyArray<string>) =>
    evennessOf(hqs, (a, b) => distanceKm(byId.get(a)!.point, byId.get(b)!.point));
  const shortlist = [...tries].sort((a, b) => flying(b.hqs) - flying(a.hqs)).slice(0, 2);
  const reachOf = (hqs: ReadonlyArray<string>) =>
    2 *
    Math.max(
      ...hqs.flatMap((a) => hqs.map((b) => distanceKm(byId.get(a)!.point, byId.get(b)!.point))),
    );
  const byRoad = shortlist.map((attempt) => {
    const reach = reachOf(attempt.hqs);
    return {
      ...attempt,
      evenness: evennessOf(attempt.hqs, (a, b) => measure(a, 'combined', reach).get(b) ?? 0),
    };
  });
  const best = byRoad.reduce((kept, attempt) =>
    attempt.evenness > kept.evenness ? attempt : kept,
  );
  if (best.evenness < rules.hqEvenness) return null;

  const { hqs, sites } = best;
  const taken = new Set(sites.map((site) => site.regionId));
  const placed = seats.map((seat, rank) => ({ id: seat, hq: byId.get(hqs[rank]!)!.point }));
  for (const [left, right] of neighbourPairs(placed, Infinity)) {
    const leftHq = hqs[seats.indexOf(left.id)]!;
    const rightHq = hqs[seats.indexOf(right.id)]!;
    const reach = 1.5 * distanceKm(left.hq, right.hq);
    const fromLeft = measure(leftHq, 'combined', reach);
    const fromRight = measure(rightHq, 'combined', reach);
    for (const key of rules.disputed) {
      let pick: { regionId: string; farther: number } | null = null;
      for (const candidate of candidates) {
        const a = fromLeft.get(candidate.regionId);
        const b = fromRight.get(candidate.regionId);
        if (a === undefined || b === undefined || !fits(candidate, key, taken, sites, byId, rules))
          continue;
        const farther = Math.max(a, b);
        if (Math.min(a, b) < rules.fairness * farther) continue;
        if (pick === null || farther < pick.farther)
          pick = { regionId: candidate.regionId, farther };
      }
      if (pick !== null) {
        sites.push({ key, regionId: pick.regionId, owner: null, near: null });
        taken.add(pick.regionId);
      }
    }
  }
  return sites;
}

const evennessOf = (hqs: ReadonlyArray<string>, gap: (a: string, b: string) => number): number => {
  const gaps = hqs.flatMap((hq, rank) => hqs.slice(rank + 1).map((other) => gap(hq, other)));
  return gaps.length === 0 ? 1 : Math.min(...gaps) / Math.max(...gaps, 1);
};

const fits = (
  candidate: BlitzCandidate,
  key: BuildingKey,
  taken: ReadonlySet<string>,
  sites: ReadonlyArray<BlitzSite>,
  byId: ReadonlyMap<string, BlitzCandidate>,
  rules: BlitzMapRules,
) =>
  !taken.has(candidate.regionId) &&
  (key !== 'port' || candidate.coastal) &&
  sites.every(
    (site) => distanceKm(byId.get(site.regionId)!.point, candidate.point) >= rules.spreadKm,
  );

/**
 * **La caserne et les neutres proches de chaque QG**, entrée par entrée et siège par siège pour que
 * chacun choisisse à son tour dans la même liste ; `null` dès qu'un siège n'a pas une entrée à pied
 * dans la tolérance.
 */
function aroundHeadquarters(
  seats: ReadonlyArray<string>,
  hqs: ReadonlyArray<string>,
  candidates: ReadonlyArray<BlitzCandidate>,
  rules: BlitzMapRules,
  byId: ReadonlyMap<string, BlitzCandidate>,
  onFoot: (regionId: string) => ReadonlyMap<string, number>,
): Array<BlitzSite> | null {
  const sites: Array<BlitzSite> = seats.map((seat, rank) => ({
    key: 'hq',
    regionId: hqs[rank]!,
    owner: seat,
    near: null,
  }));
  const taken = new Set(hqs);
  for (const [entries, owned] of [
    [rules.starting, true],
    [rules.near, false],
  ] as const) {
    for (const { key, km } of entries) {
      for (const [rank, seat] of seats.entries()) {
        const mine = onFoot(hqs[rank]!);
        const others = hqs.filter((_, other) => other !== rank).map(onFoot);
        let pick: { regionId: string; off: number } | null = null;
        for (const candidate of candidates) {
          const reach = mine.get(candidate.regionId);
          if (reach === undefined || !fits(candidate, key, taken, sites, byId, rules)) continue;
          if (others.some((field) => (field.get(candidate.regionId) ?? Infinity) <= reach))
            continue;
          const off = Math.abs(reach - km);
          if (off > km * rules.tolerance) continue;
          if (pick === null || off < pick.off) pick = { regionId: candidate.regionId, off };
        }
        if (pick === null) return null;
        sites.push({
          key,
          regionId: pick.regionId,
          owner: owned ? seat : null,
          near: owned ? null : seat,
        });
        taken.add(pick.regionId);
      }
    }
  }
  return sites;
}

/**
 * **Les QG sur un cercle autour du centre du théâtre**, tourné `hqTries` fois. Pour chaque place
 * du cercle, la candidate la plus proche **d'où l'on marche** : celle dont chaque entrée proche a
 * au moins une région à pied dans la tolérance. Un tour où une place n'en trouve pas est jeté.
 */
function headquartersTries(
  seats: ReadonlyArray<string>,
  candidates: ReadonlyArray<BlitzCandidate>,
  box: Box,
  rules: BlitzMapRules,
  seed: number,
  byId: ReadonlyMap<string, BlitzCandidate>,
  onFoot: (regionId: string) => ReadonlyMap<string, number>,
): ReadonlyArray<ReadonlyArray<string>> {
  const center: LonLat = [(box.west + box.east) / 2, (box.south + box.north) / 2];
  const radius: LonLat = [
    ((box.east - box.west) / 2) * rules.hqRing,
    ((box.north - box.south) / 2) * rules.hqRing,
  ];
  const turn = ((((seed >>> 0) * 1_664_525 + 1_013_904_223) >>> 0) / 2 ** 32) * 2 * Math.PI;
  const step = (2 * Math.PI) / seats.length;
  const rings = [...rules.starting, ...rules.near];
  const walkable = new Map<string, boolean>();
  const isWalkable = (regionId: string) => {
    let known = walkable.get(regionId);
    if (known === undefined) {
      const field = onFoot(regionId);
      known = rings.every(({ key, km }) =>
        [...field].some(
          ([other, reach]) =>
            other !== regionId &&
            Math.abs(reach - km) <= km * rules.tolerance &&
            (key !== 'port' || byId.get(other)?.coastal === true),
        ),
      );
      walkable.set(regionId, known);
    }
    return known;
  };

  const tries: Array<ReadonlyArray<string>> = [];
  for (let attempt = 0; attempt < rules.hqTries; attempt += 1) {
    const used = new Set<string>();
    const hqs: Array<string> = [];
    for (let rank = 0; rank < seats.length; rank += 1) {
      const angle = turn + (attempt * step) / rules.hqTries + rank * step;
      const target = wrap([
        center[0] + radius[0] * Math.cos(angle),
        center[1] + radius[1] * Math.sin(angle),
      ]);
      const pick = candidates
        .filter((candidate) => !used.has(candidate.regionId))
        .sort((a, b) => distanceKm(a.point, target) - distanceKm(b.point, target))
        .slice(0, rules.hqScan)
        .find((candidate) => isWalkable(candidate.regionId));
      if (pick === undefined) break;
      used.add(pick.regionId);
      hqs.push(pick.regionId);
    }
    if (hqs.length === seats.length) tries.push(hqs);
  }
  return tries;
}

const wrap = ([lon, lat]: LonLat): LonLat => [lon > 180 ? lon - 360 : lon, lat];
