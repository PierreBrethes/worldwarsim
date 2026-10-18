import { describe, expect, it } from 'vitest';
import { RACE_HOLD_HOURS, clockVerdictOf, raceLeaderOf } from './strategic-points';

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
