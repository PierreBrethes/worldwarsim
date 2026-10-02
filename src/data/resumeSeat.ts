import type { Id } from '../../convex/_generated/dataModel';
import { destinationOf, type SeasonStatus } from '@/domain/off-season';
import { keepSeat } from './session';

/**
 * **Reprendre une place** — depuis l'accueil comme depuis une invitation : la place devient
 * l'active, puis le salon ou le plateau s'ouvre selon `destinationOf`. Chaque page dit seulement
 * *comment* elle y va (l'accueil passe le plateau par son sas de lancement), jamais *où*.
 */
export function resumeSeat(
  seat: {
    readonly seasonId: Id<'seasons'>;
    readonly status: SeasonStatus;
    readonly atWar: boolean;
  },
  to: { readonly salon: () => void; readonly plateau: () => void },
): void {
  keepSeat(seat.seasonId);
  to[destinationOf(seat)]();
}
