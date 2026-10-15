import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { pawnTarget, temporalPosition, unrollRoute } from '@/domain/route-timing';
import type { World } from '@/domain/world';
import { buildGrid, computeRoute, directRoute } from '@/domain/routing';
import {
  buildThread,
  airRise,
  flightAltitude,
  HOVER_ALTITUDE,
  pointOnLeg,
  AIR_RISE_MAX,
  AIR_RISE_MIN,
  AIR_RISE_SHARE,
  DRIFT_CEILING_PX_S,
  DRIFT_SPEED,
} from './thread';
import { COUNTRY_THICKNESS, WorldFrame } from './frame';
import type { Ribbon } from './route-ribbon';

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

const alongOf = (ribbon: Ribbon): number[] =>
  Array.from(ribbon.geometry.getAttribute('along').array);

describe('the thread cut', () => {
  const thread = buildThread(crossing, frame, colors, thickness, opacities);
  const stroke = thread.targets[0]!.material;
  const unrolled = unrollRoute(crossing);
  const totalLength = thread.legs.reduce((sum, leg) => sum + leg.length, 0);

  const cutAt = (t: number): number => {
    const { legIndex, local } = pawnTarget(temporalPosition(unrolled, t));
    thread.cut(legIndex, local);
    return stroke.cut;
  };

  it('every strand reads the same distance: the thread is one ribbon, end to end', () => {
    const ends = thread.targets.map((ribbon) => alongOf(ribbon));
    expect(ends[0]![0]).toBe(0);
    for (let i = 1; i < ends.length; i++)
      expect(ends[i]![0]).toBeCloseTo(ends[i - 1]![ends[i - 1]!.length - 1]!, 4);
    expect(ends.at(-1)!.at(-1)).toBeCloseTo(totalLength, 4);
  });

  it('cuts nothing at departure and everything at arrival', () => {
    expect(cutAt(0)).toBe(0);
    expect(cutAt(1)).toBeCloseTo(totalLength, 6);
  });

  it('the covered part only grows as the pawn walks, and holds still at the dock', () => {
    const cuts = [0.1, 0.25, 0.4, 0.75, 0.9, 0.99].map(cutAt);
    for (let i = 1; i < cuts.length; i++) expect(cuts[i]).toBeGreaterThanOrEqual(cuts[i - 1]!);
    const dock = unrolled.find((segment) => segment.kind === 'dock')!;
    const dockStart = unrolled
      .slice(0, unrolled.indexOf(dock))
      .reduce((sum, s) => sum + s.share, 0);
    expect(cutAt(dockStart + dock.share * 0.1)).toBeCloseTo(thread.legs[0]!.length, 6);
    expect(cutAt(dockStart + dock.share * 0.9)).toBeCloseTo(thread.legs[0]!.length, 6);
  });
});

describe('the dash drift', () => {
  const threadOf = () => buildThread(crossing, frame, colors, thickness, opacities);
  /** How far the dashes moved, in board units: the phase is a share of the pitch. */
  const travelled = (thread: ReturnType<typeof threadOf>): number => {
    const stroke = thread.targets[0]!.material;
    return stroke.phase * stroke.pitch;
  };

  it('advances at constant world speed, not screen speed', () => {
    const [near, far] = [threadOf(), threadOf()];
    near.setScale(0.2);
    far.setScale(0.4);
    near.drift(0.05);
    far.drift(0.05);
    expect(travelled(near)).toBeCloseTo(DRIFT_SPEED * 0.05, 10);
    expect(travelled(far)).toBeCloseTo(DRIFT_SPEED * 0.05, 10);
  });

  it('caps up close: the thread flows, it does not flicker', () => {
    const thread = threadOf();
    // Two thousandths of a unit per pixel: the zoom stop, where world speed runs away.
    thread.setScale(0.002);
    thread.drift(0.1);
    expect(travelled(thread) / 0.002).toBeCloseTo(DRIFT_CEILING_PX_S * 0.1, 8);
  });

  it('a tab back in the foreground does not catch up its drift in one jump', () => {
    const [normal, asleep] = [threadOf(), threadOf()];
    normal.setScale(1);
    asleep.setScale(1);
    normal.drift(0.1);
    asleep.drift(30);
    expect(travelled(asleep)).toBeCloseTo(travelled(normal), 10);
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

  it('cruises in the middle of its leg, at the apex', () => {
    const thread = buildThread(
      directRoute(toLonLat(5, 25), toLonLat(95, 25), 'air', 1),
      frame,
      colors,
      thickness,
      opacities,
    );
    const leg = thread.legs[0]!;
    const heightAt = (local: number) => {
      const point = new Vector3();
      pointOnLeg(leg, local, point);
      return point.y - leg.strands[0]!.vertices[0]!.y;
    };
    expect(heightAt(0.45)).toBeCloseTo(heightAt(0.5), 3);
    expect(heightAt(0.55)).toBeCloseTo(heightAt(0.5), 3);
  });

  it('in a Blitz, leaves and stops at the height where a plane hovers', () => {
    const route = directRoute(toLonLat(5, 25), toLonLat(95, 25), 'air', 1);
    const grounded = buildThread(route, frame, colors, thickness, opacities);
    const aloft = buildThread(route, frame, colors, thickness, opacities, { aloft: true });
    const ground = grounded.legs[0]!.strands[0]!.vertices;
    const flown = aloft.legs[0]!.strands[0]!.vertices;
    const surface = ground[0]!.y;
    expect(flown[0]!.y - surface).toBeCloseTo(HOVER_ALTITUDE, 6);
    expect(flown.at(-1)!.y - surface).toBeCloseTo(HOVER_ALTITUDE, 6);
    const apex = (vertices: typeof flown) => Math.max(...vertices.map((vertex) => vertex.y));
    expect(apex(flown)).toBeCloseTo(apex(ground), 6);
  });
});

describe('flightAltitude', () => {
  it('climbs from the ground at take-off and lands back on it', () => {
    expect(flightAltitude(0)).toBe(0);
    expect(flightAltitude(1)).toBe(0);
    expect(flightAltitude(0.05)).toBeGreaterThan(0);
    expect(flightAltitude(0.05)).toBeLessThan(flightAltitude(0.15));
    expect(flightAltitude(0.95)).toBeLessThan(flightAltitude(0.85));
  });

  it('holds its cruise in the middle', () => {
    for (const share of [0.4, 0.5, 0.6]) expect(flightAltitude(share)).toBe(1);
  });
});
