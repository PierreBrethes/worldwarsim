// Placeholders d'équilibrage, à faire passer par le simulateur avant toute saison réelle.
// Sources : fiche 02 pour la structure, fixture pour les ordres de grandeur.

export { ENCRE_PAR_NATION, NATIONS } from '../src/domaine/nations';

export const DEPART = {
  ravitaillement: { stock: 500, tauxParHeure: 120 },
  acier: { stock: 0, tauxParHeure: 0 },
  effectifs: { stock: 60, tauxParHeure: 8, plafond: 120 },
} as const;

export const COUT_BATIMENT_BASE = 200;
export const FACTEUR_COUT_NIVEAU = 1.8;
export const DUREE_CHANTIER_BASE_MINUTES = 30;

export const JOUEURS_MAX = 8;
export const JOUEURS_MIN_LANCEMENT = 2;

export const PLAGE_REPOS_DEFAUT = { debutMinutes: 23 * 60, finMinutes: 7 * 60 };

export function coutNiveau(niveau: number): number {
  return Math.round(COUT_BATIMENT_BASE * FACTEUR_COUT_NIVEAU ** (niveau - 1));
}

export function dureeChantierMinutes(niveau: number): number {
  return Math.round(DUREE_CHANTIER_BASE_MINUTES * FACTEUR_COUT_NIVEAU ** (niveau - 1));
}
