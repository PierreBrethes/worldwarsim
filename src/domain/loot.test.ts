import { describe, expect, it } from 'vitest';
import { CARRY_CAPACITY_BY_ROLE } from '../../convex/constants';
import type { ResourceKey, UnitRole } from './ids';
import { carryCapacityOf, lootFromSurplus, trimLootToCapacity } from './loot';

const capacities: Readonly<Record<UnitRole, number>> = CARRY_CAPACITY_BY_ROLE;

const resources = (
  held: Partial<Record<ResourceKey, number>>,
): Readonly<Record<ResourceKey, number>> => ({
  food: 0,
  textile: 0,
  coal: 0,
  oil: 0,
  ore: 0,
  alloy: 0,
  ammunition: 0,
  bandages: 0,
  ...held,
});

describe('carryCapacityOf', () => {
  it.each([
    ['infantry', 40],
    ['armor', 0],
    ['landTransport', 120],
    ['fighter', 0],
    ['bomber', 0],
    ['airTransport', 80],
    ['escort', 0],
    ['cargo', 240],
    ['carrier', 0],
  ] as const)('applies the nominal cargo decided for %s', (role, expected) => {
    expect(carryCapacityOf([{ role, strength: 10, nominalStrength: 10 }], capacities)).toBe(
      expected,
    );
  });

  it('adds each selected troop contribution at its current strength ratio', () => {
    expect(
      carryCapacityOf(
        [
          { role: 'infantry', strength: 25, nominalStrength: 50 },
          { role: 'landTransport', strength: 18, nominalStrength: 24 },
          { role: 'cargo', strength: 0, nominalStrength: 8 },
          { role: 'armor', strength: 12, nominalStrength: 12 },
        ],
        capacities,
      ),
    ).toBe(110);
  });

  it('does not grant capacity beyond a troop nominal strength or for an invalid nominal', () => {
    expect(
      carryCapacityOf(
        [
          { role: 'airTransport', strength: 9, nominalStrength: 6 },
          { role: 'cargo', strength: 8, nominalStrength: 0 },
        ],
        capacities,
      ),
    ).toBe(80);
  });
});

describe('lootFromSurplus', () => {
  it('protects the base reserve and takes only positive surplus', () => {
    expect(lootFromSurplus(resources({ food: 430, textile: 399, coal: 410 }), 400, 100)).toEqual(
      resources({ food: 30, coal: 10 }),
    );
  });

  it('shares a limited capacity in proportion to the positive surpluses', () => {
    expect(lootFromSurplus(resources({ food: 460, textile: 430, coal: 410 }), 400, 50)).toEqual(
      resources({ food: 30, textile: 15, coal: 5 }),
    );
  });

  it('returns no loot when capacity is not positive', () => {
    expect(lootFromSurplus(resources({ alloy: 900 }), 400, 0)).toEqual(resources({}));
  });
});

describe('trimLootToCapacity', () => {
  it('reduces every carried resource proportionally after capacity losses', () => {
    expect(trimLootToCapacity(resources({ food: 60, textile: 30, coal: 10 }), 50)).toEqual(
      resources({ food: 30, textile: 15, coal: 5 }),
    );
  });

  it('never creates cargo through floating-point residue', () => {
    const trimmed = trimLootToCapacity(resources({ food: 1, textile: 1, coal: 1 }), 2);
    const total = Object.values(trimmed).reduce((sum, amount) => sum + amount, 0);

    expect(total).toBe(2);
    expect(trimmed.food).toBeLessThanOrEqual(1);
    expect(trimmed.textile).toBeLessThanOrEqual(1);
    expect(trimmed.coal).toBeLessThanOrEqual(1);
  });

  it('leaves an already transportable cargo unchanged', () => {
    const loot = resources({ oil: 12.5, ammunition: 4 });

    expect(trimLootToCapacity(loot, 20)).toEqual(loot);
  });
});
