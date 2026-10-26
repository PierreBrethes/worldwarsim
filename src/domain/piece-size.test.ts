import { describe, expect, it } from 'vitest';
import { NATIONS } from './ids';
import { AIR_ALTITUDE, BOARD_KM, buildingSpan, objectiveSpan, troopSpan } from './piece-size';

const km = (span: number) => span * BOARD_KM;

describe('one scale for every piece (ADR 0035)', () => {
  it('lays each piece at its real size times 1 600', () => {
    // A 50 m barracks is a département wide; a 6 m tank 9.6 km long.
    expect(km(buildingSpan('barracks'))).toBeCloseTo(80, 6);
    expect(km(troopSpan('armor'))).toBeCloseTo(9.6, 6);
    expect(km(troopSpan('fighter'))).toBeCloseTo(17.6, 6);
  });

  it("stands the man at one and a half times his height, about a tank's height", () => {
    // 1.75 m × 1.5 × 1 600: 4.2 km, under his barracks door (3.4 m × 1 600 ≈ 5.4 km).
    expect(km(troopSpan('infantry'))).toBeCloseTo(4.2, 6);
    expect(km(troopSpan('infantry'))).toBeLessThan(3.4 * 1.6);
  });

  it("measures each nation's tank at its real length: the R35 at 4 m, the T-34 at 6.7", () => {
    expect(km(troopSpan('armor', 'france', 1))).toBeCloseTo(4.02 * 1.6, 6);
    expect(km(troopSpan('armor', 'ussr', 2))).toBeCloseTo(6.68 * 1.6, 6);
    expect(troopSpan('infantry', 'france', 1)).toBe(troopSpan('infantry'));
  });

  it("never draws a nation's first tank longer than its second, but the Chinese Vickers over its T-26", () => {
    for (const nation of NATIONS)
      if (nation !== 'china')
        expect(troopSpan('armor', nation, 1)).toBeLessThan(troopSpan('armor', nation, 2));
    expect(troopSpan('armor', 'china', 1)).toBeGreaterThan(troopSpan('armor', 'china', 2));
  });

  it('draws the sea at half, its hulls and its ports alike', () => {
    expect(km(buildingSpan('port'))).toBeCloseTo(168, 6);
    expect(km(troopSpan('cargo'))).toBeCloseTo(104, 6);
    expect(troopSpan('cargo')).toBeLessThan(buildingSpan('port'));
  });

  it('keeps a hangar as wide as a barracks (50 m, #286), and every site a size of its own', () => {
    expect(buildingSpan('airfield')).toBe(buildingSpan('barracks'));
    expect(buildingSpan('depot')).toBe(buildingSpan('warehouse'));
    expect(objectiveSpan('fuelDump')).toBeGreaterThan(0);
    expect(objectiveSpan('unknown')).toBeGreaterThan(0);
  });

  it('flies a plane some three fighter wingspans above the ground', () => {
    expect(km(AIR_ALTITUDE)).toBeCloseTo(3 * 17.6, 6);
  });
});
