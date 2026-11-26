import { describe, expect, it } from 'vitest';
import type { StrategicPointView } from './player-view';
import { nationInk } from './nations';
import { STRATEGIC_POINT_KEYS, STRATEGIC_POINTS } from './strategic-points';
import { MAST_PX, MAST_UNITS, mastOf, mastPx } from './strategic-mast';

const point = (over: Partial<StrategicPointView> = {}): StrategicPointView => ({
  id: 'p',
  key: 'lisbon',
  regionId: 'r',
  point: STRATEGIC_POINTS.lisbon,
  holder: null,
  heldSince: null,
  mine: false,
  contested: false,
  longest: null,
  ...over,
});
const held = (nation: string) => ({ nation, heldMs: 0 });

describe('mastOf', () => {
  it('neutral: white flame at the top, no ring, no star', () => {
    expect(mastOf(point(), false)).toEqual({
      ink: '#ffffff',
      flameAt: 1,
      ring: false,
      star: false,
    });
  });
  it('held: the holder ink', () => {
    expect(mastOf(point({ holder: held('germany') }), false).ink).toBe(nationInk('germany'));
  });
  it('contested: flame lowered to 0.42, ring on', () => {
    const mast = mastOf(point({ holder: held('germany'), contested: true }), false);
    expect(mast).toMatchObject({ flameAt: 0.42, ring: true });
  });
  it('neutral and contested: white lowered flame and a ring', () => {
    expect(mastOf(point({ contested: true }), false)).toMatchObject({
      ink: '#ffffff',
      flameAt: 0.42,
      ring: true,
    });
  });
  it('holder without a nation keeps the grey of nationInk', () => {
    expect(mastOf(point({ holder: held('Pseudo') }), false).ink).toBe(nationInk('Pseudo'));
  });
  it('concluded season: no ring, flame still lowered', () => {
    expect(mastOf(point({ contested: true }), true)).toMatchObject({ ring: false, flameAt: 0.42 });
  });
  it('mine: star', () => {
    expect(mastOf(point({ mine: true }), false).star).toBe(true);
  });
  it('the ten keys of the pool', () => {
    for (const key of STRATEGIC_POINT_KEYS) {
      const mast = mastOf(point({ key, point: STRATEGIC_POINTS[key], contested: true }), false);
      expect(mast.ring).toBe(true);
    }
  });
});

describe('mastPx', () => {
  it('floor 56 up to distance 53, linear to 30 at 136 and beyond, x0.7 on a phone (the floor only)', () => {
    expect(mastPx(3, false, 900, 42)).toBeGreaterThan(56);
    expect(mastPx(18, false, 900, 42)).toBeGreaterThanOrEqual(56);
    expect(mastPx(53, false, 900, 42)).toBe(56);
    expect(mastPx(136, false, 900, 42)).toBe(30);
    expect(mastPx(300, false, 900, 42)).toBe(30);
    expect(mastPx(94.5, false, 900, 42)).toBeCloseTo(43, 5);
    expect(mastPx(53, true, 900, 42)).toBeCloseTo(39.2, 5);
    expect(mastPx(136, true, 900, 42)).toBeCloseTo(21, 5);
    // Close up the real size rules: a phone's smaller screen is already in the viewport height.
    expect(mastPx(3, true, 900, 42)).toBe(mastPx(3, false, 900, 42));
  });
  it('reads the real size against the viewport and the FOV it is given', () => {
    const base = mastPx(3, false, 900, 42);
    expect(mastPx(3, false, 1800, 42)).toBeCloseTo(2 * base, 5);
    expect(mastPx(3, false, 600, 42)).toBeCloseTo((2 / 3) * base, 5);
    expect(mastPx(3, false, 900, 21)).toBeGreaterThan(base);
    // The floor does not depend on the screen.
    expect(mastPx(136, false, 400, 42)).toBe(30);
  });
  it('exports the sizes', () => {
    expect(MAST_UNITS.height).toBe(0.46);
    expect(MAST_PX.near).toBe(56);
  });
});
