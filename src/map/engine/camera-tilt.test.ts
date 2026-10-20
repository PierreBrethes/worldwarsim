import { describe, expect, it } from 'vitest';
import { boardHoldOf, steepestTiltAt, tiltShiftOf } from './camera-tilt';

/**
 * Penché sur la table au rapproché, la carte entière lue de plus haut : l'inclinaison permise
 * se resserre quand on s'éloigne, et l'aplomb reste toujours possible.
 */
describe('the tilt the table allows', () => {
  it('lets the eye lean right over the table up close', () => {
    expect(steepestTiltAt(4)).toBeCloseTo(1.15);
    expect(steepestTiltAt(30)).toBeCloseTo(1.15);
  });

  it('reads the whole world from higher up, yet still at the opening angle', () => {
    expect(steepestTiltAt(300)).toBeCloseTo(0.9);
    // L'ouverture du plateau, (30, 250, 300) ramenée à 300 : elle ne doit pas sauter.
    expect(steepestTiltAt(300)).toBeGreaterThan(Math.atan2(Math.hypot(30, 300), 250));
  });

  it('straightens steadily in between', () => {
    const tilts = [30, 60, 120, 200, 300].map(steepestTiltAt);
    for (let k = 1; k < tilts.length; k++) expect(tilts[k]).toBeLessThan(tilts[k - 1]!);
  });

  it('holds past the usual ceiling, where a search area may lift it', () => {
    expect(steepestTiltAt(900)).toBeCloseTo(0.9);
  });
});

describe('the tilt-shift blur', () => {
  it('is nil straight down and full at the most grazing pitch up close', () => {
    expect(tiltShiftOf(0, 10)).toBe(0);
    expect(tiltShiftOf(steepestTiltAt(10), 10)).toBeCloseTo(1);
  });

  it('grows with the lean', () => {
    expect(tiltShiftOf(0.9, 10)).toBeGreaterThan(tiltShiftOf(0.5, 10));
  });

  it('is nil at the world view whatever the lean', () => {
    expect(tiltShiftOf(steepestTiltAt(120), 120)).toBe(0);
    expect(tiltShiftOf(steepestTiltAt(65), 65)).toBe(0);
  });
});

describe('the gentle hold that keeps the target on the board (#187)', () => {
  it('leaves a target anywhere on the board alone, edges included', () => {
    expect(boardHoldOf(0, 104, 0.12)).toBe(0);
    expect(boardHoldOf(-104, 104, 0.12)).toBe(0);
    expect(boardHoldOf(199, 200, 0.12)).toBe(0);
  });

  it('brings a target past the edge back by a share of its overshoot, not at once', () => {
    expect(boardHoldOf(-124, 104, 0.12)).toBeCloseTo(20 * 0.12);
    expect(boardHoldOf(230, 200, 0.12)).toBeCloseTo(-30 * 0.12);
  });

  it('never carries the target past the edge back onto the board', () => {
    expect(boardHoldOf(-124, 104, 1)).toBeCloseTo(20);
  });

  it('settles the last hair at once, so the loop stops asking for frames', () => {
    expect(boardHoldOf(104.0005, 104, 0.12)).toBeCloseTo(-0.0005, 6);
  });
});
