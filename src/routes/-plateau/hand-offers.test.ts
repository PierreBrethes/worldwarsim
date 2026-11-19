import { describe, expect, it } from 'vitest';
import type { OfferContext } from '@/domain/offers';
import type { PlayerView, TroopStation } from '@/domain/player-view';
import { handOffersOf, offerContextOf } from './hand-offers';

const point: TroopStation = {
  kind: 'point',
  lonLat: [4.6, 46.6],
  country: 'FRA',
  afloat: false,
  ground: 'land',
  coastal: false,
};
const troop = (id: string, role: string, extra: object = {}) => ({
  id,
  role,
  tier: 1,
  strength: 50,
  nominalStrength: 50,
  stationedAt: point,
  supplied: true,
  mending: false,
  ...extra,
});
const viewOf = (troops: object[], mode = 'mondiale'): PlayerView =>
  ({
    mode,
    arcs: [],
    me: {
      nation: 'france',
      troops,
      buildings: [],
      outposts: [],
      regions: [],
      lootPoints: [],
      stationedCargo: [],
      research: { researched: [] },
      resources: {},
      slots: { used: 0, total: 4 },
    },
  }) as unknown as PlayerView;

describe('offerContextOf', () => {
  it('reads afloat on the pile and the airfield under it', () => {
    const view = viewOf([]);
    const at = (ctx: OfferContext) => [ctx.afloat, ctx.atAirfield];
    expect(at(offerContextOf(view, point, 1, null))).toEqual([false, false]);
    expect(at(offerContextOf(view, { ...point, afloat: true }, 1, null))).toEqual([true, false]);
    const airfield = {
      ...view,
      me: { ...view.me, buildings: [{ id: 'b1', key: 'airfield' }] },
    } as unknown as PlayerView;
    expect(
      offerContextOf(airfield, { kind: 'building', buildingId: 'b1' }, 1, null).atAirfield,
    ).toBe(true);
  });

  it('hands over the clock and the ground it was given', () => {
    const ctx = offerContextOf(viewOf([]), point, 42, null);
    expect(ctx).toMatchObject({ now: 42, ground: null });
  });
});

describe('handOffersOf', () => {
  it('offers to found from a pile standing on a force target, and to disembark its riders', () => {
    const view = viewOf([
      troop('inf', 'infantry'),
      troop('truck', 'landTransport'),
      troop('rider', 'infantry', { carriedBy: 'truck' }),
    ]);
    const target = {
      kind: 'force',
      id: 'p',
      country: 'FRA',
      name: 'x',
      headcount: 3,
      ground: 'land',
      station: point,
      regionId: null,
    } as const;
    const offers = handOffersOf(
      view,
      { station: point, troopIds: ['inf', 'truck', 'rider'] },
      target,
      1,
      null,
    );
    expect(offers.map((offer) => offer.key)).toContain('found');
    expect(offers.find((offer) => offer.key === 'disembark')).toMatchObject({
      troopIds: ['rider'],
    });
  });

  it('reads a pile in a garrison as a garrison: nothing to found there', () => {
    const view = viewOf([troop('inf', 'infantry')]);
    const station: TroopStation = { kind: 'outpost', outpostId: 'o1' };
    const offers = handOffersOf(view, { station, troopIds: ['inf'] }, null, 1, null);
    expect(offers.map((offer) => offer.key)).not.toContain('found');
  });

  it('ignores a target that is not the pile in hand', () => {
    const view = viewOf([troop('inf', 'infantry')]);
    const other = { ...point, lonLat: [1, 1] } as TroopStation;
    const target = {
      kind: 'force',
      id: 'q',
      country: 'FRA',
      name: 'x',
      headcount: 1,
      ground: 'land',
      station: other,
      regionId: null,
    } as const;
    const offers = handOffersOf(view, { station: point, troopIds: ['inf'] }, target, 1, null);
    expect(offers.map((offer) => offer.key)).not.toContain('found');
  });
});
