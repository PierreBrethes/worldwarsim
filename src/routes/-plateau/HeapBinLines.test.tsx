import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { HeapBinLines, HeapBoardNotes } from './HeapBinLines';

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

describe('HeapBinLines', () => {
  it('reads what waits at the foot, the full heaps and what comes back', () => {
    const out = renderToStaticMarkup(<HeapBinLines view={view} resource="coal" now={NOW} />);
    expect(out).toContain('au pied 288');
    expect(out).toContain('⚑ 1 plein');
    expect(out).toContain('▲ 120 · étape ');
  });

  it('says « tas » on a phone, and nothing of a resource no site yields', () => {
    expect(
      renderToStaticMarkup(<HeapBinLines view={view} resource="coal" now={NOW} short />),
    ).toContain('tas 288');
    expect(renderToStaticMarkup(<HeapBinLines view={view} resource="oil" now={NOW} />)).toBe('');
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
