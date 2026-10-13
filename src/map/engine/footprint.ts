/** A closed outline on the ground, (x, z) corners in order. */
export type Loop = ReadonlyArray<readonly [x: number, z: number]>;

/**
 * **The outline of a maquette seen from above** — the plan a queued site is inked as, and the
 * section a rising one is cut at. Triangles as flat `x, z` triples: every one is rasterised on a
 * grid, its edges too, since a wall seen from above is a segment with no area; whatever the
 * outside cannot reach is inside, so four walls enclose their floor. The cells' border is then
 * traced and pulled straight. A building in L stays in L, where a convex hull would square it.
 * `cells` along the widest side: a plan is drawn, not surveyed.
 */
export function footprintOf(triangles: ArrayLike<number>, cells = 96): Loop[] {
  if (triangles.length < 6) return [];
  let [minX, minZ, maxX, maxZ] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < triangles.length; k += 2) {
    minX = Math.min(minX, triangles[k]!);
    maxX = Math.max(maxX, triangles[k]!);
    minZ = Math.min(minZ, triangles[k + 1]!);
    maxZ = Math.max(maxZ, triangles[k + 1]!);
  }
  const step = Math.max(maxX - minX, maxZ - minZ, 1e-9) / cells;
  // One empty cell all round: the outside is connected, and starts at a corner.
  const [ox, oz] = [minX - step, minZ - step];
  const nx = Math.ceil((maxX - minX) / step) + 3;
  const nz = Math.ceil((maxZ - minZ) / step) + 3;
  const solid = new Uint8Array(nx * nz);
  const mark = (x: number, z: number) => {
    const i = Math.min(nx - 2, Math.floor((x - ox) / step));
    const j = Math.min(nz - 2, Math.floor((z - oz) / step));
    solid[j * nx + i] = 1;
  };

  for (let t = 0; t + 5 < triangles.length; t += 6) {
    const [ax, az, bx, bz, cx, cz] = Array.from({ length: 6 }, (_, k) => triangles[t + k]!) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (const [px, pz, qx, qz] of [
      [ax, az, bx, bz],
      [bx, bz, cx, cz],
      [cx, cz, ax, az],
    ] as const) {
      const samples = Math.ceil((2 * Math.hypot(qx - px, qz - pz)) / step) + 1;
      for (let s = 0; s <= samples; s++)
        mark(px + ((qx - px) * s) / samples, pz + ((qz - pz) * s) / samples);
    }
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const [i0, i1] = [Math.min(ax, bx, cx), Math.max(ax, bx, cx)].map((x) =>
      Math.floor((x - ox) / step),
    ) as [number, number];
    const [j0, j1] = [Math.min(az, bz, cz), Math.max(az, bz, cz)].map((z) =>
      Math.floor((z - oz) / step),
    ) as [number, number];
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const [x, z] = [ox + (i + 0.5) * step, oz + (j + 0.5) * step];
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        if (u >= 0 && v >= 0 && u + v <= 1) solid[j * nx + i] = 1;
      }
  }

  const outside = new Uint8Array(nx * nz);
  const queue = [0];
  outside[0] = 1;
  while (queue.length > 0) {
    const cell = queue.pop()!;
    const [i, j] = [cell % nx, Math.floor(cell / nx)];
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const [a, b] = [i + di, j + dj];
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const next = b * nx + a;
      if (outside[next] || solid[next]) continue;
      outside[next] = 1;
      queue.push(next);
    }
  }
  const inside = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < nx && j < nz && outside[j * nx + i] === 0;

  // The border between inside and outside, one directed side per cell, inside on the left.
  const key = (i: number, j: number) => j * (nx + 1) + i;
  const from = new Map<number, number[]>();
  const side = (a: number, b: number) => from.set(a, [...(from.get(a) ?? []), b]);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      if (!inside(i, j)) continue;
      if (!inside(i, j - 1)) side(key(i, j), key(i + 1, j));
      if (!inside(i + 1, j)) side(key(i + 1, j), key(i + 1, j + 1));
      if (!inside(i, j + 1)) side(key(i + 1, j + 1), key(i, j + 1));
      if (!inside(i - 1, j)) side(key(i, j + 1), key(i, j));
    }

  const loops: Loop[] = [];
  for (const start of from.keys()) {
    while ((from.get(start)?.length ?? 0) > 0) {
      const corners: Array<[number, number]> = [];
      let [previous, at] = [start, start];
      do {
        corners.push([ox + (at % (nx + 1)) * step, oz + Math.floor(at / (nx + 1)) * step]);
        const next = leftmost(from.get(at)!, previous, at, nx + 1);
        [previous, at] = [at, next];
      } while (at !== start && (from.get(at)?.length ?? 0) > 0);
      const loop = straightened(corners, step);
      if (loop.length >= 3) loops.push(loop);
    }
  }
  return loops;
}

/**
 * Takes the way out of a corner, the sharpest left of the way in: two cells that touch only by
 * a corner keep an outline each, where an arbitrary pick would knot them into a figure eight.
 */
function leftmost(ways: number[], previous: number, at: number, row: number): number {
  const [ix, iz] = [
    (at % row) - (previous % row),
    Math.floor(at / row) - Math.floor(previous / row),
  ];
  let best = 0;
  let turn = -Infinity;
  ways.forEach((to, k) => {
    const [ox, oz] = [(to % row) - (at % row), Math.floor(to / row) - Math.floor(at / row)];
    const cross = ix * oz - iz * ox;
    if (cross > turn) [best, turn] = [k, cross];
  });
  return ways.splice(best, 1)[0]!;
}

/** Douglas-Peucker on a closed loop, split at the corner farthest from the first. */
function straightened(loop: ReadonlyArray<[number, number]>, tolerance: number): Loop {
  if (loop.length < 4) return loop;
  const far = loop.reduce(
    (best, [x, z], k) =>
      Math.hypot(x - loop[0]![0], z - loop[0]![1]) >
      Math.hypot(loop[best]![0] - loop[0]![0], loop[best]![1] - loop[0]![1])
        ? k
        : best,
    0,
  );
  return [
    ...simplified(loop.slice(0, far + 1), tolerance).slice(0, -1),
    ...simplified([...loop.slice(far), loop[0]!], tolerance).slice(0, -1),
  ];
}

function simplified(
  line: ReadonlyArray<[number, number]>,
  tolerance: number,
): Array<[number, number]> {
  if (line.length < 3) return [...line];
  const [ax, az] = line[0]!;
  const [bx, bz] = line.at(-1)!;
  const length = Math.hypot(bx - ax, bz - az) || 1e-12;
  let [worst, at] = [0, 0];
  for (let k = 1; k < line.length - 1; k++) {
    const [x, z] = line[k]!;
    const off = Math.abs((bx - ax) * (az - z) - (ax - x) * (bz - az)) / length;
    if (off > worst) [worst, at] = [off, k];
  }
  if (worst <= tolerance) return [line[0]!, line.at(-1)!];
  return [
    ...simplified(line.slice(0, at + 1), tolerance).slice(0, -1),
    ...simplified(line.slice(at), tolerance),
  ];
}
