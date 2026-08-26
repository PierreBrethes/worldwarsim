import { describe, expect, it } from 'vitest';
import {
  boards,
  marchingTroopIds,
  representativeRole,
  stackRows,
  stationGroups,
  troopsAt,
} from './troops';
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
    detector: 'troop',
    detectorRegion: null,
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

/**
 * Being aboard is computed and never stored: the picture follows the tick of a box, and a
 * transport without a capacity carries nobody — the day the pace gives the truck one, these
 * cases change answer without a line changing here.
 */
describe('stackRows', () => {
  const pile: ReadonlyArray<TroopView> = [
    troop('I-1', 'infantry', { kind: 'home' }),
    troop('I-2', 'infantry', { kind: 'home' }),
    troop('A-1', 'armor', { kind: 'home' }),
    troop('L-1', 'landTransport', { kind: 'home' }),
    troop('C-1', 'cargo', { kind: 'home' }),
  ];
  const shape = (picked: ReadonlyArray<string>, placements: ReadonlyArray<[string, string]> = []) =>
    stackRows(pile, new Set(picked), new Map(placements)).map(
      (row) => `${row.carrier === null ? '' : '  '}${row.troop.id}`,
    );

  it('indents the checked passengers under the checked hull', () => {
    expect(shape(['I-1', 'I-2', 'C-1'])).toEqual(['A-1', 'L-1', 'C-1', '  I-1', '  I-2']);
  });

  it('gives them back their level when the hull is unchecked', () => {
    expect(shape(['I-1', 'I-2'])).toEqual(['I-1', 'I-2', 'A-1', 'L-1', 'C-1']);
  });

  it('fills greedily and leaves what does not fit at its own level', () => {
    // Six berths: two infantry (2), one armor (2) and the truck (1) ride, and the truck is
    // itself a passenger — nothing is left standing here.
    expect(shape(['I-1', 'I-2', 'A-1', 'L-1', 'C-1'])).toEqual([
      'C-1',
      '  I-1',
      '  I-2',
      '  A-1',
      '  L-1',
    ]);
  });

  it('boards nobody when the only transport lifts nothing', () => {
    expect(shape(['I-1', 'L-1'])).toEqual(['I-1', 'I-2', 'A-1', 'L-1', 'C-1']);
  });
});

/**
 * The gesture is the other door on one state, not a second logic: what it writes is where a
 * troop is drawn, and a transport with no berth left refuses it by the same count the counter
 * prints.
 */
describe('the drop, against the tick box', () => {
  const pile: ReadonlyArray<TroopView> = [
    troop('I-1', 'infantry', { kind: 'home' }),
    troop('I-2', 'infantry', { kind: 'home' }),
    troop('I-3', 'infantry', { kind: 'home' }),
    troop('T-1', 'airTransport', { kind: 'home' }),
    troop('C-1', 'cargo', { kind: 'home' }),
  ];
  const shape = (picked: ReadonlyArray<string>, placements: ReadonlyArray<[string, string]> = []) =>
    stackRows(pile, new Set(picked), new Map(placements)).map(
      (row) => `${row.carrier === null ? '' : '  '}${row.troop.id}`,
    );

  it('honours the named berth before serving the greedy ones', () => {
    // Greedy would have seated both infantry in the wing, which comes first in the list.
    expect(shape(['I-1', 'I-2', 'T-1', 'C-1'], [['I-1', 'C-1']])).toEqual([
      'I-3',
      'T-1',
      '  I-2',
      'C-1',
      '  I-1',
    ]);
  });

  it('refuses a drop on a transport whose berths are taken', () => {
    // The wing lifts two, and two infantry already ride it: nobody is bumped to make room.
    const picked = new Set(['I-1', 'I-2', 'T-1']);
    const placements = new Map([
      ['I-1', 'T-1'],
      ['I-2', 'T-1'],
    ]);
    expect(boards(pile, picked, placements, 'I-3', 'T-1')).toBe(false);
  });

  it('takes a passenger back onto the transport it already rides', () => {
    const picked = new Set(['I-1', 'I-2', 'T-1']);
    const placements = new Map([['I-1', 'T-1']]);
    expect(boards(pile, picked, placements, 'I-1', 'T-1')).toBe(true);
  });

  it('takes a drop the transport still has room for', () => {
    expect(boards(pile, new Set(['T-1']), new Map(), 'I-1', 'T-1')).toBe(true);
  });

  it('leaves the pile exactly where the tick box would have left it', () => {
    // The drop checks the troop and says where to draw it — the stack itself is the same set.
    const ticked = stackRows(pile, new Set(['I-1', 'C-1']), new Map());
    const dropped = stackRows(pile, new Set(['I-1', 'C-1']), new Map([['I-1', 'C-1']]));
    expect(dropped.map((row) => row.troop.id).sort()).toEqual(
      ticked.map((row) => row.troop.id).sort(),
    );
  });
});
