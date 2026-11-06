import { describe, expect, it } from 'vitest';
import {
  hullPose,
  REPLAY_MS,
  REPLAY_STEPS,
  replayAt,
  sinkOf,
  stepBounds,
  steppedFrom,
  VOLLEY_SHARE,
  type ReplayPiece,
} from './replay';
import type { ReplayView } from './player-view';

const view: ReplayView = {
  combatId: 'c1',
  at: 0,
  point: { lon: 2.35, lat: 48.85 },
  side: 'attacker',
  won: true,
  mine: [
    { role: 'infantry', tier: 1, troops: 3, lost: 120, routed: 1, destroyed: 1 },
    { role: 'armor', tier: 2, troops: 2, lost: 40, routed: 0, destroyed: 1 },
  ],
  theirs: { troops: 4, lost: 300, routed: 1, destroyed: 2 },
};

const count = (pieces: ReadonlyArray<ReplayPiece>, side: string, fate: string) =>
  pieces.filter((p) => p.side === side && p.fate === fate).length;

describe('replayAt', () => {
  it('runs the six steps in order, about ten seconds in all', () => {
    expect(REPLAY_STEPS).toEqual([
      'voyage',
      'pose',
      'frappe',
      'riposte',
      'deroute',
      'compte-rendu',
    ]);
    expect(REPLAY_MS).toBeGreaterThanOrEqual(9000);
    expect(REPLAY_MS).toBeLessThanOrEqual(11000);
    const seen = [0, 1, 2, 3, 4, 5].map(
      (k) => replayAt(view, stepBounds(REPLAY_STEPS[k]!).start + 1).step,
    );
    expect(seen).toEqual(REPLAY_STEPS);
    expect(replayAt(view, REPLAY_MS + 5000)).toMatchObject({ step: 'compte-rendu', progress: 1 });
  });

  it('stands what was faced at the fire by role and mark, one per troop (F1)', () => {
    const faced: ReplayView = {
      ...view,
      theirs: { troops: 3, lost: 90, routed: 0, destroyed: 1 },
      faced: {
        nation: 'germany',
        forces: [
          { role: 'armor', tier: 1, troops: 1, strength: 12, lost: 12, routed: 0, destroyed: 1 },
          {
            role: 'infantry',
            tier: 2,
            troops: 2,
            strength: 100,
            lost: 78,
            routed: 0,
            destroyed: 0,
          },
        ],
      },
    };
    const theirs = replayAt(faced, REPLAY_MS).pieces.filter((p) => p.side === 'theirs');
    expect(theirs.map((p) => (p.side === 'theirs' ? [p.seen, p.fate] : null))).toEqual([
      [{ role: 'armor', tier: 1 }, 'fallen'],
      [{ role: 'infantry', tier: 2 }, 'standing'],
      [{ role: 'infantry', tier: 2 }, 'standing'],
    ]);
  });

  it('stands one block per enemy troop when the fire was not seen — an old account', () => {
    const theirs = replayAt(view, 0).pieces.filter((p) => p.side === 'theirs');
    expect(theirs).toHaveLength(4);
    for (const piece of theirs)
      expect(Object.keys(piece).sort()).toEqual(['fate', 'progress', 'side']);
  });

  it('stands my pieces by role, one per troop', () => {
    const mine = replayAt(view, 0).pieces.filter((p) => p.side === 'mine');
    expect(mine.map((p) => (p.side === 'mine' ? `${p.role}${p.tier}` : ''))).toEqual([
      'infantry1',
      'infantry1',
      'infantry1',
      'armor2',
      'armor2',
    ]);
  });

  it('has the attacker fire in the strike and the defender in the riposte', () => {
    const at = (step: 'frappe' | 'riposte') => replayAt(view, stepBounds(step).start + 1).firing;
    expect(at('frappe')).toBe('mine');
    expect(at('riposte')).toBe('theirs');
    const defending = { ...view, side: 'defender' as const };
    expect(replayAt(defending, stepBounds('frappe').start + 1).firing).toBe('theirs');
    expect(replayAt(view, stepBounds('pose').start + 1).firing).toBeNull();
  });

  it('lets nobody fall while the shots are still flying', () => {
    const { start, end } = stepBounds('frappe');
    const { pieces } = replayAt(view, start + VOLLEY_SHARE * (end - start) - 1);
    expect(pieces.every((p) => p.fate === 'standing')).toBe(true);
  });

  it('fells the struck side in the strike, then the attacker in the riposte, one at a time', () => {
    const order: string[] = [];
    let fallen = 0;
    for (let t = stepBounds('frappe').start; t < stepBounds('riposte').end; t += 10) {
      const now = replayAt(view, t).pieces.filter((p) => p.fate === 'fallen');
      expect(now.length - fallen).toBeLessThanOrEqual(1);
      if (now.length > fallen) order.push(now.find((p) => p.progress < 0.5)?.side ?? '?');
      fallen = now.length;
    }
    expect(order).toEqual(['theirs', 'theirs', 'mine', 'mine']);
    expect(count(replayAt(view, stepBounds('frappe').end).pieces, 'theirs', 'fallen')).toBe(2);
  });

  it('routs after the riposte, and ends on the counts the view serves', () => {
    expect(count(replayAt(view, stepBounds('riposte').end - 1).pieces, 'mine', 'routed')).toBe(0);
    const last = replayAt(view, REPLAY_MS).pieces;
    expect(count(last, 'mine', 'fallen')).toBe(2);
    expect(count(last, 'mine', 'routed')).toBe(1);
    expect(count(last, 'mine', 'standing')).toBe(2);
    expect(count(last, 'theirs', 'fallen')).toBe(2);
    expect(count(last, 'theirs', 'routed')).toBe(1);
    expect(count(last, 'theirs', 'standing')).toBe(1);
    expect(last.every((p) => p.progress === 1 || p.fate === 'standing')).toBe(true);
  });

  it('fells a destroyed troop, and leaves a battered one standing whole', () => {
    const luxembourg: ReplayView = {
      ...view,
      side: 'defender',
      mine: [{ role: 'infantry', tier: 1, troops: 3, lost: 25, routed: 0, destroyed: 0 }],
      theirs: { troops: 1, lost: 50, routed: 0, destroyed: 1 },
    };
    const last = replayAt(luxembourg, REPLAY_MS).pieces;
    expect(count(last, 'theirs', 'fallen')).toBe(1);
    expect(count(last, 'mine', 'standing')).toBe(3);
  });

  it('snaps each step to its end when motion is reduced, and skips to the account when cut', () => {
    const mid = (stepBounds('riposte').start + stepBounds('riposte').end) / 2;
    const reduced = replayAt(view, mid, 'reduced');
    expect(reduced).toMatchObject({ step: 'riposte', progress: 1 });
    expect(reduced.pieces.filter((p) => p.fate === 'fallen')).toHaveLength(4);
    expect(replayAt(view, 0, 'off')).toMatchObject({ step: 'compte-rendu', progress: 1 });
  });
});

describe('steppedFrom', () => {
  it('jumps to the start of the next or the previous step, within the replay', () => {
    const pose = stepBounds('pose');
    expect(steppedFrom(pose.start + 100, 1)).toBe(stepBounds('frappe').start);
    expect(steppedFrom(pose.start + 100, -1)).toBe(0);
    expect(steppedFrom(10, -1)).toBe(0);
    expect(steppedFrom(stepBounds('compte-rendu').start + 1, 1)).toBe(REPLAY_MS);
  });
});

describe('the replay of a bombardment (B20, A4)', () => {
  const shelled: ReplayView = {
    ...view,
    side: 'defender',
    won: false,
    mine: [{ role: 'infantry', tier: 1, troops: 1, lost: 60, routed: 0, destroyed: 1 }],
    theirs: { troops: 1, lost: 0, routed: 0, destroyed: 0 },
    bombardment: {},
  };
  const firing: ReplayView = {
    ...view,
    mine: [{ role: 'artillery', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0 }],
    theirs: { troops: 1, lost: 60, routed: 0, destroyed: 1 },
    bombardment: { from: { lon: 4.35, lat: 48.85 } },
  };
  const during = (step: 'frappe' | 'riposte') => stepBounds(step).start + 1;

  it('draws no battery at the target: the shot comes from nowhere it can see', () => {
    expect(replayAt(shelled, 0).pieces.filter((p) => p.side === 'theirs')).toEqual([]);
    expect(replayAt(shelled, during('frappe')).firing).toBe('theirs');
    expect(count(replayAt(shelled, REPLAY_MS).pieces, 'mine', 'fallen')).toBe(1);
  });

  it('answers nothing: nobody fires in the riposte', () => {
    expect(replayAt(shelled, during('riposte')).firing).toBeNull();
    expect(replayAt(firing, during('riposte')).firing).toBeNull();
    expect(replayAt(firing, during('frappe')).firing).toBe('mine');
  });
});

describe('a hull going down', () => {
  const deg = (degrees: number) => (degrees * Math.PI) / 180;

  it('heels 14 degrees on its fall, then settles by the stern to 22 degrees heel and 9 pitch', () => {
    expect(hullPose(0, 0)).toEqual({ heel: 0, pitch: 0, depth: 0 });
    expect(hullPose(1, 0)).toEqual({ heel: deg(14), pitch: 0, depth: 0 });
    expect(hullPose(1, 1)).toEqual({ heel: deg(22), pitch: deg(9), depth: 1 });
    expect(hullPose(1, 0.5).heel).toBeCloseTo(deg(18));
  });

  const sunk = (side: 'attacker' | 'defender'): ReplayView => ({
    ...view,
    side,
    mine: [{ role: 'escort', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 1 }],
    theirs: { troops: 1, lost: 0, routed: 0, destroyed: 1 },
  });

  /** The first fallen piece of the side the shots felled, for its `fellAt`. */
  const fellAtOf = (v: ReplayView, side: 'mine' | 'theirs') =>
    replayAt(v, REPLAY_MS).pieces.find((p) => p.side === side && p.fate === 'fallen')!.fellAt!;

  it('anchors the sinking on the end of the fall plus a second, in the account, for both sides', () => {
    // The attacker's hull falls at the riposte, the defender's at the strike.
    for (const [side, fall] of [
      ['attacker', 'riposte'],
      ['defender', 'frappe'],
    ] as const) {
      const v = sunk('attacker');
      const hull = side === 'attacker' ? 'mine' : 'theirs';
      const fell = fellAtOf(v, hull);
      expect(fell).toBe(stepBounds(fall).end);
      const at = (t: number) => sinkOf(replayAt(v, t), fell, false);
      expect(at(fell + 999)).toBe(0);
      expect(at(fell + 1500)).toBeGreaterThan(0);
      expect(at(stepBounds('compte-rendu').start + 1600)).toBe(1);
      expect(at(REPLAY_MS)).toBe(1);
    }
  });

  it('a defender hull sinks a second after its strike fall, not waiting for the rout', () => {
    const v = sunk('attacker');
    // `theirs` is the defender, struck in the strike.
    const fell = fellAtOf(v, 'theirs');
    expect(fell).toBe(stepBounds('frappe').end);
    expect(sinkOf(replayAt(v, fell + 1200), fell, false)).toBeGreaterThan(0);
    expect(fell + 1000).toBeLessThan(stepBounds('deroute').start);
  });

  it('at reduced motion plays the frozen steps and sinks all at once at the account', () => {
    const v = sunk('attacker');
    const fell = fellAtOf(v, 'mine');
    for (const step of ['frappe', 'riposte', 'deroute'] as const)
      expect(sinkOf(replayAt(v, stepBounds(step).start, 'reduced'), fell, true)).toBe(0);
    expect(sinkOf(replayAt(v, stepBounds('compte-rendu').start, 'reduced'), fell, true)).toBe(1);
  });
});
