/**
 * **A garrison's piles on the yard's rank** (ADR 0038 §5): the rectangle is 30 m wide, `fx_rang`
 * at the middle of its front edge and its +z running into the depth. The piles stand abreast
 * along x, centred on the marker; one that would leave the rectangle opens the next row, a pile's
 * depth further in. A pile wider than the rectangle stands alone in its row.
 * `sizes` are the piles' width and depth, in the units `limit` is in; the answer is each pile's
 * centre, x from the marker and z from the front edge.
 */
export function rankLayout(
  sizes: ReadonlyArray<{ readonly width: number; readonly depth: number }>,
  limit: number,
): Array<{ x: number; z: number }> {
  const rows: Array<{ from: number; to: number; width: number; depth: number }> = [];
  sizes.forEach(({ width, depth }, k) => {
    const row = rows.at(-1);
    if (row !== undefined && row.width + width <= limit) {
      row.to = k + 1;
      row.width += width;
      row.depth = Math.max(row.depth, depth);
    } else rows.push({ from: k, to: k + 1, width, depth });
  });
  const placed: Array<{ x: number; z: number }> = [];
  let front = 0;
  for (const row of rows) {
    let x = -row.width / 2;
    for (let k = row.from; k < row.to; k++) {
      const { width } = sizes[k]!;
      placed.push({ x: x + width / 2, z: front + row.depth / 2 });
      x += width;
    }
    front += row.depth;
  }
  return placed;
}
