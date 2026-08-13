import { describe, expect, it } from 'vitest';
import { abregerPile, construireEtiquettes, type MarqueurCarte } from './etiquettes';
import type { ArcAffiche, VueJoueur } from './vue-joueur';

const CHARGEE_A = 1_700_000_000_000;

const arcMien = (surcharge: Partial<Extract<ArcAffiche, { etat: 'mien' }>>): ArcAffiche => ({
  etat: 'mien',
  id: 'mv-1',
  depuis: [0, 0],
  vers: [1, 1],
  origineNom: 'United Kingdom',
  destinationNom: 'Italy',
  origineLibelle: 'Royaume-Uni',
  destinationLibelle: 'Italie',
  type: 'attaque',
  pile: { infanterie: 24, blinde: 6 },
  minutesRestantes: 30,
  attenteFrontiere: null,
  avancement: 0.5,
  ...surcharge,
});

const arcDetecte = (
  surcharge: Partial<Extract<ArcAffiche, { etat: 'adverseDetecte' }>>,
): ArcAffiche => ({
  etat: 'adverseDetecte',
  id: 'mv-x',
  depuis: [0, 0],
  vers: [1, 1],
  nationSuspectee: null,
  capDegres: 87,
  capSurMoi: false,
  identification: { perce: false },
  minutesRestantesEstimees: 100,
  avancement: 0.34,
  ...surcharge,
});

const vueAvec = (arcs: ReadonlyArray<ArcAffiche>): VueJoueur =>
  ({ arcs, chargeeA: CHARGEE_A }) as VueJoueur;

const AVANT_POSTE: MarqueurCarte = {
  genre: 'avantPoste',
  id: 'ap-1',
  lonLat: [8.5, 61.4],
  paysHote: 'Norway',
  specialisation: 'extraction',
  niveau: 2,
  garnison: 40,
  encre: '#4a4f7a',
};

const textes = (lignes: ReadonlyArray<{ readonly role: string }>) =>
  lignes.map((ligne) => ('texte' in ligne ? ligne.texte : `compte:${ligne.role}`));

describe('construireEtiquettes', () => {
  it('n’imprime ni type ni composition d’un mouvement adverse non identifié', () => {
    const [etiquette] = construireEtiquettes(vueAvec([arcDetecte({})]), []);
    expect(etiquette?.type).toBe('renseignement');
    expect(etiquette?.identifie).toBe(false);
    expect(textes(etiquette!.lignes)).toEqual(['compte:compte', 'estimé']);
    expect(etiquette?.lignes[0]).toEqual({ role: 'compte', echeanceA: CHARGEE_A + 100 * 60_000, prefixe: '~' });
  });

  it('donne type et composition dès que le renseignement a percé', () => {
    const [etiquette] = construireEtiquettes(
      vueAvec([
        arcDetecte({
          capSurMoi: true,
          identification: { perce: true, type: 'attaque', pile: { blinde: 30 } },
        }),
      ]),
      [],
    );
    expect(etiquette?.type).toBe('mouvement-cap-sur-moi');
    expect(etiquette?.identifie).toBe(true);
    expect(textes(etiquette!.lignes)).toEqual(['compte:compte', 'attaque · 30 BLD']);
  });

  it('n’attribue jamais d’encre nationale à une étiquette adverse', () => {
    const [etiquette] = construireEtiquettes(vueAvec([arcDetecte({})]), []);
    expect(etiquette?.encre).toBeNull();
  });

  it('classe les priorités du cap sur moi jusqu’à la pile à domicile', () => {
    const etiquettes = construireEtiquettes(
      vueAvec([
        arcMien({ id: 'mien' }),
        arcDetecte({ id: 'sur-moi', capSurMoi: true }),
        arcDetecte({ id: 'ailleurs' }),
      ]),
      [
        AVANT_POSTE,
        { genre: 'pile', id: 'pile', lonLat: [0, 0], pile: { infanterie: 4 }, encre: '#000' },
        {
          genre: 'chantier',
          id: 'chantier',
          lonLat: [0, 0],
          paysHote: 'United Kingdom',
          nom: 'Centre logistique',
          acheveA: CHARGEE_A,
          encre: '#000',
        },
      ],
    );
    const ordre = etiquettes
      .slice()
      .sort((premiere, seconde) => seconde.priorite - premiere.priorite)
      .map((etiquette) => etiquette.id);
    expect(ordre).toEqual(['sur-moi', 'mien', 'ailleurs', 'chantier', 'ap-1', 'pile']);
  });

  it('ne pose aucune étiquette sur un arc figé ou une maîtrise des mers', () => {
    const arcs: ReadonlyArray<ArcAffiche> = [
      { etat: 'dernierePositionConnue', id: 'a', depuis: [0, 0], vers: [1, 1], capDegres: 10, vuIlYaMinutes: 5, avancement: 0.2 },
      { etat: 'maitriseDesMers', id: 'b', depuis: [0, 0], vers: [1, 1], avancement: 0.4 },
    ];
    expect(construireEtiquettes(vueAvec(arcs), [])).toHaveLength(0);
  });

  it('n’ancre une tête de mouvement sur aucune position figée', () => {
    const [etiquette] = construireEtiquettes(vueAvec([arcMien({})]), []);
    expect(etiquette?.ancre).toEqual({ genre: 'teteMouvement', arc: 'mv-1' });
  });

  it('rend le clic d’un avant-poste au pays hôte, jamais celui d’une pile', () => {
    const etiquettes = construireEtiquettes(vueAvec([]), [
      AVANT_POSTE,
      { genre: 'pile', id: 'pile', lonLat: [0, 0], pile: { infanterie: 4 }, encre: '#000' },
    ]);
    expect(etiquettes[0]?.paysHote).toBe('Norway');
    expect(etiquettes[1]?.paysHote).toBeNull();
  });
});

describe('abregerPile', () => {
  it('abrège les rôles et sépare au point médian', () => {
    expect(abregerPile({ infanterie: 24, blinde: 6 })).toBe('24 INF · 6 BLD');
  });

  it('ignore les rôles à zéro', () => {
    expect(abregerPile({ infanterie: 12, blinde: 0 })).toBe('12 INF');
  });
});
