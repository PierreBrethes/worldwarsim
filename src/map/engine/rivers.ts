import { Group, Vector3 } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { Detail, River } from '@/domain/atlas';
import { riverSpots, type RiverSpot } from '@/domain/place-names';
import { lineGeometry } from './atlas-geometry';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';

/**
 * **Les fleuves à l'encre bleue** (#440, variante A de `carte-lisible`) : deux niveaux comme la
 * côte, les grands au loin, tous au près. Under the night's veil, which inks them down with the
 * sheet; over the land, under the region strokes.
 */
const RIVER_INK = '#3f6c8c';
/** @a-mesurer */
const RIVER_OPACITY = 0.85;
/** One width per class of rank, no taper (the maquette tapered them, one segment at a time).
 *  @a-mesurer */
const MAJOR_PX = 2.2;
const MINOR_PX = 1.4;
/** They come in early, between these distances, then stay full: the continent view shows the
 *  Rhine and the Danube, as on the maquette. @a-mesurer */
const RIVERS_GONE_DISTANCE = 65;
const RIVERS_FULL_DISTANCE = 55;
/** Rank 4 and greater are the far level's rivers: the near ones beyond them draw thinner. */
const MAJOR_RANK = 4;
const LIFT = 0.002;

/** One level's rivers, as bare arrays: the near one is built by the worker (`near-sheet.ts`). */
export type RiverData = {
  readonly major: Float32Array;
  readonly minor: Float32Array;
  readonly names: ReadonlyArray<{ readonly name: string; readonly spots: readonly RiverSpot[] }>;
};

export function riverData(rivers: readonly River[], frame: WorldFrame): RiverData {
  const height = COUNTRY_THICKNESS + LIFT;
  const of = (major: boolean) =>
    lineGeometry(
      rivers
        .filter(({ rank }) => rank <= MAJOR_RANK === major)
        .flatMap(({ lines }) => lines.map((points) => ({ points }))),
      frame,
      height,
    );
  return {
    major: of(true),
    minor: of(false),
    names: rivers.flatMap(({ name, lines }) =>
      name === null ? [] : [{ name, spots: riverSpots(lines) }],
    ),
  };
}

/** A spot as the board holds it: its middle and the two ends of its straight run. */
type RiverNameSpot = { readonly at: Vector3; readonly from: Vector3; readonly to: Vector3 };

type Level = {
  readonly lines: Group;
  readonly names: ReadonlyArray<{ readonly name: string; readonly spots: RiverNameSpot[] }>;
};

export class RiverLayer {
  readonly group = new Group();
  private readonly materials = [MAJOR_PX, MINOR_PX].map(
    (linewidth) => new LineMaterial({ color: RIVER_INK, linewidth, transparent: true, opacity: 0 }),
  );
  private readonly levels: Partial<Record<Detail, Level>> = {};
  private shown: Detail = 'far';

  constructor(
    private readonly frame: WorldFrame,
    far: RiverData,
  ) {
    this.add('far', far);
  }

  add(detail: Detail, data: RiverData): void {
    const lines = new Group();
    [data.major, data.minor].forEach((positions, k) => {
      if (positions.length === 0) return;
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(positions);
      lines.add(new LineSegments2(geometry, this.materials[k]));
    });
    lines.visible = detail === this.shown;
    this.group.add(lines);
    const height = COUNTRY_THICKNESS + LIFT;
    this.levels[detail] = {
      lines,
      names: data.names.map(({ name, spots }) => ({
        name,
        spots: spots.map(({ x, y, angle, half }) => {
          const [dx, dy] = [Math.cos(angle) * half, Math.sin(angle) * half];
          return {
            at: this.frame.toWorld(x, y, height),
            from: this.frame.toWorld(x - dx, y - dy, height),
            to: this.frame.toWorld(x + dx, y + dy, height),
          };
        }),
      })),
    };
  }

  /** The level the sheet shows; the far one while the near has not come. */
  show(detail: Detail): void {
    this.shown = this.levels[detail] ? detail : 'far';
    for (const [each, level] of Object.entries(this.levels))
      level.lines.visible = each === this.shown;
  }

  /** Their own ramp, steeper than the regions' borders. */
  fade(distance: number): void {
    const share = Math.min(
      1,
      Math.max(
        0,
        (RIVERS_GONE_DISTANCE - distance) / (RIVERS_GONE_DISTANCE - RIVERS_FULL_DISTANCE),
      ),
    );
    for (const material of this.materials) material.opacity = RIVER_OPACITY * share;
    this.group.visible = share > 0;
  }

  resize(width: number, height: number): void {
    for (const material of this.materials) material.resolution.set(width, height);
  }

  /** The names of the rivers drawn now. */
  names(): Level['names'] {
    return this.levels[this.shown]?.names ?? [];
  }
}
