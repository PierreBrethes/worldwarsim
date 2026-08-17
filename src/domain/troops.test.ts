import { describe, expect, it } from 'vitest';
import { marchingTroopIds, representativeRole, stationGroups, troopsAt } from './troops';
import type { ArcView, PlayerView, TroopView } from './player-view';
import { directRoute } from './routing';

const troop = (id: string, role: TroopView['role'], stationedAt: string | null): TroopView => ({
  id,
  role,
  tier: 1,
  strength: 40,
  nominalStrength: 50,
  stationedAt,
});

const me = {
  troops: [
    troop('T-1', 'infantry', 'BAT-01'),
    troop('T-2', 'infantry', 'BAT-01'),
    troop('T-3', 'armor', 'BAT-01'),
    troop('T-4', 'infantry', 'AP-01'),
    troop('T-5', 'fighter', null),
  ],
  outposts: [
    { id: 'AP-01', hostCountry: 'Hungary', lonLat: [0, 0], specialization: 'relay', garrison: 1, disabledMinutesLeft: null, isMine: true },
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
      'AP-01-infantry',
      'BAT-01-infantry',
      'home-fighter',
    ]);
  });

  it('leaves a marching column out — it is observed, never ordered again', () => {
    expect(stationGroups(me, marching).some((group) => group.role === 'armor')).toBe(false);
    expect(stationGroups(me, new Set()).some((group) => group.role === 'armor')).toBe(true);
  });

  it('names the outpost as an address of its own', () => {
    const garrison = stationGroups(me, marching).find((group) => group.stationId === 'AP-01');
    expect(garrison?.kind).toBe('outpost');
    expect(stationGroups(me, marching).find((group) => group.stationId === null)?.kind).toBe('home');
  });

  it('adds the hit points of the group against the nominal it was formed at', () => {
    const barracks = stationGroups(me, marching).find((group) => group.key === 'BAT-01-infantry');
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
    expect(troopsAt(me, 'BAT-01', marchingTroopIds(arcs)).map((held) => held.id)).toEqual([
      'T-1',
      'T-2',
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
