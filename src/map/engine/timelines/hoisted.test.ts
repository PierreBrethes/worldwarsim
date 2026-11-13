import { describe, expect, it } from 'vitest';
import { BOOM, type Boom, liftOf } from './derrick';
import type { P3 } from './gangway';
import { hoistedOf } from './hoisted';

const boom: Boom = {
  n: 1,
  length: BOOM,
  pivot: [0.6, 6.5, 27.8],
  rest: { yaw: 0, lift: 0.43 },
  hatch: { at: [0, 5.2, 35.65], rim: 5.2 },
};
const lift = liftOf({ boom, spot: [-10, 2.2, 27.8], height: 3, start: 3000 });
// The board is the hull's metres, shifted: a hull turned stem to the land would turn them over.
const toBoard = (p: P3): P3 => [100 - p[0], p[1], 200 - p[2]];
const path: P3[] = [
  [10, 2.2, 90],
  [10, 2.2, 150],
  [90, 2.2, 172.2],
];
const seq = hoistedOf({
  path,
  driveStart: 500,
  arrive: 2500,
  lift,
  toBoard,
  swing: (yaw) => -yaw,
});

describe('hoistedOf (#505)', () => {
  it('stands at its rest until it sets off, then drives its path to the spot', () => {
    expect(seq.at(0)).toEqual({});
    const mid = seq.at(1500).root!;
    expect(mid.travel![2]).toBeGreaterThan(0);
    const there = seq.at(2600).root!;
    expect(there.travel![0]).toBeCloseTo(80, 6);
    expect(there.travel![2]).toBeCloseTo(82.2, 6);
    expect(there.fade).toBeUndefined();
  });

  it('waits under the tip while the load is slung, then is carried where the hook is', () => {
    const wait = seq.at(lift.lifted - 5).root!;
    expect(wait.travel![0]).toBeCloseTo(80, 6);
    expect(wait.travel![2]).toBeCloseTo(82.2, 6);
    const air = seq.at(lift.over - 1).root!;
    const { load } = lift.at(lift.over - 1);
    const board = toBoard(load!);
    expect(air.travel![0]).toBeCloseTo(board[0] - 10, 6);
    expect(air.travel![1]).toBeCloseTo(board[1] - 2.2, 6);
    expect(air.travel![2]).toBeCloseTo(board[2] - 90, 6);
    expect(air.travel![1]).toBeGreaterThan(5);
  });

  it('turns with the mast as it slews over the hold, and keeps its heading before', () => {
    const before = seq.at(lift.lifted).root!.heading!;
    const after = seq.at(lift.over).root!.heading!;
    expect(seq.at(lift.lifted - 5).root!.heading).toBeCloseTo(before, 6);
    expect(Math.abs(after - before)).toBeGreaterThan(0.5);
  });

  it('fades across the coaming and is gone once lowered, never before it is over the hold', () => {
    expect(seq.at(lift.over - 1).root!.fade).toBe(1);
    expect(seq.at(lift.dropped - 1).root!.fade).toBeLessThan(0.1);
    expect(seq.at(seq.ms - 1).root!.fade).toBe(0);
    expect(seq.at(seq.ms)).toEqual({});
  });

  it('plays in the pool of the pieces that board, from out of the image', () => {
    expect(seq.pool).toBe('boarding');
    expect(seq.anywhere).toBe(true);
  });
});
