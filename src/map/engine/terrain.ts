import { Color, Group, SRGBColorSpace, type Vector3 } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { RegionType } from '@/domain/ids';
import type { MapMotion } from '@/domain/map-motion';
import { inkedStrands } from './ink';
import { PALETTE } from './palette';

/**
 * Hover wash per type — muted inks, under the highlight material's opacity: the map stays
 * paper, the tint is only a hint.
 */
export const TYPE_TINTS: Record<RegionType, string> = {
  plain: '#a8a352',
  forest: '#48663a',
  jungle: '#2f7a4c',
  mountain: '#8a8072',
  desert: '#c99f56',
  tundra: '#9fbfc4',
};

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

const PICTOGRAMS = {
  conifer: (x, y) => {
    const h = 17;
    const w = h * 0.42;
    return [-1, 1].map((side) => [
      [x, y - h],
      [x + side * w * 0.55, y - h * 0.5],
      [x + side * w * 0.2, y - h * 0.5],
      [x + side * w, y - h * 0.12],
      [x + side * w * 0.25, y - h * 0.12],
      [x + side * w * 0.25, y],
    ]);
  },
  broadleaf: (x, y, random) => {
    const h = 15;
    const cy = y - h * 0.62;
    const rx = h * 0.34;
    const ry = h * 0.3;
    const blob = Array.from({ length: 11 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2 + 3.6;
      const k = 0.85 + random() * 0.3;
      return [x + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k] as const;
    });
    return [
      [
        [x, y],
        [x, y - h * 0.34],
      ],
      blob,
      [
        [x - rx * 0.5, cy + 1],
        [x - rx * 0.1, cy - ry * 0.3],
        [x + rx * 0.4, cy],
      ],
    ];
  },
  mountain: (x, y, random) => {
    const h = 18 + random() * 8;
    const w = h * 1.1;
    const hatches: Stroke[] = [];
    for (let k = 0; k < 4; k++) {
      const t = (k + 1.2) / 5.4;
      const px = x + w * t;
      const py = y - h + h * t;
      hatches.push([
        [px, py],
        [px - 2 - random() * 2, py + (y - py) * (0.55 + random() * 0.35)],
      ]);
    }
    return [
      [
        [x - w, y],
        [x - w * 0.55, y - h * 0.55],
        [x - w * 0.3, y - h * 0.42],
        [x, y - h],
        [x + w * 0.3, y - h * 0.5],
        [x + w * 0.55, y - h * 0.6],
        [x + w, y],
      ],
      ...hatches,
    ];
  },
  dune: (x, y, random) => {
    const h = 8;
    const w = 15 + random() * 6;
    const grain = (gx: number, gy: number): Stroke => [
      [gx, gy],
      [gx + 0.6, gy],
    ];
    return [
      quad([x - w, y], [x - w * 0.45, y - h * 2], [x + w, y + 1], 12),
      quad([x - w * 0.7, y + h * 0.7], [x - w * 0.2, y - h * 0.5], [x + w * 0.8, y + h * 0.9], 10),
      grain(x - 4, y + h * 1.6),
      grain(x + 2, y + h * 1.9),
      grain(x + 8, y + h * 1.5),
    ];
  },
  palm: (x, y, random) => {
    const h = 21;
    const top: Point = [x + 3 + random() * 3, y - h];
    const leaf = h * 0.55;
    return [
      quad([x, y], [x - 3, y - h * 0.5], top, 8),
      ...[-2.7, -2.15, -1.6, -1.0, -0.45].map((a) =>
        quad(
          top,
          [top[0] + Math.cos(a) * leaf * 0.5, top[1] + Math.sin(a) * leaf * 0.9],
          [top[0] + Math.cos(a) * leaf, top[1] + Math.sin(a) * leaf * 0.3 + leaf * 0.5],
          6,
        ),
      ),
    ];
  },
  fern: (x, y) => {
    const h = 14;
    return [-0.9, -0.45, 0, 0.45, 0.9].map((a) =>
      quad(
        [x, y],
        [x + a * h * 0.4, y - h * 0.7],
        [x + a * h * 0.95, y - h * (1 - Math.abs(a) * 0.35)],
        5,
      ),
    );
  },
  grass: (x, y, random) => {
    const h = 9;
    return [-2, -0.7, 0.7, 2].map((k) =>
      quad(
        [x + k * 1.2, y],
        [x + k * 1.3, y - h * 0.6],
        [x + k * 3 + (random() - 0.5) * 2, y - h * (1 - Math.abs(k) * 0.12)],
        4,
      ),
    );
  },
  wind: (x, y, random) => {
    const l = 16 + random() * 6;
    return [
      quad([x - l, y + 1], [x, y - 3], [x + l, y], 8),
      [
        [x + l - 5, y - 4],
        [x + l, y],
        [x + l - 5, y + 3],
      ],
      [
        [x - l + 2, y + 1],
        [x - l - 2, y - 3],
      ],
      [
        [x - l + 7, y - 0.5],
        [x - l + 3, y - 4.5],
      ],
    ];
  },
  wheat: (x, y) => {
    const h = 14;
    return [
      [
        [x, y],
        [x + 1, y - h],
      ],
      ...[0.3, 0.5, 0.7, 0.9].flatMap((t): Stroke[] => [
        [
          [x + t, y - h * t],
          [x - 3.5, y - h * t - 4],
        ],
        [
          [x + t, y - h * t],
          [x + 3.5, y - h * t - 4],
        ],
      ]),
    ];
  },
  hedge: (x, y) => {
    const n = 3;
    const w = 7;
    const crowns: Point[] = [];
    for (let i = 0; i < n; i++)
      for (let s = 0; s <= 4; s++) {
        const t = s / 4;
        crowns.push([x - n * w + i * 2 * w + t * 2 * w, y - Math.sin(t * Math.PI) * 5]);
      }
    return [
      crowns,
      [
        [x - n * w, y + 2],
        [x + n * w, y + 2.5],
      ],
    ];
  },
  field: (x, y) => {
    const at = (u: number, v: number): Point => [x + u * 24 - 12 + v * 2, y + v * 12 - u * 3];
    return [
      [at(0, 0), at(1, 0), at(1, 1), at(0, 1), at(0, 0)],
      ...[0.25, 0.5, 0.75].map((v) => [at(0.04, v), at(0.96, v)]),
    ];
  },
} satisfies Record<string, Pictogram>;

type PictogramKey = keyof typeof PICTOGRAMS;

const TERRAIN_PICTOGRAMS: Record<RegionType, (random: Random) => PictogramKey[]> = {
  forest: (random) =>
    random() < 0.55 ? ['conifer', 'conifer', 'broadleaf'] : ['broadleaf', 'conifer'],
  jungle: (random) => (random() < 0.6 ? ['palm', 'fern'] : ['fern', 'palm', 'fern']),
  mountain: () => ['mountain'],
  desert: () => ['dune'],
  tundra: (random) => (random() < 0.65 ? ['grass', 'grass'] : ['wind']),
  plain: (random) =>
    ([['wheat', 'wheat'], ['wheat', 'wheat'], ['field'], ['hedge']] as const)[
      Math.floor(random() * 4)
    ]!.slice(),
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
    const kinds = TERRAIN_PICTOGRAMS[type](random);
    const strokes = kinds.flatMap((kind, k) => {
      const [ox, oy] = kinds.length > 1 ? CLUSTER_OFFSETS[k]! : [0, 0];
      return PICTOGRAMS[kind](ox, oy, random).map((stroke) =>
        stroke.map(
          ([px, py]) =>
            [
              anchor[0] + (px + (random() - 0.5) * JITTER) * unit,
              anchor[1] + (py + (random() - 0.5) * JITTER) * unit,
            ] as const,
        ),
      );
    });
    return { anchor, delay: (i / Math.max(1, anchors.length - 1)) * STAGGER_S, strokes };
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
const PEAK_OPACITY = 0.88;
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

const hsl = { h: 0, s: 0, l: 0 };
/**
 * Dark ink vanishes on a dark ground (France's blue): there the pen draws in paper. The ground is
 * what is *painted*, not the seat's ink: a held region lays it at `opacity` over the sheet (a
 * faded survey barely tints it), so the luminance is read, in sRGB, on that mix. No `ink` is the bare sheet.
 */
export function inkOn(ink: string | null, opacity: number): string {
  if (ink === null) return PALETTE.border;
  const sheet = new Color(PALETTE.paper).getHex();
  const seat = new Color(ink).getHex();
  const channel = (shift: number) =>
    Math.round(((sheet >> shift) & 255) * (1 - opacity) + ((seat >> shift) & 255) * opacity);
  const painted = new Color((channel(16) << 16) | (channel(8) << 8) | channel(0));
  return painted.getHSL(hsl, SRGBColorSpace).l < 0.45 ? PALETTE.paper : PALETTE.border;
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

  /** Forgets every drawing at once: a fade would show strands laid for a stale curvature. */
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
      material.opacity = PEAK_OPACITY * fadeIn * sketch.fade * layerFade;
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
