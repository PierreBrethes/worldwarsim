import { describe, expect, it } from 'vitest';
import { deployAt, deployMs } from './deploy';

/** A column of three come up the road going north (−z), its head at the origin, deploying to a
 *  front facing east (π/2) — a quarter turn. */
const file = {
  span: 1,
  pieces: [
    { from: [0, 0], heading: Math.PI, to: [-1, 0], infantry: true },
    { from: [0, 2], heading: Math.PI, to: [0, 0], infantry: true },
    { from: [0, 4], heading: Math.PI, to: [1, 0], infantry: false },
  ],
} as const;
const EAST = Math.PI / 2;

describe('deployAt (#362)', () => {
  it('starts on the file as the pawn left it, each piece 0.16 s after the one before', () => {
    const at0 = deployAt(file, EAST, 0);
    expect(at0.map(({ at }) => at)).toEqual([
      [0, 0],
      [0, 2],
      [0, 4],
    ]);
    expect(at0.every(({ heading }) => heading === Math.PI)).toBe(true);
    const [, second, third] = deployAt(file, EAST, 100);
    expect(second!.at).toEqual([0, 2]);
    expect(second!.walking).toBe(false);
    expect(deployAt(file, EAST, 200)[1]!.walking).toBe(true);
    expect(third!.at).toEqual([0, 4]);
  });

  it('ends each piece on its own place, facing the front, and stands', () => {
    const end = deployAt(file, EAST, deployMs(file));
    expect(end.map(({ at }) => at)).toEqual([
      [-1, 0],
      [0, 0],
      [1, 0],
    ]);
    expect(end.every(({ heading, walking }) => heading === EAST && !walking)).toBe(true);
  });

  it('keeps the way it goes until its last quarter, then turns to the front', () => {
    const third = file.pieces[2];
    const ms = deployMs({ span: 1, pieces: [third] });
    const mid = deployAt({ span: 1, pieces: [third] }, EAST, ms * 0.5)[0]!;
    const tangent = mid.heading;
    // Going up the road to its place: north, a little east.
    expect(Math.cos(tangent)).toBeLessThan(0);
    const late = deployAt({ span: 1, pieces: [third] }, EAST, ms * 0.97)[0]!;
    expect(Math.abs(late.heading - EAST)).toBeLessThan(0.1);
  });

  it('lasts 1.2 to 2.6 s a piece, by its way at the pile’s pace', () => {
    const one = (to: readonly [number, number]) =>
      deployMs({ span: 1, pieces: [{ from: [0, 0], heading: 0, to, infantry: false }] });
    expect(one([0, 0.1])).toBe(1200);
    expect(one([0, 40])).toBe(2600);
    expect(deployMs(file)).toBeGreaterThan(2 * 160);
  });
});
