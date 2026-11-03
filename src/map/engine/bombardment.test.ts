import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { ReplayView } from '@/domain/player-view';
import { replayAt, stepBounds, VOLLEY_SHARE } from '@/domain/replay';
import { ARC_RISE, arcAt, arcPoints } from './bombardment';

/** My gun on two of theirs: the shooter's scene, its target alone (`stagedOf`). */
const shelled: ReplayView = {
  combatId: 'b',
  at: 0,
  point: { lon: 2.3, lat: 49.9 },
  side: 'attacker',
  won: true,
  mine: [],
  theirs: { troops: 2, lost: 40, routed: 0, destroyed: 1 },
  bombardment: { from: { lon: 2.35, lat: 49.2 } },
};
const frappe = stepBounds('frappe');
const riposte = stepBounds('riposte');
const volley = VOLLEY_SHARE * (frappe.end - frappe.start);

describe('the arc of ink', () => {
  it('rises from the muzzle to the target, its middle a share of the chord above', () => {
    const points = arcPoints(new Vector3(0, 0, 0), new Vector3(10, 0, 0));
    expect(points[0]!.toArray()).toEqual([0, 0, 0]);
    expect(points.at(-1)!.toArray()).toEqual([10, 0, 0]);
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(ARC_RISE * 10, 1);
  });

  it('is traced over the flight, held to the end of the strike, then fades over the silence', () => {
    const at = (t: number) => arcAt(replayAt(shelled, t), 'full');
    expect(at(frappe.start - 1)).toBeNull();
    expect(at(frappe.start + volley / 2)).toEqual({ drawn: 0.5, opacity: 1 });
    expect(at(frappe.start + volley + 1)).toEqual({ drawn: 1, opacity: 1 });
    expect(at(riposte.start + (riposte.end - riposte.start) / 2)!.opacity).toBeCloseTo(0.5);
    expect(at(riposte.end + 1)).toBeNull();
  });

  it('lies whole on the held strike when reduced, and is not drawn when cut', () => {
    expect(arcAt(replayAt(shelled, frappe.start + 1, 'reduced'), 'reduced')).toEqual({
      drawn: 1,
      opacity: 1,
    });
    expect(arcAt(replayAt(shelled, riposte.start + 1, 'reduced'), 'reduced')).toBeNull();
    expect(arcAt(replayAt(shelled, frappe.start + volley), 'off')).toBeNull();
  });

  it('is not traced over a strike their side fires', () => {
    const target = { ...shelled, side: 'defender' as const, bombardment: {} };
    expect(arcAt(replayAt(target, frappe.start + volley / 2), 'full')).toBeNull();
  });
});
