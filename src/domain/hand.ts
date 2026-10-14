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
export function clickPile(hand: Hand, click: PileClick, { single = false } = {}): HandMove {
  const all = click.kind === 'pile' ? click.troopIds : [click.troopId];
  /** **En Blitz une troupe part seule** (B15) : le clic prend la figurine touchée, jamais la pile. */
  const troopIds = single ? all.slice(0, 1) : all;
  if (troopIds.length === 0) return unchanged(hand);
  if (hand.kind === 'empty')
    return click.kind === 'pile'
      ? { kind: 'lift', hand: { kind: 'held', station: click.station, troopIds } }
      : unchanged(hand);
  if (stationKeyOf(hand.station) !== stationKeyOf(click.station)) return { kind: 'pose' };
  if (single)
    return hand.troopIds.includes(troopIds[0]!)
      ? { kind: 'drop' }
      : { kind: 'lift', hand: { ...hand, troopIds } };
  if (click.kind === 'pile') return { kind: 'drop' };
  const rest = hand.troopIds.filter((id) => id !== click.troopId);
  return composeHand(
    hand,
    rest.length === hand.troopIds.length ? [...hand.troopIds, click.troopId] : rest,
  );
}

/** En Blitz, cocher une autre case change de troupe au lieu d'en ajouter une : la dernière
 *  cochée est celle qu'on tient. */
export function composeHand(
  hand: Hand,
  troopIds: ReadonlyArray<string>,
  { single = false } = {},
): HandMove {
  const kept = single
    ? troopIds.filter((id) => hand.kind === 'empty' || !hand.troopIds.includes(id)).slice(-1)
    : troopIds;
  if (hand.kind === 'empty' || troopIds.length === 0) return { kind: 'drop' };
  return {
    kind: 'lift',
    hand: { ...hand, troopIds: kept.length === 0 ? troopIds.slice(0, 1) : kept },
  };
}
