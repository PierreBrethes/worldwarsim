import { describe, expect, it } from 'vitest';
import type { World } from '@/domain/world';
import { buildCoastalWash } from './coastal-wash';
import { WorldFrame } from './frame';

/** A square of land whose north coast is cut by a bay narrower than the coarsening step. */
const bayed = [
  [200, 104],
  [204, 104],
  [204, 108],
  [202.1, 108],
  [202, 107.8],
  [201.9, 108],
  [200, 108],
] as const;

const world = {
  sphere: { minX: 0, maxX: 400, minY: 0, maxY: 208 },
  outline: [],
  countries: [
    { name: 'T', adm0: 'T', representativePoint: [202, 106], lonLat: [0, 0], rings: [bayed] },
  ],
} as unknown as World;

/** The wash's ink at a point of the sea, read off its triangles; 0 where no triangle lies. */
function inkAt(x: number, y: number): number {
  const frame = new WorldFrame(world);
  const geometry = buildCoastalWash(world, frame).geometry;
  const position = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  const index = geometry.getIndex()!;
  const px = x - frame.centerX;
  const pz = y - frame.centerY;
  let ink = 0;
  for (let t = 0; t < index.count; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => index.getX(t + k));
    const [ax, az, bx, bz, cx, cz] = [a, b, c].flatMap((v) => [
      position.getX(v!),
      position.getZ(v!),
    ]);
    const area = (bx! - ax!) * (cz! - az!) - (cx! - ax!) * (bz! - az!);
    if (Math.abs(area) < 1e-12) continue;
    const u = ((bx! - px) * (cz! - pz) - (cx! - px) * (bz! - pz)) / area;
    const v = ((cx! - px) * (az! - pz) - (ax! - px) * (cz! - pz)) / area;
    const w = 1 - u - v;
    if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue;
    ink = Math.max(ink, u * color.getW(a!) + v * color.getW(b!) + w * color.getW(c!));
  }
  return ink;
}

describe('the coastal wash', () => {
  /**
   * The wash is offset from a coarsened trace; a bay the trace cuts across used to stay unwashed,
   * a crisp pale wedge between the coast and the ribbon — the light fringe along the shores.
   */
  it('inks the water of a bay the coarsened trace cuts across', () => {
    expect(inkAt(202, 107.95)).toBeGreaterThan(0.1);
  });

  it('still fades out to sea', () => {
    expect(inkAt(202, 108.4)).toBeGreaterThan(0);
    expect(inkAt(202, 110)).toBe(0);
  });
});
