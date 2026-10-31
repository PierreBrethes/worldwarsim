import { describe, expect, it } from 'vitest';
import { forcedInstant } from './index';

/** Une heure illisible ne doit pas éteindre la carte : `NaN ?? …` ne retombe pas sur l'horloge. */
describe('the instant a capture holds the sun at', () => {
  it('reads an ISO instant', () => {
    expect(forcedInstant('?heure=2026-01-15T12:00:00Z')).toBe(Date.parse('2026-01-15T12:00:00Z'));
  });

  it('is absent without the parameter', () => {
    expect(forcedInstant('')).toBeNull();
  });

  it('is absent, not NaN, when the hour is unreadable', () => {
    expect(forcedInstant('?heure=midi')).toBeNull();
  });
});
