import { describe, expect, it } from 'vitest';
import { harvestOf, pastilleShares } from './harvest';

const HOUR = 3_600_000;
const stocks = (food: number, steel = 0, coal = 0, oil = 0, ammunition = 0) => ({
  food,
  steel,
  coal,
  oil,
  ammunition,
});

describe('the harvest of the personal board (ADR 0028 §7)', () => {
  it('is what each store gained or lost since the last opening, in the order of the stores', () => {
    const read = { at: 0, stocks: stocks(100, 50, 20) };
    expect(harvestOf(read, stocks(208, 20, 20), 9 * HOUR)).toEqual({
      hours: 9,
      deltas: [
        { resource: 'food', amount: 108 },
        { resource: 'steel', amount: -30 },
      ],
    });
  });

  it('has nothing to say on a first opening, nor when no store moved', () => {
    expect(harvestOf(null, stocks(100), HOUR)).toBeNull();
    expect(harvestOf({ at: 0, stocks: stocks(100) }, stocks(100), HOUR)).toBeNull();
  });

  it('counts a store the last reading did not know from zero', () => {
    expect(harvestOf({ at: 0, stocks: {} }, stocks(0, 0, 0, 0, 12), HOUR)?.deltas).toEqual([
      { resource: 'ammunition', amount: 12 },
    ]);
  });
});

describe('the pastilles that show a flow, never a count', () => {
  it('splits an amount into a few shares that add up to it', () => {
    expect(pastilleShares(108)).toEqual([22, 22, 22, 21, 21]);
    expect(pastilleShares(3)).toEqual([1, 1, 1]);
    expect(pastilleShares(1)).toEqual([1]);
  });

  it('flies none for nothing, and splits a loss as a gain', () => {
    expect(pastilleShares(0)).toEqual([]);
    expect(pastilleShares(-30)).toEqual([6, 6, 6, 6, 6]);
  });
});
