import { Group, QuadraticBezierCurve3, Vector3, type InterleavedBufferAttribute } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { LonLat } from '@/domain/geo';
import type { ComputedRoute, Medium } from '@/domain/routing';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';

/**
 * The taut thread. **Two heights, not three**: land and sea share the surface, just above
 * the crust. Laying the sea thread at water level created a step at every coast — the
 * multimodal route dove and climbed twice to say nothing more. The sea is said by the hull
 * pawn and by it alone: the wake trim that doubled the thread read as a second stroke, not
 * as stirred water. Only air takes off.
 */
const SURFACE_ALTITUDE = COUNTRY_THICKNESS + 0.006;

/** The air arc's rise: a share of the chord, clamped at both ends. */
export const AIR_RISE_SHARE = 0.18;
export const AIR_RISE_MIN = 4;
export const AIR_RISE_MAX = 24;

/**
 * Without the floor, a hundred-kilometer hop draws flat and can no longer be told from a
 * land thread; without the ceiling, a London–Tokyo leaves the frame and its shadow goes off
 * to get lost.
 */
export const airRise = (chord: number): number =>
  Math.min(AIR_RISE_MAX, Math.max(AIR_RISE_MIN, chord * AIR_RISE_SHARE));

const AIR_SEGMENTS = 48;

/**
 * The remainder's dashes, in pixels. The stroke has the same thickness as the covered part —
 * it is the gap between dashes that says intent, not thinness. The dash must therefore stay
 * longer than the stroke is thick, otherwise it closes into a dot and the thread becomes
 * stippling. `dashScale = 1 / unitsPerPixel` makes both numbers directly readable in pixels.
 */
const DASH_PX = 3;
const GAP_PX = 5;

/**
 * The remainder's dash drift, in **board units per second** — never in pixels. The dash
 * pitch, in turn, stays in pixels: `dashScale` converts one into the other. The thread thus
 * flows at the same speed in the world whatever the viewpoint, which makes it flow slower on
 * screen when you pull back. That is the depth cue: a distant thread crawls, a near one races.
 */
export const DRIFT_SPEED = 0.6;

/**
 * The drift's ceiling, in pixels per second. Without it, close-up raced at nearly a hundred
 * pixels per second: a few units from the map, a constant world speed becomes a huge screen
 * speed, and the thread flickers instead of flowing. The ceiling only eats the bottom of the
 * range — beyond some sixty units of distance, perspective takes over and the depth cue
 * stays whole.
 */
export const DRIFT_CEILING_PX_S = 6;

/** A tab back in the foreground must not catch up its drift in one jump. */
const MAX_DRIFT_STEP_S = 0.1;

/**
 * Thicknesses in pixels — constant on screen, whatever the zoom: that is the whole point of
 * fat lines over the one-pixel stroke they replace.
 */
const SHADOW_THICKNESS = 1;
const TETHER_THICKNESS = 1;
const MARK_THICKNESS = 1.8;

/**
 * Marks and props in pixels too: the board is traveled from the whole globe to the
 * département, and a fixed world size can only be right at one distance.
 */
const DOCK_RADIUS_PX = 9;
const DOCK_HALF_SQUARE_PX = 4;
const COAST_HALF_DASH_PX = 14;
const HALF_CROSS_PX = 6;
const DEPARTURE_RADIUS_PX = 4;

/**
 * Ground, water, sky — and the order never depends on the viewpoint. A sea thread passes
 * under the flights and over the land thread, whatever the orbit. The strokes therefore
 * forgo the depth buffer: it is the only way to get a *constant* order at crossings, where
 * depth would give the current camera's.
 */
const RENDER_RANK: Readonly<Record<Medium, number>> = { land: 10, sea: 11, air: 12 };

/**
 * Marks pass above all threads, air included: a dock laid at sea level vanished under the
 * arc flying over it. They stay under the pawn (13), which is the movement's head and must
 * keep the last word when it parks at the dock.
 */
const MARK_RANK = 12.5;

export type ThreadLeg = {
  readonly medium: Medium;
  /** The curve followed, cut at antimeridian crossings. */
  readonly strands: ReadonlyArray<ThreadStrand>;
  readonly length: number;
};

/** A continuous piece of thread: the world wraps, a stroke cannot cross the rim. */
type ThreadStrand = {
  readonly vertices: ReadonlyArray<Vector3>;
  readonly lengths: ReadonlyArray<number>;
};

export type Dock = {
  readonly position: Vector3;
  readonly embarking: boolean;
  /** The thread's heading at the crossing, in radians: the coastline draws across it. */
  readonly heading: number;
};

export type ThreadColors = { readonly trace: string; readonly progress: string };

export type Thread = {
  readonly object: Group;
  readonly legs: ReadonlyArray<ThreadLeg>;
  readonly docks: ReadonlyArray<Dock>;
  /** What the pointer targets: covered and remaining, so the whole thread hovers. */
  readonly targets: ReadonlyArray<Line2>;
  /** The vertical thread tying an airborne pawn to its shadow; `null` outside the sky. */
  readonly tether: Line2 | null;
  /** Cuts the thread at the pawn's position — the only thing that moves per frame. */
  cut(legIndex: number, local: number): void;
  /** Advances the remainder's dashes by `seconds` of drift. The covered part never moves. */
  drift(seconds: number): void;
  /** Marks and dashes keep their screen pitch: a single measure, set per frame. */
  setScale(unitsPerPixel: number): void;
  /** A fat line draws in pixels: without the canvas size, it cannot make them. */
  setResolution(width: number, height: number): void;
  setAccent(accentFactor: number): void;
  dispose(): void;
};

/**
 * Builds the thread once and for all. Nothing here replays per frame: the engine's loop
 * only advances an `instanceCount` and moves the pawn.
 */
export function buildThread(
  route: ComputedRoute,
  frame: WorldFrame,
  colors: ThreadColors,
  thickness: number,
  opacities: { readonly trace: number; readonly progress: number },
): Thread {
  const object = new Group();
  const legs = cutIntoLegs(route, frame);
  const materials: LineMaterial[] = [];

  const makeMaterial = (options: {
    color: string;
    thickness: number;
    opacity: number;
    dashed?: boolean;
  }): LineMaterial => {
    const material = new LineMaterial({
      color: options.color,
      linewidth: options.thickness,
      transparent: true,
      opacity: options.opacity,
      depthTest: false,
      dashed: options.dashed === true,
      dashSize: DASH_PX,
      gapSize: GAP_PX,
    });
    materials.push(material);
    return material;
  };

  // Covered and remaining share the same thickness: it is a single thread, cut, not two
  // strokes of different rank. The hierarchy lies in the dashes and the ink — a thinner
  // remainder stopped showing at all, and a thread thinning mid-course reads as a plot error.
  const remainingMaterial = makeMaterial({
    color: colors.trace,
    thickness,
    opacity: opacities.trace,
    dashed: true,
  });
  const coveredMaterial = makeMaterial({
    color: colors.progress,
    thickness,
    opacity: opacities.progress,
  });
  const shadowMaterial = makeMaterial({
    color: colors.trace,
    thickness: SHADOW_THICKNESS,
    opacity: opacities.trace * 0.9,
    dashed: true,
  });
  const markMaterial = makeMaterial({
    color: colors.progress,
    thickness: MARK_THICKNESS,
    opacity: opacities.progress,
  });

  const targets: Line2[] = [];
  const strokes: CutStroke[] = [];
  const props: Group[] = [];

  for (const leg of legs) {
    const rank = RENDER_RANK[leg.medium];
    for (const strand of leg.strands) {
      const stroke = cutStrokeOf(strand, coveredMaterial, remainingMaterial, rank);
      object.add(stroke.covered.line, stroke.remaining.line);
      targets.push(stroke.covered.line, stroke.remaining.line);
      strokes.push(stroke);

      // The hovered itinerary: without it, a high arc reads as a stroke laid halfway
      // between two countries. It is a ground trace, not a cast shadow — the board has none.
      if (leg.medium === 'air') {
        object.add(
          threadOf(
            strand.vertices.map((point) => onGround(point, frame)),
            shadowMaterial,
            RENDER_RANK.land,
          ),
        );
      }
    }
  }

  const docks = docksOf(route, legs);
  for (const dock of docks) {
    props.push(
      placed(dock.position, oriented(dockMark(dock.embarking, markMaterial), dock.heading)),
    );
  }

  const departure = legs[0]?.strands[0]?.vertices[0];
  const arrival = legs.at(-1)?.strands.at(-1)?.vertices.at(-1);
  if (departure) props.push(placed(departure, departureCircle(markMaterial)));
  if (arrival) props.push(placed(arrival, arrivalCross(markMaterial)));

  for (const prop of props) object.add(prop);

  const tether = legs.some((leg) => leg.medium === 'air')
    ? threadOf(
        [new Vector3(), new Vector3()],
        makeMaterial({
          color: colors.trace,
          thickness: TETHER_THICKNESS,
          opacity: Math.min(1, opacities.trace * 1.4),
        }),
        RENDER_RANK.air,
      )
    : null;
  if (tether) object.add(tether);

  const baseOpacities = materials.map((material) => material.opacity);

  return {
    object,
    legs,
    docks,
    targets,
    tether,
    /**
     * Covered and remaining are a single trace, cut at the pawn's parametric position. The
     * distance spreads leg by leg then strand by strand: the world wraps, a thread exiting
     * by the antimeridian re-enters from the other edge and must fill in that order.
     */
    cut(legIndex, local) {
      const share = Math.min(1, Math.max(0, local));
      let rank = 0;
      for (let l = 0; l < legs.length; l++) {
        const leg = legs[l]!;
        let distance = (l < legIndex ? 1 : l > legIndex ? 0 : share) * leg.length;
        for (let s = 0; s < leg.strands.length; s++) {
          const stroke = strokes[rank++];
          if (stroke === undefined) continue;
          cutStroke(stroke, distance);
          distance = Math.max(0, distance - stroke.length);
        }
      }
    },
    drift(seconds) {
      // `dashOffset` counts in the dash pattern's units, hence in pixels: `dashScale`
      // converts the world speed into them. It accumulates instead of being recomputed,
      // otherwise a zoom notch would jump the phase.
      const speed = Math.min(DRIFT_SPEED * remainingMaterial.dashScale, DRIFT_CEILING_PX_S);
      const step = speed * Math.min(seconds, MAX_DRIFT_STEP_S);
      // The remainder is written destination-to-departure: its distance decreases along the
      // route, so it is an *increasing* offset that makes the dashes flow toward arrival.
      remainingMaterial.dashOffset = (remainingMaterial.dashOffset + step) % (DASH_PX + GAP_PX);
    },
    setScale(unitsPerPixel) {
      for (const prop of props) prop.scale.setScalar(unitsPerPixel);
      // `dashScale` divides the world distance: at 1/unitsPerPixel, dash and gap count
      // directly in pixels, and the dash pitch stops moving with zoom.
      const scale = unitsPerPixel > 0 ? 1 / unitsPerPixel : 1;
      for (const material of materials) {
        if (material.dashed) material.dashScale = scale;
      }
    },
    setResolution(width, height) {
      for (const material of materials) material.resolution.set(width, height);
    },
    setAccent(accentFactor) {
      materials.forEach((material, rank) => {
        material.opacity = Math.min(1, baseOpacities[rank]! * accentFactor);
      });
    },
    dispose() {
      object.removeFromParent();
      object.traverse((node) => {
        const line = node as Partial<Line2>;
        if (line.geometry) line.geometry.dispose();
      });
      for (const material of materials) material.dispose();
    },
  };
}

/** The thread's point at `local` on leg `index` — the pawn needs nothing else. */
export function pointOnLeg(leg: ThreadLeg, local: number, out: Vector3): void {
  const target = Math.min(1, Math.max(0, local)) * leg.length;
  let covered = 0;
  for (const strand of leg.strands) {
    for (let i = 0; i < strand.lengths.length; i++) {
      const length = strand.lengths[i]!;
      if (
        covered + length >= target ||
        (strand === leg.strands[leg.strands.length - 1] && i === strand.lengths.length - 1)
      ) {
        const share = length > 0 ? (target - covered) / length : 0;
        out
          .copy(strand.vertices[i]!)
          .lerp(strand.vertices[i + 1]!, Math.min(1, Math.max(0, share)));
        return;
      }
      covered += length;
    }
  }
  const last = leg.strands[leg.strands.length - 1];
  if (last) out.copy(last.vertices[last.vertices.length - 1]!);
}

/** The ground under a thread point: that is where the hovered itinerary passes. */
export const projectOnGround = (point: Vector3, frame: WorldFrame, out: Vector3): void => {
  out.set(point.x, SURFACE_ALTITUDE + frame.drop(point.x, point.z), point.z);
};

const onGround = (point: Vector3, frame: WorldFrame): Vector3 =>
  new Vector3(point.x, SURFACE_ALTITUDE + frame.drop(point.x, point.z), point.z);

/* ----------------------------- thread cutting ---------------------------- */

/**
 * Legs come as projected distances, the polyline as lon/lat: the cut is done on lengths
 * measured in the frame, not on the nodes. `simplify()` may have removed the coast node when
 * it was collinear — trusting indices would lose the dock.
 */
function cutIntoLegs(route: ComputedRoute, frame: WorldFrame): ReadonlyArray<ThreadLeg> {
  if (route.legs.length === 1 && route.legs[0]!.medium === 'air') {
    return [airLeg(route, frame)];
  }

  const points = route.points;
  if (points.length < 2) return [];

  const lengths = points
    .slice(0, -1)
    .map((point, i) => projectedDistance(point, points[i + 1]!, frame));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const legTotal = route.legs.reduce((sum, leg) => sum + leg.distanceUnits, 0) || 1;

  const legs: ThreadLeg[] = [];
  let cursor = 0;
  let remaining = 0;
  let start: LonLat = points[0]!;

  for (let l = 0; l < route.legs.length; l++) {
    const leg = route.legs[l]!;
    const last = l === route.legs.length - 1;
    remaining += (leg.distanceUnits / legTotal) * total;
    const vertices: LonLat[] = [start];

    while (cursor < lengths.length) {
      const length = lengths[cursor]!;
      if (!last && length > 0 && remaining < length) {
        const cutPoint = interpolate(start, points[cursor + 1]!, remaining / length);
        vertices.push(cutPoint);
        start = cutPoint;
        lengths[cursor] = length - remaining;
        remaining = 0;
        break;
      }
      remaining -= length;
      cursor++;
      start = points[cursor]!;
      vertices.push(start);
    }

    legs.push(assembleLeg(leg.medium, vertices, frame));
  }
  return legs;
}

function airLeg(route: ComputedRoute, frame: WorldFrame): ThreadLeg {
  const departure = frame.projectLonLat(route.points[0]!, SURFACE_ALTITUDE);
  const arrival = frame.projectLonLat(route.points[route.points.length - 1]!, SURFACE_ALTITUDE);
  const rise = airRise(departure.distanceTo(arrival));
  const middle = departure.clone().lerp(arrival, 0.5);
  // A quadratic Bézier peaks at half its control point: for the apex to be the requested
  // rise, the control climbs double.
  middle.y += rise * 2;
  const vertices = new QuadraticBezierCurve3(departure, middle, arrival).getPoints(AIR_SEGMENTS);
  return { medium: 'air', strands: [strandOf(vertices)], length: lengthOf(vertices) };
}

function assembleLeg(
  medium: Medium,
  vertices: ReadonlyArray<LonLat>,
  frame: WorldFrame,
): ThreadLeg {
  const strands: ThreadStrand[] = [];
  let current: Vector3[] = [];

  for (let i = 0; i < vertices.length; i++) {
    const point = vertices[i]!;
    if (i > 0 && Math.abs(point[0] - vertices[i - 1]![0]) > 180) {
      const { exit, entry } = crossedEdges(vertices[i - 1]!, point, frame);
      current.push(exit);
      if (current.length > 1) strands.push(strandOf(current));
      current = [entry];
    }
    current.push(frame.projectLonLat(point, SURFACE_ALTITUDE));
  }
  if (current.length > 1) strands.push(strandOf(current));

  return {
    medium,
    strands,
    length: strands.reduce((sum, strand) => sum + lengthOf(strand.vertices), 0),
  };
}

function crossedEdges(
  from: LonLat,
  to: LonLat,
  frame: WorldFrame,
): { exit: Vector3; entry: Vector3 } {
  const eastward = to[0] - from[0] < -180;
  const gap = eastward ? to[0] - from[0] + 360 : to[0] - from[0] - 360;
  const rimLongitude = eastward ? 180 : -180;
  const fraction = gap === 0 ? 0 : (rimLongitude - from[0]) / gap;
  const edge = frame.edgeAtLatitude(from[1] + fraction * (to[1] - from[1]));
  return {
    exit: frame.toWorld(eastward ? edge.eastX : edge.westX, edge.y, SURFACE_ALTITUDE),
    entry: frame.toWorld(eastward ? edge.westX : edge.eastX, edge.y, SURFACE_ALTITUDE),
  };
}

const strandOf = (vertices: ReadonlyArray<Vector3>): ThreadStrand => ({
  vertices,
  lengths: vertices.slice(0, -1).map((vertex, i) => vertex.distanceTo(vertices[i + 1]!)),
});

const lengthOf = (vertices: ReadonlyArray<Vector3>): number =>
  vertices.slice(0, -1).reduce((sum, vertex, i) => sum + vertex.distanceTo(vertices[i + 1]!), 0);

const interpolate = (a: LonLat, b: LonLat, share: number): LonLat => [
  a[0] + (b[0] - a[0]) * share,
  a[1] + (b[1] - a[1]) * share,
];

function projectedDistance(a: LonLat, b: LonLat, frame: WorldFrame): number {
  const from = frame.projectLonLat(a, 0);
  const to = frame.projectLonLat(b, 0);
  return Math.hypot(to.x - from.x, to.z - from.z);
}

/* --------------------------------- strokes -------------------------------- */

/**
 * A thread section: **a single trace**, drawn by two lines sharing the cut vertex. The
 * covered part stops on it, the remainder starts from it — no notch, no overlap at the
 * seam, at every zoom, because the point is the same and computed, not rounded to the
 * nearest vertex.
 */
type CutStroke = {
  readonly covered: Side;
  readonly remaining: Side;
  readonly lengths: ReadonlyArray<number>;
  readonly length: number;
  /** The last distance served; recutting at the same place would rewrite nothing new. */
  servedDistance: number;
};

/**
 * One of the cut's two sides. A fat line only truncates from the start — `instanceCount`
 * counts from the first segment — so the remainder carries its vertices **reversed**,
 * destination to departure: its counter then bites from the pawn, not from arrival.
 */
type Side = {
  readonly line: Line2;
  /** The vertices in the order the line carries them. */
  readonly vertices: ReadonlyArray<Vector3>;
  /** The segment shortened last frame; `-1` when the line is whole. */
  cutIndex: number;
};

function cutStrokeOf(
  strand: ThreadStrand,
  coveredMaterial: LineMaterial,
  remainingMaterial: LineMaterial,
  rank: number,
): CutStroke {
  const reversed = [...strand.vertices].reverse();
  const covered: Side = {
    line: threadOf(strand.vertices, coveredMaterial, rank),
    vertices: strand.vertices,
    cutIndex: -1,
  };
  const remaining: Side = {
    line: threadOf(reversed, remainingMaterial, rank),
    vertices: reversed,
    cutIndex: -1,
  };
  // `instanceCount` is infinite until touched: a fresh thread is all still to cover, and
  // saying it here avoids depending on that default value.
  covered.line.geometry.instanceCount = 0;
  remaining.line.geometry.instanceCount = strand.lengths.length;
  return {
    covered,
    remaining,
    lengths: strand.lengths,
    length: strand.lengths.reduce((sum, length) => sum + length, 0),
    servedDistance: -1,
  };
}

const CUT_POINT = new Vector3();

function cutStroke(stroke: CutStroke, distance: number): void {
  const clamped = Math.min(stroke.length, Math.max(0, distance));
  if (clamped === stroke.servedDistance) return;
  stroke.servedDistance = clamped;

  const segments = stroke.lengths.length;
  if (clamped <= 0) {
    trim(stroke.covered, 0, null);
    trim(stroke.remaining, segments, null);
    return;
  }
  if (clamped >= stroke.length) {
    trim(stroke.covered, segments, null);
    trim(stroke.remaining, 0, null);
    return;
  }

  let index = 0;
  let rest = clamped;
  while (index < segments - 1 && rest >= stroke.lengths[index]!) rest -= stroke.lengths[index++]!;
  const length = stroke.lengths[index]!;
  CUT_POINT.copy(stroke.covered.vertices[index]!).lerp(
    stroke.covered.vertices[index + 1]!,
    length > 0 ? rest / length : 0,
  );

  trim(stroke.covered, index + 1, CUT_POINT);
  trim(stroke.remaining, segments - index, CUT_POINT);
}

/**
 * Shows `visible` segments, the last stopping on the cut point. The segment shortened last
 * frame first regains its full length: otherwise the trace would keep the mark of every
 * place the pawn passed.
 */
function trim(side: Side, visible: number, cutPoint: Vector3 | null): void {
  if (side.cutIndex >= 0) {
    writeSegment(
      side.line,
      side.cutIndex,
      side.vertices[side.cutIndex]!,
      side.vertices[side.cutIndex + 1]!,
    );
    side.cutIndex = -1;
  }
  side.line.geometry.instanceCount = visible;
  if (cutPoint === null || visible <= 0) return;
  const last = visible - 1;
  writeSegment(side.line, last, side.vertices[last]!, cutPoint);
  side.cutIndex = last;
}

/**
 * Rewrites a segment in the interleaved buffers the line already owns. The end distance
 * follows the new length: without it, the shortened segment's dashes would compress as the
 * pawn crosses it, and the pitch would jump at the next vertex.
 */
function writeSegment(line: Line2, index: number, from: Vector3, to: Vector3): void {
  const positions = (line.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute)
    .data;
  positions.array.set([from.x, from.y, from.z, to.x, to.y, to.z], index * 6);
  positions.needsUpdate = true;

  const distances = (
    line.geometry.getAttribute('instanceDistanceStart') as InterleavedBufferAttribute
  ).data;
  distances.array[index * 2 + 1] = distances.array[index * 2]! + from.distanceTo(to);
  distances.needsUpdate = true;
}

function threadOf(vertices: ReadonlyArray<Vector3>, material: LineMaterial, rank: number): Line2 {
  const geometry = new LineGeometry();
  geometry.setPositions(vertices.flatMap((vertex) => [vertex.x, vertex.y, vertex.z]));
  const line = new Line2(geometry, material);
  // Dashes measure along the distance traveled on the stroke, not on the vertices.
  line.computeLineDistances();
  line.renderOrder = rank;
  return line;
}

/**
 * Rewrites a thread's vertices into the interleaved buffer it already owns. `setPositions`
 * would allocate a fresh one on every call — acceptable at load, not in a loop.
 */
function rewriteThread(line: Line2, vertices: ReadonlyArray<Vector3>): void {
  const start = line.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute;
  const buffer = start.data;
  for (let i = 0; i + 1 < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[i + 1]!;
    buffer.array.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
  }
  buffer.needsUpdate = true;
}

/** Two vertices rewritten per frame — the only thing the loop is allowed to touch. */
export const stretchTether = (tether: Line2, top: Vector3, bottom: Vector3): void =>
  rewriteThread(tether, [top, bottom]);

/* --------------------------------- props ---------------------------------- */

function docksOf(route: ComputedRoute, legs: ReadonlyArray<ThreadLeg>): ReadonlyArray<Dock> {
  const docks: Dock[] = [];
  for (let i = 1; i < legs.length; i++) {
    const vertices = legs[i]!.strands[0]?.vertices;
    const first = vertices?.[0];
    if (vertices === undefined || first === undefined) continue;
    const next = vertices[1] ?? first;
    docks.push({
      position: first.clone(),
      embarking: route.legs[i]!.medium === 'sea',
      heading: Math.atan2(next.x - first.x, next.z - first.z),
    });
  }
  return docks;
}

/** Props are drawn around the origin then placed: that is what makes them scalable. */
function placed(position: Vector3, prop: Group): Group {
  prop.position.copy(position);
  return prop;
}

/** The mark turns flat to align with the thread: yaw only, never pitch. */
function oriented(prop: Group, heading: number): Group {
  prop.rotation.y = heading;
  return prop;
}

function outline(
  vertices: ReadonlyArray<number>,
  material: LineMaterial,
  rank: number,
): LineSegments2 {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(Array.from(vertices));
  const segments = new LineSegments2(geometry, material);
  segments.renderOrder = rank;
  return segments;
}

/** A flat polygon in the map plane, closed, in local coordinates. */
function polygon(corners: ReadonlyArray<readonly [number, number]>): number[] {
  const vertices: number[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    vertices.push(a[0], 0, a[1], b[0], 0, b[1]);
  }
  return vertices;
}

function circle(radius: number, sides = 20): number[] {
  const vertices: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const b = ((i + 1) / sides) * Math.PI * 2;
    vertices.push(
      Math.cos(a) * radius,
      0,
      Math.sin(a) * radius,
      Math.cos(b) * radius,
      0,
      Math.sin(b) * radius,
    );
  }
  return vertices;
}

const grouped = (segments: LineSegments2): Group => {
  const group = new Group();
  group.add(segments);
  return group;
};

const departureCircle = (material: LineMaterial): Group =>
  grouped(outline(circle(DEPARTURE_RADIUS_PX, 14), material, MARK_RANK));

/**
 * The thread's terminus: an ink ×, tilted as on the plates. An arrowhead would say "it
 * continues that way"; the thread stops, and its arrival point is a survey cross, not a
 * direction sign — the heading already reads on the thread itself.
 */
const arrivalCross = (material: LineMaterial): Group =>
  grouped(
    outline(
      [
        -HALF_CROSS_PX,
        0,
        -HALF_CROSS_PX,
        HALF_CROSS_PX,
        0,
        HALF_CROSS_PX,
        HALF_CROSS_PX,
        0,
        -HALF_CROSS_PX,
        -HALF_CROSS_PX,
        0,
        HALF_CROSS_PX,
      ],
      material,
      MARK_RANK,
    ),
  );

/**
 * A dock, drawn as on the plate: the circle, the square solid when embarking and hollow
 * when landing, the coastline dash. Flat in the map plane — the orbit never dives low
 * enough for a lying symbol to close up.
 *
 * It is the only point where the thread changes nature: the mark is turned to the thread's
 * heading, so the coast dash is the coast being crossed and not a stroke laid to the north.
 */
function dockMark(embarking: boolean, material: LineMaterial): Group {
  const group = new Group();

  const ring = circle(DOCK_RADIUS_PX);
  ring.push(
    -COAST_HALF_DASH_PX,
    0,
    -DOCK_RADIUS_PX * 1.6,
    COAST_HALF_DASH_PX,
    0,
    -DOCK_RADIUS_PX * 1.6,
  );

  const c = DOCK_HALF_SQUARE_PX;
  const square = polygon([
    [-c, -c],
    [c, -c],
    [c, c],
    [-c, c],
  ]);
  // The solid square has no fill: at this size, two diagonals blacken it.
  if (embarking) square.push(-c, 0, -c, c, 0, c, c, 0, -c, -c, 0, c);

  group.add(outline(ring, material, MARK_RANK));
  group.add(outline(square, material, MARK_RANK));
  return group;
}
