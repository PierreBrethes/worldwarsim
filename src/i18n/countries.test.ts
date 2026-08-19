import { describe, expect, it } from 'vitest';
import { countryLabel, fr } from './fr';
import { ADM0_BY_NATION, NATIONS } from '@/domain/nations';
import regionIndex from '../../public/region-index.json';

describe('naming a country', () => {
  it('names the world in French, not in Natural Earth', () => {
    expect(countryLabel('SAU')).toBe('Arabie saoudite');
    expect(countryLabel('ROU')).toBe('Roumanie');
    expect(countryLabel('FRA')).toBe('France');
  });

  /**
   * The eight nations keep their hand-written labels and the baked table must not shadow them:
   * "États-Unis" on one screen and "États-Unis d'Amérique" on the next would read as two
   * different players.
   */
  it('gives the eight playable nations exactly what fr.nations gives', () => {
    for (const nation of NATIONS) {
      expect(countryLabel(ADM0_BY_NATION[nation])).toBe(fr.nations[nation]);
    }
  });

  /** The generation refuses a hole; this is the same promise, read from the other end. */
  it('leaves no country the server can host an outpost in without a name', () => {
    const unnamed = [...new Set(Object.values(regionIndex.country))].filter(
      (adm0) => countryLabel(adm0) === adm0,
    );
    expect(unnamed).toEqual([]);
  });
});
