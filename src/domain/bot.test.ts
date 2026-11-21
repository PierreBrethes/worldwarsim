import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOT_ARMY_TARGET,
  decideTurn,
  worldFrom,
  type BotContext,
  type BotWorld,
  type BotWorkshop,
} from './bot';
import { BUILDINGS, RESOURCES, type BuildingKey } from './ids';
import { ADM0_BY_NATION } from './nations';
import type { BuildSpec, PlayerView } from './player-view';
import { DEPOSIT_POINTS } from './world';

const CAPITAL = [2.35, 48.85] as const;
const SPARE = [4.05, 46.2] as const;
const NOW = 1_000_000;

const world: BotWorld = {
  carriesBuilding: () => true,
  regionAt: (point) => ({
    id: point === CAPITAL ? 'capital' : point === SPARE ? 'spare' : `R@${point.join(',')}`,
    country: ADM0_BY_NATION.france,
  }),
};

const catalog = Object.fromEntries(
  BUILDINGS.map((key) => [key, { cost: { steel: 20 }, minutes: 30, lockedBy: null }]),
) as Record<BuildingKey, BuildSpec>;

const viewOf = (me: Record<string, unknown> = {}): PlayerView =>
  ({
    loadedAt: NOW,
    buildCatalog: catalog,
    surveyedInstallations: [],
    me: {
      nation: 'france',
      capitalPoint: CAPITAL,
      hqLevel: 0,
      foundation: [],
      buildings: [],
      outposts: [],
      construction: null,
      constructionQueue: [],
      regions: [
        { id: 'row-capital', point: CAPITAL, site: null },
        { id: 'row-spare', point: SPARE, site: null },
      ],
      research: { researched: [], running: null, queue: [] },
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 1000, ratePerHour: 0, cap: 1000 }]),
      ),
      ...me,
    },
  }) as unknown as PlayerView;

const workshopOf = (over: Partial<BotWorkshop> = {}): BotWorkshop => ({
  troopsInService: 0,
  troopsQueued: 0,
  facilities: [],
  roster: [],
  grid: [
    { role: 'infantry', unit: { costs: { steel: 5 } } },
    { role: 'landTransport', unit: { costs: { steel: 8 } } },
  ],
  ...over,
});

const turn = (view: PlayerView, workshop = workshopOf()) =>
  decideTurn({ view, workshop, world, now: NOW } satisfies BotContext);

const hqStanding = { id: 'hq-1', key: 'hq', point: CAPITAL, level: 1 };

describe('le bot facile, son ouverture', () => {
  it('pose le QG en tête, sur la capitale, quand il manque', () => {
    expect(turn(viewOf({ foundation: [{ key: 'hq', deposit: null }] }))).toEqual([
      {
        fn: 'constructions.start',
        args: { building: 'hq', regionId: 'capital', point: { lon: 2.35, lat: 48.85 } },
      },
    ]);
  });

  it('pose un extracteur du socle sur son gisement une fois le QG debout', () => {
    const home = ADM0_BY_NATION.france;
    const iron = DEPOSIT_POINTS.find((d) => d.country === home && d.deposit === 'iron')!;
    const orders = turn(
      viewOf({
        hqLevel: 1,
        buildings: [hqStanding],
        foundation: [{ key: 'mine', deposit: 'iron' }],
      }),
    );
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      fn: 'constructions.start',
      args: { building: 'mine', regionId: iron.regionId },
    });
  });

  it('bâtit une caserne quand le socle est soldé et la matière là', () => {
    const orders = turn(
      viewOf({
        hqLevel: 1,
        buildings: [hqStanding],
        regions: [{ id: 'row-spare', point: SPARE, site: { id: null } }],
      }),
    );
    expect(orders).toEqual([
      {
        fn: 'constructions.start',
        args: { building: 'barracks', regionId: 'spare', point: { lon: 4.05, lat: 46.2 } },
      },
    ]);
  });

  it('saute un point que le refus du domaine écarte (trop près du QG)', () => {
    const [order] = turn(
      viewOf({
        hqLevel: 1,
        buildings: [hqStanding],
        regions: [
          { id: 'row-capital', point: CAPITAL, site: { id: null } },
          { id: 'row-spare', point: SPARE, site: { id: null } },
        ],
      }),
    );
    expect(order).toMatchObject({ args: { regionId: 'spare' } });
  });

  it('ne bâtit pas de caserne sans la matière, ni quand une est déjà là', () => {
    const regions = [{ id: 'row-spare', point: SPARE, site: { id: null } }];
    const poor = Object.fromEntries(
      RESOURCES.map((key) => [key, { stock: 0, ratePerHour: 0, cap: 1000 }]),
    );
    expect(turn(viewOf({ hqLevel: 1, buildings: [hqStanding], regions, resources: poor }))).toEqual(
      [],
    );
    const barracks = { id: 'b-1', key: 'barracks', point: SPARE, level: 1 };
    expect(turn(viewOf({ hqLevel: 1, buildings: [hqStanding, barracks], regions }))).toEqual([]);
  });

  it("recrute une infanterie d'abord, puis un camion quand il n'y en a aucun", () => {
    const view = viewOf({ hqLevel: 1, buildings: [hqStanding] });
    const barracks = { id: 'b-1', key: 'barracks' as const, queue: [] };
    expect(turn(view, workshopOf({ facilities: [barracks] }))).toEqual([
      { fn: 'troops.recruit', args: { buildingId: 'b-1', role: 'infantry', tier: 1 } },
    ]);
    expect(turn(view, workshopOf({ facilities: [barracks], troopsInService: 1 }))).toEqual([
      { fn: 'troops.recruit', args: { buildingId: 'b-1', role: 'landTransport', tier: 1 } },
    ]);
  });

  it('cesse de recruter à la cible, ou sans les stocks', () => {
    const view = viewOf({ hqLevel: 1, buildings: [hqStanding] });
    const barracks = { id: 'b-1', key: 'barracks' as const, queue: [] };
    expect(
      turn(view, workshopOf({ facilities: [barracks], troopsInService: BOT_ARMY_TARGET })),
    ).toEqual([]);
    const poor = Object.fromEntries(
      RESOURCES.map((key) => [key, { stock: 0, ratePerHour: 0, cap: 1000 }]),
    );
    expect(
      turn(
        viewOf({ hqLevel: 1, buildings: [hqStanding], resources: poor }),
        workshopOf({ facilities: [barracks] }),
      ),
    ).toEqual([]);
  });

  it("ne rend rien quand il n'y a rien à faire", () => {
    expect(
      turn(viewOf({ hqLevel: 1, buildings: [hqStanding], construction: { key: 'x' } })),
    ).toEqual([]);
  });

  it('garde les deux envies les plus fortes sur trois', () => {
    const home = ADM0_BY_NATION.france;
    const iron = DEPOSIT_POINTS.find((d) => d.country === home && d.deposit === 'iron')!;
    const food = DEPOSIT_POINTS.find((d) => d.country === home && d.deposit === 'food')!;
    const orders = turn(
      viewOf({
        hqLevel: 1,
        buildings: [hqStanding],
        foundation: [
          { key: 'mine', deposit: 'iron' },
          { key: 'farm', deposit: 'food' },
        ],
      }),
      workshopOf({ facilities: [{ id: 'b-1', key: 'barracks', queue: [] }] }),
    );
    // Trois envies (deux poses du socle, un recrutement) ; seules les deux poses, plus fortes, sortent.
    expect(orders).toHaveLength(2);
    expect(orders.map((order) => order.fn)).toEqual(['constructions.start', 'constructions.start']);
    expect(
      orders.map((order) => (order as { args: { regionId: string } }).args.regionId).sort(),
    ).toEqual([iron.regionId, food.regionId].sort());
  });

  it('envoie la région de la visée, pas celle de la ligne de la vue', () => {
    const [order] = turn(viewOf());
    expect(order).toMatchObject({ args: { regionId: 'capital' } });
  });

  it('ne forme pas de camion de plus quand un attend en file', () => {
    const view = viewOf({ hqLevel: 1, buildings: [hqStanding] });
    const barracks = {
      id: 'b-1',
      key: 'barracks' as const,
      queue: [{ role: 'landTransport' as const }],
    };
    expect(
      turn(view, workshopOf({ facilities: [barracks], troopsInService: 1, troopsQueued: 1 })),
    ).toEqual([{ fn: 'troops.recruit', args: { buildingId: 'b-1', role: 'infantry', tier: 1 } }]);
  });
});

describe('worldFrom', () => {
  const read = (name: string) =>
    JSON.parse(readFileSync(new URL(`../../public/${name}`, import.meta.url), 'utf8'));
  const geo = worldFrom({
    projection: read('projection.json'),
    grid: read('grid.json'),
    coast: read('coast.json'),
    regionGrid: read('region-grid.json'),
  });

  it('lit la terre et la région des fichiers cuits', () => {
    expect(geo.carriesBuilding([2.35, 48.85])).toBe(true);
    expect(geo.carriesBuilding([-30, 40])).toBe(false);
    expect(geo.regionAt([2.35, 48.85])?.country).toBe('FRA');
    expect(geo.regionAt([-30, 40])).toBeNull();
  });
});
