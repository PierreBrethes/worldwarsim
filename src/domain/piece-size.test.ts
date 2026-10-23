import { describe, expect, it } from 'vitest';
import { AIR_ALTITUDE, BOARD_KM, buildingSpan, objectiveSpan, troopSpan } from './piece-size';

const km = (span: number) => span * BOARD_KM;

describe('one scale for every piece (ADR 0035)', () => {
  it('lays each piece at its real size times 1 600', () => {
    // A 50 m barracks is a département wide; a 6 m tank 9.6 km long.
    expect(km(buildingSpan('barracks'))).toBeCloseTo(80, 6);
    expect(km(troopSpan('armor'))).toBeCloseTo(9.6, 6);
    expect(km(troopSpan('fighter'))).toBeCloseTo(17.6, 6);
  });

  it('stands the man at two and a half times his height', () => {
    // 1.75 m × 2.5 × 1 600: 7 km, under his barracks door (4.9 m × 1 600 ≈ 7.8 km).
    expect(km(troopSpan('infantry'))).toBeCloseTo(7, 6);
    expect(km(troopSpan('infantry'))).toBeLessThan(4.9 * 1.6);
  });

  it('draws the sea at half, its hulls and its ports alike', () => {
    expect(km(buildingSpan('port'))).toBeCloseTo(168, 6);
    expect(km(troopSpan('cargo'))).toBeCloseTo(104, 6);
    expect(troopSpan('cargo')).toBeLessThan(buildingSpan('port'));
  });

  it('keeps a hangar wider than a barracks, and every site a size of its own', () => {
    expect(buildingSpan('airfield')).toBeGreaterThan(buildingSpan('barracks'));
    expect(buildingSpan('depot')).toBe(buildingSpan('warehouse'));
    expect(objectiveSpan('fuelDump')).toBeGreaterThan(0);
    expect(objectiveSpan('unknown')).toBeGreaterThan(0);
  });

  it('flies a plane some three fighter wingspans above the ground', () => {
    expect(km(AIR_ALTITUDE)).toBeCloseTo(3 * 17.6, 6);
  });
});
