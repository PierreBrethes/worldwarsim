import { describe, expect, it } from 'vitest';
import { arriving, departs, homing, moors } from './site-ways';
import type { Sequence } from './sequences';

const away: Sequence = { ms: 1000, at: () => ({ root: { travel: [40, 30, -20], heading: 1 } }) };

describe('a take-off whose thread leaves from its pile (#269)', () => {
  it('plays as it is, then flies home to the pawn it ends on', () => {
    const home = homing(away);
    expect(home.at(0).root?.travel).toEqual([40, 30, -20]);
    expect(home.ms).toBe(1000);
    for (const v of home.at(1000).root?.travel ?? [1]) expect(v).toBeCloseTo(0);
  });
});

describe('a landing whose thread came in to its pile (#269)', () => {
  it('starts where the pawn stood, then joins its track', () => {
    const land = arriving(away, [-5, 0, 7]);
    expect(land.at(0).root?.travel).toEqual([-5, 0, 7]);
    expect(land.at(1000).root?.travel).toEqual([40, 30, -20]);
    expect(land.ms).toBe(1000);
  });
});

describe('a thread moored to its runway end or offshore (#269, #270)', () => {
  const at = { x: 0, z: 0 };
  const end = { x: 1, z: 0 };
  it('moors a long flight, and a thread with no far end', () => {
    expect(moors(at, end, { x: 3, z: 0 }, false)).toBe(true);
    expect(moors(at, end, null, false)).toBe(true);
  });
  it('leaves a short flight at its point', () => {
    expect(moors(at, end, { x: 2.9, z: 0 }, false)).toBe(false);
  });
  it('never moors in a theatre (Blitz)', () => {
    expect(moors(at, end, { x: 30, z: 0 }, true)).toBe(false);
    expect(moors(at, end, null, true)).toBe(false);
  });
});

describe('a departure (#269, #270)', () => {
  it('plays for a plane whatever its flight, for a hull only moored', () => {
    expect(departs(true, false)).toBe(true);
    expect(departs(false, true)).toBe(true);
    expect(departs(false, false)).toBe(false);
  });
});
