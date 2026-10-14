import { describe, expect, it } from 'vitest';
import { clickPile, composeHand, type Hand } from './hand';
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

describe('clickPile in a Blitz (one unit at a time)', () => {
  const single = { single: true };

  it('lifts the troop clicked, never the whole pile', () => {
    expect(clickPile(empty, pile(['t1', 't2']), single)).toEqual({
      kind: 'lift',
      hand: held(['t1']),
    });
  });

  it('puts it back on a second click', () => {
    expect(clickPile(held(['t1']), pile(['t1', 't2']), single)).toEqual({ kind: 'drop' });
  });

  it('swaps for another troop standing at the same address', () => {
    expect(clickPile(held(['t1']), pile(['t2']), single)).toEqual({
      kind: 'lift',
      hand: held(['t2']),
    });
  });

  it('composes nothing', () => {
    expect(composeHand(held(['t1']), ['t1', 't2'], single)).toEqual({
      kind: 'lift',
      hand: held(['t2']),
    });
  });
});
