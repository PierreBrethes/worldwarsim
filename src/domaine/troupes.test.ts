import { describe, expect, it } from 'vitest';
import { compterTroupes, inventorierTroupes, organiserTroupes, roleRepresentatif } from './troupes';
import type { ArcAffiche, VueJoueur } from './vue-joueur';

const moi = {
  armeePresente: { infanterie: 8, chasseur: 2 },
  avantPostes: [
    { id: 'AP-01', paysHote: 'Hungary', lonLat: [0, 0], specialisation: 'extraction', garnison: 20, aMoi: true },
    { id: 'AP-02', paysHote: 'Ireland', lonLat: [0, 0], specialisation: 'extraction', garnison: 0, aMoi: true },
  ],
} as unknown as VueJoueur['moi'];

const arcs: ReadonlyArray<ArcAffiche> = [
  {
    etat: 'mien',
    id: 'MVT-001',
    depuis: [0, 0],
    vers: [1, 1],
    origineNom: 'France',
    destinationNom: 'Chad',
    type: 'attaque',
    pile: { blinde: 3, escorte: 1 },
    minutesRestantes: 8,
    avancement: 0.5,
  },
  {
    etat: 'adverseDetecte',
    id: 'ARC-001',
    depuis: [0, 0],
    vers: [1, 1],
    nationSuspectee: null,
    capDegres: 142,
    minutesRestantesEstimees: null,
    avancement: 0.5,
  },
];

describe('inventaire des troupes', () => {
  it('réunit domicile, mouvements miens et garnisons', () => {
    const lignes = inventorierTroupes(moi, arcs);
    expect(lignes.map((ligne) => ligne.cle)).toEqual([
      'domicile-infanterie',
      'domicile-chasseur',
      'MVT-001-blinde',
      'MVT-001-escorte',
      'AP-01-garnison',
    ]);
    expect(compterTroupes(lignes)).toBe(34);
  });

  it('n’expose jamais la pile d’un arc adverse', () => {
    const lignes = inventorierTroupes(moi, arcs);
    expect(lignes.some((ligne) => ligne.cle.startsWith('ARC-'))).toBe(false);
  });

  it('classe chaque rôle dans son domaine', () => {
    const lignes = inventorierTroupes(moi, arcs);
    const parCle = new Map(lignes.map((ligne) => [ligne.cle, ligne.domaineUnite]));
    expect(parCle.get('domicile-chasseur')).toBe('air');
    expect(parCle.get('MVT-001-escorte')).toBe('mer');
    expect(parCle.get('AP-01-garnison')).toBe('terre');
  });
});

describe('filtre et tri', () => {
  const lignes = inventorierTroupes(moi, arcs);

  it('ne retient qu’une situation', () => {
    const enMouvement = organiserTroupes(lignes, { situation: 'mouvement', domaineUnite: 'tous' }, 'role');
    expect(enMouvement.map((ligne) => ligne.cle)).toEqual(['MVT-001-blinde', 'MVT-001-escorte']);
  });

  it('ne retient qu’un domaine', () => {
    const terre = organiserTroupes(lignes, { situation: 'toutes', domaineUnite: 'terre' }, 'nombre');
    expect(terre.map((ligne) => ligne.nombre)).toEqual([20, 8, 3]);
  });

  it('trie par échéance en repoussant ce qui ne bouge pas', () => {
    const parEcheance = organiserTroupes(lignes, { situation: 'toutes', domaineUnite: 'tous' }, 'echeance');
    expect(parEcheance[0]?.cle).toBe('MVT-001-blinde');
    expect(parEcheance[1]?.cle).toBe('MVT-001-escorte');
  });

  it('laisse l’inventaire d’origine intact', () => {
    organiserTroupes(lignes, { situation: 'toutes', domaineUnite: 'tous' }, 'nombre');
    expect(lignes[0]?.cle).toBe('domicile-infanterie');
  });
});

describe('roleRepresentatif', () => {
  it('retient le rôle le plus nombreux', () => {
    expect(roleRepresentatif({ infanterie: 3, blinde: 7, chasseur: 1 })).toBe('blinde');
  });

  it('départage les égalités par l’ordre canonique', () => {
    expect(roleRepresentatif({ escorte: 4, infanterie: 4 })).toBe('infanterie');
  });

  it('ignore les rôles à zéro et rend null sur pile vide', () => {
    expect(roleRepresentatif({ cargo: 0 })).toBeNull();
    expect(roleRepresentatif({})).toBeNull();
  });
});
