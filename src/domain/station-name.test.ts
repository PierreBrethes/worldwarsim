import { describe, expect, it } from 'vitest';
import type { PlayerView, TroopStation } from './player-view';
import { pilePlace, placeLabel, stationNames } from './station-name';

const me = { buildings: [], regions: [], outposts: [] } as unknown as PlayerView['me'];
const names = stationNames({ me });

const point = (
  override: Partial<Extract<TroopStation, { kind: 'point' }>> = {},
): Extract<TroopStation, { kind: 'point' }> => ({
  kind: 'point',
  lonLat: [12.5, 41.9],
  country: 'ITA',
  afloat: false,
  ground: 'land',
  coastal: false,
  ...override,
});

const latium = () => ({ name: 'Lazio' });

describe('placeLabel', () => {
  /** Faute de région, le serveur rend le code du pays — un code, jamais une phrase (ADR 0016). */
  it('turns a country code the server fell back on into the country’s French name', () => {
    expect(placeLabel('FRA')).toBe('France');
  });

  it('keeps a region name as the proper noun it is', () => {
    expect(placeLabel('Nord')).toBe('Nord');
  });

  it('reads the empty name as the open sea', () => {
    expect(placeLabel('')).toBe('en mer');
  });
});

describe('pilePlace', () => {
  it('names the region a pile stands in', () => {
    expect(pilePlace(point(), names, latium)).toBe('Lazio');
  });

  /** Les 500 Ko de régions arrivent après le plateau : en attendant, le pays. */
  it('falls back on the country while the regions have not landed', () => {
    expect(pilePlace(point(), names, null)).toBe('Italie');
  });

  /** Le polygone d'une région côtière déborde sur l'eau : une coque au large n'y est pas. */
  it('keeps the country, or the sea, for a hull afloat', () => {
    expect(pilePlace(point({ afloat: true }), names, latium)).toBe('Italie');
    expect(pilePlace(point({ afloat: true, country: '' }), names, latium)).toBe('en mer');
  });

  it('falls back on the country where no region lies', () => {
    expect(pilePlace(point(), names, () => null)).toBe('Italie');
  });
});
