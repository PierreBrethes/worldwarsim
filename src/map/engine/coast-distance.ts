/**
 * The Euclidean distance, in cells, from every cell to the nearest land cell: land is 0, a sea
 * with no land at all stays infinite. Exact, in two separable passes — a 1D sweep down the
 * columns, then Felzenszwalb and Huttenlocher's lower envelope of parabolas along the rows —
 * linear in the cells, where a chamfer would draw octagons around every cape.
 */
export function distanceToLand(land: Uint8Array, width: number, height: number): Float32Array {
  const squared = new Float64Array(width * height);
  const far = Number.POSITIVE_INFINITY;

  for (let column = 0; column < width; column++) {
    let gap = far;
    for (let at = column; at < squared.length; at += width) {
      gap = land[at] ? 0 : gap + 1;
      squared[at] = gap;
    }
    gap = far;
    for (let at = column + (height - 1) * width; at >= 0; at -= width) {
      gap = land[at] ? 0 : gap + 1;
      if (gap < squared[at]!) squared[at] = gap;
      squared[at] = squared[at]! * squared[at]!;
    }
  }

  const row = new Float64Array(width);
  const apex = new Int32Array(width);
  const bound = new Float64Array(width + 1);
  const distance = new Float32Array(width * height);
  for (let start = 0; start < squared.length; start += width) {
    row.set(squared.subarray(start, start + width));
    let k = -1;
    for (let q = 0; q < width; q++) {
      const fq = row[q]!;
      if (fq === far) continue;
      let s = Number.NEGATIVE_INFINITY;
      while (k >= 0) {
        const p = apex[k]!;
        s = (fq + q * q - (row[p]! + p * p)) / (2 * (q - p));
        if (s > bound[k]!) break;
        k--;
      }
      k++;
      apex[k] = q;
      bound[k] = k === 0 ? Number.NEGATIVE_INFINITY : s;
    }
    if (k < 0) {
      distance.fill(far, start, start + width);
      continue;
    }
    bound[k + 1] = far;
    let j = 0;
    for (let q = 0; q < width; q++) {
      while (bound[j + 1]! < q) j++;
      const p = apex[j]!;
      distance[start + q] = Math.sqrt((q - p) * (q - p) + row[p]!);
    }
  }
  return distance;
}
