import { afterEach, describe, expect, it } from 'vitest';
import { Group } from 'three';
import {
  altitudeShadow,
  figurineFor,
  hideAltitudeShadows,
  nearWeight,
  setNearFloor,
} from './figurine';
import { squadOf } from './infantry';

describe('nearWeight', () => {
  afterEach(() => setNearFloor(0));

  it('is a whole figurine at the country level and none beyond the region fade', () => {
    expect(nearWeight(4)).toBe(1);
    expect(nearWeight(30)).toBe(1);
    expect(nearWeight(65)).toBe(0);
    expect(nearWeight(300)).toBe(0);
    expect(nearWeight(40)).toBeGreaterThan(nearWeight(55));
  });

  it('ignores a piece nearer than the target distance, so a tilted far view stays plates', () => {
    setNearFloor(80);
    expect(nearWeight(48)).toBe(0);
    setNearFloor(20);
    expect(nearWeight(10)).toBe(1);
    expect(nearWeight(48)).toBeGreaterThan(0);
  });
});

describe('figurineFor', () => {
  it('answers null where nothing is sculpted, so the plate stays', () => {
    expect(figurineFor(null, 'infantry', [1])).toBeNull();
    expect(figurineFor('atlantis', 'infantry', [1])).toBeNull();
    expect(figurineFor('france', 'infantry', [])).toBeNull();
  });

  it('stands one man per figure, the first in front', () => {
    const squad = squadOf(
      [1, 2].map((k) => ({
        make: () => Object.assign(new Group(), { name: `man${k}` }),
        marches: true,
      })),
    );
    expect(squad.children.map((man) => man.name)).toEqual(['man1', 'man2']);
    expect(squad.children[0]!.position.z).toBeGreaterThan(squad.children[1]!.position.z);
  });

  it('answers a figurine wherever every mark has a sculpted file', () => {
    expect(figurineFor('france', 'infantry', [1, 1, 1])).not.toBeNull();
    expect(figurineFor('france', 'armor', [2])).not.toBeNull();
    expect(figurineFor('france', 'armor', [1])).not.toBeNull();
    expect(figurineFor('germany', 'airTransport', [1])).not.toBeNull();
    expect(figurineFor('japan', 'artillery', [1])).not.toBeNull();
  });
});

describe('hideAltitudeShadows', () => {
  it('hides the disc of a plane aloft in a copy that is carried, and nothing else', () => {
    const copy = new Group();
    const aloft = altitudeShadow();
    const other = new Group();
    copy.add(aloft, other);
    hideAltitudeShadows(copy);
    expect(aloft.visible).toBe(false);
    expect(other.visible).toBe(true);
  });
});
