// The hand is the lifted piece (ADR 0026 §6): a click either takes, puts back, or names a
// destination, so the map and the side sheet agree on one rule.
import { cargoOf, seatsOf, stationKeyOf, type MarchStation, type Seated } from './troops';

export type Hand =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'held';
      readonly station: MarchStation;
      readonly troopIds: ReadonlyArray<string>;
    };

/**
 * A left click on one of my own piles: the pile itself (a piece of it, its label), or one troop
 * of a squad taken alone by a long press (16/10).
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

/** Lifting takes the whole pile; held, a click on its pile puts it back and one elsewhere poses
 *  it. A single troop is taken by a long press and a drag (`carry`), never by a click. In a
 *  Blitz, `units` says what a piece is (`clickUnit`). */
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
  return { kind: 'drop' };
}

/** A troop and what it carries, at every level: a passenger never leaves without its transport. */
const withCargo = (troopIds: ReadonlyArray<string>, pile: ReadonlyArray<Seated>): string[] =>
  troopIds.flatMap((id) => {
    const troop = pile.find((one) => one.id === id);
    return [id, ...(troop === undefined ? [] : cargoOf(troop, pile).map((rider) => rider.id))];
  });

/**
 * **What a drag takes** (glisser-déposer, 15/10): a deployed troop alone — that is how a pile
 * splits —, or the pile, unless the hand already holds part of it there.
 */
export function carry(hand: Hand, click: PileClick, pile: ReadonlyArray<Seated>): Hand {
  if (click.kind === 'troop')
    return { kind: 'held', station: click.station, troopIds: withCargo([click.troopId], pile) };
  if (hand.kind === 'held' && stationKeyOf(hand.station) === stationKeyOf(click.station))
    return hand;
  return { kind: 'held', station: click.station, troopIds: click.troopIds };
}

export type HandDrop =
  | { readonly kind: 'board'; readonly carrierId: string }
  | { readonly kind: 'putBack' }
  | { readonly kind: 'pose' };

/** **The piece aimed at**: a pile click names the whole pile, but a drop lands on one drawn piece. */
export function aimAt(click: PileClick, pieceIds: ReadonlyArray<string>): PileClick {
  return click.kind === 'pile' && pieceIds.length > 0 ? { ...click, troopIds: pieceIds } : click;
}

/**
 * **Where the dragged piece lands** (15/10): on a transport of its own address it boards, on
 * itself or on a troop that carries nobody it is put back, and anywhere else it is set down —
 * the rose then says what can be done there.
 */
export function dropOn(hand: Hand, click: PileClick, pile: ReadonlyArray<Seated>): HandDrop {
  if (hand.kind === 'empty') return { kind: 'putBack' };
  if (stationKeyOf(hand.station) !== stationKeyOf(click.station)) return { kind: 'pose' };
  const aimed = click.kind === 'pile' ? click.troopIds : [click.troopId];
  if (aimed.some((id) => hand.troopIds.includes(id))) return { kind: 'putBack' };
  const carrier = pile.find((troop) => aimed.includes(troop.id) && seatsOf(troop.role) > 0);
  return carrier === undefined ? { kind: 'putBack' } : { kind: 'board', carrierId: carrier.id };
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
