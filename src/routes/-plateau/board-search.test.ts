import { describe, expect, it } from 'vitest';
import { withWindow, withoutWindow, toggleWindow, windowOpen } from '../plateau';

/**
 * The URL is the board's whole state, so it is where the guarantees live: a shared link
 * reopens the same screen, and a focus never outlives the window it was opened for.
 */
describe('the board’s search state', () => {
  it('stacks a window last, and never twice', () => {
    const opened = withWindow(withWindow({}, 'economy'), 'nation');
    expect(opened.windows).toEqual(['economy', 'nation']);
    expect(withWindow(opened, 'economy').windows).toEqual(['nation', 'economy']);
  });

  it('drops the building focus with the surface that carried it', () => {
    const focused = { ...withWindow({}, 'economy'), building: 'k17abc' };
    expect(withoutWindow(focused, 'economy').building).toBeUndefined();
    expect(windowOpen(withoutWindow(focused, 'economy'), 'economy')).toBe(false);
  });

  /** Closing the journal has nothing to say about a mine's line opened in Industry. */
  it('keeps the focus when an unrelated window closes', () => {
    const focused = {
      ...withWindow(withWindow({}, 'economy'), 'journal'),
      building: 'k17abc',
    };
    expect(withoutWindow(focused, 'journal').building).toBe('k17abc');
  });

  it('lets the rail toggle a surface off, focus included', () => {
    const focused = { ...withWindow({}, 'production'), building: 'k17abc' };
    const toggled = toggleWindow(focused, 'production');
    expect(windowOpen(toggled, 'production')).toBe(false);
    expect(toggled.building).toBeUndefined();
  });
});
