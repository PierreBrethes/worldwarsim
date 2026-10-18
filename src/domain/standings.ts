/**
 * **Le barème du classement — ce qui se compte, et avec quelles unités**
 * (`propositions/classement-bareme.md` §1, validée 79a, révisée par la décision 80 du 06/09).
 *
 * **Aucune table nouvelle.** Les trois catégories chiffrées se mesurent toutes en *acier payé*,
 * lu dans les tables qui existent déjà (`BUILDING_SPEC` × `LEVEL_COST_FACTOR`, `COST_BY_ROLE`,
 * `TIER_2_FACTOR`) : une grille de points par bâtiment et par rôle dériverait de la première et
 * se désaccorderait d'elle au premier réglage. *Ce qui coûte compte* — le joueur lit le
 * classement avec les chiffres qu'il connaît déjà, ceux de l'abaque et de la rose.
 *
 * **Les prix arrivent par l'appelant**, comme le facteur de `victory.ts` et la table de
 * `gunnery.ts` : les nombres d'équilibrage vivent dans `convex/constants.ts` et le domaine n'en
 * importe aucun (CLAUDE.md, « src/domain : TS pur »). C'est aussi ce qui garantit le cas 2 du
 * chantier — l'industrie est `buildCost` appelée niveau par niveau, jamais une constante
 * recopiée ici.
 *
 * Le territoire, lui, n'est pas de l'acier : c'est une **part**, régions tenues sur régions
 * tenues par quelqu'un (ADR 0020 §2), donc les parts d'une saison somment à 100. Il reste à part
 * du score général pour cette raison — il est déjà public et exact à côté, et c'est le but, pas
 * un ingrédient.
 */

/**
 * Un bâtiment tel que le barème le pèse. `disabled` est la seule chose qu'il ajoute à ce que la
 * base porte : un bâtiment sous un avant-poste désactivé (ADR 0020 §7) compte **à zéro tant
 * qu'il l'est**, et il repart entier quand le point revient — rien n'est détruit, donc rien
 * n'est décrémenté.
 */
export type ScoredBuilding = {
  readonly key: string;
  readonly level: number;
  readonly disabled: boolean;
};

/** Une troupe telle que le barème la pèse — sa marque et ses points de vie, comme partout
 *  ailleurs (ADR 0014). Une troupe en déroute pèse sa force courante : elle rentre. */
export type ScoredTroop = {
  readonly role: string;
  readonly tier: number;
  readonly strength: number;
  readonly nominalStrength: number;
};

/**
 * **Les deux prix, injectés.** `ofLevel` est l'acier d'**un** niveau (`buildCost(key, l).steel`)
 * et non le cumul : le barème additionne les niveaux 1..n lui-même, ce qui est la seule façon
 * qu'un quartier général 2 vaille ce qu'il a coûté à monter plutôt que ce qu'il coûterait à
 * poser.
 */
export type SteelPrices = {
  readonly ofLevel: (key: string, level: number) => number;
  readonly ofTroop: (role: string, tier: number) => number;
};

export type Scores = {
  /** La part du théâtre, **en pour cent** — jamais un compte de régions (contrat de vue 07 P3). */
  readonly territory: number;
  readonly industry: number;
  readonly military: number;
  readonly deeds: number;
  readonly general: number;
};

export function scoresOf({
  buildings,
  troops,
  engagements,
  heldCount,
  heldByAnyone,
  steel,
}: {
  readonly buildings: ReadonlyArray<ScoredBuilding>;
  readonly troops: ReadonlyArray<ScoredTroop>;
  /** Le nombre d'engagements où il était attaquant **ou** défendeur : de l'activité, pas du
   *  renseignement, et cumulatif — rien ne le décrémente. */
  readonly engagements: number;
  readonly heldCount: number;
  /** Le total tenu par quelqu'un, dénominateur de la part. Zéro quand personne ne tient rien —
   *  au premier quart d'heure d'une saison, et la part vaut alors zéro plutôt que `NaN`. */
  readonly heldByAnyone: number;
  readonly steel: SteelPrices;
}): Scores {
  const industry = Math.round(
    buildings.reduce(
      (sum, building) => (building.disabled ? sum : sum + levelsPaid(building, steel)),
      0,
    ),
  );
  const military = Math.round(troops.reduce((sum, troop) => sum + weightOf(troop, steel), 0));
  return {
    territory: heldByAnyone <= 0 ? 0 : (heldCount / heldByAnyone) * 100,
    industry,
    military,
    deeds: engagements,
    /** Sans coefficient, et sans les faits d'armes : un compteur d'activité additionné à de
     *  l'acier n'aurait pas d'unité. C'est le seul chiffre servi aux autres avec le
     *  territoire, et il ne se décompose jamais (garde-fou du 29/08). */
    general: industry + military,
  };
}

/** Ce qu'il a fallu payer pour l'amener là où il est : la somme des niveaux gravis, pas le prix
 *  du dernier. Un bâtiment n'est jamais rendu, donc rien ne rembourse cette somme. */
const levelsPaid = (building: ScoredBuilding, steel: SteelPrices): number => {
  let paid = 0;
  for (let level = 1; level <= building.level; level += 1)
    paid += steel.ofLevel(building.key, level);
  return paid;
};

/** Le prix plein au prorata des points de vie. Une troupe à moitié entamée pèse la moitié : la
 *  puissance militaire est ce qui est **debout**, pas ce qui a été acheté. */
const weightOf = (troop: ScoredTroop, steel: SteelPrices): number =>
  troop.nominalStrength <= 0
    ? 0
    : steel.ofTroop(troop.role, troop.tier) * (troop.strength / troop.nominalStrength);

/**
 * **Le rang se lit sur le territoire**, le premier en haut (79a) : c'est le but de la saison, et
 * le classement raconte l'écart au but. À part exactement égale, l'ordre d'entrée départage —
 * l'appelant sert déjà ses lignes dans cet ordre, et un tri stable le préserve.
 */
export function rankedByTerritory<T extends { readonly territory: number }>(
  lines: ReadonlyArray<T>,
): ReadonlyArray<T & { readonly rank: number }> {
  return [...lines]
    .sort((left, right) => right.territory - left.territory)
    .map((line, index) => ({ ...line, rank: index + 1 }));
}
