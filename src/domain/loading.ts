import { PLUNDER_HOURS_PRESENT } from '../../convex/constants';
import type { ArcView } from './player-view';

/** One crate drops beside the pile at each quarter of the presence (table d'état-major, 14). */
const CRATES = 4;

export type Loading = {
  /** 0..1, the presence elapsed: the loot itself is only taken at its end. */
  readonly share: number;
  readonly minutesLeft: number;
  readonly crates: number;
};

/** **Only my expedition on site loads**: the presence end lives on the owner's branch alone. */
export function loadingUntilOf(arc: ArcView): number | null {
  if (arc.state !== 'mine') return null;
  const mission = arc.mission;
  return mission?.kind === 'plunder' && mission.phase === 'presence'
    ? mission.presenceEndsAt
    : null;
}

export function loadingAt(until: number, now: number): Loading {
  const total = PLUNDER_HOURS_PRESENT * 3_600_000;
  const share = Math.min(1, Math.max(0, 1 - (until - now) / total));
  return {
    share,
    minutesLeft: Math.max(0, (until - now) / 60_000),
    crates: Math.floor(share * CRATES),
  };
}
