import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decideTurn, seaWaiting, worldFrom, type BotContext, type BotWorkshop } from './bot';
import { BUILDINGS, RESOURCES, type BuildingKey } from './ids';
import { CAPITAL_BY_NATION } from './nations';
import type { BuildSpec, PlayerView } from './player-view';

/**
 * **Pourquoi un bot reste à l'île** (#625, piste a) : une nation insulaire n'a aucune région
 * étrangère qu'une route à pied atteigne. Sans point neutre visible il recrute puis attend ; avec
 * un point neutre il prend la mer (#631) : port d'abord.
 */
const NOW = 1_000_000;
const read = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../public/${name}`, import.meta.url), 'utf8'));
const geography = worldFrom({
  projection: read('projection.json'),
  grid: read('grid.json'),
  coast: read('coast.json'),
  regionGrid: read('region-grid.json'),
  regionIndex: read('region-index.json'),
});

const catalog = Object.fromEntries(
  BUILDINGS.map((key) => [key, { cost: { steel: 20 }, minutes: 30, lockedBy: null }]),
) as Record<BuildingKey, BuildSpec>;
const idle: BotWorkshop = {
  troopsInService: 99,
  troopsQueued: 0,
  facilities: [],
  roster: [],
  grid: [],
};

const LISBON = [-9.14, 38.72] as const;

const viewOf = (
  nation: 'france' | 'uk',
  extra: Record<string, unknown> = {},
  built: Array<{ id: string; key: BuildingKey }> = [],
) => {
  const point = CAPITAL_BY_NATION[nation];
  const at = { kind: 'building' as const, buildingId: 'hq-1' };
  const troop = (id: string) => ({
    id,
    role: 'infantry',
    tier: 1,
    strength: 50,
    nominalStrength: 50,
    stationedAt: at,
    supplied: true,
    serving: false,
    besieged: false,
  });
  return {
    loadedAt: NOW,
    mode: 'mondiale',
    arcs: [],
    camps: [],
    strategicPoints: [],
    ...extra,
    buildCatalog: catalog,
    surveyedInstallations: [],
    outpostFoundation: { cost: { steel: 10 }, minutes: 60 },
    me: {
      nation,
      capitalPoint: point,
      hqLevel: 1,
      foundation: [],
      buildings: [
        { id: 'hq-1', key: 'hq', regionId: 'x', point, level: 1 },
        ...built.map((b) => ({
          ...b,
          regionId: 'y',
          point: [point[0] + 1, point[1] + 1],
          level: 1,
        })),
      ],
      outposts: [],
      troops: ['t1', 't2', 't3', 't4'].map(troop),
      stationedCargo: [],
      slots: { total: 2, used: 0 },
      construction: null,
      constructionQueue: [],
      regions: [],
      research: { researched: [], running: null, queue: [] },
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 1000, ratePerHour: 0, cap: 1000 }]),
      ),
    },
  } as unknown as PlayerView;
};

const context = (view: PlayerView): BotContext => ({
  view,
  workshop: idle,
  world: geography,
  now: NOW,
});
const turn = (nation: 'france' | 'uk') => decideTurn(context(viewOf(nation)));
const neutral = {
  strategicPoints: [
    { id: 'sp-lisbon', point: LISBON, holder: null, mine: false, contested: false },
  ],
};

describe("le bot d'une île", () => {
  it('ne marche nulle part : aucune région étrangère proche ne se joint à pied depuis Londres', () => {
    expect(turn('uk')).toEqual([]);
  }, 30_000);

  it('le même effectif, depuis Paris, avance', () => {
    expect(turn('france').map((order) => order.fn)).toEqual(['movements.marchTo']);
  }, 30_000);

  it('avec un point neutre à rejoindre, il pose un port une fois sa caserne debout', () => {
    const view = viewOf('uk', neutral, [{ id: 'b-1', key: 'barracks' }]);
    const orders = decideTurn(context(view));
    expect(
      orders.map((order) => [
        order.fn,
        'args' in order ? (order.args as { building?: string }).building : '',
      ]),
    ).toContainEqual(['constructions.start', 'port']);
  }, 60_000);

  it("dit ce qu'il attend : la caserne avant le port", () => {
    expect(seaWaiting(context(viewOf('uk', neutral)))).toBe('NO_BARRACKS');
  }, 60_000);

  it('un bot continental ne prend pas la mer : ni port, ni attente de mer', () => {
    const view = viewOf('france', neutral, [{ id: 'b-1', key: 'barracks' }]);
    expect(decideTurn(context(view)).some((order) => order.fn === 'constructions.start')).toBe(
      false,
    );
    expect(seaWaiting(context(view))).toBeNull();
  }, 60_000);
});
