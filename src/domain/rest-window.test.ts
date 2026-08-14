import { describe, expect, it } from 'vitest';
import { insideWindow, parseWindow, windowExit } from './rest-window';

describe('reading a declared window', () => {
  it('accepts the two notations found in the data', () => {
    expect(parseWindow('12h00 – 19h00')).toEqual({ startMinutes: 720, endMinutes: 1140 });
    expect(parseWindow('23:00 → 06:00')).toEqual({ startMinutes: 1380, endMinutes: 360 });
  });

  it('rejects a string without two times', () => {
    expect(parseWindow('repos')).toBeNull();
  });
});

describe('window membership', () => {
  it('covers a same-day window', () => {
    const window = parseWindow('12h00 – 19h00')!;
    expect(insideWindow(13 * 60, window)).toBe(true);
    expect(insideWindow(19 * 60, window)).toBe(false);
  });

  it('covers a window straddling midnight', () => {
    const window = parseWindow('18h00 – 01h00')!;
    expect(insideWindow(23 * 60, window)).toBe(true);
    expect(insideWindow(0, window)).toBe(true);
    expect(insideWindow(2 * 60, window)).toBe(false);
  });
});

describe('stalling at the border', () => {
  const todayAt = (hours: number, minutes = 0) => {
    const instant = new Date();
    instant.setHours(hours, minutes, 0, 0);
    return instant.getTime();
  };

  it('lets an out-of-window arrival through', () => {
    expect(windowExit(todayAt(10), parseWindow('23h00 – 07h00')!)).toBeNull();
  });

  it('postpones resolution to the window exit', () => {
    const window = parseWindow('23h00 – 07h00')!;
    expect(windowExit(todayAt(2), window)).toBe(todayAt(2) + 5 * 3_600_000);
    expect(windowExit(todayAt(23, 30), window)).toBe(todayAt(23, 30) + 7.5 * 3_600_000);
  });
});
