import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '@/domain/ids';
import { BUILDING_SPRITES, buildingMaquette, buildingSprite } from './manifest';

describe('building sprite manifest', () => {
  it('answers for each of the fifteen keys, and for nothing else', () => {
    for (const key of BUILDINGS) {
      expect(BUILDING_SPRITES, key).toHaveProperty(key);
    }
    expect(Object.keys(BUILDING_SPRITES)).toHaveLength(BUILDINGS.length);
  });

  it('renders a historical depot with the warehouse plate', () => {
    expect(buildingSprite('depot')).toBe(buildingSprite('warehouse'));
  });

  it('gives every current building its own plate', () => {
    const drawn = BUILDINGS.map(buildingSprite).filter((url) => url !== null);
    // The depot reads as the warehouse.
    expect(new Set(drawn).size).toBe(drawn.length - 1);
    expect(drawn).toHaveLength(BUILDINGS.length);
  });
});

describe('building maquette manifest', () => {
  it('stands a maquette for every building, a depot as the warehouse it reads as', () => {
    for (const key of BUILDINGS) expect(buildingMaquette(key, null), key).not.toBeNull();
    expect(buildingMaquette('depot', null)).toBe(buildingMaquette('warehouse', null));
  });

  it('sinks a coal mine on coal, and the plain mine anywhere else', () => {
    expect(buildingMaquette('mine', 'coal')).not.toBe(buildingMaquette('mine', 'ore'));
    expect(buildingMaquette('mine', 'ore')).toBe(buildingMaquette('mine', null));
    expect(buildingMaquette('farm', 'coal')).toBe(buildingMaquette('farm', null));
  });
});
