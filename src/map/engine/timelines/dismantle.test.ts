import { describe, expect, it } from 'vitest';
import { dismantleSweepAt, DISMANTLE_SWEEP_MS, pinFallAt, PIN_FALL_MS } from './dismantle';

describe('pinFallAt', () => {
  it('stands upright and whole at the start', () => {
    expect(pinFallAt(0, 'full')).toEqual({ tilt: 0, opacity: 1 });
  });

  it('tips onto its low point in 0.5 s, still drawn, then fades out', () => {
    const tipped = pinFallAt(500, 'full');
    expect(tipped.tilt).toBeCloseTo(1.52);
    expect(tipped.opacity).toBe(1);
    expect(pinFallAt(PIN_FALL_MS, 'full')).toEqual({ tilt: 1.52, opacity: 0 });
  });

  it('only fades when motion is reduced: it does not tip', () => {
    expect(pinFallAt(PIN_FALL_MS / 2, 'reduced').tilt).toBe(0);
    expect(pinFallAt(PIN_FALL_MS / 2, 'reduced').opacity).toBeCloseTo(0.5);
    expect(pinFallAt(PIN_FALL_MS, 'reduced').opacity).toBe(0);
  });
});

describe('dismantleSweepAt', () => {
  it('erases the area turning from the north: nothing at first, all at the end', () => {
    expect(dismantleSweepAt(0)).toBe(0);
    expect(dismantleSweepAt(DISMANTLE_SWEEP_MS / 2)).toBeCloseTo(0.5);
    expect(dismantleSweepAt(DISMANTLE_SWEEP_MS)).toBe(1);
  });
});
