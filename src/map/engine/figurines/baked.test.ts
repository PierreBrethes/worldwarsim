import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Group,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { bakedFigurine } from './figurine';
import { JOINTS, squadOf, stride } from './infantry';

type Gltf = {
  nodes: ReadonlyArray<{
    name?: string;
    mesh?: number;
    children?: ReadonlyArray<number>;
    matrix?: number[];
    translation?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
  }>;
  scenes: ReadonlyArray<{ nodes: ReadonlyArray<number> }>;
  meshes: ReadonlyArray<{
    primitives: ReadonlyArray<{
      attributes: { POSITION: number };
      indices?: number;
      material?: number;
    }>;
  }>;
  accessors: ReadonlyArray<{
    bufferView: number;
    byteOffset?: number;
    count: number;
    componentType: number;
  }>;
  bufferViews: ReadonlyArray<{ byteOffset?: number; byteStride?: number }>;
};

/**
 * The file's node tree as the loader builds it — names, placements, one mesh per primitive
 * with its real positions, interleaved where the file interleaves them, as the loader does —
 * without three's loader, which wants a DOM for the textures.
 */
function sceneOfFile(url: string): Object3D {
  const bytes = readFileSync(join(process.cwd(), url));
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as Gltf;
  const bin = bytes.subarray(20 + jsonLength + 8);
  const read = (k: number): Float32Array | Uint16Array | Uint32Array => {
    const accessor = gltf.accessors[k]!;
    const at =
      (gltf.bufferViews[accessor.bufferView]!.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const buffer = bin.buffer.slice(bin.byteOffset + at);
    if (accessor.componentType === 5126) return new Float32Array(buffer, 0, accessor.count * 3);
    if (accessor.componentType === 5123) return new Uint16Array(buffer, 0, accessor.count);
    return new Uint32Array(buffer, 0, accessor.count);
  };
  const positionOf = (k: number): BufferAttribute | InterleavedBufferAttribute => {
    const accessor = gltf.accessors[k]!;
    const view = gltf.bufferViews[accessor.bufferView]!;
    if (view.byteStride === undefined) return new BufferAttribute(read(k), 3);
    const stride = view.byteStride / 4;
    const floats = new Float32Array(
      bin.buffer.slice(bin.byteOffset + (view.byteOffset ?? 0)),
      0,
      accessor.count * stride,
    );
    return new InterleavedBufferAttribute(
      new InterleavedBuffer(floats, stride),
      3,
      (accessor.byteOffset ?? 0) / 4,
    );
  };
  const materials = new Map<number, MeshStandardMaterial>();
  const materialOf = (k = -1) => {
    if (!materials.has(k)) materials.set(k, new MeshStandardMaterial());
    return materials.get(k)!;
  };
  const build = (k: number): Object3D => {
    const node = gltf.nodes[k]!;
    const primitives = node.mesh === undefined ? [] : gltf.meshes[node.mesh]!.primitives;
    const meshes = primitives.map((primitive) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', positionOf(primitive.attributes.POSITION));
      if (primitive.indices !== undefined)
        geometry.setIndex(new BufferAttribute(read(primitive.indices), 1));
      return new Mesh(geometry, materialOf(primitive.material));
    });
    const object = meshes.length === 1 ? meshes[0]! : new Group().add(...meshes);
    object.name = node.name ?? '';
    if (node.matrix)
      new Matrix4()
        .fromArray(node.matrix)
        .decompose(object.position, object.quaternion, object.scale);
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    for (const child of node.children ?? []) object.add(build(child));
    return object;
  };
  const scene = new Group();
  for (const k of gltf.scenes[0]!.nodes) scene.add(build(k));
  return scene;
}

const readByName = (name: string) =>
  (JOINTS as ReadonlyArray<string>).includes(name) ||
  name.startsWith('fx_') ||
  name.startsWith('prop');

const meshesOf = (object: Object3D) => {
  const meshes: Mesh[] = [];
  object.traverse((part) => (part as Mesh).isMesh && meshes.push(part as Mesh));
  return meshes;
};

/**
 * The volume swept from a far point to every face, signed by the side three draws: a face
 * turned inside out (a mirrored flag baked without flipping) moves it by far more than rounding.
 */
function sweptVolume(object: Object3D): number {
  const far = new Vector3(100, 37, -53);
  const [a, b, c] = [new Vector3(), new Vector3(), new Vector3()];
  let volume = 0;
  object.updateMatrixWorld(true);
  for (const mesh of meshesOf(object)) {
    const position = mesh.geometry.attributes.position!;
    const index = mesh.geometry.index;
    const corner = (k: number, into: Vector3) =>
      into
        .fromBufferAttribute(position, index ? index.getX(k) : k)
        .applyMatrix4(mesh.matrixWorld)
        .sub(far);
    const sign = Math.sign(mesh.matrixWorld.determinant());
    const count = index ? index.count : position.count;
    for (let k = 0; k + 2 < count; k += 3)
      volume += (sign * corner(k, a).dot(corner(k + 1, b).cross(corner(k + 2, c)))) / 6;
  }
  return volume;
}

const files = Object.entries(FIGURINE_FILES).flatMap(([nation, roles]) =>
  Object.entries(roles ?? {}).flatMap(([role, entry]) =>
    (typeof entry === 'string' ? [entry] : entry).flatMap((url) =>
      url === null ? [] : [[`${nation} ${role} ${url}`, role, url] as const],
    ),
  ),
);

describe.runIf(files.length > 0)('baked figurines', () => {
  it.each(files)('%s keeps every name the code reads, where it was', (_, role, url) => {
    const scene = sceneOfFile(url);
    const baked = bakedFigurine(scene);
    baked.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);

    scene.traverse((node) => {
      // A blade rides its hub: the spin finds the hub, never the blade.
      if (!readByName(node.name) || node.parent?.name.startsWith('prop')) return;
      const kept = baked.getObjectByName(node.name);
      expect(kept, node.name).toBeDefined();
      const was = node.getWorldPosition(new Vector3());
      expect(kept!.getWorldPosition(new Vector3()).distanceTo(was), node.name).toBeLessThan(1e-5);
    });

    const before = new Box3().setFromObject(scene, true);
    const after = new Box3().setFromObject(baked, true);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-4);
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-4);
    const triangles = (object: Object3D) =>
      meshesOf(object).reduce(
        (sum, { geometry }) => sum + (geometry.index ?? geometry.attributes.position!).count,
        0,
      );
    expect(triangles(baked)).toBe(triangles(scene));
    expect(sweptVolume(baked)).toBeCloseTo(sweptVolume(scene), 3);
    expect(meshesOf(baked).length).toBeLessThan(meshesOf(scene).length);

    if (role === 'infantry') {
      // A joint's pose replaces its own rotation: whatever turns above it (a leaning torso)
      // must still turn it once baked.
      const marchers = [scene, baked].map((made) =>
        squadOf([{ make: () => made.clone(true), marches: true }]),
      );
      for (const seconds of [0, 0.13]) {
        for (const squad of marchers) {
          stride(squad, seconds);
          squad.updateMatrixWorld(true);
        }
        for (const joint of JOINTS) {
          const [was, is] = marchers.map((squad) => squad.getObjectByName(joint));
          if (was === undefined) continue;
          const drift = was.matrixWorld.elements.map((value, k) =>
            Math.abs(value - is!.matrixWorld.elements[k]!),
          );
          expect(Math.max(...drift), `${joint} at ${seconds}s`).toBeLessThan(1e-5);
        }
      }

      const squad = squadOf([{ make: () => baked.clone(true), marches: true }]);
      const man = squad.children[0]!;
      for (const joint of JOINTS.filter((joint) => scene.getObjectByName(joint)))
        expect(man.getObjectByName(joint), joint).toBeDefined();
      expect(man.getObjectByName('leg_left')!.rotation.x).not.toBe(0);
    }
  });
});
