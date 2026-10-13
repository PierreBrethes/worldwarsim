import { Group, Mesh, Vector3, type InterleavedBufferAttribute } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { LonLat } from '@/domain/geo';
import type { ComputedRoute, Medium } from '@/domain/routing';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { PALETTE } from './palette';
import { dashPitch, Ribbon, RibbonMaterial, ribbonWidth } from './route-ribbon';

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

/** The share of an air leg spent climbing, and as much descending. */
const CLIMB_SHARE = 0.35;

/**
 * **An air leg's altitude against its rise, by the share flown**: it takes off, holds its cruise,
 * comes down to land (point 15 of `table-etat-major`: the plane's shadow says its altitude). A
 * parabola never cruised — the gap between a plane and its shadow changed all the way.
 */
export function flightAltitude(share: number): number {
  const k = Math.min(1, Math.max(0, Math.min(share, 1 - share) / CLIMB_SHARE));
  return k * k * (3 - 2 * k);
}

/**
 * **The ribbon's true width on the sheet, per pixel of its floor** (`route-ribbon.ts`): a thread
 * of thickness 2.5 is a band of 0.0625 units — some seven kilometres — which the eye reads as
 * the plate's ribbon from thirty units down, and as its floor of 2.5 px beyond.
 */
const WIDTH_PER_FLOOR_PX = 0.025;
export const threadWidth = (thickness: number): number => thickness * WIDTH_PER_FLOOR_PX;

/**
 * The floor is not the width's weight: halving the thread's weight on the near sheet (#55)
 * also halved its hairline from afar, where a 1.25 px band vanishes under the pieces. The floor
 * keeps the hierarchy between movements (mine over the others) at a share above the thickness.
 */
export const THREAD_FLOOR_BOOST = 1.6;
export const threadFloorPx = (thickness: number): number => thickness * THREAD_FLOOR_BOOST;

/**
 * The remainder's dash drift, in **board units per second** — never in pixels, whatever the
 * dash pitch the drawn width sets (`dashPitch`). The thread thus
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

/** The air leg's ground trace: a floor of a pixel, and a share of the ribbon's true width. */
const SHADOW_THICKNESS = 1.6;
const SHADOW_SHARE = 0.4;

/**
 * The thread's backing, in pixels of bleed on either side. A dashed remainder laid over a
 * loaded sheet — a region's tint, a forest's props, another thread — loses its gaps in the
 * noise, and the route one is about to order is precisely the one that must read. The casing
 * rims the ribbon continuously along dash *and* gap: the band gets an edge of its own, its gaps
 * still show the sheet, and the desk's ink is used rather than a fifth thread colour.
 */
const CASING_BLEED = 2.2;
const CASING_SHARE = 0.8;

/**
 * Every casing under every thread, in one band of its own. Ranking it just below its own
 * medium would let a sea backing pass over a land stroke at a crossing — a backing is never
 * allowed to cover a thread, whichever it is.
 */
const CASING_RANK = 9;
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
  /** What the pointer targets: one ribbon per strand, covered and remaining alike. */
  readonly targets: ReadonlyArray<Ribbon>;
  /** The vertical thread tying an airborne pawn to its shadow; `null` outside the sky. */
  readonly tether: Line2 | null;
  /** Cuts the thread at the pawn's position — the only thing that moves per frame. */
  cut(legIndex: number, local: number): void;
  /** Advances the remainder's dashes by `seconds` of drift. The covered part never moves. */
  drift(seconds: number): void;
  /** Marks and the ribbon's floor keep their screen size: a single measure, set per frame. */
  setScale(unitsPerPixel: number): void;
  /** The ribbon's floor and the marks draw in pixels: without the canvas size, no pixels. */
  setResolution(width: number, height: number): void;
  setAccent(accentFactor: number): void;
  dispose(): void;
};

/**
 * Builds the thread once and for all. Nothing here replays per frame: the engine's loop
 * only moves a cut uniform and the pawn.
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
  const lineMaterials: LineMaterial[] = [];
  const width = threadWidth(thickness);

  const makeLineMaterial = (color: string, linewidth: number, opacity: number): LineMaterial => {
    const material = new LineMaterial({
      color,
      linewidth,
      transparent: true,
      opacity,
      depthTest: false,
    });
    lineMaterials.push(material);
    return material;
  };

  // Covered and remaining are one ribbon of one width, cut by a uniform: a thread thinning
  // mid-course reads as a plot error. The hierarchy lies in the dashes and the ink.
  const stroke = new RibbonMaterial({
    width,
    floorPx: threadFloorPx(thickness),
    covered: { color: colors.progress, opacity: opacities.progress },
    remaining: { color: colors.trace, opacity: opacities.trace },
    dashed: true,
  });
  const casingInk = { color: PALETTE.desk, opacity: opacities.trace * CASING_SHARE };
  const casing = new RibbonMaterial({
    width,
    floorPx: threadFloorPx(thickness),
    bleedPx: CASING_BLEED,
    covered: casingInk,
    remaining: casingInk,
  });
  const shadowInk = { color: colors.trace, opacity: opacities.trace * 0.9 };
  const shadow = new RibbonMaterial({
    width: width * SHADOW_SHARE,
    floorPx: SHADOW_THICKNESS,
    covered: shadowInk,
    remaining: shadowInk,
    dashed: true,
  });
  const ribbonMaterials = [stroke, casing, shadow];
  const markMaterial = makeLineMaterial(colors.progress, MARK_THICKNESS, opacities.progress);

  const targets: Ribbon[] = [];
  const props: Group[] = [];
  const legStarts: number[] = [];
  let along = 0;

  for (const leg of legs) {
    legStarts.push(along);
    for (const strand of leg.strands) {
      const ribbon = new Ribbon(strand.vertices, stroke, along);
      ribbon.renderOrder = RENDER_RANK[leg.medium];
      const backing = new Mesh(ribbon.geometry, casing);
      backing.renderOrder = CASING_RANK;
      object.add(backing, ribbon);
      targets.push(ribbon);

      // The hovered itinerary: without it, a high arc reads as a stroke laid halfway
      // between two countries. It is a ground trace, not a cast shadow — a thread casts none.
      if (leg.medium === 'air') {
        const trace = new Ribbon(strand.vertices.map(onGround), shadow, along);
        trace.renderOrder = RENDER_RANK.land;
        object.add(trace);
      }
      along += strand.lengths.reduce((sum, length) => sum + length, 0);
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
        makeLineMaterial(colors.trace, TETHER_THICKNESS, Math.min(1, opacities.trace * 1.4)),
        RENDER_RANK.air,
      )
    : null;
  if (tether) object.add(tether);

  const baseLineOpacities = lineMaterials.map((material) => material.opacity);
  const baseRibbonOpacities = ribbonMaterials.map((material) => [
    material.coveredOpacity,
    material.remainingOpacity,
  ]);
  let unitsPerPixel = 1;

  return {
    object,
    legs,
    docks,
    targets,
    tether,
    /**
     * Covered and remaining are a single ribbon, cut at the pawn's distance along the whole
     * thread. The distance runs leg by leg then strand by strand: the world wraps, a thread
     * exiting by the antimeridian re-enters from the other edge and fills in that order.
     */
    cut(legIndex, local) {
      const leg = legs[legIndex];
      if (leg === undefined) return;
      stroke.cut = legStarts[legIndex]! + Math.min(1, Math.max(0, local)) * leg.length;
    },
    drift(seconds) {
      // The drift is a world speed, capped on screen, turned into a share of the dash pitch.
      // It accumulates instead of being recomputed, otherwise a zoom notch would jump it.
      const speed = Math.min(DRIFT_SPEED, DRIFT_CEILING_PX_S * unitsPerPixel);
      const step = (speed * Math.min(seconds, MAX_DRIFT_STEP_S)) / stroke.pitch;
      stroke.phase = (stroke.phase + step) % 1;
    },
    setScale(scale) {
      unitsPerPixel = scale;
      for (const prop of props) prop.scale.setScalar(scale);
      const pitch = dashPitch(ribbonWidth(width, threadFloorPx(thickness), scale));
      stroke.pitch = pitch;
      shadow.pitch = pitch;
    },
    setResolution(viewWidth, viewHeight) {
      for (const material of lineMaterials) material.resolution.set(viewWidth, viewHeight);
      for (const material of ribbonMaterials) material.viewHeight = viewHeight;
    },
    setAccent(accentFactor) {
      lineMaterials.forEach((material, rank) => {
        material.opacity = Math.min(1, baseLineOpacities[rank]! * accentFactor);
      });
      ribbonMaterials.forEach((material, rank) => {
        const [covered, remaining] = baseRibbonOpacities[rank]!;
        material.coveredOpacity = Math.min(1, covered! * accentFactor);
        material.remainingOpacity = Math.min(1, remaining! * accentFactor);
      });
    },
    dispose() {
      object.removeFromParent();
      object.traverse((node) => {
        const drawn = node as Partial<Mesh>;
        if (drawn.geometry) drawn.geometry.dispose();
      });
      for (const material of [...lineMaterials, ...ribbonMaterials]) material.dispose();
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
export const projectOnGround = (point: Vector3, out: Vector3): void => {
  out.set(point.x, SURFACE_ALTITUDE, point.z);
};

const onGround = (point: Vector3): Vector3 => new Vector3(point.x, SURFACE_ALTITUDE, point.z);

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
  const vertices = Array.from({ length: AIR_SEGMENTS + 1 }, (_, k) => {
    const share = k / AIR_SEGMENTS;
    const point = departure.clone().lerp(arrival, share);
    point.y += rise * flightAltitude(share);
    return point;
  });
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
