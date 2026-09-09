import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '@/domain/ids';
import { BUILDING_SPRITES, buildingSprite } from './manifest';

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
    expect(new Set(drawn).size).toBe(drawn.length - 1);
    expect(drawn).toHaveLength(BUILDINGS.length);
  });
});
