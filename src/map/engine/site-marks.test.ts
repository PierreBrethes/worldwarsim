import { describe, expect, it } from 'vitest';
import type { StandingMaquette } from './maquettes';
import {
  flagCues,
  flagHeight,
  SEAL_SCALE,
  sealHeight,
  STAPLE_STEPS,
  stapleShare,
} from './site-marks';

const clock = { progress: 0, at: 0, rate: 1, durationMs: 1000, rest: null };
const maquette = (
  id: string,
  buildingId: string,
  side: NonNullable<StandingMaquette['side']>,
  capture?: 'capturer' | 'defender',
): StandingMaquette => ({
  id,
  at: { lonLat: [9, 45] },
  url: 'barracks.glb',
  span: 1,
  washed: false,
  side,
  buildingId,
  ...(capture !== undefined && { capture: { clock, side: capture, stopped: false } }),
});

describe('flagCues (#279)', () => {
  it('hoists my flag on the site my capture took, and on no other', () => {
    const before = [
      maquette('installation-x', 'x', 'seen', 'capturer'),
      maquette('installation-y', 'y', 'seen', 'capturer'),
      maquette('installation-z', 'z', 'seen'),
    ];
    const after = [
      maquette('building-x', 'x', 'mine'),
      // Lifted: no infantry left, the site stays theirs.
      maquette('installation-y', 'y', 'seen'),
      maquette('building-z', 'z', 'mine'),
    ];
    expect(flagCues(before, after)).toEqual({ hoisted: ['building-x'], lowered: [] });
  });

  it('lowers my flag on the site a capture took from me, and on no other of the fall', () => {
    const lost = maquette('building-x', 'x', 'mine', 'defender');
    const before = [
      lost,
      maquette('building-y', 'y', 'mine', 'defender'),
      maquette('building-hq', 'hq', 'mine'),
    ];
    // The barracks surveyed again, the HQ gone with it: only the site aimed at plays.
    const after = [maquette('installation-x', 'x', 'seen'), maquette('building-y', 'y', 'mine')];
    expect(flagCues(before, after)).toEqual({ hoisted: [], lowered: [lost] });
  });

  it('plays nothing while the capture runs', () => {
    const before = [maquette('building-x', 'x', 'mine', 'defender')];
    expect(flagCues(before, before)).toEqual({ hoisted: [], lowered: [] });
  });
});

describe('the staple and the flag (#279)', () => {
  it('counts the capture by steps', () => {
    expect(stapleShare(clock, 0)).toBe(0);
    expect(stapleShare(clock, 1000 / STAPLE_STEPS - 1)).toBe(0);
    expect(stapleShare(clock, 500)).toBe(0.5);
    expect(stapleShare(clock, 5000)).toBe(1);
  });

  it('holds a flag where it starts, then runs it to its end', () => {
    const down = { from: 1, to: 0, start: 100, ms: 1000 };
    expect(flagHeight(down, 0)).toBe(1);
    expect(flagHeight(down, 600)).toBe(0.75);
    expect(flagHeight(down, 2000)).toBe(0);
    const up = { from: 0, to: 1, start: 100, ms: 1000 };
    expect(flagHeight(up, 600)).toBe(0.875);
  });
});

describe('sealHeight (#279)', () => {
  it('keeps a mark high enough, and lifts a low one until its planks clear the socle', () => {
    expect(sealHeight(9, 3.4, 2.2)).toBe(9);
    const lifted = sealHeight(3, 3.4, 2.2);
    expect(lifted - (Math.sin(0.6) * 3.4 * SEAL_SCALE) / 2).toBeCloseTo(2.4);
  });
});
