import { describe, expect, it } from 'vitest';
import { coutDeroule, deroulerTrajet, positionTemporelle } from './deroule-trajet';
import { COUT_PAR_MILIEU, COUT_TRANSFERT, trajetDirect, type TrajetCalcule } from './trajets';

const combine = (terre1: number, mer: number, terre2: number): TrajetCalcule => ({
  mode: 'combine',
  points: [[0, 0], [1, 0], [2, 0], [3, 0]],
  distanceUnites: terre1 + mer + terre2,
  coutUnites:
    (terre1 + terre2) * COUT_PAR_MILIEU.terre + mer * COUT_PAR_MILIEU.mer + 2 * COUT_TRANSFERT,
  etapes: [
    { milieu: 'terre', distanceUnites: terre1 },
    { milieu: 'mer', distanceUnites: mer },
    { milieu: 'terre', distanceUnites: terre2 },
  ],
});

describe('deroulerTrajet', () => {
  it('intercale un quai entre deux étapes, jamais aux extrémités', () => {
    const troncons = deroulerTrajet(combine(10, 20, 5));
    expect(troncons.map((troncon) => troncon.genre)).toEqual([
      'etape', 'quai', 'etape', 'quai', 'etape',
    ]);
  });

  it('le quai qui précède la mer est un embarquement, celui qui la suit un débarquement', () => {
    const quais = deroulerTrajet(combine(10, 20, 5)).filter((troncon) => troncon.genre === 'quai');
    expect(quais.map((quai) => quai.embarquement)).toEqual([true, false]);
  });

  it('les parts somment à 1 et les quais y comptent', () => {
    const troncons = deroulerTrajet(combine(10, 20, 5));
    expect(troncons.reduce((somme, troncon) => somme + troncon.part, 0)).toBeCloseTo(1, 10);
    const partQuais = troncons
      .filter((troncon) => troncon.genre === 'quai')
      .reduce((somme, quai) => somme + quai.part, 0);
    expect(partQuais).toBeCloseTo((2 * COUT_TRANSFERT) / coutDeroule(combine(10, 20, 5)), 10);
  });

  it('le coût redéroulé est celui que le calcul de trajet a facturé', () => {
    const trajet = combine(10, 20, 5);
    expect(coutDeroule(trajet)).toBeCloseTo(trajet.coutUnites, 10);
  });

  it('un trajet sans coût ne déroule rien plutôt que de diviser par zéro', () => {
    expect(deroulerTrajet(trajetDirect([0, 0], [1, 1], 'mer', 0))).toEqual([]);
  });
});

describe('positionTemporelle', () => {
  const deroule = deroulerTrajet(combine(10, 20, 5));

  it('immobilise le jalon pendant toute la traversée du quai', () => {
    const partTerre = deroule[0]!.part;
    const partQuai = deroule[1]!.part;
    for (const part of [0.05, 0.5, 0.95]) {
      expect(positionTemporelle(deroule, partTerre + partQuai * part)).toEqual({
        genre: 'quai',
        indexEtape: 1,
      });
    }
  });

  it('rend la fraction locale de l’étape traversée', () => {
    const position = positionTemporelle(deroule, deroule[0]!.part / 2);
    expect(position).toEqual({ genre: 'etape', indexEtape: 0, local: 0.5 });
  });

  it('borne aux deux bouts : rien avant le départ, rien après l’arrivée', () => {
    expect(positionTemporelle(deroule, -1)).toEqual({ genre: 'etape', indexEtape: 0, local: 0 });
    expect(positionTemporelle(deroule, 2)).toEqual({ genre: 'etape', indexEtape: 2, local: 1 });
  });

  it('un trajet d’un seul milieu n’a ni quai ni saut', () => {
    const direct = deroulerTrajet(trajetDirect([0, 0], [10, 0], 'air', 40));
    expect(direct).toHaveLength(1);
    expect(positionTemporelle(direct, 0.25)).toEqual({
      genre: 'etape',
      indexEtape: 0,
      local: 0.25,
    });
  });
});
