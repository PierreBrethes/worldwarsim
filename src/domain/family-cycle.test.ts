import { describe, expect, it } from 'vitest';
import { cycleOf, type FamilySpot } from './family-cycle';

const spot = (id: string, lon: number, lat: number): FamilySpot => ({ id, lonLat: [lon, lat] });

describe('cycleOf', () => {
  const family = [spot('c', 30, 10), spot('a', -10, 50), spot('b', -10, 20), spot('d', 30, -5)];

  it('walks west to east, then south to north, and loops', () => {
    // order: b(-10,20) a(-10,50) d(30,-5) c(30,10)
    expect(cycleOf(family, 'b')).toEqual({ prev: 'c', next: 'a' });
    expect(cycleOf(family, 'a')).toEqual({ prev: 'b', next: 'd' });
    expect(cycleOf(family, 'c')).toEqual({ prev: 'd', next: 'b' });
  });

  it('does not depend on the order the family is served in', () => {
    expect(cycleOf([...family].reverse(), 'a')).toEqual(cycleOf(family, 'a'));
  });

  it('finds the current object by id, so a member that comes or goes moves nothing else', () => {
    expect(
      cycleOf(
        family.filter((one) => one.id !== 'd'),
        'a',
      ),
    ).toEqual({ prev: 'b', next: 'c' });
  });

  it('breaks a tie on the same point by id', () => {
    const twins = [spot('y', 5, 5), spot('x', 5, 5), spot('z', 9, 9)];
    expect(cycleOf(twins, 'x')).toEqual({ prev: 'z', next: 'y' });
  });

  it('offers no arrows to a family of one, an empty one, or an object it does not hold', () => {
    expect(cycleOf([spot('a', 0, 0)], 'a')).toBeNull();
    expect(cycleOf([], 'a')).toBeNull();
    expect(cycleOf(family, 'gone')).toBeNull();
  });

  it('closes a pair on itself', () => {
    expect(cycleOf([spot('a', 0, 0), spot('b', 1, 1)], 'a')).toEqual({ prev: 'b', next: 'b' });
  });
});
