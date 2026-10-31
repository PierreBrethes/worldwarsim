import { describe, expect, it } from 'vitest';
import {
  COMBATS_AT_ONCE,
  combatAt,
  FINAL_POSE_MS,
  freshCombats,
  homewardOf,
  playsWhole,
} from './combat-on-map';
import { SQUAD_DRAWN_WHOLE } from './pile-pieces';
import { REPLAY_MS, stepBounds } from './replay';
import type { ArcView, CombatReport, ReplayView } from './player-view';

const report = (id: string, cause: CombatReport['cause'] = 'arrival') =>
  ({ id, cause, point: { lon: 4.9, lat: 49.7 } }) as CombatReport;

const view: ReplayView = {
  combatId: 'c1',
  at: 0,
  point: { lon: 4.9, lat: 49.7 },
  side: 'attacker',
  won: true,
  mine: [
    { role: 'infantry', tier: 1, troops: 2, lost: 120, routed: 0, destroyed: 1 },
    { role: 'armor', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0 },
  ],
  theirs: { troops: 3, lost: 300, routed: 1, destroyed: 1 },
};

describe('freshCombats', () => {
  it('plays nothing on the first view', () => {
    expect(freshCombats(null, [report('a')])).toEqual([]);
  });

  it('plays the reports the view before did not have, a land arrival only', () => {
    const fresh = freshCombats(new Set(['a']), [
      report('a'),
      report('b'),
      report('c', 'interception'),
      report('d', 'bombardment'),
    ]);
    expect(fresh.map((each) => each.id)).toEqual(['b']);
  });
});

describe('playsWhole', () => {
  it('plays up to twelve pieces a side, and beyond only the final pose', () => {
    expect(SQUAD_DRAWN_WHOLE).toBe(12);
    const theirs = (troops: number) => ({ ...view, theirs: { ...view.theirs, troops } });
    expect(playsWhole(theirs(12))).toBe(true);
    expect(playsWhole(theirs(13))).toBe(false);
    const mine: ReplayView = {
      ...view,
      mine: [
        { role: 'infantry', tier: 1, troops: 7, lost: 0, routed: 0, destroyed: 0 },
        { role: 'armor', tier: 1, troops: 6, lost: 0, routed: 0, destroyed: 0 },
      ],
    };
    expect(playsWhole(mine)).toBe(false);
  });

  it('keeps three combats at once', () => {
    expect(COMBATS_AT_ONCE).toBe(3);
  });
});

describe('combatAt', () => {
  const inStrike = stepBounds('frappe').start + 100;

  it('plays the replay at full motion, to its end', () => {
    const shown = combatAt(view, inStrike, 'full', true);
    expect(shown.frame.step).toBe('frappe');
    expect(shown.frame.progress).toBeLessThan(0.1);
    expect(shown.over).toBe(false);
    expect(combatAt(view, REPLAY_MS, 'full', true).over).toBe(true);
  });

  it('holds each of the six steps played out when reduced', () => {
    const shown = combatAt(view, inStrike, 'reduced', true);
    expect(shown.frame).toMatchObject({ step: 'frappe', progress: 1 });
    expect(shown.over).toBe(false);
  });

  it('shows the final pose alone when cut, and for a combat that does not play', () => {
    for (const shown of [combatAt(view, 0, 'off', true), combatAt(view, 0, 'full', false)]) {
      expect(shown.frame.step).toBe('compte-rendu');
      expect(shown.frame.pieces.filter((piece) => piece.fate === 'fallen')).toHaveLength(2);
      expect(shown.over).toBe(false);
    }
    expect(combatAt(view, FINAL_POSE_MS, 'off', true).over).toBe(true);
  });

  it('turns the routed about as they rout, and every survivor of the attacker home by the end', () => {
    // Mine: a man down, a man and a tank standing; theirs: one down, one routed, one standing.
    const before = combatAt(view, stepBounds('deroute').start, 'full', true).turns;
    expect(before).toEqual([0, 0, 0, 0, 0, 0]);
    const end = combatAt(view, REPLAY_MS - 1, 'full', true).turns;
    expect(end.map((turn) => Math.round(turn * 100) / 100)).toEqual([0, 1, 1, 0, 1, 0]);
    expect(combatAt(view, 0, 'off', true).turns).toEqual([0, 1, 1, 0, 1, 0]);
  });
});

describe('homewardOf', () => {
  const arc = (from: readonly [number, number], next: readonly [number, number]) =>
    ({ from, to: next, route: { points: [from, next] } }) as unknown as ArcView;

  it('reads home off the column that walks back from the point', () => {
    const point = { lon: 4.9, lat: 49.7 };
    expect(homewardOf(point, [arc([10, 50], [11, 50]), arc([4.9, 49.7], [3, 49])])).toEqual([
      3, 49,
    ]);
    expect(homewardOf(point, [arc([10, 50], [11, 50])])).toBeNull();
  });
});
