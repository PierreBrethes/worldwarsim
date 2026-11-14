import { describe, expect, it } from 'vitest';
import { AIRFIELD } from '@/emblems/kits/manifest';
import { LIGHT_FADE_MS, LIGHT_WAVE_MS, runwayLit } from './runway-lights';

const LENGTH = AIRFIELD.runway.length;
const MS = 6000;

describe('the runway lights, lit one reach after another (#497)', () => {
  it('are all out before the movement, and the first reach is lit before the last', () => {
    expect(runwayLit(0, 0, MS)).toBe(0);
    expect(runwayLit(LENGTH, 0, MS)).toBe(0);
    const t = LIGHT_WAVE_MS / 2;
    expect(runwayLit(5, t, MS)).toBe(1);
    expect(runwayLit(LENGTH - 5, t, MS)).toBe(0);
  });

  it('come on from the hangars out, never back', () => {
    for (const t of [200, 600, 1000, LIGHT_WAVE_MS]) {
      let last = 1;
      for (let reach = 0; reach <= LENGTH; reach += 5) {
        const now = runwayLit(reach, t, MS);
        expect(now).toBeLessThanOrEqual(last);
        last = now;
      }
    }
  });

  it('are all lit once the wave has run, and fade out together by the end of the movement', () => {
    const settled = LIGHT_WAVE_MS + 500;
    for (const reach of [5, 85, LENGTH - 5]) expect(runwayLit(reach, settled, MS)).toBe(1);
    const end = MS - LIGHT_FADE_MS / 2;
    expect(runwayLit(5, end, MS)).toBe(runwayLit(LENGTH - 5, end, MS));
    expect(runwayLit(5, end, MS)).toBeGreaterThan(0);
    expect(runwayLit(5, end, MS)).toBeLessThan(1);
    expect(runwayLit(5, MS, MS)).toBe(0);
  });

  it('never flicker: a short movement is a wave cut short, not a lamp lit then put out then lit', () => {
    const short = 900;
    for (const reach of [5, 85, LENGTH - 5]) {
      let rising = true;
      let last = 0;
      for (let t = 0; t <= short; t += 20) {
        const now = runwayLit(reach, t, short);
        if (now < last) rising = false;
        else if (!rising && now > last) throw new Error(`flicker at ${t}`);
        last = now;
      }
    }
  });
});
