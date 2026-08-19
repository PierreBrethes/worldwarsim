import { describe, expect, it } from 'vitest';
import { marchingTroopIds, representativeRole, stationGroups, troopsAt } from './troops';
import type { ArcView, PlayerView, TroopStation, TroopView } from './player-view';
import { directRoute } from './routing';

const troop = (id: string, role: TroopView['role'], stationedAt: TroopStation): TroopView => ({
  id,
  role,
  tier: 1,
  strength: 40,
  nominalStrength: 50,
  stationedAt,
  supplied: true,
});

const me = {
  troops: [
    troop('T-1', 'infantry', { kind: 'building', buildingId: 'BAT-01' }),
    troop('T-2', 'infantry', { kind: 'building', buildingId: 'BAT-01' }),
    troop('T-3', 'armor', { kind: 'building', buildingId: 'BAT-01' }),
    troop('T-4', 'infantry', { kind: 'outpost', outpostId: 'AP-01' }),
    troop('T-5', 'fighter', { kind: 'home' }),
    /** A column left standing on the map: an address like any other since ADR 0019 §1, and the
     *  one the widget had no card for. */
    troop('T-6', 'infantry', { kind: 'point', lonLat: [46.7, 24.6], country: 'SAU' }),
  ],
  outposts: [
    {
      id: 'AP-01',
      hostCountry: 'Hungary',
      lonLat: [0, 0],
      specialization: 'relay',
      garrison: 1,
      disabledMinutesLeft: null,
      isMine: true,
    },
  ],
} as unknown as PlayerView['me'];

const arcs: ReadonlyArray<ArcView> = [
  {
    state: 'mine',
    id: 'MVT-001',
    from: [0, 0],
    to: [1, 1],
    route: directRoute([0, 0], [1, 1], 'land', 10),
    originCountry: 'France',
    destinationCountry: 'Chad',
    originLabel: 'France',
    destinationLabel: 'Tchad',
    type: 'attack',
    stack: { armor: 1 },
    troopIds: ['T-3'],
    minutesLeft: 8,
    borderWait: null,
    progress: 0.5,
  },
  {
    state: 'enemyDetected',
    id: 'ARC-001',
    from: [0, 0],
    to: [1, 1],
    route: directRoute([0, 0], [1, 1], 'land', 10),
    suspectedNation: null,
    headingDegrees: 142,
    headingAtMe: false,
    identification: { pierced: false },
    estimatedMinutesLeft: null,
    progress: 0.5,
  },
];

describe('what stands still', () => {
  const marching = marchingTroopIds(arcs);

  it('groups by address then by role', () => {
    expect(stationGroups(me, marching).map((group) => group.key)).toEqual([
      'building:BAT-01-infantry',
      'home-fighter',
      'outpost:AP-01-infantry',
      'point:46.7,24.6-infantry',
    ]);
  });

  it('leaves a marching column out — it is observed, never ordered again', () => {
    expect(stationGroups(me, marching).some((group) => group.role === 'armor')).toBe(false);
    expect(stationGroups(me, new Set()).some((group) => group.role === 'armor')).toBe(true);
  });

  it('names the outpost, the point and the home as addresses of their own', () => {
    const kinds = new Map(
      stationGroups(me, marching).map((group) => [group.stationKey, group.station.kind]),
    );
    expect(kinds.get('outpost:AP-01')).toBe('outpost');
    expect(kinds.get('home')).toBe('home');
    expect(kinds.get('point:46.7,24.6')).toBe('point');
  });

  /** The criterion of the third prompt of ADR 0019: a troop left on the map is in the inventory,
   *  on a card of its own, and countable like every other. */
  it('serves a posted column with the country it was left in', () => {
    const posted = stationGroups(me, marching).find((group) => group.station.kind === 'point');
    expect(posted?.count).toBe(1);
    expect(posted?.station).toEqual({ kind: 'point', lonLat: [46.7, 24.6], country: 'SAU' });
  });

  it('adds the hit points of the group against the nominal it was formed at', () => {
    const barracks = stationGroups(me, marching).find(
      (group) => group.key === 'building:BAT-01-infantry',
    );
    expect(barracks?.count).toBe(2);
    expect(barracks?.strength).toBe(80);
    expect(barracks?.nominalStrength).toBe(100);
  });

  it('never reads an enemy arc — it has no troops to expose', () => {
    expect(marching).toEqual(new Set(['T-3']));
  });
});

describe('troopsAt', () => {
  it('answers one address, marching columns excluded', () => {
    expect(troopsAt(me, 'building:BAT-01', marchingTroopIds(arcs)).map((held) => held.id)).toEqual([
      'T-1',
      'T-2',
    ]);
  });

  it('finds who stands at a point, which is an address like any other', () => {
    expect(troopsAt(me, 'point:46.7,24.6', marchingTroopIds(arcs)).map((held) => held.id)).toEqual([
      'T-6',
    ]);
  });
});

describe('representativeRole', () => {
  it('keeps the most numerous role', () => {
    expect(representativeRole({ infantry: 3, armor: 7, fighter: 1 })).toBe('armor');
  });

  it('breaks ties with the canonical order', () => {
    expect(representativeRole({ escort: 4, infantry: 4 })).toBe('infantry');
  });

  it('ignores zeroed roles and returns null on an empty stack', () => {
    expect(representativeRole({ cargo: 0 })).toBeNull();
    expect(representativeRole({})).toBeNull();
  });
});
