import { describe, expect, it } from 'vitest';
import { CHAINS } from '../../convex/constants';
import type { BuildingKey, ResourceKey } from '@/domain/ids';
import type { ChainView } from '@/domain/player-view';
import { isStarved, resourceStrip } from './resource-strip';

/** The chains as the view serves them: `CHAINS` in its own order, plus a settled state. */
const served = (
  state: ChainView['state'] = 'running',
  missing: ResourceKey | null = null,
): ReadonlyArray<ChainView> =>
  Object.entries(CHAINS).map(([by, chain]) => ({
    by: by as BuildingKey,
    output: chain.output,
    inputs: chain.inputs.map(([resource, quantity]) => ({ resource, quantity })),
    perHour: 4,
    nominalPerHour: 4,
    level: 1,
    state,
    missing,
    commanded: false,
    order: null,
    maxOrder: 0,
  }));

const printed = (chains: ReadonlyArray<ChainView>) =>
  resourceStrip(chains).map((run) => run.map((rank) => rank.resources.join('·')).join(' → '));

describe('the banner reading order', () => {
  it('links the chains that feed one another and closes with what feeds nothing', () => {
    expect(printed(served())).toEqual([
      'ore·coal → alloy → ammunition',
      'textile → bandages',
      'food·oil',
    ]);
  });

  it('places every resource exactly once', () => {
    const flat = resourceStrip(served()).flatMap((run) => run.flatMap((rank) => rank.resources));
    expect(flat).toHaveLength(new Set(flat).size);
    expect(new Set(flat).size).toBe(8);
  });

  /** The order is derived, so a chain nobody has heard of has to place itself. */
  it('extends a run when a fourth chain consumes an existing output', () => {
    const extra: ChainView = {
      by: 'barracks',
      output: 'oil',
      inputs: [{ resource: 'ammunition', quantity: 1 }],
      perHour: 1,
      nominalPerHour: 1,
      level: 1,
      state: 'running',
      missing: null,
      commanded: false,
      order: null,
      maxOrder: 0,
    };
    expect(printed([...served(), extra])).toEqual([
      'ore·coal → alloy → ammunition → oil',
      'textile → bandages',
      'food',
    ]);
  });

  it('flags the run that carries a starved link, and only that one', () => {
    const chains = served().map((chain) =>
      chain.by === 'foundry' ? { ...chain, state: 'starved' as const, missing: 'ore' as const } : chain,
    );
    expect(resourceStrip(chains).map(isStarved)).toEqual([true, false, false]);
  });
});
