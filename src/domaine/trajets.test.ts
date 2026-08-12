import { describe, expect, it } from 'vitest';
import type { Monde } from './monde';
import {
  COUT_PAR_MILIEU,
  COUT_TRANSFERT,
  calculerTrajet,
  construireGrille,
} from './trajets';

/**
 * Un monde jouet : sphère rectangulaire de 100×50 (projection identité en x, latitudes
 * linéaires en y), deux îles rectangulaires séparées par 10 unités de mer.
 */
function mondeJouet(): Monde {
  const contour: Array<readonly [number, number, number, number]> = [];
  for (let latitude = -90; latitude <= 90; latitude++) {
    contour.push([latitude, 0, 100, ((90 - latitude) / 180) * 50]);
  }
  const rectangle = (x1: number, y1: number, x2: number, y2: number) =>
    [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] as const;
  return {
    sphere: { minX: 0, maxX: 100, minY: 0, maxY: 50 },
    contour,
    pays: [
      { nom: 'Ouestland', pointRepresentatif: [20, 25], lonLat: [-108, 0], anneaux: [rectangle(10, 20, 30, 30)] },
      { nom: 'Estland', pointRepresentatif: [60, 25], lonLat: [36, 0], anneaux: [rectangle(40, 20, 80, 30)] },
    ],
  };
}

/** lon/lat qui projettent sur (x, y) dans le monde jouet : lon = (x/50 − 1)·180, y linéaire. */
const versLonLat = (x: number, y: number): [number, number] => [
  (x / 50 - 1) * 180,
  90 - (y / 50) * 180,
];

const grille = construireGrille(mondeJouet(), 1);

describe('construireGrille', () => {
  it('classe terre, mer et vide', () => {
    const cellule = (x: number, y: number) => grille.cellules[y * grille.largeur + x];
    expect(cellule(20, 25)).toBe(1);
    expect(cellule(35, 25)).toBe(2);
  });
});

describe('calculerTrajet terrestre', () => {
  it('reste sur la même île', () => {
    const trajet = calculerTrajet(grille, versLonLat(12, 25), versLonLat(28, 25), 'terrestre');
    expect(trajet).not.toBeNull();
    expect(trajet!.etapes.every((etape) => etape.milieu === 'terre')).toBe(true);
  });

  it('ne traverse jamais la mer', () => {
    expect(calculerTrajet(grille, versLonLat(20, 25), versLonLat(60, 25), 'terrestre')).toBeNull();
  });
});

describe('calculerTrajet combiné', () => {
  it('embarque, traverse, débarque — deux transferts au prix affiché', () => {
    const trajet = calculerTrajet(grille, versLonLat(20, 25), versLonLat(60, 25), 'combine');
    expect(trajet).not.toBeNull();
    const milieux = trajet!.etapes.map((etape) => etape.milieu);
    expect(milieux).toEqual(['terre', 'mer', 'terre']);
    const attendu =
      trajet!.etapes[0]!.distanceUnites * COUT_PAR_MILIEU.terre +
      trajet!.etapes[1]!.distanceUnites * COUT_PAR_MILIEU.mer +
      trajet!.etapes[2]!.distanceUnites * COUT_PAR_MILIEU.terre +
      2 * COUT_TRANSFERT;
    expect(trajet!.coutUnites).toBeCloseTo(attendu, 6);
  });
});

describe('calculerTrajet naval', () => {
  it('part de la côte la plus proche et ne touche jamais la terre', () => {
    const trajet = calculerTrajet(grille, versLonLat(31, 25), versLonLat(39, 25), 'naval');
    expect(trajet).not.toBeNull();
    expect(trajet!.etapes.every((etape) => etape.milieu === 'mer')).toBe(true);
  });
});

describe('enroulement est-ouest', () => {
  it('la mer contourne par le bord du monde quand c’est plus court', () => {
    const trajet = calculerTrajet(grille, versLonLat(5, 25), versLonLat(95, 25), 'naval');
    expect(trajet).not.toBeNull();
    // 10 unités par l'antiméridien contre ~80 par le centre (les îles barrent la route directe).
    expect(trajet!.distanceUnites).toBeLessThan(30);
  });

  it('l’aérien s’enroule aussi', () => {
    const direct = calculerTrajet(grille, versLonLat(5, 25), versLonLat(95, 25), 'aerien');
    expect(direct).not.toBeNull();
    expect(direct!.distanceUnites).toBeCloseTo(10, 1);
  });
});

describe('sur le vrai monde', () => {
  it('grave les portes maritimes : Gibraltar reste ouvert', async () => {
    const { readFileSync } = await import('node:fs');
    const brut = JSON.parse(readFileSync('public/monde.json', 'utf8')) as {
      meta: { sphere: Monde['sphere']; outline: Monde['contour'] };
      countries: Array<{ n: string; c: [number, number]; ll: [number, number]; p: [number, number][][] }>;
    };
    const monde: Monde = {
      sphere: brut.meta.sphere,
      contour: brut.meta.outline,
      pays: brut.countries.map((c) => ({ nom: c.n, pointRepresentatif: c.c, lonLat: c.ll, anneaux: c.p })),
    };
    const grilleMonde = construireGrille(monde);

    // Marseille → Casablanca par la mer : sans la porte de Gibraltar, aucun chemin n'existe.
    const trajet = calculerTrajet(grilleMonde, [5.4, 43.3], [-7.6, 33.6], 'naval');
    expect(trajet).not.toBeNull();
    expect(trajet!.etapes.every((etape) => etape.milieu === 'mer')).toBe(true);
    // ~17° de long. + côte atlantique : bien en dessous d'un tour d'Afrique (> 150 unités).
    expect(trajet!.distanceUnites).toBeLessThan(40);

    // Paris → Berlin à pied, sans embarquer.
    const terrestre = calculerTrajet(grilleMonde, [2.35, 48.85], [13.4, 52.5], 'terrestre');
    expect(terrestre).not.toBeNull();
    expect(terrestre!.etapes.every((etape) => etape.milieu === 'terre')).toBe(true);
  });
});
