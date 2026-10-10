import type { LonLat } from './geo';
import type { JournalDispatch } from './player-view';

export type InkBurst = { readonly kind: 'arrival' | 'combat'; readonly at: LonLat };

/**
 * The map stamps only what a dispatch already tells the player, never more: a combat where he
 * is a party (the report carries its point), and an arrival of his own column. An arrival
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
  const arrivals = vanishedEnds
    .slice(0, fresh.filter((dispatch) => dispatch.kind === 'column').length)
    .map((at): InkBurst => ({ kind: 'arrival', at }));
  return [...combats, ...arrivals];
}
