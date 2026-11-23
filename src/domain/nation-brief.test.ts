import { describe, expect, it } from 'vitest';
import { briefOf } from './nation-brief';
import { FIRST_SEVEN } from './strategic-points';

describe('briefOf, the neighbours and near points of a nation', () => {
  const brief = (nation: Parameters<typeof briefOf>[0]) => briefOf(nation, FIRST_SEVEN);

  it('has no neighbour at all for an isolated nation', () => {
    expect(brief('usa')).toEqual({ neighbors: [], nearPoints: ['halifax'] });
  });

  it('keeps the one neighbour in reach, and a near point apart from it', () => {
    // Hong Kong (2 879 km) is a point, not a neighbour: only a capital is a neighbour.
    expect(brief('japan')).toEqual({ neighbors: ['china'], nearPoints: ['hongKong'] });
  });

  it('lists at most the three nearest neighbours, nearest first', () => {
    expect(brief('france').neighbors).toEqual(['uk', 'germany', 'italy']);
    expect(brief('ussr').neighbors).toEqual(['germany', 'italy', 'france']);
  });

  it('lists at most the two nearest points, nearest first', () => {
    expect(brief('france').nearPoints).toEqual(['lisbon', 'tangier']);
    expect(brief('uk').nearPoints).toEqual(['lisbon', 'tangier']);
    expect(brief('ussr').nearPoints).toEqual(['narvik', 'istanbul']);
  });

  it('serves no near point when none of the drawn is within reach', () => {
    expect(briefOf('usa', ['rangoon', 'narvik']).nearPoints).toEqual([]);
  });

  it('reads only the points drawn', () => {
    expect(briefOf('france', ['baku']).nearPoints).toEqual([]);
  });
});
