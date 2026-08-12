import { chargerMonde, type Monde } from '@/domaine/monde';
import type { VueJoueur } from '@/domaine/vue-joueur';
import { clientConvexHttp } from './clientConvex';
import { chargerVueJoueurConvex } from './chargerVueJoueurConvex';
import { lireJeton } from './jeton';

export type Partie =
  | { etat: 'en-cours'; monde: Monde; vue: VueJoueur; jeton: string }
  | { etat: 'aucune' };

let mondeEnCours: Promise<Monde> | null = null;

export async function chargerPartie(): Promise<Partie> {
  const jeton = lireJeton();
  if (!jeton || !clientConvexHttp()) return { etat: 'aucune' };

  mondeEnCours ??= chargerMonde();
  const monde = await mondeEnCours;
  return { etat: 'en-cours', monde, vue: await chargerVueJoueurConvex(monde, jeton), jeton };
}
