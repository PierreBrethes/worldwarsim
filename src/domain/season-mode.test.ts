import { describe, expect, it } from 'vitest';
import { creationRefusalOf, modeOf, MODE_RULES, seatRangeOf } from './season-mode';
import { THEATRES, theatreById, theatreCenter } from './theatres';

describe('season mode', () => {
  it('reads an absent mode as a Mondiale', () => {
    expect(modeOf(undefined)).toBe('mondiale');
    expect(modeOf('blitz')).toBe('blitz');
  });

  it('fixes the clock and the seats of each mode', () => {
    expect(MODE_RULES.blitz).toMatchObject({ clockHours: 2 });
    expect(seatRangeOf('mondiale', null)).toEqual({ min: 2, max: 8 });
  });

  /** Fixed by the placement tests (`convex/blitz.test.ts`, T1): six seeds each, 14/10. */
  it('seats a Blitz as its theatre holds the table', () => {
    expect(seatRangeOf('blitz', 'europe')).toEqual({ min: 2, max: 4 });
    expect(seatRangeOf('blitz', 'mediterranean')).toEqual({ min: 2, max: 4 });
    expect(seatRangeOf('blitz', 'americas')).toEqual({ min: 2, max: 4 });
    expect(seatRangeOf('blitz', 'pacific')).toEqual({ min: 2, max: 3 });
  });

  it('asks a Blitz for a known theatre and refuses one on a Mondiale', () => {
    expect(creationRefusalOf('blitz', undefined)).toBe('THEATRE_REQUIRED');
    expect(creationRefusalOf('blitz', 'atlantis')).toBe('UNKNOWN_THEATRE');
    expect(creationRefusalOf('blitz', 'europe')).toBeNull();
    expect(creationRefusalOf('mondiale', undefined)).toBeNull();
    expect(creationRefusalOf('mondiale', 'europe')).toBe('THEATRE_ONLY_IN_BLITZ');
  });
});

describe('theatres', () => {
  it('lists at least four theatres, each centred inside the longitude range', () => {
    expect(THEATRES.length).toBeGreaterThanOrEqual(4);
    for (const theatre of THEATRES) {
      const [lon] = theatreCenter(theatre);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(theatreById(theatre.id)).toBe(theatre);
    }
  });

  it('centres the Pacific across the antimeridian', () => {
    const [lon] = theatreCenter(theatreById('pacific')!);
    expect(lon).toBeGreaterThan(150);
  });
});
