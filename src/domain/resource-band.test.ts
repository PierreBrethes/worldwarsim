import { describe, expect, it } from 'vitest';
import { DRY_SOON_HOURS, drynessOf, marksOf, sourceOf } from './resource-band';
import { RESOURCES, type ResourceKey } from './ids';
import type { ChainView, PlayerView, Resource } from './player-view';

const NOW = 1_700_000_000_000;

const reserve = (over: Partial<Resource> = {}): Resource => ({
  stock: 50,
  ratePerHour: 0,
  cap: 400,
  ...over,
});

const board = (over: {
  resources?: Partial<Record<ResourceKey, Partial<Resource>>>;
  chains?: ReadonlyArray<Partial<ChainView>>;
}): PlayerView =>
  ({
    loadedAt: NOW,
    me: {
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, reserve(over.resources?.[key])]),
      ) as Record<ResourceKey, Resource>,
      chains: (over.chains ?? []) as ReadonlyArray<ChainView>,
    },
  }) as unknown as PlayerView;

describe('the band’s one mark', () => {
  it('marks full at the ceiling and never one unit under it', () => {
    const under = marksOf(board({ resources: { steel: { stock: 399, cap: 400 } } }), NOW);
    expect(under.steel).toBeNull();

    const at = marksOf(board({ resources: { steel: { stock: 400, cap: 400 } } }), NOW);
    expect(at.steel?.kind).toBe('full');

    const over = marksOf(board({ resources: { steel: { stock: 900, cap: 400 } } }), NOW);
    expect(over.steel?.kind).toBe('full');
  });

  /** A ceiling of nothing is a season without a store served yet, not a saturated reserve. */
  it('says nothing of a reserve whose ceiling is zero', () => {
    expect(marksOf(board({ resources: { steel: { stock: 0, cap: 0 } } }), NOW).steel).toBeNull();
  });

  /** La tournure, mot pour mot : le pavé est lu, jamais deviné. */
  it('names the producer and the store it has outgrown', () => {
    const full = marksOf(
      board({ resources: { steel: { stock: 400, cap: 400, ratePerHour: 12 } } }),
      NOW,
    );
    expect(full.steel?.diagnosis).toBe(
      'la mine tourne pour rien — 12 / h perdus, agrandir l’entrepôt',
    );

    const oil = marksOf(
      board({ resources: { oil: { stock: 400, cap: 400, ratePerHour: 6 } } }),
      NOW,
    );
    expect(oil.oil?.diagnosis).toBe(
      'le puits de pétrole tourne pour rien — 6 / h perdus, agrandir l’entrepôt',
    );
  });
});

describe('the source of a resource', () => {
  const chain = (over: Partial<ChainView>): ChainView =>
    ({ by: 'arsenal', output: 'ammunition', level: 1, perHour: 12, ...over }) as ChainView;

  it('names the chain that makes it, with its level', () => {
    const view = board({ chains: [chain({ level: 2 })] });
    expect(sourceOf(view, 'ammunition')).toEqual({ by: 'arsenal', level: 2 });
  });

  it('gives no source to a resource nothing transforms', () => {
    expect(sourceOf(board({ chains: [chain({})] }), 'steel')).toBeNull();
  });
});

describe('drynessOf', () => {
  it('is dry at an empty stock, whatever comes in', () => {
    expect(drynessOf(0, 0)).toEqual({ hoursLeft: 0 });
    expect(drynessOf(0, 5)).toEqual({ hoursLeft: 0 });
  });

  it('warns when a draining stock runs out within the day', () => {
    expect(drynessOf(30, -2)).toEqual({ hoursLeft: 15 });
    expect(drynessOf(47, -2)).toEqual({ hoursLeft: 23.5 });
  });

  it('says nothing of a stock that lasts the day, fills, or holds', () => {
    expect(drynessOf(48, -2)).toBeNull();
    expect(drynessOf(400, 3)).toBeNull();
    expect(drynessOf(10, 0)).toBeNull();
  });

  it('reads the day as DRY_SOON_HOURS', () => {
    expect(drynessOf(DRY_SOON_HOURS - 1, -1)).not.toBeNull();
    expect(drynessOf(DRY_SOON_HOURS, -1)).toBeNull();
  });
});
