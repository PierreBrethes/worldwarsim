import { describe, expect, it } from 'vitest';
import { RAZE_MS, razeAt, razeRingAt, RAZE_RING_MS } from './raze';

describe('razeAt', () => {
  it('stands whole at the start: no sway, its full height, its own colour, no footprint', () => {
    expect(razeAt(0)).toEqual({ sway: 0, height: 1, char: 0, opacity: 1, ink: 0 });
  });

  it('trembles over its first 0.3 s, then is still', () => {
    expect(Math.abs(razeAt(25).sway)).toBeGreaterThan(0.001);
    expect(razeAt(300).sway).toBeCloseTo(0, 6);
    expect(razeAt(800).sway).toBeCloseTo(0, 6);
  });

  it('falls on itself to an eighth of its height by 1.2 s, blackening as it falls', () => {
    expect(razeAt(750).height).toBeLessThan(1);
    expect(razeAt(1200).height).toBeCloseTo(0.12);
    expect(razeAt(1200).char).toBeCloseTo(0.7);
    expect(razeAt(1800).char).toBeCloseTo(0.85);
  });

  it('holds, then the heap fades as its footprint of ink comes, which fades in turn by 3.2 s', () => {
    expect(razeAt(1800).opacity).toBe(1);
    expect(razeAt(2200).opacity).toBeCloseTo(0.5);
    expect(razeAt(2200).ink).toBe(1);
    expect(razeAt(2600).opacity).toBe(0);
    expect(razeAt(2900).ink).toBeCloseTo(0.5);
    expect(razeAt(RAZE_MS)).toMatchObject({ opacity: 0, ink: 0 });
    expect(RAZE_MS).toBe(3200);
  });
});

describe('razeRingAt', () => {
  it('opens a ring of ink in its place over 0.6 s, fading as it opens', () => {
    expect(razeRingAt(0)).toEqual({ size: 0.6, opacity: 0.6 });
    expect(razeRingAt(RAZE_RING_MS)).toEqual({ size: 1, opacity: 0 });
  });
});
