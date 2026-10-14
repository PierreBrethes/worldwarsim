import { distanceKm, type LonLat } from './geo';
import type { BuildingKey } from './ids';
import { neighbourPairs } from './objective-placement';

/**
 * **La carte de départ d'une Blitz** (B7, B8 du 14/10). Même partage que les objectifs neutres
 * (`objective-placement.ts`) : la règle dit quoi mesurer et décide, le serveur mesure des routes
 * sur la grille et écrit. Un QG et une caserne par joueur, posés par la carte et non sur le sol
 * national — un Français joue le Pacifique —, puis des neutres : les proches, à la même distance
 * de route pour chacun, et les disputés, au milieu de la route entre deux voisins.
 */
export type BlitzCandidate = {
  readonly regionId: string;
  readonly point: LonLat;
  readonly coastal: boolean;
};

export type BlitzMapRules = {
  readonly hqRing: number;
  readonly hqTries: number;
  readonly starting: ReadonlyArray<{ readonly key: BuildingKey; readonly km: number }>;
  readonly near: ReadonlyArray<{ readonly key: BuildingKey; readonly km: number }>;
  readonly disputed: ReadonlyArray<BuildingKey>;
  readonly spreadKm: number;
  readonly fairness: number;
};

export type BlitzSite = {
  readonly key: BuildingKey;
  readonly regionId: string;
  /** Le siège qui le tient au départ ; `null` : neutre. */
  readonly owner: string | null;
  /** Le siège dont c'est un neutre proche ; `null` pour un disputé ou un bâtiment de départ. */
  readonly near: string | null;
};

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
  readonly box: {
    readonly west: number;
    readonly south: number;
    readonly east: number;
    readonly north: number;
  };
  readonly rules: BlitzMapRules;
  readonly seed: number;
  /** Kilomètres de route depuis le point d'une région candidate, vers chaque candidate jointe. */
  readonly measure: (regionId: string) => ReadonlyMap<string, number>;
}): ReadonlyArray<BlitzSite> {
  const byId = new Map(candidates.map((candidate) => [candidate.regionId, candidate]));
  const hqs = placeHeadquarters(seats, candidates, box, rules, seed, measure);
  const sites: Array<BlitzSite> = seats.map((seat, rank) => ({
    key: 'hq',
    regionId: hqs[rank]!,
    owner: seat,
    near: null,
  }));
  const taken = new Set(hqs);
  const fits = (candidate: BlitzCandidate, key: BuildingKey) =>
    !taken.has(candidate.regionId) &&
    (key !== 'port' || candidate.coastal) &&
    sites.every(
      (site) => distanceKm(byId.get(site.regionId)!.point, candidate.point) >= rules.spreadKm,
    );
  const put = (site: BlitzSite) => {
    sites.push(site);
    taken.add(site.regionId);
  };

  /** Entrée par entrée et siège par siège : chacun choisit à son tour, et la même liste. */
  const ring = (entries: BlitzMapRules['near'], owned: boolean) => {
    for (const { key, km } of entries) {
      seats.forEach((seat, rank) => {
        const mine = measure(hqs[rank]!);
        const others = hqs.filter((_, other) => other !== rank).map(measure);
        let best: { regionId: string; off: number } | null = null;
        for (const candidate of candidates) {
          const reach = mine.get(candidate.regionId);
          if (reach === undefined || !fits(candidate, key)) continue;
          if (others.some((field) => (field.get(candidate.regionId) ?? Infinity) <= reach))
            continue;
          const off = Math.abs(reach - km);
          if (best === null || off < best.off) best = { regionId: candidate.regionId, off };
        }
        if (best !== null) {
          put({
            key,
            regionId: best.regionId,
            owner: owned ? seat : null,
            near: owned ? null : seat,
          });
        }
      });
    }
  };
  ring(rules.starting, true);
  ring(rules.near, false);

  const placed = seats.map((seat, rank) => ({ id: seat, hq: byId.get(hqs[rank]!)!.point }));
  for (const [left, right] of neighbourPairs(placed, Infinity)) {
    const fromLeft = measure(hqs[seats.indexOf(left.id)]!);
    const fromRight = measure(hqs[seats.indexOf(right.id)]!);
    for (const key of rules.disputed) {
      let best: { regionId: string; farther: number } | null = null;
      for (const candidate of candidates) {
        const a = fromLeft.get(candidate.regionId);
        const b = fromRight.get(candidate.regionId);
        if (a === undefined || b === undefined || !fits(candidate, key)) continue;
        const farther = Math.max(a, b);
        if (Math.min(a, b) < rules.fairness * farther) continue;
        if (best === null || farther < best.farther)
          best = { regionId: candidate.regionId, farther };
      }
      if (best !== null) put({ key, regionId: best.regionId, owner: null, near: null });
    }
  }
  return sites;
}

/**
 * **Les QG sur un cercle autour du centre du théâtre**, tourné `hqTries` fois ; on garde le tour
 * dont les distances de route entre QG sont les plus égales. Le cercle donne l'écart, la route
 * l'équité : deux QG à vol d'oiseau égal peuvent être séparés par une mer.
 */
function placeHeadquarters(
  seats: ReadonlyArray<string>,
  candidates: ReadonlyArray<BlitzCandidate>,
  box: {
    readonly west: number;
    readonly south: number;
    readonly east: number;
    readonly north: number;
  },
  rules: BlitzMapRules,
  seed: number,
  measure: (regionId: string) => ReadonlyMap<string, number>,
): ReadonlyArray<string> {
  const center: LonLat = [(box.west + box.east) / 2, (box.south + box.north) / 2];
  const radius: LonLat = [
    ((box.east - box.west) / 2) * rules.hqRing,
    ((box.north - box.south) / 2) * rules.hqRing,
  ];
  const turn = ((((seed >>> 0) * 1_664_525 + 1_013_904_223) >>> 0) / 2 ** 32) * 2 * Math.PI;
  const step = (2 * Math.PI) / seats.length;

  let best: { hqs: ReadonlyArray<string>; evenness: number } | null = null;
  for (let attempt = 0; attempt < rules.hqTries; attempt += 1) {
    const used = new Set<string>();
    const hqs = seats.map((_, rank) => {
      const angle = turn + (attempt * step) / rules.hqTries + rank * step;
      const target = wrap([
        center[0] + radius[0] * Math.cos(angle),
        center[1] + radius[1] * Math.sin(angle),
      ]);
      const nearest = closest(candidates, target, used);
      used.add(nearest);
      return nearest;
    });
    const gaps = hqs.flatMap((hq, rank) =>
      hqs.slice(rank + 1).map((other) => measure(hq).get(other) ?? 0),
    );
    const evenness = gaps.length === 0 ? 1 : Math.min(...gaps) / Math.max(...gaps, 1);
    if (best === null || evenness > best.evenness) best = { hqs, evenness };
  }
  return best!.hqs;
}

const wrap = ([lon, lat]: LonLat): LonLat => [lon > 180 ? lon - 360 : lon, lat];

function closest(
  candidates: ReadonlyArray<BlitzCandidate>,
  target: LonLat,
  used: ReadonlySet<string>,
): string {
  let best: { regionId: string; km: number } | null = null;
  for (const candidate of candidates) {
    if (used.has(candidate.regionId)) continue;
    const km = distanceKm(candidate.point, target);
    if (best === null || km < best.km) best = { regionId: candidate.regionId, km };
  }
  return best!.regionId;
}
