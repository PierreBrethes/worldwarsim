import type { SeasonStatus } from './off-season';
import type { SeasonMode } from './season-mode';

export type FrontSeat = {
  readonly mode: SeasonMode;
  readonly status: SeasonStatus;
  readonly scheduledAt: number | null;
  readonly createdAt: number;
  /** Un salon qui attend ce joueur : sa nation, son « prêt », ou son lancement. */
  readonly awaited: boolean;
};

const SOON_MS = 3 * 3_600_000;

/**
 * **La une se trie par urgence** (choix 13) : une Blitz en cours, une Blitz dont le rendez-vous
 * tombe dans les trois heures, une Mondiale qui court, un salon qui m'attend, les autres salons,
 * les parties conclues. À rang égal, la plus récente d'abord.
 */
function rankOf(seat: FrontSeat, now: number): number {
  if (seat.status === 'concluded') return 5;
  if (seat.status === 'launched') return seat.mode === 'blitz' ? 0 : 2;
  if (seat.mode === 'blitz' && seat.scheduledAt !== null && seat.scheduledAt - now < SOON_MS) {
    return 1;
  }
  return seat.awaited ? 3 : 4;
}

export const frontPageOrder = <Seat extends FrontSeat>(
  seats: ReadonlyArray<Seat>,
  now: number,
): Seat[] =>
  [...seats].sort(
    (left, right) => rankOf(left, now) - rankOf(right, now) || right.createdAt - left.createdAt,
  );
