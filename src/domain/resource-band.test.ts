import { describe, expect, it } from 'vitest';
import { BAND_GROUPS, marksOf, queueHeadOf, sourceOf } from './resource-band';
import { STORED_BY } from './economy';
import { BUILDINGS, RESOURCES, type BuildingKey, type ResourceKey } from './ids';
import type { BuildSpec, ChainView, PlayerView, Resource } from './player-view';

const NOW = 1_700_000_000_000;

const CATALOG = Object.fromEntries(
  BUILDINGS.map((key) => [key, { cost: { alloy: 20 }, minutes: 30, unlockedAtHqLevel: 1 }]),
) as Record<BuildingKey, BuildSpec>;

const reserve = (over: Partial<Resource> = {}): Resource => ({
  stock: 50,
  ratePerHour: 0,
  cap: 400,
  ...over,
});

const board = (over: {
  resources?: Partial<Record<ResourceKey, Partial<Resource>>>;
  chains?: ReadonlyArray<Partial<ChainView>>;
  construction?: PlayerView['me']['construction'];
  queue?: PlayerView['me']['constructionQueue'];
  buildings?: PlayerView['me']['buildings'];
  catalog?: Record<BuildingKey, BuildSpec>;
}): PlayerView =>
  ({
    loadedAt: NOW,
    me: {
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, reserve(over.resources?.[key])]),
      ) as Record<ResourceKey, Resource>,
      chains: (over.chains ?? []) as ReadonlyArray<ChainView>,
      construction: over.construction ?? null,
      constructionQueue: over.queue ?? [],
      buildings: over.buildings ?? [],
    },
    buildCatalog: over.catalog ?? CATALOG,
  }) as unknown as PlayerView;

type Queued = PlayerView['me']['constructionQueue'][number];

const queued = (key: BuildingKey, regionId = 'r1'): Queued => ({
  id: `q-${regionId}`,
  name: key,
  key,
  regionId,
  regionName: regionId,
  level: 1,
});

describe('the two marks of the band', () => {
  it('marks full at the ceiling and never one unit under it', () => {
    const under = marksOf(board({ resources: { alloy: { stock: 399, cap: 400 } } }), NOW);
    expect(under.alloy).toBeNull();

    const at = marksOf(board({ resources: { alloy: { stock: 400, cap: 400 } } }), NOW);
    expect(at.alloy?.kind).toBe('full');

    const over = marksOf(board({ resources: { alloy: { stock: 900, cap: 400 } } }), NOW);
    expect(over.alloy?.kind).toBe('full');
  });

  /** A ceiling of nothing is a season without a store served yet, not a saturated reserve. */
  it('says nothing of a reserve whose ceiling is zero', () => {
    expect(marksOf(board({ resources: { alloy: { stock: 0, cap: 0 } } }), NOW).alloy).toBeNull();
  });

  it('is never short with nothing in the queue', () => {
    const marks = marksOf(board({ resources: { alloy: { stock: 0 } } }), NOW);
    for (const resource of RESOURCES) expect(marks[resource]).toBeNull();
  });

  it('is short only against the head of the queue', () => {
    const view = board({
      resources: { alloy: { stock: 5 }, coal: { stock: 5 } },
      queue: [queued('port'), queued('foundry', 'r2')],
      catalog: {
        ...CATALOG,
        port: { cost: { alloy: 65 }, minutes: 65, unlockedAtHqLevel: 1 },
        foundry: { cost: { coal: 30 }, minutes: 50, unlockedAtHqLevel: 1 },
      },
    });
    const marks = marksOf(view, NOW);
    expect(marks.alloy?.kind).toBe('short');
    // The foundry is behind the head: its coal has not been reached, so it marks nothing.
    expect(marks.coal).toBeNull();
  });

  /** A raise is billed at the standing building's own next level, never the catalogue's first. */
  it('bills a raise at the standing building’s next level', () => {
    const view = board({
      resources: { alloy: { stock: 40 } },
      queue: [queued('foundry', 'r1')],
      buildings: [
        {
          id: 'b1',
          key: 'foundry',
          name: 'fonderie',
          regionId: 'r1',
          level: 1,
          nextLevelCost: { alloy: 90 },
          nextLevelMinutes: 60,
          cappedByHq: false,
        },
      ],
    });
    expect(queueHeadOf(view)?.cost).toEqual({ alloy: 90 });
    expect(marksOf(view, NOW).alloy?.kind).toBe('short');
  });

  /** Les deux tournures, mot pour mot : le pavé est lu, jamais deviné. */
  it('names the producer and the store it has outgrown, and the bill it cannot pay', () => {
    const full = marksOf(
      board({ resources: { alloy: { stock: 400, cap: 400, ratePerHour: 12 } } }),
      NOW,
    );
    expect(full.alloy?.diagnosis).toBe(
      'la fonderie tourne pour rien — 12 / h perdus, agrandir l’entrepôt',
    );

    const short = marksOf(
      board({
        resources: { oil: { stock: 5 } },
        queue: [queued('port')],
        catalog: { ...CATALOG, port: { cost: { oil: 20 }, minutes: 65, unlockedAtHqLevel: 1 } },
      }),
      NOW,
    );
    expect(short.oil?.diagnosis).toBe('il manque 15 de pétrole pour le port en file');
  });

  /** Losing production every hour outranks a bill that is merely waiting. */
  it('lets full win over short on the same reserve', () => {
    const view = board({
      resources: { alloy: { stock: 400, cap: 400, ratePerHour: 12 } },
      queue: [queued('port')],
      catalog: { ...CATALOG, port: { cost: { alloy: 900 }, minutes: 65, unlockedAtHqLevel: 1 } },
    });
    expect(marksOf(view, NOW).alloy?.kind).toBe('full');
  });
});

describe('the source of a resource', () => {
  const chain = (over: Partial<ChainView>): ChainView =>
    ({ by: 'foundry', output: 'alloy', level: 1, perHour: 12, ...over }) as ChainView;

  it('names the chain that makes it, with its level', () => {
    const view = board({ chains: [chain({ level: 2 })] });
    expect(sourceOf(view, 'alloy')).toEqual({ by: 'foundry', level: 2 });
  });

  it('gives no source to a resource nothing transforms', () => {
    expect(sourceOf(board({ chains: [chain({})] }), 'ore')).toBeNull();
  });
});

describe('the band’s order', () => {
  it('follows the two stores, warehouse then depot', () => {
    expect(BAND_GROUPS).toEqual([STORED_BY.warehouse, STORED_BY.depot]);
    expect(BAND_GROUPS.flat().slice().sort()).toEqual([...RESOURCES].sort());
  });
});
