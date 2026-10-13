import { describe, expect, it } from 'vitest';
import { DROP_DONE, dropLift, followShare, GLIDE, RETURN_DONE, returnAt, swayAt } from './landing';

describe('dropLift', () => {
  it('falls in 0.14 s, bounces a tenth of the drop, and rests', () => {
    expect(dropLift(0, 2)).toBe(2);
    expect(dropLift(0.07, 2)).toBeCloseTo(0.5);
    expect(dropLift(0.14 + 0.06, 2)).toBeCloseTo(0.2);
    expect(dropLift(DROP_DONE, 2)).toBe(0);
  });
});

describe('returnAt', () => {
  it('glides home in a hop, then drops from the carried height', () => {
    expect(returnAt(0, 1, 0.5)).toEqual({ share: 0, lift: 1 });
    expect(returnAt(GLIDE / 2, 1, 0.5)).toEqual({ share: 0.5, lift: 1.5 });
    expect(returnAt(GLIDE, 1, 0.5)).toEqual({ share: 1, lift: 1 });
    expect(returnAt(RETURN_DONE, 1, 0.5)).toEqual({ share: 1, lift: 0 });
  });

  it('hops up first when the piece was already down', () => {
    expect(returnAt(GLIDE / 2, 0, 0.5).lift).toBeCloseTo(0.5);
  });
});

describe('swayAt', () => {
  it('rests upright at the start and leans no further than 0.15 into a drag', () => {
    expect(swayAt(0, { x: 0, z: 0 })).toEqual({ x: 0, z: 0 });
    expect(swayAt(0, { x: 9, z: -9 })).toEqual({ x: -0.15, z: -0.15 });
  });
});

describe('followShare', () => {
  it('closes 14 per second of the gap, and never overshoots', () => {
    expect(followShare(1 / 60, 14)).toBeCloseTo(0.233, 3);
    expect(followShare(1, 14)).toBe(1);
  });
});
