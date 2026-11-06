import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AdditiveBlending,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Sprite,
  Vector3,
} from 'three';
import { sceneSpan } from '@/domain/combat-on-map';
import type { ReplayView } from '@/domain/player-view';
import { REPLAY_MS, replayAt, stepBounds, VOLLEY_SHARE, STEP_MS } from '@/domain/replay';
import type { UnitRole } from '@/domain/ids';
import { metresOnBoard, troopSpan } from '@/domain/piece-size';
import { GUNS, Guns, turretLimitOf } from './articulation';
import { REPLAY_STAGE, ReplayScene, sinceDeparture } from './replay';

vi.mock('./sequences', () => ({
  articulatedOf: async (_url: string, family: string): Promise<Group> => {
    const root = new Group();
    if (family === 'escort') {
      // A fore turret at rest facing the bow, an aft one facing the stern; only the first gun
      // carries its muzzle, the second ends where its geometry does.
      for (const [n, z, rest] of [
        [1, 2, 0],
        [2, -2, Math.PI],
      ] as const) {
        const turret = new Group();
        turret.name = `turret_${n}`;
        turret.position.z = z;
        turret.rotation.y = rest;
        const gun = new Group();
        gun.name = `gun_${n}`;
        gun.add(
          new Mesh(new BoxGeometry(0.2, 0.2, 1).translate(0, 0, 0.5), new MeshStandardMaterial()),
        );
        if (n === 1) {
          const muzzle = new Group();
          muzzle.name = 'fx_muzzle';
          muzzle.position.z = 0.9;
          gun.add(muzzle);
        }
        turret.add(gun);
        root.add(turret);
      }
      return root;
    }
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
  const { Group: G, Mesh: M, BoxGeometry: B } = await import('three');
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
              : new G().add(new M(new B(1, 1, 1).translate(0, 0.5, 0)));
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

describe('the departures of a line', () => {
  it('count from its own first piece: with two of mine, the first of theirs leaves with the riposte', async () => {
    const forces = [
      { role: 'armor' as const, tier: 1 as const, troops: 2, lost: 0, routed: 0, destroyed: 0 },
    ];
    const two: ReplayView = {
      ...view('armor'),
      mine: forces,
      theirs: { troops: 2, lost: 0, routed: 0, destroyed: 0 },
      faced: { nation: 'germany', forces: forces.map((f) => ({ ...f, strength: 100 })) },
    };
    const scene = new ReplayScene('france', replayAt(two, 0).pieces, 'land', null, null, null);
    await landed();
    scene.show(replayAt(two, stepBounds('riposte').start + 20), 0, false);
    // Pieces 0, 1 are mine; 2 is the first of theirs.
    const flash = (k: number) =>
      scene.object.children[k]!.children[0]!.children[1]!.children[0]!.visible;
    expect(flash(2)).toBe(true);
  });
});

const fleet = (mine: number, theirs: number): ReplayView => {
  const forces = (troops: number) => [
    { role: 'escort' as const, tier: 1 as const, troops, lost: 0, routed: 0, destroyed: 0 },
  ];
  return {
    ...view('escort'),
    mine: forces(mine),
    theirs: { troops: theirs, lost: 0, routed: 0, destroyed: 0 },
    faced: { nation: 'germany', forces: forces(theirs).map((f) => ({ ...f, strength: 100 })) },
  };
};

describe('an escort at sea', () => {
  it('turns each turret the short way from its own rest, the aft one starting astern', async () => {
    const v = fleet(1, 1);
    const scene = new ReplayScene(
      'france',
      replayAt(v, 0).pieces,
      'sea',
      null,
      'germany',
      null,
      sceneSpan(v),
    );
    await landed();
    scene.show(replayAt(v, at('pose', 1)), 0, false);
    const [ship, foe] = scene.object.children as [Object3D, Object3D];
    const aim = Math.atan2(foe.position.x - ship.position.x, foe.position.z - ship.position.z);
    for (const name of ['turret_1', 'turret_2']) {
      const facing = ship.getObjectByName(name)!.getWorldDirection(new Vector3());
      expect(Math.cos(Math.atan2(facing.x, facing.z) - aim), name).toBeCloseTo(1);
    }
    // From its rest astern, the aft turret turns a quarter and the stagger's angle, not three.
    const aft = ship.getObjectByName('turret_2')!.quaternion;
    const stagger = Math.abs(Math.PI / 2 - Math.abs(aim));
    expect(aft.angleTo(new Quaternion(0, 1, 0, 0))).toBeCloseTo(Math.PI / 2 + stagger);
  });

  it('holds a turret within 150 degrees of its rest: it does not fire through the bridge', async () => {
    const { articulatedOf } = await import('./sequences');
    const rig = await articulatedOf('escort.glb', 'escort');
    const guns = new Guns(rig, 'escort', turretLimitOf(null, 1, 'escort'));
    // Dead astern: the fore turret stops short of its own bridge, the aft one looks straight on.
    guns.point(Math.PI - 0.01, 1, 1, () => 0);
    expect(rig.getObjectByName('turret_1')!.quaternion.angleTo(new Quaternion())).toBeCloseTo(
      (150 * Math.PI) / 180,
    );
    expect(
      rig.getObjectByName('turret_2')!.quaternion.angleTo(new Quaternion(0, 1, 0, 0)),
    ).toBeCloseTo(0.01);
  });

  it('fires each tube from its own muzzle, one after the other', async () => {
    const v = fleet(1, 1);
    const scene = new ReplayScene(
      'france',
      replayAt(v, 0).pieces,
      'sea',
      null,
      'germany',
      null,
      sceneSpan(v),
    );
    await landed();
    const ship = scene.object.children[0]!;
    const flashOn = (gun: string) => {
      let lit = false;
      // The flash glows, additive; the smoke's puffs do not.
      ship.getObjectByName(gun)!.traverse((part) => {
        lit ||=
          part instanceof Sprite && part.visible && part.material.blending === AdditiveBlending;
      });
      return lit;
    };
    const start = stepBounds('frappe').start;
    scene.show(replayAt(v, start + 30), 0, false);
    expect([flashOn('gun_1'), flashOn('gun_2')]).toEqual([true, false]);
    scene.show(replayAt(v, start + 100), 0, false);
    expect([flashOn('gun_1'), flashOn('gun_2')]).toEqual([true, true]);
  });
});

describe('a combat at sea', () => {
  const sea = (v: ReplayView) =>
    new ReplayScene('france', replayAt(v, 0).pieces, 'sea', null, 'germany', null, sceneSpan(v));

  it('lays the ships broadside, each side in file a hull and a fifth apart, ninety metres and a margin between the lines, theirs staggered', () => {
    const v = fleet(2, 2);
    const scene = sea(v);
    scene.show(replayAt(v, 0), 0, false);
    const [a, b, c] = scene.object.children as Object3D[];
    const hull = troopSpan('escort') / REPLAY_STAGE;
    expect(a!.visible).toBe(true);
    expect(b!.position.x).toBeCloseTo(a!.position.x);
    expect(b!.position.z - a!.position.z).toBeCloseTo(1.2 * hull);
    expect(c!.position.x - a!.position.x).toBeCloseTo((metresOnBoard(90) + 0.4) / REPLAY_STAGE);
    // Arrived, theirs stand a quarter of the storyboard's unit along from mine.
    scene.show(replayAt(v, stepBounds('frappe').start), 0, false);
    expect(c!.position.z - a!.position.z).toBeCloseTo(0.25 / REPLAY_STAGE);
    // Bow along the file, the two lines in opposite ways.
    expect(Math.cos(a!.rotation.y - c!.rotation.y)).toBeCloseTo(-1);
  });

  const sunk = (): ReplayView => {
    const v = fleet(1, 1);
    return {
      ...v,
      theirs: { ...v.theirs, destroyed: 1 },
      faced: { ...v.faced!, forces: v.faced!.forces.map((f) => ({ ...f, destroyed: 1 })) },
    };
  };

  it('heels the escort it sinks, then sinks and fades it over the account', async () => {
    const v = sunk();
    const scene = sea(v);
    await landed();
    const pivot = scene.object.children[1]!.children[0]!;
    scene.show(replayAt(v, stepBounds('riposte').start), 0, false);
    expect(Math.abs(pivot.rotation.z)).toBeCloseTo((14 * Math.PI) / 180);
    expect(pivot.rotation.x).toBeCloseTo(0);
    expect(pivot.position.y).toBeCloseTo(0);
    scene.show(replayAt(v, stepBounds('compte-rendu').start + 1600), 0, false);
    // Down by the stern: the bow rises, the heel has gone on to 22 degrees.
    expect(pivot.rotation.x).toBeCloseTo((-9 * Math.PI) / 180);
    expect(Math.abs(pivot.rotation.z)).toBeCloseTo((22 * Math.PI) / 180);
    // Its rig's guns stand a tenth of a unit high, drawn at the scene's scale.
    expect(pivot.position.y).toBeCloseTo((-0.6 * 0.1) / REPLAY_STAGE);
    const opacities: number[] = [];
    pivot.traverse((part) => {
      if (part instanceof Mesh && !Array.isArray(part.material) && part.material.transparent)
        opacities.push(part.material.opacity);
    });
    expect(opacities.length).toBeGreaterThan(0);
    expect(Math.max(...opacities)).toBeCloseTo(0);
  });

  it('holds it heeled and burning in the final pose, never faded: the pose shows the loss', async () => {
    const v = sunk();
    const scene = sea(v);
    scene.final = true;
    await landed();
    const pivot = scene.object.children[1]!.children[0]!;
    scene.show(replayAt(v, REPLAY_MS), 0, true);
    expect(Math.abs(pivot.rotation.z)).toBeCloseTo((22 * Math.PI) / 180);
    expect(pivot.rotation.x).toBeCloseTo((-9 * Math.PI) / 180);
    expect(pivot.position.y).toBeCloseTo(0);
    expect(scene.smoking).toBe(true);
  });

  it('at reduced motion holds the frozen steps, then sinks the hull whole at the account', async () => {
    const v = sunk();
    const scene = sea(v);
    await landed();
    const pivot = scene.object.children[1]!.children[0]!;
    scene.show(replayAt(v, stepBounds('deroute').start, 'reduced'), 0, true);
    expect(Math.abs(pivot.rotation.z)).toBeCloseTo((14 * Math.PI) / 180);
    expect(pivot.position.y).toBeCloseTo(0);
    scene.show(replayAt(v, stepBounds('compte-rendu').start, 'reduced'), 0, true);
    expect(pivot.position.y).toBeCloseTo((-0.6 * 0.1) / REPLAY_STAGE);
  });

  it('heels and sinks a block with no role the same way', async () => {
    const v = sunk();
    const { faced: _faced, ...blind } = v;
    const scene = sea(blind);
    await landed();
    const pivot = scene.object.children[1]!.children[0]!;
    scene.show(replayAt(blind, stepBounds('riposte').start), 0, false);
    expect(Math.abs(pivot.rotation.z)).toBeCloseTo((14 * Math.PI) / 180);
    expect(pivot.rotation.x).toBeCloseTo(0);
    scene.show(replayAt(blind, REPLAY_MS), 0, false);
    expect(pivot.position.y).toBeLessThan(0);
  });

  /** The lowest opacity a piece wears: 1 when nothing on it is see-through. */
  const opacityOf = (piece: Object3D) => {
    let least = 1;
    piece.traverse((part) => {
      if (part instanceof Mesh && !Array.isArray(part.material) && part.material.transparent)
        least = Math.min(least, part.material.opacity);
    });
    return least;
  };

  it('on the map, fades the attacker in over the voyage and out as the account ends', async () => {
    const v = fleet(1, 1);
    const scene = new ReplayScene(
      'france',
      replayAt(v, 0).pieces,
      'sea',
      null,
      'germany',
      'mine',
      sceneSpan(v),
    );
    await landed();
    const [mine, theirs] = scene.object.children as Object3D[];
    const shown = (t: number) => {
      scene.show(replayAt(v, t), 0, false);
      return [opacityOf(mine!), opacityOf(theirs!)];
    };
    expect(shown(stepBounds('voyage').start)).toEqual([0, 1]);
    const [half] = shown(at('voyage', 0.5));
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    expect(shown(stepBounds('frappe').start + 1)).toEqual([1, 1]);
    expect(shown(at('compte-rendu', 0.2))).toEqual([1, 1]);
    expect(shown(REPLAY_MS)).toEqual([0, 1]);
  });

  it('fires only from a ship that has a muzzle: a cargo does not', async () => {
    const v: ReplayView = {
      ...fleet(1, 1),
      mine: [{ role: 'cargo', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0 }],
    };
    const scene = sea(v);
    await landed();
    const shot = (k: number) => scene.object.children[2 + k]!.visible;
    scene.show(replayAt(v, stepBounds('frappe').start + 40), 0, false);
    expect(shot(0)).toBe(false);
    scene.show(replayAt(v, stepBounds('riposte').start + 40), 0, false);
    expect(shot(1)).toBe(true);
  });
});
