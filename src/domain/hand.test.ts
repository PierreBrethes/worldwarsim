import { describe, expect, it } from 'vitest';
import { clickPile, composeHand, type Hand } from './hand';
import type { MarchStation } from './troops';

const A: MarchStation = { kind: 'building', buildingId: 'a' as never };
const B: MarchStation = { kind: 'outpost', outpostId: 'b' as never };
const empty: Hand = { kind: 'empty' };
const held = (troopIds: string[], station = A): Hand => ({ kind: 'held', station, troopIds });

describe('clickPile', () => {
  it('lifts the clicked troops with an empty hand', () => {
    expect(clickPile(empty, { station: A, troopIds: ['t1'], shift: false })).toEqual({
      kind: 'lift',
      hand: held(['t1']),
    });
  });

  it('drops when the held piece is clicked again', () => {
    expect(clickPile(held(['t1', 't2']), { station: A, troopIds: ['t2'], shift: false })).toEqual({
      kind: 'drop',
    });
  });

  it('switches group when the clicked troops are not all held', () => {
    expect(clickPile(held(['t1']), { station: A, troopIds: ['t2'], shift: false })).toEqual({
      kind: 'lift',
      hand: held(['t2']),
    });
  });

  it('shift adds to the hand, held first, no duplicates', () => {
    expect(
      clickPile(held(['t1', 't2']), { station: A, troopIds: ['t3', 't1'], shift: true }),
    ).toEqual({
      kind: 'lift',
      hand: held(['t1', 't2', 't3']),
    });
  });

  it('shift on a group already held leaves the hand unchanged', () => {
    const hand = held(['t1', 't2']);
    expect(clickPile(hand, { station: A, troopIds: ['t1'], shift: true })).toEqual({
      kind: 'lift',
      hand,
    });
  });

  it('poses on another address', () => {
    expect(clickPile(held(['t1']), { station: B, troopIds: ['t9'], shift: false })).toEqual({
      kind: 'pose',
    });
  });

  it('compares stations by key, not identity', () => {
    const same: MarchStation = { kind: 'building', buildingId: 'a' as never };
    expect(clickPile(held(['t1']), { station: same, troopIds: ['t1'], shift: false })).toEqual({
      kind: 'drop',
    });
  });

  it('ignores a click with no troops', () => {
    const hand = held(['t1']);
    expect(clickPile(hand, { station: B, troopIds: [], shift: false })).toEqual({
      kind: 'lift',
      hand,
    });
    expect(clickPile(empty, { station: A, troopIds: [], shift: false })).toEqual({ kind: 'drop' });
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
