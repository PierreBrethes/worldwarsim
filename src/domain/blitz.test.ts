import { describe, expect, it } from 'vitest';
import { theatreById } from './theatres';
import {
  contactAt,
  passModeOf,
  pursuitVerdict,
  theatreMinutesPer1000Km,
  withinTheatre,
} from './blitz';

const europe = theatreById('europe')!;
const pacific = theatreById('pacific')!;

describe('the theatre box', () => {
  it('holds Paris and refuses New York in Europe', () => {
    expect(withinTheatre(europe, [2.35, 48.85])).toBe(true);
    expect(withinTheatre(europe, [-74, 40.7])).toBe(false);
  });

  it('reads the Pacific across the antimeridian', () => {
    expect(withinTheatre(pacific, [-157.8, 21.3])).toBe(true);
    expect(withinTheatre(pacific, [139.7, 35.7])).toBe(true);
    expect(withinTheatre(pacific, [2.35, 48.85])).toBe(false);
  });
});

describe('the theatre pace (B1)', () => {
  it('puts Europe near five minutes per thousand kilometres', () => {
    const pace = theatreMinutesPer1000Km(europe);
    expect(pace).toBeGreaterThan(3.5);
    expect(pace).toBeLessThan(6);
  });

  it('crosses any theatre in fifteen to twenty minutes', () => {
    for (const theatre of [europe, pacific]) {
      const { west, south, east, north } = theatre.box;
      const heightKm = (north - south) * 111.2;
      const widthKm = (east - west) * 111.2 * Math.cos((((north + south) / 2) * Math.PI) / 180);
      const minutes = (Math.max(heightKm, widthKm) / 1000) * theatreMinutesPer1000Km(theatre);
      expect(minutes).toBeGreaterThanOrEqual(15);
      expect(minutes).toBeLessThanOrEqual(20);
    }
  });
});

describe('the pursuit (B18)', () => {
  it('strikes at contact', () => {
    expect(pursuitVerdict({ gapKm: 20, seen: true, reachKm: 25 })).toBe('strike');
  });

  it('keeps chasing what it still sees', () => {
    expect(pursuitVerdict({ gapKm: 300, seen: true, reachKm: 25 })).toBe('chase');
  });

  it('gives up on what left its sight', () => {
    expect(pursuitVerdict({ gapKm: 300, seen: false, reachKm: 25 })).toBe('lost');
  });

  const minute = 60_000;
  const westward = {
    id: 'a',
    points: [
      [0, 50],
      [10, 50],
    ] as const,
    departedAt: 0,
    arrivesAt: 10 * minute,
  };

  it('dates the contact with a camp on the road', () => {
    const camp = { id: 'b', points: [[5, 50]] as const, departedAt: 0, arrivesAt: 0 };
    const at = contactAt(westward, camp, 25, 0, 10 * minute);
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThan(4 * minute);
    expect(at!).toBeLessThan(5 * minute);
  });

  it('never meets a faster column running away', () => {
    const runaway = {
      id: 'b',
      points: [
        [3, 50],
        [30, 50],
      ] as const,
      departedAt: 0,
      arrivesAt: 10 * minute,
    };
    expect(contactAt(westward, runaway, 25, 0, 10 * minute)).toBeNull();
  });

  it('catches a slower column', () => {
    const crawler = {
      id: 'b',
      points: [
        [3, 50],
        [6, 50],
      ] as const,
      departedAt: 0,
      arrivesAt: 10 * minute,
    };
    expect(contactAt(westward, crawler, 25, 0, 10 * minute)).not.toBeNull();
  });
});

describe('charge against charge (B17)', () => {
  it('is a shock when the target pursues the attacker', () => {
    expect(passModeOf(['a1'], 'a1')).toBe('shock');
  });

  it('leaves the initiative to whoever strikes a target busy elsewhere', () => {
    expect(passModeOf(['a1'], 'c9')).toBe('initiative');
    expect(passModeOf(['a1'], null)).toBe('initiative');
  });
});
