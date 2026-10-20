import { describe, expect, it } from 'vitest';
import { armedColumn, freeCapacityOf } from './armed-column';
import type { PlayerView } from './player-view';
import type { MarchStation } from './troops';

const station: MarchStation = {
  kind: 'point',
  lonLat: [2, 48],
  country: '',
  afloat: false,
  coastal: true,
};

const view = {
  mode: 'mondiale',
  arcs: [],
  me: {
    troops: [
      {
        id: 't1',
        role: 'infantry',
        supplies: {},
        supplied: true,
        strength: 10,
        nominalStrength: 10,
      },
    ],
    buildings: [],
    outposts: [],
    resources: {},
    stationedCargo: [],
  },
} as unknown as PlayerView;

describe('armedColumn', () => {
  it('reads the rule off the picked troops and the station', () => {
    const { rule, troopIds } = armedColumn(view, station, ['t1', 'ghost']);
    expect(troopIds).toEqual(['t1', 'ghost']);
    expect(rule.roles).toEqual(['infantry']);
    expect(rule.coastal).toBe(true);
    expect(rule.afloat).toBe(false);
  });

  it('counts what the picked troops can still carry', () => {
    expect(freeCapacityOf(view, ['t1'])).toBe(40);
  });
});
