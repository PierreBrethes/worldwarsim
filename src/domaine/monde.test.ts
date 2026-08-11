import { describe, expect, it } from 'vitest';
import { distanceKm, ecartLongitudeLePlusCourt, traverseAntimeridien } from './geo';

const PARIS = [2.29, 47.19] as const;
const TOKYO = [138.65, 36.12] as const;
const NOUVELLE_ZELANDE = [169.28, -45.13] as const;
const ETATS_UNIS = [-101.18, 39.05] as const;

describe('la longitude s’enroule', () => {
  it('prend toujours le sens le plus court', () => {
    expect(ecartLongitudeLePlusCourt(169.28, -101.18)).toBeCloseTo(89.54, 2);
    expect(ecartLongitudeLePlusCourt(-101.18, 169.28)).toBeCloseTo(-89.54, 2);
  });

  it('rend le Pacifique plus court que la route par l’Eurasie', () => {
    const parLePacifique = distanceKm(NOUVELLE_ZELANDE, ETATS_UNIS);
    const sansEnroulement = 111 * Math.abs(NOUVELLE_ZELANDE[0] - ETATS_UNIS[0]);
    expect(parLePacifique).toBeLessThan(sansEnroulement);
  });

  it('signale les trajets qui traversent l’antiméridien', () => {
    expect(traverseAntimeridien(NOUVELLE_ZELANDE, ETATS_UNIS)).toBe(true);
    expect(traverseAntimeridien(PARIS, TOKYO)).toBe(false);
  });
});

describe('distances', () => {
  it('reste dans l’ordre de grandeur attendu', () => {
    expect(distanceKm(PARIS, TOKYO)).toBeGreaterThan(9000);
    expect(distanceKm(PARIS, TOKYO)).toBeLessThan(11000);
  });
});
