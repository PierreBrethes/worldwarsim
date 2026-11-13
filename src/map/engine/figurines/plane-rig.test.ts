import { Group, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { planeFileOf, planeRigOf } from './plane-rig';

/** A plane's articulated rig: its parts at their pivots, in the file's metres. */
function rig() {
  const root = new Group();
  const door = new Object3D();
  door.name = 'cabin_door';
  door.position.set(0.7, 3.1, -5.9);
  const foot = new Object3D();
  foot.name = 'fx_porte';
  foot.position.set(2.2, 0, -6.3);
  root.add(door, foot);
  return root;
}

/** A figurine as the engine draws it: `object` (at its point) > `model` (a board unit a metre of
 *  the file: 0.01). */
function plane(tilt = 0) {
  const object = new Group();
  object.position.set(10, 0, 3);
  const model = new Group();
  model.scale.setScalar(0.01);
  model.rotation.x = -tilt;
  object.add(model);
  return object;
}

describe('planeFileOf (#502)', () => {
  it("reads the hinge and the foot off the file's rig, in the file's metres", () => {
    const file = planeFileOf(rig())!;
    expect(file.hinge).toEqual([expect.closeTo(0.7), expect.closeTo(3.1), expect.closeTo(-5.9)]);
    expect(file.foot).toEqual([expect.closeTo(2.2), expect.closeTo(-6.3)]);
  });

  it('is null for a file without its door or its foot', () => {
    expect(planeFileOf(new Group().add(new Object3D()))).toBeNull();
  });
});

describe('planeRigOf (#502)', () => {
  const file = planeFileOf(rig())!;

  it('says the metre of the plane drawn and a plane stood level', () => {
    const read = planeRigOf(plane(), file)!;
    expect(read.metre).toBeCloseTo(0.01);
    expect(read.rig.pitch).toBeCloseTo(0);
    expect(read.rig.hinge).toEqual(file.hinge);
  });

  it('says the tail-down tilt it is drawn at', () => {
    expect(planeRigOf(plane(0.17), file)!.rig.pitch).toBeCloseTo(0.17);
  });

  it('is null for an object with no model', () => {
    expect(planeRigOf(new Group(), file)).toBeNull();
  });
});
