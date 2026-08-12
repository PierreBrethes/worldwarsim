// Placeholders d'équilibrage, à faire passer par le simulateur avant toute saison réelle.
// Sources : fiche 02 pour la structure, WWS/simulation pour les ordres de grandeur.

import type { PalierUnite } from '../src/domaine/troupes';
import type { RoleUnite } from '../src/domaine/vue-joueur';

export { ENCRE_PAR_NATION, NATIONS } from '../src/domaine/nations';

export const DEPART = {
  ravitaillement: { stock: 500, tauxParHeure: 120 },
  acier: { stock: 0, tauxParHeure: 0 },
  effectifs: { stock: 60, tauxParHeure: 8, plafond: 120 },
} as const;

/**
 * Coût et durée **d'une seule unité** de palier 1. Acier et effectifs viennent du
 * `catalogueProduction` de `WWS/simulation/etat-reference.json`, les durées de la maquette 4.6 — une
 * unité s'achète en acier et en hommes, **jamais en ravitaillement**. Valeurs assumées
 * arbitraires en attendant le simulateur : c'est le seul endroit à corriger.
 */
export const COUT_PAR_ROLE: Readonly<
  Record<RoleUnite, { effectifs: number; ravitaillement: number; acier: number; minutes: number }>
> = {
  infanterie: { effectifs: 6, ravitaillement: 0, acier: 18, minutes: 20 },
  blinde: { effectifs: 3, ravitaillement: 0, acier: 95, minutes: 70 },
  transportTerrestre: { effectifs: 2, ravitaillement: 0, acier: 40, minutes: 45 },
  chasseur: { effectifs: 2, ravitaillement: 0, acier: 110, minutes: 90 },
  bombardier: { effectifs: 3, ravitaillement: 0, acier: 160, minutes: 120 },
  transportAerien: { effectifs: 2, ravitaillement: 0, acier: 90, minutes: 75 },
  escorte: { effectifs: 5, ravitaillement: 0, acier: 175, minutes: 180 },
  cargo: { effectifs: 3, ravitaillement: 0, acier: 120, minutes: 100 },
  porteAvions: { effectifs: 9, ravitaillement: 0, acier: 430, minutes: 480 },
};

export const FACTEUR_PALIER_2 = 1.6;
export const NIVEAU_INDUSTRIE_PALIER_2 = 2;
export const UNITES_PAR_LOT_MAX = 20;
export const LOTS_EN_FILE_MAX = 12;

/** Le complexe industriel ne débloque pas seulement le palier 2, il accélère la chaîne. */
export function vitesseIndustrie(niveau: number): number {
  return 1 + (niveau - 1) * 0.225;
}

export function coutRecrutement(
  role: RoleUnite,
  palier: PalierUnite,
  nombre: number,
  niveauIndustrie: number,
) {
  const base = COUT_PAR_ROLE[role];
  const facteur = palier === 2 ? FACTEUR_PALIER_2 : 1;
  return {
    effectifs: Math.round(base.effectifs * facteur) * nombre,
    ravitaillement: Math.round(base.ravitaillement * facteur) * nombre,
    acier: Math.round(base.acier * facteur) * nombre,
    minutes: Math.round((base.minutes * facteur * nombre) / vitesseIndustrie(niveauIndustrie)),
  };
}

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
