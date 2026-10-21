import { describe, expect, it } from 'vitest';
import { buildingsOfMaquette } from './board-markers';

const mine = (id: string, point: [number, number]) => ({ id, key: 'mine' as const, point });

describe('buildingsOfMaquette', () => {
  it('names the building a maquette stands for, by its point: a tile lets go on what is drawn (#205)', () => {
    const north = mine('b1', [3.1, 50.4]);
    const east = mine('b2', [6.2, 49.1]);
    expect(buildingsOfMaquette([north, east], 'building-mine@6.2,49.1')).toEqual([east]);
  });

  it('names nothing off every piece, or on a piece that is not one of my buildings', () => {
    const north = mine('b1', [3.1, 50.4]);
    expect(buildingsOfMaquette([north], null)).toEqual([]);
    expect(buildingsOfMaquette([north], 'stack-FRA-5333')).toEqual([]);
  });
});
