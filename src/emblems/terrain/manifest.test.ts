import { describe, expect, it } from 'vitest';
import { TERRAIN_PICTOS } from './manifest';

describe('terrain picto manifest', () => {
  it('gives each of the six types its own picto', () => {
    expect(Object.keys(TERRAIN_PICTOS)).toHaveLength(6);
    expect(new Set(Object.values(TERRAIN_PICTOS)).size).toBe(6);
  });
});
