import { describe, expect, it } from 'vitest';
import { UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../convex/constants';
import { armyUpkeep, upkeepStep } from './upkeep';

describe('the army upkeep by steps (ADR 0028 §2)', () => {
  it('costs one a troop up to the tenth, two up to the twenty-fifth, three beyond', () => {
    expect(armyUpkeep(10, 0)).toBe(10);
    expect(armyUpkeep(11, 0)).toBe(12);
    expect(armyUpkeep(25, 0)).toBe(10 + 15 * 2);
    expect(armyUpkeep(26, 0)).toBe(10 + 15 * 2 + 3);
    expect(armyUpkeep(40, 0)).toBe(10 + 15 * 2 + 15 * 3);
  });

  it('bills nothing to an empty army', () => {
    expect(armyUpkeep(0, 0)).toBe(0);
  });

  it('doubles the troops outside every anchor, taken after the ones at home', () => {
    expect(armyUpkeep(0, 1)).toBe(UPKEEP_UNSUPPLIED_MULTIPLIER);
    // Twelve at home then two abroad: ranks 13 and 14 sit on the second step.
    expect(armyUpkeep(12, 2)).toBe(armyUpkeep(12, 0) + 2 * 2 * UPKEEP_UNSUPPLIED_MULTIPLIER);
    expect(armyUpkeep(10, 1)).toBe(10 + 2 * UPKEEP_UNSUPPLIED_MULTIPLIER);
  });
});

describe('the step the next troop will pay', () => {
  it('says its rate and where the next step begins', () => {
    expect(upkeepStep(0)).toEqual({ rate: 1, nextAt: 11, nextRate: 2 });
    expect(upkeepStep(9)).toEqual({ rate: 1, nextAt: 11, nextRate: 2 });
    expect(upkeepStep(10)).toEqual({ rate: 2, nextAt: 26, nextRate: 3 });
    expect(upkeepStep(25)).toEqual({ rate: 3, nextAt: null, nextRate: null });
  });
});
