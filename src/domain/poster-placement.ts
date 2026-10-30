export type Rect = { left: number; right: number; top: number; bottom: number };
/** The stem keeps this far from the corners of the card it hangs from. */
const STEM_CORNER = 10;

/** How far the card stands from the point its stem touches (`poster.css`, 15px). */
export const TIP = 15;

/** How far past its own limit the side already held is kept. */
const HYSTERESIS = 12;

export type Size = { width: number; height: number };

export type PosterSpot = {
  readonly side: 'above' | 'below' | 'left' | 'right';
  /** The point the stem touches on the piece's box, in the layer's pixels. */
  readonly x: number;
  readonly y: number;
  /** How far the stem sits from the middle of the card's edge, to keep pointing at the piece. */
  readonly stem: number;
};

/**
 * **Where the card stands so that it never covers the piece it is about**: over its projected
 * top, else beside it (right first, left at the right edge), else under it. `insets.top` is the
 * strip of the HUD above the board; `stem` the gap the card keeps from the piece. `previous` is the
 * side held on the last frame, kept while it still fits within `HYSTERESIS`.
 */
export function posterPlacement(
  piece: Rect,
  poster: Size,
  viewport: Size,
  insets: { top: number; bottom: number; margin: number; stem: number },
  previous?: PosterSpot['side'],
): PosterSpot {
  const { margin, stem } = insets;
  const cx = (piece.left + piece.right) / 2;
  const cy = (piece.top + piece.bottom) / 2;
  const along = (want: number, length: number, low: number, high: number) => {
    const from = low + length / 2;
    const to = high - length / 2;
    const at = Math.min(Math.max(want, from), Math.max(from, to));
    const reach = length / 2 - STEM_CORNER;
    return { at, stem: Math.round(Math.min(reach, Math.max(-reach, want - at))) };
  };
  const horizontal = along(cx, poster.width, margin, viewport.width - margin);
  const vertical = along(
    cy,
    poster.height,
    insets.top + margin,
    viewport.height - insets.bottom - margin,
  );

  // The side already held stays while it still fits with this much to spare: no flicker at a seam.
  const slack = (side: PosterSpot['side']) => (side === previous ? -HYSTERESIS : 0);
  const fits = {
    above: piece.top - stem - poster.height >= insets.top + margin + slack('above'),
    right: piece.right + stem + poster.width + margin <= viewport.width - slack('right'),
    left: piece.left - stem - poster.width - margin >= slack('left'),
  };
  const spots = {
    above: { side: 'above', x: horizontal.at, y: piece.top, stem: horizontal.stem },
    right: { side: 'right', x: piece.right, y: vertical.at, stem: vertical.stem },
    left: { side: 'left', x: piece.left, y: vertical.at, stem: vertical.stem },
  } as const;
  if (previous !== undefined && previous !== 'below' && fits[previous]) return spots[previous];
  if (fits.above) return spots.above;
  if (fits.right) return spots.right;
  if (fits.left) return spots.left;
  // Last resort: held on screen even if it then covers a corner of the piece.
  const lowest = viewport.height - insets.bottom - margin - poster.height - stem;
  return {
    side: 'below',
    x: horizontal.at,
    // …and under the HUD at the top: a card taller than the room keeps its title in view.
    y: Math.max(insets.top + margin - TIP, Math.min(piece.bottom, lowest)),
    stem: horizontal.stem,
  };
}

/** The box a spot gives the card: `TIP` from its point, centred on it across the stem's axis. */
export function posterBox(spot: PosterSpot, size: Size): Rect {
  const { x, y } = spot;
  const across = { left: x - size.width / 2, right: x + size.width / 2 };
  const along = { top: y - size.height / 2, bottom: y + size.height / 2 };
  switch (spot.side) {
    case 'above':
      return { ...across, top: y - TIP - size.height, bottom: y - TIP };
    case 'below':
      return { ...across, top: y + TIP, bottom: y + TIP + size.height };
    case 'left':
      return { ...along, left: x - TIP - size.width, right: x - TIP };
    case 'right':
      return { ...along, left: x + TIP, right: x + TIP + size.width };
  }
}

/**
 * **The card beside a selection stands clear of its bar too** (#308): the bar hangs over the piles
 * taken and the card over the piece, so placed on the piece alone the card lands on the bar's first
 * lines. The side is chosen around both boxes, which keeps the bar within reach of the piles; the
 * stem still points at the piece, since the card is about it.
 */
export function posterPlacementClearing(
  piece: Rect,
  bar: Rect,
  ...rest: [Size, Size, Parameters<typeof posterPlacement>[3], PosterSpot['side']?]
): PosterSpot {
  const around = {
    left: Math.min(piece.left, bar.left),
    right: Math.max(piece.right, bar.right),
    top: Math.min(piece.top, bar.top),
    bottom: Math.max(piece.bottom, bar.bottom),
  };
  const spot = posterPlacement(around, ...rest);
  const poster = rest[0];
  const across = spot.side === 'above' || spot.side === 'below';
  const reach = (across ? poster.width : poster.height) / 2 - STEM_CORNER;
  const want = across
    ? (piece.left + piece.right) / 2 - spot.x
    : (piece.top + piece.bottom) / 2 - spot.y;
  return { ...spot, stem: Math.round(Math.min(reach, Math.max(-reach, want))) };
}

/**
 * **Where a bar goes when the card has no side left** (#308, a phone): the card then sits over
 * its piece, and the bar's natural place under it. The bar goes to just over the card, else just
 * under it: its new bottom edge, or `null` when it already clears the card or fits on neither
 * side (it then stays over the card).
 */
export function barClearOfCard(
  bar: Rect,
  card: Rect,
  room: { top: number; bottom: number; margin: number },
): number | null {
  const meets =
    bar.left < card.right &&
    card.left < bar.right &&
    bar.top < card.bottom &&
    card.top < bar.bottom;
  if (!meets) return null;
  const height = bar.bottom - bar.top;
  const over = card.top - room.margin;
  if (over - height >= room.top) return over;
  const under = card.bottom + room.margin + height;
  return under <= room.bottom ? under : null;
}
