import { describe, expect, it } from 'vitest';
import { deployAt, deployMs, type DeployingFile } from './deploy';

const EAST = Math.PI / 2;
/** Its head at the origin, a column came up the road going north (−z): the road runs back south. */
const straight: DeployingFile = {
  span: 1,
  road: Array.from({ length: 9 }, (_, k) => [0, k * 0.5] as const),
  pieces: [
    { from: [0, 0], heading: Math.PI, back: 0, side: 0, to: [-1, 0], infantry: true },
    { from: [0, 2], heading: Math.PI, back: 2, side: 0, to: [0, 0], infantry: true },
    { from: [0, 4], heading: Math.PI, back: 4, side: 0, to: [1, 0], infantry: false },
  ],
};

/** The same column round a bend: it came west along z = 2, then turned north at [0, 2]. */
const bent: DeployingFile = {
  span: 1,
  road: [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [3, 2],
  ],
  pieces: [
    { from: [0, 0], heading: Math.PI, back: 0, side: 0, to: [-1, 0], infantry: true },
    { from: [3, 2], heading: -Math.PI / 2, back: 5, side: 0, to: [1, 0], infantry: false },
  ],
};

describe('deployAt (#362)', () => {
  it('starts on the file as the pawn left it, each piece 0.16 s after the one before', () => {
    const at0 = deployAt(straight, EAST, 0);
    expect(at0.map(({ at }) => at)).toEqual([
      [0, 0],
      [0, 2],
      [0, 4],
    ]);
    expect(at0.every(({ heading }) => heading === Math.PI)).toBe(true);
    expect(deployAt(straight, EAST, 100)[1]!.walking).toBe(false);
    expect(deployAt(straight, EAST, 200)[1]!.walking).toBe(true);
  });

  it('ends each piece on its own place, facing the front, and stands', () => {
    const end = deployAt(straight, EAST, deployMs(straight));
    expect(end.map(({ at }) => at)).toEqual([
      [-1, 0],
      [0, 0],
      [1, 0],
    ]);
    expect(end.every(({ heading, walking }) => heading === EAST && !walking)).toBe(true);
  });

  it('takes the road again up to a step of the point, round its bend, then leaves it', () => {
    const ms = deployMs(bent);
    const way = Array.from({ length: 400 }, (_, k) => deployAt(bent, EAST, (k / 400) * ms)[1]!.at);
    const nearest = (point: readonly [number, number]) =>
      Math.min(...way.map(([x, z]) => Math.hypot(x - point[0], z - point[1])));
    // Through the bend, and up the road north of it, not across the field.
    expect(nearest([0, 2])).toBeLessThan(0.05);
    expect(nearest([0, 1.4])).toBeLessThan(0.05);
    // Across the field, from the bend straight to its place, it never goes.
    expect(nearest([0.6, 1])).toBeGreaterThan(0.2);
  });

  it('keeps the way it goes until its last quarter, then turns to the front', () => {
    const one: DeployingFile = { ...straight, pieces: [straight.pieces[2]!] };
    const ms = deployMs(one);
    expect(Math.cos(deployAt(one, EAST, ms * 0.5)[0]!.heading)).toBeLessThan(0);
    expect(Math.abs(deployAt(one, EAST, ms * 0.97)[0]!.heading - EAST)).toBeLessThan(0.1);
  });

  it('lasts 1.2 to 2.6 s a piece, by its way at the pile’s pace', () => {
    const one = (to: readonly [number, number]) =>
      deployMs({
        span: 1,
        road: [[0, 0]],
        pieces: [{ from: [0, 0], heading: 0, back: 0, side: 0, to, infantry: false }],
      });
    expect(one([0, 0.1])).toBe(1200);
    expect(one([0, 40])).toBe(2600);
  });
});
