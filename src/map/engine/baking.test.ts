import {
  BoxGeometry,
  BufferGeometry,
  Box3,
  Group,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';

import { RIG_PARTS } from '@/emblems/rigs';
import { bakedParts, bakedRig } from './baking';
import { meshesOf, sceneOfFile, sweptVolume } from './gltf-scene.fixture';

describe('bakedParts', () => {
  it('merges the meshes of one material into one part, their placement baked in', () => {
    const stone = new MeshStandardMaterial();
    const slate = new MeshStandardMaterial();
    const scene = new Group();
    const wall = new Mesh(new BoxGeometry(1, 1, 1), stone);
    wall.position.set(2, 0, 0);
    const tower = new Mesh(new BoxGeometry(1, 1, 1), stone);
    tower.position.set(0, 3, 0);
    const roof = new Mesh(new BoxGeometry(1, 1, 1), slate);
    scene.add(wall, tower, roof);

    const parts = bakedParts(scene);
    expect(parts.map((part) => part.material)).toEqual([stone, slate]);
    const walls = parts[0]!.geometry;
    walls.computeBoundingBox();
    expect(walls.boundingBox!.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
    expect(walls.boundingBox!.max.toArray()).toEqual([2.5, 3.5, 0.5]);
  });

  it('bakes a rotated parent too', () => {
    const scene = new Group();
    scene.quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2));
    const mesh = new Mesh(new BoxGeometry(2, 1, 1), new MeshStandardMaterial());
    scene.add(mesh);
    const [part] = bakedParts(scene);
    part!.geometry.computeBoundingBox();
    const size = part!.geometry.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeCloseTo(1);
    expect(size.z).toBeCloseTo(2);
  });

  it('turns a mirrored mesh right side out, as three draws it unbaked', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const mesh = new Mesh(geometry, new MeshStandardMaterial());
    mesh.scale.set(-1, 1, 1);
    const scene = new Group().add(mesh);
    const [part] = bakedParts(scene);
    const index = part!.geometry.index!;
    expect([index.getX(0), index.getX(1), index.getX(2)]).toEqual([
      geometry.index!.getX(0),
      geometry.index!.getX(2),
      geometry.index!.getX(1),
    ]);
  });

  it('turns an interleaved mirrored mesh right side out, as the loader hands it', () => {
    // Position, normal, uv: eight floats a vertex, one buffer — `flag_right` as it loads.
    const buffer = new InterleavedBuffer(
      new Float32Array([0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1]),
      8,
    );
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute('normal', new InterleavedBufferAttribute(buffer, 3, 3));
    geometry.setAttribute('uv', new InterleavedBufferAttribute(buffer, 2, 6));
    const mesh = new Mesh(geometry, new MeshStandardMaterial());
    mesh.scale.set(-1, 1, 1);
    const [part] = bakedParts(new Group().add(mesh));
    const { position, normal, uv } = part!.geometry.attributes;
    expect([0, 1, 2].map((k) => [position!.getX(k) + 0, position!.getY(k)])).toEqual([
      [0, 0],
      [0, 1],
      [-1, 0],
    ]);
    for (const k of [0, 1, 2]) expect([normal!.getX(k) + 0, normal!.getZ(k)]).toEqual([0, 1]);
    expect([0, 1, 2].map((k) => [uv!.getX(k), uv!.getY(k)])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
  });
});

describe('bakedRig', () => {
  const barracks = () => sceneOfFile('src/emblems/buildings/barracks.glb');
  const keeping = (names: ReadonlyArray<string>) => (node: { name: string }) =>
    names.includes(node.name);
  const triangles = (object: Parameters<typeof meshesOf>[0]) =>
    meshesOf(object).reduce(
      (sum, { geometry }) => sum + (geometry.index ?? geometry.attributes.position!).count,
      0,
    );
  const drawn = (scene: Parameters<typeof bakedRig>[0]) => {
    const group = new Group();
    for (const { geometry, material } of bakedParts(scene)) group.add(new Mesh(geometry, material));
    return group;
  };

  it('draws at rest what bakedParts draws: same box, triangles and oriented volume', () => {
    const rig = bakedRig(barracks(), keeping(RIG_PARTS.barracks));
    const rest = drawn(barracks());
    rig.updateMatrixWorld(true);
    const [a, b] = [rig, rest].map((made) => new Box3().setFromObject(made, true));
    expect(a!.min.distanceTo(b!.min)).toBeLessThan(1e-4);
    expect(a!.max.distanceTo(b!.max)).toBeLessThan(1e-4);
    expect(triangles(rig)).toBe(triangles(rest));
    expect(sweptVolume(rig)).toBeCloseTo(sweptVolume(rest), 3);
  });

  it('keeps each rig part by name, at its pivot, and leaves no flag', () => {
    const scene = barracks();
    scene.updateMatrixWorld(true);
    const rig = bakedRig(scene, keeping(RIG_PARTS.barracks));
    rig.updateMatrixWorld(true);
    for (const name of RIG_PARTS.barracks) {
      const was = scene.getObjectByName(name)!.getWorldPosition(new Vector3());
      const kept = rig.getObjectByName(name);
      expect(kept, name).toBeDefined();
      expect(kept!.getWorldPosition(new Vector3()).distanceTo(was), name).toBeLessThan(1e-5);
    }
    expect(rig.getObjectByName('drapeau')).toBeUndefined();
  });
});
