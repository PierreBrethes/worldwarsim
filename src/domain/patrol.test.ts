import { describe, expect, it } from 'vitest';
import { compassOf } from './compass-rose';
import { dropReadingOf } from './drop-order';
import type { Column } from './movement-orders';
import { holdsPatrolTroop, patrolLineOf, withoutPatrols } from './patrol';
import type { PlayerView, TroopView } from './player-view';
import { fr } from '@/i18n/fr';

const outpost = (id: string, lon: number) => ({
  id,
  hostCountry: 'DEU',
  lonLat: [lon, 51.4],
  regionId: `DEU-${id}`,
  level: 1,
  standsAt: null,
  disabledMinutesLeft: null,
  isMine: true,
});
const troop = (id: string, role: TroopView['role'], extra: Partial<TroopView> = {}) =>
  ({
    id,
    role,
    stationedAt: { kind: 'outpost', outpostId: 'essen' },
    ...extra,
  }) as TroopView;
const viewOf = (troops: ReadonlyArray<TroopView>, mode = 'mondiale') =>
  ({
    mode,
    loadedAt: 0,
    arcs: [],
    me: {
      defeated: false,
      slots: { total: 2, used: 0 },
      troops,
      regions: [{ id: 'DEU-kassel', name: 'Hesse' }],
      outposts: [outpost('essen', 7.01), outpost('kassel', 9.5)],
    },
  }) as unknown as PlayerView;
const column = {
  roles: ['infantry'],
  myRegionIds: new Set(),
  myOutpostIds: new Set(),
} as unknown as Column;
const liaison = { kind: 'liaison', ends: ['kassel', 'essen'], name: 'Essen – Hesse' } as const;
const origin = { kind: 'outpost', outpostId: 'essen' } as const;

/** **Lâcher une troupe sur une liaison tracée, c'est lancer la ronde** (#376). */
describe('the patrol gesture', () => {
  it('offers the patrol on a drawn liaison, the order a drop gives', () => {
    const rose = compassOf(liaison, viewOf([troop('t', 'infantry')]), column, origin, 0, ['t']);
    const reading = dropReadingOf(rose);
    expect(reading).toMatchObject({
      kind: 'orders',
      verbs: [{ key: 'patrol', troopId: 't', ends: ['kassel', 'essen'] }],
    });
  });

  it('says the refusal before the gesture: two troops in hand, a transport, no slot', () => {
    const two = viewOf([troop('t', 'infantry'), troop('u', 'armor')]);
    expect(dropReadingOf(compassOf(liaison, two, column, origin, 0, ['t', 'u']))).toEqual({
      kind: 'refused',
      reason: fr.errors.PATROL_ONE_TROOP(),
    });
    const truck = viewOf([troop('t', 'landTransport')]);
    expect(dropReadingOf(compassOf(liaison, truck, column, origin, 0, ['t']))).toMatchObject({
      kind: 'refused',
    });
    const full = { ...viewOf([troop('t', 'infantry')]) };
    const busy = { ...full, me: { ...full.me, slots: { total: 2, used: 2 } } } as PlayerView;
    expect(dropReadingOf(compassOf(liaison, busy, column, origin, 0, ['t']))).toEqual({
      kind: 'refused',
      reason: fr.errors.MOVEMENT_IN_FLIGHT({ maximum: 2 }),
    });
  });

  it('shows the liaisons for a combat troop in hand, never in Blitz nor for a transport', () => {
    expect(holdsPatrolTroop(viewOf([troop('t', 'artillery')]), ['t'])).toBe(true);
    expect(holdsPatrolTroop(viewOf([troop('t', 'cargo')]), ['t'])).toBe(false);
    expect(holdsPatrolTroop(viewOf([troop('t', 'infantry')], 'blitz'), ['t'])).toBe(false);
    expect(
      compassOf(liaison, viewOf([troop('t', 'infantry')], 'blitz'), column, origin, 0, ['t']),
    ).toBeNull();
  });

  it('lists on the sheet the liaisons of its outpost by the other end, or its patrol', () => {
    expect(patrolLineOf(viewOf([troop('t', 'infantry')]), ['t'])).toEqual({
      kind: 'offers',
      liaisons: [{ ends: ['essen', 'kassel'], other: 'Hesse', refusal: null }],
    });
    const patrolling = troop('t', 'infantry', {
      stationedAt: { kind: 'outpost', outpostId: 'kassel' },
      patrol: { ends: ['essen', 'kassel'], to: 'kassel', haltUntil: 3_600_000, recalled: false },
    });
    expect(patrolLineOf(viewOf([patrolling]), ['t'])).toEqual({
      kind: 'patrolling',
      troopId: 't',
      to: 'Hesse',
      haltUntil: 3_600_000,
      here: 'Hesse',
      recalled: false,
    });
  });
});

describe('a halted patrol in its garrison', () => {
  it('stays unticked when the garrison is lifted, and lifts alone', () => {
    const halted = troop('p', 'infantry', {
      patrol: { ends: ['essen', 'kassel'], to: 'essen', haltUntil: 1, recalled: false },
    });
    const me = viewOf([troop('t', 'armor'), halted]).me;
    expect(withoutPatrols(me, ['t', 'p'])).toEqual(['t']);
    expect(withoutPatrols(me, ['p'])).toEqual(['p']);
  });
});
