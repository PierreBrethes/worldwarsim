import type { MapMotion } from '@/domain/map-motion';

/**
 * **What the engine does with a hull's boarding cue** (#504): `wait` for the hull to stand, then
 * settle it — the sequences of #479 and after play here, until then the final pose, with its
 * ring of ink at reduced motion —, or settle `now`: nothing is played at off motion, a second
 * boarding on a hull whose first is still waiting joins it (one sequence per hull), and a hull
 * that docks plays its docking, not a boarding.
 */
export function embarkingOf(
  motion: MapMotion,
  { pending, docking }: { readonly pending: boolean; readonly docking: boolean },
): 'wait' | 'now' {
  return motion === 'off' || pending || docking ? 'now' : 'wait';
}
