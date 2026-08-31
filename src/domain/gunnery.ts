import { COMBAT_PROFILES, profileOf, type CombatProfile, type DamageTable } from './combat';
import type { UnitRole, UnitTier } from './ids';
import { ROLE_ORDER, TIERS_BY_ROLE } from './troops';

/**
 * **L'abaque de tir : la table de chiffrage, lue** (ADR 0018 §4). Elle existe, unique et testée,
 * et le joueur recrutait sans jamais la voir — décision de Pierre du 31/08 : un bouton, on
 * clique, on voit tous les rapports.
 *
 * Rien ici ne recopie un chiffre. Ce module **range** `DAMAGE_TABLE` pour l'écran : quelles
 * lignes tirent, quelles colonnes se font toucher, et dans quelle bande tombe une part. La
 * leçon de `verif-chiffrage.mjs` est explicite (ADR 0018 §4) — une copie de la table est un
 * mensonge en sursis — donc la vraie table arrive en paramètre et n'est jamais dupliquée.
 */

/** Le rôle et la marque derrière un profil de tir : l'inverse exact de `profileOf`. */
export type ProfileUnit = {
  readonly role: UnitRole;
  readonly tier: UnitTier;
  /** La marque se dit à l'écran seulement quand le rôle en a deux — « MK1 » sur un cargo qui
   *  n'a qu'une marque est un chiffre qui n'oppose rien. */
  readonly marked: boolean;
};

/** Construit **par** `profileOf` plutôt qu'en recomposant la clé : c'est la seule façon de dire
 *  « l'inverse de cette fonction-là » sans réécrire sa règle à côté d'elle. */
export const PROFILE_UNITS: Readonly<Record<CombatProfile, ProfileUnit>> = (() => {
  const units = {} as Record<CombatProfile, ProfileUnit>;
  for (const role of ROLE_ORDER) {
    const marked = TIERS_BY_ROLE[role] === 2;
    const tiers: ReadonlyArray<UnitTier> = marked ? [1, 2] : [1];
    for (const tier of tiers) units[profileOf(role, tier)] = { role, tier, marked };
  }
  return units;
})();

/**
 * **Trois bandes, et l'encre les dit avant les chiffres.** Une grille de soixante-quinze
 * nombres ne se lit pas : ce qu'un joueur y cherche est « qu'est-ce qui casse ça », et c'est un
 * motif, pas une valeur. La valeur reste imprimée dans la case — l'abaque de 1940 en portait
 * une — et le survol la commente.
 *
 * Les deux seuils sont posés sur la table telle qu'elle est, pas sur une intention : au-dessus
 * de `STRONG_SHARE` on trouve les contres que le chiffrage a voulus francs (l'antichar de
 * l'infanterie MK2, le chasseur sur le bombardier, le blindé sur le camion) ; en dessous de
 * `WEAK_SHARE` on trouve les frappes de dépit (une infanterie qui tire sur un blindé, un cargo
 * qui riposte). Ils ne changent aucun combat — rien du jeu ne les lit.
 */
export const STRONG_SHARE = 0.55;
export const WEAK_SHARE = 0.15;

export type Band = 'strong' | 'even' | 'weak';

export const bandOf = (share: number): Band =>
  share >= STRONG_SHARE ? 'strong' : share <= WEAK_SHARE ? 'weak' : 'even';

/**
 * Une case de l'abaque. Union discriminée plutôt qu'une part nullable : **une case absente est
 * « ne l'atteint pas », jamais un zéro** (`DamageTable`), et un blindé qui n'atteint pas un
 * bombardier n'est pas un blindé qui le touche pour rien.
 */
export type GunneryShot =
  | { readonly defender: CombatProfile; readonly reach: 'none' }
  | {
      readonly defender: CombatProfile;
      readonly reach: 'hits';
      readonly share: number;
      readonly band: Band;
    };

/**
 * Une ligne de l'abaque, et là encore une union plutôt qu'un tableau vide : **un profil qui ne
 * tire sur rien ne se dit pas avec onze tirets.** L'avion de transport est le seul, il se recrute
 * comme les autres, et l'omettre ou l'aligner en cases vides se lirait pareil — comme une panne.
 * Il porte donc sa ligne, et cette ligne dit ce qu'il est.
 */
export type GunneryRow =
  | { readonly attacker: CombatProfile; readonly fires: false }
  | {
      readonly attacker: CombatProfile;
      readonly fires: true;
      readonly shots: ReadonlyArray<GunneryShot>;
    };

/**
 * **Une ligne par profil, une colonne par profil.** Les transports y figurent des deux côtés :
 * comme cibles, ce qu'ils sont par conception (`TRANSPORT_PROFILES`), et comme lignes, parce
 * qu'on les recrute et qu'un joueur venu chercher son cargo doit le trouver.
 */
export function gunneryRows(table: DamageTable): ReadonlyArray<GunneryRow> {
  return COMBAT_PROFILES.map((attacker) => {
    if (Object.keys(table[attacker]).length === 0) return { attacker, fires: false };
    return {
      attacker,
      fires: true,
      shots: COMBAT_PROFILES.map((defender) => {
        const share = table[attacker][defender];
        return share === undefined
          ? { defender, reach: 'none' as const }
          : { defender, reach: 'hits' as const, share, band: bandOf(share) };
      }),
    };
  });
}
