import { describe, expect, it } from 'vitest';
import {
  captureDurationMs,
  captureRate,
  captureRefusalOf,
  completesAt,
  progressAt,
} from './capture';

const HOUR = 3_600_000;
const MIDNIGHT = Date.UTC(2026, 9, 14);

describe('captureRate', () => {
  it('runs at the pace of the strongest infantry present, and at nothing without one', () => {
    expect(
      captureRate([
        { role: 'infantry', strength: 25, nominalStrength: 50 },
        { role: 'infantry', strength: 40, nominalStrength: 50 },
        { role: 'armor', strength: 12, nominalStrength: 12 },
      ]),
    ).toBe(0.8);
    expect(captureRate([{ role: 'armor', strength: 12, nominalStrength: 12 }])).toBe(0);
  });
});

describe('captureDurationMs', () => {
  it('takes six hours in the long mode and three minutes in the short one', () => {
    expect(captureDurationMs('mondiale', 'building')).toBe(6 * HOUR);
    expect(captureDurationMs('blitz', 'outpost')).toBe(3 * 60_000);
  });
});

describe('the capture clock', () => {
  const clock = { progress: 0, at: MIDNIGHT, rate: 1, durationMs: 6 * HOUR, rest: null };

  it('ends after the base duration at full strength', () => {
    expect(completesAt(clock)).toBe(MIDNIGHT + 6 * HOUR);
    expect(progressAt(clock, MIDNIGHT + 3 * HOUR)).toBeCloseTo(0.5);
  });

  it('runs twice as long at half strength, from what was already done', () => {
    const halved = { ...clock, progress: 0.5, at: MIDNIGHT + 3 * HOUR, rate: 0.5 };
    expect(completesAt(halved)).toBe(MIDNIGHT + 9 * HOUR);
  });

  it('stands still through the defender’s rest window', () => {
    const rested = { ...clock, rest: { startMinutes: 120, endMinutes: 9 * 60 } };
    expect(progressAt(rested, MIDNIGHT + 5 * HOUR)).toBeCloseTo(2 / 6);
    expect(completesAt(rested)).toBe(MIDNIGHT + 13 * HOUR);
  });

  it('crosses a window that wraps past midnight', () => {
    const rested = {
      ...clock,
      at: MIDNIGHT + 22 * HOUR,
      rest: { startMinutes: 23 * 60, endMinutes: 6 * 60 },
    };
    expect(completesAt(rested)).toBe(MIDNIGHT + 35 * HOUR);
  });

  it('never goes past done', () => {
    expect(progressAt(clock, MIDNIGHT + 99 * HOUR)).toBe(1);
  });
});

describe('captureRefusalOf', () => {
  const site = { kind: 'building', key: 'barracks' } as const;

  it('lets an infantry column capture somebody else’s building or outpost', () => {
    expect(captureRefusalOf(site, ['infantry', 'armor'], false)).toBeNull();
    expect(captureRefusalOf({ kind: 'outpost' }, ['infantry'], false)).toBeNull();
  });

  it('names why it will not', () => {
    expect(captureRefusalOf(site, [], false)).toBe('EMPTY_MOVEMENT');
    expect(captureRefusalOf(site, ['armor'], false)).toBe('CAPTURE_NEEDS_INFANTRY');
    expect(captureRefusalOf(site, ['infantry'], true)).toBe('FRIENDLY_TARGET');
    expect(captureRefusalOf({ kind: 'building', key: 'hq' }, ['infantry'], false)).toBe(
      'HQ_NOT_CAPTURABLE',
    );
  });
});
