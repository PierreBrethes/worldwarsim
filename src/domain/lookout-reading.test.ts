import { describe, expect, it } from 'vitest';
import { campReading, columnReading, firstReadWindow, readingTransition } from './lookout-reading';

const H = 3_600_000;
const NOW = 100 * H;

describe('the window a Guet reads a column in', () => {
  it('merges the windows that overlap, and keeps the first', () => {
    expect(
      firstReadWindow([
        { from: NOW + 5 * H, to: NOW + 6 * H },
        { from: NOW, to: NOW + 2 * H },
        { from: NOW + H, to: NOW + 3 * H },
      ]),
    ).toEqual({ from: NOW, to: NOW + 3 * H });
    expect(firstReadWindow([])).toBeNull();
  });
});

describe('what a Guet writes of a column', () => {
  it('writes nothing before its window opens', () => {
    expect(columnReading({}, { from: NOW + H, to: NOW + 2 * H }, ['armor'], NOW)).toEqual({
      readFrom: NOW + H,
      readTo: NOW + 2 * H,
    });
  });

  it('reads the pile while it sees, and follows it', () => {
    const read = columnReading({}, { from: NOW, to: NOW + 2 * H }, ['armor', 'infantry'], NOW);
    expect(read).toEqual({ readFrom: NOW, readTo: NOW + 2 * H, stack: ['armor', 'infantry'] });
    expect(columnReading(read, { from: NOW + H, to: NOW + 2 * H }, ['infantry'], NOW + H)).toEqual({
      readFrom: NOW,
      readTo: NOW + 2 * H,
      stack: ['infantry'],
    });
  });

  /** Lue au jour 1, perdue, promise au jour 3 : les pertes du jour 2 ne se lisent pas. */
  it('freezes the pile between two windows, dated at the close of the first', () => {
    const day1 = columnReading({}, { from: NOW, to: NOW + H }, ['armor', 'infantry'], NOW);
    const day2 = columnReading(
      day1,
      { from: NOW + 48 * H, to: NOW + 50 * H },
      ['infantry'],
      NOW + 24 * H,
    );
    expect(day2).toEqual({
      readFrom: NOW + 48 * H,
      readTo: NOW + 50 * H,
      stack: ['armor', 'infantry'],
      readAt: NOW + H,
    });
    expect(
      columnReading(day2, { from: NOW + 48 * H, to: NOW + 50 * H }, ['infantry'], NOW + 48 * H),
    ).toEqual({ readFrom: NOW + 48 * H, readTo: NOW + 50 * H, stack: ['infantry'] });
  });

  it('dates the pile at the instant the Guet stops seeing before its window closes', () => {
    const read = columnReading({}, { from: NOW, to: NOW + 2 * H }, ['armor'], NOW);
    expect(columnReading(read, null, ['armor'], NOW + H)).toEqual({
      stack: ['armor'],
      readAt: NOW + H,
    });
  });

  it('wakes at the opening of the window, then at its close, then never', () => {
    const window = { readFrom: NOW + H, readTo: NOW + 2 * H };
    expect(readingTransition(window, NOW)).toBe(NOW + H);
    expect(readingTransition(window, NOW + H)).toBe(NOW + 2 * H);
    expect(readingTransition(window, NOW + 2 * H)).toBeNull();
    expect(readingTransition({}, NOW)).toBeNull();
  });
});

describe('what a Guet writes of a camp', () => {
  it('reads the pile under a Guet, undated', () => {
    expect(campReading(undefined, true, ['infantry'], NOW)).toEqual({ stack: ['infantry'] });
  });

  it('dates the last pile when only a generalist still sees it, or nothing does', () => {
    const read = { until: null, stack: ['infantry'] as const };
    expect(campReading(read, false, ['infantry'], NOW)).toEqual({
      stack: ['infantry'],
      readAt: NOW,
    });
  });

  /** Une ligne fermée qui rouvre sans Guet relève peut-être une autre force au même point. */
  it('forgets the pile when a closed camp reopens with no Guet', () => {
    const closed = { until: NOW - H, stack: ['armor'] as const, readAt: NOW - H };
    expect(campReading(closed, false, ['infantry'], NOW)).toEqual({});
  });
});
