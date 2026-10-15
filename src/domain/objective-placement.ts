import { distanceKm, type LonLat } from './geo';

/**
 * **Où la saison pose ses objectifs neutres** (`propositions/objectifs-neutres.md`, réécrit le
 * 17/09/2026). La règle est ici, pure et sans carte : elle dit **ce qu'il faut mesurer** et décide
 * sur les réponses. Ce qui mesure est le serveur — des champs de distances de route sur la grille
 * (`convex/routes.ts`) — et il ne décide de rien.
 *
 * **Le partage est celui du combat** (`src/domain/combat.ts` / `convex/combat.ts`) et pour la même
 * raison : une règle de répartition qui lit une grille ne se teste qu'en chargeant la carte, et
 * c'est ce qui a laissé la règle du 06/09 — « 2 à 3 par saison, à moins de 1 500 km de deux QG » —
 * ne rien placer hors d'Europe sans que rien le dise avant la simulation.
 *
 * Deux règles et pas une, parce que les objectifs ne servent pas la même chose :
 *
 * — **le proche** existe pour que le détour existe *partout* : deux par siège, à portée de saison,
 *   assez séparés l'un de l'autre pour qu'il y ait un choix à faire ;
 * — **le dur** existe pour la dispute : un par paire de voisins, au milieu de la route qui les
 *   sépare, refusé quand il ne serait le détour que d'un seul (`hardFairness`).
 */
export type ObjectiveSeat = { readonly id: string; readonly hq: LonLat };

export type ObjectiveCandidate = { readonly regionId: string; readonly point: LonLat };

export type ObjectiveDraw = { readonly key: string; readonly tier: 'easy' | 'medium' | 'hard' };

export type ObjectiveRules = {
  readonly nearKm: number;
  readonly spreadKm: number;
  readonly hardMinKm: number;
  readonly hardFairness: number;
  readonly hardMax: number;
};

/**
 * **Ce que la règle demande à la carte**, et rien de plus — deux questions, posées exactement
 * autant de fois qu'il y a de sièges et de paires retenues.
 *
 * La séparation n'est pas une politesse envers le domaine : un champ de distances borné à mille
 * kilomètres coûte vingt millisecondes, un champ mondial en coûte cent vingt, et la pose entière
 * doit tenir dans la seconde d'une mutation. La règle sait lequel des deux elle veut ; elle ne
 * saurait pas le calculer.
 */
export type ObjectiveMeasure = {
  /** Kilomètres de route depuis le QG d'un siège, pour les régions qu'il atteint sous `nearKm`. */
  readonly nearKmFrom: (seat: ObjectiveSeat) => ReadonlyMap<string, number>;
  /** Les deux champs d'une paire, `null` quand aucune route terrestre ne joint les deux QG. */
  readonly between: (
    left: ObjectiveSeat,
    right: ObjectiveSeat,
  ) => {
    readonly fromLeft: ReadonlyMap<string, number>;
    readonly fromRight: ReadonlyMap<string, number>;
  } | null;
};

type PlacedObjective = { readonly key: string; readonly regionId: string };

/**
 * Le plan complet : ce qui se pose, et les paires que la géographie prive de leur objectif
 * commun. La seconde liste n'est pas un échec — c'est ce que la dépêche de lancement dit en
 * toutes lettres, « aucune réserve signalée entre X et Y », parce qu'un silence se lirait comme
 * un oubli.
 */
export type ObjectivePlan = {
  readonly placed: ReadonlyArray<PlacedObjective>;
  readonly pairsWithoutObjective: ReadonlyArray<readonly [string, string]>;
};

/**
 * **Le tirage est une fonction du germe de la saison, jamais `Math.random`.** Deux poses du même
 * plan doivent donner la même carte : c'est ce qui rend un lancement rejouable et la pose
 * planifiée idempotente si le travail est repris.
 */
const drawOrder = <T>(items: ReadonlyArray<T>, seed: number): ReadonlyArray<T> => {
  const shuffled = [...items];
  let state = seed >>> 0 || 1;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const pick = state % (index + 1);
    [shuffled[index], shuffled[pick]] = [shuffled[pick]!, shuffled[index]!];
  }
  return shuffled;
};

/**
 * **Les paires de voisins** : les deux quartiers généraux les plus proches l'un de l'autre
 * d'abord, chaque siège dans deux paires au plus, et jamais plus de `hardMax` en tout.
 *
 * **Voisin se lit à vol d'oiseau, et c'est délibéré** : ce qu'on cherche est qui joue près de qui,
 * pas ce que coûte le trajet — et mesurer vingt-huit routes pour n'en garder que quatre ferait
 * payer à la pose les paires qu'elle écarte. La route entre ensuite, sur les seules paires
 * retenues : c'est elle qui dit s'il y a un objectif à poser, et où.
 */
export function neighbourPairs(
  seats: ReadonlyArray<ObjectiveSeat>,
  hardMax: number,
): ReadonlyArray<readonly [ObjectiveSeat, ObjectiveSeat]> {
  const pairs: Array<{ pair: readonly [ObjectiveSeat, ObjectiveSeat]; km: number }> = [];
  for (let left = 0; left < seats.length; left += 1) {
    for (let right = left + 1; right < seats.length; right += 1) {
      pairs.push({
        pair: [seats[left]!, seats[right]!],
        km: distanceKm(seats[left]!.hq, seats[right]!.hq),
      });
    }
  }
  pairs.sort((a, b) => a.km - b.km);

  const degree = new Map<string, number>();
  const kept: Array<readonly [ObjectiveSeat, ObjectiveSeat]> = [];
  for (const { pair } of pairs) {
    if (kept.length >= hardMax) break;
    const [left, right] = pair;
    if ((degree.get(left.id) ?? 0) >= 2 || (degree.get(right.id) ?? 0) >= 2) continue;
    degree.set(left.id, (degree.get(left.id) ?? 0) + 1);
    degree.set(right.id, (degree.get(right.id) ?? 0) + 1);
    kept.push(pair);
  }
  return kept;
}

export function planObjectives({
  seats,
  candidates,
  archetypes,
  rules,
  seed,
  measure,
}: {
  readonly seats: ReadonlyArray<ObjectiveSeat>;
  readonly candidates: ReadonlyArray<ObjectiveCandidate>;
  readonly archetypes: ReadonlyArray<ObjectiveDraw>;
  readonly rules: ObjectiveRules;
  readonly seed: number;
  readonly measure: ObjectiveMeasure;
}): ObjectivePlan {
  const taken = new Set<string>();
  const placed: Array<PlacedObjective> = [];

  const near = archetypes.filter((archetype) => archetype.tier !== 'hard');
  const hard = archetypes.filter((archetype) => archetype.tier === 'hard');

  seats.forEach((seat, rank) => {
    const pool = drawOrder(near, seed + rank * 7_919);
    const order = drawOrder(candidates, seed + rank * 104_729);
    const kilometres = measure.nearKmFrom(seat);
    const mine: Array<LonLat> = [];
    for (const candidate of order) {
      if (mine.length >= 2) break;
      if (taken.has(candidate.regionId)) continue;
      const km = kilometres.get(candidate.regionId);
      if (km === undefined || km > rules.nearKm) continue;
      /** **Deux prises, et un choix entre elles** : côte à côte, la seconde ne serait qu'un
       *  second voyage sur la même route, et le joueur n'aurait rien arbitré. */
      if (mine.some((other) => distanceKm(other, candidate.point) < rules.spreadKm)) continue;
      placed.push({ key: pool[mine.length % pool.length]!.key, regionId: candidate.regionId });
      taken.add(candidate.regionId);
      mine.push(candidate.point);
    }
  });

  const pairsWithoutObjective: Array<readonly [string, string]> = [];
  neighbourPairs(seats, rules.hardMax).forEach((pair, rank) => {
    const [left, right] = pair;
    const fields = measure.between(left, right);
    if (fields === null) {
      pairsWithoutObjective.push([left.id, right.id]);
      return;
    }
    /**
     * **La région qui minimise la plus grande des deux distances** — le milieu de la route, et
     * non le milieu géométrique : ce qu'on égalise est le trajet que chacun a à faire. Les deux
     * gardes qui l'entourent disent le reste — un détour (`hardMinKm`) et un détour partagé
     * (`hardFairness`).
     */
    let best: { regionId: string; farther: number } | null = null;
    for (const candidate of candidates) {
      if (taken.has(candidate.regionId)) continue;
      const fromLeft = fields.fromLeft.get(candidate.regionId);
      const fromRight = fields.fromRight.get(candidate.regionId);
      if (fromLeft === undefined || fromRight === undefined) continue;
      const closer = Math.min(fromLeft, fromRight);
      const farther = Math.max(fromLeft, fromRight);
      if (closer < rules.hardMinKm || closer < rules.hardFairness * farther) continue;
      if (
        best === null ||
        farther < best.farther ||
        (farther === best.farther && candidate.regionId < best.regionId)
      ) {
        best = { regionId: candidate.regionId, farther };
      }
    }
    if (best === null) {
      pairsWithoutObjective.push([left.id, right.id]);
      return;
    }
    placed.push({
      key: drawOrder(hard, seed + rank * 15_485_863)[0]!.key,
      regionId: best.regionId,
    });
    taken.add(best.regionId);
  });

  return { placed, pairsWithoutObjective };
}
