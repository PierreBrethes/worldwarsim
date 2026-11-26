import { describe, expect, it } from 'vitest';
import {
  formedMinutes,
  siteSpeedsUp,
  levelGain,
  levelSpeed,
  spedMinutes,
  speedsUp,
} from './level-speed';

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

describe('the duration of a formation (ADR 0047 §2)', () => {
  it('speeds a site of projection up by its level, for the role it is the site of', () => {
    expect(formedMinutes(100, 'barracks', 'infantry', 3)).toBe(spedMinutes(100, 3));
    expect(formedMinutes(100, 'port', 'cargo', 3)).toBe(spedMinutes(100, 3));
  });

  it('forms the levied infantry at level 1 wherever it is not a barracks, a port included', () => {
    expect(formedMinutes(100, 'warehouse', 'infantry', 5)).toBe(100);
    expect(formedMinutes(100, 'hq', 'infantry', 5)).toBe(100);
    expect(formedMinutes(100, 'port', 'infantry', 5)).toBe(100);
    expect(formedMinutes(100, 'depot', 'infantry', 5)).toBe(100);
  });
});

describe('the « −x % » of a site sheet', () => {
  it('stays where it was: the sites of projection, and the Blitz headquarters', () => {
    expect(siteSpeedsUp('barracks', 'mondiale')).toBe(true);
    expect(siteSpeedsUp('hq', 'blitz')).toBe(true);
  });

  it('is not promised by a Mondiale headquarters or centre that forms the levy at level 1', () => {
    expect(siteSpeedsUp('hq', 'mondiale')).toBe(false);
    expect(siteSpeedsUp('researchCenter', 'mondiale')).toBe(false);
    expect(siteSpeedsUp('warehouse', 'mondiale')).toBe(false);
  });
});
