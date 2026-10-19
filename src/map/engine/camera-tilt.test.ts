import { describe, expect, it } from 'vitest';
import { edgeSafeTiltAt, steepestTiltAt, targetPullOf, tiltShiftOf } from './camera-tilt';

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

describe('the tilt that keeps the far edge of the board out of the picture', () => {
  const fov = 40;

  it('puts the top ray of the screen exactly on the edge', () => {
    const tilt = edgeSafeTiltAt(60, fov, 90);
    const half = (fov * Math.PI) / 360;
    const reach = 60 * Math.cos(tilt) * Math.tan(tilt + half) - 60 * Math.sin(tilt);
    expect(reach).toBeCloseTo(90, 6);
  });

  it('leans further when the edge is far, and straightens as it comes close', () => {
    expect(edgeSafeTiltAt(60, fov, 200)).toBeGreaterThan(edgeSafeTiltAt(60, fov, 90));
    expect(edgeSafeTiltAt(60, fov, 70)).toBeLessThan(edgeSafeTiltAt(60, fov, 90));
  });

  it('stays upright when even the plumb sees past the edge', () => {
    expect(edgeSafeTiltAt(300, fov, 100)).toBe(0);
  });
});

describe('the pull of the target back toward the middle of the board', () => {
  const fov = 40;
  const half = (fov * Math.PI) / 360;

  it('does not move a target whose edge the allowed tilt already hides', () => {
    const edge = 90;
    const tilt = edgeSafeTiltAt(60, fov, edge);
    expect(targetPullOf(60, fov, tilt, edge, 80)).toBeCloseTo(0, 6);
  });

  it('pulls only what the upright still sees past the edge', () => {
    expect(targetPullOf(100, fov, 0, 20, 80)).toBeCloseTo(100 * Math.tan(half) - 20, 6);
  });

  it('measures at the tilt the board allows, not a steeper one that is about to yield', () => {
    expect(targetPullOf(60, fov, 0, 20, 80)).toBeLessThan(targetPullOf(60, fov, 0.57, 20, 80));
  });

  it('never carries the target past the middle', () => {
    expect(targetPullOf(300, fov, 0, 10, 25)).toBe(25);
    expect(targetPullOf(300, fov, 0, 10, -5)).toBe(0);
  });
});
