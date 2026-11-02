import { describe, expect, it } from 'vitest';
import { campReading, columnReading, mergeWindows, readingTransition } from './lookout-reading';

const H = 3_600_000;
const NOW = 100 * H;

describe('the windows a Guet reads a column in', () => {
  it('melts the windows that overlap, and keeps the others apart, in order', () => {
    expect(
      mergeWindows([
        { from: NOW + 5 * H, to: NOW + 6 * H },
        { from: NOW, to: NOW + 2 * H },
        { from: NOW + H, to: NOW + 3 * H },
      ]),
    ).toEqual([
      { from: NOW, to: NOW + 3 * H },
      { from: NOW + 5 * H, to: NOW + 6 * H },
    ]);
  });
});

describe('what a Guet writes of a column', () => {
  it('writes nothing but its windows before the first opens', () => {
    expect(columnReading({}, [{ from: NOW + H, to: NOW + 2 * H }], ['armor'], NOW)).toEqual({
      reads: [{ from: NOW + H, to: NOW + 2 * H }],
    });
  });

  it('reads the pile while it sees, and follows it', () => {
    const read = columnReading({}, [{ from: NOW, to: NOW + 2 * H }], ['armor', 'infantry'], NOW);
    expect(read).toEqual({ reads: [{ from: NOW, to: NOW + 2 * H }], stack: ['armor', 'infantry'] });
    expect(
      columnReading(read, [{ from: NOW + H, to: NOW + 2 * H }], ['infantry'], NOW + H),
    ).toEqual({ reads: [{ from: NOW, to: NOW + 2 * H }], stack: ['infantry'] });
  });

  /** X voit de 10 à 12 h, Y de 15 à 17 h : entre deux, la pile se fige, datée de midi. */
  it('freezes the pile between two windows, dated at the close of the first', () => {
    const windows = [
      { from: NOW, to: NOW + 2 * H },
      { from: NOW + 5 * H, to: NOW + 7 * H },
    ];
    const read = columnReading({}, windows, ['armor', 'infantry'], NOW);
    const between = columnReading(read, read.reads!, ['infantry'], NOW + 3 * H);
    expect(between).toEqual({
      reads: [{ from: NOW + 5 * H, to: NOW + 7 * H }],
      stack: ['armor', 'infantry'],
      readAt: NOW + 2 * H,
    });
    expect(columnReading(between, between.reads!, ['infantry'], NOW + 5 * H)).toEqual({
      reads: [{ from: NOW + 5 * H, to: NOW + 7 * H }],
      stack: ['infantry'],
    });
  });

  it('dates the pile at the instant the Guet stops seeing before its window closes', () => {
    const read = columnReading({}, [{ from: NOW, to: NOW + 2 * H }], ['armor'], NOW);
    expect(columnReading(read, [], ['armor'], NOW + H)).toEqual({
      stack: ['armor'],
      readAt: NOW + H,
    });
  });

  it('wakes at the next bound of any of its windows, then never', () => {
    const reads = [
      { from: NOW + H, to: NOW + 2 * H },
      { from: NOW + 5 * H, to: NOW + 7 * H },
    ];
    expect(readingTransition({ reads }, NOW)).toBe(NOW + H);
    expect(readingTransition({ reads }, NOW + H)).toBe(NOW + 2 * H);
    expect(readingTransition({ reads }, NOW + 2 * H)).toBe(NOW + 5 * H);
    expect(readingTransition({ reads }, NOW + 7 * H)).toBeNull();
    expect(readingTransition({}, NOW)).toBeNull();
  });
});

describe('what a Guet writes of a camp', () => {
  it('reads the pile under a Guet, undated', () => {
    expect(campReading(undefined, true, ['infantry'], NOW)).toEqual({ stack: ['infantry'] });
  });

  it('dates the last pile when only a generalist still sees it', () => {
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
