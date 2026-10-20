import { describe, expect, it } from 'vitest';
import type { Compass, CompassAction } from './compass-rose';
import { groupCompassOf, insideStroke, matchingOrder, squadLeadOf, toggleIn } from './selection';
import { slotsAskedBy } from './movement-orders';
import type { MarchStation } from './troops';

const at = (lon: number): MarchStation => ({
  kind: 'point',
  lonLat: [lon, 0],
  country: '',
  afloat: false,
  coastal: false,
});

const march = (type: 'march' | 'attack' = 'march'): CompassAction => ({
  key: 'aim',
  pictogram: 'cabin',
  label: type,
  cost: '1 slot · 3 libres',
  consequence: '',
  aim: { kind: 'point', lon: 1, lat: 1, coastal: false, onLand: true, surveyed: false },
  type,
});

const compass = (
  actions: ReadonlyArray<CompassAction>,
  refusal: string | null = null,
): Compass => ({
  kicker: '',
  name: 'Lyon',
  actions,
  refusal,
});

describe('a selection of piles (#130)', () => {
  it('adds a pile, and takes it back out on a second shift-click', () => {
    const one = toggleIn([], at(1));
    expect(one).toEqual([at(1)]);
    expect(toggleIn(toggleIn(one, at(2)), at(1))).toEqual([at(2)]);
  });

  it('catches what the stroke encircles, the way back to its start implied', () => {
    // An open hook: three sides of a square, no line drawn back.
    const stroke = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as const;
    expect(insideStroke(stroke, 5, 5)).toBe(true);
    expect(insideStroke(stroke, 15, 5)).toBe(false);
    expect(insideStroke(stroke.slice(0, 2), 5, 0)).toBe(false);
  });
});

describe('a selection let go on a place', () => {
  it('orders what every pile can do there, and says the slots it takes', () => {
    const group = groupCompassOf([compass([march(), march('attack')]), compass([march()])], {
      free: 4,
      asked: 2,
    });
    expect(group?.actions.map((action) => action.label)).toEqual(['march']);
    expect(group?.actions[0]?.cost).toBe('2 slots · 4 libres');
    expect(group?.refusal).toBeNull();
  });

  it('refuses before the drop when a part of it cannot go', () => {
    const group = groupCompassOf(
      [compass([march()]), compass([], 'pas de pont'), compass([march()])],
      { free: 4, asked: 3 },
    );
    expect(group?.actions).toEqual([]);
    expect(group?.refusal).toBe('1 pile sur 3 ne peut pas y aller : pas de pont');
  });

  it('refuses when there are fewer free slots than piles', () => {
    const group = groupCompassOf([compass([march()]), compass([march()])], { free: 1, asked: 2 });
    expect(group?.actions).toEqual([]);
    expect(group?.refusal).toBe('2 mouvements pour 1 slot libre');
  });

  it("lets Halifax's holder send one fleet with no slot, and the second takes one", () => {
    const fleet = [{ role: 'escort' as const, carried: false }];
    const march_ = [{ role: 'infantry' as const, carried: false }];
    expect(slotsAskedBy([fleet], true)).toBe(0);
    expect(slotsAskedBy([fleet, fleet], true)).toBe(1);
    expect(slotsAskedBy([fleet, march_], true)).toBe(1);
    // One is already at sea: the next one pays.
    expect(slotsAskedBy([fleet], true, 1)).toBe(1);
    expect(slotsAskedBy([fleet], false)).toBe(1);
    const asked = slotsAskedBy([fleet], true);
    const group = groupCompassOf([compass([march()])], { free: 0, asked });
    expect(group?.refusal).toBeNull();
    expect(group?.actions).toHaveLength(1);
    const refused = groupCompassOf([compass([march()]), compass([march()])], {
      free: 0,
      asked: slotsAskedBy([fleet, fleet], true),
    });
    expect(refused?.refusal).toContain('pour 0 slot libre');
  });

  it('leaves a single-pile order out: one transport, one delivery', () => {
    const board: CompassAction = { ...march(), boardsOn: 'cargo' } as CompassAction;
    expect(groupCompassOf([compass([board]), compass([board])], { free: 4, asked: 2 })).toBeNull();
  });

  it('finds, in each pile, the order the group chose', () => {
    expect(matchingOrder(compass([march('attack'), march()]), march())?.label).toBe('march');
    expect(matchingOrder(compass([march('attack')]), march())).toBeUndefined();
  });
});

describe('forming a squad', () => {
  it('gathers on the biggest pile standing on the board', () => {
    const garrison: MarchStation = { kind: 'building', buildingId: 'b' };
    expect(
      squadLeadOf([
        { station: garrison, troops: 9 },
        { station: at(1), troops: 2 },
        { station: at(2), troops: 3 },
      ]),
    ).toEqual(at(2));
    expect(squadLeadOf([{ station: garrison, troops: 9 }])).toBeNull();
  });
});
