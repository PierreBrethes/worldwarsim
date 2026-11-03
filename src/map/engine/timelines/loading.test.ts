import { Box3, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildingMaquette } from '@/emblems/buildings/manifest';
import { isRigPart } from '@/emblems/rigs';
import { bakedRig } from '../baking';
import { sceneOfFile } from '../gltf-scene.fixture';
import type { PartPose } from '../sequences';
import { darkCrate, loadingAt, turnOf } from './loading';

type Point = readonly [number, number, number];

// The warehouse of the game (`warehouse.glb`), in metres: its quay faces +z.
const rank: Point = [-20, 0, 34];
const warehouse = {
  rank,
  rankFront: [0, 0, 1] as Point,
  length: 6.5,
  box: { min: [-30, 0, -20] as Point, max: [30, 10, 24.2] as Point },
  socle: { min: [-38, 0, -30] as Point, max: [38, 2.2, 50] as Point },
  quay: { stop: [0, 0, 23.5] as Point, front: [0, 0, 1] as Point },
  perron: {
    crates: [
      { name: 'caisse_1', at: [-5.6, 1.2, 21.5] as Point },
      { name: 'caisse_3', at: [-3.1, 1.2, 21.5] as Point },
      { name: 'caisse_4', at: [-4.975, 2.4, 21.5] as Point },
      { name: 'caisse_5', at: [-3.725, 2.4, 21.5] as Point },
    ],
    inside: [0, 1.2, 17] as Point,
    door: [0, 1.2, 20.4] as Point,
    top: 1.2,
  },
  crates: [0, 0],
  // Board offsets from the truck's rest: the model is the board here.
  toBoard: ([x, y, z]: Point): Point => [x - rank[0], y - rank[1], z - rank[2]],
};

const where = (pose: PartPose | undefined, from: Point): Point => {
  const by = pose?.travel ?? pose?.shift ?? [0, 0, 0];
  return [from[0] + by[0], from[1] + by[1], from[2] + by[2]];
};
const close = (a: Point, b: Point, within = 0.05) =>
  expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(within);

/** Each time the truck is drawn, from 0 to its end, every 50 ms. */
const times = (ms: number) => Array.from({ length: Math.ceil(ms / 50) }, (_, k) => k * 50);

describe('loadingAt (#271)', () => {
  const { truck, site, atQuay, gateUp } = loadingAt(warehouse);

  it('backs the truck to the quay, its back at fx_quai, its nose to the yard', () => {
    const pose = truck.at(atQuay + 700);
    close(where(pose.root, rank), [0, 0, 23.5 + 3.25]);
    expect(Math.cos(pose.root!.heading!)).toBeGreaterThan(0.999);
    expect(pose.tailgate!.turn![0]).toBeLessThan(-1.8);
  });

  it('drives clear of the building, and stands at its rest from its end', () => {
    for (const t of times(truck.ms)) {
      const [x, , z] = where(truck.at(t).root, rank);
      const inside = x > -30 && x < 30 && z > -20 && z < 23.5 + 3.24;
      expect(inside, `${t} ms: ${x}, ${z}`).toBe(false);
    }
    expect(truck.at(truck.ms)).toEqual({});
    expect(site.at(site.ms)).toEqual({});
  });

  it('jumps the two crates on top of the pile aboard, and fades them under the tarp', () => {
    const jumping = times(gateUp).find((t) => site.at(t).caisse_5?.shift !== undefined)!;
    const mid = site.at(jumping + 225);
    expect(where(mid.caisse_5, [-3.725, 2.4, 21.5])[1]).toBeGreaterThan(2.4);
    expect(mid.caisse_1).toBeUndefined();
    for (const crate of ['caisse_5', 'caisse_4'] as const)
      expect(times(gateUp).some((t) => (site.at(t)[crate]?.fade ?? 1) < 0.15)).toBe(true);
  });

  it('slides the door open to bring the crates back out of the dark to the pile', () => {
    const coming = times(site.ms).find(
      (t) => t > gateUp && (site.at(t).caisse_5?.fade ?? 1) === 1,
    )!;
    expect(site.at(coming + 50).porte?.shift?.[0]).toBeGreaterThan(5);
    const back = times(site.ms).filter((t) => t > coming && site.at(t).caisse_5 === undefined);
    expect(back.length).toBeGreaterThan(0);
    expect(site.at(site.ms - 10).porte).toBeUndefined();
  });

  it('joins a second load while the tailgate is down: its crate jumps after the first', () => {
    const one = loadingAt({ ...warehouse, crates: [0] });
    const joined = loadingAt({ ...warehouse, crates: [0, one.gateUp - 200] });
    expect(joined.gateUp).toBeGreaterThan(one.gateUp);
    expect(joined.site.at(one.gateUp - 250).caisse_4).toBeUndefined();
    expect(joined.site.at(one.gateUp + 100).caisse_4?.shift).toBeDefined();
  });

  it('at the HQ, hangs the tailgate and brings the crates out of its service door', () => {
    const hq = loadingAt({
      ...warehouse,
      box: { min: [-20, 0, -25], max: [20, 20, 10] },
      socle: { min: [-38.8, 0, -45], max: [38.8, 2.2, 40] },
      quay: { stop: [24, 0, -19], front: [1, 0, 0] },
      rank: [0, 0, 20],
      toBoard: ([x, y, z]: Point): Point => [x, y, z - 20],
      perron: null,
    });
    const pose = hq.truck.at(hq.atQuay + 700);
    expect(pose.tailgate!.turn![0]).toBeCloseTo((-93 * Math.PI) / 180, 2);
    const out = times(hq.gateUp).find((t) => hq.site.at(t).caisse_1?.shift !== undefined)!;
    expect(hq.site.at(out).porte_service?.turn?.[1]).toBeGreaterThan(1.5);
  });
});

describe('the files a loading reads (#271)', () => {
  it('the warehouse keeps apart its door, its rollers and its five crates, and marks its quay', () => {
    const scene = sceneOfFile(buildingMaquette('warehouse', null)!);
    const rig = bakedRig(scene, (node) => isRigPart('warehouse', node.name));
    for (const name of ['porte', 'galet', 'galet_2', 'caisse_1', 'caisse_5'])
      expect(rig.getObjectByName(name), name).toBeDefined();
    expect(scene.getObjectByName('fx_quai')).toBeDefined();
  });

  it("the HQ's crates wait behind its service door, within 3 m of its wall", () => {
    const scene = sceneOfFile(buildingMaquette('hq', null)!);
    scene.updateMatrixWorld(true);
    const quay = scene.getObjectByName('fx_quai')!;
    const stop = quay.getWorldPosition(new Vector3());
    const front = new Vector3(0, 0, 1).applyQuaternion(quay.getWorldQuaternion(new Quaternion()));
    const dark = scene.getObjectByName('fond_sombre_service')!.getWorldPosition(new Vector3());
    for (const k of [0, 1]) {
      const at = new Vector3(...darkCrate(stop.toArray(), front.toArray(), k));
      const behind = dark.clone().sub(at).dot(front);
      // Behind the dark, not in the yard: a crate laid outside the wall would fail here.
      expect(behind, `${k}`).toBeGreaterThan(1);
      expect(behind, `${k}`).toBeLessThan(3);
    }
  });

  it.each(['warehouse', 'hq', 'arsenal', 'barracks', 'airfield'] as const)(
    "%s: the truck's turn stays on the socle, a half-width in",
    (key) => {
      const scene = sceneOfFile(buildingMaquette(key, null)!);
      const quay = scene.getObjectByName('fx_quai');
      if (quay === undefined) return;
      scene.updateMatrixWorld(true);
      const socle = new Box3().setFromObject(scene.getObjectByName('socle')!);
      const stop = quay.getWorldPosition(new Vector3()).toArray();
      const front = new Vector3(0, 0, 1)
        .applyQuaternion(quay.getWorldQuaternion(new Quaternion()))
        .setY(0)
        .normalize();
      const sides: Point[] = [
        [front.z, 0, -front.x],
        [-front.z, 0, front.x],
      ];
      for (const side of sides) {
        const { turn, into } = turnOf(stop, front.toArray(), side, {
          min: socle.min.toArray(),
          max: socle.max.toArray(),
        });
        for (const [x, , z] of [turn, into]) {
          expect(x).toBeGreaterThanOrEqual(socle.min.x);
          expect(x).toBeLessThanOrEqual(socle.max.x);
          expect(z).toBeGreaterThanOrEqual(socle.min.z);
          expect(z).toBeLessThanOrEqual(socle.max.z);
        }
      }
    },
  );
});
