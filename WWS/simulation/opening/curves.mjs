/**
 * **Les courbes de production par niveau — une hypothèse, pas un miroir.**
 *
 * `constants.mjs` ne porte que des valeurs copiées de `convex/constants.ts` ; ce fichier-ci
 * porte une question qu'on pose au jeu, et il vit à part précisément pour que `verify.mjs`
 * n'ait jamais à décider si une dérive est un bug ou une proposition.
 *
 * Aujourd'hui le jeu est **linéaire** : deux bâtiments de niveau 1 valent exactement un
 * bâtiment de niveau 2, et rien dans l'économie ne récompense la montée. La courbe
 * `compounded` est la proposition inverse — `production(n) = 2·base·(1 + Σ 1,3ᵏ, k=1..n−1)` :
 * le premier niveau vaut double, et chaque niveau suivant ajoute 30 % de plus que le
 * précédent. C'est ce qui rend « monter ou s'étaler » une décision au lieu d'un synonyme.
 *
 * Elle se lit **par site**, jamais sur un total de niveaux : additionner les niveaux avant
 * d'appliquer la courbe rendrait deux fonderies de niveau 1 égales à une de niveau 2, ce qui
 * est exactement la question qu'on mesure. Sur la courbe linéaire la distinction n'a aucun
 * effet — c'est pourquoi le moteur peut l'appliquer partout sans changer les chiffres d'hier.
 */

/** Ce que vaut le premier niveau, dans la courbe composée. */
export const FIRST_LEVEL_FACTOR = 2;
/** Ce que chaque niveau ajoute de plus que le précédent. */
export const ADDITION_FACTOR = 1.3;

export const PRODUCTION_CURVES = {
  linear: (level) => Math.max(0, level),
  compounded: (level) => {
    if (level <= 0) return 0;
    let added = 1;
    let total = 1;
    for (let step = 1; step < level; step += 1) {
      added *= ADDITION_FACTOR;
      total += added;
    }
    return FIRST_LEVEL_FACTOR * total;
  },
};

/**
 * Un réglage absent vaut la courbe du jeu : `caps` est appelée par `verify.mjs` sur un état nu,
 * et une courbe manquante ne doit pas y valoir zéro production.
 */
export const productionCurve = (tuning) =>
  PRODUCTION_CURVES[tuning?.levelCurve ?? 'linear'] ?? PRODUCTION_CURVES.linear;

/** Le rendement d'un parc de bâtiments d'une même clé, courbe appliquée site par site. */
export const curvedLevel = (sites, keys, tuning) => {
  const curve = productionCurve(tuning);
  return sites.reduce((total, site) => (keys.includes(site.key) ? total + curve(site.level) : total), 0);
};
