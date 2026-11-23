import { describe, expect, it } from 'vitest';
import { captureSaid } from './capture-said';
import type { CaptureView } from './player-view';

const AT = Date.UTC(2026, 9, 14, 12);
const capture = (over: Partial<CaptureView> = {}): CaptureView => ({
  id: 'c',
  side: 'defender',
  target: { kind: 'building', id: 'b' },
  site: { kind: 'building', building: 'arsenal', regionId: 'FRA-69' },
  regionName: 'Lyon',
  point: [4.8, 45.7],
  clock: { progress: 0.5, at: AT, rate: 1, durationMs: 3_600_000, rest: null },
  completesAt: AT + 1_800_000,
  stoppedAt: null,
  ...over,
});

describe('what a capture says to its readers (#622)', () => {
  it('reads the hour while it runs, in each reader’s own words', () => {
    expect(captureSaid(capture(), AT, 'gauge')).toContain('50 % · perdu vers');
    expect(captureSaid(capture({ side: 'capturer' }), AT, 'gauge')).toContain('fin vers');
    expect(captureSaid(capture(), AT, 'why')).toContain('change de main vers');
    expect(captureSaid(capture(), AT, 'todo')).toContain('capture en cours, perdue vers');
  });

  it('reads « concluding », without an hour, once it is due', () => {
    const now = AT + 2_000_000;
    expect(captureSaid(capture(), now, 'gauge')).toBe('100 % · en cours de conclusion');
    expect(captureSaid(capture(), now, 'why')).toContain('se conclut');
    expect(captureSaid(capture(), now, 'todo')).toBe(
      'Arsenal de Lyon : capture en cours de conclusion',
    );
  });

  it('reads the hunger of a suspended capture, whatever the hour', () => {
    expect(captureSaid(capture({ suspended: true }), AT + 2_000_000, 'gauge')).toBe(
      'suspendue : l’armée a faim',
    );
  });
});
