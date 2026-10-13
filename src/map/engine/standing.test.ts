import { describe, expect, it } from 'vitest';
import type { UnitRole } from '@/domain/ids';
import { pilePieces } from '@/domain/pile-pieces';
import { drawnKey, dressedGroups, pileLayout } from './standing';

const troop = (role: UnitRole, strength = 100) => ({
  id: role,
  role,
  tier: 1 as const,
  strength,
  nominalStrength: 100,
});

describe('pileLayout', () => {
  it('centres the groups side by side, the « +N » counter in the slot after them', () => {
    expect(pileLayout(1, false)).toEqual({ groups: [0], more: null });
    expect(pileLayout(2, false)).toEqual({ groups: [-0.25, 0.25], more: null });
    expect(pileLayout(3, true)).toEqual({ groups: [-0.75, -0.25, 0.25], more: 0.75 });
  });
});

describe('dressedGroups', () => {
  it('dresses a pile whose every group has a figurine', () => {
    expect(
      dressedGroups('france', pilePieces([troop('infantry'), troop('infantry')])),
    ).toHaveLength(1);
  });

  it('leaves the whole pile to its plate when one group has none', () => {
    expect(dressedGroups('france', pilePieces([troop('infantry'), troop('armor')]))).toBeNull();
    expect(dressedGroups('italy', pilePieces([troop('infantry')]))).toBeNull();
    expect(dressedGroups('france', { groups: [], more: 0, troopIds: [] })).toBeNull();
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
