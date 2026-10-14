import { destinationPoint, distanceKm, type LonLat } from './geo';
import type { BuildingKey } from './ids';
import { neighbourPairs } from './objective-placement';
import { theatreKm, type Theatre } from './theatres';

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
  /** Le rayon du cercle des QG : leur écart cible en est la corde. */
  readonly hqRadiusKm: number;
  /** De combien, en part, une tablée peut resserrer son cercle : une terre étroite tient un
   *  cercle plus petit. */
  readonly hqRadiusSpread: number;
  /** Combien de tablées on tire au plus, chacune depuis une candidate au hasard. */
  readonly hqDraws: number;
  /** Combien de tablées régulières on éprouve en entier avant de choisir. */
  readonly hqTries: number;
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

/** `null` : aucun tour de table n'est équitable, et la partie ne se lance pas sur celui-là. */
export function planBlitzMap({
  seats,
  candidates,
  rules,
  seed,
  measure,
}: {
  readonly seats: ReadonlyArray<string>;
  readonly candidates: ReadonlyArray<BlitzCandidate>;
  readonly rules: BlitzMapRules;
  readonly seed: number;
  readonly measure: BlitzMeasure;
}): ReadonlyArray<BlitzSite> | null {
  const byId = new Map(candidates.map((candidate) => [candidate.regionId, candidate]));
  const rings = [...rules.starting, ...rules.near];
  const walkKm = Math.max(...rings.map((ring) => ring.km)) * (1 + rules.tolerance);
  const onFoot = (regionId: string) => measure(regionId, 'land', walkKm);

  const tries = headquartersTries(seats, candidates, rules, seed, byId, onFoot)
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
 * **Les QG sur un cercle posé sur la terre du théâtre** (A2) : chaque tablée centre un cercle de
 * `hqRadiusKm` sur une région tirée au hasard, le tourne au hasard, et prend pour chaque place la
 * région la plus proche **d'où l'on marche** : un cercle autour du centre de la boîte tombe en
 * mer au Pacifique. Une tablée dont les écarts à vol d'oiseau ne sont pas réguliers est jetée.
 */
function headquartersTries(
  seats: ReadonlyArray<string>,
  candidates: ReadonlyArray<BlitzCandidate>,
  rules: BlitzMapRules,
  seed: number,
  byId: ReadonlyMap<string, BlitzCandidate>,
  onFoot: (regionId: string) => ReadonlyMap<string, number>,
): ReadonlyArray<ReadonlyArray<string>> {
  /** **D'où l'on marche** : la caserne et chaque neutre proche s'y posent à pied, seul à table —
   *  la même pose qu'à la fin, sans les voisins. Un îlot passe chaque entrée une à une, jamais
   *  toutes ensemble à leur écart. */
  const walkable = new Map<string, boolean>();
  const isWalkable = (regionId: string) => {
    let known = walkable.get(regionId);
    if (known === undefined) {
      known = aroundHeadquarters(['alone'], [regionId], candidates, rules, byId, onFoot) !== null;
      walkable.set(regionId, known);
    }
    return known;
  };

  const random = mulberry32(seed);
  const tries: Array<ReadonlyArray<string>> = [];
  const seen = new Set<string>();
  for (let draw = 0; draw < rules.hqDraws && tries.length < rules.hqTries; draw += 1) {
    const center = candidates[Math.floor(random() * candidates.length)]?.point;
    const turn = random() * 2 * Math.PI;
    const radiusKm = rules.hqRadiusKm * (1 - rules.hqRadiusSpread * random());
    if (center === undefined) break;
    const hqs: Array<BlitzCandidate> = [];
    for (let rank = 0; rank < seats.length; rank += 1) {
      const bearing = ((turn + (rank * 2 * Math.PI) / seats.length) * 180) / Math.PI;
      const target = destinationPoint(center, radiusKm, bearing);
      const pick = candidates
        .filter((candidate) => !hqs.includes(candidate))
        .map((candidate) => ({ candidate, km: distanceKm(candidate.point, target) }))
        .sort((a, b) => a.km - b.km)
        .find(({ candidate }) => isWalkable(candidate.regionId))?.candidate;
      if (pick === undefined) break;
      hqs.push(pick);
    }
    const ids = hqs.map((hq) => hq.regionId);
    const key = [...ids].sort().join('|');
    if (hqs.length < seats.length || seen.has(key)) continue;
    seen.add(key);
    const gaps = hqs.flatMap((hq, rank) =>
      hqs.slice(rank + 1).map((other) => distanceKm(hq.point, other.point)),
    );
    if (Math.min(...gaps) >= rules.hqEvenness * Math.max(...gaps)) tries.push(ids);
  }
  return tries;
}

/** Une graine, une suite : la même partie rejoue la même carte. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

type ShareRing = { readonly key: BuildingKey; readonly share: number };

/** **Les règles de pose en kilomètres de ce théâtre** (A2) : les cibles et l'écart sont des parts
 *  de son étendue, la tolérance et les rapports n'ont pas d'unité. */
export function blitzMapRulesOf(
  theatre: Theatre,
  rules: Omit<BlitzMapRules, 'starting' | 'near' | 'spreadKm' | 'hqRadiusKm'> & {
    readonly hqRadius: number;
    readonly starting: ReadonlyArray<ShareRing>;
    readonly near: ReadonlyArray<ShareRing>;
    readonly spread: number;
  },
): BlitzMapRules {
  const inKm = (rings: ReadonlyArray<ShareRing>) =>
    rings.map(({ key, share }) => ({ key, km: theatreKm(theatre, share) }));
  const { spread, hqRadius, ...unitless } = rules;
  return {
    ...unitless,
    hqRadiusKm: theatreKm(theatre, hqRadius),
    starting: inKm(rules.starting),
    near: inKm(rules.near),
    spreadKm: theatreKm(theatre, spread),
  };
}
