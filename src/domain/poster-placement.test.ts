import { describe, expect, it } from 'vitest';
import {
  posterPlacement,
  posterPlacementClearing,
  barClearOfCard,
  posterBox,
  type Rect,
} from './poster-placement';

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

describe('posterPlacementClearing (#308)', () => {
  // The scene of the issue: a pile on the Irish coast, its selection bar hung over it.
  const pile = { left: 650, right: 730, top: 440, bottom: 520 };
  const bar = { left: 532, right: 843, top: 283, bottom: 415 };
  const sheet = { width: 395, height: 450 };
  const big = { width: 1440, height: 900 };
  const hud = { top: 80, bottom: 90, margin: 8, stem: 18 };
  const meets = (a: Rect, b: Rect) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  it('covers the bar when placed on the piece alone', () => {
    expect(meets(posterBox(posterPlacement(pile, sheet, big, hud), sheet), bar)).toBe(true);
  });

  it('stands clear of the bar and the piece', () => {
    const box = posterBox(posterPlacementClearing(pile, bar, sheet, big, hud), sheet);
    expect(meets(box, bar)).toBe(false);
    expect(meets(box, pile)).toBe(false);
  });

  it('keeps its stem on the piece, not on the bar', () => {
    const spot = posterPlacementClearing(pile, bar, sheet, big, hud);
    expect(spot.side).toBe('right');
    // The card is centred on the middle of the union (y 283-520); the pile's middle is lower.
    expect(spot.stem).toBe(Math.round(480 - spot.y));
  });
});

describe('barClearOfCard (#308)', () => {
  const card = { left: 20, right: 370, top: 260, bottom: 700 };
  const bar = { left: 10, right: 320, top: 253, bottom: 387 };
  const room = { top: 70, bottom: 780, margin: 8 };

  it('lifts a bar the card covers to just over it', () => {
    expect(barClearOfCard(bar, card, room)).toBe(252);
  });

  it('leaves a bar that already clears the card', () => {
    expect(barClearOfCard({ ...bar, top: 100, bottom: 200 }, card, room)).toBeNull();
  });

  it('drops it under the card when the top has no room', () => {
    expect(barClearOfCard(bar, { ...card, top: 150, bottom: 500 }, room)).toBe(642);
  });

  it('stays put when it fits neither over nor under the card', () => {
    expect(barClearOfCard(bar, { ...card, top: 150, bottom: 700 }, room)).toBeNull();
  });
});
