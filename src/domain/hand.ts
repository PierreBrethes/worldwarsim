// The hand is the lifted piece (ADR 0026 §6): a click either takes, puts back, or names a
// destination, so the map and the side sheet agree on one rule.
import { stationKeyOf, type MarchStation } from './troops';

export type Hand =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'held';
      readonly station: MarchStation;
      readonly troopIds: ReadonlyArray<string>;
    };

/**
 * A left click on one of my own piles: the pile itself (a group, its label, a counter), or one
 * troop of the pile **deployed** at the foot of the piece in hand (ADR 0026 §6, 13/10).
 */
export type PileClick =
  | {
      readonly kind: 'pile';
      readonly station: MarchStation;
      readonly troopIds: ReadonlyArray<string>;
    }
  | { readonly kind: 'troop'; readonly station: MarchStation; readonly troopId: string };

export type HandMove =
  | { readonly kind: 'lift'; readonly hand: Hand }
  | { readonly kind: 'drop' }
  | { readonly kind: 'pose' };

const unchanged = (hand: Hand): HandMove =>
  hand.kind === 'held' ? { kind: 'lift', hand } : { kind: 'drop' };

/** Lifting takes the whole pile; held, the pile deploys and each of its troops goes into the
 *  hand or out of it — the last one out puts the piece back. */
export function clickPile(hand: Hand, click: PileClick): HandMove {
  const troopIds = click.kind === 'pile' ? click.troopIds : [click.troopId];
  if (troopIds.length === 0) return unchanged(hand);
  if (hand.kind === 'empty')
    return { kind: 'lift', hand: { kind: 'held', station: click.station, troopIds } };
  if (stationKeyOf(hand.station) !== stationKeyOf(click.station)) return { kind: 'pose' };
  if (click.kind === 'pile') return { kind: 'drop' };
  const rest = hand.troopIds.filter((id) => id !== click.troopId);
  return composeHand(
    hand,
    rest.length === hand.troopIds.length ? [...hand.troopIds, click.troopId] : rest,
  );
}

export function composeHand(hand: Hand, troopIds: ReadonlyArray<string>): HandMove {
  if (hand.kind === 'empty' || troopIds.length === 0) return { kind: 'drop' };
  return { kind: 'lift', hand: { ...hand, troopIds } };
}
