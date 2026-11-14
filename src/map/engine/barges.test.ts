import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { LANDING_CRAFT } from '@/emblems/kits/manifest';
import { Barges } from './barges';

const size = { length: 10, width: 4, depth: 1.4, floor: 0.4, ramp: 3.5 };
const plan = {
  ms: 1000,
  size,
  craft: (t: number) =>
    t < 0 || t >= 1000 ? null : { at: new Vector3(t, 0, 2), heading: 0.5, ramp: t / 1000 },
};

describe('Barges (#511)', () => {
  it('draws the craft where the plan puts it, its ramp fallen as far as the plan says', () => {
    const barges = new Barges();
    barges.lay('h', plan, 100);
    expect(barges.active).toBe(true);
    barges.update(600, 0);
    const [body] = barges.group.children;
    expect(body!.visible).toBe(true);
    expect(body!.position.x).toBe(500);
    expect(body!.rotation.y).toBe(0.5);
    const hinge = body!.children.at(-1)!;
    expect(hinge.rotation.x).toBeCloseTo(0.5 * LANDING_CRAFT.down, 9);
  });

  it('takes the craft away when its plan is over, or when it is cleared', () => {
    const barges = new Barges();
    barges.lay('h', plan, 0);
    barges.update(1000, 0);
    expect(barges.active).toBe(false);
    expect(barges.group.children).toHaveLength(0);
    barges.lay('h', plan, 0);
    barges.clear('h');
    expect(barges.active).toBe(false);
    expect(barges.group.children).toHaveLength(0);
  });

  it('hides a craft the plan has not put out yet, and lightens its ink at night', () => {
    const barges = new Barges();
    barges.lay('h', plan, 100);
    barges.update(50, 0);
    expect(barges.group.children[0]!.visible).toBe(false);
    const day = barges['material'].color.getHex();
    barges.update(600, 1);
    expect(barges['material'].color.getHex()).not.toBe(day);
  });
});
