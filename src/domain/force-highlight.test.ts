import { describe, expect, it } from 'vitest';
import { highlightOf, stackLabelId } from './force-highlight';
import type { TroopStation } from './player-view';

const point = (lon: number): Extract<TroopStation, { kind: 'point' }> => ({
  kind: 'point',
  lonLat: [lon, 45],
  country: 'Italy',
  afloat: false,
  coastal: false,
});
const ROME = point(12.5);
const NAPLES = point(14.2);
const BARRACKS: TroopStation = { kind: 'building', buildingId: 'b-1' };

describe('highlightOf', () => {
  it('puts nothing forward when nothing is designated', () => {
    expect(highlightOf(null, null)).toBeNull();
  });

  /** La case cochée dans la garnison de Rome est celle qui grossit sur la carte. */
  it('puts forward what is checked in the open garrison', () => {
    expect(highlightOf(null, { station: ROME, troopIds: ['m13'] })).toEqual({
      labelId: stackLabelId(ROME),
      troopIds: ['m13'],
    });
  });

  it('puts nothing forward from a garrison with nothing checked yet', () => {
    expect(highlightOf(null, { station: ROME, troopIds: [] })).toBeNull();
  });

  /** Une seule source : la pièce en main l'emporte sur ce qui reste coché ailleurs. */
  it('lets the held piece win over the garrison', () => {
    expect(
      highlightOf({ station: NAPLES, troopIds: ['inf'] }, { station: ROME, troopIds: ['m13'] }),
    ).toEqual({ labelId: stackLabelId(NAPLES), troopIds: ['inf'] });
  });

  /** Un mât dit une adresse, pas une troupe : il ne grossit pas. */
  it('puts forward no mast, only a pile on the map', () => {
    expect(highlightOf({ station: BARRACKS, troopIds: ['inf'] }, null)).toBeNull();
  });
});
