import { describe, expect, it } from 'vitest';
import { levelGain, levelSpeed, spedMinutes, speedsUp } from './level-speed';

describe('the duration factor of a level (ADR 0031)', () => {
  it('leaves the first level at the base, then takes 20 % per level, multiplied', () => {
    expect(levelSpeed(1)).toBe(1);
    expect(levelSpeed(2)).toBeCloseTo(0.8);
    expect(levelSpeed(3)).toBeCloseTo(0.64);
  });

  it('never goes under the floor of 40 % of the base', () => {
    expect(levelSpeed(5)).toBeCloseTo(0.4096, 4);
    expect(levelSpeed(6)).toBe(0.4);
    expect(levelSpeed(20)).toBe(0.4);
  });

  it('says the gain the sheet prints: level 3, −36 %; level 4, −49 %', () => {
    expect(levelGain(1)).toBe(0);
    expect(levelGain(3)).toBe(36);
    expect(levelGain(4)).toBe(49);
  });

  it('shortens a duration in whole minutes, the same on screen and on the server', () => {
    expect(spedMinutes(120, 1)).toBe(120);
    expect(spedMinutes(120, 3)).toBe(77);
  });

  it('speeds up what the headquarters, the projection sites and the research centre do, and nothing else', () => {
    expect(
      (['hq', 'barracks', 'port', 'airfield', 'researchCenter'] as const).every(speedsUp),
    ).toBe(true);
    expect(speedsUp('mine')).toBe(false);
  });
});
