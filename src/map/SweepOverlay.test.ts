import { describe, expect, it } from 'vitest';
import { cardOpacity, RUNNING_OPACITY } from './SweepOverlay';

describe('cardOpacity', () => {
  it('fades a held card while the wave runs, full at its end or under the pointer', () => {
    expect(cardOpacity(true, true, false)).toBe(RUNNING_OPACITY);
    expect(cardOpacity(true, false, false)).toBe(1);
    expect(cardOpacity(true, true, true)).toBe(1);
  });
  it('shows nothing before held', () => {
    expect(cardOpacity(false, true, true)).toBe(0);
  });
});
