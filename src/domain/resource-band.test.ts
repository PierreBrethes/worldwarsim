import { describe, expect, it } from 'vitest';
import { BAND_GROUPS, marksOf, sourceOf } from './resource-band';
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

  /** La tournure, mot pour mot : le pavé est lu, jamais deviné. */
  it('names the producer and the store it has outgrown', () => {
    const full = marksOf(
      board({ resources: { alloy: { stock: 400, cap: 400, ratePerHour: 12 } } }),
      NOW,
    );
    expect(full.alloy?.diagnosis).toBe(
      'la fonderie tourne pour rien — 12 / h perdus, agrandir l’entrepôt',
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
  it('reads the eight reserves as one warehouse group', () => {
    expect(BAND_GROUPS).toEqual([RESOURCES]);
  });
});
