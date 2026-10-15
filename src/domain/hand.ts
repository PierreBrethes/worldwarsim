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
 *  hand or out of it — the last one out puts the piece back. In a Blitz, `units` says what a
 *  piece is (`clickUnit`). */
export function clickPile(
  hand: Hand,
  click: PileClick,
  { units }: { units?: Units } = {},
): HandMove {
  if (units !== undefined) return clickUnit(hand, click, units);
  const troopIds = click.kind === 'pile' ? click.troopIds : [click.troopId];
  if (troopIds.length === 0) return unchanged(hand);
  if (hand.kind === 'empty')
    return click.kind === 'pile'
      ? { kind: 'lift', hand: { kind: 'held', station: click.station, troopIds } }
      : unchanged(hand);
  if (stationKeyOf(hand.station) !== stationKeyOf(click.station)) return { kind: 'pose' };
  if (click.kind === 'pile') return { kind: 'drop' };
  const rest = hand.troopIds.filter((id) => id !== click.troopId);
  return composeHand(
    hand,
    rest.length === hand.troopIds.length ? [...hand.troopIds, click.troopId] : rest,
  );
}

/** The ticked troops are the hand; in a Blitz, the last one ticked says the unit (`tickedUnit`). */
export function composeHand(
  hand: Hand,
  troopIds: ReadonlyArray<string>,
  { units }: { units?: Units } = {},
): HandMove {
  if (hand.kind === 'empty' || troopIds.length === 0) return { kind: 'drop' };
  return {
    kind: 'lift',
    hand: { ...hand, troopIds: units === undefined ? troopIds : tickedUnit(hand, troopIds, units) },
  };
}

/** **Les unités d'une adresse** (`unitsOf`), en identifiants : en Blitz, une pièce chacune. */
type Units = ReadonlyArray<ReadonlyArray<string>>;

/**
 * **En Blitz, une pièce par unité** (règle de Pierre, 15/10) : la figurine d'une unité la lève
 * entière, transport et passagers ; l'étiquette de l'adresse, qui les couvre toutes, les passe
 * en revue et repose la dernière.
 */
function clickUnit(hand: Hand, click: PileClick, units: Units): HandMove {
  const ids = click.kind === 'pile' ? click.troopIds : [click.troopId];
  if (ids.length === 0) return unchanged(hand);
  if (hand.kind === 'held' && stationKeyOf(hand.station) !== stationKeyOf(click.station))
    return { kind: 'pose' };
  const named = units.find((unit) => ids.every((id) => unit.includes(id)));
  const holding =
    hand.kind === 'held' ? units.findIndex((unit) => unit.includes(hand.troopIds[0]!)) : -1;
  const next = named ?? units[holding + 1];
  if (next === undefined) return { kind: 'drop' };
  if (hand.kind === 'held' && hand.troopIds.join() === next.join()) return { kind: 'drop' };
  return { kind: 'lift', hand: { kind: 'held', station: click.station, troopIds: next } };
}

/** La case cochée la dernière dit l'unité : un transport l'emmène entière, un passager part
 *  seul — c'est ainsi qu'on débarque. Une case décochée garde ce qui reste de l'unité tenue. */
function tickedUnit(
  hand: Extract<Hand, { kind: 'held' }>,
  troopIds: ReadonlyArray<string>,
  units: Units,
): ReadonlyArray<string> {
  const ticked = troopIds.filter((id) => !hand.troopIds.includes(id)).at(-1);
  if (ticked !== undefined) {
    const unit = units.find((candidate) => candidate.includes(ticked));
    return unit?.[0] === ticked ? unit : [ticked];
  }
  const unit = units.find((candidate) => candidate.includes(troopIds[0]!)) ?? [];
  return troopIds.filter((id) => unit.includes(id));
}
