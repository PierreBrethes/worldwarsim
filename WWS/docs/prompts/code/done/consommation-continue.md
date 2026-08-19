# Prompt Claude Code — l'entretien des troupes, et la première ressource qui se vide

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'[ADR 0014](../../adr/0014-troupes-discretes-et-combat-sequentiel.md),
l'[ADR 0015](../../adr/0015-economie-v2-ressources-localisees.md) et
[chiffrage-combat.md](../../design/propositions/chiffrage-combat.md) §5. Ne commit pas, ne push pas.

**Prérequis : `back-troupes-et-recrutement.md` ET `integration-du-temps.md` sont passés.** La
table `troops` existe, et `settleStocks` intègre correctement un intervalle long. Sinon,
arrête-toi — l'entretien posé sur un intégrateur qui traite 72 heures comme un pas unique
empilerait deux erreurs de même nature.

## Pourquoi

`economyOf` **ne sait que produire**. `settleStocks` accumule, convertit, plafonne — aucun chemin
ne fait *baisser* un stock hors d'une dépense ponctuelle. Tant que ça reste vrai, la nourriture
n'a qu'un débouché (le coût de construction) et une armée ne coûte rien à tenir.

Ce prompt ouvre ce chemin. C'est le premier, il sera copié : écris-le pour être copié.

## Trois décisions prises le 16/08 — applique-les, ne les rediscute pas

**D1 — L'entretien est un forfait par troupe, identique pour tous les rôles.**
`chiffrage-combat.md` §5 dit « proportionnelle à l'effectif nominal ». **Cette règle est
abandonnée, et le §5 est à corriger dans le même geste.** Motif : `nominalStrength` n'est pas dans
la même unité selon le rôle — 50 soldats, 12 chars, 6 navires, 24 appareils embarqués. Nourrir un
porte-avions « proportionnellement à 24 » le rendrait deux fois moins cher qu'une infanterie à 50,
alors qu'il porte trois mille hommes. C'est la même incohérence d'unités qui a fait abandonner le
plafond d'hommes (D1 du prompt troupes) ; on ne la réintroduit pas par la bande.

Une constante, `FOOD_UPKEEP_PER_TROOP_PER_HOUR`, et rien d'autre. Aucune table de neuf nombres.

**L'intention d'origine est préservée gratuitement** : le §5 voulait qu'une troupe entamée coûte
autant qu'une troupe pleine, pour que perdre des hommes ne devienne pas une économie. Un forfait
qui ne lit aucun effectif satisfait ça par construction.

Effet de bord assumé, à écrire en commentaire : une troupe bon marché coûte proportionnellement
plus cher à tenir qu'une troupe chère. C'est un **troisième canal anti-nuée**, après le plafond de
troupes (D3 du prompt troupes) et l'emport de munitions. Il pousse dans la bonne direction.

**D2 — Le pétrole n'est pas dans ce prompt.** Le pétrole se brûle en **se déplaçant**, pas en
stationnant. Il appartient au prompt des mouvements. Ne pose pas de consommation de pétrole « en
attendant » : une constante posée sans consommateur est une valeur que personne ne mesurera.

**D3 — À sec de nourriture, rien ne meurt : la file de recrutement s'arrête.**
Pas de dissolution, pas d'attrition — règle n°3 du projet, un joueur écrasé reste nuisible et
jamais éliminé. Et pas d'attrition silencieuse : une punition invisible tant que le combat n'existe
pas serait un bug pour le joueur.

Le stock plancher à zéro, et **la file de recrutement de tous les bâtiments s'arrête** — la tête ne
progresse plus, les lots ne sont ni annulés ni perdus. Elle repart dès que la nourriture revient.
C'est visible, immédiat, et réversible.

Pose en plus un booléen `starving` dans `PlayerView.me`, que le prompt du combat lira pour appliquer
un malus. **Ne l'utilise nulle part ici** — tu le déclares, tu ne l'exploites pas.

## Implémentation

1. **Le chemin de drain, dans `settleStocks`** (`src/domain/economy.ts`). C'est la seule fonction
   qui a le droit de faire bouger un stock dans le temps, et elle doit le rester : un second
   endroit qui décompte serait une seconde vérité.

   **L'ordre importe et n'est pas neutre.** Aujourd'hui : accumulation, puis conversions.
   L'entretien s'intercale — décide où, et **écris pourquoi en commentaire**. Avant les
   conversions, l'entretien peut affamer une fonderie ; après, il ne mange que le surplus. Le
   comportement diffère et le joueur le sentira.

2. **Le plancher à zéro, et le temps qu'il a fallu.** Sur un long intervalle — un joueur revient
   après huit heures — l'entretien peut dépasser le stock. `settleStocks` doit alors dire **à quel
   moment** la nourriture s'est épuisée, pas seulement qu'elle vaut zéro : la file de recrutement
   n'a pas avancé depuis cet instant, pas depuis maintenant.

   **C'est le point délicat de ce prompt.** Un calcul qui remet naïvement le stock à zéro fait
   avancer la file de huit heures pendant lesquelles l'armée n'avait rien à manger. Traite-le, et
   couvre-le d'un test.

3. **Le nombre de troupes vient de la table `troops`.** Il change entre deux lectures : une
   livraison de lot fait monter l'entretien. La comptabilité paresseuse doit rester juste — dis en
   commentaire quelle approximation tu retiens si tu en retiens une, plutôt que de la laisser
   deviner.

4. **La file s'arrête, elle ne s'annule pas.** `startHead` ne date pas la tête tant que le joueur
   est à sec.

5. **Le débit affiché de la nourriture doit être net de l'entretien.** Un joueur qui produit 40 et
   en consomme 45 doit lire **−5**, jamais 40. C'est la moitié de l'intérêt de la mécanique.

6. **La fenêtre Industrie** (`fenetre-industrie.md`, si elle est passée) gagne une ligne
   d'entretien : combien de troupes, combien de nourriture par heure, et le solde. Même
   formulation que les chaînes.

## Corrige le chiffrage dans le même geste

`chiffrage-combat.md` §5, ligne « Entretien » : la proportionnalité à l'effectif nominal est
remplacée par le forfait par troupe, avec le motif. **C'est la seule valeur du chiffrage que tu as
le droit de toucher** ; toutes les autres restent intactes.

## À signaler, pas à trancher

**La file de recrutement contourne le plafond de stockage.** Les matières d'un lot en file sont
débitées, donc conservées *hors* du plafond, et récupérables par annulation — un entrepôt
illimité, et qui ne se pille pas, alors que l'`Entrepôt` « se pille » et le `Dépôt` « explose »
(fiche 02). Le plafond de troupes le borne, donc parquer coûte son armée, et rien ne se pille encore.
**Constate-le dans ton rapport.** Il faudra le trancher avant d'écrire le pillage, pas après.

## Critères d'acceptation

- Une nation sans troupe ne consomme rien.
- Vingt-quatre troupes consomment vingt-quatre fois le forfait, quels que soient leurs rôles.
- Une troupe à 10 % de son effectif coûte autant qu'une troupe pleine.
- Le débit de nourriture affiché est **net**, et peut être négatif.
- À sec, aucune troupe n'est perdue et la file n'avance plus ; elle repart au réapprovisionnement.
- Une lecture après huit heures d'absence, dont six à sec, fait avancer la file de **deux** heures,
  pas de huit. Un test le prouve.
- `starving` est servi dans `PlayerView.me` et n'est lu nulle part.
- Aucune consommation de pétrole n'a été ajoutée.
- `chiffrage-combat.md` §5 dit la même chose que `constants.ts`.
- `npm run build` et `npm run test` passent ; aucun terme banni.

## Ce que tu ne fais pas

Pas de combat, pas de soin, pas de mouvements, pas de consommation de pétrole, pas d'attrition, pas
de dissolution de troupe. Tu n'ajoutes aucun second endroit qui fasse baisser un stock dans le
temps : `settleStocks` reste seule.
