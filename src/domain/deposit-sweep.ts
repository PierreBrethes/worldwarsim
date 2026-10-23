import { freeDeposits } from './construction';
import { siteOfPoint, type Reach } from './economy';
import { bearingDegrees, distanceKm, type LonLat } from './geo';
import type { DepositKey } from './ids';
import { ADM0_BY_NATION, isNation } from './nations';
import type { PlayerView } from './player-view';
import type { DepositPoint } from './world';

/**
 * **Sonder la carte** (#249) : une onde part du centre de la vue et nomme les gisements libres
 * d'une espèce qu'elle atteint. Une aide de lecture, sans coût ni délai : elle ne lit que la vue —
 * un gisement exploité par un adversaire jamais relevé y paraît libre, comme partout ailleurs.
 */

/** Jusqu'où court l'onde : au-delà, aucun n'est à portée. @a-mesurer */
export const SWEEP_RANGE_KM = 1000;
/** Sa course, de zéro à `SWEEP_RANGE_KM`. @a-mesurer */
export const SWEEP_MS = 3000;
/** Combien de gisements elle nomme, les plus proches. */
const SWEEP_FOUND = 3;
/** L'onde part lentement et s'élance, comme une goutte qui s'étale (maquette). */
const SWEEP_EASE = 1.6;

/** Le front de l'onde, en kilomètres du centre, `ms` après son départ. */
export const sweepFrontKm = (ms: number): number =>
  SWEEP_RANGE_KM * Math.min(1, Math.max(0, ms / SWEEP_MS)) ** SWEEP_EASE;

/** Un gisement libre de l'espèce, et s'il se prend d'ici : sur le sol national ou sous un rayon. */
export type SweepCandidate = { readonly deposit: DepositPoint; readonly reached: boolean };

export function sweepCandidates(
  view: PlayerView,
  species: DepositKey,
  reaches: ReadonlyArray<Reach>,
): SweepCandidate[] {
  const home = isNation(view.me.nation) ? ADM0_BY_NATION[view.me.nation] : null;
  return freeDeposits(view)
    .filter((deposit) => deposit.deposit === species)
    .map((deposit) => ({
      deposit,
      reached: siteOfPoint(deposit.lonLat, deposit.country === home, reaches) !== null,
    }));
}

/** Un gisement que l'onde nomme : à quelle distance, quel cap, et quand le front l'atteint. */
export type SweepHit = SweepCandidate & {
  readonly km: number;
  readonly bearing: number;
  readonly hitMs: number;
};

/**
 * **Ce que l'onde trouve** depuis `from` : les trois plus proches dans sa course, du plus près au
 * plus loin ; quand elle n'en trouve aucun, le plus proche de tous (`nearest`), pour la dépêche.
 */
export function depositSweep(
  candidates: ReadonlyArray<SweepCandidate>,
  from: LonLat,
): { readonly found: SweepHit[]; readonly nearest: SweepHit | null } {
  const sorted = candidates
    .map((candidate) => {
      const km = distanceKm(from, candidate.deposit.lonLat);
      return {
        ...candidate,
        km,
        bearing: bearingDegrees(from, candidate.deposit.lonLat),
        hitMs: SWEEP_MS * (Math.min(km, SWEEP_RANGE_KM) / SWEEP_RANGE_KM) ** (1 / SWEEP_EASE),
      };
    })
    .sort((a, b) => a.km - b.km);
  const found = sorted.slice(0, SWEEP_FOUND).filter((hit) => hit.km <= SWEEP_RANGE_KM);
  return { found, nearest: found.length === 0 ? (sorted[0] ?? null) : null };
}
