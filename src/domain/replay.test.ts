import { describe, expect, it } from 'vitest';
import {
  REPLAY_MS,
  REPLAY_STEPS,
  replayAt,
  stepBounds,
  steppedFrom,
  type ReplayPiece,
  type ReplayView,
} from './replay';

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
    expect(REPLAY_STEPS).toEqual(['voyage', 'pose', 'salves', 'pertes', 'deroute', 'compte-rendu']);
    expect(REPLAY_MS).toBeGreaterThanOrEqual(9000);
    expect(REPLAY_MS).toBeLessThanOrEqual(11000);
    const seen = [0, 1, 2, 3, 4, 5].map(
      (k) => replayAt(view, stepBounds(REPLAY_STEPS[k]!).start + 1).step,
    );
    expect(seen).toEqual(REPLAY_STEPS);
    expect(replayAt(view, REPLAY_MS + 5000)).toMatchObject({ step: 'compte-rendu', progress: 1 });
  });

  it('stands one block per enemy troop, and never a role on that side', () => {
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

  it('lets nobody fall before the losses step', () => {
    const { pieces } = replayAt(view, stepBounds('salves').end - 1);
    expect(pieces.every((p) => p.fate === 'standing')).toBe(true);
  });

  it('drops the losses one at a time, alternating sides', () => {
    const { start, end } = stepBounds('pertes');
    const order: string[] = [];
    let fallen = 0;
    for (let t = start; t < end; t += 10) {
      const now = replayAt(view, t).pieces.filter((p) => p.fate === 'fallen');
      expect(now.length - fallen).toBeLessThanOrEqual(1);
      if (now.length > fallen) order.push(now.find((p) => p.progress < 0.5)?.side ?? '?');
      fallen = now.length;
    }
    expect(order).toEqual(['mine', 'theirs', 'mine', 'theirs']);
  });

  it('routs after the losses, and ends on the counts the view serves', () => {
    expect(count(replayAt(view, stepBounds('pertes').end - 1).pieces, 'mine', 'routed')).toBe(0);
    const last = replayAt(view, REPLAY_MS).pieces;
    expect(count(last, 'mine', 'fallen')).toBe(2);
    expect(count(last, 'mine', 'routed')).toBe(1);
    expect(count(last, 'mine', 'standing')).toBe(2);
    expect(count(last, 'theirs', 'fallen')).toBe(2);
    expect(count(last, 'theirs', 'routed')).toBe(1);
    expect(count(last, 'theirs', 'standing')).toBe(1);
    expect(last.every((p) => p.progress === 1 || p.fate === 'standing')).toBe(true);
  });

  it('snaps each step to its end when motion is reduced, and skips to the account when cut', () => {
    const mid = (stepBounds('pertes').start + stepBounds('pertes').end) / 2;
    const reduced = replayAt(view, mid, 'reduced');
    expect(reduced).toMatchObject({ step: 'pertes', progress: 1 });
    expect(reduced.pieces.filter((p) => p.fate === 'fallen')).toHaveLength(4);
    expect(replayAt(view, 0, 'off')).toMatchObject({ step: 'compte-rendu', progress: 1 });
  });
});

describe('steppedFrom', () => {
  it('jumps to the start of the next or the previous step, within the replay', () => {
    const pose = stepBounds('pose');
    expect(steppedFrom(pose.start + 100, 1)).toBe(stepBounds('salves').start);
    expect(steppedFrom(pose.start + 100, -1)).toBe(0);
    expect(steppedFrom(10, -1)).toBe(0);
    expect(steppedFrom(stepBounds('compte-rendu').start + 1, 1)).toBe(REPLAY_MS);
  });
});
