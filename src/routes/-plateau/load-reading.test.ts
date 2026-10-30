import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { sourceStockOf } from './load-reading';

describe('the stock a source holds', () => {
  it('is nothing for a depot that has left the view, not the national stock', () => {
    const view = {
      loadedAt: 0,
      me: { outposts: [], resources: { coal: { stock: 400, rate: 0 } } },
    } as unknown as PlayerView;
    expect(sourceStockOf(view, { outpostId: 'gone' }, 'coal', 0)).toBe(0);
  });
});
