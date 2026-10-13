import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { bakedParts, MAQUETTE_SPAN, ringOffsets, spanScale, yawOf } from './maquettes';

describe('yawOf', () => {
  it('turns a building the same way at every display, and two buildings apart', () => {
    expect(yawOf('building-FRA-75-hq')).toBe(yawOf('building-FRA-75-hq'));
    expect(yawOf('building-FRA-75-hq')).not.toBe(yawOf('building-FRA-92-farm'));
    for (const id of ['a', 'objective-1', 'installation-xyz']) {
      expect(yawOf(id)).toBeGreaterThanOrEqual(0);
      expect(yawOf(id)).toBeLessThan(2 * Math.PI);
    }
  });
});

describe('spanScale', () => {
  it('brings the widest side of the footprint to the span, whatever the height', () => {
    expect(spanScale(new Vector3(4, 9, 2)) * 4).toBeCloseTo(MAQUETTE_SPAN);
    expect(spanScale(new Vector3(1, 0.5, 2)) * 2).toBeCloseTo(MAQUETTE_SPAN);
  });
});

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
});

describe('ringOffsets', () => {
  it('stands one maquette on its mast, and a group a span apart around it', () => {
    expect(ringOffsets(1)).toEqual([[0, 0]]);
    for (const count of [2, 3, 5]) {
      const ring = ringOffsets(count);
      expect(ring).toHaveLength(count);
      const [ax, az] = ring[0]!;
      const [bx, bz] = ring[1]!;
      expect(Math.hypot(ax - bx, az - bz)).toBeCloseTo(MAQUETTE_SPAN);
    }
  });
});
