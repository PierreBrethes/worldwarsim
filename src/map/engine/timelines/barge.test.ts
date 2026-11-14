import { Box3, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { troopMetres } from '@/domain/piece-size';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { sceneOfFile } from '../gltf-scene.fixture';
import { bargeGroundOf, bargeOf, merged } from './barge';
import { boomsOfScene } from './booms';

const files = Object.entries(FIGURINE_FILES).map(
  ([nation, entry]) => [nation, (entry as { cargo: string }).cargo] as const,
);

describe('bargeGroundOf (#511)', () => {
  const frame = new Matrix4().makeScale(0.01, 0.01, 0.01);

  it('is the water edge on the line from the vehicle to the hull', () => {
    // Sand from x = 1 inland; the vehicle stands at x = 1.4, the hull at the origin.
    const ground = bargeGroundOf({
      frame,
      rest: new Vector3(1.4, 0, 0),
      wet: (x) => x < 1,
    });
    expect(ground[0]).toBeCloseTo(1, 1);
    expect(ground[1]).toBeCloseTo(0, 6);
  });

  it('stays short of the hull when the water is nearer than the vehicle', () => {
    const ground = bargeGroundOf({ frame, rest: new Vector3(0.3, 0, 0), wet: () => true });
    expect(ground[0]).toBeGreaterThan(0);
    expect(ground[0]).toBeLessThan(0.3);
  });
});

describe('merged (#511)', () => {
  it('lays the poses of two sequences of a hull side by side, the longer one deciding the end', () => {
    const a = {
      family: 'cargo' as const,
      ms: 10,
      at: (t: number) => (t < 10 ? { boat_left: { fade: 1 } } : {}),
    };
    const b = {
      family: 'cargo' as const,
      ms: 20,
      at: () => ({ mat_charge_1: { aim: [0, 0] as const } }),
    };
    const both = merged(a, b)!;
    expect(both.ms).toBe(20);
    expect(Object.keys(both.at(5))).toEqual(['boat_left', 'mat_charge_1']);
    expect(Object.keys(both.at(15))).toEqual(['mat_charge_1']);
    expect(merged(null, b)).toBe(b);
  });
});

describe.each(files)('the barge of the %s cargo (#511)', (nation, url) => {
  const scene = sceneOfFile(url);
  const booms = boomsOfScene(scene);
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const k = troopMetres('cargo') / Math.max(size.x, size.z);
  const beam = box.max.x;
  const tank = { rest: new Vector3(0, 0, 0), heading: 1.1, length: 7 * k, height: 2.5 * k };

  describe.each([0, Math.PI / 2, -2])('the hull turned %f', (turn) => {
    const frame = new Matrix4()
      .makeTranslation(5, 0, 3)
      .multiply(new Matrix4().makeRotationY(turn))
      .multiply(new Matrix4().makeScale(k, k, k));
    const toBoard = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(frame);
    // A beach 50 m off the flank, the tank standing on it.
    const rest = toBoard(60, 0, -20);
    const ground = [toBoard(50, 0, -20).x, toBoard(50, 0, -20).z] as const;
    const plan = bargeOf({ booms, frame, beam, vehicle: { ...tank, rest }, ground })!;
    const stern = [...booms].sort((a, b) => a.hatch.at[2] - b.hatch.at[2])[0]!;

    it(`${nation}: plays something, and ends with the pile’s own pose`, () => {
      expect(plan).not.toBeNull();
      expect(plan.ms).toBeGreaterThan(5000);
      expect(plan.tank.at(plan.ms)).toEqual({});
      const end = plan.tank.at(plan.tank.ms - 1).root!;
      expect(Math.hypot(...(end.travel as [number, number, number]))).toBeLessThan(0.05 * k);
      expect(Math.cos(end.heading! - tank.heading)).toBeCloseTo(1, 3);
      expect(end.fade ?? 1).toBe(1);
    });

    it('stands the barge on the hold nearest the stern, and hoists it back there', () => {
      const cale = toBoard(stern.hatch.at[0], stern.hatch.rim, stern.hatch.at[2]);
      for (const t of [0, plan.hull.ms - 2]) {
        const at = plan.craft(t)!.at;
        expect(Math.hypot(at.x - cale.x, at.z - cale.z)).toBeLessThan(0.5 * k);
        expect(at.y).toBeCloseTo(cale.y, 1);
      }
      expect(plan.craft(plan.ms)).toBeNull();
    });

    it('keeps the tank out of sight until a mast brings it up out of its hold', () => {
      expect(plan.tank.at(0).root!.fade).toBe(0);
      const seen = Array.from({ length: plan.ms / 50 }, (_, n) => n * 50).find(
        (t) => (plan.tank.at(t).root?.fade ?? 1) > 0,
      )!;
      expect(seen).toBeGreaterThan(1500);
      expect(Object.keys(plan.hull.at(seen))).toContain(
        `mat_charge_${booms.length > 1 ? (booms.find((b) => b.n !== stern.n && Math.abs(b.pivot[2] - stern.pivot[2]) < 6)?.n ?? stern.n) : stern.n}`,
      );
    });

    it('slings the tank to the barge afloat beside the hull, and carries it with the barge', () => {
      // Once seen and down, the tank rides: it is where the barge is, on its deck.
      let onBoard = 0;
      for (let t = 0; t < plan.ms; t += 25) {
        const c = plan.craft(t)!;
        const pose = plan.tank.at(t).root;
        if (pose === undefined || pose.fade === 0 || pose.travel === undefined) continue;
        const at = rest.clone().add(new Vector3(...pose.travel));
        if (Math.hypot(at.x - c.at.x, at.z - c.at.z) < 0.5 * k && at.y > c.at.y) onBoard++;
      }
      expect(onBoard).toBeGreaterThan(40);
    });

    it('lowers the ramp aground and not before: the tank leaves the barge on a fallen ramp only', () => {
      const grounded = Array.from({ length: plan.ms / 10 }, (_, n) => n * 10).filter(
        (t) => plan.craft(t)!.ramp > 0,
      );
      expect(grounded.length).toBeGreaterThan(50);
      // Whenever the tank stands clear of the barge's length, aground, the ramp is down.
      let clear = 0;
      for (let t = grounded[0]!; t < plan.ms; t += 10) {
        const c = plan.craft(t)!;
        const pose = plan.tank.at(t).root;
        if (pose?.travel === undefined) continue;
        const at = rest.clone().add(new Vector3(...pose.travel));
        if (Math.hypot(at.x - c.at.x, at.z - c.at.z) > plan.size.length / 2) {
          clear++;
          expect(c.ramp).toBeGreaterThan(0.99);
        }
      }
      expect(clear).toBeGreaterThan(10);
      // The barge is not under way before the tank is aboard, nor does it back with the tank on it.
      expect(plan.craft(0)!.ramp).toBe(0);
    });

    it('backs the barge away while the vehicle still drives up a long beach, and holds the pile for the vehicle', () => {
      const far = bargeOf({
        booms,
        frame,
        beam,
        vehicle: { ...tank, rest: toBoard(60 + 600, 0, -20) },
        ground,
      })!;
      expect(far.hull.ms).toBeLessThan(far.tank.ms);
      expect(far.ms).toBe(far.tank.ms);
      // The barge is hoisted home before the vehicle is at its rank.
      expect(far.craft(far.hull.ms + 100)).toBeNull();
      expect(far.tank.at(far.hull.ms + 100).root?.travel).toBeDefined();
    });

    it('moves only the masts and the hatch the lifts need, and puts them home', () => {
      expect(plan.hull.at(plan.hull.ms)).toEqual({});
      const names = new Set<string>();
      for (let t = 0; t < plan.hull.ms; t += 100)
        for (const name of Object.keys(plan.hull.at(t))) names.add(name);
      expect([...names].every((n) => /^(mat_charge|hold_hatch)_\d+$/.test(n))).toBe(true);
      expect([...names].some((n) => n === `mat_charge_${stern.n}`)).toBe(true);
    });

    it('draws a cable while a mast works and none once all is home', () => {
      let drawn = 0;
      for (let t = 0; t < plan.ms; t += 100) if (plan.strokes(t).length > 0) drawn++;
      expect(drawn).toBeGreaterThan(20);
      expect(plan.strokes(plan.ms)).toEqual([]);
    });
  });
});

describe('bargeOf without a mast or a hold (#511)', () => {
  it('plays nothing', () => {
    expect(
      bargeOf({
        booms: [],
        frame: new Matrix4(),
        beam: 5,
        vehicle: { rest: new Vector3(), heading: 0, length: 1, height: 1 },
        ground: [1, 0],
      }),
    ).toBeNull();
  });
});
