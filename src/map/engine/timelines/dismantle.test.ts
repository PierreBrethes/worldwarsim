import { describe, expect, it } from 'vitest';
import { dismantleSweepAt, DISMANTLE_SWEEP_MS, pinFallAt, PIN_FALL_MS } from './dismantle';

describe('pinFallAt', () => {
  it('stands upright and whole at the start', () => {
    expect(pinFallAt(0)).toEqual({ tilt: 0, opacity: 1 });
  });

  it('tips onto its low point in 0.5 s, still drawn, then fades out', () => {
    const tipped = pinFallAt(500);
    expect(tipped.tilt).toBeCloseTo(1.52);
    expect(tipped.opacity).toBe(1);
    expect(pinFallAt(PIN_FALL_MS)).toEqual({ tilt: 1.52, opacity: 0 });
  });
});

describe('dismantleSweepAt', () => {
  it('waits for the pin to tip, then erases the area turning from the north (0.6 s to 1.8 s)', () => {
    expect(dismantleSweepAt(0)).toBe(0);
    expect(dismantleSweepAt(600)).toBe(0);
    expect(dismantleSweepAt(1200)).toBeCloseTo(0.5);
    expect(dismantleSweepAt(DISMANTLE_SWEEP_MS)).toBe(1);
    expect(DISMANTLE_SWEEP_MS).toBe(1800);
  });
});
