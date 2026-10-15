import { describe, expect, it } from 'vitest';
import { carry, clickPile, composeHand, dropOn, type Hand } from './hand';
import type { MarchStation } from './troops';

const A: MarchStation = { kind: 'building', buildingId: 'a' as never };
const B: MarchStation = { kind: 'outpost', outpostId: 'b' as never };
const empty: Hand = { kind: 'empty' };
const held = (troopIds: string[], station = A): Hand => ({ kind: 'held', station, troopIds });
const pile = (troopIds: string[], station: MarchStation = A) => ({
  kind: 'pile' as const,
  station,
  troopIds,
});
const troop = (troopId: string, station: MarchStation = A) => ({
  kind: 'troop' as const,
  station,
  troopId,
});

describe('clickPile', () => {
  it('lifts the whole pile with an empty hand', () => {
    expect(clickPile(empty, pile(['t1', 't2']))).toEqual({
      kind: 'lift',
      hand: held(['t1', 't2']),
    });
  });

  it('puts the piece back on a click on its pile, whatever part of it is in hand', () => {
    expect(clickPile(held(['t1', 't2']), pile(['t1', 't2']))).toEqual({ kind: 'drop' });
    expect(clickPile(held(['t1']), pile(['t1', 't2']))).toEqual({ kind: 'drop' });
  });

  it('poses on another address', () => {
    expect(clickPile(held(['t1']), pile(['t9'], B))).toEqual({ kind: 'pose' });
    expect(clickPile(held(['t1']), troop('t9', B))).toEqual({ kind: 'pose' });
  });

  it('compares stations by key, not identity', () => {
    const same: MarchStation = { kind: 'building', buildingId: 'a' as never };
    expect(clickPile(held(['t1']), pile(['t1'], same))).toEqual({ kind: 'drop' });
  });

  it('ignores a pile click with no troops', () => {
    const hand = held(['t1']);
    expect(clickPile(hand, pile([], B))).toEqual({ kind: 'lift', hand });
    expect(clickPile(empty, pile([]))).toEqual({ kind: 'drop' });
  });

  it('a deployed troop goes into the hand, after those already in it', () => {
    expect(clickPile(held(['t1']), troop('t3'))).toEqual({
      kind: 'lift',
      hand: held(['t1', 't3']),
    });
  });

  it('a deployed troop in hand leaves it, and the last one puts the piece back', () => {
    expect(clickPile(held(['t1', 't2']), troop('t1'))).toEqual({
      kind: 'lift',
      hand: held(['t2']),
    });
    expect(clickPile(held(['t1']), troop('t1'))).toEqual({ kind: 'drop' });
  });

  it('a deployed troop means nothing with an empty hand: lifting takes the whole pile', () => {
    expect(clickPile(empty, troop('t1'))).toEqual({ kind: 'drop' });
  });
});

describe('composeHand', () => {
  it('holds exactly the ticked troops', () => {
    expect(composeHand(held(['t1']), ['t2', 't3'])).toEqual({
      kind: 'lift',
      hand: held(['t2', 't3']),
    });
  });

  it('drops on an empty selection', () => {
    expect(composeHand(held(['t1']), [])).toEqual({ kind: 'drop' });
  });

  it('drops with an empty hand', () => {
    expect(composeHand(empty, ['t1'])).toEqual({ kind: 'drop' });
  });
});

describe('clickPile in a Blitz: one piece per unit (15/10)', () => {
  /** Deux fantassins côte à côte, et un cargo avec son passager. */
  const units = { units: [['i1'], ['i2'], ['c1', 'p1']] };

  it('lifts the unit whose piece is clicked, a transport with its passengers', () => {
    expect(clickPile(empty, pile(['i2']), units)).toEqual({ kind: 'lift', hand: held(['i2']) });
    expect(clickPile(empty, pile(['c1', 'p1']), units)).toEqual({
      kind: 'lift',
      hand: held(['c1', 'p1']),
    });
  });

  it('puts it back on a second click, and swaps for another unit of the same address', () => {
    expect(clickPile(held(['i2']), pile(['i2']), units)).toEqual({ kind: 'drop' });
    expect(clickPile(held(['i1']), pile(['i2']), units)).toEqual({
      kind: 'lift',
      hand: held(['i2']),
    });
  });

  it('walks the units of an address from its label, then puts the last back', () => {
    const label = pile(['i1', 'i2', 'c1', 'p1']);
    expect(clickPile(empty, label, units)).toEqual({ kind: 'lift', hand: held(['i1']) });
    expect(clickPile(held(['i1']), label, units)).toEqual({ kind: 'lift', hand: held(['i2']) });
    expect(clickPile(held(['i2']), label, units)).toEqual({
      kind: 'lift',
      hand: held(['c1', 'p1']),
    });
    expect(clickPile(held(['c1', 'p1']), label, units)).toEqual({ kind: 'drop' });
  });

  it('ticks a transport with its passengers, a passenger alone to land it', () => {
    expect(composeHand(held(['i1']), ['i1', 'c1'], units)).toEqual({
      kind: 'lift',
      hand: held(['c1', 'p1']),
    });
    expect(composeHand(held(['c1', 'p1']), ['p1'], units)).toEqual({
      kind: 'lift',
      hand: held(['p1']),
    });
    expect(composeHand(held(['p1']), ['p1', 'i2'], units)).toEqual({
      kind: 'lift',
      hand: held(['i2']),
    });
  });
});

/** **Porter et lâcher la pièce** (glisser-déposer, 15/10) : on la prend en la tirant, on la lâche
 *  où l'on veut. Sur un transport de la même adresse, elle embarque ; sur elle-même, elle se
 *  repose ; ailleurs, c'est poser — la rose dit le reste. */
describe('carrying and dropping the piece', () => {
  const at = [
    { id: 't1', role: 'infantry' as const },
    { id: 't2', role: 'infantry' as const },
    { id: 'c', role: 'cargo' as const },
    { id: 'r', role: 'infantry' as const, carriedBy: 'c' },
  ];

  it('takes a deployed troop alone, and a transport with what it carries', () => {
    expect(carry(held(['t1', 't2', 'c', 'r']), troop('t2'), at)).toEqual(held(['t2']));
    expect(carry(empty, troop('c'), at)).toEqual(held(['c', 'r']));
  });

  it('takes the whole pile, and keeps the hand it already holds there', () => {
    expect(carry(empty, pile(['t1', 't2', 'c', 'r']), at)).toEqual(held(['t1', 't2', 'c', 'r']));
    expect(carry(held(['t1']), pile(['t1', 't2', 'c', 'r']), at)).toEqual(held(['t1']));
  });

  it('boards a transport of its own address', () => {
    expect(dropOn(held(['t1']), troop('c'), at)).toEqual({ kind: 'board', carrierId: 'c' });
    expect(dropOn(held(['t1']), pile(['c', 'r']), at)).toEqual({ kind: 'board', carrierId: 'c' });
  });

  it('puts the piece back on itself, or on a troop that carries nobody', () => {
    expect(dropOn(held(['t1']), pile(['t1', 't2', 'c', 'r']), at)).toEqual({ kind: 'putBack' });
    expect(dropOn(held(['t1']), troop('t2'), at)).toEqual({ kind: 'putBack' });
  });

  it('poses on another address', () => {
    expect(dropOn(held(['t1']), pile(['t9'], B), at)).toEqual({ kind: 'pose' });
  });

  it('keeps a transport and its passengers together in the hand', () => {
    expect(clickPile(held(['t1']), troop('c'), { pile: at })).toEqual({
      kind: 'lift',
      hand: held(['t1', 'c', 'r']),
    });
    expect(clickPile(held(['t1', 'c', 'r']), troop('c'), { pile: at })).toEqual({
      kind: 'lift',
      hand: held(['t1']),
    });
  });
});
