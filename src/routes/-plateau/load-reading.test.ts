import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { loadReadingOf, sourceStockOf } from './load-reading';

describe('the stock a source holds', () => {
  it('is nothing for a depot that has left the view, not the national stock', () => {
    const view = {
      loadedAt: 0,
      me: { outposts: [], resources: { coal: { stock: 400, rate: 0 } } },
    } as unknown as PlayerView;
    expect(sourceStockOf(view, { outpostId: 'gone' }, 'coal', 0)).toBe(0);
  });
});

describe('the reading above a transport on a tour', () => {
  it('refuses it before the drop, as the server does', () => {
    const view = {
      loadedAt: 0,
      arcs: [],
      me: {
        outposts: [],
        buildings: [{ id: 'hq1', key: 'hq' }],
        resources: { coal: { stock: 400, ratePerHour: 0 } },
        troops: [
          {
            id: 't1',
            role: 'landTransport',
            stationedAt: { kind: 'building', buildingId: 'hq1' },
            tour: { baseId: 'hq1', stops: [], waiting: null, recalled: false, skipped: [] },
          },
        ],
      },
    } as unknown as PlayerView;
    expect(loadReadingOf(view, 't1', 'board', 'coal', null, 0)).toMatchObject({
      refused: true,
      amount: 0,
    });
    const idle = {
      ...view,
      me: { ...view.me, troops: [{ ...view.me.troops[0]!, tour: undefined }] },
    };
    expect(
      loadReadingOf(idle as unknown as PlayerView, 't1', 'board', 'coal', null, 0),
    ).toMatchObject({
      refused: false,
      bound: 'room',
    });
  });
});
