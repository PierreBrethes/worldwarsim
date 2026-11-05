import { describe, expect, it } from 'vitest';
import { namedCities, placeNames, riverSpots, type NameCandidate } from './place-names';
import type { ScreenBox } from './label-groups';

const box = (left: number, top: number, width = 40, height = 12): ScreenBox => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});
const name = (left: number, top: number, anchor: ScreenBox | null = null): NameCandidate => ({
  anchor,
  spots: [box(left, top), box(left - 50, top)],
});

describe('placeNames', () => {
  it('places names in their order until the budget is spent', () => {
    const candidates = [name(0, 0), name(100, 0), name(200, 0), name(300, 0)];
    expect(placeNames(candidates, [], 3)).toEqual([
      { index: 0, spot: 0, point: false },
      { index: 1, spot: 0, point: false },
      { index: 2, spot: 0, point: false },
    ]);
  });

  it('never writes over an occupied box: it takes the next spot, or gives up', () => {
    const label = box(95, -5, 60, 30);
    const candidates = [name(100, 0), { anchor: null, spots: [box(110, 0)] }];
    expect(placeNames(candidates, [label], 40)).toEqual([{ index: 0, spot: 1, point: false }]);
  });

  it('writes a city whose point a piece covers off to the side, without its point', () => {
    const piece = box(0, 0, 60, 14);
    const covered = { anchor: box(2, 2, 6, 6), spots: [box(10, 0)], aside: [box(10, 30)] };
    const clear = { anchor: box(200, 2, 6, 6), spots: [box(210, 0)], aside: [box(210, 30)] };
    expect(placeNames([covered, clear], [piece], 40)).toEqual([
      { index: 0, spot: 1, point: false },
      { index: 1, spot: 0, point: true },
    ]);
  });

  it('lets an earlier name keep its place against a later one', () => {
    const candidates = [name(0, 0), name(10, 0), name(60, 0)];
    expect(placeNames(candidates, [], 40)).toEqual([
      { index: 0, spot: 0, point: false },
      { index: 1, spot: 1, point: false },
      { index: 2, spot: 0, point: false },
    ]);
  });
});

describe('riverSpots', () => {
  it('finds the straight run in the middle of a river, along it', () => {
    // A river running east, straight from x = 0 to 10, then turning north.
    const line = Float32Array.of(0, 0, 5, 0, 10, 0, 10, 10);
    const [first] = riverSpots([line]);
    expect(first).toMatchObject({ y: 0, angle: 0 });
    expect(first!.x).toBeGreaterThan(3);
    expect(first!.x).toBeLessThan(10);
    expect(first!.half).toBeGreaterThan(1);
  });

  it('gives no spot to a line too short to carry a name', () => {
    expect(riverSpots([Float32Array.of(0, 0, 0.001, 0)])).toEqual([]);
  });
});

describe('namedCities', () => {
  const paris = { capital: true, population: 11_000_000 };
  const vaduz = { capital: true, population: 36_000 };
  const lyon = { capital: false, population: 2_000_000 };
  const nancy = { capital: false, population: 400_000 };
  const all = [paris, vaduz, lyon, nancy];
  const at = (distance: number, touch = false, replaying = false) =>
    namedCities(all, { distance, touch, replaying });

  it('names nothing from 65 out', () => expect(at(65)).toEqual([]));
  it('names the capitals over 300 000 from 55 to 65', () => expect(at(60)).toEqual([paris]));
  it('adds the cities over a million from 34 to 55', () => expect(at(45)).toEqual([paris, lyon]));
  it('names every city under 34', () => expect(at(20)).toEqual(all));
  it('shows one tier less on a phone', () => {
    expect(at(45, true)).toEqual([paris]);
    expect(at(20, true)).toEqual([paris, lyon]);
  });
  it('names nothing during a replay', () => expect(at(20, false, true)).toEqual([]));
});
