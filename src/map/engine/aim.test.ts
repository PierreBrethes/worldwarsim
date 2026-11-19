import { describe, expect, it } from 'vitest';
import { aimRibbonOf } from './aim';

const reading = { from: 'home', to: 'there' };
const route = ['a', 'b', 'c'];

describe('aimRibbonOf', () => {
  it('draws the road a finger keeps, in the ink of its verdict, with nothing in the hand', () => {
    expect(aimRibbonOf({ kept: 'fight', route, reading: null, verdict: 'none' })).toEqual({
      points: route,
      tone: 'fight',
    });
  });

  it('keeps a refused road in the refusal ink too: the finger has already been told', () => {
    expect(aimRibbonOf({ kept: 'refused', route, reading, verdict: 'order' }).tone).toBe('refused');
  });

  it('falls back to the hand while the kept road has not come', () => {
    expect(aimRibbonOf({ kept: 'order', route: null, reading, verdict: 'order' })).toEqual({
      points: ['home', 'there'],
      tone: 'order',
    });
  });

  it('draws nothing without a hand or a kept road', () => {
    expect(aimRibbonOf({ kept: null, route, reading: null, verdict: 'order' }).points).toBeNull();
    expect(aimRibbonOf({ kept: null, route, reading, verdict: 'none' })).toEqual({
      points: null,
      tone: 'order',
    });
  });

  it('draws the server road under the pointer, and a straight line once refused', () => {
    expect(aimRibbonOf({ kept: null, route, reading, verdict: 'order' }).points).toBe(route);
    expect(aimRibbonOf({ kept: null, route, reading, verdict: 'refused' }).points).toEqual([
      'home',
      'there',
    ]);
  });
});
