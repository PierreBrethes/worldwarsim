import { describe, expect, it } from 'vitest';
import { RESOURCES } from '@/domain/ids';
import { RESOURCE_PLATES, resourcePlate } from './manifest';

describe('resource plate manifest', () => {
  it('answers for each of the eight keys, and for nothing else', () => {
    for (const key of RESOURCES) {
      expect(RESOURCE_PLATES, key).toHaveProperty(key);
    }
    expect(Object.keys(RESOURCE_PLATES)).toHaveLength(RESOURCES.length);
  });

  /** Two keys sharing a file would mean one of them is standing in for the other — the kind
   *  of placeholder that survives because nothing fails while it is there. */
  it('gives each key its own plate', () => {
    const drawn = RESOURCES.map(resourcePlate).filter((url) => url !== null);
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(drawn).toHaveLength(RESOURCES.length);
  });
});
