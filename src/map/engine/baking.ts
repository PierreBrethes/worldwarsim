import { type BufferGeometry, type Material, Matrix4, type Mesh, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Part = { readonly geometry: BufferGeometry; readonly material: Material };

/**
 * **A sculpted scene flattened into one geometry per material**, every node's placement baked
 * in: a shipyard has some 270 meshes, and drawn one by one per exemplar it would cost as many
 * draw calls. Meshes whose attributes do not match stay apart.
 */
export function bakedParts(scene: Object3D): Part[] {
  scene.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  scene.traverse((object) => {
    if ((object as Mesh).isMesh) meshes.push(object as Mesh);
  });
  return mergedByMaterial(meshes, new Matrix4());
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
  for (const attribute of Object.values(geometry.attributes)) {
    const size = attribute.itemSize;
    const array = attribute.array;
    for (let k = 0; k + 2 < attribute.count; k += 3)
      for (let c = 0; c < size; c++) {
        const second = array[(k + 1) * size + c]!;
        array[(k + 1) * size + c] = array[(k + 2) * size + c]!;
        array[(k + 2) * size + c] = second;
      }
  }
}
