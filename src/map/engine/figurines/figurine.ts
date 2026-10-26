import {
  Box3,
  CircleGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Nation, UnitRole } from '@/domain/ids';
import { isNation } from '@/domain/nations';
import { troopSpan } from '@/domain/piece-size';
import { type UnitTier } from '@/domain/troops';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { REGIONS_FULL_DISTANCE, REGIONS_GONE_DISTANCE } from '../regions';
import { bakedRig } from '../baking';
import { pieceScale } from '../piece-scale';
import { JOINTS, squadOf } from './infantry';

/**
 * **The piece length the sizes drawn around a piece were tuned for** — a formation's spacing, an
 * altitude disc, a wake, a replay's stage: a tank, 2.6 model units at the former 0.26 a unit.
 * A piece at the common scale (ADR 0035) carries them at its span over this.
 */
export const LAID_OUT_FOR = 0.68;

/** **What has no role of its own** — an enemy block, an annotation, a crate — is measured as a
 *  tank: the same for every enemy, so its size says nothing of what it is. */
export const ANONYMOUS_SPAN = troopSpan('armor');

/** **A tank's real span against the one the sizes around it were drawn for**: what a length
 *  tuned for the former figurines is multiplied by at the common scale. */
export const TANK_SHARE = ANONYMOUS_SPAN / LAID_OUT_FOR;

/** Model units to board units for what has no role: the brief's tank is 2.6 long. */
export const FIGURINE_SCALE = ANONYMOUS_SPAN / 2.6;

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
  return eased(
    (REGIONS_GONE_DISTANCE - Math.max(distance, nearFloor)) /
      (REGIONS_GONE_DISTANCE - REGIONS_FULL_DISTANCE),
  );
}

const eased = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/** **Under this size on screen, in CSS pixels, a piece gives way to its pin** (ADR 0035 §3); a
 *  pixel reads rounded, so a piece of 19.5 px still stands. `@a-mesurer` */
const PIN_PX = 20;
/** The share of its size over which a piece shrinks into its pin, below `PIN_PX`. `@a-mesurer` */
const PIN_FADE = 0.15;
/** **Sizes on screen are read on a window 900 px tall** (`CAMERA_FOV` of 42°): a short window —
 *  a laptop, a phone between its bars — pins its pieces at the same distances as the others. */
export const REFERENCE_PX_PER_UNIT = 900 / (2 * Math.tan((21 * Math.PI) / 180));

/**
 * **How much of a piece stands, rather than its pin, by its size on screen** (ADR 0035 §3): 1
 * while its `span` — board units, at the common scale — reads at `PIN_PX`, eased to 0 a little
 * below. A man reads under it from d ≈ 3, a tank from 7 — both held by their floor until d ≈ 30
 * (`troopWeight`) —, a barracks from 58, a hangar from 70 — the
 * fighter from 13, the carrier from 145.
 */
export function pieceWeight(distance: number, span: number): number {
  const whole = PIN_PX - 0.5;
  return eased((pxOf(distance, span) - whole * (1 - PIN_FADE)) / (whole * PIN_FADE));
}

const pxOf = (distance: number, span: number): number =>
  (span * pieceScale.size * REFERENCE_PX_PER_UNIT) / Math.max(distance, nearFloor);

/** **A troop holds its floor until here** (ADR 0035 §10), at 100 %: further at a larger size,
 *  nearer at a smaller. `@a-mesurer` */
const FLOOR_UNTIL = 30;
/** What reads at the pin's size at `FLOOR_UNTIL`. */
const FLOOR_SPAN = ((PIN_PX - 0.5) * FLOOR_UNTIL) / REFERENCE_PX_PER_UNIT;

/** **The span a troop gives way to its pin by** (ADR 0035 §10): its own, or the floor's — a man
 *  as late as a tank, a hull later. */
export const troopPinSpan = (span: number): number => Math.max(span, FLOOR_SPAN);

/** **How much of a troop stands, rather than its pin**: `pieceWeight` by its floor. */
export const troopWeight = (distance: number, span: number): number =>
  pieceWeight(distance, troopPinSpan(span));

/**
 * **How much larger than its span a troop is drawn** (the figurine floor, ADR 0035 §10): enough
 * never to read under `PIN_PX`, 1 while it reads larger. Between d ≈ 5 and 30 a troop grows
 * against its building; up close the two stay bound.
 */
export function floorGrowth(distance: number, span: number): number {
  // Read rounded like the pin's threshold: a man of 19.8 px at the closest zoom keeps his size.
  return Math.max(1, (PIN_PX - 0.5) / pxOf(distance, span));
}

/** **The scale a troop is drawn at**, its span at 1: its weight, its floor and the player's size;
 *  0 once it is its pin. */
export const troopScale = (distance: number, span: number): number =>
  troopWeight(distance, span) * floorGrowth(distance, span) * pieceScale.size;

export type Figurine = {
  /** Origin on the ground at the pawn's point, front towards +z, already at board scale. */
  readonly object: Group;
  /** Its role's measure on the board (`troopSpan`): what it is laid out and pinned by. */
  readonly span: number;
  /** Settles once every sculpted file has landed in `object` — a piece that stands still asks
   *  for its frame then, where a flowing pawn would just show it. Rejects when a file fails. */
  readonly ready: Promise<void>;
  /** The file of its model, what a sequence cooks its copy from; absent for a squad (several
   *  files, none articulated) and for what is not a role's model (a block, an annotation). */
  readonly url?: string;
  /** A copy takes the place of the model it is drawn with, until `null` gives it back
   *  (ADR 0036 §5). Asked before `ready`, it takes its place when the model lands. */
  standIn?(copy: Object3D | null): void;
  /** A clone of the model as drawn — the whole squad — once it has landed: the copy of a
   *  sequence that moves the piece whole. */
  copy?(): Object3D | null;
  /** What wears on the model — a plume on its `fx_smoke`, a charred hull — is put by `fn` on the
   *  model drawn once it lands (`origin`), and on every copy that stands in for it. The plume's
   *  own parent follows the copy, whatever `fn` does (`standIn`). */
  dress?(fn: (model: Object3D, origin: boolean) => void): void;
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
export function movesOnItsOwn(node: Object3D): boolean {
  if (MOVING.has(node.name) || node.name.startsWith('fx_')) return true;
  return node.name.startsWith('prop') && !node.parent?.name.startsWith('prop');
}

/**
 * **A figurine drawn in a handful of calls**: the meshes under each part that moves on its own
 * merged per material, and every other node gone. A soldier is some sixty meshes, one draw
 * call each and as many again for the lamp's shadow; his joints keep their names, their pivot
 * and what hangs from them, so `squadOf` poses him and `spin` turns his propellers as before.
 */
export const bakedFigurine = (scene: Object3D): Group => bakedRig(scene, movesOnItsOwn);

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
  object.add(model);
  // Its first mark's model: a French pile of tanks led by an R35 is measured at 4 m.
  const span = troopSpan(role, nation, marks[0]);

  /** The clone a lone model is drawn with, kept to be set back where a copy stood in. */
  let drawn: Object3D | null = null;
  let standing: Object3D | null = null;
  const dressers: Array<(model: Object3D, origin: boolean) => void> = [];
  const spinning: Object3D[] = [];
  const markers = (root: Object3D): Map<string, Object3D> => {
    const found = new Map<string, Object3D>();
    root.traverse((part) => part.name.startsWith('fx_') && found.set(part.name, part));
    return found;
  };
  /** What hangs on a marker (smoke) goes to the marker of the same name on the other model. */
  const carry = (from: Object3D, to: Object3D): void => {
    const into = markers(to);
    for (const [name, marker] of markers(from))
      for (const hung of [...marker.children]) into.get(name)?.add(hung);
  };
  const standIn = (copy: Object3D | null): void => {
    if (standing !== null && drawn !== null) carry(standing, drawn);
    standing?.removeFromParent();
    standing = copy;
    spinning.length = 0;
    if (drawn === null) return;
    if (copy === null) model.add(drawn);
    else {
      for (const fn of dressers) fn(copy, false);
      carry(drawn, copy);
      drawn.removeFromParent();
      model.add(copy);
    }
  };
  const ready = Promise.all(files.map((file) => bakedOf(file!))).then(
    (scenes) => {
      const makers = scenes.map((scene, k) => ({
        make: () => scene.clone(true),
        marches: marks[k] === 1,
      }));
      // Each model brought to its role's real size, whatever it was sculpted at.
      model.scale.setScalar(span / measureOf(scenes[0]!, role));
      drawn = role === 'infantry' ? squadOf(makers) : makers[0]!.make();
      model.add(drawn);
      for (const fn of dressers) fn(drawn, true);
      // A copy asked for while the file was loading takes its place now.
      if (standing !== null) standIn(standing);
    },
    (error: unknown) => {
      console.error(`figurine ${nation}/${role}`, error);
      throw error;
    },
  );
  // A moving pawn never waits on `ready`: its failure is logged above, not left unhandled.
  ready.catch(() => undefined);

  return {
    object,
    span,
    ready,
    ...(role === 'infantry' ? {} : { url: files[0]! }),
    standIn,
    copy: () => {
      const copy = drawn?.clone(true) ?? null;
      // What hangs on a marker (a plume) is carried over by `standIn`, not cloned twice.
      if (copy !== null) for (const marker of markers(copy).values()) marker.clear();
      return copy;
    },
    dress(fn) {
      dressers.push(fn);
      if (drawn !== null) fn(drawn, true);
      if (standing !== null) fn(standing, false);
    },
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

/** **A model's measure in its own units**: a man's height, the widest side at the ground of the rest. */
function measureOf(scene: Object3D, role: UnitRole): number {
  const size = new Box3().setFromObject(scene).getSize(new Vector3());
  return role === 'infantry' ? size.y : Math.max(size.x, size.z);
}

/**
 * A piece on the ground casts only the lamp's shadow (`lamp.ts`): a disc under its feet read as a
 * round base (#232). This soft disc, the prototype's (`carte-refonte`), is for what is lifted — a
 * plane or a carried pile — whose gap to its shadow says its height: darkest at the centre,
 * nothing at the rim. The fall is in the vertices' alpha, so it builds without a canvas.
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
/** The name a carried copy finds its planes' discs by: the copy has its own, under the whole pile. */
const ALTITUDE = 'altitude';

export function altitudeShadow(): Group {
  const shadow = new Group();
  shadow.name = ALTITUDE;
  const disc = new Mesh(SHADOW_DISC, SHADOW_MATERIAL);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.004;
  disc.userData.ground = true;
  shadow.add(disc);
  return shadow;
}

/** A lifted pile already has its own disc: the ones of the planes aloft in it would be a second. */
export function hideAltitudeShadows(root: Group): void {
  for (const disc of root.getObjectsByProperty('name', ALTITUDE)) disc.visible = false;
}
