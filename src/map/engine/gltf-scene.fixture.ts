import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
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

/** Test helpers: a `.glb` read from disk as the loader would build it, and its measures. */

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
  materials?: ReadonlyArray<{ name?: string }>;
};

/**
 * The file's node tree as the loader builds it — names, placements, one mesh per primitive
 * with its real positions, interleaved where the file interleaves them, as the loader does —
 * without three's loader, which wants a DOM for the textures.
 */
export function sceneOfFile(url: string): Object3D {
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
    if (!materials.has(k))
      materials.set(k, new MeshStandardMaterial({ name: gltf.materials?.[k]?.name ?? '' }));
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

export const meshesOf = (object: Object3D) => {
  const meshes: Mesh[] = [];
  object.traverse((part) => (part as Mesh).isMesh && meshes.push(part as Mesh));
  return meshes;
};

/**
 * The volume swept from a far point to every face, signed by the side three draws: a face
 * turned inside out (a mirrored flag baked without flipping) moves it by far more than rounding.
 */
export function sweptVolume(object: Object3D): number {
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
