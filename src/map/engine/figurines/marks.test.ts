import { Group, Mesh, Object3D, BoxGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { markOf } from './marks';

/** A figurine as the engine builds it: `object` (board scale, at the pawn's point) > `model` > file. */
function standing() {
  const object = new Group();
  object.position.set(10, 0, 3);
  object.scale.setScalar(0.5);
  const model = new Group();
  object.add(model);
  return { object, model };
}

describe('markOf (#503)', () => {
  it('reads a hull marker in map coordinates, scale and place of the pawn included', () => {
    const { object, model } = standing();
    const hull = new Group();
    const mark = new Object3D();
    mark.name = 'fx_passerelle';
    mark.position.set(8, 4, -14);
    hull.add(mark);
    model.add(hull);
    expect(markOf(object, 'fx_passerelle')!.toArray()).toEqual([14, 2, -4]);
  });

  it('follows the articulated copy of a plane in flight, door swung and plane aloft', () => {
    const { object, model } = standing();
    object.position.y = 20;
    const drawn = new Group();
    model.add(drawn);
    // The copy a sequence stands in: a door on its pivot, the marker hung on the door.
    const copy = new Group();
    const door = new Object3D();
    door.name = 'cabin_door';
    door.position.set(2, 0, 0);
    const foot = new Object3D();
    foot.name = 'fx_porte';
    foot.position.set(0, -1, 0);
    door.add(foot);
    copy.add(door);
    drawn.removeFromParent();
    model.add(copy);
    door.rotation.z = Math.PI / 2;
    const at = markOf(object, 'fx_porte')!;
    expect(at.x).toBeCloseTo(10 + 0.5 * 3);
    expect(at.y).toBeCloseTo(20);
  });

  it('says nothing of a marker the model does not carry', () => {
    const { object, model } = standing();
    model.add(new Mesh(new BoxGeometry()));
    expect(markOf(object, 'fx_passerelle')).toBeNull();
  });
});
