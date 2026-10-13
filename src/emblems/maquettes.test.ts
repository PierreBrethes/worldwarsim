import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BUILDING_MAQUETTES, buildingMaquette } from './buildings/manifest';
import { OBJECTIVE_MAQUETTES } from './objectives/manifest';

/** The heaviest drawn on 13/10 is the shipyard, at 3 156. */
const TRIANGLES = 3500;

type Node = {
  name?: string;
  mesh?: number;
  children?: ReadonlyArray<number>;
  matrix?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
};
type Gltf = {
  scene?: number;
  scenes: ReadonlyArray<{ nodes: ReadonlyArray<number> }>;
  nodes: ReadonlyArray<Node>;
  meshes: ReadonlyArray<{
    primitives: ReadonlyArray<{ indices?: number; attributes: { POSITION: number } }>;
  }>;
  accessors: ReadonlyArray<{ count: number; min?: number[]; max?: number[] }>;
};

function readGlb(url: string): Gltf {
  const bytes = readFileSync(join(process.cwd(), url));
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')) as Gltf;
}

/** The scene's bounds, node transforms applied to each primitive's own box. */
function boundsOf(gltf: Gltf): Box3 {
  const box = new Box3();
  const visit = (index: number, parent: Matrix4) => {
    const node = gltf.nodes[index]!;
    const local = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(
          new Vector3(...(node.translation ?? [0, 0, 0])),
          new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
          new Vector3(...(node.scale ?? [1, 1, 1])),
        );
    const world = parent.clone().multiply(local);
    for (const primitive of node.mesh === undefined ? [] : gltf.meshes[node.mesh]!.primitives) {
      const { min, max } = gltf.accessors[primitive.attributes.POSITION]!;
      for (const x of [min![0]!, max![0]!])
        for (const y of [min![1]!, max![1]!])
          for (const z of [min![2]!, max![2]!])
            box.expandByPoint(new Vector3(x, y, z).applyMatrix4(world));
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0]!.nodes) visit(root, new Matrix4());
  return box;
}

const files = [
  ...new Set([
    ...Object.values(BUILDING_MAQUETTES),
    buildingMaquette('mine', 'coal'),
    ...Object.values(OBJECTIVE_MAQUETTES),
  ]),
].flatMap((url) => (url === null ? [] : [url]));

describe('maquettes', () => {
  it.each(files)('%s keeps to the brief', (url) => {
    const gltf = readGlb(url);
    const triangles = gltf.meshes
      .flatMap((mesh) => mesh.primitives)
      .reduce((sum, p) => sum + gltf.accessors[p.indices ?? p.attributes.POSITION]!.count / 3, 0);
    expect(triangles).toBeLessThanOrEqual(TRIANGLES);
    // Y up, origin on the ground and inside the footprint: the point stands under the building.
    const { min, max } = boundsOf(gltf);
    expect(Math.abs(min.y)).toBeLessThan(0.02);
    expect(max.y).toBeGreaterThan(0.5);
    expect(min.x < 0 && max.x > 0 && min.z < 0 && max.z > 0).toBe(true);
  });
});
