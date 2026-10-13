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

/** A left click on one of my own piles: a group of figurines, or the whole pile (label, counter). */
export type PileClick = {
  readonly station: MarchStation;
  readonly troopIds: ReadonlyArray<string>;
  readonly shift: boolean;
};

export type HandMove =
  | { readonly kind: 'lift'; readonly hand: Hand }
  | { readonly kind: 'drop' }
  | { readonly kind: 'pose' };

const unchanged = (hand: Hand): HandMove =>
  hand.kind === 'held' ? { kind: 'lift', hand } : { kind: 'drop' };

export function clickPile(hand: Hand, click: PileClick): HandMove {
  if (click.troopIds.length === 0) return unchanged(hand);
  if (hand.kind === 'empty') {
    return {
      kind: 'lift',
      hand: { kind: 'held', station: click.station, troopIds: click.troopIds },
    };
  }
  if (stationKeyOf(hand.station) !== stationKeyOf(click.station)) return { kind: 'pose' };
  const inHand = new Set(hand.troopIds);
  if (click.shift) {
    const troopIds = [...new Set([...hand.troopIds, ...click.troopIds])];
    return { kind: 'lift', hand: { ...hand, troopIds } };
  }
  if (click.troopIds.every((id) => inHand.has(id))) return { kind: 'drop' };
  return { kind: 'lift', hand: { kind: 'held', station: click.station, troopIds: click.troopIds } };
}

export function composeHand(hand: Hand, troopIds: ReadonlyArray<string>): HandMove {
  if (hand.kind === 'empty' || troopIds.length === 0) return { kind: 'drop' };
  return { kind: 'lift', hand: { ...hand, troopIds } };
}
