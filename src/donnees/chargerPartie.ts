import { chargerMonde, type Monde } from '@/domaine/monde';
import type { VueJoueur } from '@/domaine/vue-joueur';
import { chargerVueJoueur } from './chargerVueJoueur';

export type Partie = { monde: Monde; vue: VueJoueur };

let enCours: Promise<Partie> | null = null;

export function chargerPartie(): Promise<Partie> {
  enCours ??= (async () => {
    const monde = await chargerMonde();
    return { monde, vue: await chargerVueJoueur(monde) };
  })();
  return enCours;
}
