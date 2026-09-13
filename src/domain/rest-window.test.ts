import { describe, expect, it } from 'vitest';
import { insideWindow, parseWindow, toLocalMinutes, toUtcMinutes, windowExit } from './rest-window';

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

/** Les instants se posent en UTC : la plage se juge en UTC, et ces cas doivent donner la même
 *  réponse sur le Mac d'un développeur parisien et dans l'isolat Convex. */
describe('stalling at the border', () => {
  const utcAt = (hours: number, minutes = 0) => Date.UTC(2026, 7, 17, hours, minutes, 0, 0);

  it('lets an out-of-window arrival through', () => {
    expect(windowExit(utcAt(10), parseWindow('23h00 – 07h00')!)).toBeNull();
  });

  it('postpones resolution to the window exit', () => {
    const window = parseWindow('23h00 – 07h00')!;
    expect(windowExit(utcAt(2), window)).toBe(utcAt(2) + 5 * 3_600_000);
    expect(windowExit(utcAt(23, 30), window)).toBe(utcAt(23, 30) + 7.5 * 3_600_000);
  });
});

describe('declaring a window in local time', () => {
  const PARIS_SUMMER = 120;

  it('stores what the player declared, in the hours the server judges', () => {
    expect(toUtcMinutes(23 * 60, PARIS_SUMMER)).toBe(21 * 60);
    expect(toLocalMinutes(21 * 60, PARIS_SUMMER)).toBe(23 * 60);
  });

  it('crosses midnight in both directions', () => {
    expect(toUtcMinutes(30, PARIS_SUMMER)).toBe(22 * 60 + 30);
    expect(toLocalMinutes(22 * 60 + 30, PARIS_SUMMER)).toBe(30);
    expect(toUtcMinutes(23 * 60, -5 * 60)).toBe(4 * 60);
    expect(toLocalMinutes(4 * 60, -5 * 60)).toBe(23 * 60);
  });
});
