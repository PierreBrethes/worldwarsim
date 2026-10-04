import { describe, expect, it } from 'vitest';
import {
  fanOffsets,
  groupOverlapping,
  separatingDistance,
  type GroupCandidate,
  type ScreenBox,
} from './label-groups';

const box = (left: number, top: number, width = 80, height = 14): ScreenBox => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

const pile = (id: string, left: number, top: number, count = 1): GroupCandidate => ({
  id,
  kind: 'stack',
  box: box(left, top),
  x: left,
  y: top + 30,
  count,
});

describe('groupOverlapping', () => {
  it('leaves cartouches that do not touch on screen alone', () => {
    expect(groupOverlapping([pile('a', 0, 0), pile('b', 200, 0), pile('c', 0, 100)])).toEqual([]);
  });

  /** « 2 piles · 3 » : les piles, puis les troupes. */
  it('reads two overlapping piles as one cartouche counting piles then troops', () => {
    const [group, ...rest] = groupOverlapping([pile('a', 0, 0, 1), pile('b', 40, 6, 2)]);
    expect(rest).toEqual([]);
    expect(group).toMatchObject({
      kind: 'stack',
      members: ['a', 'b'],
      caption: '2 piles · 3',
      box: { left: 0, top: 0, right: 120, bottom: 20 },
    });
  });

  /** Deux cartouches que le repli séparerait se regroupent : sinon on verrait deux planches et
   *  un seul mot, sans rien à toucher pour les séparer. */
  it('groups what the fold margin would have folded, even without touching', () => {
    expect(groupOverlapping([pile('a', 0, 0), pile('b', 100, 0)])).toHaveLength(1);
    expect(groupOverlapping([pile('a', 0, 0), pile('b', 110, 0)])).toEqual([]);
  });

  /** A touche B, B touche C : un cartouche pour trois, sans quoi B serait seul deux fois. */
  it('chains overlaps transitively', () => {
    const groups = groupOverlapping([pile('a', 0, 0), pile('b', 70, 0), pile('c', 140, 0)]);
    expect(groups.map((group) => group.members)).toEqual([['a', 'b', 'c']]);
  });

  /** Une caserne n'est pas une pile : entre deux natures c'est le repli par priorité qui tranche. */
  it('never mixes a pile with a building, and counts buildings by the unit', () => {
    const groups = groupOverlapping([
      pile('a', 0, 0, 4),
      { id: 'mine', kind: 'building', box: box(10, 0), x: 10, y: 30, count: 1 },
      { id: 'port', kind: 'building', box: box(20, 4), x: 20, y: 34, count: 1 },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ members: ['mine', 'port'], caption: '2 bâtiments' });
  });

  it('keeps the candidates’ order, so the first member is the one the group stands for', () => {
    const [group] = groupOverlapping([pile('z', 50, 0), pile('a', 0, 0)]);
    expect(group?.members).toEqual(['z', 'a']);
    expect(group?.id).toBe('group-z');
  });
});

describe('separatingDistance', () => {
  /** L'écart à l'écran varie comme l'inverse de la distance : deux fois trop serrés, deux fois
   *  plus près. */
  it('divides the distance by how short the tightest pair falls', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 300, y: 0 },
    ];
    expect(separatingDistance(100, points, 80)).toBe(50);
  });

  it('never pulls the camera back', () => {
    expect(
      separatingDistance(
        100,
        [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
        ],
        80,
      ),
    ).toBe(100);
  });

  it('asks for the floor when two points coincide', () => {
    expect(
      separatingDistance(
        100,
        [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ],
        80,
      ),
    ).toBe(0);
  });
});

describe('fanOffsets', () => {
  it('leaves the first cartouche where it is and lifts the next just clear of it', () => {
    expect(fanOffsets([box(0, 100), box(30, 110)])).toEqual([0, 26]);
  });

  /** Un pied plus bas peut déjà dégager son cartouche : il ne monte pas pour rien. */
  it('lifts nothing that already stands clear', () => {
    expect(fanOffsets([box(0, 100), box(30, 130)])).toEqual([0, 0]);
  });

  it('stacks a third above both, never back down between them', () => {
    const [first, second, third] = fanOffsets([box(0, 100), box(10, 100), box(20, 100)]);
    expect(first).toBe(0);
    expect(second).toBe(16);
    expect(third).toBe(32);
  });
});
