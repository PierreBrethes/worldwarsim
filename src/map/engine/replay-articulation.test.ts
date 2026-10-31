import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Group, type Object3D } from 'three';
import type { ReplayView } from '@/domain/player-view';
import { REPLAY_MS, replayAt, stepBounds, VOLLEY_SHARE, STEP_MS } from '@/domain/replay';
import type { UnitRole } from '@/domain/ids';
import { GUNS } from './articulation';
import { REPLAY_STAGE, ReplayScene, sinceDeparture } from './replay';

vi.mock('./sequences', () => ({
  articulatedOf: async (): Promise<Group> => {
    const root = new Group();
    const turret = new Group();
    turret.name = 'turret';
    const gun = new Group();
    gun.name = 'gun';
    gun.position.set(0, 0, 0.06);
    turret.add(gun);
    root.add(turret);
    return root;
  },
}));

vi.mock('./figurines/figurine', async (original) => {
  const { Group: G } = await import('three');
  const { squadOf: squad } = await import('./figurines/infantry');
  return {
    ...(await original<typeof import('./figurines/figurine')>()),
    figurineFor: (_nation: string, role: string) => {
      const object = new G();
      const model = new G();
      object.add(model);
      let drawn: Object3D | null = null;
      const man = () => {
        const soldier = new G();
        for (const name of [
          'body',
          'arm_right',
          'forearm_right',
          'leg_left',
          'shin_left',
          'rifle',
        ]) {
          const joint = new G();
          joint.name = name;
          soldier.add(joint);
        }
        return soldier;
      };
      return {
        object,
        span: 0.68,
        ready: Promise.resolve().then(() => {
          drawn =
            role === 'infantry'
              ? squad([1, 2].map((tier) => ({ make: man, sculpted: tier === 2 })))
              : new G();
          model.add(drawn);
        }),
        ...(role === 'infantry' ? {} : { url: `${role}.glb` }),
        standIn: (copy: Object3D | null) => {
          drawn?.removeFromParent();
          if (copy) model.add(copy);
        },
      };
    },
  };
});

beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  Object.assign(globalThis, {
    document: { createElement: () => ({ getContext: () => ctx }) },
    Path2D: class {},
  });
});

const view = (role: UnitRole): ReplayView => ({
  combatId: 'c',
  at: 0,
  point: { lon: 6.1, lat: 49.6 },
  side: 'attacker',
  won: true,
  mine: [{ role, tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0 }],
  theirs: { troops: 1, lost: 0, routed: 0, destroyed: 0 },
});

const landed = () => new Promise((resolve) => setTimeout(resolve, 0));
const at = (step: Parameters<typeof stepBounds>[0], share: number) => {
  const { start, end } = stepBounds(step);
  return start + share * (end - start);
};

async function sceneOf(role: UnitRole) {
  const v = view(role);
  const scene = new ReplayScene('france', replayAt(v, 0).pieces, 'land', null, null, null);
  await landed();
  return { v, scene };
}

describe('a tank in the replay', () => {
  it('turns its turret to its target, draws back its gun at the shot, and is at rest after the account', async () => {
    const { v, scene } = await sceneOf('armor');
    const holder = scene.object.children[0]!;
    const turret = holder.getObjectByName('turret')!;
    expect(turret).toBeDefined();
    const gun = holder.getObjectByName('gun')!;
    const body = holder.children[0]!.children[0]!;

    scene.show(replayAt(v, at('pose', 1)), 0, false);
    expect(gun.rotation.x).toBeCloseTo(-GUNS.armor.elevation);

    // The shot leaves at the start of the strike's volley: 80 ms later the barrel is all the way back.
    const volleyMs = STEP_MS.frappe * VOLLEY_SHARE;
    expect(volleyMs).toBeGreaterThan(0);
    scene.show(replayAt(v, stepBounds('frappe').start + 80), 0, false);
    expect(gun.position.z).toBeLessThan(0.06 - GUNS.armor.tube * 0.99);
    expect(body.position.z).toBeCloseTo(-GUNS.armor.piece * (0.68 / REPLAY_STAGE));
    expect(holder.children[0]!.rotation.x).toBeCloseTo((GUNS.armor.rock * Math.PI) / 180);

    // Half a second on, it is back.
    scene.show(replayAt(v, stepBounds('frappe').start + 700), 0, false);
    expect(gun.position.z).toBe(0.06);

    scene.show(replayAt(v, REPLAY_MS), 0, false);
    expect(turret.rotation.y).toBeCloseTo(0, 12);
    expect(gun.rotation.x).toBeCloseTo(0, 12);
    expect(gun.position.z).toBe(0.06);
  });

  it('holds the pose, without recoil, at reduced motion', async () => {
    const { v, scene } = await sceneOf('armor');
    const gun = scene.object.children[0]!.getObjectByName('gun')!;
    scene.show(replayAt(v, at('frappe', 0.1), 'reduced'), 0, true);
    expect(gun.rotation.x).toBeCloseTo(-GUNS.armor.elevation);
    expect(gun.position.z).toBe(0.06);
  });
});

describe('the turrets of a line', () => {
  it('each turns to the piece it fires at, the short way round', async () => {
    const three: ReplayView = {
      ...view('armor'),
      mine: [{ role: 'armor', tier: 1, troops: 3, lost: 0, routed: 0, destroyed: 0 }],
    };
    const scene = new ReplayScene('france', replayAt(three, 0).pieces, 'land', null, null, null);
    await landed();
    scene.show(replayAt(three, at('pose', 1)), 0, false);
    const block = scene.object.children[3]!;
    for (const k of [0, 1, 2]) {
      const holder = scene.object.children[k]!;
      const toward = Math.atan2(
        block.position.x - holder.position.x,
        block.position.z - holder.position.z,
      );
      const turn = Math.atan2(
        Math.sin(toward - holder.rotation.y),
        Math.cos(toward - holder.rotation.y),
      );
      expect(holder.getObjectByName('turret')!.rotation.y).toBeCloseTo(turn);
    }
    // The two off the axis really turn.
    expect(
      Math.abs(scene.object.children[0]!.getObjectByName('turret')!.rotation.y),
    ).toBeGreaterThan(0.3);
  });
});

describe('a man in the replay', () => {
  it('kneels and shoulders into the pose, and is back to his rest pose when the account ends', async () => {
    const { v, scene } = await sceneOf('infantry');
    const man = scene.object.children[0]!.getObjectByName('man_0')!;
    const rank2 = scene.object.children[0]!.getObjectByName('man_1')!;
    const leg = man.getObjectByName('leg_left')!;
    const rest = [leg.rotation.x, man.position.y];

    scene.show(replayAt(v, at('frappe', 0.1)), 0, false);
    expect(leg.rotation.x).toBeCloseTo(-1.35);
    expect(man.position.y).toBeLessThan(0);
    // The mark 2 keeps the pose of his file.
    expect(rank2.getObjectByName('leg_left')!.rotation.x).toBe(0);

    scene.show(replayAt(v, REPLAY_MS), 0, false);
    expect([leg.rotation.x, man.position.y]).toEqual(rest);
  });

  it('stands up before the about-turn of a rout', async () => {
    const routed: ReplayView = {
      ...view('infantry'),
      mine: [{ role: 'infantry', tier: 1, troops: 1, lost: 0, routed: 1, destroyed: 0 }],
    };
    const scene = new ReplayScene('france', replayAt(routed, 0).pieces, 'land', null, null, null);
    await landed();
    const man = scene.object.children[0]!.getObjectByName('man_0')!;
    scene.show(replayAt(routed, stepBounds('deroute').start + 0.25 * STEP_MS.deroute), 0, false);
    expect(man.position.y).toBe(0);
  });
});

describe('a shot has one instant', () => {
  it('starts the flash, the smoke, the ink and the recoil of each piece at its own departure', async () => {
    const three: ReplayView = {
      ...view('armor'),
      mine: [{ role: 'armor', tier: 1, troops: 3, lost: 0, routed: 0, destroyed: 0 }],
    };
    const scene = new ReplayScene('france', replayAt(three, 0).pieces, 'land', null, null, null);
    await landed();
    const volleyMs = STEP_MS.frappe * VOLLEY_SHARE;
    for (const k of [0, 1, 2]) {
      const departure = k * 0.15 * volleyMs;
      const marker = scene.object.children[k]!.children[0]!.children[1]!;
      const gun = scene.object.children[k]!.getObjectByName('gun')!;
      const state = (ms: number) => {
        const frame = replayAt(three, stepBounds('frappe').start + ms);
        scene.show(frame, 0, false);
        const ink = scene.object.children[3 + 1 + k]!;
        return [
          marker.children[0]!.visible,
          marker.children[1]!.visible,
          ink.visible,
          gun.position.z < 0.06,
        ];
      };
      expect(state(departure - 5), `piece ${k} before`).toEqual([false, false, false, false]);
      expect(state(departure + 20), `piece ${k} after`).toEqual([true, true, true, true]);
      expect(
        sinceDeparture(replayAt(three, stepBounds('frappe').start + departure + 20), k),
      ).toBeCloseTo(20);
    }
  });

  it('lasts 160 ms for the flash', async () => {
    const { v, scene } = await sceneOf('armor');
    const flash = () => scene.object.children[0]!.children[0]!.children[1]!.children[0]!.visible;
    scene.show(replayAt(v, stepBounds('frappe').start + 150), 0, false);
    expect(flash()).toBe(true);
    scene.show(replayAt(v, stepBounds('frappe').start + 170), 0, false);
    expect(flash()).toBe(false);
  });
});
