import { describe, expect, it, vi } from 'vitest';
import { decideTurn, type BotWorld } from './bot';
import { noGeography } from './bot-geography.fixture';
import { BUILDINGS, RESOURCES, type BuildingKey } from './ids';
import type { BuildSpec, PlayerView } from './player-view';

// Un espacement de 800 km : aucun gisement du pays n'est inventé, deux voisins le sont assez.
vi.mock('./economy', async (original) => ({
  ...(await original<typeof import('./economy')>()),
  BUILDING_SPACING_KM: 800,
}));

const world: BotWorld = {
  carriesBuilding: () => true,
  regionAt: () => ({ id: 'FRA-1', country: 'FRA' }),
  ...noGeography,
};

const catalog = Object.fromEntries(
  BUILDINGS.map((key) => [key, { cost: { steel: 20 }, minutes: 30, lockedBy: null }]),
) as Record<BuildingKey, BuildSpec>;

describe('le socle du bot', () => {
  it("ne pose pas deux gisements à moins de l'espacement dans le même passage", () => {
    const view = {
      loadedAt: 0,
      arcs: [],
      camps: [],
      strategicPoints: [],
      buildCatalog: catalog,
      surveyedInstallations: [],
      me: {
        nation: 'france',
        capitalPoint: [2.35, 48.85],
        hqLevel: 1,
        foundation: [
          { key: 'mine', deposit: 'iron' },
          { key: 'farm', deposit: 'food' },
        ],
        buildings: [],
        outposts: [],
        troops: [],
        slots: { total: 2, used: 0 },
        construction: null,
        constructionQueue: [],
        regions: [],
        research: { researched: [], running: null, queue: [] },
        resources: Object.fromEntries(
          RESOURCES.map((key) => [key, { stock: 0, ratePerHour: 0, cap: 0 }]),
        ),
      },
    } as unknown as PlayerView;
    const workshop = { troopsInService: 0, troopsQueued: 0, facilities: [], roster: [], grid: [] };
    expect(decideTurn({ view, workshop, world, now: 0 })).toHaveLength(1);
  });
});
