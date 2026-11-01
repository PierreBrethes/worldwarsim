import { afterEach, describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh } from 'three';
import {
  altitudeShadow,
  figurineFor,
  hideAltitudeShadows,
  measureOf,
  nearWeight,
  pieceStands,
  pieceWeight,
  setNearFloor,
  siteReading,
  troopWeight,
} from './figurine';
import { crewOf, squadOf, stand, stride } from './infantry';
import { pieceScale } from '../piece-scale';
import { buildingFootprint, buildingSpan, MAN_METRES, troopSpan } from '@/domain/piece-size';

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

/** A site on its socle reads by its socle's pixels (ADR 0038 §7): the barracks' socle of 80 m. */
describe('siteReading', () => {
  const socle = (buildingFootprint('barracks') * 80) / 65;
  // The fixture's sign: its mast stands some 27 m over the socle top.
  const sign = (buildingSpan('barracks') * 27) / 50;
  afterEach(() => {
    setNearFloor(0);
    pieceScale.size = 1;
  });

  it('stands the whole diorama while its socle reads at 64 px, until d ≈ 28 for the barracks', () => {
    expect(siteReading(28, socle, sign)).toEqual({ diorama: 1, socle: 1, signGrowth: 1 });
    expect(siteReading(30, socle, sign).diorama).toBeLessThan(1);
    expect(siteReading(30, socle, sign).diorama).toBeGreaterThan(0);
    expect(siteReading(34, socle, sign).diorama).toBe(0);
  });

  it('keeps the socle and its sign alone down to 28 px, until d ≈ 65, then shrinks the socle', () => {
    expect(siteReading(45, socle, sign)).toMatchObject({ diorama: 0, socle: 1 });
    expect(siteReading(64, socle, sign).socle).toBe(1);
    expect(siteReading(70, socle, sign).socle).toBeLessThan(1);
    expect(siteReading(70, socle, sign).socle).toBeGreaterThan(0);
    expect(siteReading(77, socle, sign).socle).toBe(0);
  });

  it('grows the sign to keep 12 px tall, twice its height at most', () => {
    expect(siteReading(45, socle, sign).signGrowth).toBe(1);
    // Its 27 m read 610 px over d: 8.7 px at d = 70, grown by 12 / 8.7.
    expect(siteReading(70, socle, sign).signGrowth).toBeCloseTo(1.377, 2);
    expect(siteReading(200, socle, sign).signGrowth).toBe(2);
  });

  it('hands the pin what the socle gives up: never both, never neither', () => {
    for (let d = 20; d < 90; d += 0.5) {
      const pin = 1 - pieceStands(d, { socle });
      expect(pin + siteReading(d, socle, sign).socle).toBeCloseTo(1, 9);
    }
    // A piece without a socle gives way as it always did.
    expect(pieceStands(57, buildingSpan('barracks'))).toBe(
      pieceWeight(57, buildingSpan('barracks')),
    );
  });

  it('measures at the player size, as pieceWeight does', () => {
    pieceScale.size = 1.25;
    expect(siteReading(34, socle, sign).diorama).toBeGreaterThan(0);
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
        sculpted: false,
      })),
    );
    expect(squad.children.map((man) => man.name)).toEqual(['man_0', 'man_1']);
    expect(squad.children[0]!.position.z).toBeGreaterThan(squad.children[1]!.position.z);
  });

  it('stands a kneeling mark 2 up to march and sets him back on his knee when he stops', () => {
    const kneeler = () => {
      const man = new Group();
      const leg = new Group();
      leg.name = 'leg_left';
      leg.rotation.x = -Math.PI / 2;
      man.add(leg);
      return man;
    };
    const squad = squadOf([{ make: kneeler, sculpted: true }]);
    const leg = squad.getObjectByName('leg_left')!;
    expect(leg.rotation.x).toBeCloseTo(-Math.PI / 2);
    stride(squad, 1);
    expect(leg.rotation.x).not.toBeCloseTo(-Math.PI / 2);
    stride(squad, null);
    expect(leg.rotation.x).toBeCloseTo(-Math.PI / 2);
    stride(squad, 1);
    stand(squad.children[0]!);
    expect(leg.rotation.x).toBeCloseTo(-Math.PI / 2);
  });

  it('answers a figurine wherever every mark has a sculpted file', () => {
    expect(figurineFor('france', 'infantry', [1, 1, 1])).not.toBeNull();
    expect(figurineFor('france', 'armor', [2])).not.toBeNull();
    expect(figurineFor('france', 'armor', [1])).not.toBeNull();
    expect(figurineFor('germany', 'airTransport', [1])).not.toBeNull();
    expect(figurineFor('japan', 'artillery', [1])).not.toBeNull();
  });
});

const box = (x: number, y: number, z: number): Mesh => new Mesh(new BoxGeometry(x, y, z));

describe('measureOf', () => {
  it('measures a man in metres, standing, kneeling or arm raised: a squad keeps its size whoever leads it', () => {
    for (const height of [1.75, 1.43, 2.16])
      expect(measureOf(box(0.6, height, 0.4), 'infantry')).toBe(MAN_METRES);
  });

  it('measures the rest by their widest side at the ground', () => {
    expect(measureOf(box(2.6, 1.2, 4.8), 'armor')).toBeCloseTo(4.8);
  });
});

describe('the Japanese gun crew', () => {
  it('draws one gun however many mark 2 stand: [2,2,2] is the gun alone, [2,2,1] a gun and a rifleman', () => {
    expect(crewOf('japan', [2, 2, 2])).toEqual([2]);
    expect(crewOf('japan', [2, 2, 1])).toEqual([2, 1]);
    expect(crewOf('japan', [2, 1, 1])).toEqual([2, 1, 1]);
    expect(crewOf('japan', [1, 1, 1])).toEqual([1, 1, 1]);
    expect(crewOf('germany', [2, 2, 2])).toEqual([2, 2, 2]);
  });

  it('keeps the same man scale led by a gun or by a rifleman', () => {
    const gun = new Group();
    const piece = box(1.81, 1.2, 4.57);
    gun.add(piece);
    expect(measureOf(gun, 'infantry')).toBe(measureOf(box(0.6, 1.75, 0.4), 'infantry'));
  });

  it('stands the riflemen clear of the gun, which is 1.81 m wide at x -0.62 and reaches z 3.10', () => {
    const squad = squadOf(
      [true, false, false].map((gun) => ({ make: () => new Group(), sculpted: gun, gun })),
    );
    for (const man of squad.children.slice(1))
      expect(man.position.x - 0.3).toBeGreaterThan(-0.62 + 1.81 / 2);
    expect(squad.children[0]!.position.x).toBe(0);
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
