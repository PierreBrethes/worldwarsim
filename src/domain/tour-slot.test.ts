import { describe, expect, it } from 'vitest';
import { tourHoldsSlot } from './tour-slot';

describe('tourHoldsSlot', () => {
  it('lets a tour at home go without a slot', () => {
    expect(tourHoldsSlot(['DEU', 'DEU', 'DEU'], 'DEU')).toBe(false);
  });

  it('keeps the slot as soon as one stop stands abroad', () => {
    expect(tourHoldsSlot(['DEU', 'DEU', 'POL'], 'DEU')).toBe(true);
    expect(tourHoldsSlot(['POL', 'DEU'], 'DEU')).toBe(true);
  });

  it('keeps the slot when a country is unknown, or the nation has no home', () => {
    expect(tourHoldsSlot(['DEU', null], 'DEU')).toBe(true);
    expect(tourHoldsSlot(['DEU'], null)).toBe(true);
  });
});
