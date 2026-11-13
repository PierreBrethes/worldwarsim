import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PlankMesh } from './plank';

describe('PlankMesh (#502)', () => {
  const plank = { from: [0, 0.2, 0], to: [0.3, 0, -0.4], width: 0.05, thick: 0.01 } as const;

  it('stretches from the sill to the foot, on the ground it stands on', () => {
    const mesh = new PlankMesh();
    mesh.place(plank, 1);
    expect(mesh.visible).toBe(true);
    expect(mesh.position.toArray()).toEqual([
      expect.closeTo(0.15),
      expect.closeTo(1.1),
      expect.closeTo(-0.2),
    ]);
    expect(mesh.scale.z).toBeCloseTo(Math.hypot(0.3, 0.2, 0.4));
    expect(mesh.scale.x).toBeCloseTo(0.05);
  });

  it('keeps its width level and its length along the slope', () => {
    const mesh = new PlankMesh();
    mesh.place(plank, 0);
    const side = new Vector3(1, 0, 0).applyQuaternion(mesh.quaternion);
    const length = new Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
    expect(side.y).toBeCloseTo(0);
    expect(length.toArray()).toEqual([
      expect.closeTo(0.3 / Math.hypot(0.3, 0.2, 0.4)),
      expect.closeTo(-0.2 / Math.hypot(0.3, 0.2, 0.4)),
      expect.closeTo(-0.4 / Math.hypot(0.3, 0.2, 0.4)),
    ]);
  });

  it('is not drawn once taken in', () => {
    const mesh = new PlankMesh();
    mesh.place(plank, 0);
    mesh.place(null, 0);
    expect(mesh.visible).toBe(false);
  });
});
