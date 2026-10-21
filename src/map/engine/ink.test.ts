import { describe, expect, it } from 'vitest';
import { penEase } from './ink';

describe('penEase', () => {
  it('starts slow, ends slow, and passes through the middle', () => {
    expect(penEase(0)).toBe(0);
    expect(penEase(1)).toBe(1);
    expect(penEase(0.5)).toBe(0.5);
    expect(penEase(0.2)).toBeLessThan(0.2);
    expect(penEase(0.8)).toBeGreaterThan(0.8);
  });
});
