import type { LonLat } from './geo';
import type { JournalDispatch } from './player-view';

export type InkBurst = { readonly kind: 'arrival' | 'combat'; readonly at: LonLat };

/**
 * The map stamps only what a dispatch already tells the player, never more: a combat the player
 * is a party to (the report carries its point), and an arrival of the player's own column. An arrival
 * dispatch names no place, so its place is the end of the thread that just disappeared.
 * `seenAt` keeps out the dispatches already there when the map opened.
 */
export function inkBursts(
  journal: ReadonlyArray<JournalDispatch>,
  seenAt: number,
  vanishedEnds: ReadonlyArray<LonLat>,
): ReadonlyArray<InkBurst> {
  const fresh = journal.filter((dispatch) => dispatch.at > seenAt);
  const combats = fresh.flatMap((dispatch): InkBurst[] =>
    dispatch.combat === null
      ? []
      : [{ kind: 'combat', at: [dispatch.combat.point.lon, dispatch.combat.point.lat] }],
  );
  // A dispatch does not name its movement: the ends only pair with the dispatches when every
  // vanished thread has one. Otherwise an attack resolved alongside would steal the stamp.
  const paired =
    vanishedEnds.length === fresh.filter((dispatch) => dispatch.kind === 'column').length;
  const arrivals = paired ? vanishedEnds.map((at): InkBurst => ({ kind: 'arrival', at })) : [];
  return [...combats, ...arrivals];
}
