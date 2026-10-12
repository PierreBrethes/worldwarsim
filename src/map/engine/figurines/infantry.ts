import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  BoxGeometry,
  type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * **A soldier is posed by name, wherever he comes from.** The groups below are the same the
 * Claude Design model exports (`body`, `head`, `arm_*` / `forearm_*` at shoulder and elbow,
 * `leg_*` / `shin_*` at hip and knee, `rifle` from its butt), so one set of poses serves the
 * provisional coded soldier and the sculpted one. `left` is the soldier's own left: he faces
 * +z, so it lies towards +x.
 */
type Joint =
  | 'arm_left'
  | 'arm_right'
  | 'forearm_left'
  | 'forearm_right'
  | 'leg_left'
  | 'leg_right'
  | 'shin_left'
  | 'shin_right'
  | 'rifle';

/** On the road: arms and legs swinging, the rifle on the shoulder. `phase` keeps three men out of step. */
function marching(phase: number): Partial<Record<Joint, readonly [number, number, number]>> {
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

function pose(
  soldier: Object3D,
  rotations: Partial<Record<Joint, readonly [number, number, number]>>,
): void {
  for (const [name, [x, y, z]] of Object.entries(rotations))
    soldier.getObjectByName(name)?.rotation.set(x, y, z);
}

const SLOTS = [
  [0, 0.45],
  [-0.55, -0.45],
  [0.55, -0.6],
] as const;

/** Three men to a troop (ADR 0026 §5): a squad has the footprint of a tank. */
export function squadOf(soldier: () => Object3D): Group {
  const squad = new Group();
  SLOTS.forEach(([x, z], k) => {
    const man = soldier();
    pose(man, marching(k * 1.8 + 0.6));
    man.position.set(x, 0, z);
    squad.add(man);
  });
  return squad;
}

// Coded, not sculpted: French infantry has to march in lot 1 before its Claude Design model is
// validated (decision of 12/10). The same named joints let the sculpted one take its place.

const paints = new Map<string, MeshStandardMaterial>();
const paint = (color: string): MeshStandardMaterial => {
  let material = paints.get(color);
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness: 0.72, flatShading: true });
    paints.set(color, material);
  }
  return material;
};
const at = <T extends Object3D>(object: T, x: number, y: number, z: number): T => {
  object.position.set(x, y, z);
  return object;
};
const box = (w: number, h: number, d: number, color: string) =>
  new Mesh(new BoxGeometry(w, h, d), paint(color));
const rounded = (w: number, h: number, d: number, r: number, color: string) =>
  new Mesh(new RoundedBoxGeometry(w, h, d, 1, r), paint(color));
const cylinder = (top: number, bottom: number, h: number, color: string, segments = 7) =>
  new Mesh(new CylinderGeometry(top, bottom, h, segments), paint(color));
const ball = (r: number, color: string, segments = 6) =>
  new Mesh(new SphereGeometry(r, segments, Math.ceil(segments * 0.7)), paint(color));
/** A limb hangs from its pivot, so posing it is one rotation at the joint. */
const limb = (length: number, top: number, bottom: number, color: string) => {
  const mesh = cylinder(top, bottom, length, color);
  mesh.geometry.translate(0, -length / 2, 0);
  return mesh;
};
const named = (name: string, ...children: Object3D[]) => {
  const group = new Group();
  group.name = name;
  group.add(...children);
  return group;
};

const KHAKI = '#6e6444';
const KHAKI_DARK = '#5d5539';
const HELMET = '#585a40';
const LEATHER = '#5a3a24';
const SKIN = '#d6ae88';
const WOOD = '#6a4126';
const IRON = '#34322d';

function leg(side: 'left' | 'right'): Group {
  const boot = at(ball(0.07, '#4a3020'), 0, -0.37, 0.035);
  boot.scale.set(1, 0.65, 1.6);
  const rings = [0, 1, 2, 3].map((k) =>
    at(cylinder(0.063, 0.063, 0.012, KHAKI_DARK), 0, -0.07 - k * 0.075, 0),
  );
  const shin = at(
    named(`shin_${side}`, limb(0.36, 0.062, 0.05, KHAKI), ...rings, boot),
    0,
    -0.32,
    0,
  );
  return at(
    named(`leg_${side}`, limb(0.32, 0.088, 0.07, KHAKI), shin),
    side === 'left' ? 0.09 : -0.09,
    0.74,
    0,
  );
}

function arm(side: 'left' | 'right'): Group {
  const forearm = at(
    named(`forearm_${side}`, limb(0.27, 0.05, 0.044, KHAKI), at(ball(0.044, SKIN), 0, -0.3, 0)),
    0,
    -0.3,
    0,
  );
  return at(
    named(`arm_${side}`, ball(0.065, KHAKI), limb(0.3, 0.06, 0.05, KHAKI), forearm),
    side === 'left' ? 0.215 : -0.215,
    1.39,
    0,
  );
}

function frenchSoldier(): Group {
  const coat = new Mesh(new CylinderGeometry(0.19, 0.21, 0.95, 12), paint(KHAKI));
  coat.scale.set(1.15, 1, 0.86);
  const belt = at(cylinder(0.172, 0.172, 0.05, LEATHER, 10), 0, 0.95, 0);
  belt.scale.set(1.15, 1, 0.88);
  const buttons = [-1, 1].flatMap((s) =>
    [0, 1, 2, 3].map((k) =>
      at(box(0.03, 0.03, 0.02, '#3f3a2a'), s * 0.065, 1.03 + k * 0.085, 0.163),
    ),
  );
  const straps = [-1, 1].map((s) => {
    const strap = at(box(0.035, 0.46, 0.015, LEATHER), s * 0.1, 1.17, 0.165);
    strap.rotation.z = s * 0.2;
    return strap;
  });
  const pouches = [-1, 1].map((s) =>
    at(rounded(0.085, 0.075, 0.055, 0.015, LEATHER), s * 0.085, 0.97, 0.16),
  );
  const roll = at(cylinder(0.05, 0.05, 0.36, KHAKI, 10), 0, 1.37, -0.17);
  roll.rotation.z = Math.PI / 2;
  const body = named(
    'body',
    at(coat, 0, 0.975, 0),
    belt,
    ...buttons,
    ...straps,
    ...pouches,
    at(rounded(0.3, 0.3, 0.14, 0.04, KHAKI_DARK), 0, 1.19, -0.17),
    roll,
    at(rounded(0.06, 0.17, 0.17, 0.03, '#8f8661'), -0.215, 0.84, 0.02),
    at(cylinder(0.052, 0.052, 0.14, '#4d4a3c', 12), 0.215, 0.82, -0.04),
    at(cylinder(0.075, 0.095, 0.075, KHAKI, 12), 0, 1.47, 0),
  );
  const dome = new Mesh(
    new SphereGeometry(0.118, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    paint(HELMET),
  );
  dome.scale.set(0.95, 0.88, 1.08);
  const brim = cylinder(0.15, 0.155, 0.014, HELMET, 14);
  brim.scale.set(0.8, 1, 1.28);
  const helmet = at(
    named('helmet', dome, brim, at(rounded(0.022, 0.04, 0.21, 0.01, HELMET), 0, 0.11, 0)),
    0,
    0.05,
    0,
  );
  helmet.rotation.x = -0.08;
  const skull = ball(0.1, SKIN, 9);
  skull.scale.set(0.9, 1.08, 0.95);
  const head = at(named('head', skull, helmet), 0, 1.58, 0);
  const rifle = named(
    'rifle',
    at(box(0.052, 0.3, 0.078, WOOD), 0, 0.15, 0),
    at(box(0.036, 0.51, 0.046, WOOD), 0, 0.555, 0.006),
    at(cylinder(0.013, 0.013, 0.53, IRON, 6), 0, 1.04, 0),
  );
  at(rifle, 0.25, 0.94, 0.3);
  return named('soldier', leg('left'), leg('right'), arm('left'), arm('right'), body, head, rifle);
}

export const frenchSquad = (): Group => squadOf(frenchSoldier);
