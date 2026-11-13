import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Gangplanks } from './gangplanks';
import { PLANK_MS } from './timelines/gangway';

const door = new Vector3(0, 4, 0);
const foot = new Vector3(10, 2, 0);

describe('Gangplanks (#479)', () => {
  const lay = () => {
    const planks = new Gangplanks();
    planks.lay('hull', door, foot, 1000, { up: 5000 }, 1.3);
    return planks;
  };
  const shown = (planks: Gangplanks) => planks.group.children.filter((mesh) => mesh.visible);

  it('draws nothing until a sequence lays one', () => {
    const planks = new Gangplanks();
    planks.update(0, 1, 0);
    expect(shown(planks)).toHaveLength(0);
    expect(planks.active).toBe(false);
  });

  it('lays a plank from the door down to the foot, and takes it in', () => {
    const planks = lay();
    planks.update(1000 + PLANK_MS + 100, 0.01, 0);
    const [plank] = shown(planks);
    expect(plank!.position.toArray()).toEqual(door.toArray());
    // Laid, its far end is the foot: its length is the door's distance to it.
    expect(plank!.scale.z).toBeCloseTo(door.distanceTo(foot), 3);
    expect(planks.active).toBe(true);
    planks.update(1000 + 5000 + PLANK_MS + 1, 0.01, 0);
    expect(shown(planks)).toHaveLength(0);
    expect(planks.active).toBe(false);
  });

  it('is gone when asked to, whatever the hour', () => {
    const planks = lay();
    planks.update(2000, 0.01, 0);
    planks.clear('hull');
    planks.update(2016, 0.01, 0);
    expect(shown(planks)).toHaveLength(0);
  });

  it('lightens its ink with the night', () => {
    const planks = lay();
    planks.update(2000, 0.01, 0);
    const day = (shown(planks)[0] as import('three').Mesh)
      .material as import('three').MeshBasicMaterial;
    const before = day.color.getHex();
    planks.update(2016, 0.01, 1);
    expect(day.color.getHex()).not.toBe(before);
  });

  it('never narrower than two pixels', () => {
    const planks = lay();
    planks.update(2000, 5, 0);
    expect(shown(planks)[0]!.scale.x).toBeGreaterThanOrEqual(10);
  });
});
