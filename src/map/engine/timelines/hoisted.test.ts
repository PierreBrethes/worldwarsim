import { Box3, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { troopMetres } from '@/domain/piece-size';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { MOLE } from '@/emblems/kits/manifest';
import { sceneOfFile } from '../gltf-scene.fixture';
import { boomsOfScene } from './booms';
import { berths } from './rest';
import { BOOM, type Boom, liftOf } from './derrick';
import type { P3 } from './gangway';
import { hoistedBoarding, hoistedOf, type Vehicle } from './hoisted';

const boom: Boom = {
  n: 1,
  length: BOOM,
  pivot: [0.6, 6.5, 27.8],
  rest: { yaw: 0, lift: 0.43 },
  hatch: { at: [0, 5.2, 35.65], rim: 5.2 },
};
const lift = liftOf({ boom, spot: [-10, 2.2, 27.8], height: 3, start: 3000 });
// The board is the hull's metres, shifted: a hull turned stem to the land would turn them over.
const toBoard = (p: P3): P3 => [100 - p[0], p[1], 200 - p[2]];
const path: P3[] = [
  [10, 2.2, 90],
  [10, 2.2, 150],
  [90, 2.2, 172.2],
];
const seq = hoistedOf({
  path,
  driveStart: 500,
  arrive: 2500,
  lift,
  toBoard,
  swing: (yaw) => -yaw,
});

describe('hoistedOf (#505)', () => {
  it('stands at its rest until it sets off, then drives its path to the spot', () => {
    expect(seq.at(0)).toEqual({});
    const mid = seq.at(1500).root!;
    expect(mid.travel![2]).toBeGreaterThan(0);
    const there = seq.at(2600).root!;
    expect(there.travel![0]).toBeCloseTo(80, 6);
    expect(there.travel![2]).toBeCloseTo(82.2, 6);
    expect(there.fade).toBeUndefined();
  });

  it('waits under the tip while the load is slung, then is carried where the hook is', () => {
    const wait = seq.at(lift.lifted - 5).root!;
    expect(wait.travel![0]).toBeCloseTo(80, 6);
    expect(wait.travel![2]).toBeCloseTo(82.2, 6);
    const air = seq.at(lift.over - 1).root!;
    const { load } = lift.at(lift.over - 1);
    const board = toBoard(load!);
    expect(air.travel![0]).toBeCloseTo(board[0] - 10, 6);
    expect(air.travel![1]).toBeCloseTo(board[1] - 2.2, 6);
    expect(air.travel![2]).toBeCloseTo(board[2] - 90, 6);
    expect(air.travel![1]).toBeGreaterThan(5);
  });

  it('turns with the mast as it slews over the hold, and keeps its heading before', () => {
    const before = seq.at(lift.lifted).root!.heading!;
    const after = seq.at(lift.over).root!.heading!;
    expect(seq.at(lift.lifted - 5).root!.heading).toBeCloseTo(before, 6);
    expect(Math.abs(after - before)).toBeGreaterThan(0.5);
  });

  it('fades across the coaming and is gone once lowered, never before it is over the hold', () => {
    expect(seq.at(lift.over - 1).root!.fade).toBe(1);
    expect(seq.at(lift.dropped - 1).root!.fade).toBeLessThan(0.1);
    expect(seq.at(seq.ms - 1).root!.fade).toBe(0);
    expect(seq.at(seq.ms)).toEqual({});
  });

  it('plays in the pool of the pieces that board, from out of the image', () => {
    expect(seq.pool).toBe('boarding');
    expect(seq.anywhere).toBe(true);
  });
});

/** A cargo of the French file at the mole, in a port as drawn or laid in mirror (#476), with a tank
 *  and a truck waiting in the yard: what a player's order to board makes the engine plan. */
const DECK = MOLE.lift + 0.5;
const cargo = (mirrored: boolean) => {
  const url = (FIGURINE_FILES.france as { cargo: string }).cargo;
  const scene = sceneOfFile(url);
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const k = troopMetres('cargo') / Math.max(size.x, size.z);
  const [at] = berths(
    ['cargo'],
    1,
    ['mole'],
    [(2 * Math.max(box.max.x, -box.min.x)) / Math.max(size.x, size.z)],
  );
  const way = mirrored ? -1 : 1;
  // The port's metres to the board: laid in mirror, its x is turned over.
  const toBoard = (p: Vector3) => new Vector3(way * p.x + 5, p.y, p.z + 3);
  const toModel = (p: Vector3) => new Vector3(way * (p.x - 5), p.y, p.z - 3);
  const frame = new Matrix4()
    .makeTranslation(way * at!.x + 5, 0, at!.z + 3)
    .multiply(new Matrix4().makeRotationY(mirrored ? 0 : Math.PI))
    .multiply(new Matrix4().makeScale(k, k, k));
  const vehicles: Vehicle[] = [
    { id: 'tank', rest: toBoard(new Vector3(30, DECK, 90)), length: 6, height: 2.5 },
    { id: 'truck', rest: toBoard(new Vector3(42, DECK, 90)), length: 7, height: 3 },
  ];
  const booms = boomsOfScene(scene);
  const plan = hoistedBoarding({ booms, frame, toModel, toBoard, deck: DECK, vehicles });
  return {
    booms,
    frame,
    toBoard,
    toModel,
    vehicles,
    plan,
    noMast: () => hoistedBoarding({ booms: [], frame, toModel, toBoard, deck: DECK, vehicles }),
  };
};

describe.each([false, true])(
  'hoistedBoarding, a port laid in mirror: %s (#505, #476)',
  (mirrored) => {
    const { booms, frame, toBoard, toModel, vehicles, plan, noMast } = cargo(mirrored);

    it('plays a tank and a truck as two sequences, each from its rest to the foot of its mast', () => {
      expect(plan.playing.map(({ id }) => id)).toEqual(['tank', 'truck']);
      plan.lifts.forEach(({ boom, arrive }, n) => {
        const pivot = new Vector3(...booms[boom]!.pivot).applyMatrix4(frame);
        // The spot, in the port's metres: just in from the mole's face, at the mast's station.
        const spot = toBoard(new Vector3(MOLE.inner + 1, DECK, toModel(pivot).z));
        const pose = plan.playing[n]!.sequence.at(arrive + 1).root!;
        const rest = vehicles[n]!.rest;
        expect(rest.x + pose.travel![0]).toBeCloseTo(spot.x, 3);
        expect(rest.y + pose.travel![1]).toBeCloseTo(spot.y, 3);
        expect(rest.z + pose.travel![2]).toBeCloseTo(spot.z, 3);
      });
    });

    it('lets a rider go into the tag as its vehicle is lowered out of sight', () => {
      expect(plan.feeds).toEqual(
        plan.lifts.map(({ lift }, n) => ({ at: lift.dropped, id: vehicles[n]!.id })),
      );
    });

    it('is settled once the last mast is home', () => {
      expect(plan.settled).toBeGreaterThanOrEqual(
        Math.max(...plan.lifts.map(({ lift }) => lift.end)),
      );
      expect(plan.hull!.ms).toBeGreaterThanOrEqual(plan.settled - 1);
    });

    it('poses its vehicles at once when the file has no mast', () => {
      const none = noMast();
      expect(none.playing).toEqual([]);
      expect(none.feeds).toEqual([]);
      expect(none.hull).toBeNull();
      expect(none.settled).toBe(0);
    });
  },
);
