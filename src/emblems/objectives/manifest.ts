import abandonedStores from './abandonedStores.webp';
import fuelDump from './fuelDump.webp';
import irregularArsenal from './irregularArsenal.webp';
import stalledConvoy from './stalledConvoy.webp';

/**
 * **Une planche par archétype d'objectif neutre**, sur le modèle des bâtiments et pour la même
 * raison : le mât porte un portrait, pas une catégorie. Les planches sont **neutres** — un
 * objectif n'appartient à personne, il n'y a donc aucune encre nationale à poser dessus.
 *
 * **`null` est une valeur, jamais un oubli** : tant que la planche manque, le mât tombe sur le
 * cadre pointillé qui porte le nom de 1940 — jamais une image cassée. Les quatre sont dessinées
 * depuis le 17/09 (`WWS/docs/prompts/images/objectifs.md` pour les prompts, `WWS/sprites/README.md`
 * §9 pour la chaîne) ; un archétype de plus s'écrit `null` en attendant la sienne.
 *
 * L'invariant tient la table et la palette ensemble : une clé d'archétype sans ligne ici est une
 * erreur au chargement, pas un trou sur la carte (`objectives.test.ts`).
 */
export const OBJECTIVE_SPRITES: Readonly<Record<string, string | null>> = {
  abandonedStores,
  stalledConvoy,
  fuelDump,
  irregularArsenal,
};

export const objectiveSprite = (key: string): string | null => OBJECTIVE_SPRITES[key] ?? null;
