import { afterEach, describe, expect, it } from 'vitest';
import { Group } from 'three';
import {
  altitudeShadow,
  figurineFor,
  hideAltitudeShadows,
  nearWeight,
  pieceWeight,
  setNearFloor,
  troopWeight,
} from './figurine';
import { squadOf } from './infantry';
import { pieceScale } from '../piece-scale';
import { buildingSpan, troopSpan } from '@/domain/piece-size';

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

/** A piece gives way to its pin by its size on screen (ADR 0035 §3), measured at 900 px tall. */
describe('pieceWeight', () => {
  afterEach(() => {
    setNearFloor(0);
    pieceScale.size = 1;
  });

  it('reads a man under the pin from d ≈ 3, a tank from 7, and pins the buildings from 58 to 70', () => {
    expect(pieceWeight(3, troopSpan('infantry'))).toBe(1);
    expect(pieceWeight(3.7, troopSpan('infantry'))).toBe(0);
    expect(pieceWeight(6.9, troopSpan('armor'))).toBe(1);
    expect(pieceWeight(8.2, troopSpan('armor'))).toBe(0);
    expect(pieceWeight(57, buildingSpan('barracks'))).toBe(1);
    expect(pieceWeight(68.3, buildingSpan('barracks'))).toBe(0);
    expect(pieceWeight(69, buildingSpan('hq'))).toBe(1);
  });

  it('shrinks into its pin over the last stretch, not at once', () => {
    const between = pieceWeight(7.5, troopSpan('armor'));
    expect(between).toBeGreaterThan(0);
    expect(between).toBeLessThan(1);
  });

  it('holds a bigger piece longer when the player grows them', () => {
    pieceScale.size = 1.25;
    expect(pieceWeight(8.2, troopSpan('armor'))).toBeGreaterThan(0);
  });

  it('stands a whole man from the closest zoom to d ≈ 30 by his floor, at the smallest size and on a short window too', () => {
    pieceScale.pxPerUnit = 650 / (2 * Math.tan((21 * Math.PI) / 180));
    expect(troopWeight(30, troopSpan('infantry'))).toBe(1);
    expect(troopWeight(36, troopSpan('infantry'))).toBe(0);
    pieceScale.size = 0.8;
    expect(troopWeight(4, troopSpan('infantry'))).toBe(1);
    expect(troopWeight(24, troopSpan('infantry'))).toBe(1);
  });

  it('measures a piece nearer than the target at the target distance', () => {
    setNearFloor(10);
    expect(pieceWeight(4, troopSpan('armor'))).toBe(0);
  });
});

describe('figurineFor', () => {
  it('answers null where nothing is sculpted, so the plate stays', () => {
    expect(figurineFor(null, 'infantry', [1])).toBeNull();
    expect(figurineFor('atlantis', 'infantry', [1])).toBeNull();
    expect(figurineFor('france', 'infantry', [])).toBeNull();
  });

  it('stands one man per figure, the first in front, each named by his place: a sortie walks them in file', () => {
    const squad = squadOf(
      [1, 2].map(() => ({
        make: () => new Group(),
        marches: true,
      })),
    );
    expect(squad.children.map((man) => man.name)).toEqual(['man_0', 'man_1']);
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
