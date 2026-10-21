import { Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { UnitRole } from '@/domain/ids';
import { pilePieces, unitPieces } from '@/domain/pile-pieces';
import {
  drawnKey,
  dressedGroups,
  formationOf,
  nearestGroup,
  pileLayout,
  pileObject,
  pickedIn,
  takenCopies,
} from './standing';

const troop = (role: UnitRole, strength = 100) => ({
  id: role,
  role,
  tier: 1 as const,
  strength,
  nominalStrength: 100,
});

describe('pileLayout', () => {
  it('centres the pieces side by side', () => {
    expect(pileLayout(1)).toEqual([0]);
    expect(pileLayout(2)).toEqual([-0.25, 0.25]);
    expect(pileLayout(4)).toEqual([-0.75, -0.25, 0.25, 0.75]);
  });
});

describe('formationOf', () => {
  const gap = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    Math.hypot(a.x - b.x, a.z - b.z);

  it('stands up to four abreast, more in ranks', () => {
    expect(formationOf(['land', 'land'], null).map(({ x, z }) => [x, z])).toEqual([
      [-0.31, 0],
      [0.31, 0],
    ]);
    const four = formationOf(Array<'land'>(4).fill('land'), null);
    expect(four.every(({ z }) => z === 0)).toBe(true);
    const five = formationOf(Array<'land'>(5).fill('land'), null);
    expect(new Set(five.map(({ z }) => z)).size).toBe(2);
  });

  it('ranks many units in a tight formation around the point, none in another', () => {
    const groups = formationOf(Array<'land'>(9).fill('land'), null);
    for (let i = 0; i < groups.length; i++) {
      expect(Math.hypot(groups[i]!.x, groups[i]!.z)).toBeLessThan(1.2);
      for (let j = i + 1; j < groups.length; j++)
        expect(gap(groups[i]!, groups[j]!)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
  });

  it('stands hulls on the sea side and land troops on the land side of a shore', () => {
    const groups = formationOf(['land', 'sea', 'land', 'sea'], [1, 0]);
    expect(groups[0]!.x).toBeLessThan(0);
    expect(groups[2]!.x).toBeLessThan(0);
    expect(groups[1]!.x).toBeGreaterThan(0);
    expect(groups[3]!.x).toBeGreaterThan(0);
    for (const land of [groups[0]!, groups[2]!])
      for (const sea of [groups[1]!, groups[3]!]) expect(gap(land, sea)).toBeGreaterThan(0.5);
  });

  it('keeps land troops on a shore off the water', () => {
    for (const { z } of formationOf(['land', 'land'], [0, 1])) expect(z).toBeLessThan(0);
  });
});

describe('dressedGroups', () => {
  it('dresses a pile whose every piece has a figurine, one figurine per troop', () => {
    expect(
      dressedGroups('france', pilePieces([troop('infantry'), troop('infantry')])),
    ).toHaveLength(2);
  });

  it('leaves the whole pile to its plate when one group has none', () => {
    expect(dressedGroups('atlantis', pilePieces([troop('infantry')]))).toBeNull();
    expect(dressedGroups('france', { groups: [], troopIds: [], squad: false })).toBeNull();
  });
});

describe('drawnKey', () => {
  it('redraws a pile whose vehicles cross a wear line, and only then', () => {
    const at = (strength: number) => drawnKey('germany', pilePieces([troop('armor', strength)]));
    expect(at(90)).toBe(at(80));
    expect(at(50)).not.toBe(at(80));
    expect(at(20)).not.toBe(at(50));
  });
});

describe('picking a pile', () => {
  const pieces = pilePieces([
    { ...troop('armor'), id: 'a1' },
    { ...troop('armor'), id: 'a2' },
    { ...troop('infantry'), id: 'i1' },
  ]);
  const pile = pileObject('germany', pieces)!;
  // No model file loads under node: the footprints stand without them.
  pile.ready.catch(() => {});
  pile.object.updateMatrixWorld(true);
  const from = (x: number, z: number) => new Raycaster(new Vector3(x, 5, z), new Vector3(0, -1, 0));
  const slots = formationOf(['land', 'land', 'land'], null);

  it('takes the piece under the pointer, by its footprint and not its triangles', () => {
    slots.forEach(({ x, z }, k) =>
      expect(pickedIn(from(x + 0.05, z + 0.1), pile.targets, pieces)).toEqual([
        ['a1', 'a2', 'i1'][k],
      ]),
    );
  });

  it('takes nothing beside the pile', () => {
    expect(pickedIn(from(3, 0), pile.targets, pieces)).toBeNull();
  });
});

/** **Ce qui est à bord ne se voit pas** (15/10) : le transport se dessine seul, son étiquette
 *  dit qui il porte (`cargoTagsOf`). */
describe('a transport carrying passengers', () => {
  const pieces = pilePieces([
    { ...troop('landTransport'), id: 'l1' },
    { ...troop('infantry'), id: 'i1', carriedBy: 'l1' },
    { ...troop('infantry'), id: 'i2', carriedBy: 'l1' },
  ]);

  it('draws the truck alone, its riders with it', () => {
    expect(pieces.groups.map((group) => [group.role, group.troopIds])).toEqual([
      ['landTransport', ['l1', 'i1', 'i2']],
    ]);
    const pile = pileObject('germany', pieces)!;
    pile.ready.catch(() => {});
    expect(pile.targets).toHaveLength(1);
  });
});

describe('pressing between the units of a Blitz pile', () => {
  const pieces = unitPieces([
    { ...troop('infantry'), id: 'u1' },
    { ...troop('infantry'), id: 'u2' },
    { ...troop('infantry'), id: 'u3' },
  ]);
  const pile = pileObject('germany', pieces)!;
  pile.ready.catch(() => {});
  pile.object.updateMatrixWorld(true);
  const slots = formationOf(['land', 'land', 'land'], null);

  it('gives the unit nearest the pointer, never the whole pile', () => {
    slots.forEach(({ x, z }, k) => {
      const beside = new Vector3(x + 0.1, 0, z + 0.3);
      expect(nearestGroup(beside, pile.targets, pieces)).toEqual([`u${k + 1}`]);
    });
  });
});

describe('the piece in hand answering a click', () => {
  type Copy = { readonly down: { readonly since: number } | null };
  const following: Copy = { down: null };
  const setDown: Copy = { down: { since: 0 } };
  const homeward: Copy = { down: null };

  it('lets the click through the copy that follows the pointer, which stands under it', () => {
    expect(takenCopies(following, null)).toEqual([]);
  });

  it('takes the copy set down under a rose, and the one on its way home', () => {
    expect(takenCopies(setDown, homeward)).toEqual([setDown, homeward]);
    expect(takenCopies(null, homeward)).toEqual([homeward]);
  });
});
