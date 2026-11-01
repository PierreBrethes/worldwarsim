import { describe, expect, it } from 'vitest';
import { MAX_QUEUED_BATCHES, MONDIALE_TROOP_BOUND } from '../../convex/constants';
import {
  hasSiteSheet,
  recruitRefusalOf,
  type RecruitSituation,
  marchingTroopIds,
  representativeRole,
  stackRows,
  stationKeyOf,
  stationAtCombat,
  stationGroups,
  troopsAt,
  seatLoose,
  unitsOf,
} from './troops';
import type { UnitRole } from './ids';
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
  mending: false,
});

describe('the exact address of a posted pile', () => {
  it('keeps nearby troops separate until they reach the same point', () => {
    const beach: TroopStation = {
      kind: 'point',
      lonLat: [142.123, 47.012],
      country: 'RUS',
      afloat: false,
      ground: 'land',
      coastal: true,
    };
    const nearby: TroopStation = { ...beach, lonLat: [142.129, 47.014] };
    const cargo = troop('cargo', 'cargo', beach);
    const infantry = troop('infantry', 'infantry', nearby);
    const stationed = { ...me, troops: [cargo, infantry] };
    expect(stationKeyOf(beach)).not.toBe(stationKeyOf(nearby));
    expect(troopsAt(stationed, stationKeyOf(beach), new Set()).map((troop) => troop.id)).toEqual([
      'cargo',
    ]);
    const reunited = {
      ...me,
      troops: [cargo, { ...infantry, stationedAt: { ...beach } }],
    };
    expect(troopsAt(reunited, stationKeyOf(beach), new Set()).map((troop) => troop.id)).toEqual([
      'infantry',
      'cargo',
    ]);
  });
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
    troop('T-6', 'infantry', {
      kind: 'point',
      lonLat: [46.7, 24.6],
      country: 'SAU',
      afloat: false,
      ground: 'land',
      coastal: false,
    }),
  ],
  outposts: [
    {
      id: 'AP-01',
      hostCountry: 'Hungary',
      lonLat: [0, 0],
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
    schedule: { departedAt: 0, arrivesAt: 3_600_000, heldAt: null, holdUntil: null },
  },
  {
    state: 'enemyDetected',
    detector: 'troop',
    detectorRegion: null,
    id: 'ARC-001',
    from: [0, 0],
    to: [1, 1],
    route: directRoute([0, 0], [1, 1], 'land', 10),
    headingDegrees: 142,
    headingAtMe: false,
    identification: { pierced: false },
    arrivesAt: 3_600_000,
    seenTo: 3_600_000,
    since: 0,
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
    expect(posted?.station).toEqual({
      kind: 'point',
      lonLat: [46.7, 24.6],
      country: 'SAU',
      afloat: false,
      ground: 'land',
      coastal: false,
    });
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

  it('shows the truck when it carries all the infantry', () => {
    expect(representativeRole({ infantry: 1, landTransport: 1 })).toBe('landTransport');
    expect(representativeRole({ infantry: 2, landTransport: 1 })).toBe('landTransport');
    expect(representativeRole({ infantry: 3, landTransport: 2 })).toBe('landTransport');
  });

  it('shows the boots when some of the infantry walks', () => {
    expect(representativeRole({ infantry: 3, landTransport: 1 })).toBe('infantry');
    expect(representativeRole({ infantry: 20, landTransport: 1 })).toBe('infantry');
  });

  it('keeps the majority when the truck rides with anything but infantry', () => {
    expect(representativeRole({ infantry: 1, armor: 2, landTransport: 1 })).toBe('armor');
  });
});

/** The seating a crossing is weighed on before it leaves (`strandedIn`): greedy, hulls only. */
describe('stackRows', () => {
  const pile: ReadonlyArray<TroopView> = [
    troop('I-1', 'infantry', { kind: 'home' }),
    troop('I-2', 'infantry', { kind: 'home' }),
    troop('A-1', 'armor', { kind: 'home' }),
    troop('L-1', 'landTransport', { kind: 'home' }),
    troop('C-1', 'cargo', { kind: 'home' }),
  ];
  const shape = (picked: ReadonlyArray<string>) =>
    stackRows(pile, new Set(picked)).map(
      (row) => `${row.carrier === null ? '' : '  '}${row.troop.id}`,
    );

  it('indents the checked passengers under the checked hull', () => {
    expect(shape(['I-1', 'I-2', 'C-1'])).toEqual(['A-1', 'L-1', 'C-1', '  I-1', '  I-2']);
  });

  it('gives them back their level when the hull is unchecked', () => {
    expect(shape(['I-1', 'I-2'])).toEqual(['I-1', 'I-2', 'A-1', 'L-1', 'C-1']);
  });

  it('fills greedily and leaves what does not fit at its own level', () => {
    // Twelve berths: two infantry (2), one armor (3) and the truck (2) ride, and the truck is
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

/** **Une unité** (règle de Pierre, 15/10) : une troupe de combat seule, ou un transport et ce
 *  qu'il porte — jamais deux troupes de combat ensemble. **Être à bord est un état** (révision
 *  de l'ADR 0025, 15/10) : on y est parce qu'on a embarqué, pas parce qu'on se tient là. */
describe('unitsOf', () => {
  type Seat = { id: string; role: UnitRole; carriedBy?: string | undefined };
  const units = (...pile: ReadonlyArray<Seat>) =>
    unitsOf(pile).map((unit) => unit.map((member) => member.id));

  it('makes each troop its own unit when nobody has boarded', () => {
    expect(
      units(
        { id: 'I', role: 'infantry' },
        { id: 'T', role: 'landTransport' },
        { id: 'C', role: 'cargo' },
      ),
    ).toEqual([['I'], ['T'], ['C']]);
  });

  it('makes a transport and what boarded it one unit, the transport first', () => {
    expect(
      units(
        { id: 'I-1', role: 'infantry', carriedBy: 'T' },
        { id: 'I-2', role: 'infantry' },
        { id: 'T', role: 'landTransport' },
      ),
    ).toEqual([['I-2'], ['T', 'I-1']]);
  });

  it('carries a loaded truck aboard a cargo with its riflemen', () => {
    expect(
      units(
        { id: 'I', role: 'infantry', carriedBy: 'T' },
        { id: 'T', role: 'landTransport', carriedBy: 'C' },
        { id: 'C', role: 'cargo' },
      ),
    ).toEqual([['C', 'T', 'I']]);
  });

  it('sets on foot a passenger whose transport is not there', () => {
    expect(units({ id: 'I', role: 'infantry', carriedBy: 'gone' })).toEqual([['I']]);
  });
});

/** **Une colonne mixte embarque au départ** (15/10) : ce qui part à pied avec un transport monte
 *  à bord s'il y a de la place — le camion d'abord, qui motorise, puis les coques. */
describe('seatLoose', () => {
  type Seat = { id: string; role: UnitRole; carriedBy?: string | undefined };
  const seats = (...pile: ReadonlyArray<Seat>) => Object.fromEntries(seatLoose(pile));

  it('seats two riflemen in a truck and leaves the third on foot', () => {
    expect(
      seats(
        { id: 'T', role: 'landTransport' },
        { id: 'I-1', role: 'infantry' },
        { id: 'I-2', role: 'infantry' },
        { id: 'I-3', role: 'infantry' },
      ),
    ).toEqual({ 'I-1': 'T', 'I-2': 'T' });
  });

  it('counts who already rides, and moves nobody', () => {
    expect(
      seats(
        { id: 'T', role: 'landTransport' },
        { id: 'I-1', role: 'infantry', carriedBy: 'T' },
        { id: 'I-2', role: 'infantry' },
        { id: 'I-3', role: 'infantry' },
      ),
    ).toEqual({ 'I-2': 'T' });
  });

  it('puts a loaded truck aboard a cargo with its riflemen, and a tank beside it', () => {
    expect(
      seats(
        { id: 'C', role: 'cargo' },
        { id: 'T', role: 'landTransport' },
        { id: 'I-1', role: 'infantry' },
        { id: 'I-2', role: 'infantry' },
        { id: 'A', role: 'armor' },
      ),
    ).toEqual({ 'I-1': 'T', 'I-2': 'T', T: 'C', A: 'C' });
  });

  it('seats no gun and no truck in a wing, whatever the places left', () => {
    expect(
      seats(
        { id: 'W', role: 'airTransport' },
        { id: 'G', role: 'artillery' },
        { id: 'T', role: 'landTransport' },
      ),
    ).toEqual({});
  });

  it('never flies a tank, and seats no more than a wing lifts', () => {
    expect(
      seats(
        { id: 'W', role: 'airTransport' },
        { id: 'A', role: 'armor' },
        { id: 'I-1', role: 'infantry' },
        { id: 'I-2', role: 'infantry' },
        { id: 'I-3', role: 'infantry' },
      ),
    ).toEqual({ 'I-1': 'W', 'I-2': 'W' });
  });
});

describe('stationAtCombat', () => {
  const arabia = { lon: 46.7, lat: 24.6 };
  const buildings = [{ id: 'BAT-01', point: [2.3, 48.9] }];
  const mine = { ...me, buildings } as unknown as PlayerView['me'];

  it('ouvre l’avant-poste visé quand il est à moi', () => {
    expect(stationAtCombat(mine, { point: arabia, outpostId: 'AP-01' }, new Set(), 25)).toEqual({
      kind: 'outpost',
      outpostId: 'AP-01',
    });
  });

  it('ouvre la pile qui tient encore le lieu, dans l’allonge', () => {
    const near = { lon: 46.8, lat: 24.6 };
    expect(stationAtCombat(mine, { point: near, outpostId: null }, new Set(), 25)).toMatchObject({
      kind: 'point',
      lonLat: [46.7, 24.6],
    });
  });

  it('n’ouvre rien quand plus rien de moi ne s’y tient', () => {
    expect(
      stationAtCombat(mine, { point: arabia, outpostId: null }, new Set(['T-6']), 25),
    ).toBeNull();
    expect(
      stationAtCombat(mine, { point: { lon: 60, lat: 10 }, outpostId: null }, new Set(), 25),
    ).toBeNull();
  });
});

describe('what a projection site refuses to form (the reserve of pieces, ADR 0028 §7)', () => {
  const stocks = { food: 100, steel: 100, coal: 100, oil: 100, ammunition: 100 };
  const at = (overrides: Partial<RecruitSituation> = {}): RecruitSituation => ({
    researched: [],
    army: 0,
    siteQueue: 0,
    costs: { steel: 18, food: 10 },
    stocks,
    ...overrides,
  });

  it('forms a role in the building of its domain, and nowhere else', () => {
    expect(recruitRefusalOf('infantry', 1, { key: 'barracks' }, at())).toBeNull();
    expect(recruitRefusalOf('cargo', 1, { key: 'barracks' }, at())).toEqual({
      code: 'WRONG_PROJECTION_BUILDING',
      expected: 'port',
      found: 'barracks',
    });
  });

  it('waits for the research card that opens the role at this tier, and names it', () => {
    expect(recruitRefusalOf('armor', 1, { key: 'barracks' }, at())).toEqual({
      code: 'RESEARCH_REQUIRED',
      card: 'armor',
    });
    expect(recruitRefusalOf('infantry', 2, { key: 'barracks' }, at())).toEqual({
      code: 'RESEARCH_REQUIRED',
      card: 'infantryMk2',
    });
    expect(recruitRefusalOf('artillery', 1, { key: 'barracks' }, at())).toEqual({
      code: 'RESEARCH_REQUIRED',
      card: 'artillery',
    });
    expect(
      recruitRefusalOf(
        'armor',
        1,
        { key: 'barracks' },
        at({ researched: ['infantryMk2', 'armor'] }),
      ),
    ).toBeNull();
  });

  it('stops at the invisible bound, then at a full queue, then at the price', () => {
    const barracks = { key: 'barracks' } as const;
    expect(recruitRefusalOf('infantry', 1, barracks, at({ army: MONDIALE_TROOP_BOUND }))).toEqual({
      code: 'TROOP_BOUND_REACHED',
    });
    expect(
      recruitRefusalOf('infantry', 1, barracks, at({ siteQueue: MAX_QUEUED_BATCHES })),
    ).toEqual({
      code: 'QUEUE_FULL',
    });
    expect(
      recruitRefusalOf('infantry', 1, barracks, at({ stocks: { ...stocks, steel: 5 } })),
    ).toEqual({ code: 'INSUFFICIENT_RESOURCE', resource: 'steel', needed: 18, available: 5 });
  });
});

describe('hasSiteSheet', () => {
  it('lets a Mondiale site sheet open on the forming buildings only, never on the HQ', () => {
    expect(hasSiteSheet('mondiale', 'barracks')).toBe(true);
    expect(hasSiteSheet('mondiale', 'airfield')).toBe(true);
    expect(hasSiteSheet('mondiale', 'port')).toBe(true);
    expect(hasSiteSheet('mondiale', 'hq')).toBe(false);
    expect(hasSiteSheet('mondiale', 'mine')).toBe(false);
  });

  it('opens every held Blitz building, the HQ included', () => {
    expect(hasSiteSheet('blitz', 'hq')).toBe(true);
    expect(hasSiteSheet('blitz', 'city')).toBe(true);
  });
});
