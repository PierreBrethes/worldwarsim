import { describe, expect, it } from 'vitest';
import { asSpan } from './duration';

describe('asSpan', () => {
  it('reads seconds, minutes and hours the way a statistic is read', () => {
    expect(asSpan(0.75)).toBe('45 s');
    expect(asSpan(1.5)).toBe('1 min 30');
    expect(asSpan(2)).toBe('2 min');
    expect(asSpan(45)).toBe('45 min');
    expect(asSpan(168)).toBe('2 h 48');
    expect(asSpan(360)).toBe('6 h');
    expect(asSpan(61)).toBe('1 h 01');
  });

  it('never prints sixty of the smaller unit', () => {
    expect(asSpan(1.999)).toBe('2 min');
    expect(asSpan(119.6)).toBe('2 h');
  });
});
