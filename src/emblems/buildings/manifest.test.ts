import { describe, expect, it } from 'vitest';
import { BUILDINGS, CHOSEN_SPECIALTIES } from '@/domain/ids';
import {
  BUILDING_SPRITES,
  buildingMaquette,
  buildingSprite,
  OUTPOST_GEAR,
  OUTPOST_MAQUETTE,
} from './manifest';

describe('building sprite manifest', () => {
  it('answers for each key, and for nothing else', () => {
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
    expect(buildingMaquette('mine', 'coal')).not.toBe(buildingMaquette('mine', 'iron'));
    expect(buildingMaquette('mine', 'iron')).toBe(buildingMaquette('mine', null));
    expect(buildingMaquette('farm', 'coal')).toBe(buildingMaquette('farm', null));
  });
});

describe("the outpost's maquette (#468)", () => {
  it('stands one file for every outpost, an accessory group for each trade chosen, none for the generalist', () => {
    expect(OUTPOST_MAQUETTE).toMatch(/outpost\.glb$/);
    expect(OUTPOST_GEAR.general).toBeNull();
    const groups = CHOSEN_SPECIALTIES.map((specialty) => OUTPOST_GEAR[specialty]);
    expect(new Set(groups).size).toBe(CHOSEN_SPECIALTIES.length);
    expect(groups).not.toContain(null);
  });
});
