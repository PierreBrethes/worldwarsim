import { describe, expect, it } from 'vitest';
import { ease } from './curves';
import { lengthOf, walkOut } from './walk';

/** From inside the door (2 back, faded), through it, down the steps, then left to the rank. */
const path = [
  [0, 0, -3],
  [0, 0, -2],
  [-1, 0, -2],
  [-1, 0, -1],
  [0, 0, 0],
] as const;
const walk = walkOut({ path, start: 300, ms: 3000, curve: ease.march, stride: true });

describe('walkOut', () => {
  it('rests on the model at the start and once arrived', () => {
    expect(walk.at(0)).toEqual({});
    expect(walk.at(walk.ms)).toEqual({});
    expect(walk.ms).toBe(3300);
  });

  it('waits in the dark of the doorway before its start', () => {
    const { root } = walk.at(100);
    expect(root?.travel).toEqual([0, 0, -3]);
    expect(root?.fade).toBe(0);
  });

  it('comes out of the dark over its first leg, then walks whole', () => {
    expect(walk.at(300 + 50).root?.fade).toBeGreaterThan(0);
    expect(walk.at(300 + 50).root?.fade).toBeLessThan(1);
    expect(walk.at(300 + 2000).root?.fade).toBe(1);
  });

  it('faces the way it walks, and marches while it does', () => {
    // Half way on the leg toward -x (path length 1 + 1 + 1 + √2: the second leg is 1..2).
    const length = 3 + Math.SQRT2;
    const t = 300 + 3000 * findK((k) => ease.march(k) * length, 1.5);
    const { root } = walk.at(t);
    expect(root?.travel?.[0]).toBeCloseTo(-0.5, 1);
    expect(root?.travel?.[2]).toBeCloseTo(-2, 1);
    expect(root?.heading).toBeCloseTo(-Math.PI / 2, 1);
    expect(root?.stride).toBeGreaterThan(0);
  });

  it('arrives on its rank, facing the last leg', () => {
    const { root } = walk.at(walk.ms - 1);
    expect(root?.travel?.[0]).toBeCloseTo(0, 2);
    expect(root?.travel?.[2]).toBeCloseTo(0, 2);
    expect(root?.heading).toBeCloseTo(Math.PI / 4, 1);
  });

  it('says when it has passed a point of its path', () => {
    const door = walk.passed(1);
    const steps = walk.passed(2);
    expect(door).toBeGreaterThan(300);
    expect(steps).toBeGreaterThan(door);
    expect(steps).toBeLessThan(walk.ms);
    expect(walk.at(steps).root?.travel?.[0]).toBeCloseTo(-1, 1);
  });
});

/** The k in 0..1 where `f` reaches `value`, `f` growing. */
function findK(f: (k: number) => number, value: number): number {
  let [low, high] = [0, 1];
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (f(mid) < value) low = mid;
    else high = mid;
  }
  return low;
}

describe('lengthOf', () => {
  it('measures a path leg by leg: what its walk lasts at its pace', () => {
    expect(lengthOf(path)).toBeCloseTo(3 + Math.SQRT2);
    expect(lengthOf([[1, 2, 3]])).toBe(0);
  });
});
