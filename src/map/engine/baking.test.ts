import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { bakedParts } from './baking';

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
});
