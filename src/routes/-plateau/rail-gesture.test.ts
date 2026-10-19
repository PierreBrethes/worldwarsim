import { describe, expect, it } from 'vitest';
import { glideFrom, intentOf } from './rail-gesture';

/** #162 : sur une rangée de la bande, le geste horizontal défile, le geste vers le haut prend. */
describe('what a press on a rail of the personal board means', () => {
  it('waits while the pointer has not left its slop', () => {
    expect(intentOf(3, -4, 8, true)).toBe('undecided');
  });

  it('scrolls on a horizontal gesture, over a tile or not', () => {
    expect(intentOf(20, -6, 8, true)).toBe('scroll');
    expect(intentOf(-20, 3, 8, false)).toBe('scroll');
  });

  it('lifts a tile on an upward gesture', () => {
    expect(intentOf(4, -20, 8, true)).toBe('lift');
  });

  it('does nothing on a downward gesture, nor upward where nothing lifts', () => {
    expect(intentOf(2, 20, 8, true)).toBe('none');
    expect(intentOf(2, -20, 8, false)).toBe('none');
  });
});

describe('the glide a flung rail keeps', () => {
  it('slows to a stop, and goes the way it was flung', () => {
    const steps = glideFrom(1.2, 16);
    expect(steps.length).toBeGreaterThan(5);
    expect(steps.every((step) => step > 0)).toBe(true);
    expect(steps.at(-1)!).toBeLessThan(steps[0]!);
    expect(glideFrom(-1.2, 16).every((step) => step < 0)).toBe(true);
  });

  it('does not glide from a slow release', () => {
    expect(glideFrom(0.01, 16)).toEqual([]);
  });
});
