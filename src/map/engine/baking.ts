import {
  type BufferGeometry,
  Group,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Part = { readonly geometry: BufferGeometry; readonly material: Material };

/**
 * **The diorama round a building** (ADR 0038 §1-§5, §7): what stays whole while the building
 * alone is cut by its works, by what each does at a distance — the socle and its liseré stand to
 * the pin, the yard shrinks with the building, the sign grows on its foot. The rest of the scene
 * is the building.
 */
const DRESSING: Readonly<Record<string, 'dressing' | 'yard' | 'sign'>> = {
  socle: 'dressing',
  lisere: 'dressing',
  cour: 'yard',
  signe: 'sign',
};

/** **The accessory groups of the yard** (ADR 0038 §5), baked apart: the engine shows them by
 *  level and state (`accessoriesShown`). */
const ACCESSORIES = new Set(['niveau_1', 'niveau_2', 'niveau_3', 'chantier', 'ruines']);

/** Which work a site is at: a plan in the queue, a first level rising, a level raised. */
export type WorkPhase = 'queued' | 'rising' | 'raising';

/**
 * **The accessory groups a site shows** (ADR 0038 §5): `niveau_1`, then one more per level up to
 * three — the HQ goes beyond, the groups do not. A first rise adds `chantier` to `niveau_1`; a
 * raise adds it to the groups of the level it stands at (`level`); a plan in the queue has
 * none, only its dashed outline. A site known from a survey is served as level 1.
 */
export function accessoriesShown(level: number, phase: WorkPhase | undefined): string[] {
  if (phase === 'queued') return [];
  const stood = phase === 'rising' ? 1 : Math.min(3, Math.max(1, level));
  const levels = [1, 2, 3].filter((each) => each <= stood).map((each) => `niveau_${each}`);
  return phase === undefined ? levels : [...levels, 'chantier'];
}

/** The accessories of a later level or state: `bakedSite` bakes them apart, the engine shows them. */
const LATER = new Set(['niveau_2', 'niveau_3', 'chantier', 'ruines']);

/** Whether a scene stands on a socle (ADR 0038): only then do its diorama's names mean one — a
 *  port has a slip named `chantier` of its own. */
const onSocle = (scene: Object3D): boolean => scene.getObjectByName('socle') !== undefined;

/**
 * **What no bake of `scene` draws**: the flag, painted by its owner's colours later (#279) —
 * until then a white one would read as a surrender —, and on a socle the accessories of a later
 * level or state. The rigs read it, so that a copy stood in for a resting maquette has neither
 * (`standIn` puts the levels back).
 */
export function drawnIn(scene: Object3D): (node: Object3D) => boolean {
  const later = onSocle(scene) ? LATER : new Set<string>();
  return (node) => flagless(node) && !later.has(node.name);
}

/** The flag is painted by its owner's colours later (#279): no bake draws it. */
const flagless = (node: Object3D): boolean => node.name !== 'drapeau';

/**
 * **A sculpted scene flattened into one geometry per material**, every node's placement baked
 * in: a shipyard has some 270 meshes, and drawn one by one per exemplar it would cost as many
 * draw calls. Meshes whose attributes do not match stay apart. A site is baked apart in what the
 * distance draws apart (ADR 0038 §7): its building; the socle and liseré it stands on; its yard;
 * its sign, with its foot — the `signe` node's place — and its height over it, in the scene's
 * units; and each accessory group, for the engine to show by level and state. A model without a
 * socle is all building.
 */
export function bakedSite(scene: Object3D): {
  building: Part[];
  dressing: Part[];
  yard: Part[];
  sign: { parts: Part[]; foot: Vector3; height: number } | null;
  accessories: Map<string, Part[]>;
} {
  scene.updateMatrixWorld(true);
  const kinds = {
    building: [] as Mesh[],
    dressing: [] as Mesh[],
    yard: [] as Mesh[],
    sign: [] as Mesh[],
  };
  const accessories = new Map<string, Mesh[]>();
  const socle = onSocle(scene);
  const visit = (node: Object3D, kind: keyof typeof kinds, accessory: string | null) => {
    if (!flagless(node)) return;
    const group = accessory ?? (socle && ACCESSORIES.has(node.name) ? node.name : null);
    const here = kind === 'building' && socle ? (DRESSING[node.name] ?? kind) : kind;
    if ((node as Mesh).isMesh) {
      if (group !== null) accessories.set(group, [...(accessories.get(group) ?? []), node as Mesh]);
      else kinds[here].push(node as Mesh);
    }
    for (const child of node.children) visit(child, here, group);
  };
  visit(scene, 'building', null);
  const merged = (meshes: Mesh[]) => mergedByMaterial(meshes, new Matrix4());
  const signNode = socle ? scene.getObjectByName('signe') : undefined;
  const signParts = merged(kinds.sign);
  const top = Math.max(
    ...signParts.map(({ geometry }) => {
      geometry.computeBoundingBox();
      return geometry.boundingBox!.max.y;
    }),
  );
  const foot = signNode?.getWorldPosition(new Vector3());
  const sign =
    foot === undefined || signParts.length === 0
      ? null
      : { parts: signParts, foot, height: top - foot.y };
  return {
    building: merged(kinds.building),
    dressing: merged(kinds.dressing),
    yard: merged(kinds.yard),
    sign,
    accessories: new Map([...accessories].map(([name, meshes]) => [name, merged(meshes)])),
  };
}

/** Pre-order walk that does not enter what is not `drawn`. */
function walk(
  node: Object3D,
  drawn: (node: Object3D) => boolean,
  visit: (node: Object3D) => void,
): void {
  if (!drawn(node)) return;
  visit(node);
  for (const child of node.children) walk(child, drawn, visit);
}

/**
 * **A scene baked around the nodes that move** (ADR 0036 §1): each node `keeps` retains keeps
 * its name, its pivot and what hangs from it; the meshes under it merge per material; every
 * other node is gone. At rest it draws exactly what `bakedSite` does. A pose replaces a kept
 * node's own rotation: what turned above it and is merged away (a leaning torso) rides on a
 * carrier, or an arm would swing square to the hips.
 */
export function bakedRig(scene: Object3D, keeps: (node: Object3D) => boolean): Group {
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
  walk(scene, drawnIn(scene), (node) => {
    if (node === scene) return;
    if (keeps(node)) {
      const above = pivotOf(node.parent!);
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

/** `meshes` merged per material, placed in the frame `fromWorld` brings the world into. */
export function mergedByMaterial(meshes: ReadonlyArray<Mesh>, fromWorld: Matrix4): Part[] {
  const groups = new Map<string, { material: Material; geometries: BufferGeometry[] }>();
  for (const mesh of meshes) {
    // glTF gives one material per primitive, and the loader one mesh per primitive: an array
    // here is a file that broke the brief, and it keeps its plates rather than half its walls.
    if (Array.isArray(mesh.material)) throw new Error(`${mesh.name}: several materials`);
    const placement = new Matrix4().multiplyMatrices(fromWorld, mesh.matrixWorld);
    const geometry = mesh.geometry.clone().applyMatrix4(placement);
    // A mirrored node (a flag's right half) is turned inside out once baked: three flips the
    // face order of a mirrored mesh, and the merged one no longer knows it was.
    if (placement.determinant() < 0) reverseWinding(geometry);
    const key = [
      mesh.material.uuid,
      geometry.index === null,
      ...Object.keys(geometry.attributes).sort(),
    ].join();
    const group = groups.get(key) ?? { material: mesh.material, geometries: [] };
    group.geometries.push(geometry);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap(({ material, geometries }) => {
    const merged = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries);
    return merged === null
      ? geometries.map((geometry) => ({ geometry, material }))
      : [{ geometry: merged, material }];
  });
}

function reverseWinding(geometry: BufferGeometry): void {
  const index = geometry.index;
  if (index !== null) {
    for (let k = 0; k + 2 < index.count; k += 3) {
      const second = index.getX(k + 1);
      index.setX(k + 1, index.getX(k + 2));
      index.setX(k + 2, second);
    }
    return;
  }
  // The loader interleaves a primitive's attributes (stride 32): `array` is then the whole
  // buffer, so the components go through the attribute.
  for (const attribute of Object.values(geometry.attributes))
    for (let k = 0; k + 2 < attribute.count; k += 3)
      for (let c = 0; c < attribute.itemSize; c++) {
        const second = attribute.getComponent(k + 1, c);
        attribute.setComponent(k + 1, c, attribute.getComponent(k + 2, c));
        attribute.setComponent(k + 2, c, second);
      }
}
