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

  /**
   * Fifteen visuals, not a hundred and twenty: the plate is neutral and the nation arrives at
   * display time. Two keys sharing a file would be the first step back toward per-nation
   * plates, by way of a placeholder nobody removes.
   */
  it('gives each key its own plate', () => {
    const drawn = BUILDINGS.map(buildingSprite).filter((url) => url !== null);
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(drawn).toHaveLength(BUILDINGS.length);
  });
});
