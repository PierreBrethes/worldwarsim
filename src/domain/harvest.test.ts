import { describe, expect, it } from 'vitest';
import { harvestOf, pastilleShares } from './harvest';

const HOUR = 3_600_000;
const stores = (cap = 400, ratePerHour = 0) =>
  Object.fromEntries(
    ['food', 'steel', 'coal', 'oil', 'ammunition'].map((key) => [key, { cap, ratePerHour }]),
  ) as Parameters<typeof harvestOf>[3];
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
    expect(harvestOf(read, stocks(208, 20, 20), 9 * HOUR, stores())).toEqual({
      hours: 9,
      deltas: [
        { resource: 'food', amount: 108, lost: 0 },
        { resource: 'steel', amount: -30, lost: 0 },
      ],
    });
  });

  it('has nothing to say on a first opening, nor when no store moved', () => {
    expect(harvestOf(null, stocks(100), HOUR, stores())).toBeNull();
    expect(harvestOf({ at: 0, stocks: stocks(100) }, stocks(100), HOUR, stores())).toBeNull();
  });

  it('counts a store the last reading did not know from zero', () => {
    expect(
      harvestOf({ at: 0, stocks: {} }, stocks(0, 0, 0, 0, 12), HOUR, stores())?.deltas,
    ).toEqual([{ resource: 'ammunition', amount: 12, lost: 0 }]);
  });

  it('says what a full store could not take, even when it gained nothing', () => {
    const read = { at: 0, stocks: stocks(370, 400) };
    expect(harvestOf(read, stocks(400, 400), 10 * HOUR, stores(400, 8))?.deltas).toEqual([
      { resource: 'food', amount: 30, lost: 50 },
      { resource: 'steel', amount: 0, lost: 80 },
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
