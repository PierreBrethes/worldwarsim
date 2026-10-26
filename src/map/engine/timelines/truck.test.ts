import { describe, expect, it } from 'vitest';
import { isRigPart } from '@/emblems/rigs';
import { tailgateDrop } from './truck';

describe('tailgateDrop', () => {
  const drop = tailgateDrop();
  const angle = (t: number) => drop.at(t).tailgate?.turn?.[0] ?? 0;

  it('rests on the model: nothing at the start, nothing at the end or after', () => {
    expect(drop.at(0)).toEqual({});
    expect(drop.at(drop.ms)).toEqual({});
    expect(drop.at(drop.ms + 5000)).toEqual({});
  });

  it('falls backward, away from the bed (a negative turn about x), to 93 degrees', () => {
    expect(angle(250)).toBeLessThan(0);
    expect(angle(250)).toBeGreaterThan(-(93 * Math.PI) / 180);
    expect(angle(600)).toBeCloseTo(-(93 * Math.PI) / 180, 1);
  });

  it('hangs while the troop steps down, then shuts', () => {
    expect(angle(1000)).toBeCloseTo(-(93 * Math.PI) / 180, 1);
    expect(angle(drop.ms - 100)).toBeGreaterThan(angle(1000));
  });

  it('names only parts of its family, and outlasts the settle window', () => {
    for (const name of Object.keys(drop.at(300))) expect(isRigPart(drop.family, name)).toBe(true);
    expect(drop.ms).toBeGreaterThan(1500);
  });
});
