import { describe, expect, it } from 'vitest';
import type { UnitRole, UnitTier } from './ids';
import type { ArcView } from './player-view';
import { movementWear, pilePieces, pileSheet, unitPieces } from './pile-pieces';

let serial = 0;
const troop = (role: UnitRole, tier: UnitTier = 1, strength = 100, nominalStrength = 100) => ({
  id: `t${++serial}`,
  role,
  tier,
  strength,
  nominalStrength,
});

describe('pilePieces', () => {
  it('is empty for no troops', () => {
    expect(pilePieces([])).toEqual({ groups: [], more: 0, troopIds: [], spread: [] });
    expect(pileSheet([])).toEqual([]);
  });

  it('orders roles by troop count, ties by ROLE_ORDER, and caps at three groups', () => {
    const pile = [
      troop('fighter'),
      troop('armor'),
      troop('armor'),
      troop('infantry'),
      troop('bomber'),
      troop('landTransport'),
    ];
    const { groups, more } = pilePieces(pile);
    expect(groups.map((g) => g.role)).toEqual(['armor', 'infantry', 'landTransport']);
    expect(groups[0]?.troops).toBe(2);
    expect(more).toBe(2);
    expect(pileSheet(pile).map((l) => l.role)).toEqual([
      'armor',
      'infantry',
      'landTransport',
      'fighter',
      'bomber',
    ]);
  });

  it('shows 3, 2 or 1 infantry figures by cumulated strength', () => {
    const figures = (strength: number) =>
      pilePieces([troop('infantry', 1, strength)]).groups[0]?.figures.length;
    expect(figures(100)).toBe(3);
    expect(figures(67)).toBe(3);
    expect(figures(66)).toBe(2);
    expect(figures(34)).toBe(2);
    expect(figures(33)).toBe(1);
  });

  it('shows a single figure for a vehicle whatever its strength', () => {
    expect(pilePieces([troop('armor', 1, 100), troop('armor', 1, 100)]).groups[0]?.figures).toEqual(
      [1],
    );
  });

  it('wears by the same thresholds', () => {
    const wear = (strength: number) => pilePieces([troop('armor', 1, strength)]).groups[0]?.wear;
    expect(wear(100)).toBe('whole');
    expect(wear(60)).toBe('smoking');
    expect(wear(34)).toBe('smoking');
    expect(wear(33)).toBe('burning');
  });

  it('shows only the marks present', () => {
    const marks = (tier: UnitTier) => pilePieces([troop('infantry', tier)]).groups[0]?.figures;
    expect(marks(1)).toEqual([1, 1, 1]);
    expect(marks(2)).toEqual([2, 2, 2]);
  });

  it('mixes marks with MK2 in front, at least one of each', () => {
    const mixed = (mk1: number, mk2: number) =>
      pilePieces([
        ...Array.from({ length: mk1 }, () => troop('infantry', 1)),
        ...Array.from({ length: mk2 }, () => troop('infantry', 2)),
      ]).groups[0]?.figures;
    expect(mixed(1, 1)).toEqual([2, 2, 1]);
    expect(mixed(1, 5)).toEqual([2, 2, 1]);
    expect(mixed(5, 1)).toEqual([2, 1, 1]);
    expect(mixed(1, 1)).toHaveLength(3);
  });

  it('picks the majority mark for a single mixed figure, ties to MK1', () => {
    const one = (mk1: number, mk2: number) =>
      pilePieces([
        ...Array.from({ length: mk1 }, () => troop('armor', 1)),
        ...Array.from({ length: mk2 }, () => troop('armor', 2)),
      ]).groups[0]?.figures;
    expect(one(1, 2)).toEqual([2]);
    expect(one(2, 1)).toEqual([1]);
    expect(one(1, 1)).toEqual([1]);
  });

  it('names the troops of each group, and of the whole pile beyond the +N', () => {
    const pile = [
      { ...troop('armor'), id: 'a1' },
      { ...troop('infantry'), id: 'i1' },
      { ...troop('armor'), id: 'a2' },
      { ...troop('landTransport'), id: 'l1' },
      { ...troop('fighter'), id: 'f1' },
    ];
    const { groups, troopIds } = pilePieces(pile);
    expect(groups.map((g) => g.troopIds)).toEqual([['a1', 'a2'], ['i1'], ['l1']]);
    expect(troopIds).toEqual(['a1', 'i1', 'a2', 'l1', 'f1']);
    expect(pileSheet(pile).map((l) => l.troopIds)).toEqual([['a1', 'a2'], ['i1'], ['l1'], ['f1']]);
  });

  it('treats a zero nominal strength as whole', () => {
    const [group] = pilePieces([troop('armor', 1, 0, 0)]).groups;
    expect(group?.wear).toBe('whole');
    expect(pileSheet([troop('armor', 1, 0, 0)])[0]?.health).toBe(100);
  });
});

describe('the pile deployed', () => {
  it("stands every troop on its own, grouped by role in the groups' order, the +N's included", () => {
    const pile = [
      { ...troop('fighter'), id: 'f1' },
      { ...troop('armor'), id: 'a1' },
      { ...troop('infantry'), id: 'i1' },
      { ...troop('armor'), id: 'a2' },
      { ...troop('bomber'), id: 'b1' },
      { ...troop('landTransport'), id: 'l1' },
    ];
    expect(pilePieces(pile).spread.map((p) => p.troopId)).toEqual([
      'a1',
      'a2',
      'i1',
      'l1',
      'f1',
      'b1',
    ]);
  });

  it('reads each troop alone: its men, its marks, its wear and its notches', () => {
    const [squad, tank] = pilePieces([
      { ...troop('infantry', 2, 50), id: 'i1' },
      { ...troop('armor', 1, 20), id: 'a1' },
    ]).spread;
    expect(squad).toEqual({
      troopId: 'i1',
      role: 'infantry',
      figures: [2, 2],
      wear: 'smoking',
      notches: 5,
      ink: 'ochre',
    });
    expect(tank).toMatchObject({ figures: [1], wear: 'burning', notches: 2, ink: 'red' });
  });
});

describe('pileSheet', () => {
  it('reads health, notches and ink', () => {
    const line = (strength: number) => pileSheet([troop('armor', 1, strength)])[0];
    expect(line(100)).toMatchObject({ health: 100, notches: 10, ink: 'ink' });
    expect(line(67)).toMatchObject({ health: 67, notches: 7, ink: 'ink' });
    expect(line(66.6)).toMatchObject({ health: 67, notches: 7, ink: 'ochre' });
    expect(line(34)).toMatchObject({ health: 34, notches: 3, ink: 'ochre' });
    expect(line(33.3)).toMatchObject({ health: 33, notches: 3, ink: 'red' });
  });

  it('counts troops and cumulates strength per role', () => {
    expect(pileSheet([troop('armor', 1, 100), troop('armor', 1, 0)])).toEqual([
      {
        role: 'armor',
        troops: 2,
        troopIds: [`t${serial - 1}`, `t${serial}`],
        health: 50,
        notches: 5,
        ink: 'ochre',
      },
    ]);
  });
});

describe('movementWear', () => {
  const mine = (troopIds: ReadonlyArray<string>) =>
    ({ state: 'mine', troopIds }) as unknown as ArcView;

  it('reads the wear of the face each medium wears, from the troops the movement carries', () => {
    const hull = troop('cargo', 1, 40);
    const tanks = [troop('armor', 1, 20), troop('armor', 1, 30)];
    const elsewhere = troop('fighter', 1, 10);
    const wear = movementWear(mine([hull.id, ...tanks.map((t) => t.id)]), [
      hull,
      ...tanks,
      elsewhere,
    ]);
    expect(wear).toEqual({ land: 'burning', sea: 'smoking', air: 'whole' });
  });

  it('leaves infantry unsmoking: it says its strength by its men', () => {
    const men = [troop('infantry', 1, 10), troop('infantry', 1, 10), troop('armor', 1, 10)];
    expect(movementWear(mine(men.map((t) => t.id)), men)?.land).toBe('whole');
  });

  it('serves nothing for a movement that is not mine', () => {
    const hull = troop('cargo', 1, 10);
    const enemy = { state: 'enemyDetected', troopIds: [hull.id] } as unknown as ArcView;
    expect(movementWear(enemy, [hull])).toBeNull();
  });
});

describe('unitPieces (Blitz: one piece per unit)', () => {
  it('stands two infantry side by side, each its own piece', () => {
    const [a, b] = [troop('infantry'), troop('infantry', 1, 40)];
    const { groups, more, spread } = unitPieces([a, b]);
    expect(groups.map((group) => group.troopIds)).toEqual([[a.id], [b.id]]);
    expect(groups.map((group) => [group.troops, group.figures.length])).toEqual([
      [1, 3],
      [1, 2],
    ]);
    expect([more, spread]).toEqual([0, []]);
  });

  it('draws a transport for its passengers, which go with it', () => {
    const [rider, cargo] = [troop('infantry'), troop('cargo', 1, 20)];
    const { groups, troopIds } = unitPieces([rider, cargo]);
    expect(groups).toEqual([
      { role: 'cargo', troops: 1, troopIds: [cargo.id, rider.id], figures: [1], wear: 'burning' },
    ]);
    expect(troopIds).toEqual([rider.id, cargo.id]);
  });

  it('keeps a plane in the air, and only a plane', () => {
    const { groups } = unitPieces([troop('bomber'), troop('infantry')]);
    expect(groups.map((group) => [group.role, group.aloft])).toEqual([
      ['infantry', undefined],
      ['bomber', true],
    ]);
  });
});
