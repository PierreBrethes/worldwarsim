import { describe, expect, it } from 'vitest';
import { countTroops, inventoryTroops, organizeTroops, representativeRole } from './troops';
import type { ArcView, PlayerView } from './player-view';
import { directRoute } from './routing';

const me = {
  armyPresent: { infantry: 8, fighter: 2 },
  outposts: [
    { id: 'AP-01', hostCountry: 'Hungary', lonLat: [0, 0], specialization: 'extraction', garrison: 20, isMine: true },
    { id: 'AP-02', hostCountry: 'Ireland', lonLat: [0, 0], specialization: 'extraction', garrison: 0, isMine: true },
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
    stack: { armor: 3, escort: 1 },
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

describe('troop inventory', () => {
  it('gathers home, my movements and garrisons', () => {
    const lines = inventoryTroops(me, arcs);
    expect(lines.map((line) => line.key)).toEqual([
      'home-infantry',
      'home-fighter',
      'MVT-001-armor',
      'MVT-001-escort',
      'AP-01-garrison',
    ]);
    expect(countTroops(lines)).toBe(34);
  });

  it('never exposes an enemy arc’s stack', () => {
    const lines = inventoryTroops(me, arcs);
    expect(lines.some((line) => line.key.startsWith('ARC-'))).toBe(false);
  });

  it('files each role under its domain', () => {
    const lines = inventoryTroops(me, arcs);
    const byKey = new Map(lines.map((line) => [line.key, line.unitDomain]));
    expect(byKey.get('home-fighter')).toBe('air');
    expect(byKey.get('MVT-001-escort')).toBe('sea');
    expect(byKey.get('AP-01-garrison')).toBe('land');
  });
});

describe('filter and sort', () => {
  const lines = inventoryTroops(me, arcs);

  it('keeps a single situation', () => {
    const moving = organizeTroops(lines, { situation: 'movement', unitDomain: 'all' }, 'role');
    expect(moving.map((line) => line.key)).toEqual(['MVT-001-armor', 'MVT-001-escort']);
  });

  it('keeps a single domain', () => {
    const land = organizeTroops(lines, { situation: 'all', unitDomain: 'land' }, 'count');
    expect(land.map((line) => line.count)).toEqual([20, 8, 3]);
  });

  it('sorts by due time pushing what does not move to the back', () => {
    const byDue = organizeTroops(lines, { situation: 'all', unitDomain: 'all' }, 'due');
    expect(byDue[0]?.key).toBe('MVT-001-armor');
    expect(byDue[1]?.key).toBe('MVT-001-escort');
  });

  it('leaves the original inventory intact', () => {
    organizeTroops(lines, { situation: 'all', unitDomain: 'all' }, 'count');
    expect(lines[0]?.key).toBe('home-infantry');
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
