import { describe, expect, it } from 'vitest';
import { relaidWindows, servedWindow, windowAt, windowsOf } from './sighting-windows';

const STEP = 10;

describe('the windows of a sighting row', () => {
  it('reads a row written before the windows as its single envelope', () => {
    expect(windowsOf({ from: 5, to: 9 })).toEqual([{ from: 5, to: 9 }]);
  });

  it('serves the last window opened, and nothing before the first', () => {
    const windows = [
      { from: 100, to: 200 },
      { from: 500, to: 600 },
    ];
    expect(servedWindow(windows, 50)).toBeNull();
    expect(servedWindow(windows, 300)).toEqual({ from: 100, to: 200 });
    expect(servedWindow(windows, 550)).toEqual({ from: 500, to: 600 });
    expect(windowAt(windows, 300)).toBeNull();
    expect(windowAt(windows, 550)).toEqual({ from: 500, to: 600 });
  });
});

/** **Deux guetteurs, un trou entre eux** (#412) : la ligne garde ce que chacun a vu, pas leur
 *  enveloppe. */
describe('relaying the windows of a row', () => {
  it('keeps two windows apart when a sample is missed between them', () => {
    expect(
      relaidWindows(
        [],
        [
          { from: 500, to: 600 },
          { from: 100, to: 200 },
        ],
        0,
        STEP,
      ),
    ).toEqual([
      { from: 100, to: 200 },
      { from: 500, to: 600 },
    ]);
  });

  it('joins two windows one grid step apart, or overlapping', () => {
    const desired = [
      { from: 100, to: 200 },
      { from: 210, to: 300 },
      { from: 250, to: 400 },
    ];
    expect(relaidWindows([], desired, 0, STEP)).toEqual([{ from: 100, to: 400 }]);
  });

  it('ends the open window at the prediction, or at the instant when none holds it', () => {
    const held = [{ from: 100, to: 400 }];
    expect(relaidWindows(held, [{ from: 305, to: 350 }], 300, STEP)).toEqual([
      { from: 100, to: 350 },
    ]);
    expect(relaidWindows(held, [], 300, STEP)).toEqual([{ from: 100, to: 300 }]);
  });

  it('keeps the window served and drops the passed ones before it', () => {
    const held = [
      { from: 100, to: 200 },
      { from: 500, to: 600 },
    ];
    expect(relaidWindows(held, [{ from: 800, to: 900 }], 300, STEP)).toEqual([
      { from: 100, to: 200 },
      { from: 800, to: 900 },
    ]);
    expect(relaidWindows(held, [], 550, STEP)).toEqual([{ from: 500, to: 550 }]);
  });

  it('forgets every window to come that no detector promises any more', () => {
    expect(relaidWindows([{ from: 500, to: 600 }], [], 300, STEP)).toEqual([]);
  });
});
