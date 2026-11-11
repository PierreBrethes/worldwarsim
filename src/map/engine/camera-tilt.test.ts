import { describe, expect, it } from 'vitest';
import { boardHoldOf, nearPlaneAt, steepestTiltAt } from './camera-tilt';
import { HOVER_ALTITUDE } from './thread';

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

/** The camera's near plane keeps its 0.5 where the table was always seen from (d ≥ 3), and comes
 *  in with the closest zoom, which pieces drawn small brought down to d = 0.75. */
describe('the near plane', () => {
  it('stays at 0.5 from d = 3, as before the closest zoom came down', () => {
    expect(nearPlaneAt(3)).toBe(0.5);
    expect(nearPlaneAt(300)).toBe(0.5);
  });

  it('does not clip a plane hovering at the bottom of the screen at the closest zoom, tilted to the full', () => {
    // The eye the board renders through: 30° of field, backed off to frame what 42° did.
    const back = Math.tan((21 * Math.PI) / 180) / Math.tan((15 * Math.PI) / 180);
    const distance = 0.75;
    const tilt = steepestTiltAt(distance);
    const height = distance * back * Math.cos(tilt) - HOVER_ALTITUDE;
    const bottomRay = Math.PI / 2 - tilt + (15 * Math.PI) / 180;
    const depth = (height / Math.sin(bottomRay)) * Math.cos((15 * Math.PI) / 180);
    expect(depth).toBeGreaterThan(nearPlaneAt(distance));
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
