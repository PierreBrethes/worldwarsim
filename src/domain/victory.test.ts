import { describe, expect, it } from 'vitest';
import { isReduced, playersToReduce, type Force } from './victory';

const troop = (strength: number, nominalStrength = 50): Force => ({ strength, nominalStrength });

describe('the bar of the simplified Domination', () => {
  it('reads the current strengths against the nominal ones, not a count of troops', () => {
    // Two troops standing either way — what moves the bar is the men left, not the head count.
    expect(isReduced([troop(50), troop(50)], 0.5)).toBe(false);
    expect(isReduced([troop(30), troop(10)], 0.5)).toBe(true);
  });

  it('holds a player standing at exactly the factor — the bar is passed under, not touched', () => {
    expect(isReduced([troop(25)], 0.5)).toBe(false);
    expect(isReduced([troop(24)], 0.5)).toBe(true);
  });

  it('counts a player with nothing standing as reduced', () => {
    expect(isReduced([], 0.5)).toBe(true);
  });

  it('weighs a mixed column by strength, so a full armour does not cover a spent infantry', () => {
    const column = [troop(50, 50), troop(1, 12)];
    expect(isReduced(column, 0.5)).toBe(false);
    expect(isReduced([troop(5, 50), troop(1, 12)], 0.5)).toBe(true);
  });
});

describe('how many players the target names', () => {
  it('asks for one at two players, and never for nobody', () => {
    expect(playersToReduce(2)).toBe(1);
    expect(playersToReduce(1)).toBe(1);
  });

  it('scales on n rather than on the cumulated capacity (design sheet 05)', () => {
    expect(playersToReduce(3)).toBe(1);
    expect(playersToReduce(4)).toBe(2);
    expect(playersToReduce(8)).toBe(4);
  });
});
