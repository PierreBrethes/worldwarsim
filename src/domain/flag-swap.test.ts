import { describe, expect, it } from 'vitest';
import { FLAG_FADE_MS, FLAG_FOOT, flagSwapAt, flagSwapMs } from './flag-swap';
import { FLAG_SWAP_MS } from './ink-bursts';
import { MAST_UNITS } from './strategic-mast';

const at = (ms: number, motion: 'full' | 'reduced' | 'off' = 'full', from = 1, to = 1) =>
  flagSwapAt(ms, motion, from, to);

describe('flagSwapAt', () => {
  it('lasts the 1.6 s the seal waits for, in full motion only', () => {
    expect(flagSwapMs('full')).toBe(FLAG_SWAP_MS);
    expect(flagSwapMs('reduced')).toBe(FLAG_FADE_MS);
    expect(flagSwapMs('off')).toBe(0);
  });

  it('sends the flame down from where it flew to the foot of the mast, in the old ink', () => {
    expect(at(0)).toEqual({ flameAt: 1, mix: 0 });
    const half = at(FLAG_SWAP_MS / 4);
    expect(half.flameAt).toBeGreaterThan(FLAG_FOOT);
    expect(half.flameAt).toBeLessThan(1);
    expect(half.mix).toBe(0);
  });

  it('changes ink at the foot, and only there', () => {
    const foot = at(FLAG_SWAP_MS / 2);
    expect(foot.flameAt).toBeCloseTo(FLAG_FOOT);
    expect(at(FLAG_SWAP_MS / 2 - 1).mix).toBe(0);
    expect(at(FLAG_SWAP_MS / 2).mix).toBe(1);
  });

  it('rises to where the new flame flies, a contested one at its own height', () => {
    expect(at(FLAG_SWAP_MS, 'full', 1, 0.42)).toEqual({ flameAt: 0.42, mix: 1 });
    expect(at(FLAG_SWAP_MS * 2, 'full', 1, 1)).toEqual({ flameAt: 1, mix: 1 });
    const rising = at((FLAG_SWAP_MS * 3) / 4, 'full', 0.42, 1);
    expect(rising.flameAt).toBeGreaterThan(FLAG_FOOT);
    expect(rising.flameAt).toBeLessThan(1);
  });

  it('never dips under the foot, even for a flame already low', () => {
    for (let ms = 0; ms <= FLAG_SWAP_MS; ms += 100)
      expect(at(ms, 'full', 0.42, 0.42).flameAt).toBeGreaterThanOrEqual(
        Math.min(FLAG_FOOT, 0.42) - 1e-9,
      );
  });

  it('keeps the foot a pennant above the ground', () => {
    expect(FLAG_FOOT).toBeCloseTo(MAST_UNITS.flame / MAST_UNITS.height);
  });

  it('fades the ink in reduced motion, the flame staying where it flies', () => {
    expect(at(0, 'reduced', 1, 0.42)).toEqual({ flameAt: 0.42, mix: 0 });
    expect(at(FLAG_FADE_MS / 2, 'reduced').mix).toBeCloseTo(0.5);
    expect(at(FLAG_FADE_MS, 'reduced').mix).toBe(1);
  });

  it('cuts the ink at once with motion off', () => {
    expect(at(0, 'off', 1, 0.42)).toEqual({ flameAt: 0.42, mix: 1 });
  });
});
