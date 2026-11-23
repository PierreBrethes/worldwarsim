import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decideTurn, worldFrom, type BotContext, type BotWorkshop } from './bot';
import { BUILDINGS, RESOURCES, type BuildingKey } from './ids';
import { CAPITAL_BY_NATION } from './nations';
import type { BuildSpec, PlayerView } from './player-view';

/**
 * **Pourquoi un bot reste immobile** (#625, piste a) : une nation insulaire n'a aucune région
 * étrangère qu'une route à pied atteigne. Le bot ne navigue pas : il recrute puis attend.
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

const viewOf = (nation: 'france' | 'uk') => {
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
    buildCatalog: catalog,
    surveyedInstallations: [],
    outpostFoundation: { cost: { steel: 10 }, minutes: 60 },
    me: {
      nation,
      capitalPoint: point,
      hqLevel: 1,
      foundation: [],
      buildings: [{ id: 'hq-1', key: 'hq', regionId: 'x', point, level: 1 }],
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

const turn = (nation: 'france' | 'uk') =>
  decideTurn({
    view: viewOf(nation),
    workshop: idle,
    world: geography,
    now: NOW,
  } satisfies BotContext);

describe("le bot d'une île", () => {
  it('ne marche nulle part : aucune région étrangère proche ne se joint à pied depuis Londres', () => {
    expect(turn('uk')).toEqual([]);
  }, 30_000);

  it('le même effectif, depuis Paris, avance', () => {
    expect(turn('france').map((order) => order.fn)).toEqual(['movements.marchTo']);
  }, 30_000);
});
