import { describe, expect, it } from 'vitest';
import { familiesOf } from './board-families';

const troop = (id: string, stationedAt: unknown) => ({ id, stationedAt });
const view = (mode: 'mondiale' | 'blitz', troops: unknown[] = []) =>
  ({ mode, me: { troops } }) as never;
const markers = [
  { kind: 'stack', id: 's1', lonLat: [4, 4], station: { kind: 'point', lonLat: [4, 4] } },
  { kind: 'building', id: 'b1', buildingId: 'b1', key: 'barracks', lonLat: [1, 1] },
  { kind: 'building', id: 'b2', buildingId: 'b2', key: 'mine', lonLat: [2, 2] },
  { kind: 'building', id: 'site', buildingId: null, key: 'barracks', lonLat: [3, 3] },
  { kind: 'outpost', id: 'o1', lonLat: [5, 5], station: { kind: 'outpost', outpostId: 'o1' } },
  { kind: 'camp', id: 'camp-c1', campId: 'c1', lonLat: [6, 6] },
  { kind: 'objective', id: 'objective-ob', objectiveId: 'ob', lonLat: [7, 7] },
  { kind: 'strategic', id: 'strategic-p', pointId: 'p', lonLat: [8, 8] },
  { kind: 'loot', id: 'loot-x', lonLat: [9, 9] },
] as never;
const ids = (spots: ReadonlyArray<{ id: string }>) => spots.map((spot) => spot.id);

describe('familiesOf', () => {
  const garrisoned = [
    troop('t1', { kind: 'building', buildingId: 'b2' }),
    troop('t2', { kind: 'outpost', outpostId: 'o1' }),
  ];

  it('reads each family off the markers the map draws, and nothing that is not drawn', () => {
    const families = familiesOf(view('mondiale', garrisoned), markers, new Set());
    expect(ids(families.building)).toEqual(['b1']);
    expect(ids(families.outpost)).toEqual(['o1']);
    expect(ids(families.camp)).toEqual(['c1']);
    expect(ids(families.objective)).toEqual(['ob']);
    expect(ids(families.point)).toEqual(['p']);
  });

  it('counts a pile at every address that holds troops: points, garrisons, outposts', () => {
    const { pile } = familiesOf(view('mondiale', garrisoned), markers, new Set());
    expect(ids(pile).sort()).toEqual(['building:b2', 'outpost:o1', 'point:4,4']);
  });

  it('leaves out a garrison whose troops are all on the march', () => {
    const { pile } = familiesOf(view('mondiale', garrisoned), markers, new Set(['t1', 't2']));
    expect(ids(pile)).toEqual(['point:4,4']);
  });

  it('gives a Blitz pile no neighbours, where a touch steps through the units', () => {
    const families = familiesOf(view('blitz', garrisoned), markers, new Set());
    expect(families.pile).toEqual([]);
    expect(ids(families.camp)).toEqual(['c1']);
    expect(ids(families.objective)).toEqual(['ob']);
  });

  it('offers a Blitz building its sheet, the HQ included', () => {
    const hq = [{ kind: 'building', id: 'h', buildingId: 'h', key: 'hq', lonLat: [0, 0] }] as never;
    expect(ids(familiesOf(view('blitz'), hq, new Set()).building)).toEqual(['h']);
    expect(ids(familiesOf(view('mondiale'), hq, new Set()).building)).toEqual([]);
  });
});
