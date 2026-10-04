import { describe, expect, it } from 'vitest';
import { stackLabel } from '@/i18n/fr';
import { currentMinutes, currentStock, seasonDayOf, type PlayerView } from './player-view';

describe('stack label', () => {
  it('spells out each role with its agreement', () => {
    expect(stackLabel({ infantry: 6, armor: 2, escort: 1 })).toBe(
      '6 infanterie · 2 blindés · 1 escorte',
    );
  });

  it('ignores zeroed roles and says — for an empty stack', () => {
    expect(stackLabel({ fighter: 0 })).toBe('—');
    expect(stackLabel({})).toBe('—');
  });
});

describe('client-side extrapolation', () => {
  const loadedAt = 1_000_000;

  it('lets a stock live at its rate, cap included', () => {
    const resource = { stock: 100, ratePerHour: 60, cap: 130 };
    expect(currentStock(resource, loadedAt, loadedAt)).toBe(100);
    expect(currentStock(resource, loadedAt, loadedAt + 30 * 60_000)).toBe(130);
    expect(currentStock(resource, loadedAt, loadedAt + 120 * 60_000)).toBe(130);
  });

  /**
   * The opening kit is above the ceiling on purpose (`settleStocks`): a stock that starts there
   * stays there until it is spent. Clipping it here made the strip lie about what the server
   * would let the player spend.
   */
  it('leaves a stock that opens above its ceiling where it stands', () => {
    const resource = { stock: 1000, ratePerHour: 0, cap: 400 };
    expect(currentStock(resource, loadedAt, loadedAt)).toBe(1000);
    expect(currentStock(resource, loadedAt, loadedAt + 120 * 60_000)).toBe(1000);
    // Nothing may *rise* past it either: the bar is the higher of the two, not the ceiling gone.
    expect(currentStock({ ...resource, ratePerHour: 60 }, loadedAt, loadedAt + 60_000 * 60)).toBe(
      1000,
    );
  });

  it('counts minutes down without going below zero', () => {
    expect(currentMinutes(10, loadedAt, loadedAt + 4 * 60_000)).toBe(6);
    expect(currentMinutes(10, loadedAt, loadedAt + 15 * 60_000)).toBe(0);
  });
});

describe('the season day', () => {
  const season = (elapsedHours: number, durationHours: number | null) =>
    ({ elapsedHours, durationHours }) as PlayerView['season'];

  it('counts from one, and the twenty-fifth hour opens the second day', () => {
    expect(seasonDayOf(season(0, 168))).toEqual({ day: 1, totalDays: 7 });
    expect(seasonDayOf(season(24, 168))).toEqual({ day: 2, totalDays: 7 });
  });

  it('stays on the last day past the end, and promises no end without a clock', () => {
    expect(seasonDayOf(season(200, 168)).day).toBe(7);
    expect(seasonDayOf(season(200, null))).toEqual({ day: 9, totalDays: null });
  });
});
