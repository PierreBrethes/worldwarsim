export type Rect = { left: number; right: number; top: number; bottom: number };
/** The stem keeps this far from the corners of the card it hangs from. */
const STEM_CORNER = 10;

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
 * strip of the HUD above the board; `stem` the gap the card keeps from the piece.
 */
export function posterPlacement(
  piece: Rect,
  poster: Size,
  viewport: Size,
  insets: { top: number; margin: number; stem: number },
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
  const vertical = along(cy, poster.height, insets.top + margin, viewport.height - margin);

  if (piece.top - stem - poster.height >= insets.top + margin)
    return { side: 'above', x: horizontal.at, y: piece.top, stem: horizontal.stem };
  if (piece.right + stem + poster.width + margin <= viewport.width)
    return { side: 'right', x: piece.right, y: vertical.at, stem: vertical.stem };
  if (piece.left - stem - poster.width - margin >= 0)
    return { side: 'left', x: piece.left, y: vertical.at, stem: vertical.stem };
  return { side: 'below', x: horizontal.at, y: piece.bottom, stem: horizontal.stem };
}
