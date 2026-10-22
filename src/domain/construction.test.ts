import { describe, expect, it } from 'vitest';
import {
  aimVerdict,
  depositCalls,
  outpostRaiseHold,
  placementOf,
  raiseRefusalOf,
  depositHolders,
  PLACING_SNAP_KM,
  riseOf,
  snapTo,
  upgradeHold,
  workSitesOf,
  type Aim,
  type OutpostRaise,
} from './construction';
import { BUILDINGS, RESOURCES, type BuildingKey, type ResearchCard, type ResourceKey } from './ids';
import { BUILDING_SPACING_KM } from './economy';
import { destinationPoint, type LonLat } from './geo';
import { DEPOSIT_POINTS } from './world';
import type { Building, BuildSpec, Cost, PlayerView } from './player-view';

/** Everything open at a headquarters of 1: the tier is under test on its own, below. */
const CATALOG = Object.fromEntries(
  BUILDINGS.map((key) => [key, { cost: { steel: 20 }, minutes: 30, lockedBy: null }]),
) as Record<BuildingKey, BuildSpec>;

describe('what holds a raise back', () => {
  const LOADED_AT = 1_000_000;
  const POINT: LonLat = [6.6, 49.04];

  const building = (overrides: Partial<Building> = {}): Building => ({
    id: 'building-1',
    key: 'arsenal',
    name: 'Arsenal',
    regionId: 'FRA-5328',
    point: POINT,
    level: 1,
    nextLevelCost: { steel: 90, coal: 54 },
    nextLevelMinutes: 90,
    cappedByHq: false,
    ...overrides,
  });

  const viewWith = (overrides: {
    stocks?: Partial<Record<ResourceKey, number>>;
    construction?: PlayerView['me']['construction'];
    queue?: PlayerView['me']['constructionQueue'];
    hqLevel?: number;
    outposts?: PlayerView['me']['outposts'];
  }): PlayerView =>
    ({
      me: {
        construction: overrides.construction ?? null,
        constructionQueue: overrides.queue ?? [],
        buildings: [],
        hqLevel: overrides.hqLevel ?? 1,
        outposts: overrides.outposts ?? [],
        resources: Object.fromEntries(
          RESOURCES.map((key) => [
            key,
            { stock: overrides.stocks?.[key] ?? 1000, ratePerHour: 0, cap: 1000 },
          ]),
        ),
      },
      loadedAt: LOADED_AT,
    }) as unknown as PlayerView;

  it('lets a payable raise through', () => {
    expect(upgradeHold(building(), viewWith({}), LOADED_AT)).toBeNull();
  });

  /** The queue is unbounded and prepaid (25/08), so a chantier elsewhere holds nothing: what
   *  a raise still waits on is an entry already aimed at its own point. */
  it('lets a raise through while a chantier runs elsewhere', () => {
    const running = {
      id: 'construction-1',
      name: 'Mine',
      key: 'mine' as const,
      regionId: 'FRA-5325',
      regionName: 'Meurthe-et-Moselle',
      outpostId: null,
      point: [6.2, 48.7] as LonLat,
      minutesLeft: 20,
      level: 2,
    };
    expect(upgradeHold(building(), viewWith({ construction: running }), LOADED_AT)).toBeNull();
  });

  it('holds a raise the queue already carries for this very point', () => {
    const queued = [
      {
        id: 'construction-2',
        name: 'Arsenal',
        key: 'arsenal' as const,
        outpostId: null,
        regionId: 'FRA-5328',
        regionName: 'Moselle',
        point: POINT,
        level: 2,
      },
    ];
    expect(upgradeHold(building(), viewWith({ queue: queued }), LOADED_AT)).toEqual({
      kind: 'alreadyQueued',
    });
  });

  it('reads the headquarters ceiling off the view rather than deciding it again', () => {
    expect(upgradeHold(building({ cappedByHq: true }), viewWith({}), LOADED_AT)).toEqual({
      kind: 'cappedByHq',
    });
  });

  it('holds a raise on ground no standing outpost reaches, with the levels of the outposts that stand', () => {
    const outposts = [
      { standsAt: null, level: 1, lonLat: [0, 0] },
      { standsAt: Date.now() + 1e9, level: 3, lonLat: [1, 1] },
    ] as unknown as PlayerView['me']['outposts'];
    const hold = upgradeHold(building({ unreached: true }), viewWith({ outposts }), LOADED_AT);
    expect(hold).toEqual({ kind: 'outOfReach', outpostLevels: [1] });
  });

  it('holds a raise before the headquarters stands', () => {
    expect(upgradeHold(building(), viewWith({ hqLevel: 0 }), LOADED_AT)).toEqual({
      kind: 'hqFirst',
    });
  });

  /** The whole point of anticipating the refusal: the shortfall is named, never "impossible". */
  it('names the resource that is short, and by how much', () => {
    const hold = upgradeHold(building(), viewWith({ stocks: { coal: 12 } }), LOADED_AT);
    expect(hold).toEqual({ kind: 'materials', resource: 'coal', needed: 54, available: 12 });
  });

  it('reads the stock as it stands now, not as it was served', () => {
    const view = {
      me: {
        construction: null,
        constructionQueue: [],
        buildings: [],
        resources: Object.fromEntries(
          RESOURCES.map((key) => [
            key,
            { stock: key === 'coal' ? 50 : 1000, ratePerHour: 60, cap: 1000 },
          ]),
        ),
      },
      loadedAt: LOADED_AT,
    } as unknown as PlayerView;
    expect(upgradeHold(building(), view, LOADED_AT)?.kind).toBe('materials');
    expect(upgradeHold(building(), view, LOADED_AT + 10 * 60_000)).toBeNull();
  });
});

/**
 * **La règle de pose, sous le pointeur** (ADR 0029) : ce que le fantôme dit avant le clic est le
 * refus même de `constructions.start`, lu sur les faits que la vue et la carte portent.
 */
describe('raiseRefusalOf', () => {
  const free = { reached: true, hqLevel: 1, queued: false, cappedByHq: false };

  it('lets a reached, queue-free, uncapped raise through', () => {
    expect(raiseRefusalOf(free)).toBeNull();
  });

  it('refuses ground nothing reaches, before anything else', () => {
    expect(raiseRefusalOf({ reached: false, hqLevel: 0, queued: true, cappedByHq: true })).toBe(
      'OUT_OF_OUTPOST_REACH',
    );
  });

  it('refuses until the headquarters stands, then the point already queued, then the ceiling', () => {
    expect(raiseRefusalOf({ ...free, hqLevel: 0, queued: true })).toBe('HQ_FIRST');
    expect(raiseRefusalOf({ ...free, queued: true, cappedByHq: true })).toBe('ALREADY_QUEUED_HERE');
    expect(raiseRefusalOf({ ...free, cappedByHq: true })).toBe('CAPPED_BY_HQ');
  });
});

describe('the point aimed at', () => {
  /** The Pas-de-Calais: coal and nothing else in its region, unlike the Moselle and its iron. */
  const COAL = DEPOSIT_POINTS.find((deposit) => deposit.id === 'coal-FRA-5334')!;
  const FRANCE = { id: 'FRA-5333', name: 'Paris', country: 'FRA' };
  const PARIS: LonLat = [2.35, 48.85];

  const view = (overrides: {
    buildings?: ReadonlyArray<{ key: BuildingKey; point: LonLat }>;
    foundation?: PlayerView['me']['foundation'];
    surveyed?: ReadonlyArray<LonLat>;
    regions?: PlayerView['me']['regions'];
    locked?: ResearchCard;
  }): PlayerView =>
    ({
      me: {
        nation: 'france',
        hqLevel: 1,
        foundation: overrides.foundation ?? [],
        construction: null,
        constructionQueue: [],
        buildings: overrides.buildings ?? [],
        outposts: [],
        regions: overrides.regions ?? [],
      },
      surveyedInstallations: (overrides.surveyed ?? []).map((point, k) => ({
        id: `seen-${k}`,
        key: 'mine',
        regionId: 'x',
        point,
      })),
      buildCatalog: Object.fromEntries(
        BUILDINGS.map((key) => [
          key,
          { cost: { steel: 20 }, minutes: 30, lockedBy: overrides.locked ?? null },
        ]),
      ),
    }) as unknown as PlayerView;

  it('names who is known to work a deposit, mine with its level, a survey unnamed', () => {
    const mine = view({ buildings: [{ key: 'mine', point: COAL.lonLat, level: 2 } as never] });
    expect(depositHolders(mine).get(COAL.id)).toEqual({ mine: true, level: 2 });
    expect(depositHolders(view({ surveyed: [COAL.lonLat] })).get(COAL.id)).toEqual({
      mine: false,
      level: null,
    });
    expect(depositHolders(view({})).has(COAL.id)).toBe(false);
  });

  const aim = (lonLat: LonLat, extra: Partial<Aim> = {}): Aim => ({
    lonLat,
    region: FRANCE,
    coastal: false,
    onLand: true,
    ...extra,
  });

  const refusalOf = (v: PlayerView, key: BuildingKey, at: Aim) =>
    aimVerdict(v, key, at, []).refusal;

  it('takes a point on national soil, and says nothing', () => {
    expect(refusalOf(view({}), 'barracks', aim(PARIS))).toBeNull();
  });

  it('says the sea, or a map not yet drawn, is no ground', () => {
    expect(refusalOf(view({}), 'barracks', aim(PARIS, { region: null }))).toEqual({
      code: 'NO_GROUND',
    });
  });

  it('says a barracks aimed at the water is refused there, before the click', () => {
    expect(refusalOf(view({}), 'barracks', aim(PARIS, { onLand: false }))).toEqual({
      code: 'NOT_ON_LAND',
    });
    expect(refusalOf(view({}), 'port', aim(PARIS, { onLand: false, coastal: true }))).toBeNull();
  });

  it('refuses a point abroad no outpost reaches', () => {
    const abroad = aim([7, 51], { region: { id: 'DEU-1572', name: 'Ruhr', country: 'DEU' } });
    expect(refusalOf(view({}), 'barracks', abroad)).toEqual({ code: 'OUT_OF_REACH' });
    expect(
      aimVerdict(view({}), 'barracks', abroad, [{ id: 'o', lonLat: [7.2, 51], reachKm: 120 }])
        .refusal,
    ).toBeNull();
  });

  it('wants an exploitation on its own free deposit', () => {
    expect(refusalOf(view({}), 'mine', aim(PARIS))).toEqual({ code: 'DEPOSIT_REQUIRED' });
    expect(refusalOf(view({}), 'mine', aim(COAL.lonLat))).toBeNull();
    expect(refusalOf(view({}), 'farm', aim(COAL.lonLat))).toEqual({ code: 'DEPOSIT_REQUIRED' });
    expect(refusalOf(view({ surveyed: [COAL.lonLat] }), 'mine', aim(COAL.lonLat))).toEqual({
      code: 'DEPOSIT_TAKEN',
    });
  });

  /** La clé avant la portée, comme le serveur : une clé verrouillée hors de portée se dit
   *  verrouillée aux deux bouts (`movements.test.ts`). */
  it('names the locked key before the reach', () => {
    const abroad = aim([7, 51], { region: { id: 'DEU-1572', name: 'Ruhr', country: 'DEU' } });
    expect(refusalOf(view({ locked: 'aviation' }), 'barracks', abroad)).toEqual({
      code: 'RESEARCH_REQUIRED',
    });
  });

  it('lets a deposit go under another key: only an exploitation holds it', () => {
    const surveyedBarracks = {
      ...view({}),
      surveyedInstallations: [{ id: 's', key: 'barracks', regionId: 'x', point: COAL.lonLat }],
    } as unknown as PlayerView;
    expect(refusalOf(surveyedBarracks, 'mine', aim(COAL.lonLat))).toBeNull();
  });

  it('gives a port no verdict while the coast has not landed, and a barracks its own', () => {
    expect(refusalOf(view({}), 'port', aim(PARIS, { coastal: null }))).toEqual({
      code: 'COAST_PENDING',
    });
    expect(refusalOf(view({}), 'barracks', aim(PARIS, { coastal: null }))).toBeNull();
  });

  it('wants a port on the coast', () => {
    expect(refusalOf(view({}), 'port', aim(PARIS))).toEqual({ code: 'NOT_COASTAL' });
    expect(refusalOf(view({}), 'port', aim(PARIS, { coastal: true }))).toBeNull();
  });

  it(`names the neighbour closer than ${BUILDING_SPACING_KM} km`, () => {
    const near = destinationPoint(PARIS, BUILDING_SPACING_KM - 5, 90);
    const far = destinationPoint(PARIS, BUILDING_SPACING_KM + 5, 90);
    const stood = view({ buildings: [{ key: 'arsenal', point: PARIS }] });
    expect(refusalOf(stood, 'barracks', aim(near))).toEqual({
      code: 'TOO_CLOSE',
      near: 'arsenal',
      km: BUILDING_SPACING_KM,
    });
    expect(refusalOf(stood, 'barracks', aim(far))).toBeNull();
  });

  it('marks free what the foundation owes on this very deposit, and only there', () => {
    const owed = view({ foundation: [{ key: 'mine', deposit: 'coal' }] });
    expect(aimVerdict(owed, 'mine', aim(COAL.lonLat), []).free).toBe(true);
    expect(aimVerdict(owed, 'mine', aim(PARIS), []).free).toBe(false);
  });

  describe('placementOf', () => {
    const region = (id: string): PlayerView['me']['regions'][number] => ({
      id,
      name: id,
      coastal: false,
      point: [0, 0],
      linked: true,
      buildings: [],
      site: { outpostId: null },
    });

    it('names the research card a locked key waits on', () => {
      expect(placementOf(view({ locked: 'aviation' }), 'airfield').condition).toEqual({
        kind: 'locked',
        card: 'aviation',
      });
    });

    it('names the deposit when no free one lies in the regions the player holds', () => {
      expect(placementOf(view({}), 'mine').condition).toMatchObject({
        kind: 'deposit',
        deposits: ['coal', 'iron'],
      });
      expect(placementOf(view({ regions: [region(COAL.regionId)] }), 'mine').condition).toBeNull();
      expect(
        placementOf(view({ regions: [region(COAL.regionId)] }), 'mine', ['iron']).condition,
      ).toMatchObject({ kind: 'deposit', deposits: ['iron'] });
    });

    /** #239 : la maquette nomme, sur la clé refusée, le plus proche des gisements libres. */
    it('names the nearest free deposit of the kind, from the headquarters', () => {
      const withHq = view({ buildings: [{ key: 'hq', point: PARIS }] });
      const condition = placementOf(withHq, 'oilWell').condition;
      expect(condition?.kind === 'deposit' && condition.nearest?.country).toBe('ROU');
      expect(condition?.kind === 'deposit' && condition.nearest!.km).toBeGreaterThan(1500);
      const without = placementOf(view({}), 'oilWell').condition;
      expect(without?.kind === 'deposit' && without.nearest).toBeNull();
    });

    it('leaves anything else to the aim', () => {
      expect(placementOf(view({}), 'barracks').condition).toBeNull();
    });
  });
});

/**
 * **What a held key calls** (#239): the free deposits of its kinds, each with the verdict the
 * pose would give on its very point — the maquette's Belgium, an outpost at Namur.
 */
describe('depositCalls', () => {
  const byId = (id: string) => DEPOSIT_POINTS.find((deposit) => deposit.id === id)!;
  const view = {
    me: {
      nation: 'france',
      hqLevel: 1,
      foundation: [],
      construction: null,
      constructionQueue: [],
      buildings: [{ key: 'mine', point: byId('coal-FRA-5334').lonLat, level: 2 }],
      outposts: [],
      regions: [],
    },
    surveyedInstallations: [
      { id: 's', key: 'mine', regionId: 'DEU-1581', point: byId('coal-DEU-1581').lonLat },
    ],
    buildCatalog: CATALOG,
  } as unknown as PlayerView;
  const NAMUR = [{ id: 'o', lonLat: [4.87, 50.47] as LonLat, reachKm: 120 }];
  const calls = new Map(
    depositCalls(view, 'mine', ['coal', 'iron'], NAMUR).map((call) => [
      call.deposit.id,
      call.refusal?.code ?? 'open',
    ]),
  );

  it('opens a deposit an outpost reaches, and one on national soil', () => {
    expect(calls.get('coal-BEL-2')).toBe('open');
    expect(calls.get('iron-FRA-5325')).toBe('open');
  });

  it('calls a deposit out of reach, but says the pose would refuse it', () => {
    expect(calls.get('coal-DEU-1572')).toBe('OUT_OF_REACH');
  });

  it('never calls a deposit known to be worked, mine or surveyed, nor another kind', () => {
    expect(calls.has('coal-FRA-5334')).toBe(false);
    expect(calls.has('coal-DEU-1581')).toBe(false);
    expect(calls.has('food-BEL-3476')).toBe(false);
  });
});

describe('snapTo', () => {
  const POINTER: LonLat = [2.35, 48.85];

  it(`leaps onto the closest magnet within ${PLACING_SNAP_KM} km`, () => {
    const near = destinationPoint(POINTER, PLACING_SNAP_KM / 2, 0);
    const nearer = destinationPoint(POINTER, PLACING_SNAP_KM / 4, 180);
    expect(snapTo(POINTER, [near, nearer])).toEqual(nearer);
  });

  it('stays under the pointer when nothing is close enough', () => {
    expect(snapTo(POINTER, [destinationPoint(POINTER, PLACING_SNAP_KM * 2, 0)])).toEqual(POINTER);
  });
});

/**
 * **Ce qui empêche de monter un avant-poste** (précision du 15/09 de l'ADR 0020 §10). La
 * fonction est lue par les deux bouts — le bouton du panneau de garnison et la mutation qui met
 * en file — donc elle se tient ici, seule, avec ses quatre empêchements et leur ordre.
 */
describe('raising an outpost', () => {
  const STOCKED: Record<ResourceKey, number> = Object.fromEntries(
    RESOURCES.map((key) => [key, 1000]),
  ) as Record<ResourceKey, number>;

  const point = (over: Partial<OutpostRaise> = {}): OutpostRaise => ({
    level: 1,
    disabled: false,
    queued: false,
    stocks: STOCKED,
    ...over,
  });

  const COST: Cost = { steel: 117, coal: 36 };

  it('lets a payable raise through', () => {
    expect(outpostRaiseHold(point(), COST, 3)).toBeNull();
  });

  it('names the ceiling at the last level, and the figure with it', () => {
    expect(outpostRaiseHold(point({ level: 3 }), COST, 3)).toEqual({
      kind: 'maxLevel',
      maximum: 3,
    });
  });

  /** **On ne rénove pas sous le feu** (décision 3a) : l'état, pas une perte — le point revient. */
  it('refuses a point a raid has put out of service', () => {
    expect(outpostRaiseHold(point({ disabled: true }), COST, 3)).toEqual({ kind: 'disabled' });
  });

  /** Une seconde élévation attendrait un niveau que la première n'a pas atteint, donc tarifé
   *  faux : une seule à la fois, par point. */
  it('refuses a second raise while the first is queued', () => {
    expect(outpostRaiseHold(point({ queued: true }), COST, 3)).toEqual({ kind: 'alreadyQueued' });
  });

  /** Le premier manque dans l'ordre des ressources, jamais une liste : une facture se paie
   *  entière ou pas du tout. */
  it('names the first resource short, and only it', () => {
    const short = point({ stocks: { ...STOCKED, steel: 40, coal: 0 } });
    expect(outpostRaiseHold(short, COST, 3)).toEqual({
      kind: 'materials',
      resource: 'steel',
      needed: 117,
      available: 40,
    });
  });

  /** L'ordre compte : un point au maximum n'a pas de facture à présenter, et un point hors
   *  service ne doit pas s'entendre reprocher sa caisse. */
  it('puts the ceiling and the disabling ahead of the bill', () => {
    const broke = {
      stocks: Object.fromEntries(RESOURCES.map((key) => [key, 0])),
    } as Partial<OutpostRaise>;
    expect(outpostRaiseHold(point({ level: 3, ...broke }), COST, 3)?.kind).toBe('maxLevel');
    expect(outpostRaiseHold(point({ disabled: true, ...broke }), COST, 3)?.kind).toBe('disabled');
  });
});

describe('riseOf', () => {
  it('reads how far a site has risen from the minutes left out of the minutes it lasts', () => {
    expect(riseOf(30, 30)).toBe(0);
    expect(riseOf(27, 30)).toBeCloseTo(0.1);
    expect(riseOf(3, 30)).toBeCloseTo(0.9);
    expect(riseOf(0, 30)).toBe(1);
  });

  it('never overflows when the clock or the scale disagree with the site', () => {
    expect(riseOf(-5, 30)).toBe(1);
    expect(riseOf(45, 30)).toBe(0);
    expect(riseOf(0, 0)).toBe(1);
  });
});

describe('workSitesOf', () => {
  const LOADED = 1_000_000;
  /** One point per region of the fixture: a raise is the work aimed at a building's point. */
  const at = (regionId: string): LonLat => [regionId.charCodeAt(regionId.length - 1), 0];
  const me = (over: Partial<PlayerView['me']>) =>
    ({
      buildings: [
        {
          id: 'b-arsenal',
          key: 'arsenal',
          regionId: 'r-f',
          point: at('r-f'),
          level: 2,
          nextLevelMinutes: 90,
        },
      ],
      construction: null,
      constructionQueue: [],
      ...over,
    }) as unknown as PlayerView['me'];
  const head = (key: BuildingKey | 'outpost', regionId: string, minutesLeft: number) => ({
    id: 'w',
    name: key,
    key,
    outpostId: null,
    regionId,
    regionName: 'Marne',
    point: at(regionId),
    minutesLeft,
    level: 1,
  });
  const queued = (
    key: BuildingKey | 'outpost',
    regionId: string,
    level: number,
    outpostId: string | null = null,
  ) => ({
    id: `q-${regionId}`,
    name: key,
    key,
    outpostId,
    regionId,
    regionName: 'Meuse',
    point: outpostId === null ? at(regionId) : null,
    level,
  });

  it('dates the head of the queue — a first level rises by the catalog, a raise by the building', () => {
    expect(workSitesOf(me({ construction: head('farm', 'r-a', 10) }), CATALOG, LOADED)).toEqual([
      expect.objectContaining({
        phase: 'rising',
        key: 'farm',
        regionId: 'r-a',
        level: 1,
        finishesAt: LOADED + 600_000,
        minutes: 30,
      }),
    ]);
    expect(workSitesOf(me({ construction: head('arsenal', 'r-f', 45) }), CATALOG, LOADED)).toEqual([
      expect.objectContaining({
        phase: 'raising',
        key: 'arsenal',
        level: 3,
        finishesAt: LOADED + 2_700_000,
        minutes: 90,
      }),
    ]);
  });

  it('plans a queued first level by its rank and leaves it undated; a queued raise draws nothing', () => {
    const sites = workSitesOf(
      me({
        construction: head('farm', 'r-a', 10),
        constructionQueue: [
          queued('warehouse', 'r-b', 1),
          queued('arsenal', 'r-f', 3),
          queued('barracks', 'r-c', 1),
        ],
      }) as PlayerView['me'],
      CATALOG,
      LOADED,
    );
    expect(sites.map((site) => [site.phase, site.regionId, site.rank, site.finishesAt])).toEqual([
      ['rising', 'r-a', 0, LOADED + 600_000],
      ['queued', 'r-b', 1, null],
      ['queued', 'r-c', 3, null],
    ]);
  });

  it("leaves an outpost's works to its own mast", () => {
    const outpost = { ...head('outpost', 'r-o', 5), outpostId: 'o1' };
    expect(
      workSitesOf(
        me({
          construction: outpost,
          constructionQueue: [queued('outpost', 'r-p', 2, 'o2')],
        }) as PlayerView['me'],
        CATALOG,
        LOADED,
      ),
    ).toEqual([]);
  });
});
