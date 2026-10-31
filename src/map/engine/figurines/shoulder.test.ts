import { describe, expect, it } from 'vitest';
import { Group, type Object3D } from 'three';
import { MAN_METRES } from '@/domain/piece-size';
import { shoulder, squadOf } from './infantry';

/** A soldier of the Claude Design model, as far as the pose reads him: his joints by name. */
function soldier(): Group {
  const man = new Group();
  for (const name of [
    'body',
    'arm_left',
    'arm_right',
    'forearm_left',
    'forearm_right',
    'leg_left',
    'leg_right',
    'shin_left',
    'shin_right',
    'rifle',
  ]) {
    const joint = new Group();
    joint.name = name;
    man.add(joint);
  }
  return man;
}

const joints = (man: Object3D) =>
  man.children.map((joint) => [joint.name, ...joint.rotation.toArray().slice(0, 3)]);

describe('shouldering', () => {
  it('goes from the pose at rest to the knee, rifle up, and back to it exactly', () => {
    const squad = squadOf([{ make: soldier, sculpted: false }]);
    const man = squad.children[0]!;
    const rest = joints(man);
    const restHeight = man.position.y;

    shoulder(man, 1, 0);
    expect(man.getObjectByName('leg_left')!.rotation.x).toBeCloseTo(-1.35);
    expect(man.getObjectByName('shin_right')!.rotation.x).toBeCloseTo(1.8);
    expect(man.getObjectByName('arm_right')!.rotation.x).toBeCloseTo(-0.9);
    // Arm, forearm and rifle add up to the horizontal: the rifle is at the shoulder.
    expect(
      man.getObjectByName('arm_right')!.rotation.x +
        man.getObjectByName('forearm_right')!.rotation.x +
        man.getObjectByName('rifle')!.rotation.x,
    ).toBeCloseTo(Math.PI / 2);
    // The body drops by 24 % of the man's height.
    expect(man.position.y).toBeCloseTo(-0.24 * MAN_METRES);

    shoulder(man, 0.5, 0);
    expect(man.position.y).toBeCloseTo(-0.12 * MAN_METRES);

    shoulder(man, 0, 0);
    expect(joints(man)).toEqual(rest);
    expect(man.position.y).toBe(restHeight);
  });

  it('kicks the arm and the rifle back as the shot leaves', () => {
    const man = squadOf([{ make: soldier, sculpted: false }]).children[0]!;
    shoulder(man, 1, 0);
    const arm = man.getObjectByName('arm_right')!.rotation.x;
    shoulder(man, 1, 1);
    expect(man.getObjectByName('arm_right')!.rotation.x).toBeCloseTo(arm + 0.08);
  });

  it('leaves a mark 2 in the pose of his file, a kick aside, and does not lower him', () => {
    const kneeler = () => {
      const man = soldier();
      man.getObjectByName('leg_left')!.rotation.x = -Math.PI / 2;
      man.getObjectByName('arm_right')!.rotation.x = -0.4;
      return man;
    };
    const man = squadOf([{ make: kneeler, sculpted: true }]).children[0]!;
    shoulder(man, 1, 0);
    expect(man.getObjectByName('leg_left')!.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(man.getObjectByName('arm_right')!.rotation.x).toBeCloseTo(-0.4);
    expect(man.position.y).toBe(0);
    shoulder(man, 1, 1);
    expect(man.getObjectByName('arm_right')!.rotation.x).toBeCloseTo(-0.4 + 0.08);
    shoulder(man, 0, 0);
    expect(man.getObjectByName('arm_right')!.rotation.x).toBeCloseTo(-0.4);
  });
});
