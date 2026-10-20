import { describe, expect, it } from 'vitest';
import { rangoonReachOf } from './labels';
import {
  DRAW_RULES,
  POINTS_DRAWN,
  POINT_TRAITS,
  RACE_HOLD_HOURS,
  RACE_TO_WIN,
  STRATEGIC_POINT_KEYS,
  clockVerdictOf,
  drawHolds,
  drawPoints,
  isRangoonColumn,
  powerReady,
  raceLeaderOf,
} from './strategic-points';

/**
 * **La victoire de la Mondiale** (M1, M12, ADR 0027 §4) : quatre points sur sept tenus vingt-quatre
 * heures d'affilée ; à défaut, à l'horloge, le cumul d'heures de points tenus, puis le territoire.
 */
describe('the race for the Seven', () => {
  it('has a leader once a player holds four points, and none before', () => {
    expect(
      raceLeaderOf(
        new Map([
          ['fr', 3],
          ['de', 3],
        ]),
      ),
    ).toBeNull();
    expect(
      raceLeaderOf(
        new Map([
          ['fr', 4],
          ['de', 3],
        ]),
      ),
    ).toBe('fr');
    expect(raceLeaderOf(new Map([['fr', 5]]))).toBe('fr');
  });

  it('is won after a full day', () => {
    expect(RACE_HOLD_HOURS).toBe(24);
  });
});

describe('the clock, as a net', () => {
  const HOUR = 3_600_000;

  it('goes to the most hours of points held', () => {
    expect(
      clockVerdictOf([
        { id: 'fr', heldMs: 30 * HOUR, regions: 10 },
        { id: 'de', heldMs: 12 * HOUR, regions: 90 },
      ]),
    ).toEqual({ winnerId: 'fr', reason: 'clock' });
  });

  it('breaks a tie on hours with the territory', () => {
    expect(
      clockVerdictOf([
        { id: 'fr', heldMs: 0, regions: 10 },
        { id: 'de', heldMs: 0, regions: 90 },
      ]),
    ).toEqual({ winnerId: 'de', reason: 'territory' });
  });

  it('is a draw when hours and territory are equal at the top', () => {
    expect(
      clockVerdictOf([
        { id: 'fr', heldMs: HOUR, regions: 40 },
        { id: 'de', heldMs: HOUR, regions: 40 },
        { id: 'it', heldMs: 0, regions: 99 },
      ]),
    ).toEqual({ winnerId: null, reason: 'draw' });
  });
});

/**
 * **Les pouvoirs des points se rechargent, sans cumul** (P4) : Istanbul une fois par jour de
 * saison, Tanger une fois par édition. Le compte part du lancement, comme le jour de la presse.
 */
describe('a point power', () => {
  const HOUR = 3_600_000;
  const LAUNCH = Date.UTC(2026, 9, 18, 12);

  it('is ready when never used', () => {
    expect(powerReady(undefined, LAUNCH, 24, LAUNCH + HOUR)).toBe(true);
  });

  it('is spent until the next period of the season, whatever the hour it was used', () => {
    expect(powerReady(LAUNCH + 23 * HOUR, LAUNCH, 24, LAUNCH + 23.5 * HOUR)).toBe(false);
    expect(powerReady(LAUNCH + 23 * HOUR, LAUNCH, 24, LAUNCH + 24 * HOUR)).toBe(true);
    expect(powerReady(LAUNCH + 1 * HOUR, LAUNCH, 3, LAUNCH + 2.9 * HOUR)).toBe(false);
    expect(powerReady(LAUNCH + 1 * HOUR, LAUNCH, 3, LAUNCH + 3 * HOUR)).toBe(true);
  });
});

/** **Le tirage des points** : dix lieux au vivier, sept par saison, les contraintes tenues. */
describe('the draw of the Seven', () => {
  it('draws seven of the ten, whatever the seed, and every draw holds the constraints', () => {
    expect(STRATEGIC_POINT_KEYS).toHaveLength(10);
    const seen = new Set<string>();
    for (let seed = 0; seed < 5_000; seed += 1) {
      const keys = drawPoints(seed);
      expect(keys).toHaveLength(POINTS_DRAWN);
      expect(drawHolds(keys)).toBe(true);
      seen.add([...keys].sort().join());
    }
    // Several seeds, several tables: the draw is a draw.
    expect(seen.size).toBeGreaterThan(10);
  });

  it('is the same for the same seed', () => {
    expect(drawPoints(1234)).toEqual(drawPoints(1234));
  });

  it('keeps one leader at a time: two could hold four points each only among eight or more', () => {
    expect(2 * RACE_TO_WIN).toBeGreaterThan(POINTS_DRAWN);
  });

  it('never leaves out the diversity: families, three stars at most, one star at least', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const traits = drawPoints(seed).map((key) => POINT_TRAITS[key]);
      expect(new Set(traits.map((one) => one.family)).size).toBeGreaterThanOrEqual(
        DRAW_RULES.minFamilies,
      );
      expect(traits.filter((one) => one.stars === 3).length).toBeLessThanOrEqual(
        DRAW_RULES.maxThreeStars,
      );
      expect(traits.filter((one) => one.stars === 1).length).toBeGreaterThanOrEqual(
        DRAW_RULES.minOneStar,
      );
    }
  });

  it('never draws Lisbon and Tangier together, which sit five hundred kilometres apart', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const keys = drawPoints(seed);
      expect(keys.includes('lisbon') && keys.includes('tangier')).toBe(false);
    }
  });
});

describe('Rangoon', () => {
  const onTour = (troop: { tour: boolean }) => troop.tour;

  it('gives the half reach to a pile or a column wholly on tour, and to nothing else', () => {
    expect(isRangoonColumn([{ tour: true }, { tour: true }], onTour)).toBe(true);
    expect(isRangoonColumn([{ tour: true }, { tour: false }], onTour)).toBe(false);
    expect(isRangoonColumn([], onTour)).toBe(false);
  });

  it('draws only the ring an infantry sights the tour from, or adds it to a reach already drawn', () => {
    expect(rangoonReachOf([2, 48])).toEqual({
      lonLat: [2, 48],
      detectionKm: 0,
      contactKm: null,
      sightedKm: 30,
    });
    expect(
      rangoonReachOf([2, 48], { lonLat: [2, 48], detectionKm: 120, contactKm: null }),
    ).toMatchObject({ detectionKm: 120, sightedKm: 30 });
  });
});
