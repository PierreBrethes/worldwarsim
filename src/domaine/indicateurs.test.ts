import { describe, expect, it } from 'vitest';
import { URGENCE_MS, type EtiquetteCarte } from './etiquettes';
import {
  BASCULES_DEFAUT,
  CATEGORIE_DE_TYPE,
  chantierOublie,
  clamperAuBord,
  MARGE_BORD,
  marqueDe,
  marqueLaPlusForte,
  regrouper,
  type IndicateurBrut,
} from './indicateurs';

const LARGEUR = 1000;
const HAUTEUR = 600;
const MAINTENANT = 1_700_000_000_000;

const brut = (surcharge: Partial<IndicateurBrut>): IndicateurBrut => ({
  id: 'i-1',
  categorie: 'avant-postes',
  priorite: 1,
  x: 0,
  y: 0,
  ...surcharge,
});

const etiquette = (surcharge: Partial<EtiquetteCarte>): EtiquetteCarte => ({
  id: 'e-1',
  type: 'mouvement-cap-sur-moi',
  priorite: 5,
  ancre: { genre: 'teteMouvement', arc: 'mv-1' },
  encre: null,
  picto: null,
  lignes: [],
  identifie: false,
  offensif: false,
  sansOrdre: false,
  paysHote: null,
  ...surcharge,
});

describe('bascules', () => {
  it('n’allume que le cap sur moi au premier chargement', () => {
    expect(Object.entries(BASCULES_DEFAUT).filter(([, allumee]) => allumee)).toEqual([
      ['cap-sur-moi', true],
    ]);
  });

  it('donne une catégorie à chacun des six types d’étiquette', () => {
    expect(new Set(Object.values(CATEGORIE_DE_TYPE)).size).toBe(6);
  });
});

describe('clamperAuBord', () => {
  it('range l’ancre dans le rectangle intérieur', () => {
    const bord = clamperAuBord(4000, -900, LARGEUR, HAUTEUR);
    expect(bord.x).toBeLessThanOrEqual(LARGEUR - MARGE_BORD);
    expect(bord.y).toBeGreaterThanOrEqual(MARGE_BORD);
  });

  it('garde le cap réel plutôt que celui du bord atteint', () => {
    // Plein est et très légèrement au nord : le bord touché est le droit, le cap reste ~0.
    const bord = clamperAuBord(9000, HAUTEUR / 2 - 10, LARGEUR, HAUTEUR);
    expect(Math.abs(bord.cap)).toBeLessThan(0.01);
    expect(bord.x).toBeCloseTo(LARGEUR - MARGE_BORD, 6);
  });

  it('sort une ancre pile au centre par le bas plutôt que de diviser par zéro', () => {
    const bord = clamperAuBord(LARGEUR / 2, HAUTEUR / 2, LARGEUR, HAUTEUR);
    expect(Number.isFinite(bord.x)).toBe(true);
    expect(bord.y).toBeCloseTo(HAUTEUR - MARGE_BORD, 6);
  });
});

describe('regrouper', () => {
  it('fusionne deux indicateurs proches de même catégorie', () => {
    const groupes = regrouper([brut({ id: 'a', x: 100, y: 100 }), brut({ id: 'b', x: 120, y: 110 })]);
    expect(groupes).toHaveLength(1);
    expect(groupes[0]?.membres).toEqual(['a', 'b']);
  });

  it('ne fusionne jamais deux catégories différentes', () => {
    const groupes = regrouper([
      brut({ id: 'a', x: 100, y: 100 }),
      brut({ id: 'b', categorie: 'forces', x: 101, y: 100 }),
    ]);
    expect(groupes).toHaveLength(2);
  });

  it('laisse séparés deux indicateurs au-delà du seuil', () => {
    const groupes = regrouper([brut({ id: 'a', x: 100, y: 100 }), brut({ id: 'b', x: 100, y: 200 })]);
    expect(groupes).toHaveLength(2);
  });

  it('ouvre le groupe par le plus prioritaire — le noyau porte la priorité', () => {
    const groupes = regrouper([
      brut({ id: 'a', priorite: 1, x: 100, y: 100 }),
      brut({ id: 'b', priorite: 4, x: 110, y: 100 }),
    ]);
    expect(groupes[0]?.membres).toEqual(['b', 'a']);
    expect(groupes[0]?.priorite).toBe(4);
  });

  it('rend le même découpage deux fois de suite — c’est ce qui autorise le calcul au repos', () => {
    const bruts = [
      brut({ id: 'a', x: 100, y: 100 }),
      brut({ id: 'b', x: 130, y: 100 }),
      brut({ id: 'c', x: 400, y: 100 }),
    ];
    expect(regrouper(bruts)).toEqual(regrouper(bruts));
  });
});

describe('marque d’alerte', () => {
  it('laisse le glyphe neutre tant que le mouvement n’est pas identifié', () => {
    expect(marqueDe(etiquette({}), MAINTENANT)).toBe('menace');
  });

  it('n’arme le triangle que sur un mouvement identifié et offensif', () => {
    const percee = etiquette({
      identifie: true,
      offensif: true,
      lignes: [{ role: 'compte', echeanceA: MAINTENANT + 60 * 60_000, prefixe: '~' }],
    });
    expect(marqueDe(percee, MAINTENANT)).toBe('offensive');
    expect(marqueDe(etiquette({ identifie: true, offensif: false }), MAINTENANT)).toBe('menace');
  });

  it('passe à l’imminence sous le seuil d’urgence', () => {
    const proche = etiquette({
      identifie: true,
      offensif: true,
      lignes: [{ role: 'compte', echeanceA: MAINTENANT + URGENCE_MS - 1, prefixe: '~' }],
    });
    expect(marqueDe(proche, MAINTENANT)).toBe('imminente');
  });

  it('ne marque rien hors du cap sur moi — l’accent critique n’est qu’à lui', () => {
    expect(marqueDe(etiquette({ type: 'renseignement' }), MAINTENANT)).toBe('aucune');
    expect(marqueDe(etiquette({ type: 'mouvement-mien' }), MAINTENANT)).toBe('aucune');
  });

  it('garde la plus forte marque d’un agrégat', () => {
    expect(marqueLaPlusForte(['menace', 'imminente', 'aucune'])).toBe('imminente');
    expect(marqueLaPlusForte([])).toBe('aucune');
  });
});

describe('chantierOublie', () => {
  const chantier = (acheveA: number, sansOrdre: boolean): EtiquetteCarte =>
    etiquette({
      type: 'chantier',
      sansOrdre,
      lignes: [{ role: 'compte', echeanceA: acheveA, prefixe: 'chantier ' }],
    });

  it('signale un chantier achevé que rien ne suit', () => {
    expect(chantierOublie(chantier(MAINTENANT - 1, true), MAINTENANT)).toBe(true);
  });

  it('se tait tant que le chantier tourne', () => {
    expect(chantierOublie(chantier(MAINTENANT + 60_000, true), MAINTENANT)).toBe(false);
  });

  it('se tait quand un ordre prend la suite', () => {
    expect(chantierOublie(chantier(MAINTENANT - 1, false), MAINTENANT)).toBe(false);
  });
});
