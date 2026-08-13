import { useSyncExternalStore } from 'react';
import type { BasculesIndicateurs, CategorieIndicateur } from '@/domaine/indicateurs';
import { garderBasculesIndicateurs, lireBasculesIndicateurs } from './reglages';

/**
 * Les bascules du bord d'écran ont deux lecteurs éloignés — le rail qui les allume, la carte
 * qui les applique — et aucun ancêtre commun qui ait à les porter. Un magasin de module plutôt
 * qu'un contexte : l'état vit là où il est écrit, et la route n'a rien à faire suivre.
 */
let etat: BasculesIndicateurs | null = null;
const abonnes = new Set<() => void>();

const instantane = (): BasculesIndicateurs => (etat ??= lireBasculesIndicateurs());

export const useBasculesIndicateurs = (): BasculesIndicateurs =>
  useSyncExternalStore(abonner, instantane);

export function basculerIndicateur(categorie: CategorieIndicateur): void {
  const courant = instantane();
  etat = { ...courant, [categorie]: !courant[categorie] };
  garderBasculesIndicateurs(etat);
  for (const abonne of abonnes) abonne();
}

function abonner(ecouteur: () => void): () => void {
  abonnes.add(ecouteur);
  return () => {
    abonnes.delete(ecouteur);
  };
}
