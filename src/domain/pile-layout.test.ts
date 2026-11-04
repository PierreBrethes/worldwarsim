import { describe, expect, it } from 'vitest';
import { crownSeats } from './pile-layout';
import type { LonLat } from './geo';

/** A crown of `n` spots round (0, 0), the first due east, counter-clockwise. */
const crown = (n: number, from = 0): LonLat[] => [
  [0, 0],
  ...Array.from({ length: n }, (_, k): LonLat => {
    const turn = from + (2 * Math.PI * k) / n;
    return [Math.cos(turn) * 0.2, Math.sin(turn) * 0.2];
  }),
];

describe('crownSeats', () => {
  it('keeps the head on the point and gives every other piece one spot of its own', () => {
    for (const n of [1, 2, 3, 5, 8]) {
      const seats = crownSeats(90, crown(n));
      expect(seats[0]).toBe(0);
      expect([...seats].sort((a, b) => a - b)).toEqual(Array.from({ length: n + 1 }, (_, k) => k));
    }
    expect(crownSeats(undefined, [[0, 0]])).toEqual([0]);
  });

  it('sends the end of the rank the way the rank runs: east facing south, west facing north', () => {
    const spots = crown(3);
    // Facing south, the rank runs east: its last piece takes the spot due east.
    expect(crownSeats(180, spots)[3]).toBe(1);
    expect(crownSeats(undefined, spots)[3]).toBe(1);
    // Facing north, it runs west: the last piece takes the spot furthest west.
    const west = crownSeats(0, spots)[3]!;
    expect(spots[west]![0]).toBeLessThan(0);
  });

  it('turns the crown round, never permutes it: neighbours on the rank stay neighbours', () => {
    const spots = crown(5, 0.3);
    const seats = crownSeats(45, spots).slice(1);
    const angle = (k: number) => Math.atan2(spots[k]![1], spots[k]![0]);
    const sorted = [...seats].sort((a, b) => angle(a) - angle(b));
    const turn = sorted.indexOf(seats[0]!);
    expect(seats).toEqual(seats.map((_, k) => sorted[(k + turn) % sorted.length]));
  });
});
