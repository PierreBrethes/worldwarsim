import { describe, expect, it } from 'vitest';
import { withWindow, withoutWindow, toggleWindow, windowOpen } from './board-search';

/**
 * The URL is the board's whole state, so it is where the guarantees live: a shared link
 * reopens the same screen, and a focus never outlives the window it was opened for.
 */
describe('the board’s search state', () => {
  it('stacks a window last, and never twice', () => {
    const opened = withWindow(withWindow({}, 'personalBoard'), 'nation');
    expect(opened.windows).toEqual(['personalBoard', 'nation']);
    expect(withWindow(opened, 'personalBoard').windows).toEqual(['nation', 'personalBoard']);
  });

  it('drops the building focus with the surface that carried it', () => {
    const focused = { ...withWindow({}, 'personalBoard'), building: 'k17abc' };
    expect(withoutWindow(focused, 'personalBoard').building).toBeUndefined();
    expect(windowOpen(withoutWindow(focused, 'personalBoard'), 'personalBoard')).toBe(false);
  });

  /** Closing the journal has nothing to say about a mine's line opened in Industry. */
  it('keeps the focus when an unrelated window closes', () => {
    const focused = {
      ...withWindow(withWindow({}, 'personalBoard'), 'journal'),
      building: 'k17abc',
    };
    expect(withoutWindow(focused, 'journal').building).toBe('k17abc');
  });

  it('lets a focused surface toggle off, focus included', () => {
    const focused = { ...withWindow({}, 'site'), building: 'k17abc' };
    const toggled = toggleWindow(focused, 'site');
    expect(windowOpen(toggled, 'site')).toBe(false);
    expect(toggled.building).toBeUndefined();
  });

  it('keeps one surface of the column at a time, and leaves the band alone', () => {
    const open = withWindow(withWindow(withWindow({}, 'personalBoard'), 'journal'), 'nation');
    expect(open.windows).toEqual(['personalBoard', 'nation']);
    expect(withWindow(open, 'site').windows).toEqual(['personalBoard', 'nation', 'site']);
  });
});
