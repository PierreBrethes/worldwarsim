/**
 * **Le contour d'un territoire** (ADR 0033) : plus d'aplat, chaque bloc de régions connues se lit
 * à un trait en tirets sur sa frontière extérieure. Le joueur règle son épaisseur.
 */
export type ContourWeight = 'thin' | 'thick';
export const CONTOUR_WEIGHTS: ReadonlyArray<ContourWeight> = ['thin', 'thick'];
/** Fins et serrés (choix de Pierre sur la maquette #194, 21/10). */
export const DEFAULT_CONTOUR_WEIGHT: ContourWeight = 'thin';
export const isContourWeight = (value: unknown): value is ContourWeight =>
  CONTOUR_WEIGHTS.includes(value as ContourWeight);

type Point = readonly [number, number];
type Ring = ReadonlyArray<Point>;
type Side = { readonly region: number; readonly a: Point; readonly b: Point };

/**
 * Les lignes d'un ensemble de régions groupées en blocs (`blockOf`, `undefined` = hors de toute
 * ligne) : chaque bloc rend ses boucles fermées, intérieur **à gauche** de la normale
 * `(-dy, dx)` — toutes tournent dans le même sens, donc leurs tirets aussi —, et `inner` les
 * arêtes entre deux régions d'un même bloc.
 *
 * Une arête se reconnaît à ses deux sommets : `regions.json` cuit les régions voisines sur les
 * mêmes points. Une arête vue d'un seul côté borde la mer ou une région hors bloc.
 */
export function contourLines(
  regions: ReadonlyArray<{ readonly id: string; readonly rings: ReadonlyArray<Ring> }>,
  blockOf: (regionId: string) => string | undefined,
): { readonly outlines: ReadonlyMap<string, Point[][]>; readonly inner: Point[][] } {
  const blocks: string[] = [];
  const edges = new Map<string, Side[]>();
  for (const { id, rings } of regions) {
    const block = blockOf(id);
    if (block === undefined) continue;
    const region = blocks.push(block) - 1;
    for (const raw of rings) {
      const ring = signedArea(raw) < 0 ? [...raw].reverse() : raw;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const ka = `${a[0]},${a[1]}`;
        const kb = `${b[0]},${b[1]}`;
        if (ka === kb) continue;
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const sides = edges.get(key) ?? [];
        sides.push({ region, a, b });
        edges.set(key, sides);
      }
    }
  }
  const directed = new Map<string, Side[]>();
  const inner: Point[][] = [];
  for (const sides of edges.values()) {
    const owners = new Set(sides.map(({ region }) => blocks[region]!));
    if (sides.length > 1 && owners.size === 1) {
      if (sides[0]!.region !== sides[1]!.region) inner.push([sides[0]!.a, sides[0]!.b]);
      continue;
    }
    for (const side of sides) {
      const block = blocks[side.region]!;
      const kept = directed.get(block);
      if (kept === undefined) directed.set(block, [side]);
      else kept.push(side);
    }
  }
  return {
    outlines: new Map([...directed].map(([block, sides]) => [block, chains(sides)])),
    inner,
  };
}

function signedArea(ring: Ring): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    area += ax * by - bx * ay;
  }
  return area;
}

/** The directed edges chained into lines, so a dash runs on along the border and does not restart
 *  at every vertex. */
function chains(sides: ReadonlyArray<Side>): Point[][] {
  const from = new Map<string, Side[]>();
  for (const side of sides) {
    const key = `${side.a[0]},${side.a[1]}`;
    const kept = from.get(key);
    if (kept === undefined) from.set(key, [side]);
    else kept.push(side);
  }
  const used = new Set<Side>();
  const lines: Point[][] = [];
  for (const first of sides) {
    if (used.has(first)) continue;
    const line: Point[] = [first.a];
    let side: Side | undefined = first;
    while (side !== undefined && !used.has(side)) {
      used.add(side);
      line.push(side.b);
      side = from.get(`${side.b[0]},${side.b[1]}`)?.find((next) => !used.has(next));
    }
    lines.push(line);
  }
  return lines;
}
