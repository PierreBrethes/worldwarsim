import type { LonLat } from './geo';

/**
 * **Les points stratégiques de la saison test** (P11, ADR 0027 §4) : le premier vivier, moins
 * Bakou, Dakar et Singapour qui attendent l'économie de la Mondiale. Ils sont sept, donc **les
 * sept sont tirés à chaque saison**, sans les contraintes de tirage du 14/10 (décision de Pierre,
 * 18/10) : le tirage par la graine reviendra avec un vivier plus large.
 *
 * Chacun est un lieu réel de 1940, public, qui ne produit rien et casse une règle pour qui le tient.
 */
export const STRATEGIC_POINTS = {
  tangier: [-5.81, 35.77],
  istanbul: [28.98, 41.01],
  rangoon: [96.16, 16.8],
  hongKong: [114.17, 22.32],
  halifax: [-63.57, 44.65],
  narvik: [17.43, 68.44],
  lisbon: [-9.14, 38.72],
} as const satisfies Record<string, LonLat>;

export type StrategicPointKey = keyof typeof STRATEGIC_POINTS;

export const STRATEGIC_POINT_KEYS = Object.keys(
  STRATEGIC_POINTS,
) as ReadonlyArray<StrategicPointKey>;

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
export const TANGIER_PERIOD_HOURS = 3;

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
