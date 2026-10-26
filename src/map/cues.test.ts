import { describe, expect, it } from 'vitest';
import type { PilePieces } from '@/domain/pile-pieces';
import { sortiesOf } from './cues';
import type { StandingPile } from './engine';

const pile = (id: string, at: StandingPile['at'], ...troopIds: string[]): StandingPile => ({
  id,
  at,
  pieces: { groups: [], troopIds, squad: false } satisfies PilePieces,
});
const barracks = { beside: 'building-barracks@2,48' };

describe('sortiesOf', () => {
  it('names the barracks a new troop stands at', () => {
    expect(sortiesOf(new Set(['t1']), [pile('p', barracks, 't1', 't2')])).toEqual([
      'building-barracks@2,48',
    ]);
  });

  it('names nothing for a known troop coming back from a march', () => {
    expect(sortiesOf(new Set(['t1']), [pile('p', barracks, 't1')])).toEqual([]);
  });

  it('names nothing for another building, or a pile on a point', () => {
    const fresh = new Set<string>();
    expect(sortiesOf(fresh, [pile('p', { beside: 'building-hq@2,48' }, 't1')])).toEqual([]);
    expect(sortiesOf(fresh, [pile('p', { lonLat: [2, 48] }, 't1')])).toEqual([]);
  });
});
