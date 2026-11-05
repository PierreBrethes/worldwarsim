import { describe, expect, it } from 'vitest';
import type { StrategicPointView } from './player-view';
import { fadingRingsOf, raceRingsOf } from './race-rings';

const point = (id: string, nation: string | null): StrategicPointView =>
  ({ id, holder: nation === null ? null : { nation, heldMs: 0 } }) as StrategicPointView;
const race = { leaderNation: 'germany', endsAt: 1000 };

/** **Le compte en anneaux** (#442) : un anneau par point que le meneur tient, à son encre. */
describe('raceRingsOf', () => {
  it('rings every point the leader holds, five when he holds five, none without a race', () => {
    const points = ['a', 'b', 'c', 'd', 'e'].map((id) => point(id, 'germany'));
    expect(raceRingsOf(race, [...points, point('f', 'france')])).toEqual({
      leaderNation: 'germany',
      ink: '#2b6974',
      endsAt: 1000,
      pointIds: ['a', 'b', 'c', 'd', 'e'],
      fading: false,
    });
    expect(raceRingsOf(null, points)).toBeNull();
  });
});

describe('fadingRingsOf', () => {
  const before = raceRingsOf(
    race,
    ['a', 'b', 'c', 'd'].map((id) => point(id, 'germany')),
  )!;

  it('snaps the ring of the point taken back, and fades the others', () => {
    const after = [point('a', 'france'), ...['b', 'c', 'd'].map((id) => point(id, 'germany'))];
    expect(fadingRingsOf(before, after)).toMatchObject({ pointIds: ['b', 'c', 'd'], fading: true });
  });

  it('fades them all when the leader leaves the war, his points gone neutral', () => {
    const after = ['a', 'b', 'c', 'd'].map((id) => point(id, null));
    expect(fadingRingsOf(before, after).pointIds).toEqual(['a', 'b', 'c', 'd']);
  });
});
