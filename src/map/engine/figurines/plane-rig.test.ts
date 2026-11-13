import { Group, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { planeRigOf } from './plane-rig';

/** A plane as the engine draws it: `object` (board scale, at its point) > `model` (a board unit a
 *  metre of the file: 0.01) > the file's nodes, the root at its wheels. */
function plane(tilt = 0) {
  const object = new Group();
  object.position.set(10, 0, 3);
  const model = new Group();
  model.scale.setScalar(0.01);
  model.rotation.x = -tilt;
  object.add(model);
  const door = new Object3D();
  door.name = 'cabin_door';
  door.position.set(0.7, 3.1, -5.9);
  const foot = new Object3D();
  foot.name = 'fx_porte';
  foot.position.set(2.2, 0, -6.3);
  model.add(door, foot);
  return object;
}

describe('planeRigOf (#502)', () => {
  it("reads the hinge, the foot and the metre off the plane drawn, in the file's metres", () => {
    const read = planeRigOf(plane())!;
    expect(read.metre).toBeCloseTo(0.01);
    expect(read.rig.hinge).toEqual([
      expect.closeTo(0.7),
      expect.closeTo(3.1),
      expect.closeTo(-5.9),
    ]);
    expect(read.rig.foot).toEqual([expect.closeTo(2.2), expect.closeTo(-6.3)]);
    expect(read.rig.pitch).toBeCloseTo(0);
  });

  it("keeps the file's frame under the tail-down rest it is drawn at, and says the tilt", () => {
    const tilted = planeRigOf(plane(0.17))!;
    expect(tilted.rig.pitch).toBeCloseTo(0.17);
    expect(tilted.rig.hinge[1]).toBeCloseTo(3.1);
    expect(tilted.rig.hinge[2]).toBeCloseTo(-5.9);
  });

  it('is null for a model without its door or its foot', () => {
    const object = new Group();
    object.add(new Group());
    expect(planeRigOf(object)).toBeNull();
  });
});
