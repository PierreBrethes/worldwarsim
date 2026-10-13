import { Color, Group, type Vector3 } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { RegionType } from '@/domain/ids';
import type { MapMotion } from '@/domain/map-motion';
import { inkedStrands } from './ink';
import { PALETTE } from './palette';

/**
 * **Les dessins de terrain au survol** (`WWS/docs/design/propositions/table-etat-major.md`) :
 * des pictogrammes de cartographe tracés à la plume dans la région survolée. Décor pur — le type
 * est cuit hors ligne et aucune règle ne le lit.
 *
 * The pictograms are drawn in the prototype's pixels — y down, the base of the drawing at
 * (x, y) — and scaled onto the region afterwards: `PICTOGRAMS` is the one place a drawing changes.
 */
type Point = readonly [number, number];
type Stroke = ReadonlyArray<Point>;
type Random = () => number;
type Pictogram = (x: number, y: number, random: Random) => Stroke[];

const quad = (p0: Point, c: Point, p1: Point, n = 8): Stroke =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [
      u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
    ] as const;
  });

const line = (a: Point, b: Point): Stroke => [a, b];

/** A loop of `n` points around (cx, cy), its radius `r(angle)`: crowns, lichens. */
const loop = (cx: number, cy: number, r: (a: number) => number, n = 24): Stroke =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r(a), cy + Math.sin(a) * r(a)] as const;
  });

/** A curved rib with leaflets off it — palm fronds and fern fronds, so a jungle reads as foliage
 *  rather than as sticks. `hanging`: one row, falling under the rib like a palm's; otherwise a
 *  fern's two rows, swept toward the tip. */
function frond(from: Point, control: Point, to: Point, leaf: number, hanging: boolean): Stroke[] {
  const rib = quad(from, control, to, 8);
  const leaves: Stroke[] = [];
  for (let i = 2; i < rib.length; i++) {
    const [ax, ay] = rib[i - 1]!;
    const [bx, by] = rib[i]!;
    const length = Math.hypot(bx - ax, by - ay) || 1;
    const [tx, ty] = [(bx - ax) / length, (by - ay) / length];
    const size = leaf * (1 - (i / rib.length) * 0.55);
    const sides = hanging ? [tx >= 0 ? 1 : -1] : [-1, 1];
    for (const side of sides) {
      const [nx, ny] = [-ty * side, tx * side];
      leaves.push(
        hanging
          ? line([bx, by], [bx + (nx - tx * 0.3) * size, by + (ny - ty * 0.3) * size + size * 0.5])
          : line([bx, by], [bx + (nx + tx * 0.7) * size, by + (ny + ty * 0.7) * size]),
      );
    }
  }
  return [rib, ...leaves];
}

const between = (random: Random, lo: number, hi: number): number => lo + random() * (hi - lo);
/** An integer in [lo, hi]. */
const count = (random: Random, lo: number, hi: number): number =>
  lo + Math.floor(random() * (hi - lo + 1));

/** Leans a drawing: each point slides sideways in proportion to its height above `y`. */
const lean = (strokes: Stroke[], y: number, k: number): Stroke[] =>
  strokes.map((stroke) => stroke.map(([px, py]) => [px + (y - py) * k, py] as const));

export const PICTOGRAMS = {
  /** The sapin: two or three drooping tiers on a stub of trunk, its shade side hatched, leaning a hair. */
  conifer: (x, y, random) => {
    const h = between(random, 16, 22);
    const w = h * between(random, 0.32, 0.4);
    const tiers =
      random() < 0.5
        ? ([
            [0.55, 0.7],
            [0.12, 1],
          ] as const)
        : ([
            [0.62, 0.55],
            [0.34, 0.8],
            [0.08, 1],
          ] as const);
    const side = (s: number): Stroke => [
      [x, y - h],
      ...tiers.flatMap(([at, width]): Point[] => [
        [x + s * w * width, y - h * at],
        [x + s * w * width * 0.38, y - h * (at + 0.02)],
      ]),
      [x + s * 1, y - h * 0.08],
      [x + s * 1, y],
    ];
    return lean(
      [
        side(-1),
        side(1),
        ...tiers
          .slice(0, -1)
          .map(([at]) =>
            line([x + w * 0.2, y - h * (at - 0.04)], [x + w * 0.62, y - h * (at - 0.14)]),
          ),
      ],
      y,
      between(random, -0.06, 0.06),
    );
  },
  /** The broadleaf: a round, scalloped crown on a forked trunk, hatched under its belly. */
  broadleaf: (x, y, random) => {
    const h = between(random, 14, 20);
    const cy = y - h * 0.62;
    const r = h * between(random, 0.33, 0.4);
    const lobes = 6 + Math.floor(random() * 2);
    return lean(
      [
        loop(x, cy, (a) => r * (0.86 + 0.16 * Math.abs(Math.sin((a * lobes) / 2))), 42),
        [
          [x - 0.6, y],
          [x - 0.3, cy + r * 0.5],
          [x - 2.4, cy - r * 0.05],
        ],
        line([x - 0.3, cy + r * 0.62], [x + 1.8, cy + r * 0.1]),
        ...[0, 1, 2].map((k) =>
          line(
            [x + r * (0.05 + k * 0.28), cy + r * 0.78],
            [x + r * (0.35 + k * 0.28), cy + r * 0.32],
          ),
        ),
        line([x - 3, y + 0.4], [x + 3.4, y + 0.4]),
      ],
      y,
      between(random, -0.05, 0.05),
    );
  },
  /** A massif of one to three peaks, one dominant at a random place along it, the shade flank of
   *  the dominant one hatched down the fall line. */
  mountain: (x, y, random) => {
    const peaks = count(random, 1, 3);
    const h = between(random, 19, 26);
    const w = h * 0.95 * (1 + 0.5 * (peaks - 1));
    const main = Math.floor(random() * peaks);
    const tops: Point[] = Array.from({ length: peaks }, (_, i) => {
      const height = i === main ? h : h * between(random, 0.5, 0.78);
      return [x + w * (-1 + (2 * (i + 0.5)) / peaks) + between(random, -2, 2), y - height];
    });
    // A shoulder halfway up each outer slope; the ridge between two summits dips to 40 % of the
    // lower one, never to the ground.
    const slope = (top: Point, foot: number): Point => [
      (top[0] + foot) / 2,
      y - (y - top[1]) * 0.5,
    ];
    const outline: Point[] = [[x - w, y], slope(tops[0]!, x - w)];
    tops.forEach((top, i) => {
      if (i > 0) {
        const prev = tops[i - 1]!;
        outline.push([(prev[0] + top[0]) / 2, y - (y - Math.min(prev[1], top[1])) * 0.4]);
      }
      outline.push(top);
    });
    outline.push(slope(tops.at(-1)!, x + w), [x + w, y]);
    const peak = tops[main]!;
    const foot = outline[outline.indexOf(peak) + 1]!;
    const reach = between(random, 0.5, 0.9);
    const strokes = count(random, 4, 7);
    const hatches = Array.from({ length: strokes }, (_, k) => {
      const t = (k + 0.7) / (strokes + 0.6);
      const px = peak[0] + (foot[0] - peak[0]) * t;
      const py = peak[1] + (foot[1] - peak[1]) * t;
      return line([px, py], [px - 4 - (1 - t) * 3, py + (y - py) * (reach - 0.1 + random() * 0.2)]);
    });
    return [outline, line([peak[0] - 0.5, peak[1] + 4], [peak[0] - 2.5, peak[1] + 7]), ...hatches];
  },
  /** A crescent dune: a long windward back, a sharp crest, the lee face hatched, sand grains. */
  dune: (x, y, random) => {
    const h = between(random, 10, 14);
    const w = between(random, 13, 23);
    const crest: Point = [x + w * between(random, 0.2, 0.4), y - h];
    const lee = quad(crest, [x + w * 0.5, y - h * 0.15], [x + w, y], 8);
    const grain = (gx: number, gy: number): Stroke => line([gx, gy], [gx + 0.5, gy + 0.2]);
    const grains: ReadonlyArray<Point> = [
      [-0.6, 2.2],
      [-0.15, 3.6],
      [0.2, 2.4],
      [0.55, 3.8],
      [-0.95, 5.6],
      [0.85, 2.6],
    ];
    return [
      quad([x - w, y], [x - w * 0.3, y - h * between(random, 1.1, 1.7)], crest, 12),
      lee,
      ...lee.slice(1, -1).map(([lx, ly]) => line([lx, ly + 0.8], [lx, y - 0.4])),
      quad([x - w * 1.25, y + 4], [x - w * 0.8, y - 1], [x - w * 0.35, y + 4], 6),
      ...grains.slice(0, count(random, 3, 6)).map(([u, v]) => grain(x + u! * w, y + v!)),
    ];
  },
  /** The palm: a ringed, bent trunk and a fan of drooping fronds with their leaflets. */
  palm: (x, y, random) => {
    const h = between(random, 20, 26);
    const reachBase = between(random, 9, 12);
    const top: Point = [x + between(random, 3, 6), y - h];
    const trunk = quad([x, y], [x - between(random, 0, 4.5), y - h * 0.5], top, 8);
    const rings = trunk
      .slice(1, -2)
      .map(([tx, ty]) => line([tx - 1.3, ty + 0.5], [tx + 1.3, ty - 0.3]));
    const n = count(random, 5, 7);
    const fronds = Array.from({ length: n }, (_, i) => -2.9 + (2.65 * i) / (n - 1)).flatMap((a) => {
      const reach = reachBase + random() * 2;
      const end: Point = [
        top[0] + Math.cos(a) * reach,
        top[1] + reach * (0.7 - Math.abs(Math.sin(a)) * 0.85),
      ];
      const mid: Point = [top[0] + Math.cos(a) * reach * 0.55, top[1] + Math.sin(a) * reach * 0.8];
      return frond(top, mid, end, 2.8, true);
    });
    return [trunk, ...rings, ...fronds];
  },
  /** The undergrowth fern: arching fronds from one root, leaflets on both sides. */
  fern: (x, y, random) => {
    const h = between(random, 10, 15);
    const n = count(random, 4, 6);
    return Array.from({ length: n }, (_, i) => -0.85 + (1.7 * i) / (n - 1)).flatMap((a) =>
      frond(
        [x + a, y],
        [x + a * h * 0.25, y - h * (1.1 - Math.abs(a) * 0.2)],
        [x + a * h * 0.6, y - h * (1 - Math.abs(a) * 0.3)],
        1.5,
        false,
      ),
    );
  },
  /** A tussock over the bog: three to six short blades in a clump, the marsh dashes under it, a lichen. */
  tussock: (x, y, random) => {
    const n = count(random, 3, 6);
    const blades = Array.from({ length: n }, (_, i) => -1 + (2 * i) / (n - 1)).map((k) =>
      quad(
        [x + k * 1.5, y],
        [x + k * 2, y - 5.5],
        [x + k * 5.5 + (random() - 0.5), y - 10 + Math.abs(k) * 3],
        4,
      ),
    );
    const lichen = (lx: number, ly: number, r: number): Stroke =>
      loop(lx, ly, (a) => r * (0.85 + 0.25 * Math.abs(Math.sin(a * 2))), 10);
    return [
      ...blades,
      line([x - 11, y + 0.5], [x - 5, y + 0.5]),
      line([x - 2.5, y + 0.5], [x + 3.5, y + 0.5]),
      line([x + 6, y + 0.5], [x + 11, y + 0.5]),
      line([x - 6, y + 3.5], [x + 2, y + 3.5]),
      lichen(x + 11 + random() * 2, y - 2.6, 2.2),
      lichen(x + 15 + random() * 2, y - 1.2, 1.5),
    ];
  },
  /** Fields seen from the road: a ploughed plot whose furrows run to the back, a meadow beside it,
   *  the hedge along the back edge. */
  fields: (x, y, random) => {
    const back = y - 10;
    const flip = random() < 0.5 ? 1 : -1;
    const skew = between(random, -3, 3) * flip;
    const lerp = (a: Point, b: Point, t: number): Point => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
    ];
    // Two plots in perspective, ploughed two ways: furrows running to the back in one, across in
    // the other — the patchwork is what says « fields » at fifteen pixels.
    const along: [Point, Point, Point, Point] = [
      [x - 16 * flip, y],
      [x, y],
      [x - 1 * flip + skew, back],
      [x - 12 * flip + skew, back],
    ];
    const across: [Point, Point, Point, Point] = [
      [x + 1.5 * flip, y],
      [x + 16 * flip, y],
      [x + 12.5 * flip + skew, back],
      [x + 0.5 * flip + skew, back],
    ];
    const furrow = (n: number) => Array.from({ length: n }, (_, i) => (i + 1) / (n + 1));
    const furrowsAlong = furrow(count(random, 3, 5)).map((t) =>
      line(lerp(along[0], along[1], t), lerp(along[3], along[2], t)),
    );
    const furrowsAcross = furrow(count(random, 2, 3)).map((t) =>
      line(lerp(across[0], across[3], t), lerp(across[1], across[2], t)),
    );
    const bushes = [0.06, 0.37, 0.68, 0.98].map((t) => {
      const [bx, by] = lerp(along[3], across[2], t);
      return loop(bx, by - 1.9, (a) => 1.7 * (0.9 + 0.15 * Math.abs(Math.sin(a * 2.5))), 12);
    });
    return [
      [...along, along[0]],
      [...across, across[0]],
      ...furrowsAlong,
      ...furrowsAcross,
      ...bushes,
    ];
  },
} satisfies Record<string, Pictogram>;

type PictogramKey = keyof typeof PICTOGRAMS;

const TERRAIN_PICTOGRAMS: Record<RegionType, (random: Random) => PictogramKey[]> = {
  forest: (random) =>
    random() < 0.5 ? ['conifer', 'conifer', 'broadleaf'] : ['broadleaf', 'broadleaf', 'conifer'],
  jungle: (random) => (random() < 0.6 ? ['palm', 'fern', 'fern'] : ['fern', 'palm', 'palm']),
  mountain: () => ['mountain'],
  desert: () => ['dune'],
  tundra: () => ['tussock'],
  plain: () => ['fields'],
};

const CLUSTER_OFFSETS: ReadonlyArray<Point> = [
  [0, 0],
  [14, 2],
  [-13, 3],
];
const SPACING: Record<RegionType, number> = {
  forest: 36,
  jungle: 36,
  mountain: 40,
  desert: 38,
  tundra: 30,
  plain: 40,
};
/** Clear of the border on every side: a sapin half over the neighbour reads as a mistake. */
const MARGIN = 12;
/** What the rejection loop *aims* at, not a floor: it gives up after 900 tries, and a region too
 *  thin for the margin ends up with fewer pictograms, or none. */
const MIN_TARGET = 5;
const MAX_COUNT = 34;
/** Projected area per pictogram, in the prototype's square pixels. */
const AREA_PER_PICTOGRAM = 1000;
const JITTER = 1.3;

export const DRAW_S = 0.6;
export const STAGGER_S = 0.45;
export const SKETCH_S = DRAW_S + STAGGER_S;

/**
 * How tall a pictogram stands, in projected units: sized so that a region of twelve
 * `AREA_PER_PICTOGRAM` cells would stand at the prototype's 17, whatever it then holds (the
 * median department ends up with 5), until the cap keeps the Amazon from carrying trees a hundred
 * km high.
 */
const pictogramHeight = (area: number): number =>
  Math.min(0.9, Math.max(0.06, 17 * Math.sqrt(area / (12 * AREA_PER_PICTOGRAM))));

export type SketchedPictogram = {
  readonly anchor: Point;
  /** Seconds after the hover before the pen touches this one. */
  readonly delay: number;
  readonly strokes: ReadonlyArray<Stroke>;
};

/**
 * Anchors by rejection in the box, kept apart by the type's spacing and clear of the border,
 * then ordered from `center` out: the pen starts where the eye is and runs to the edges.
 */
export function sketchRegion({
  type,
  seed,
  box: [minX, minY, maxX, maxY],
  area,
  center: [cx, cy],
  covers,
}: {
  readonly type: RegionType;
  readonly seed: number;
  readonly box: readonly [number, number, number, number];
  readonly area: number;
  readonly center: Point;
  readonly covers: (x: number, y: number) => boolean;
}): SketchedPictogram[] {
  const random = mulberry(seed);
  const unit = pictogramHeight(area) / 17;
  const gap = SPACING[type] * unit;
  const margin = MARGIN * unit;
  const target = Math.max(
    MIN_TARGET,
    Math.min(MAX_COUNT, Math.round(area / (AREA_PER_PICTOGRAM * unit * unit))),
  );
  const anchors: Point[] = [];
  for (let tries = 0; tries < 900 && anchors.length < target; tries++) {
    const x = minX + random() * (maxX - minX);
    const y = minY + random() * (maxY - minY);
    const clear =
      covers(x, y) &&
      covers(x - margin, y) &&
      covers(x + margin, y) &&
      covers(x, y - margin) &&
      covers(x, y + margin);
    if (clear && anchors.every(([ax, ay]) => (ax - x) ** 2 + (ay - y) ** 2 > gap * gap))
      anchors.push([x, y]);
  }
  anchors.sort(
    ([ax, ay], [bx, by]) => (ax - cx) ** 2 + (ay - cy) ** 2 - (bx - cx) ** 2 - (by - cy) ** 2,
  );

  return anchors.map((anchor, i) => {
    const strokes = terrainCluster(type, random).map((stroke) =>
      stroke.map(
        ([px, py]) =>
          [
            anchor[0] + (px + (random() - 0.5) * JITTER) * unit,
            anchor[1] + (py + (random() - 0.5) * JITTER) * unit,
          ] as const,
      ),
    );
    return { anchor, delay: (i / Math.max(1, anchors.length - 1)) * STAGGER_S, strokes };
  });
}

/** What every drawing gets on top of its own variations: a mirror, a scale within ±10 %, a
 *  rotation within ±4°, all about its base. */
export function drawVariation(random: Random) {
  return {
    mirror: random() < 0.5 ? -1 : 1,
    scale: 0.9 + random() * 0.2,
    angle: ((random() * 8 - 4) * Math.PI) / 180,
  };
}

/** One anchor's drawing in the prototype's pixels, base at the origin — what the review page
 *  (`/pictograms.html`) shows as it is, and `sketchRegion` lays on a region. */
export function terrainCluster(type: RegionType, random: Random): Stroke[] {
  const kinds = TERRAIN_PICTOGRAMS[type](random);
  return kinds.flatMap((kind, k) => {
    const [ox, oy] = kinds.length > 1 ? CLUSTER_OFFSETS[k]! : [0, 0];
    const { mirror, scale, angle } = drawVariation(random);
    const [cos, sin] = [Math.cos(angle) * scale, Math.sin(angle) * scale];
    return PICTOGRAMS[kind](ox, oy, random).map((stroke) =>
      stroke.map(([px, py]) => {
        const [dx, dy] = [(px - ox) * mirror, py - oy];
        return [ox + dx * cos - dy * sin, oy + dx * sin + dy * cos] as const;
      }),
    );
  });
}

/** How much of a pictogram the pen has laid, `elapsed` seconds after the hover. */
export function penShare(delay: number, elapsed: number): number {
  const q = Math.min(1, Math.max(0, (elapsed - delay) / DRAW_S));
  return 1 - (1 - q) * (1 - q);
}

export function seed(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash;
}

export function mulberry(seedValue: number): () => number {
  let state = seedValue >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FADE_OUT_S = 0.4;
/** « Réduites » : the drawing appears without the pen, in a short fade. */
const FADE_IN_S = 0.25;
const PEAK_OPACITY = 1;
/** Share of the regions layer's fade over which a drawing reaches full opacity: a translucent
 *  paper stroke takes the ground's colour (grey-blue instead of white), so the fade is a hair. */
const ZOOM_FADE_BAND = 0.08;

/** Drawings are fully inked as soon as they show; the layer only decides *whether*. */
export function zoomFade(layerFade: number): number {
  return Math.min(1, Math.max(0, layerFade / ZOOM_FADE_BAND));
}
const STROKE_PX = 1.4;

export type PenStrands = ReadonlyArray<{
  readonly delay: number;
  readonly strands: ReadonlyArray<ReadonlyArray<Vector3>>;
}>;

type Sketch = {
  readonly regionId: string;
  readonly pictograms: PenStrands;
  readonly line: LineSegments2;
  readonly start: number;
  leftAt: number | null;
  drawn: boolean;
  /** 1 fully inked, 0 gone: it falls while the region is left and climbs back if hovered again,
   *  so a revival continues from where the fade stood. */
  fade: number;
  tick: number;
};

/** France's blue held in full draws in paper, the same blue washed to a quarter in ink. */
const DARK_GROUND_LUMA = 0.6;

/**
 * Dark ink vanishes on a dark ground (France's blue): there the pen draws in paper. The ground is
 * what is *painted*, not the seat's ink: a held region lays it at `opacity` over the land (a
 * faded survey barely tints it). Its luma is read on the sRGB numbers, and the board's light
 * darkens what it lays on, so a ground reads dark well above the middle grey. No `ink` is the
 * bare sheet.
 */
export function inkOn(ink: string | null, opacity: number): string {
  if (ink === null) return PALETTE.border;
  const sheet = new Color(PALETTE.neutralLand).getHex();
  const seat = new Color(ink).getHex();
  const channel = (shift: number) =>
    (((sheet >> shift) & 255) * (1 - opacity) + ((seat >> shift) & 255) * opacity) / 255;
  const luma = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luma < DARK_GROUND_LUMA ? PALETTE.paper : PALETTE.border;
}

/**
 * The pen over the hovered region. The region being left fades while the next one draws; a
 * region hovered again while it fades is revived, not redrawn.
 */
export class TerrainSketches {
  readonly group = new Group();
  motion: MapMotion = 'full';
  private sketches: Sketch[] = [];
  /** Kept rather than disposed: a dropped material drops its program, recompiled at the next
   *  hover — the stutter `InkLayer` already met. */
  private readonly spare: LineMaterial[] = [];
  private readonly resolution = { width: 1, height: 1 };
  private busy = false;

  /** Something is still being drawn or faded, so the engine keeps rendering for it. */
  get active(): boolean {
    return this.busy;
  }

  /** `ground` is the seat's ink when the region is held, laid at `groundOpacity`; `null` on the
   *  bare sheet. */
  show(
    regionId: string | null,
    sketch: () => PenStrands,
    now: number,
    ground: string | null = null,
    groundOpacity = 0,
  ): void {
    for (const leaving of this.sketches.filter(
      (s) => s.leftAt === null && s.regionId !== regionId,
    )) {
      if (this.motion === 'off') this.drop(leaving);
      else leaving.leftAt = now;
    }
    this.busy = true;
    if (regionId === null) return;
    const kept = this.sketches.find((s) => s.regionId === regionId);
    if (kept !== undefined) {
      kept.leftAt = null;
      return;
    }
    const line = new LineSegments2(
      new LineSegmentsGeometry(),
      this.material(inkOn(ground, groundOpacity)),
    );
    /** Transparent like the fills it lies on: drawn before them, a paper stroke is tinted by the
     *  nation's ink and reads grey-blue. */
    line.renderOrder = 1;
    this.group.add(line);
    this.sketches.push({
      regionId,
      pictograms: sketch(),
      line,
      start: now,
      leftAt: null,
      drawn: false,
      fade: 1,
      tick: now,
    });
  }

  /** Forgets every drawing at once: a fade would show strands laid for a stale ground. */
  clear(): void {
    for (const sketch of [...this.sketches]) this.drop(sketch);
    this.busy = true;
  }

  animate(now: number, layerFade: number): void {
    this.busy = false;
    for (const sketch of [...this.sketches]) {
      const elapsed = (now - sketch.start) / 1000;
      const fadeIn = this.motion === 'reduced' ? Math.min(1, elapsed / FADE_IN_S) : 1;
      const step = (now - sketch.tick) / 1000 / FADE_OUT_S;
      sketch.tick = now;
      sketch.fade = Math.min(1, Math.max(0, sketch.fade + (sketch.leftAt === null ? step : -step)));
      if (sketch.fade <= 0) {
        this.drop(sketch);
        continue;
      }
      if (!sketch.drawn && sketch.leftAt === null) {
        const pen = this.motion === 'full';
        this.lay(sketch, pen ? elapsed : SKETCH_S);
        sketch.drawn = !pen || elapsed >= SKETCH_S;
      }
      const material = sketch.line.material;
      material.opacity = PEAK_OPACITY * fadeIn * sketch.fade * zoomFade(layerFade);
      if (!sketch.drawn || sketch.leftAt !== null || sketch.fade < 1 || fadeIn < 1)
        this.busy = true;
    }
  }

  resize(width: number, height: number): void {
    this.resolution.width = width;
    this.resolution.height = height;
    for (const material of [...this.spare, ...this.sketches.map((s) => s.line.material)])
      material.resolution.set(width, height);
  }

  dispose(): void {
    for (const sketch of [...this.sketches]) this.drop(sketch);
    for (const material of this.spare) material.dispose();
    this.spare.length = 0;
    this.group.removeFromParent();
  }

  private lay(sketch: Sketch, elapsed: number): void {
    const positions: number[] = [];
    for (const { delay, strands } of sketch.pictograms) {
      for (const strand of inkedStrands(strands, penShare(delay, elapsed))) {
        for (let i = 1; i < strand.length; i++) {
          const a = strand[i - 1]!;
          const b = strand[i]!;
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
    }
    sketch.line.geometry.dispose();
    sketch.line.geometry = new LineSegmentsGeometry();
    if (positions.length > 0) sketch.line.geometry.setPositions(positions);
    sketch.line.visible = positions.length > 0;
  }

  private drop(sketch: Sketch): void {
    sketch.line.removeFromParent();
    sketch.line.geometry.dispose();
    this.spare.push(sketch.line.material);
    this.sketches = this.sketches.filter((s) => s !== sketch);
  }

  private material(ink: string): LineMaterial {
    const material =
      this.spare.pop() ??
      new LineMaterial({
        linewidth: STROKE_PX,
        transparent: true,
        depthWrite: false,
      });
    material.color.set(ink);
    material.resolution.set(this.resolution.width, this.resolution.height);
    return material;
  }
}
