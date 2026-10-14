import { describe, expect, it } from 'vitest';
import { surveyInk } from './survey-ink';

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
