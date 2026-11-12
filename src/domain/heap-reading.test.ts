import { describe, expect, it } from 'vitest';
import {
  heapMarkOf,
  heapReadingOf,
  heapsAtFoot,
  heapBinOf,
  inboundHarvests,
  overflowingHeaps,
  type HeapMark,
} from './heap-reading';
import type { PlayerView } from './player-view';

const HOUR = 3_600_000;
const NOW = 100 * HOUR;

const mark = (over: Partial<HeapMark> = {}): HeapMark => ({
  resource: 'coal',
  amount: 100,
  cap: 288,
  perHour: 12,
  asOf: NOW,
  fullSince: null,
  foundation: null,
  ...over,
});

describe('heapReadingOf', () => {
  it('grows at its served rate from the served instant, whole units only', () => {
    const reading = heapReadingOf(mark(), NOW + 2.5 * HOUR);
    expect(reading.amount).toBe(130);
    expect(reading.full).toBe(false);
    expect(reading.stoppedSince).toBeNull();
  });

  it('never passes its cap, and says since when it stopped', () => {
    const reading = heapReadingOf(mark({ amount: 280 }), NOW + 5 * HOUR);
    expect(reading.amount).toBe(288);
    expect(reading.full).toBe(true);
    expect(reading.stoppedSince).toBe(NOW + (8 / 12) * HOUR);
  });

  it('keeps the served instant a full heap has been full since, and does not grow', () => {
    const reading = heapReadingOf(mark({ amount: 288, fullSince: NOW - 3 * HOUR }), NOW + 5 * HOUR);
    expect(reading.amount).toBe(288);
    expect(reading.stoppedSince).toBe(NOW - 3 * HOUR);
  });

  it('stacks one token for any heap, up to four for a full one, none for an empty one', () => {
    expect(heapReadingOf(mark({ amount: 0 }), NOW).stack).toBe(0);
    expect(heapReadingOf(mark({ amount: 1 }), NOW).stack).toBe(1);
    expect(heapReadingOf(mark({ amount: 150 }), NOW).stack).toBe(3);
    expect(heapReadingOf(mark({ amount: 288 }), NOW).stack).toBe(4);
  });
});

describe('heapMarkOf', () => {
  const site = { buildingId: 'b', nationalPerHour: 12, heapPerHour: 12 };
  const building = (over: object = {}) => ({
    id: 'b',
    heap: { amount: 40, cap: 288, resource: 'coal' as const },
    ...over,
  });

  it('is nothing for a building without a heap (a barracks, any Blitz exploitation)', () => {
    expect(heapMarkOf({ id: 'b' }, [site], NOW)).toBeNull();
  });

  it('is nothing for a level 1 foundation but its own note: it reports alone, nothing piles up', () => {
    const level1 = heapMarkOf(
      building({ foundationMark: true, heap: { amount: 0, cap: 0, resource: 'coal' } }),
      [{ ...site, heapPerHour: 0 }],
      NOW,
    );
    expect(level1).toMatchObject({ cap: 0, foundation: { alonePerHour: 12 } });
  });

  it('carries the foundation seal and its national rate beside the heap of a raised one', () => {
    expect(heapMarkOf(building({ foundationMark: true }), [site], NOW)).toMatchObject({
      amount: 40,
      cap: 288,
      perHour: 12,
      foundation: { alonePerHour: 12 },
    });
  });

  it('keeps the served full-since', () => {
    const full = heapMarkOf(
      building({ heap: { amount: 288, cap: 288, resource: 'coal', fullSince: NOW - HOUR } }),
      [site],
      NOW,
    );
    expect(full?.fullSince).toBe(NOW - HOUR);
  });
});

describe('heapsAtFoot', () => {
  it('sums what waits at the foot per resource and counts the full ones', () => {
    const marks = [
      mark({ resource: 'food', amount: 576, cap: 576, fullSince: NOW - HOUR }),
      mark({ resource: 'food', amount: 100, cap: 288 }),
      mark({ resource: 'coal', amount: 0, cap: 0, foundation: { alonePerHour: 12 } }),
    ];
    const foot = heapsAtFoot(marks, NOW);
    expect(foot.food).toEqual({ amount: 676, sites: 2, full: 1 });
    expect(foot.coal).toEqual({ amount: 0, sites: 0, full: 0 });
  });
});

describe('overflowingHeaps', () => {
  const view = {
    loadedAt: NOW,
    me: {
      regions: [{ id: 'r1', name: 'Eure-et-Loir' }],
      buildings: [
        {
          id: 'full',
          key: 'farm',
          name: 'Ferme',
          regionId: 'r1',
          heap: { amount: 576, cap: 576, resource: 'food', fullSince: NOW - 3 * HOUR },
        },
        {
          id: 'half',
          key: 'mine',
          name: 'Mine',
          regionId: 'r1',
          heap: { amount: 10, cap: 288, resource: 'coal' },
        },
        { id: 'hq', key: 'hq', name: 'QG', regionId: 'r1' },
      ],
      extraction: [
        { buildingId: 'full', nationalPerHour: 0, heapPerHour: 24 },
        { buildingId: 'half', nationalPerHour: 0, heapPerHour: 12 },
      ],
    },
  } as unknown as PlayerView;

  it('lists the full heaps with their place and since when they stopped, longest first', () => {
    expect(overflowingHeaps(view, NOW)).toEqual([
      {
        buildingId: 'full',
        name: 'Ferme',
        region: 'Eure-et-Loir',
        resource: 'food',
        amount: 576,
        stoppedSince: NOW - 3 * HOUR,
      },
    ]);
  });

  it('lists nothing while no heap is full', () => {
    expect(
      overflowingHeaps(
        { ...view, me: { ...view.me, buildings: [view.me.buildings[1]!] } } as PlayerView,
        NOW,
      ),
    ).toEqual([]);
  });
});

describe('inboundHarvests', () => {
  const none = { food: 0, steel: 0, coal: 0, oil: 0, ammunition: 0 };
  const view = {
    me: {
      troops: [
        {
          id: 'T1',
          role: 'landTransport',
          harvest: { ...none, coal: 120, steel: 40 },
          tour: { stops: [] },
        },
        { id: 'T2', role: 'cargo', harvest: none, tour: { stops: [] } },
        { id: 'T3', role: 'landTransport' },
      ],
    },
    arcs: [
      { state: 'mine', id: 'a1', troopIds: ['T1'], schedule: { arrivesAt: NOW + 2 * HOUR } },
      { state: 'enemyDetected', id: 'a2' },
    ],
  } as unknown as PlayerView;

  it('lists a transport with a harvest aboard, and when its leg ends', () => {
    expect(inboundHarvests(view)).toEqual([
      {
        troopId: 'T1',
        role: 'landTransport',
        harvest: { ...none, coal: 120, steel: 40 },
        arrivesAt: NOW + 2 * HOUR,
      },
    ]);
  });

  it('gives no date to a harvest aboard a transport that stands', () => {
    const standing = { ...view, arcs: [] } as unknown as PlayerView;
    expect(inboundHarvests(standing)[0]?.arrivesAt).toBeNull();
  });
});

describe('heapBinOf', () => {
  const none = { food: 0, steel: 0, coal: 0, oil: 0, ammunition: 0 };
  const view = {
    loadedAt: NOW,
    arcs: [{ state: 'mine', id: 'a1', troopIds: ['T1'], schedule: { arrivesAt: NOW + 2 * HOUR } }],
    me: {
      regions: [],
      troops: [{ id: 'T1', role: 'landTransport', harvest: { ...none, coal: 120 } }],
      buildings: [
        {
          id: 'c1',
          key: 'mine',
          name: 'Mine',
          regionId: 'r',
          heap: { amount: 288, cap: 288, resource: 'coal', fullSince: NOW - HOUR },
        },
        {
          id: 'c2',
          key: 'mine',
          name: 'Mine',
          regionId: 'r',
          heap: { amount: 100, cap: 288, resource: 'coal' },
        },
        {
          id: 'f1',
          key: 'farm',
          name: 'Ferme',
          regionId: 'r',
          foundationMark: true,
          heap: { amount: 0, cap: 0, resource: 'food' },
        },
      ],
      extraction: [
        { buildingId: 'c1', deposit: 'coal', nationalPerHour: 0, heapPerHour: 12 },
        { buildingId: 'c2', deposit: 'coal', nationalPerHour: 0, heapPerHour: 12 },
        { buildingId: 'f1', deposit: 'food', nationalPerHour: 12, heapPerHour: 0 },
      ],
    },
  } as unknown as PlayerView;

  it('reads what waits at the foot, the full heaps, and what comes back for a resource', () => {
    expect(heapBinOf(view, 'coal', NOW)).toEqual({
      kind: 'foot',
      amount: 388,
      full: 1,
      come: { amount: 120, arrivesAt: NOW + 2 * HOUR },
    });
  });

  it('says a resource only a level 1 foundation yields reports alone', () => {
    expect(heapBinOf(view, 'food', NOW)).toEqual({ kind: 'foundationOnly' });
  });

  it('says munitions come out of the arsenal, and nothing of a resource no site yields', () => {
    expect(heapBinOf(view, 'ammunition', NOW)).toEqual({ kind: 'arsenal' });
    expect(heapBinOf(view, 'oil', NOW)).toBeNull();
  });
});
