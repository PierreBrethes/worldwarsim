import { describe, expect, it } from 'vitest';
import { Vector3, type InterleavedBufferAttribute } from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { pawnTarget, temporalPosition, unrollRoute } from '@/domain/route-timing';
import type { World } from '@/domain/world';
import { buildGrid, computeRoute, directRoute } from '@/domain/routing';
import {
  buildThread,
  airRise,
  pointOnLeg,
  AIR_RISE_MAX,
  AIR_RISE_MIN,
  AIR_RISE_SHARE,
  DRIFT_CEILING_PX_S,
  DRIFT_SPEED,
} from './thread';
import { COUNTRY_THICKNESS, WorldFrame } from './frame';

/** The toy world of `routing.test.ts`: two islands separated by ten units of sea. */
function toyWorld(): World {
  const outline: Array<readonly [number, number, number, number]> = [];
  for (let latitude = -90; latitude <= 90; latitude++) {
    outline.push([latitude, 0, 100, ((90 - latitude) / 180) * 50]);
  }
  const rectangle = (x1: number, y1: number, x2: number, y2: number) =>
    [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ] as const;
  return {
    sphere: { minX: 0, maxX: 100, minY: 0, maxY: 50 },
    outline,
    countries: [
      {
        name: 'Westland',
        adm0: 'WST',
        representativePoint: [20, 25],
        lonLat: [-108, 0],
        rings: [rectangle(10, 20, 30, 30)],
      },
      {
        name: 'Eastland',
        adm0: 'EST',
        representativePoint: [60, 25],
        lonLat: [36, 0],
        rings: [rectangle(40, 20, 80, 30)],
      },
    ],
  };
}

const toLonLat = (x: number, y: number): [number, number] => [
  (x / 50 - 1) * 180,
  90 - (y / 50) * 180,
];

const world = toyWorld();
const frame = new WorldFrame(world);
const grid = buildGrid(world, 1);
const colors = { trace: '#000000', progress: '#ffffff' };
const thickness = 2.5;
const opacities = { trace: 0.55, progress: 1 };

/** La plage d'Eastland, et non son intérieur : depuis la décision 72a une route combinée finit
 *  à la côte, et la jambe de terre qui suivait la mer n'existe plus. */
const crossing = computeRoute(grid, toLonLat(20, 25), toLonLat(40, 25), 'combined')!;

describe('buildThread on a combined route', () => {
  const thread = buildThread(crossing, frame, colors, thickness, opacities);

  it('cuts the thread like the legs, land then sea', () => {
    expect(thread.legs.map((leg) => leg.medium)).toEqual(['land', 'sea']);
  });

  it('lays land and sea at the same altitude: no step at the coast', () => {
    const heights = thread.legs.flatMap((leg) =>
      leg.strands.flatMap((strand) => strand.vertices.map((vertex) => vertex.y)),
    );
    for (const height of heights) expect(height).toBeGreaterThan(COUNTRY_THICKNESS);
    expect(Math.max(...heights) - Math.min(...heights)).toBeCloseTo(0, 10);
  });

  /** Un seul quai, celui de l'embarquement : la mise à terre est le bout du fil, là où le
   *  jalon d'arrivée se tient déjà, et elle n'ouvre plus de jambe à marquer. */
  it('plants a dock at the embarkation and at it alone', () => {
    expect(thread.docks.map((dock) => dock.embarking)).toEqual([true]);
  });

  it('the thread is continuous: each leg picks up where the previous one stops', () => {
    for (let i = 1; i < thread.legs.length; i++) {
      const before = thread.legs[i - 1]!.strands.at(-1)!.vertices.at(-1)!;
      const after = thread.legs[i]!.strands[0]!.vertices[0]!;
      expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(1e-6);
    }
  });
});

describe('the pawn follows time, not distance', () => {
  const thread = buildThread(crossing, frame, colors, thickness, opacities);
  const unrolled = unrollRoute(crossing);

  /** The route traveled the way the engine's loop does: an instant in, a point out. */
  const pawnAt = (t: number): Vector3 => {
    const { legIndex, local } = pawnTarget(temporalPosition(unrolled, t));
    const point = new Vector3();
    pointOnLeg(thread.legs[legIndex]!, local, point);
    return point;
  };

  it('holds still at the dock: the pawn stops moving for the whole transfer', () => {
    const dock = unrolled.find((segment) => segment.kind === 'dock')!;
    const dockStart = unrolled
      .slice(0, unrolled.indexOf(dock))
      .reduce((sum, s) => sum + s.share, 0);
    const stopped = [0.02, 0.5, 0.98].map((share) => pawnAt(dockStart + dock.share * share));
    expect(stopped[0]!.distanceTo(stopped[1]!)).toBeCloseTo(0, 10);
    expect(stopped[1]!.distanceTo(stopped[2]!)).toBeCloseTo(0, 10);
    // And it moves again as soon as the dock ends, otherwise the stop would be a jam.
    expect(pawnAt(dockStart + dock.share * 1.2).distanceTo(stopped[2]!)).toBeGreaterThan(0);
  });

  it('advances end to end over the route duration', () => {
    const departure = thread.legs[0]!.strands[0]!.vertices[0]!;
    const arrival = thread.legs.at(-1)!.strands.at(-1)!.vertices.at(-1)!;
    expect(pawnAt(0).distanceTo(departure)).toBeCloseTo(0, 6);
    expect(pawnAt(1).distanceTo(arrival)).toBeCloseTo(0, 6);
  });

  it('the sea crossing takes less time than its distance share', () => {
    const timeShare = unrolled.find((s) => s.kind === 'leg' && s.medium === 'sea')!.share;
    const distanceShare = crossing.legs[1]!.distanceUnits / crossing.distanceUnits;
    expect(timeShare).toBeLessThan(distanceShare);
  });
});

/** A segment's vertices as the GPU will read them, not as they were written. */
function segment(line: Line2, index: number): { from: Vector3; to: Vector3 } {
  const buffer = (line.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute).data
    .array;
  return {
    from: new Vector3(buffer[index * 6]!, buffer[index * 6 + 1]!, buffer[index * 6 + 2]!),
    to: new Vector3(buffer[index * 6 + 3]!, buffer[index * 6 + 4]!, buffer[index * 6 + 5]!),
  };
}

const visibleSegments = (line: Line2): number => line.geometry.instanceCount;

const visibleLength = (line: Line2): number => {
  let sum = 0;
  for (let i = 0; i < visibleSegments(line); i++) {
    const { from, to } = segment(line, i);
    sum += from.distanceTo(to);
  }
  return sum;
};

describe('the thread cut', () => {
  const thread = buildThread(crossing, frame, colors, thickness, opacities);
  const unrolled = unrollRoute(crossing);
  // Targets come out in pairs, covered then remaining, in strand order.
  const pairs = thread.targets.reduce<Array<[Line2, Line2]>>((acc, line, i) => {
    if (i % 2 === 0) acc.push([line, thread.targets[i + 1]!]);
    return acc;
  }, []);
  const totalLength = thread.legs.reduce((sum, leg) => sum + leg.length, 0);

  const cutAt = (t: number): Vector3 => {
    const { legIndex, local } = pawnTarget(temporalPosition(unrolled, t));
    thread.cut(legIndex, local);
    const point = new Vector3();
    pointOnLeg(thread.legs[legIndex]!, local, point);
    return point;
  };

  it('covered and remaining meet on the pawn vertex, nowhere else', () => {
    // Off the dock, where the pawn parks on the seam between two legs and no strand is cut.
    for (const t of [0.1, 0.25, 0.4, 0.75, 0.9, 0.99]) {
      const pawn = cutAt(t);
      const started = pairs.filter(
        ([covered, remaining]) => visibleSegments(covered) > 0 && visibleSegments(remaining) > 0,
      );
      // A single strand carries the cut: the others are all covered or all to cover.
      expect(started).toHaveLength(1);
      const [covered, remaining] = started[0]!;
      const coveredEnd = segment(covered, visibleSegments(covered) - 1).to;
      const remainingEnd = segment(remaining, visibleSegments(remaining) - 1).to;
      // The same vertex, to the bit: what gap remains to the pawn is the buffer's precision,
      // the same for both — so nothing that could show at the seam.
      expect(coveredEnd.equals(remainingEnd)).toBe(true);
      expect(coveredEnd.distanceTo(pawn)).toBeCloseTo(0, 5);
    }
  });

  it('the two pieces cover the whole thread: no hole, no overlap', () => {
    for (const t of [0, 0.15, 0.5, 0.77, 1]) {
      cutAt(t);
      const visible = pairs.reduce(
        (sum, [covered, remaining]) => sum + visibleLength(covered) + visibleLength(remaining),
        0,
      );
      expect(visible).toBeCloseTo(totalLength, 6);
    }
  });

  it('going back restores the thread’s full length: the cut leaves no trace', () => {
    cutAt(0.9);
    cutAt(0.05);
    const [covered, remaining] = pairs[0]!;
    // The first strand is barely started: its remainder must have all its segments back.
    expect(visibleSegments(remaining)).toBe(remaining.geometry.attributes.instanceStart!.count);
    expect(visibleLength(covered) + visibleLength(remaining)).toBeCloseTo(
      thread.legs[0]!.length,
      6,
    );
  });
});

describe('the dash drift', () => {
  const threadOf = () => buildThread(crossing, frame, colors, thickness, opacities);
  const materialsOf = (thread: ReturnType<typeof threadOf>) => ({
    covered: thread.targets[0]!.material as LineMaterial,
    remaining: thread.targets[1]!.material as LineMaterial,
  });

  it('only animates the remainder: the covered part is not even dashed', () => {
    const { covered, remaining } = materialsOf(threadOf());
    expect(covered.dashed).toBe(false);
    expect(remaining.dashed).toBe(true);
    // A single cut thread, hence a single stroke: the remainder is no discount thread.
    expect(remaining.linewidth).toBe(covered.linewidth);
  });

  it('advances at constant world speed, not screen speed', () => {
    const thread = threadOf();
    const { remaining } = materialsOf(thread);
    thread.setScale(0.5);
    thread.drift(0.05);
    // `dashOffset` counts in the dash pitch: a world unit is worth `dashScale` there.
    expect(remaining.dashOffset).toBeCloseTo(DRIFT_SPEED * 0.05 * remaining.dashScale, 10);
  });

  it('flows faster up close than from afar: that is the depth cue', () => {
    const [near, far] = [threadOf(), threadOf()];
    near.setScale(0.5);
    far.setScale(5);
    near.drift(0.05);
    far.drift(0.05);
    const nearStep = materialsOf(near).remaining.dashOffset;
    const farStep = materialsOf(far).remaining.dashOffset;
    expect(nearStep).toBeCloseTo(farStep * 10, 10);
  });

  it('caps up close: the thread flows, it does not flicker', () => {
    const thread = threadOf();
    const { remaining } = materialsOf(thread);
    // Two thousandths of a unit per pixel: the zoom stop, where world speed runs away.
    thread.setScale(0.002);
    thread.drift(0.1);
    expect(remaining.dashOffset).toBeCloseTo(DRIFT_CEILING_PX_S * 0.1, 10);
  });

  it('a tab back in the foreground does not catch up its drift in one jump', () => {
    const [normal, asleep] = [threadOf(), threadOf()];
    normal.setScale(1);
    asleep.setScale(1);
    normal.drift(0.1);
    asleep.drift(30);
    expect(materialsOf(asleep).remaining.dashOffset).toBeCloseTo(
      materialsOf(normal).remaining.dashOffset,
      10,
    );
  });
});

describe('the relay diamonds', () => {
  it('are no longer drawn: interception does not exist', () => {
    const thread = buildThread(crossing, frame, colors, thickness, opacities);
    const marks = thread.object.children.filter((child) => child.type === 'Group');
    // Departure, arrival, two docks — and not one more grid node.
    expect(marks).toHaveLength(2 + thread.docks.length);
  });
});

describe('the air arc', () => {
  it('the rise follows the chord between its two bounds, and stops there', () => {
    expect(airRise(1)).toBe(AIR_RISE_MIN);
    expect(airRise(100)).toBeCloseTo(100 * AIR_RISE_SHARE, 10);
    expect(airRise(4000)).toBe(AIR_RISE_MAX);
  });

  it('the arc’s apex is the requested rise, not the control point', () => {
    const thread = buildThread(
      directRoute(toLonLat(5, 25), toLonLat(95, 25), 'air', 1),
      frame,
      colors,
      thickness,
      opacities,
    );
    const vertices = thread.legs[0]!.strands[0]!.vertices;
    const chord = vertices[0]!.distanceTo(vertices.at(-1)!);
    const apex = Math.max(...vertices.map((vertex) => vertex.y)) - vertices[0]!.y;
    expect(apex).toBeCloseTo(airRise(chord), 6);
  });
});
