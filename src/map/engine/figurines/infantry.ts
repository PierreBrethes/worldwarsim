import { Group, type Object3D } from 'three';

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
] as const;
type Joint = (typeof JOINTS)[number];
type Rotations = Partial<Record<Joint, readonly [number, number, number]>>;

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
  };
}

function pose(soldier: Object3D, rotations: Rotations): void {
  for (const [name, [x, y, z]] of Object.entries(rotations))
    soldier.getObjectByName(name)?.rotation.set(x, y, z);
}

const SLOTS = [
  [0, 0.45],
  [-0.55, -0.45],
  [0.55, -0.6],
] as const;

/** The pose the file gives a man, joint by joint: the kneeling rank 2 is in these rotations. */
function sculptedOf(man: Object3D): Rotations {
  const found: Rotations = {};
  for (const name of JOINTS) {
    const joint = man.getObjectByName(name);
    if (joint) found[name] = [joint.rotation.x, joint.rotation.y, joint.rotation.z];
  }
  return found;
}

/**
 * Up to three men to a troop (ADR 0026 §5), one per figure, the first in front: a whole squad
 * has the footprint of a tank, a worn one stands fewer in the same slots. Every man can march,
 * and a man `sculpted` rests in the stance of his file — the mark 2 kneels behind his bazooka —
 * which he leaves to march and takes back when he stops (`stand`, `stride`).
 */
export function squadOf(
  soldiers: ReadonlyArray<{ readonly make: () => Object3D; readonly sculpted: boolean }>,
): Group {
  const squad = new Group();
  soldiers.slice(0, SLOTS.length).forEach((soldier, k) => {
    const [x, z] = SLOTS[k]!;
    const man = soldier.make();
    // By his place, front first: a sortie walks the men in file (`walkOut`, `part`).
    man.name = `man_${k}`;
    man.userData.stride = k * 1.8 + 0.6;
    if (soldier.sculpted) man.userData.sculpted = sculptedOf(man);
    else pose(man, marching(man.userData.stride as number));
    man.position.set(x, 0, z);
    squad.add(man);
  });
  return squad;
}

/** A man back in the stance `squadOf` stood him in: a recruit who arrived before his squad. */
export function stand(man: Object3D): void {
  const phase = man.userData.stride as number | undefined;
  if (phase !== undefined)
    pose(man, (man.userData.sculpted as Rotations | undefined) ?? marching(phase));
}

/**
 * **Les hommes qui marchent, au pas** (page publique) : chaque marcheur reprend sa foulée à
 * `seconds`, décalé des autres ; `null` les arrête jambes droites. Le plateau ne s'en sert pas —
 * ses pièces gardent la pose où `squadOf` les a mises.
 */
export function stride(root: Object3D, seconds: number | null): void {
  root.traverse((man) => {
    const phase = man.userData.stride as number | undefined;
    if (phase === undefined) return;
    pose(
      man,
      seconds === null
        ? ((man.userData.sculpted as Rotations | undefined) ?? marching(0))
        : marching(phase + seconds * 9),
    );
  });
}
