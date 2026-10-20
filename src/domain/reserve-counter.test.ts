import { describe, expect, it } from 'vitest';
import { announceOf, displayedStock, nextAnnounceIn, onNewView } from './reserve-counter';

const AT = 1_700_000_000_000;
const HOUR = 3_600_000;

describe('the reserve counter', () => {
  it('draws its next announcement between thirty seconds and a minute', () => {
    expect(nextAnnounceIn(() => 0)).toBe(30_000);
    expect(nextAnnounceIn(() => 0.5)).toBe(45_000);
    expect(nextAnnounceIn(() => 0.999)).toBeLessThan(60_000);
  });

  it('announces what was gained since the last announcement', () => {
    expect(announceOf(212, 215)).toEqual({ shown: 215, gain: 3 });
  });

  it('says nothing when the whole figure has not moved, and keeps it for the next', () => {
    expect(announceOf(212, 212)).toBeNull();
  });

  it('announces a loss as a loss', () => {
    expect(announceOf(367, 365)).toEqual({ shown: 365, gain: -2 });
  });

  it('announces at once a gain the rate does not explain, with all that waited', () => {
    const before = { stock: 100.4, ratePerHour: 12, cap: 400 };
    const after = { stock: 160.4 + 12, ratePerHour: 12, cap: 400 };
    // 100 shown, the hour's 12 pending, and a 60 deposit lands with the new view.
    expect(onNewView(100, { reserve: before, at: AT }, { reserve: after, at: AT + HOUR })).toEqual({
      shown: 172,
      gain: 72,
    });
  });

  it('keeps quiet about what the rate explains', () => {
    const before = { stock: 100.4, ratePerHour: 12, cap: 400 };
    const after = { stock: 112.4, ratePerHour: 12, cap: 400 };
    expect(onNewView(100, { reserve: before, at: AT }, { reserve: after, at: AT + HOUR })).toEqual({
      shown: 100,
      gain: 0,
    });
  });

  it('announces a spending at once, as a spending, and leaves the pending gain pending', () => {
    const before = { stock: 100.4, ratePerHour: 12, cap: 400 };
    const after = { stock: 62.4, ratePerHour: 12, cap: 400 };
    // 112 predicted, 62 served: 50 spent; the 12 produced stay for the next announcement.
    expect(onNewView(100, { reserve: before, at: AT }, { reserve: after, at: AT + HOUR })).toEqual({
      shown: 50,
      gain: -50,
      spent: true,
    });
  });

  it('reads the gain over the ceiling the way the strip does', () => {
    const before = { stock: 395, ratePerHour: 12, cap: 400 };
    const after = { stock: 400, ratePerHour: 12, cap: 400 };
    expect(onNewView(395, { reserve: before, at: AT }, { reserve: after, at: AT + HOUR })).toEqual({
      shown: 395,
      gain: 0,
    });
  });

  it('never announces a deposit as a loss when the figure stood above a falling stock', () => {
    const before = { stock: 100, ratePerHour: -60, cap: 400 };
    const after = { stock: 50, ratePerHour: -60, cap: 400 };
    // 100 shown, 40 predicted after the hour's eating, 10 deposited: 50 served.
    expect(onNewView(100, { reserve: before, at: AT }, { reserve: after, at: AT + HOUR })).toEqual({
      shown: 50,
      gain: 0,
    });
  });

  it('reads the same stock as the strip when it falls, and lags only when it rises', () => {
    expect(displayedStock(399, 398)).toBe(398);
    expect(displayedStock(395, 398)).toBe(395);
  });
});
