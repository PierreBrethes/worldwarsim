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
  it('takes six hours in the long mode and two minutes twenty-four in the short one', () => {
    expect(captureDurationMs('mondiale', { kind: 'building', key: 'barracks' })).toBe(6 * HOUR);
    expect(captureDurationMs('blitz', { kind: 'outpost' })).toBe(2.4 * 60_000);
  });

  it('holds a Blitz headquarters twice as long as a building', () => {
    expect(captureDurationMs('blitz', { kind: 'building', key: 'hq' })).toBe(4.8 * 60_000);
  });

  /** **Le QG d'une Mondiale tient ce que le salon a dit** (M15) : 12 h par défaut, ou 24 h. */
  it('holds a Mondiale headquarters the hours the lobby set', () => {
    const hq = { kind: 'building', key: 'hq' } as const;
    expect(captureDurationMs('mondiale', hq)).toBe(12 * HOUR);
    expect(captureDurationMs('mondiale', hq, 24)).toBe(24 * HOUR);
    expect(captureDurationMs('mondiale', { kind: 'outpost' }, 24)).toBe(6 * HOUR);
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
  it('lets an infantry column capture somebody else’s building or outpost', () => {
    expect(captureRefusalOf(['infantry', 'armor'], false, 'mondiale')).toBeNull();
    expect(captureRefusalOf(['infantry'], false, 'mondiale')).toBeNull();
  });

  it('names why it will not', () => {
    expect(captureRefusalOf([], false, 'mondiale')).toBe('EMPTY_MOVEMENT');
    expect(captureRefusalOf(['armor'], false, 'mondiale')).toBe('CAPTURE_NEEDS_INFANTRY');
    expect(captureRefusalOf(['infantry'], true, 'mondiale')).toBe('FRIENDLY_TARGET');
  });

  it('takes a headquarters in both modes, where its fall eliminates (B10, M2a)', () => {
    for (const mode of ['blitz', 'mondiale'] as const) {
      expect(captureRefusalOf(['infantry'], false, mode)).toBeNull();
      expect(captureRefusalOf(['armor'], false, mode)).toBe('CAPTURE_NEEDS_INFANTRY');
    }
  });

  it('wants the infantry off its transport in a Blitz, and only there', () => {
    expect(captureRefusalOf(['landTransport', 'infantry'], false, 'blitz')).toBe('CAPTURE_ON_FOOT');
    expect(captureRefusalOf(['landTransport', 'infantry'], false, 'mondiale')).toBeNull();
  });
});
