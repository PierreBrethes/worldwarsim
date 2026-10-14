import { describe, expect, it } from 'vitest';
import { surveyedAt, surveyInk } from './survey-ink';

describe('surveyInk', () => {
  it('is full ink while the force is in sight', () => {
    expect(surveyInk(null)).toBe(1);
    expect(surveyInk(0)).toBe(1);
  });

  it('pales with the age of the survey, to a trace at the last known position’s end', () => {
    expect(surveyInk(12 * 60)).toBeCloseTo(0.6);
    expect(surveyInk(24 * 60)).toBeCloseTo(0.2);
    expect(surveyInk(48 * 60)).toBeCloseTo(0.2);
  });
});

describe('surveyedAt (H3)', () => {
  it('dates a force in sight by its first observation, a last known position by its last', () => {
    expect(surveyedAt({ since: 100, lastSeenAt: null })).toBe(100);
    expect(surveyedAt({ since: 100, lastSeenAt: 500 })).toBe(500);
  });
});
