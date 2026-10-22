import {
  CircleGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Nation, UnitRole } from '@/domain/ids';
import { isNation } from '@/domain/nations';
import { type UnitTier } from '@/domain/troops';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { REGIONS_FULL_DISTANCE, REGIONS_GONE_DISTANCE } from '../regions';
import { mergedByMaterial } from '../baking';
import { JOINTS, squadOf } from './infantry';

/**
 * Model units to board units. The brief sizes a tank at 2.6, so it stands about two thirds of
 * a board unit long: a piece among the regions and the masts, not a monument over them — at
 * 0.4 a squad stood taller than a département at the closest zoom. `@a-mesurer` on the board.
 */
export const FIGURINE_SCALE = 0.26;

let nearFloor = 0;
/**
 * The camera-to-target distance, set once a frame: a tilted far view puts the bottom of the
 * screen much nearer the camera than the target, and the regions, shadows and seas all fade on
 * the target distance — so must the pieces, or giants stand on a world map.
 */
export function setNearFloor(distance: number): void {
  nearFloor = distance;
}

/**
 * **How much figurine, rather than plate, a pawn wears at this camera distance**: 1 at the
 * country level and closer, 0 beyond the region fade, eased between. One distance says « we
 * are down at the country » for both layers (ADR 0026 §3).
 */
export function nearWeight(distance: number): number {
  const t =
    (REGIONS_GONE_DISTANCE - Math.max(distance, nearFloor)) /
    (REGIONS_GONE_DISTANCE - REGIONS_FULL_DISTANCE);
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

export type Figurine = {
  /** Origin on the ground at the pawn's point, front towards +z, already at board scale. */
  readonly object: Group;
  /** Settles once every sculpted file has landed in `object` — a piece that stands still asks
   *  for its frame then, where a flowing pawn would just show it. Rejects when a file fails. */
  readonly ready: Promise<void>;
  /** Turns whatever spins on the model (`prop*`), and nothing else. */
  spin(elapsedSeconds: number): void;
  /** Turns its back to the eye rather than its front to the road: an enemy block (ADR 0026 §4). */
  readonly facesEye?: boolean;
};

const loader = new GLTFLoader();
const scenes = new Map<string, Promise<Object3D>>();
/** One load per file, shared by every figurine and maquette drawn from it. */
export function sceneOf(url: string): Promise<Object3D> {
  let scene = scenes.get(url);
  if (!scene) {
    scene = loader.loadAsync(url).then((gltf) => gltf.scene);
    scenes.set(url, scene);
  }
  return scene;
}

const MOVING = new Set<string>(JOINTS);

/** What the code turns, poses or hangs on by name: a joint, a hub, a marker (`fx_smoke`…). */
function movesOnItsOwn(node: Object3D): boolean {
  if (MOVING.has(node.name) || node.name.startsWith('fx_')) return true;
  return node.name.startsWith('prop') && !node.parent?.name.startsWith('prop');
}

/**
 * **A figurine drawn in a handful of calls**: the meshes under each part that moves on its own
 * merged per material, and every other node gone. A soldier is some sixty meshes, one draw
 * call each and as many again for the lamp's shadow; his joints keep their names, their pivot
 * and what hangs from them, so `squadOf` poses him and `spin` turns his propellers as before.
 */
export function bakedFigurine(scene: Object3D): Group {
  scene.updateMatrixWorld(true);
  const root = new Group();
  root.name = scene.name;
  const pivots = new Map<Object3D, { group: Group; meshes: Mesh[] }>([
    [scene, { group: root, meshes: [] }],
  ]);
  const pivotOf = (node: Object3D): Object3D => {
    let at = node;
    while (!pivots.has(at)) at = at.parent!;
    return at;
  };
  scene.traverse((node) => {
    if (node === scene) return;
    if (movesOnItsOwn(node)) {
      const above = pivotOf(node.parent!);
      // A pose replaces the joint's own rotation: what turned above it and is merged away (a
      // leaning torso) rides on a carrier, or the arms would swing square to the hips.
      let holder = pivots.get(above)!.group;
      if (node.parent !== above) {
        const carrier = new Group();
        new Matrix4()
          .copy(above.matrixWorld)
          .invert()
          .multiply(node.parent!.matrixWorld)
          .decompose(carrier.position, carrier.quaternion, carrier.scale);
        holder.add(carrier);
        holder = carrier;
      }
      const group = new Group();
      group.name = node.name;
      group.position.copy(node.position);
      group.quaternion.copy(node.quaternion);
      group.scale.copy(node.scale);
      holder.add(group);
      pivots.set(node, { group, meshes: [] });
    }
    if ((node as Mesh).isMesh) pivots.get(pivotOf(node))!.meshes.push(node as Mesh);
  });
  for (const [node, { group, meshes }] of pivots)
    for (const { geometry, material } of mergedByMaterial(
      meshes,
      new Matrix4().copy(node.matrixWorld).invert(),
    ))
      group.add(new Mesh(geometry, material));
  return root;
}

const baked = new Map<string, Promise<Group>>();
/** Baked once per file, cloned per figurine: the clones share its geometry and materials. */
function bakedOf(url: string): Promise<Group> {
  let figurine = baked.get(url);
  if (!figurine) {
    figurine = sceneOf(url).then(bakedFigurine);
    baked.set(url, figurine);
  }
  return figurine;
}

function fileOf(nation: Nation, role: UnitRole, tier: UnitTier): string | null {
  const entry = FIGURINE_FILES[nation]?.[role];
  if (entry === undefined) return null;
  return typeof entry === 'string' ? entry : (entry[tier - 1] ?? null);
}

/**
 * **A group's figurine for a nation, or `null` when there is none** — the caller keeps its plate
 * or silhouette, as it does for a missing plate. `marks` are the figures that stand, front first
 * (`pilePieces`): one man each for infantry, the first mark's model for any other role. One
 * mark without a file and the whole answer is `null` — no figurine rather than the wrong one.
 * Files load in the background; `ready` says when they have landed. Geometry and materials are shared between figurines of the same
 * file: nothing here is the caller's to dispose.
 */
export function figurineFor(
  nation: string | null,
  role: UnitRole,
  marks: ReadonlyArray<UnitTier>,
): Figurine | null {
  if (nation === null || !isNation(nation) || marks.length === 0) return null;
  const files = (role === 'infantry' ? marks : marks.slice(0, 1)).map((tier) =>
    fileOf(nation, role, tier),
  );
  if (files.some((file) => file === null)) return null;

  const object = new Group();
  const model = new Group();
  model.scale.setScalar(FIGURINE_SCALE);
  object.add(model);

  const ready = Promise.all(files.map((file) => bakedOf(file!))).then(
    (scenes) => {
      const makers = scenes.map((scene, k) => ({
        make: () => scene.clone(true),
        marches: marks[k] === 1,
      }));
      model.add(role === 'infantry' ? squadOf(makers) : makers[0]!.make());
    },
    (error: unknown) => {
      console.error(`figurine ${nation}/${role}`, error);
      throw error;
    },
  );
  // A moving pawn never waits on `ready`: its failure is logged above, not left unhandled.
  ready.catch(() => undefined);

  const spinning: Object3D[] = [];
  return {
    object,
    ready,
    spin(elapsedSeconds) {
      // Only the hub turns: its blades and cone ride along, and turning them too would twist
      // each on its own axis.
      if (spinning.length === 0)
        model.traverse(
          (part) =>
            part.name.startsWith('prop') &&
            !part.parent?.name.startsWith('prop') &&
            spinning.push(part),
        );
      for (const part of spinning) part.rotation.z += elapsedSeconds * 40;
    },
  };
}

/**
 * The lamp's shadow falls aside (`lamp.ts`); what sets the piece down right under its feet is
 * this soft disc, the prototype's (`carte-refonte`): darkest at the centre, nothing at the rim.
 * The fall is in the vertices' alpha, so it builds without a canvas.
 */
const SHADOW_RADIUS = 0.48;
const SHADOW_CORE = 0.62;
const SHADOW_MATERIAL = new MeshBasicMaterial({
  color: '#1a120a',
  vertexColors: true,
  transparent: true,
  depthWrite: false,
});
const SHADOW_DISC = new CircleGeometry(SHADOW_RADIUS, 24);
// The circle's first vertex is its centre.
SHADOW_DISC.setAttribute(
  'color',
  new Float32BufferAttribute(
    Array.from({ length: SHADOW_DISC.getAttribute('position').count }, (_, k) => [
      1,
      1,
      1,
      k === 0 ? SHADOW_CORE : 0,
    ]).flat(),
    4,
  ),
);
/** The name a carried copy finds its figurines' discs by: lifted, a disc would read as a base. */
export const CONTACT = 'contact';

export function contactShadow(): Group {
  const shadow = new Group();
  shadow.name = CONTACT;
  const disc = new Mesh(SHADOW_DISC, SHADOW_MATERIAL);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.004;
  disc.userData.ground = true;
  shadow.add(disc);
  return shadow;
}
