import { describe, expect, it } from 'vitest';
import { isRigPart } from '@/emblems/rigs';
import { barracksDoors } from './barracks';

describe('barracksDoors', () => {
  const doors = barracksDoors();
  const angle = (t: number, name: 'porte_gauche' | 'porte_droite') =>
    doors.at(t)[name]?.turn?.[1] ?? 0;

  it('rests on the model: nothing at the start, nothing at the end or after', () => {
    expect(doors.at(0)).toEqual({});
    expect(doors.at(doors.ms)).toEqual({});
    expect(doors.at(doors.ms + 5000)).toEqual({});
  });

  it('swings the two leaves the opposite way, out to 110 degrees', () => {
    const open = 550;
    expect(angle(open / 2, 'porte_gauche')).toBeGreaterThan(0);
    expect(angle(open / 2, 'porte_droite')).toBe(-angle(open / 2, 'porte_gauche'));
    expect(angle(open + 100, 'porte_gauche')).toBeCloseTo((110 * Math.PI) / 180);
  });

  it('shuts again, with a bounce of a few degrees past the closing', () => {
    expect(angle(doors.ms - 40, 'porte_gauche')).toBeGreaterThan(0);
    expect(angle(doors.ms - 40, 'porte_gauche')).toBeLessThan((5 * Math.PI) / 180);
  });

  it('names only parts of its family, and outlasts the settle window', () => {
    for (const name of Object.keys(doors.at(300))) expect(isRigPart(doors.family, name)).toBe(true);
    expect(doors.ms).toBeGreaterThan(1500);
  });
});
