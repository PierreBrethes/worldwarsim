import { PRESS_EDITION_HOURS } from '../../convex/constants';
import { distanceKm, type LonLat } from './geo';

/**
 * **Le vivier des points stratégiques** (P11, ADR 0027 §4) : dix lieux réels de 1940, publics, qui
 * ne produisent rien et cassent une règle pour qui les tient. Chaque saison en tire sept
 * (`drawPoints`), la course se joue à quatre sur sept.
 */
export const STRATEGIC_POINTS = {
  tangier: [-5.81, 35.77],
  istanbul: [28.98, 41.01],
  rangoon: [96.16, 16.8],
  hongKong: [114.17, 22.32],
  halifax: [-63.57, 44.65],
  narvik: [17.43, 68.44],
  lisbon: [-9.14, 38.72],
  baku: [49.87, 40.41],
  /** Posés sur la terre ferme que la grille de route connaît : le cap de Dakar tombe dans la mer
   *  de la maille (20 km), et l'île de Singapour n'y est pas du tout — sa rive de Johor, à 21 km,
   *  est la plus proche cellule qu'une colonne peut atteindre à pied. */
  dakar: [-17.25, 14.7],
  singapore: [103.7, 1.4],
} as const satisfies Record<string, LonLat>;

export type StrategicPointKey = keyof typeof STRATEGIC_POINTS;

export const STRATEGIC_POINT_KEYS = Object.keys(
  STRATEGIC_POINTS,
) as ReadonlyArray<StrategicPointKey>;

/** Ce que la règle d'un point touche : le tirage veut des familles variées. */
export type PointFamily = 'economy' | 'supply' | 'intel' | 'sea' | 'diplomacy';

/**
 * **Ce que le tirage lit d'un lieu** : sa famille, et ses étoiles (★ utile, ★★ forte, ★★★ change
 * la partie). Une donnée : ajuster un lieu se fait ici, jamais dans les contraintes du tirage.
 */
export const POINT_TRAITS = {
  tangier: { family: 'economy', stars: 2 },
  istanbul: { family: 'intel', stars: 2 },
  rangoon: { family: 'diplomacy', stars: 1 },
  hongKong: { family: 'intel', stars: 1 },
  halifax: { family: 'sea', stars: 1 },
  narvik: { family: 'economy', stars: 2 },
  lisbon: { family: 'intel', stars: 2 },
  baku: { family: 'supply', stars: 3 },
  dakar: { family: 'economy', stars: 2 },
  singapore: { family: 'supply', stars: 1 },
} as const satisfies Record<StrategicPointKey, { family: PointFamily; stars: 1 | 2 | 3 }>;

/** Les lieux tirés à chaque saison. */
export const POINTS_DRAWN = 7;

/** Contraintes de diversité du tirage (`gameplay-deux-modes` §Les points stratégiques). */
export const DRAW_RULES = { minFamilies: 4, maxThreeStars: 2, minOneStar: 2, minApartKm: 1500 };

/** Un tirage tient les contraintes de diversité, et deux points ne sont jamais voisins. */
export function drawHolds(keys: ReadonlyArray<StrategicPointKey>): boolean {
  const stars = (count: number) => keys.filter((key) => POINT_TRAITS[key].stars === count).length;
  if (new Set(keys.map((key) => POINT_TRAITS[key].family)).size < DRAW_RULES.minFamilies)
    return false;
  if (stars(3) > DRAW_RULES.maxThreeStars || stars(1) < DRAW_RULES.minOneStar) return false;
  return keys.every((a, index) =>
    keys
      .slice(index + 1)
      .every((b) => distanceKm(STRATEGIC_POINTS[a], STRATEGIC_POINTS[b]) >= DRAW_RULES.minApartKm),
  );
}

/**
 * **Le tirage de la saison, par sa graine** : parmi les sept-sur-dix qui tiennent les contraintes,
 * celui que la graine désigne. Sept et non dix, parce que la course se joue à quatre : sur dix,
 * deux joueurs en tiendraient quatre chacun, alors que sur sept le meneur est unique (4 + 4 > 7).
 *
 * L'équité de route depuis la capitale et l'exclusion du sol national du 14/10 ne sont pas lues :
 * elles demandent les nations et la grille de route.
 */
export function drawPoints(seed: number): ReadonlyArray<StrategicPointKey> {
  const fitting: Array<ReadonlyArray<StrategicPointKey>> = [];
  for (let mask = 0; mask < 1 << STRATEGIC_POINT_KEYS.length; mask += 1) {
    const keys = STRATEGIC_POINT_KEYS.filter((_, index) => mask & (1 << index));
    if (keys.length === POINTS_DRAWN && drawHolds(keys)) fitting.push(keys);
  }
  return fitting[Math.abs(Math.floor(seed)) % fitting.length]!;
}

/** Points held at once to win, and for how long (M1, ADR 0027 §4: fixed whatever the length). */
export const RACE_TO_WIN = 4;
export const RACE_HOLD_HOURS = 24;

/**
 * **Le meneur de la course** : celui qui tient au moins quatre des sept. Il ne peut y en avoir
 * qu'un (4 + 4 > 7). Le compte à rebours court tant qu'il en tient quatre, et repart à zéro s'il
 * passe sous la barre — une contestation ne l'arrête pas (P3).
 */
export function raceLeaderOf<Id extends string>(held: ReadonlyMap<Id, number>): Id | null {
  for (const [id, count] of held) if (count >= RACE_TO_WIN) return id;
  return null;
}

/**
 * **L'horloge sert de filet** (M12) : le plus d'heures de points tenus l'emporte, le territoire
 * départage, et à égalité parfaite personne ne gagne.
 */
export function clockVerdictOf<Id extends string>(
  lines: ReadonlyArray<{ readonly id: Id; readonly heldMs: number; readonly regions: number }>,
): { readonly winnerId: Id | null; readonly reason: 'clock' | 'territory' | 'draw' } {
  const best = (score: (line: (typeof lines)[number]) => number) => {
    const top = Math.max(...lines.map(score));
    return lines.filter((line) => score(line) === top);
  };
  const byHours = best((line) => line.heldMs);
  if (byHours.length === 1 && byHours[0]!.heldMs > 0)
    return { winnerId: byHours[0]!.id, reason: 'clock' };
  const contenders = byHours[0]!.heldMs > 0 ? byHours : lines;
  const top = Math.max(...contenders.map((line) => line.regions));
  const byLand = contenders.filter((line) => line.regions === top);
  return byLand.length === 1
    ? { winnerId: byLand[0]!.id, reason: 'territory' }
    : { winnerId: null, reason: 'draw' };
}

/** Istanbul se recharge chaque jour de saison, Tanger à chaque édition (P4, `PRESS_EDITION_HOURS`). */
export const ISTANBUL_PERIOD_HOURS = 24;
export const TANGIER_PERIOD_HOURS = PRESS_EDITION_HOURS;

/**
 * **Le comptoir de Tanger** : trois d'une ressource contre une d'une autre, par lot fixe.
 *
 * @a-mesurer posé pour la saison test ; rien ne mesure ce que vaut un échange par édition
 */
export const TANGIER_LOT = { give: 300, get: 100 } as const;

/**
 * **Un pouvoir de point se recharge par période de la saison, sans cumul** (P4) : servi une fois
 * dans une période, il revient à la suivante, quelle que soit l'heure où il a servi.
 */
export function powerReady(
  usedAt: number | undefined,
  launchedAt: number,
  periodHours: number,
  now: number,
): boolean {
  if (usedAt === undefined) return true;
  const period = (at: number) => Math.floor((at - launchedAt) / (periodHours * 3_600_000));
  return period(now) > period(usedAt);
}
