import type { LonLat } from './geo';
import type { CombatReport } from './player-view';

/**
 * **Combien de temps un cratère reste sur la carte** (#642) : le délai d'une dernière position
 * connue. Choisi sans Pierre le 26/11 pour avancer, à corriger en préprod.
 * @a-mesurer
 */
export const TRACE_MS = 24 * 3_600_000;

/**
 * **Les paliers des pertes, des deux camps** (hommes et machines, ADR 0014) : un cratère au-dessus
 * de chaque seuil franchi. Un combat sans perte en laisse un : on a tiré là. Une infanterie MK1
 * vaut 50 hommes, d'où l'ordre de grandeur.
 * @a-mesurer
 */
export const CRATER_STEPS = [10, 40, 100, 250] as const;
export const MAX_CRATERS = CRATER_STEPS.length + 1;

/** Une trace de combat à poser : un lieu, un nombre de cratères, une encre de 1 (frais) à 0. */
export type BattleTrace = {
  readonly id: string;
  readonly point: LonLat;
  readonly craters: number;
  readonly ink: number;
};

export const cratersOf = (report: CombatReport): number => {
  const lost = report.mine.lost + report.theirs.lost;
  return 1 + CRATER_STEPS.filter((step) => lost >= step).length;
};

/**
 * **Le champ de bataille se souvient** (#642) : mes comptes rendus de combats livrés sur terre,
 * vus à `now`, rendent chacun sa trace — plus récente, plus noire ; à `TRACE_MS`, elle est partie.
 * Ce sont les comptes rendus servis au joueur et eux seuls : un combat d'autrui n'en a pas. Un
 * bombardement laisse la sienne au point visé, chez l'un comme chez l'autre. La mer attend ses
 * épaves (#643).
 */
export function battleTracesOf(reports: ReadonlyArray<CombatReport>, now: number): BattleTrace[] {
  const seen = new Set<string>();
  return reports.flatMap((report) => {
    // Une horloge un peu en retard sur le serveur voit un combat frais, pas aucun.
    const age = Math.max(0, now - report.at);
    if (report.atSea === true || age >= TRACE_MS || seen.has(report.id)) return [];
    seen.add(report.id);
    return [
      {
        id: report.id,
        point: [report.point.lon, report.point.lat] as const,
        craters: cratersOf(report),
        ink: 1 - age / TRACE_MS,
      },
    ];
  });
}
