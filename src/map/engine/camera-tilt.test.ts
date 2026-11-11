import { describe, expect, it } from 'vitest';
import { boardHoldOf, EYE_BACKOFF, EYE_FOV, nearPlaneAt, steepestTiltAt } from './camera-tilt';
import { CLOSEST_DISTANCE } from './closest-distance';
import { COUNTRY_THICKNESS, SEA_LEVEL } from './frame';

/**
 * Penché sur la table au rapproché, la carte entière lue de plus haut : l'inclinaison permise
 * se resserre quand on s'éloigne, et l'aplomb reste toujours possible.
 */
describe('the tilt the table allows', () => {
  it('lets the eye lean right over the table up close', () => {
    expect(steepestTiltAt(3)).toBeCloseTo(1.15);
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

/** Below d = 0.75 the ceiling lifts to show pieces in profile (#535), up to 1.3 from d = 0.4. */
describe('the tilt the closest zoom allows', () => {
  it('is the old ceiling at d = 0.75, and 1.3 from d = 0.4 down to the closest zoom', () => {
    expect(steepestTiltAt(0.75)).toBeCloseTo(1.15);
    for (const d of [0.4, 0.3, CLOSEST_DISTANCE]) expect(steepestTiltAt(d)).toBeCloseTo(1.3);
  });

  it('leans further and further as the zoom comes in, never back', () => {
    const tilts: number[] = [];
    for (let d = 1; d >= CLOSEST_DISTANCE; d -= 0.01) tilts.push(steepestTiltAt(d));
    for (let k = 1; k < tilts.length; k++) expect(tilts[k]).toBeGreaterThanOrEqual(tilts[k - 1]!);
  });
});

/** The camera's near plane keeps its 0.5 where the table was always seen from (d ≥ 3), and comes
 *  in with the closest zoom, which pieces drawn small brought down to d = 0.25. */
describe('the near plane', () => {
  it('stays at 0.5 from d = 3, as before the closest zoom came down', () => {
    expect(nearPlaneAt(3)).toBe(0.5);
    expect(nearPlaneAt(300)).toBe(0.5);
  });

  it('keeps the ground at the bottom of the screen out of the near plane at the closest zoom, tilted to the full', () => {
    // The eye the board renders through: 30° of field, backed off to frame what 42° did.
    const half = (EYE_FOV * Math.PI) / 360;
    const tilt = steepestTiltAt(CLOSEST_DISTANCE);
    // Above the sheet, not the target: the game aims at the top of the land (`COUNTRY_THICKNESS`),
    // the sea lies lower (`SEA_LEVEL`).
    const height = CLOSEST_DISTANCE * EYE_BACKOFF * Math.cos(tilt) + COUNTRY_THICKNESS - SEA_LEVEL;
    const bottomRay = Math.PI / 2 - tilt + half;
    const depth = (height / Math.sin(bottomRay)) * Math.cos(half);
    expect(depth).toBeGreaterThan(nearPlaneAt(CLOSEST_DISTANCE));
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
