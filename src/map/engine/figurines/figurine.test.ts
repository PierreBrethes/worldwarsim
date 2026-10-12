import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { figurineFor, nearWeight } from './figurine';
import { squadOf } from './infantry';

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
    expect(figurineFor(null, 'infantry', [1])).toBeNull();
    expect(figurineFor('atlantis', 'infantry', [1])).toBeNull();
    expect(figurineFor('france', 'cargo', [1])).toBeNull();
    expect(figurineFor('france', 'infantry', [2])).toBeNull();
    expect(figurineFor('france', 'infantry', [])).toBeNull();
  });

  it('answers null as soon as one mark has no figurine, never a squad of the wrong kit', () => {
    expect(figurineFor('france', 'infantry', [2, 1, 1])).toBeNull();
  });

  it('stands one man per figure, the first in front', () => {
    const squad = squadOf([1, 2].map((k) => () => Object.assign(new Group(), { name: `man${k}` })));
    expect(squad.children.map((man) => man.name)).toEqual(['man1', 'man2']);
    expect(squad.children[0]!.position.z).toBeGreaterThan(squad.children[1]!.position.z);
  });

  it('answers a figurine wherever every mark has a sculpted file', () => {
    expect(figurineFor('france', 'infantry', [1, 1, 1])).not.toBeNull();
    expect(figurineFor('france', 'armor', [2])).not.toBeNull();
    expect(figurineFor('france', 'armor', [1])).toBeNull();
  });
});
