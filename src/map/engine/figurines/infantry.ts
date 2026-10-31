import { Group, type Object3D } from 'three';
import { MAN_METRES } from '@/domain/piece-size';
import type { UnitTier } from '@/domain/troops';

/**
 * **A soldier is posed by name.** The groups below are those the Claude Design model exports
 * (`body`, `head`, `arm_*` / `forearm_*` at shoulder and elbow, `leg_*` / `shin_*` at hip and
 * knee, `rifle` from its butt), so one set of poses serves every nation's sculpted soldier.
 * `left` is the soldier's own left: he faces +z, so it lies towards +x.
 */
export const JOINTS = [
  'arm_left',
  'arm_right',
  'forearm_left',
  'forearm_right',
  'leg_left',
  'leg_right',
  'shin_left',
  'shin_right',
  'rifle',
  // The mark 2's bazooka or rifle, hung from its forearm like the mark 1's rifle.
  'weapon',
] as const;
type Joint = (typeof JOINTS)[number];
type Rotations = Partial<Record<Joint, readonly [number, number, number]>>;
type Vec3 = readonly [number, number, number];
/** A man's stance: his joints' rotations and where his body hangs (the kneeling mark 2's sits lower). */
type Stance = { readonly joints: Rotations; readonly body: Vec3 };

/** Where `body` stands in a standing man of the file (the mark 1's, in metres). */
const STANDING_BODY: Vec3 = [0, 0.95, 0];
/** The nodes a pose moves: the joints, and the body that a kneeling man lowers. */
export const POSED = [...JOINTS, 'body'] as const;

/** On the road: arms and legs swinging, the rifle on the shoulder. `phase` keeps three men out of step. */
function marching(phase: number): Rotations {
  const swing = Math.sin(phase) * 0.32;
  return {
    leg_left: [-swing, 0, 0],
    leg_right: [swing, 0, 0],
    shin_left: [Math.max(0, swing) * 0.6, 0, 0],
    shin_right: [Math.max(0, -swing) * 0.6, 0, 0],
    arm_right: [-swing * 0.8, 0, 0.06],
    forearm_right: [-0.25, 0, 0],
    arm_left: [-0.35, 0, 0.12],
    forearm_left: [-0.7, 0, 0],
    rifle: [-0.45, 0, -0.04],
    weapon: [-0.45, 0, -0.04],
  };
}

const walking = (phase: number): Stance => ({ joints: marching(phase), body: STANDING_BODY });

function pose(soldier: Object3D, { joints, body }: Stance): void {
  for (const [name, [x, y, z]] of Object.entries(joints))
    soldier.getObjectByName(name)?.rotation.set(x, y, z);
  soldier.getObjectByName('body')?.position.set(...body);
}

const SLOTS = [
  [0, 0.45],
  [-0.55, -0.45],
  [0.55, -0.6],
] as const;

/** The stance the file gives a man: the kneeling rank 2 is in these rotations and this body height. */
function sculptedOf(man: Object3D): Stance {
  const found: Rotations = {};
  for (const name of JOINTS) {
    const joint = man.getObjectByName(name);
    if (joint) found[name] = [joint.rotation.x, joint.rotation.y, joint.rotation.z];
  }
  const body = man.getObjectByName('body')?.position ?? { x: 0, y: 0, z: 0 };
  return { joints: found, body: [body.x, body.y, body.z] };
}

/** A Japanese mark 2 is a gun and its gunner (4.57 m): the file carries both. */
export const hasGun = (nation: string, tier: UnitTier): boolean => nation === 'japan' && tier === 2;

/**
 * **The marks a squad draws**: a Japanese squad shows one gun whatever the number of its mark 2 —
 * `[2,2,2]` is the gun alone, `[2,2,1]` a gun and a rifleman (#316).
 */
export function crewOf(nation: string, marks: ReadonlyArray<UnitTier>): UnitTier[] {
  const first = marks.findIndex((tier) => hasGun(nation, tier));
  return marks.filter((tier, k) => !hasGun(nation, tier) || k === first);
}

/** Where the riflemen stand beside the gun, which spans x -1.53 to 0.29 from the first man's place. */
const BESIDE_GUN = [
  [1, -0.4],
  [1, -1.3],
] as const;

/**
 * Up to three men to a troop (ADR 0026 §5), one per figure, the first in front: a whole squad
 * has the footprint of a tank, a worn one stands fewer in the same slots. Every man can march,
 * and a man `sculpted` rests in the stance of his file — the mark 2 kneels behind his bazooka —
 * which he leaves to march and takes back when he stops (`stand`, `stride`).
 */
export function squadOf(
  soldiers: ReadonlyArray<{
    readonly make: () => Object3D;
    readonly sculpted: boolean;
    /** The gun crew's man: his piece stands in the first place, the others beside it. */
    readonly gun?: boolean;
  }>,
): Group {
  const squad = new Group();
  const gun = soldiers.findIndex((soldier) => soldier.gun);
  const beside = [...BESIDE_GUN];
  soldiers.slice(0, SLOTS.length).forEach((soldier, k) => {
    const [x, z] = gun < 0 ? SLOTS[k]! : k === gun ? SLOTS[0] : beside.shift()!;
    const man = soldier.make();
    // By his place, front first: a sortie walks the men in file (`walkOut`, `part`).
    man.name = `man_${k}`;
    man.userData.stride = k * 1.8 + 0.6;
    if (soldier.sculpted) man.userData.sculpted = sculptedOf(man);
    else pose(man, walking(man.userData.stride as number));
    man.position.set(x, 0, z);
    squad.add(man);
  });
  return squad;
}

/** A man back in the stance `squadOf` stood him in: a recruit who arrived before his squad. */
export function stand(man: Object3D): void {
  const phase = man.userData.stride as number | undefined;
  if (phase !== undefined)
    pose(man, (man.userData.sculpted as Stance | undefined) ?? walking(phase));
}

/**
 * **Les hommes qui marchent, au pas** (page publique) : chaque marcheur reprend sa foulée à
 * `seconds`, décalé des autres ; `null` les arrête, jambes droites, sauf l'homme `sculpted` qui
 * reprend la pose de son fichier (à genoux, le corps abaissé). Le plateau s'en sert pour la sortie
 * de caserne (`sequences.ts`).
 */
export function stride(root: Object3D, seconds: number | null): void {
  root.traverse((man) => {
    const phase = man.userData.stride as number | undefined;
    if (phase === undefined) return;
    pose(
      man,
      seconds === null
        ? ((man.userData.sculpted as Stance | undefined) ?? walking(0))
        : walking(phase + seconds * 9),
    );
  });
}

/** **Le genou à terre, en joue** (storyboard `commun/scene.js:240-253`, une série pour toutes les
 *  nations) : le bras droit avance, l'avant-bras ramène la main sous l'épaule, le fusil monte à
 *  l'horizontale. `kick` (0..1) est la secousse du coup. */
function kneeling(kick: number): Rotations {
  const arm = -0.9 + 0.08 * kick;
  const forearm = -0.6;
  const rifle: Vec3 = [Math.PI / 2 - arm - forearm - 0.06 * kick, 0, 0];
  return {
    leg_left: [-1.35, 0, 0],
    shin_left: [1.35, 0, 0],
    leg_right: [0.2, 0, 0],
    shin_right: [1.8, 0, 0],
    arm_right: [arm, 0, -0.12],
    forearm_right: [forearm, 0, 0],
    arm_left: [-1.25, 0, -0.35],
    forearm_left: [-0.45, 0, 0],
    rifle,
    weapon: rifle,
  };
}

/** La hauteur que perd l'homme à genou, en part de sa taille. @a-mesurer */
const KNEEL_DROP = 0.24;

const lerp3 = (from: Vec3, to: Vec3, k: number): Vec3 => [
  from[0] + (to[0] - from[0]) * k,
  from[1] + (to[1] - from[1]) * k,
  from[2] + (to[2] - from[2]) * k,
];

/**
 * **L'homme passe de sa pose de repos au genou à terre, en joue** (`ready` 0..1), la secousse du
 * coup en plus. À `ready` 0 il est exactement dans sa pose de repos : le plateau le reprend sans
 * saut. Le mark 2 garde la pose de son fichier — il épaule déjà, ou tient son arme — et ne
 * reçoit que la secousse sur son bras et son arme.
 */
export function shoulder(man: Object3D, ready: number, kick: number): void {
  const sculpted = man.userData.sculpted as Stance | undefined;
  const phase = man.userData.stride as number | undefined;
  if (sculpted === undefined && phase === undefined) return;
  const rest = sculpted ?? walking(phase!);
  if (sculpted !== undefined) {
    const joints: Rotations = { ...rest.joints };
    // A servant has no rifle to shake: his hand stays on the gun.
    const held = (['rifle', 'weapon'] as const).filter((name) => joints[name]);
    for (const name of held.length > 0 ? (['arm_right', ...held] as const) : []) {
      const at = joints[name]!;
      joints[name] = [at[0] + (name === 'arm_right' ? 0.08 : -0.06) * kick, at[1], at[2]];
    }
    pose(man, { joints, body: rest.body });
    return;
  }
  const target = kneeling(kick);
  const joints: Rotations = {};
  for (const name of JOINTS) {
    const from = rest.joints[name];
    const to = target[name];
    if (from && to) joints[name] = lerp3(from, to, ready);
  }
  pose(man, { joints, body: rest.body });
  // A man's file is `MAN_METRES` tall in its own units (`measureOf`).
  man.position.y = 0 - KNEEL_DROP * MAN_METRES * ready;
}
