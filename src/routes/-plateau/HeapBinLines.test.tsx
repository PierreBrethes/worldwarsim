import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { HeapBinBar, HeapBoardNotes } from './HeapBinLines';

const HOUR = 3_600_000;
const NOW = 100 * HOUR;
const none = { food: 0, steel: 0, coal: 0, oil: 0, ammunition: 0 };

const view = {
  loadedAt: NOW,
  mode: 'mondiale',
  arcs: [{ state: 'mine', id: 'a', troopIds: ['T'], schedule: { arrivesAt: NOW + HOUR } }],
  me: {
    regions: [{ id: 'r', name: 'Nord' }],
    troops: [{ id: 'T', role: 'landTransport', harvest: { ...none, coal: 120 } }],
    buildings: [
      {
        id: 'c1',
        key: 'mine',
        name: 'Mine',
        regionId: 'r',
        heap: { amount: 288, cap: 288, resource: 'coal', fullSince: NOW - 3 * HOUR },
      },
    ],
    extraction: [{ buildingId: 'c1', deposit: 'coal', nationalPerHour: 0, heapPerHour: 12 }],
  },
} as unknown as PlayerView;

describe('HeapBinBar', () => {
  const bar = (v: PlayerView, resource: 'coal' | 'oil' | 'ammunition') =>
    renderToStaticMarkup(<HeapBinBar view={v} resource={resource} now={NOW} />);

  it('writes « tas », the amount, the full count and a bare ▲ for what comes back, no countdown', () => {
    const out = bar(view, 'coal').replace(/<[^>]+>/g, '');
    expect(out).toBe('tas 288 ⚑1 ▲');
  });

  it('leaves out the flag and the arrow when nothing is full or on the road', () => {
    const calm = {
      ...view,
      arcs: [],
      me: {
        ...view.me,
        troops: [],
        buildings: [{ ...view.me.buildings[0], heap: { amount: 40, cap: 288, resource: 'coal' } }],
      },
    } as unknown as PlayerView;
    expect(bar(calm, 'coal').replace(/<[^>]+>/g, '')).toBe('tas 40');
  });

  it('writes nothing for no heap, the arsenal or a foundation alone', () => {
    expect(bar(view, 'oil')).toBe('');
    expect(bar(view, 'ammunition')).toBe('');
    const foundation = {
      ...view,
      me: { ...view.me, buildings: [] },
    } as unknown as PlayerView;
    expect(bar(foundation, 'coal')).toBe('');
  });
});

describe('HeapBoardNotes', () => {
  it('lists the full heaps with since when they stopped, and what is on the road', () => {
    const out = renderToStaticMarkup(<HeapBoardNotes view={view} now={NOW} />);
    expect(out).toContain('Mine');
    expect(out).toContain('arrêtée 3 h');
    expect(out).toContain('120 charbon · étape ');
  });

  it('says so when nothing is on the road or full', () => {
    const quiet = {
      ...view,
      arcs: [],
      me: { ...view.me, troops: [], buildings: [] },
    } as unknown as PlayerView;
    const out = renderToStaticMarkup(<HeapBoardNotes view={quiet} now={NOW} />);
    expect(out).toContain('aucune tournée');
    expect(out).toContain('aucun tas plein');
  });

  it('is not drawn in a Blitz, which has no heap', () => {
    const blitz = { ...view, mode: 'blitz' } as unknown as PlayerView;
    expect(renderToStaticMarkup(<HeapBoardNotes view={blitz} now={NOW} />)).toBe('');
  });
});
