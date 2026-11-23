import { describe, expect, it } from 'vitest';
import {
  BOT_POINT_COLUMN,
  decideTurn,
  type BotContext,
  type BotWorld,
  type BotWorkshop,
} from './bot';
import { BUILDINGS, RESOURCES, type BuildingKey, type UnitRole } from './ids';
import type { BuildSpec, PlayerView, TroopView } from './player-view';

const NOW = 1_000_000;
const HQ_POINT = [2.35, 48.85] as const;
const BARRACKS_POINT = [4.05, 46.2] as const;
/** Un voisin au nord, un autre plus loin à l'est, un troisième au sud : l'ordre de proximité. */
const BELGIUM = [4.4, 50.8] as const;
const GERMANY = [8.0, 49.5] as const;
const SPAIN = [-3.7, 40.4] as const;

const regions = [
  { id: 'FRA-1', country: 'FRA', point: [2.5, 47.0] as const },
  { id: 'BEL-1', country: 'BEL', point: BELGIUM },
  { id: 'DEU-1', country: 'DEU', point: GERMANY },
  { id: 'ESP-1', country: 'ESP', point: SPAIN },
];

const world = (over: Partial<BotWorld> = {}): BotWorld => ({
  carriesBuilding: () => true,
  regionAt: (point) => regions.find((r) => r.point === point) ?? null,
  groundAt: () => 'land',
  coastalAt: () => false,
  walkableAt: () => true,
  landRoute: () => ({ km: 100 }),
  regions,
  nearestRegionId: (point) => regions.find((r) => r.point === point)?.id ?? null,
  ...over,
});

const catalog = Object.fromEntries(
  BUILDINGS.map((key) => [key, { cost: { steel: 20 }, minutes: 30, lockedBy: null }]),
) as Record<BuildingKey, BuildSpec>;

const hq = { id: 'hq-1', key: 'hq', regionId: 'FRA-0', point: HQ_POINT, level: 1 };
const barracks = { id: 'b-1', key: 'barracks', regionId: 'FRA-2', point: BARRACKS_POINT, level: 1 };

const inBuilding = (buildingId: string) => ({ kind: 'building' as const, buildingId });
const atPoint = (lonLat: readonly [number, number]) => ({
  kind: 'point' as const,
  lonLat,
  country: 'BEL',
  afloat: false,
  ground: 'land' as const,
  coastal: false,
});

const troop = (
  id: string,
  stationedAt: TroopView['stationedAt'],
  role: UnitRole = 'infantry',
  over: Partial<TroopView> = {},
): TroopView =>
  ({
    id,
    role,
    tier: 1,
    strength: 50,
    nominalStrength: 50,
    stationedAt,
    supplied: true,
    serving: false,
    besieged: false,
    ...over,
  }) as TroopView;

const viewOf = (me: Record<string, unknown> = {}, rest: Record<string, unknown> = {}): PlayerView =>
  ({
    loadedAt: NOW,
    mode: 'mondiale',
    buildCatalog: catalog,
    outpostFoundation: { cost: { steel: 10 }, minutes: 60 },
    surveyedInstallations: [],
    arcs: [],
    camps: [],
    strategicPoints: [],
    me: {
      nation: 'france',
      capitalPoint: HQ_POINT,
      hqLevel: 1,
      foundation: [],
      buildings: [hq, barracks],
      outposts: [],
      troops: [],
      stationedCargo: [],
      construction: null,
      constructionQueue: [],
      regions: [{ id: 'FRA-0', point: HQ_POINT, site: null }],
      slots: { total: 2, used: 0 },
      research: { researched: [], running: null, queue: [] },
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 1000, ratePerHour: 0, cap: 1000 }]),
      ),
      ...me,
    },
    ...rest,
  }) as unknown as PlayerView;

/** Une armée au complet : aucune règle d'ouverture ne parle, seules les pièces sont jugées. */
const fullArmy: BotWorkshop = {
  troopsInService: 6,
  troopsQueued: 0,
  facilities: [],
  roster: [],
  grid: [],
};

const turn = (view: PlayerView, geography = world()) =>
  decideTurn({ view, workshop: fullArmy, world: geography, now: NOW } satisfies BotContext);

const camp = (point: readonly [number, number], lastKnown = false) => ({
  id: 'camp-1',
  point,
  medium: 'land',
  lastKnown,
});

describe('le bot facile défend son QG', () => {
  const near = [2.6, 49.2] as const;

  it('frappe le camp relevé près du QG avec les troupes libres, en tête', () => {
    const view = viewOf(
      { troops: [troop('t1', inBuilding('hq-1')), troop('t2', inBuilding('hq-1'))] },
      { camps: [camp(near)] },
    );
    expect(turn(view)).toEqual([
      {
        fn: 'movements.attack',
        args: {
          origin: { kind: 'building', buildingId: 'hq-1' },
          troopIds: ['t1', 't2'],
          target: { kind: 'camp', campId: 'camp-1' },
        },
      },
    ]);
  });

  it('ignore un camp loin du QG', () => {
    const view = viewOf({ troops: [troop('t1', inBuilding('hq-1'))] }, { camps: [camp([30, 60])] });
    expect(turn(view).map((order) => order.fn)).not.toContain('movements.attack');
  });

  it('rentre au QG les troupes libres hors de chez lui quand le refus écarte la frappe', () => {
    const view = viewOf(
      { troops: [troop('t1', atPoint(BELGIUM)), troop('t2', inBuilding('hq-1'))] },
      { camps: [camp(near)] },
    );
    // Le camp est à l'eau pour la grille : l'attaque d'une colonne de terre est refusée.
    const orders = turn(view, world({ groundAt: (point) => (point === near ? 'sea' : 'land') }));
    expect(orders).toEqual([
      {
        fn: 'movements.enterGarrison',
        args: {
          origin: { kind: 'point', point: { lon: BELGIUM[0], lat: BELGIUM[1] } },
          troopIds: ['t1'],
          buildingId: 'hq-1',
        },
      },
    ]);
  });

  it("n'envoie pas une troupe en marche, ni une qui tourne, ni une à bord", () => {
    const view = viewOf(
      {
        troops: [
          troop('t1', inBuilding('hq-1')),
          troop('t2', inBuilding('hq-1'), 'infantry', { carriedBy: 'truck' }),
          troop('t3', inBuilding('hq-1'), 'infantry', { patrol: {} as never }),
          troop('t4', inBuilding('hq-1')),
        ],
      },
      {
        camps: [camp(near)],
        arcs: [{ state: 'mine', id: 'a', troopIds: ['t4'] }],
      },
    );
    expect(turn(view)).toMatchObject([{ args: { troopIds: ['t1'] } }]);
  });

  it('ne frappe pas un camp qui ne se tient pas sur la terre', () => {
    const view = viewOf(
      { troops: [troop('t1', inBuilding('hq-1'))] },
      { camps: [{ ...camp(near), medium: 'sea' }] },
    );
    expect(turn(view)).toEqual([]);
  });

  it("ne part pas sans route à pied jusqu'au camp", () => {
    const view = viewOf({ troops: [troop('t1', inBuilding('hq-1'))] }, { camps: [camp(near)] });
    expect(turn(view, world({ landRoute: () => null }))).toEqual([]);
  });
});

describe('le bot facile avance', () => {
  const squad = [
    troop('t1', inBuilding('b-1')),
    troop('t2', inBuilding('b-1')),
    troop('t3', inBuilding('b-1')),
  ];

  it('marche vers le point exact de la région étrangère la plus proche de son QG', () => {
    expect(turn(viewOf({ troops: squad }))).toEqual([
      {
        fn: 'movements.marchTo',
        args: {
          origin: { kind: 'building', buildingId: 'b-1' },
          troopIds: ['t1', 't2'],
          point: { lon: BELGIUM[0], lat: BELGIUM[1] },
        },
      },
    ]);
  });

  it('saute une région sans route, puis une région déjà tenue', () => {
    const view = viewOf({
      troops: squad,
      regions: [
        { id: 'FRA-0', point: HQ_POINT, site: null },
        { id: 'DEU-1', point: GERMANY, site: null },
      ],
    });
    const orders = turn(
      view,
      world({ landRoute: (_from, to) => (to === BELGIUM ? null : { km: 1 }) }),
    );
    expect(orders).toMatchObject([{ args: { point: { lon: SPAIN[0], lat: SPAIN[1] } } }]);
  });

  it('ne part pas sans slot libre, ni quand un camp menace le QG', () => {
    expect(turn(viewOf({ troops: squad, slots: { total: 2, used: 2 } }))).toEqual([]);
    const threatened = viewOf({ troops: squad }, { camps: [camp([2.6, 49.2])] });
    expect(turn(threatened).map((order) => order.fn)).not.toContain('movements.marchTo');
  });

  it("n'emmène pas la garnison d'un avant-poste", () => {
    const view = viewOf({
      troops: [troop('t1', { kind: 'outpost', outpostId: 'o-1' })],
      outposts: [{ id: 'o-1', regionId: 'BEL-1', standsAt: null, lonLat: BELGIUM }],
    });
    expect(turn(view)).toEqual([]);
  });

  it("laisse un fantassin à l'adresse qu'il quitte, et ne part pas seul", () => {
    const two = [troop('t1', inBuilding('b-1')), troop('t2', inBuilding('b-1'))];
    expect(turn(viewOf({ troops: two }))).toMatchObject([{ args: { troopIds: ['t1'] } }]);
    expect(turn(viewOf({ troops: [two[0]!] }))).toEqual([]);
  });

  it("n'attend pas d'une menace que la défense ne peut pas frapper", () => {
    const near = [2.6, 49.2] as const;
    const squad = [troop('t1', inBuilding('b-1')), troop('t2', inBuilding('b-1'))];
    const naval = viewOf({ troops: squad }, { camps: [{ ...camp(near), medium: 'sea' }] });
    expect(turn(naval).map((order) => order.fn)).toEqual(['movements.marchTo']);
    const cut = world({ landRoute: (from) => (from === HQ_POINT ? null : { km: 1 }) });
    const inland = viewOf({ troops: squad }, { camps: [camp(near)] });
    expect(turn(inland, cut).map((order) => order.fn)).toEqual(['movements.marchTo']);
  });

  it("n'attend pas un camp perdu de vue : sa dernière position périme, la défense n'y court pas", () => {
    const near = [2.6, 49.2] as const;
    const squad = [troop('t1', inBuilding('b-1')), troop('t2', inBuilding('b-1'))];
    const gone = viewOf({ troops: squad }, { camps: [camp(near, true)] });
    expect(turn(gone).map((order) => order.fn)).toEqual(['movements.marchTo']);
  });

  it("ne garde qu'une marche par slot libre", () => {
    const near = [2.6, 49.2] as const;
    const view = viewOf(
      {
        troops: [troop('t1', inBuilding('b-1')), troop('t2', inBuilding('hq-1'))],
        slots: { total: 2, used: 1 },
      },
      { camps: [camp(near)] },
    );
    // Deux escouades, deux frappes voulues, un seul slot : une seule part.
    expect(turn(view)).toHaveLength(1);
    expect(
      turn(viewOf({ ...view.me, slots: { total: 2, used: 0 } }, { camps: [camp(near)] })),
    ).toHaveLength(2);
  });
});

describe('le bot facile recrute', () => {
  const workshop = (facilities: BotWorkshop['facilities'], inService: number): BotWorkshop => ({
    troopsInService: inService,
    troopsQueued: 0,
    facilities,
    roster: [{ role: 'landTransport', count: 1 }],
    grid: [{ role: 'infantry', unit: { costs: { steel: 5 } } }],
  });
  const site = [{ id: 'b-1', key: 'barracks' as const, queue: [] }];
  const garrison = (id: string, outpostId: string) => troop(id, { kind: 'outpost', outpostId });

  it("ne compte pas la garnison de ses avant-postes dans l'armée qui avance", () => {
    const view = viewOf({
      troops: [
        troop('t1', inBuilding('b-1')),
        garrison('g1', 'o-1'),
        garrison('g2', 'o-1'),
        garrison('g3', 'o-2'),
        garrison('g4', 'o-2'),
        troop('c1', inBuilding('b-1'), 'landTransport'),
      ],
    });
    // Six troupes en service, mais quatre tiennent des points : l'armée libre est à deux.
    expect(
      decideTurn({ view, workshop: workshop(site, 6), world: world(), now: NOW }),
    ).toMatchObject([{ fn: 'troops.recruit', args: { role: 'infantry' } }]);
  });
});

describe('le bot facile prend un point', () => {
  const LISBON = [-9.14, 38.72] as const;
  const neutral = (id: string, point: readonly [number, number] = LISBON) => ({
    id,
    key: 'lisbon',
    regionId: 'PRT-1',
    point,
    holder: null,
    heldSince: null,
    mine: false,
    contested: false,
    longest: null,
  });
  const army = (count: number, at = inBuilding('b-1')) =>
    Array.from({ length: count }, (_, rank) => troop(`t${rank}`, at));
  const ids = (count: number) => army(count).map((one) => one.id);
  const capture = (order: unknown) => ({
    fn: 'movements.capture',
    args: {
      origin: { kind: 'building', buildingId: 'b-1' },
      troopIds: ids(BOT_POINT_COLUMN),
      target: { kind: 'point', pointId: 'p-1' },
    },
    ...(order as object),
  });
  const turnWith = (
    me: Record<string, unknown>,
    rest: Record<string, unknown> = {},
    geo = world(),
  ) => turn(viewOf(me, { strategicPoints: [neutral('p-1')], ...rest }), geo);

  it('envoie toute son escouade prendre le point neutre quand elle a de quoi vaincre la garnison', () => {
    expect(turnWith({ troops: army(BOT_POINT_COLUMN) })).toEqual([capture({})]);
  });

  it("ne part pas à la capture avec moins d'infanteries que la colonne", () => {
    expect(turnWith({ troops: army(BOT_POINT_COLUMN - 1) }).map((order) => order.fn)).toEqual([
      'movements.marchTo',
    ]);
  });

  it("joue une seule envie par escouade : la capture prend les troupes que l'avance voulait", () => {
    const orders = turnWith({ troops: army(BOT_POINT_COLUMN + 3) });
    expect(orders.map((order) => order.fn)).toEqual(['movements.capture']);
  });

  it('ne garde que les captures que les slots libres permettent', () => {
    const troops = [
      ...army(BOT_POINT_COLUMN),
      ...Array.from({ length: BOT_POINT_COLUMN }, (_, rank) =>
        troop(`h${rank}`, inBuilding('hq-1')),
      ),
    ];
    const view = (used: number) =>
      viewOf({ troops, slots: { total: 2, used } }, { strategicPoints: [neutral('p-1')] });
    expect(turn(view(1))).toHaveLength(1);
    expect(turn(view(0))).toHaveLength(2);
  });

  it("n'attaque ni un point tenu, ni un point à soi", () => {
    const held = { ...neutral('p-1'), holder: { nation: 'ussr', heldMs: 0 } };
    const mine = { ...neutral('p-1'), holder: { nation: 'france', heldMs: 0 }, mine: true };
    for (const point of [held, mine]) {
      const orders = turn(viewOf({ troops: army(BOT_POINT_COLUMN) }, { strategicPoints: [point] }));
      expect(orders.map((order) => order.fn)).not.toContain('movements.capture');
    }
  });

  it('laisse la défense du QG au-dessus : un camp relevé près du QG prend les troupes', () => {
    const orders = turnWith({ troops: army(BOT_POINT_COLUMN) }, { camps: [camp([2.6, 49.2])] });
    expect(orders.map((order) => order.fn)).toEqual(['movements.attack']);
  });

  it("n'y va pas non plus tant qu'un camp menace le QG, même si la défense ne peut pas le frapper", () => {
    const cut = world({
      landRoute: (from, to) => (from === HQ_POINT || to === LISBON ? { km: 100 } : null),
    });
    const orders = turnWith(
      { troops: army(BOT_POINT_COLUMN) },
      { camps: [camp([2.6, 49.2])] },
      cut,
    );
    expect(orders).toEqual([]);
  });

  it('ne capture pas quand le joueur a faim, ni sans slot libre', () => {
    const starving = turnWith({ troops: army(BOT_POINT_COLUMN), starving: true });
    expect(starving.map((order) => order.fn)).not.toContain('movements.capture');
    const full = turnWith({ troops: army(BOT_POINT_COLUMN), slots: { total: 2, used: 2 } });
    expect(full).toEqual([]);
  });

  it('passe au point suivant quand la route du plus proche est refusée', () => {
    const far = [28.98, 41.01] as const;
    const orders = turn(
      viewOf(
        { troops: army(BOT_POINT_COLUMN) },
        { strategicPoints: [neutral('p-1'), neutral('p-2', far)] },
      ),
      world({ landRoute: (_from, to) => (to === LISBON ? null : { km: 100 }) }),
    );
    expect(orders).toMatchObject([
      { fn: 'movements.capture', args: { target: { pointId: 'p-2' } } },
    ]);
  });

  it("ne part pas sans route à pied jusqu'à aucun des points", () => {
    expect(
      turnWith({ troops: army(BOT_POINT_COLUMN) }, {}, world({ landRoute: () => null })),
    ).toEqual([]);
  });

  it('refuse par la même porte que la rose : sans infanterie, sans capture', () => {
    const armor = Array.from({ length: BOT_POINT_COLUMN }, (_, rank) =>
      troop(`a${rank}`, inBuilding('b-1'), 'armor'),
    );
    expect(turnWith({ troops: armor }).map((order) => order.fn)).not.toContain('movements.capture');
  });

  it("recrute encore à neuf infanteries libres : la cible laisse la place d'une colonne", () => {
    const view = viewOf({ troops: army(BOT_POINT_COLUMN) });
    const site = [{ id: 'b-1', key: 'barracks' as const, queue: [] }];
    const workshop: BotWorkshop = {
      troopsInService: BOT_POINT_COLUMN,
      troopsQueued: 0,
      facilities: site,
      roster: [{ role: 'landTransport', count: 1 }],
      grid: [{ role: 'infantry', unit: { costs: { steel: 5 } } }],
    };
    expect(
      decideTurn({ view, workshop, world: world(), now: NOW }).map((order) => order.fn),
    ).toContain('troops.recruit');
  });
});

describe('le bot facile fonde', () => {
  const standing = (id: string, at: readonly [number, number]) => troop(id, atPoint(at));

  it("fonde un avant-poste là où l'escouade se tient, hors de chez lui", () => {
    const orders = turn(viewOf({ troops: [standing('t1', BELGIUM), standing('t2', BELGIUM)] }));
    expect(orders).toEqual([
      {
        fn: 'movements.foundOutpostHere',
        args: {
          point: { lon: BELGIUM[0], lat: BELGIUM[1] },
          regionId: 'BEL-1',
          troopIds: ['t1', 't2'],
        },
      },
    ]);
  });

  it("ne fonde pas sur une région où il a déjà un bâtiment, ni sans l'acier", () => {
    const mine = viewOf({
      troops: [standing('t1', BELGIUM)],
      buildings: [hq, { ...barracks, regionId: 'BEL-1' }],
    });
    expect(turn(mine).map((order) => order.fn)).not.toContain('movements.foundOutpostHere');
    const poor = viewOf({
      troops: [standing('t1', BELGIUM)],
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 0, ratePerHour: 0, cap: 1000 }]),
      ),
    });
    expect(turn(poor).map((order) => order.fn)).not.toContain('movements.foundOutpostHere');
  });

  it("attend l'acier posé sur sa région, sans se renvoyer marcher sur son propre point", () => {
    const poor = viewOf({
      troops: [standing('t1', BELGIUM), standing('t2', BELGIUM)],
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 0, ratePerHour: 0, cap: 1000 }]),
      ),
    });
    expect(turn(poor)).toEqual([]);
  });

  it('ne double pas un avant-poste déjà posé dans la région', () => {
    const view = viewOf({
      troops: [standing('t1', BELGIUM)],
      outposts: [{ id: 'o-1', regionId: 'BEL-1', standsAt: null, lonLat: BELGIUM }],
    });
    expect(turn(view).map((order) => order.fn)).not.toContain('movements.foundOutpostHere');
  });

  it("ne fonde qu'avec de l'infanterie, et sur la terre", () => {
    const tank = viewOf({ troops: [troop('t1', atPoint(BELGIUM), 'armor')] });
    expect(turn(tank).map((order) => order.fn)).not.toContain('movements.foundOutpostHere');
    const wet = viewOf({ troops: [standing('t1', BELGIUM)] });
    expect(turn(wet, world({ groundAt: () => 'sea' })).map((order) => order.fn)).not.toContain(
      'movements.foundOutpostHere',
    );
  });
});

describe('le bot facile ravitaille', () => {
  const outpost = (depot: number) => ({
    id: 'o-1',
    regionId: 'BEL-1',
    lonLat: BELGIUM,
    level: 1,
    standsAt: null,
    disabledMinutesLeft: null,
    depot: { ammunition: depot, oil: 0, coal: 0 },
    depotCapacity: 100,
  });
  const lorry = (
    at: TroopView['stationedAt'],
    load?: { ammunition: number; oil: number; coal: number },
  ) => troop('c1', at, 'landTransport', load === undefined ? {} : { load });

  it('charge le camion au QG quand un dépôt est sous la moitié', () => {
    const orders = turn(viewOf({ troops: [lorry(inBuilding('hq-1'))], outposts: [outpost(10)] }));
    expect(orders).toMatchObject([
      { fn: 'logistics.load', args: { troopId: 'c1', resource: 'ammunition' } },
    ]);
    const { amount } = (orders[0] as { args: { amount: number } }).args;
    expect(amount).toBeGreaterThan(0);
  });

  it('lance la tournée du camion chargé vers ce seul dépôt au passage suivant', () => {
    const orders = turn(
      viewOf({
        troops: [lorry(inBuilding('hq-1'), { ammunition: 20, oil: 0, coal: 0 })],
        outposts: [outpost(10)],
      }),
    );
    expect(orders).toEqual([{ fn: 'tours.start', args: { troopId: 'c1', stops: ['o-1'] } }]);
  });

  it('ne ravitaille pas un dépôt à moitié plein, ni un point encore en chantier', () => {
    expect(turn(viewOf({ troops: [lorry(inBuilding('hq-1'))], outposts: [outpost(50)] }))).toEqual(
      [],
    );
    const disabled = { ...outpost(0), disabledMinutesLeft: 30 };
    expect(turn(viewOf({ troops: [lorry(inBuilding('hq-1'))], outposts: [disabled] }))).toEqual([]);
    const building = { ...outpost(0), standsAt: NOW + 1000 };
    expect(turn(viewOf({ troops: [lorry(inBuilding('hq-1'))], outposts: [building] }))).toEqual([]);
  });

  it('ramène au QG un camion libre posé ailleurs, quand un dépôt attend', () => {
    const orders = turn(viewOf({ troops: [lorry(inBuilding('b-1'))], outposts: [outpost(10)] }));
    expect(orders).toEqual([
      {
        fn: 'movements.enterGarrison',
        args: {
          origin: { kind: 'building', buildingId: 'b-1' },
          troopIds: ['c1'],
          buildingId: 'hq-1',
        },
      },
    ]);
  });

  it("ne ramène pas un camion qui n'a pas le plein pour la route", () => {
    const dry = troop('c1', inBuilding('b-1'), 'landTransport', {
      supplies: { rounds: 0, fuel: 0 },
    });
    expect(turn(viewOf({ troops: [dry], outposts: [outpost(10)] }))).toEqual([]);
  });

  it('essaie le camion suivant quand le premier ne peut pas se charger', () => {
    const full = Object.fromEntries(RESOURCES.map((key) => [key, 200]));
    const stuffed = troop('c1', inBuilding('hq-1'), 'landTransport', { harvest: full as never });
    const free = troop('c2', inBuilding('hq-1'), 'landTransport');
    const orders = turn(viewOf({ troops: [stuffed, free], outposts: [outpost(10)] }));
    expect(orders).toMatchObject([{ fn: 'logistics.load', args: { troopId: 'c2' } }]);
  });

  describe('la tournée et le slot (#618)', () => {
    const full = { total: 2, used: 2 };
    const loaded = { ammunition: 20, oil: 0, coal: 0 };
    const atHome = world({
      regionAt: (point) =>
        point === HQ_POINT
          ? { id: 'FRA-0', country: 'FRA' }
          : (regions.find((r) => r.point === point) ?? null),
    });
    const tour = (hostCountry: string) =>
      turn(
        viewOf({
          troops: [lorry(inBuilding('hq-1'), loaded)],
          outposts: [{ ...outpost(10), hostCountry }],
          slots: full,
        }),
        atHome,
      );

    it("lance la tournée d'un dépôt au pays sans slot libre : elle n'en prend pas", () => {
      expect(tour('FRA')).toEqual([{ fn: 'tours.start', args: { troopId: 'c1', stops: ['o-1'] } }]);
    });

    it("n'en lance pas vers un dépôt étranger sans slot libre : elle en tiendrait un", () => {
      expect(tour('BEL')).toEqual([]);
    });

    it('lit un pays inconnu comme un slot pris', () => {
      expect(
        turn(
          viewOf({
            troops: [lorry(inBuilding('hq-1'), loaded)],
            outposts: [outpost(10)],
            slots: full,
          }),
        ),
      ).toEqual([]);
    });
  });

  it('ne bouge pas un camion en tournée', () => {
    const touring = troop('c1', inBuilding('hq-1'), 'landTransport', { tour: {} as never });
    expect(turn(viewOf({ troops: [touring], outposts: [outpost(10)] }))).toEqual([]);
  });
});
