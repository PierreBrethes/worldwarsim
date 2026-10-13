export type Rect = { left: number; right: number; top: number; bottom: number };
/** The stem keeps this far from the corners of the card it hangs from. */
const STEM_CORNER = 10;

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
    y: Math.min(piece.bottom, lowest),
    stem: horizontal.stem,
  };
}
