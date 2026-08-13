import { describe, expect, it } from 'vitest';
import {
  compteursFrise,
  construireFrise,
  estImmobilise,
  filtrerFrise,
  millisecondesAvantResolution,
  partParcourue,
  resumeFrise,
} from './frise';
import type { ArcAffiche, VueJoueur } from './vue-joueur';
import { trajetDirect } from './trajets';

const CHARGEE_A = 1_700_000_000_000;

const arcMien = (surcharge: Partial<Extract<ArcAffiche, { etat: 'mien' }>>): ArcAffiche => ({
  etat: 'mien',
  id: 'mv-1',
  depuis: [0, 0],
  vers: [1, 1],
  trajet: trajetDirect([0, 0], [1, 1], 'terre', 10),
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
  trajet: trajetDirect([0, 0], [1, 1], 'terre', 10),
  nationSuspectee: null,
  capDegres: 87,
  capSurMoi: false,
  identification: { perce: false },
  minutesRestantesEstimees: 100,
  avancement: 0.34,
  ...surcharge,
});

const vueAvec = (arcs: ReadonlyArray<ArcAffiche>): VueJoueur =>
  ({ arcs, chargeeA: CHARGEE_A }) as unknown as VueJoueur;

describe('construction de la frise', () => {
  it('trie par heure d’arrivée croissante', () => {
    const fiches = construireFrise(
      vueAvec([
        arcMien({ id: 'tard', minutesRestantes: 90 }),
        arcDetecte({ id: 'tot', minutesRestantesEstimees: 20 }),
        arcMien({ id: 'milieu', minutesRestantes: 45 }),
      ]),
    );
    expect(fiches.map((fiche) => fiche.id)).toEqual(['tot', 'milieu', 'tard']);
  });

  it('renvoie une fiche sans horaire en queue', () => {
    const fiches = construireFrise(
      vueAvec([
        arcDetecte({ id: 'sans-estimation', minutesRestantesEstimees: null }),
        arcMien({ id: 'mien', minutesRestantes: 400 }),
      ]),
    );
    expect(fiches.map((fiche) => fiche.id)).toEqual(['mien', 'sans-estimation']);
    expect(fiches[1]!.chronologie.connue).toBe(false);
  });

  it('écarte les arcs que la frise ne sait pas porter', () => {
    const fiches = construireFrise(
      vueAvec([
        { etat: 'maitriseDesMers', id: 'mer', depuis: [0, 0], vers: [1, 1], trajet: trajetDirect([0, 0], [1, 1], 'mer', 10), avancement: 0.2 },
        {
          etat: 'dernierePositionConnue',
          id: 'figee',
          depuis: [0, 0],
          vers: [1, 1],
          trajet: trajetDirect([0, 0], [1, 1], 'terre', 10),
          capDegres: 12,
          vuIlYaMinutes: 40,
          avancement: 0.6,
        },
      ]),
    );
    expect(fiches).toEqual([]);
  });
});

describe('brouillard des fiches adverses', () => {
  it('ne dit ni type ni composition tant que le mouvement n’est pas identifié', () => {
    const [fiche] = construireFrise(vueAvec([arcDetecte({ capSurMoi: true })]));
    expect(fiche!.famille).toBe('capSurMoi');
    expect(fiche!.type).toBeNull();
    expect(fiche!.identifie).toBe(false);
    expect(fiche!.composition).toBe('nature et composition non observées');
    expect(fiche!.origine).toBe('origine inconnue');
    expect(fiche!.destination).toBe('cap 087°');
    expect(fiche!.estime).toBe(true);
  });

  it('révèle type et composition une fois le mouvement percé', () => {
    const [fiche] = construireFrise(
      vueAvec([
        arcDetecte({
          capSurMoi: true,
          identification: { perce: true, type: 'attaque', pile: { blinde: 30 } },
        }),
      ]),
    );
    expect(fiche!.identifie).toBe(true);
    expect(fiche!.type).toBe('attaque');
    expect(fiche!.composition).toBe('30 blindés');
    expect(fiche!.estime).toBe(true);
  });

  it('sépare le cap sur moi du renseignement', () => {
    const fiches = construireFrise(
      vueAvec([
        arcDetecte({ id: 'ailleurs', capSurMoi: false }),
        arcDetecte({ id: 'sur-moi', capSurMoi: true, minutesRestantesEstimees: 10 }),
      ]),
    );
    expect(fiches.map((fiche) => fiche.famille)).toEqual(['capSurMoi', 'renseignement']);
  });

  it('n’expose jamais le rôle d’une pile adverse, même identifiée', () => {
    const [fiche] = construireFrise(
      vueAvec([
        arcDetecte({ identification: { perce: true, type: 'raid', pile: { blinde: 30 } } }),
      ]),
    );
    expect(fiche!.role).toBeNull();
  });
});

describe('chronologie', () => {
  it('déduit départ et arrivée du reste et de l’avancement', () => {
    const [fiche] = construireFrise(
      vueAvec([arcMien({ minutesRestantes: 30, avancement: 0.5 })]),
    );
    const chronologie = fiche!.chronologie;
    if (!chronologie.connue) throw new Error('chronologie attendue connue');
    expect(chronologie.arriveeA).toBe(CHARGEE_A + 30 * 60_000);
    expect(chronologie.departA).toBe(CHARGEE_A - 30 * 60_000);
    expect(chronologie.resolutionA).toBe(chronologie.arriveeA);
    expect(estImmobilise(chronologie)).toBe(false);
  });

  it('repousse la résolution quand le mouvement attend à la frontière', () => {
    const [fiche] = construireFrise(
      vueAvec([
        arcMien({ minutesRestantes: 30, attenteFrontiere: { resolutionDansMinutes: 210 } }),
      ]),
    );
    expect(estImmobilise(fiche!.chronologie)).toBe(true);
    expect(millisecondesAvantResolution(fiche!.chronologie, CHARGEE_A)).toBe(210 * 60_000);
  });

  it('avance le marqueur avec l’horloge, et pas au-delà de l’arrivée', () => {
    const [fiche] = construireFrise(
      vueAvec([arcMien({ minutesRestantes: 30, avancement: 0.5 })]),
    );
    expect(partParcourue(fiche!.chronologie, CHARGEE_A)).toBeCloseTo(0.5);
    expect(partParcourue(fiche!.chronologie, CHARGEE_A + 15 * 60_000)).toBeCloseTo(0.75);
    expect(partParcourue(fiche!.chronologie, CHARGEE_A + 999 * 60_000)).toBe(1);
  });

  it('retombe sur l’avancement servi quand aucun horaire n’est estimé', () => {
    const [fiche] = construireFrise(
      vueAvec([arcDetecte({ minutesRestantesEstimees: null, avancement: 0.68 })]),
    );
    expect(partParcourue(fiche!.chronologie, CHARGEE_A + 10 * 60_000)).toBeCloseTo(0.68);
    expect(millisecondesAvantResolution(fiche!.chronologie, CHARGEE_A)).toBeNull();
  });
});

describe('compteurs et filtres', () => {
  const fiches = construireFrise(
    vueAvec([
      arcMien({ id: 'a1', type: 'attaque', minutesRestantes: 10 }),
      arcMien({ id: 'a2', type: 'attaque', minutesRestantes: 20 }),
      arcMien({ id: 'ap', type: 'avantPoste', minutesRestantes: 30 }),
      arcDetecte({ id: 'sur-moi', capSurMoi: true, minutesRestantesEstimees: 40 }),
      arcDetecte({ id: 'ailleurs', minutesRestantesEstimees: 50 }),
    ]),
  );

  it('décline mes types et ne garde que ceux qui existent', () => {
    expect(compteursFrise(fiches).map((compteur) => [compteur.cle, compteur.nombre])).toEqual([
      ['tous', 5],
      ['mien', 3],
      ['attaque', 2],
      ['avantPoste', 1],
      ['capSurMoi', 1],
      ['renseignement', 1],
    ]);
  });

  it('porte l’alerte sur le seul cap sur moi', () => {
    const alertes = compteursFrise(fiches).filter((compteur) => compteur.alerte);
    expect(alertes.map((compteur) => compteur.cle)).toEqual(['capSurMoi']);
  });

  it('ne garde qu’une famille, ou qu’un de mes types', () => {
    expect(filtrerFrise(fiches, 'tous')).toHaveLength(5);
    expect(filtrerFrise(fiches, 'mien').map((fiche) => fiche.id)).toEqual(['a1', 'a2', 'ap']);
    expect(filtrerFrise(fiches, 'attaque').map((fiche) => fiche.id)).toEqual(['a1', 'a2']);
    expect(filtrerFrise(fiches, 'capSurMoi').map((fiche) => fiche.id)).toEqual(['sur-moi']);
  });

  it('résume la frise repliée en une ligne', () => {
    expect(resumeFrise(fiches, CHARGEE_A)).toBe('5 en vol · proch. arrivée 00:10 · 1 cap sur moi');
    expect(resumeFrise([], CHARGEE_A)).toBe('aucun mouvement en vol');
  });
});
