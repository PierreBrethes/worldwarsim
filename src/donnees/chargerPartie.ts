import { chargerMonde, type Monde } from '@/domaine/monde';
import type { VueJoueur } from '@/domaine/vue-joueur';
import { clientConvexHttp } from './clientConvex';
import { chargerVueJoueur } from './chargerVueJoueur';
import { chargerVueJoueurConvex } from './chargerVueJoueurConvex';
import { lireJeton } from './jeton';

export type Partie = { monde: Monde; vue: VueJoueur };

let mondeEnCours: Promise<Monde> | null = null;

export async function chargerPartie(): Promise<Partie> {
  mondeEnCours ??= chargerMonde();
  const monde = await mondeEnCours;
  const jeton = lireJeton();
  const vue =
    jeton && clientConvexHttp() ? await chargerVueJoueurConvex(monde, jeton) : await chargerVueJoueur(monde);
  return { monde, vue };
}
