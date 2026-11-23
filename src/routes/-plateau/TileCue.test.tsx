// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TileCue } from './TileCue';

/** Boxes by `data-box`; jsdom has no layout, so the rectangles are the test's. */
const BOXES: Record<string, [number, number]> = {};
const rect = ([left, right]: [number, number]) =>
  ({ left, right, top: 0, bottom: 10, width: right - left, height: 10 }) as DOMRect;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const key =
      this.dataset.box ?? (this.dataset.tile ? 'tile' : this.dataset.side ? this.dataset.side : '');
    return rect(BOXES[key] ?? [0, 400]);
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.box === 'frame' ? 400 : 100;
    },
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const key of Object.keys(BOXES)) delete BOXES[key];
});

function mount({ tile = true, chevron = false }: { tile?: boolean; chevron?: boolean }) {
  render(
    <div data-box="frame">
      <div>
        <div role="group" data-box="rail" data-before={chevron ? 'false' : undefined}>
          {tile && <button data-tile="farm" />}
        </div>
        {chevron && <button data-side="next" />}
      </div>
      <TileCue text="Pose une ferme" tile="farm" />
    </div>,
  );
  return screen.getByRole('note', { hidden: true });
}

/** Where the tail points: the bubble's left edge plus the tail's offset in it. */
const aimOf = (note: HTMLElement) =>
  parseFloat(note.style.left) + parseFloat(note.style.getPropertyValue('--tail'));

describe('TileCue', () => {
  it('stands on the tile in the band, its tail at the tile’s middle', () => {
    Object.assign(BOXES, { frame: [0, 400], rail: [0, 300], tile: [100, 140] });
    const note = mount({});
    expect(note.style.visibility).toBe('visible');
    expect(aimOf(note)).toBe(120);
  });

  it('points at the next chevron when the tile is past the band', () => {
    Object.assign(BOXES, { frame: [0, 400], rail: [0, 300], tile: [500, 540], next: [350, 370] });
    const note = mount({ chevron: true });
    expect(note.style.visibility).toBe('visible');
    expect(aimOf(note)).toBe(360);
  });

  it('says nothing for a tile it cannot find, or one out of a rail with no chevron', () => {
    Object.assign(BOXES, { frame: [0, 400], rail: [0, 300], tile: [500, 540] });
    expect(mount({ tile: false }).style.visibility).toBe('hidden');
    cleanup();
    expect(mount({}).style.visibility).toBe('hidden');
  });
});
