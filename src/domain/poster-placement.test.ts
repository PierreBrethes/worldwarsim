import { describe, expect, it } from 'vitest';
import { posterPlacement } from './poster-placement';

const viewport = { width: 1200, height: 800 };
const insets = { top: 60, bottom: 0, margin: 8, stem: 18 };
const poster = { width: 200, height: 100 };

describe('posterPlacement', () => {
  it('stands over the top of the piece, stem on its middle', () => {
    const at = posterPlacement(
      { left: 580, right: 620, top: 400, bottom: 460 },
      poster,
      viewport,
      insets,
    );
    expect(at).toEqual({ side: 'above', x: 600, y: 400, stem: 0 });
  });

  it('keeps inside the viewport and slides the stem back onto the piece', () => {
    const at = posterPlacement(
      { left: 1160, right: 1190, top: 400, bottom: 460 },
      poster,
      viewport,
      insets,
    );
    expect(at.side).toBe('above');
    expect(at.x).toBe(1200 - 8 - 100);
    expect(at.stem).toBe(1175 - at.x);
  });

  it('goes to the right of a piece too tall for the room above it', () => {
    const at = posterPlacement(
      { left: 500, right: 560, top: 100, bottom: 400 },
      poster,
      viewport,
      insets,
    );
    expect(at).toEqual({ side: 'right', x: 560, y: 250, stem: 0 });
  });

  it('goes to the left at the right edge', () => {
    const at = posterPlacement(
      { left: 1100, right: 1160, top: 100, bottom: 400 },
      poster,
      viewport,
      insets,
    );
    expect(at).toEqual({ side: 'left', x: 1100, y: 250, stem: 0 });
  });

  it('never rises under the strip: the side card is held below it', () => {
    const at = posterPlacement(
      { left: 500, right: 560, top: 70, bottom: 90 },
      poster,
      viewport,
      insets,
    );
    expect(at.side).toBe('right');
    expect(at.y - poster.height / 2).toBeGreaterThanOrEqual(insets.top + insets.margin);
  });

  it('falls under the piece when nothing else fits', () => {
    const at = posterPlacement(
      { left: 10, right: 1190, top: 70, bottom: 300 },
      poster,
      viewport,
      insets,
    );
    expect(at.side).toBe('below');
    expect(at.y).toBe(300);
  });

  it('is held above the bottom strip when it falls under the piece', () => {
    const at = posterPlacement({ left: 10, right: 1190, top: 70, bottom: 790 }, poster, viewport, {
      ...insets,
      bottom: 100,
    });
    expect(at.side).toBe('below');
    expect(at.y + insets.stem + poster.height).toBeLessThanOrEqual(800 - 100 - 8);
  });

  it('keeps its side across the seam, and leaves it once that side no longer fits', () => {
    const near = { left: 580, right: 620, top: 180, bottom: 400 };
    expect(posterPlacement(near, poster, viewport, insets).side).toBe('right');
    expect(posterPlacement(near, poster, viewport, insets, 'above').side).toBe('above');
    const far = { ...near, top: 160 };
    expect(posterPlacement(far, poster, viewport, insets, 'above').side).toBe('right');
  });
});
