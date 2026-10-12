import { describe, expect, it } from 'vitest';
import type { Mesh, Object3D } from 'three';
import { figurineFor, nearWeight } from './figurine';

const triangles = (object: Object3D): number => {
  let count = 0;
  object.traverse((part) => {
    const geometry = (part as Mesh).geometry;
    if (!geometry) return;
    count += (geometry.index?.count ?? geometry.attributes.position!.count) / 3;
  });
  return count;
};

describe('nearWeight', () => {
  it('is a whole figurine at the country level and none beyond the region fade', () => {
    expect(nearWeight(4)).toBe(1);
    expect(nearWeight(30)).toBe(1);
    expect(nearWeight(65)).toBe(0);
    expect(nearWeight(300)).toBe(0);
    expect(nearWeight(40)).toBeGreaterThan(nearWeight(55));
  });
});

describe('figurineFor', () => {
  it('answers null where nothing is sculpted nor coded, so the plate stays', () => {
    expect(figurineFor(null, 'infantry', 1)).toBeNull();
    expect(figurineFor('atlantis', 'infantry', 1)).toBeNull();
    expect(figurineFor('france', 'cargo', 1)).toBeNull();
    expect(figurineFor('france', 'infantry', 2)).toBeNull();
  });

  it('stands three posable men to a French troop, within the brief’s budget', () => {
    const figurine = figurineFor('france', 'infantry', 1);
    expect(figurine).not.toBeNull();
    const men: Object3D[] = [];
    figurine!.object.traverse((part) => part.name === 'soldier' && men.push(part));
    expect(men).toHaveLength(3);
    for (const man of men) {
      for (const joint of [
        'arm_left',
        'forearm_right',
        'leg_left',
        'shin_right',
        'rifle',
        'head',
        'body',
      ]) {
        expect(man.getObjectByName(joint), joint).toBeDefined();
      }
      expect(triangles(man)).toBeLessThan(2500);
    }
  });
});
