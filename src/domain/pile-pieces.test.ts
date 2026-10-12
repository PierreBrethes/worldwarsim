import { describe, expect, it } from 'vitest';
import type { UnitRole, UnitTier } from './ids';
import { pilePieces, pileSheet } from './pile-pieces';

const troop = (role: UnitRole, tier: UnitTier = 1, strength = 100, nominalStrength = 100) => ({
  role,
  tier,
  strength,
  nominalStrength,
});

describe('pilePieces', () => {
  it('is empty for no troops', () => {
    expect(pilePieces([])).toEqual({ groups: [], more: 0 });
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

  it('treats a zero nominal strength as whole', () => {
    const [group] = pilePieces([troop('armor', 1, 0, 0)]).groups;
    expect(group?.wear).toBe('whole');
    expect(pileSheet([troop('armor', 1, 0, 0)])[0]?.health).toBe(100);
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
      { role: 'armor', troops: 2, health: 50, notches: 5, ink: 'ochre' },
    ]);
  });
});
