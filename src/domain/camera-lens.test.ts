import { describe, expect, it } from 'vitest';
import { eyeDistanceFactor, LENS_FOV } from './camera-lens';

const halfHeight = (fov: number, distance: number) => Math.tan((fov * Math.PI) / 360) * distance;

describe('eyeDistanceFactor', () => {
  it('is one for the game lens', () => {
    expect(eyeDistanceFactor('game')).toBe(1);
  });

  it('backs the long lens off until the looked-at plane frames the same', () => {
    const distance = 30;
    expect(halfHeight(LENS_FOV.poc, distance * eyeDistanceFactor('poc'))).toBeCloseTo(
      halfHeight(LENS_FOV.game, distance),
    );
  });
});
