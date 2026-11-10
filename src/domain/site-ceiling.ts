import type { Atlas } from './atlas';

/**
 * **How much of the land that carries it a site may take**: the widest side of its socle against
 * the side of the square as large as that land (`landSideAt`). At 1 a barracks is no wider than
 * its department.
 * @a-mesurer the middle of three thresholds captured (1.25, 1, 0.75); Pierre picks one (retour du 10/11)
 */
export const LAND_SHARE = 1;

/**
 * **The size a site still reads at**: the smallest a tight ring already draws one (ADR 0038 §6).
 * Where it gives way to its pin (d ≈ 30) a barracks' socle is then some 25 px wide, the size of
 * the floored figurines at its foot.
 * @a-mesurer the ring's smallest step, kept as the floor; never measured on a phone
 */
export const LEAST_SITE_SCALE = 0.4;

/**
 * **The largest a site is drawn on the land that carries it**, against its full size: whole where
 * its `footprint` takes no more than `LAND_SHARE` of the `land` (both in board units), down to
 * `LEAST_SITE_SCALE` on a land too small for it. A land not known caps nothing.
 */
export const siteCeiling = (footprint: number, land: number | null): number =>
  land === null
    ? 1
    : Math.min(1, Math.max(LEAST_SITE_SCALE, (LAND_SHARE * land) / Math.max(footprint, 1e-9)));

/**
 * How far a point at sea reads the land beside it, in the atlas's units (about 20 km): a port
 * stands on the coast, which the far level draws a little inland of it.
 * @a-mesurer wide enough for Reggio and Le Havre, whose points the far level leaves at sea
 */
const SHORE_REACH = 0.25;
const SHORE_STEPS = [0.25, 0.5, 1];
const BEARINGS = Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4);

/**
 * **The land that carries a point**, as the side of the square of its area: the piece of its
 * region under it — an islet of a province is not the province —, lakes left out. In the atlas's
 * units, on its far level: the level that is always loaded, so a site keeps its size when the
 * near one lands. A point just off the shore reads the nearest land within `SHORE_REACH`; `null`
 * out at sea.
 */
export function landSideAt(atlas: Atlas, [x, y]: readonly [number, number]): number | null {
  const under = pieceAt(atlas, x, y);
  if (under !== null) return under;
  for (const step of SHORE_STEPS)
    for (const bearing of BEARINGS) {
      const beside = pieceAt(
        atlas,
        x + SHORE_REACH * step * Math.sin(bearing),
        y + SHORE_REACH * step * Math.cos(bearing),
      );
      if (beside !== null) return beside;
    }
  return null;
}

function pieceAt(atlas: Atlas, x: number, y: number): number | null {
  const region = atlas.regionAt([x, y], 'far');
  if (region === null) return null;
  const pieces = atlas.shapes((each) => each.id, 'far', new Set([region.id])).get(region.id) ?? [];
  const under = pieces.find(({ outer }) => contains(outer, x, y));
  if (under === undefined) return null;
  const area = under.holes.reduce((left, hole) => left - areaOf(hole), areaOf(under.outer));
  return Math.sqrt(Math.max(area, 0));
}

function areaOf(ring: Float32Array): number {
  let sum = 0;
  for (let i = 0, n = ring.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    sum += ring[2 * i]! * ring[2 * j + 1]! - ring[2 * j]! * ring[2 * i + 1]!;
  }
  return Math.abs(sum / 2);
}

function contains(ring: Float32Array, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, n = ring.length / 2; i < n; i++) {
    const j = (i + n - 1) % n;
    const [xi, yi, xj, yj] = [ring[2 * i]!, ring[2 * i + 1]!, ring[2 * j]!, ring[2 * j + 1]!];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
