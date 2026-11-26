import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GEAR_MS, gearCues, gearPose, gearShare } from './outpost-gear';
import { SOCLE_TOP } from './works';

const site = (id: string, gear: string | null | undefined) => ({
  id,
  ...(gear === undefined ? {} : { gear }),
});

describe("an outpost's gear (#468)", () => {
  it('stands its trade alone at rest, the others not at all', () => {
    expect(gearShare('guet', 'guet', undefined, 0)).toBe(1);
    expect(gearShare('fort', 'guet', undefined, 0)).toBe(0);
    expect(gearShare('guet', null, undefined, 0)).toBe(0);
  });

  it('takes the old gear off before the new goes on, over the one run', () => {
    const run = { from: 'fort', to: 'guet', start: 0, ms: GEAR_MS };
    expect(gearShare('fort', 'guet', run, GEAR_MS / 4)).toBeCloseTo(0.5);
    expect(gearShare('guet', 'guet', run, GEAR_MS / 4)).toBe(0);
    expect(gearShare('fort', 'guet', run, (3 * GEAR_MS) / 4)).toBe(0);
    expect(gearShare('guet', 'guet', run, (3 * GEAR_MS) / 4)).toBeCloseTo(0.5);
    // A change of trade starts bare (ADR 0037 §7): the old gear goes over the whole run.
    const off = { from: 'magasin', to: null, start: 0, ms: GEAR_MS };
    expect(gearShare('magasin', null, off, GEAR_MS / 2)).toBeCloseTo(0.5);
    expect(gearShare('magasin', null, off, GEAR_MS)).toBe(0);
  });

  it('grows a group from the socle top, then draws its antenna out', () => {
    const top = new Vector3(0, SOCLE_TOP, 0);
    const high = new Vector3(0, SOCLE_TOP + 2, 0);
    const at = (part: string, share: number, drop = 0) =>
      high.clone().applyMatrix4(gearPose(new Matrix4(), part, share, drop));
    expect(at('magasin', 1).y).toBeCloseTo(high.y);
    expect(at('magasin', 0.5).y).toBeCloseTo(SOCLE_TOP + 1);
    expect(top.clone().applyMatrix4(gearPose(new Matrix4(), 'fort', 0.3, 0)).y).toBeCloseTo(
      SOCLE_TOP,
    );
    expect(gearPose(new Matrix4(), 'fort', 0, 0).determinant()).toBe(0);
    // The lookout's frame stands whole at half its run, its sections still drawn in.
    expect(at('guet', 0.5).y).toBeCloseTo(high.y);
    expect(at('antenne_3', 0.5, 4).y).toBeCloseTo(high.y - 4);
    expect(at('antenne_3', 0.75, 4).y).toBeCloseTo(high.y - 2);
    expect(at('antenne_3', 1, 4).y).toBeCloseTo(high.y);
  });

  it('cues an outpost whose gear changed, as it is played, and nothing else', () => {
    const before = [site('a', null), site('b', 'fort'), site('c', 'guet'), site('d', undefined)];
    const after = [site('a', 'guet'), site('b', null), site('c', 'guet'), site('d', undefined)];
    expect(gearCues(before, after, () => true)).toEqual([
      { id: 'a', from: null, to: 'guet' },
      { id: 'b', from: 'fort', to: null },
    ]);
    expect(gearCues(before, after, (id) => id === 'b')).toEqual([
      { id: 'b', from: 'fort', to: null },
    ]);
    // A view served whole is not a change: an outpost appearing stands as it is.
    expect(gearCues([], after, () => true)).toEqual([]);
  });
});
