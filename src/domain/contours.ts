import type { Atlas, AtlasRegion, Detail } from './atlas';

/**
 * **Le contour d'un territoire** (ADR 0033) : plus d'aplat, chaque territoire connu se lit
 * à un trait en tirets sur sa frontière extérieure. Le joueur règle son épaisseur.
 */
export type ContourWeight = 'thin' | 'thick';
export const CONTOUR_WEIGHTS: ReadonlyArray<ContourWeight> = ['thin', 'thick'];
/** Fins et serrés (choix de Pierre sur la maquette #194, 21/10). */
export const DEFAULT_CONTOUR_WEIGHT: ContourWeight = 'thin';
export const isContourWeight = (value: unknown): value is ContourWeight =>
  CONTOUR_WEIGHTS.includes(value as ContourWeight);

/** One run of a territory's contour; `inset`, it faces another territory and stands back at home. */
export type ContourLine = { readonly points: Float32Array; readonly inset: boolean };

/**
 * Les lignes des territoires (`territoryOf`, `undefined` = hors de toute ligne), lues sur les arcs
 * de l'atlas au niveau `detail` : la côte, l'encre et le contour suivent les mêmes points. Chaque
 * territoire rend ses lignes intérieur **à gauche** — tous ses tirets tournent dans le même
 * sens. Face à la mer, à un lac ou à une région non tenue, la ligne est posée sur la frontière
 * même ; face à un autre territoire, `inset` : les deux lignes restent côte à côte, chacune en
 * retrait chez elle (ADR 0033, amendé le 21/10). `inner` : les arcs entre deux régions d'un même
 * territoire.
 */
export function contourLines(
  atlas: Pick<Atlas, 'borders'>,
  territoryOf: (regionId: string) => string | undefined,
  detail: Detail,
): { readonly outlines: ReadonlyMap<string, ContourLine[]>; readonly inner: Float32Array[] } {
  const of = (region: AtlasRegion | null) => (region === null ? undefined : territoryOf(region.id));
  /** Per territory, the arcs facing another territory (`inset`) and those facing the void. */
  const pieces = new Map<string, { inset: Float32Array[]; open: Float32Array[] }>();
  const add = (territory: string, inset: boolean, points: Float32Array) => {
    const kept =
      pieces.get(territory) ?? pieces.set(territory, { inset: [], open: [] }).get(territory)!;
    (inset ? kept.inset : kept.open).push(points);
  };
  const inner: Float32Array[] = [];
  const borders = atlas.borders(
    (left, right) => (of(left) ?? of(right)) !== undefined && left?.id !== right?.id,
    detail,
  );
  for (const { points, left, right } of borders) {
    const [l, r] = [of(left), of(right)];
    if (l === r) {
      inner.push(points);
      continue;
    }
    const inset = l !== undefined && r !== undefined;
    if (l !== undefined) add(l, inset, points);
    if (r !== undefined) add(r, inset, reversed(points));
  }
  const outlines = new Map<string, ContourLine[]>();
  for (const [territory, { inset, open }] of pieces)
    outlines.set(territory, [
      ...chained(open).map((points) => ({ points, inset: false })),
      ...chained(inset).map((points) => ({ points, inset: true })),
    ]);
  return { outlines, inner };
}

function reversed(points: Float32Array): Float32Array {
  const out = new Float32Array(points.length);
  for (let i = 0; i < points.length; i += 2)
    out.set([points[i]!, points[i + 1]!], points.length - 2 - i);
  return out;
}

/** The arcs laid end to end where one starts at another's end, so a dash runs on along the border
 *  and does not restart at every node of the atlas. */
function chained(pieces: Float32Array[]): Float32Array[] {
  const at = (points: Float32Array, i: number) => `${points[i]},${points[i + 1]}`;
  const from = new Map<string, Float32Array[]>();
  for (const piece of pieces) {
    const key = at(piece, 0);
    (from.get(key) ?? from.set(key, []).get(key)!).push(piece);
  }
  const used = new Set<Float32Array>();
  const lines: Float32Array[] = [];
  for (const first of pieces) {
    if (used.has(first)) continue;
    const chain: number[] = [];
    let piece: Float32Array | undefined = first;
    while (piece !== undefined) {
      used.add(piece);
      for (let i = chain.length === 0 ? 0 : 2; i < piece.length; i++) chain.push(piece[i]!);
      piece = from.get(at(piece, piece.length - 2))?.find((next) => !used.has(next));
    }
    lines.push(Float32Array.from(chain));
  }
  return lines;
}
