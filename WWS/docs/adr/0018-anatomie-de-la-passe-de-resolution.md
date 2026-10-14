# ADR 0018 — Anatomie de la passe de résolution, table unique, munitions au tir seul

**Statut :** acceptée — précise l'[ADR 0014](0014-troupes-discretes-et-combat-sequentiel.md), gravée après coup
— **§7 renversée le 25/08/2026** (question 18, option a) : les munitions se facturent au tir, plus au recrutement
— **§3 et §5 révisées le 08/09/2026** par l'[ADR 0021](0021-portee-de-detection-et-postures.md)
— **§2.5 et §3 révisées le 16/09/2026** par la résolution simultanée ([ADR 0014](0014-troupes-discretes-et-combat-sequentiel.md), décision 1b)

> Cette ADR ne décide rien de nouveau. Elle grave des décisions déjà prises par le code pendant
> le traitement combat-séquentiel et jamais formalisées — le mécanisme documenté ici tourne en
> production depuis, dans `src/domain/combat.ts`, `convex/combat.ts` et `convex/movements.ts`.

## Contexte

L'[ADR 0014](0014-troupes-discretes-et-combat-sequentiel.md) gravait le principe : des troupes
discrètes, une résolution séquentielle à l'initiative de l'attaquant, un pierre-feuille-ciseaux
par table de dégâts. Elle ne descendait pas au niveau de l'implémentation. La fiche
[08 — Combat](../design/08-combat.md) pose le modèle et laisse volontairement les nombres
ailleurs (`convex/constants.ts`, vérifiés par `src/domain/combat.test.ts`).

Entre les deux, l'implémentation a dû répondre à des questions que ni l'ADR ni la fiche ne
tranchaient au niveau du mécanisme : comment une passe choisit ses cibles, ce qui se passe pour
une troupe qui tombe sous le seuil de déroute, si la cible d'un mouvement peut l'intercepter en
chemin, et — question longtemps ouverte — si les munitions se consomment au combat ou seulement
au recrutement. Ces réponses vivent dans le code depuis, sans ADR pour les justifier ni pour
empêcher qu'on les rejoue autrement par inadvertance. La dernière a été rejouée pour de bon le
25/08 : voir §7.

## Décision

### 1. L'issue d'un engagement : le terrain nettoyé, rien d'autre

L'attaquant gagne un engagement si, à l'issue de la passe unique, plus rien ne tient debout côté
défenseur et qu'il lui reste au moins une troupe debout (`winnerOf`,
`src/domain/combat.ts:170`). Dans tout autre cas — y compris une déroute mutuelle, y compris un
attaquant qui perd tout — c'est le défenseur qui gagne.

C'est la lecture qui n'invente aucun chiffre : avec une seule passe, les deux camps repartent en
général avec des survivants, et il fallait pourtant une réponse binaire pour dire si un raid
désactive l'avant-poste qu'il visait. « Nettoyer le terrain, ou échouer » est la seule frontière
qui ne demande pas de seuil arbitraire (« 50 % de pertes », « le camp le plus fort »).

### 2. L'anatomie de la passe

Une passe de résolution (`resolveEngagement`, `src/domain/combat.ts:113`) se déroule ainsi, dans
cet ordre exact :

1. **Les troupes de l'attaquant frappent, dans l'ordre `ROLE_ORDER`** (infanterie, blindé,
   transport terrestre, chasseur, bombardier, transport aérien, escorte, cargo, porte-avions),
   puis par ancienneté de formation (`formedAt`), puis par identifiant pour départager deux
   troupes formées à la même milliseconde. C'est l'ordre canonique des rôles du domaine
   (`byStrikeOrder`) — il n'a pas de justification tactique propre, mais il doit être le même à
   chaque lecture du même engagement, sur n'importe quelle machine.
2. **Chaque tireur cible le meilleur défenseur encore debout** selon la table de dégâts — la
   plus grosse part atteignable, jamais une cible au hasard ni un ordre de saisie (`pick`).
   **Aucun écran, aucun fodder** : une troupe ne peut pas en placer une autre devant elle pour
   absorber la passe. C'est un choix assumé, pas un oubli — le plafond de troupes (10 à 30 par
   nation, ADR 0014) existe pour refuser l'essaim ; autoriser l'écran reviendrait à le lui rendre
   par la bande, une troupe jetable de plus valant alors une passe encaissée de moins.
3. **L'excès d'une frappe est perdu, jamais de débordement.** Les dégâts sont plafonnés à ce
   qu'il reste à la cible (`Math.min(target.strength, ...)`, `hit`) ; le surplus ne rejaillit pas
   sur la troupe suivante. Six colonnes blindées visant une seule cible n'en achèvent qu'une :
   les quatre frappes de trop ne servent à rien. C'est ce qui borne le mérite de l'empilement —
   accumuler des troupes sur une même cible gaspille des tirs, ça ne les multiplie pas.
4. **Une troupe tombée sous `ROUT_THRESHOLD` (0,25) de son effectif nominal rompt le contact
   immédiatement.** Elle sort de la passe en cours (elle ne peut plus être ciblée, elle ne
   riposte pas) et la résolution du mouvement (`convex/movements.ts`) lui ouvre un mouvement de
   retour créé par le système, **hors slots de mouvement** (ADR 0006) — ce n'est pas un ordre,
   c'est ce qu'une colonne qui a rompu fait mécaniquement. C'est la règle n° 3 du projet — un
   joueur écrasé reste nuisible, jamais éliminé — appliquée à l'échelle de la troupe : déroutée,
   pas détruite.
5. **Une salve par camp, tirée sur l'état d'avant la passe** (révisé le 16/09/2026,
   [ADR 0014](0014-troupes-discretes-et-combat-sequentiel.md) décision 1b). Les deux camps
   visent avec `pick`, chacun avec l'effectif qu'il amène dans la passe ; les pertes
   s'appliquent ensemble et la déroute comme la destruction ne se lisent **qu'après** les deux
   salves. Un défenseur détruit dans la passe a donc tiré quand même. Le seul ordre qui subsiste
   est celui du plafond par cible — deux colonnes sur une même troupe, la seconde gaspille ce
   qui dépasse (point 3).

   > **Ce que cette révision remplace.** Le texte précédent faisait venir les ripostes après
   > toutes les frappes, chaque défenseur encore debout répondant à qui l'avait frappé en
   > dernier (`riposteTarget`, supprimé). Le motif tenait — ne pas faire décider deux fois le
   > même ordre de tir — et la simultanéité le sert mieux : plus aucun ordre ne décide.

### 3. Le bonus du défenseur, les types qui combattent, le contact mobile

> **Révision du 14/10/2026 (ADR 0014, B16 et C1).** Il disparaît : la défense n'a plus de
> multiplicateur de tir, elle a une **protection** — une garnison de bâtiment, d'objectif ou
> d'avant-poste debout et en service encaisse ×0,7 des coups (`GARRISON_DAMAGE_TAKEN`), et
> jamais une pile posée en terrain libre ni en mer. Le paragraphe suivant décrit l'état du 16/09.

**`DEFENDER_BONUS` vaut 1,15** — depuis le 16/09/2026 il n'y a plus d'initiative à contrer, et
c'est devenu le **seul** avantage de la défense. Il s'applique **une seule fois**, sur la salve du
défenseur : la salve de l'attaquant ne porte plus rien. Le doublon hérité du séquentiel — divisé
chez l'un, multiplié chez l'autre, ×1,32 d'écart réel là où la constante en annonce 1,15 — a été
retiré le 16/09. Le terrain et le retranchement se chiffreront sur cet écart-là (Registre 29-30).

**Deux types de mouvement déclenchent une passe de résolution : `attack` et `raid`**
(`convex/movements.ts:245`). Un raid gagné désactive l'avant-poste visé (jamais ne le prend,
ADR 0004) ; une attaque n'a pas cet effet secondaire, elle ne fait que combattre.

**Le contact à distance ne concerne que deux mouvements compatibles**
(`src/domain/interception.ts`, `firstMobileEncounter`). Ils doivent occuper le même milieu au même
instant ; au moins l'un des deux doit porter `attack` ou `raid`, seuls ordres dont le comportement
dérivé est « engager ». `march` et `return` voient sans engager. Une force posée détecte avec la
portée de ses rôles mais n'intercepte jamais : elle combat seulement lorsqu'un mouvement arrive à
son point.

Les prédictions sont **réévaluées aux événements qui changent le plateau** : départ, arrivée,
composition, pose ou retrait d'un détecteur et changement d'état d'un détecteur. Le rendez-vous
précédent est annulé avant d'être remplacé ; le callback relit les deux mouvements et refuse toute
prédiction périmée. Le couple résolu est mémorisé jusqu'à la fin de l'un des mouvements, donc la
même rencontre ne peut pas ouvrir deux passes.

### 4. La table de chiffrage est unique

`DAMAGE_TABLE` (`convex/constants.ts`) est la seule table de dégâts du jeu.
`WWS/simulation/verif-chiffrage.mjs`, qui rejouait les soixante-quinze couples atteignables sur
une **copie** de la table, a été supprimé : deux tables finissent toujours par diverger, et le
jour où elles divergent, le garde-fou continue de passer sur des chiffres que le jeu ne joue
plus. Le même garde-fou — aucun couple ne doit être un contre absolu, hors les trois transports,
victimes par design — vit maintenant dans `src/domain/combat.test.ts`, et il rejoue les
soixante-quinze couples à travers `resolveEngagement` lui-même, pas à travers une reformulation
de la règle.

### 5. Les portées de détection : placeholders assumés, non simulés

`DETECTION_RANGE_KM` porte une valeur par rôle ; une pile prend le maximum de ses rôles. Ces neuf
valeurs sont `@a-mesurer` et le simulateur ne modélise toujours pas leur effet. La détection ne
déclenche pas mécaniquement une passe : le comportement de l'ordre et la compatibilité du milieu
restent deux portes séparées.

### 6. Désactivation d'avant-poste : `OUTPOST_DISABLED_HOURS` et son immunité

Un raid gagné désactive l'avant-poste pour **`OUTPOST_DISABLED_HOURS` = 6 heures**, suivi d'une
fenêtre d'immunité de **`OUTPOST_IMMUNITY_HOURS` = 3 heures** pendant laquelle il ne peut pas être
redésactivé (`deactivate`, `convex/movements.ts:685`). Ni l'une ni l'autre valeur n'est dans le
design — la fiche 03 dit « temporairement » puis « une fenêtre d'immunité » et s'arrête là. Les
deux sont des placeholders dimensionnés pour qu'ensemble ils se lisent : une nuit hors service,
une demi-nuit de répit, sur une saison de 48 h. Sans l'immunité, une désactivation en relais
équivaudrait à une destruction déguisée — ce que le modèle refuse tant que le pillage n'existe pas
(ADR 0004).

### 7. Les munitions se consomment au combat, et nulle part ailleurs

> **Renversé le 25/08/2026** (question 18, option a). Cette section disait l'inverse — facturation
> au recrutement, aucune consommation au combat — et c'est cette version-là qui avait été codée.
> Le texte ci-dessous est la règle en vigueur ; le paragraphe qui suit dit pourquoi elle a changé.

Une passe de résolution débite le **stock national** de chaque camp : une munition par tranche de
`STRENGTH_PER_ROUND` = 5 points d'effectif engagé, lue à l'entrée de la passe. Une infanterie MK1
à pleine force dépense donc 10 par engagement. Le recrutement, lui, ne débite plus rien :
`ammunitionLoad` et `INITIAL_AMMUNITION_ENGAGEMENTS` ont disparu du schéma, et `recruitmentCost`
ne rend plus qu'un prix en alliage et en minutes.

`DRY_AMMUNITION_FACTOR` = **0,60** est réinstallé dans `CombatRules` : un camp dont le stock ne
couvre pas la passe frappe à ×0,60 et dépense ce qui lui reste. La sécheresse est une propriété du
**camp**, jamais d'une troupe — le stock est national, et un ordre de distribution des derniers
obus serait une règle inventée ici. Le débit ne refuse jamais un engagement : il se borne à ce que
la nation détient (`Magazine` dans `src/domain/combat.ts`, débit dans `convex/combat.ts`).

Facturer les deux bouts — au recrutement et au combat — était l'ambiguïté du brief d'origine, et
elle se tranche par une seule facturation. Le 18/08 avait choisi le recrutement ; le 25/08 choisit
**le tir**, parce que c'est le bout qui se répète. Une facture unique payée à la formation fait
des munitions une taxe de production que l'on paie une fois et que l'on oublie ; payée au tir,
elle fait une nation qui doit alimenter sa guerre. C'est aussi la seule version où le stock
national, l'arsenal et le dépôt qui explose décident de quelque chose.

**Conséquence chiffrée et assumée** : l'infanterie retombe à ses 18 d'alliage réels, et les deux
`startingAmmunition` (140 et 80) perdent leur justification — ils avaient été dimensionnés contre
la facture de recrutement. Les nombres survivent inchangés, leur calibrage non ; le simulateur ne
peut pas le refaire, il ne modélise aucun combat.

## Justification

**Zéro écran, peu de chiffres inventés.** Chacune des règles de résolution ci-dessus se lit sans introduire un
paramètre supplémentaire dans le modèle : la cible est toujours « la meilleure part atteignable »,
la victoire est toujours « plus rien en face », l'excès est toujours perdu plutôt que réparti
selon une formule à choisir. Le seul endroit où un chiffre est posé sans mesure, c'est là où le
design lui-même n'en fournit aucun — les portées de détection et les durées de désactivation — et
ces endroits sont marqués comme tels dans le code, pas seulement ici.

**Le déterminisme reste total.** Aucune étape ne tire un nombre aléatoire ; l'ordre de frappe,
la cible et le montant des pertes sont une fonction pure de l'état des deux camps et de la table
(ADR 0008). L'issue d'un engagement est prévisible avant de l'ordonner, ce qui reste la qualité
stratégique recherchée par l'ADR 0014.

**Une seule table, un seul garde-fou.** Le retrait de `verif-chiffrage.mjs` n'est pas un
nettoyage cosmétique : une copie de table est un mensonge en sursis, et le remplacer par un test
qui rejoue la vraie fonction de résolution est la seule version qui ne peut pas mentir.

## Conséquences

- **La divergence entre la fiche 08 et le code est refermée, dans l'autre sens** (25/08). Cette
  ADR gravait l'inverse de ce que disaient les §5 et §7 de la fiche ; la question 18 a tranché
  pour la fiche, et c'est le code qui a bougé. La fiche 08 §7 est réécrite avec la date, le
  chiffrage §4 et §5 étaient déjà justes et n'ont pas été touchés.
- **Les portées par rôle restent à mesurer.** Rien dans cette ADR ne les calibre ; elle se
  contente de nommer leur nature de placeholder pour qu'elles ne soient pas lues comme des
  valeurs de design.
- **`src/domain/combat.test.ts` est désormais l'unique garde-fou anti-contre-absolu.** Toute
  future modification de `DAMAGE_TABLE` doit repasser ses soixante-quinze cas ; il n'y a plus de
  seconde copie à mettre à jour en parallèle.
- **L'absence d'écran/fodder est une contrainte pour toute future mécanique de formation ou de
  garde.** Une proposition qui laisserait une troupe en protéger une autre pendant une passe
  contredirait cette ADR et devrait la réviser explicitement, pas la contourner dans une fonction
  voisine.

## Ce qu'on abandonne

- **La facturation des munitions au recrutement** — `ammunitionLoad`,
  `INITIAL_AMMUNITION_ENGAGEMENTS`, et la composante munitions de `recruitmentCost`. Une seule
  facturation subsiste, et c'est la passe de résolution qui la paie (25/08 ; le 18/08 avait
  abandonné l'inverse, avec le modificateur « à sec » qui est réinstallé avec elle).
- **`verif-chiffrage.mjs` et l'idée d'une seconde table de vérification.** Le garde-fou vit dans
  le domaine testé, pas dans une copie externe.
- **Tout écran ou fodder tactique.** Chaque troupe encaisse pour elle-même ; le plafond de
  troupes est le seul frein à l'empilement.
- **Le débordement des dégâts d'une cible à l'autre.** Une frappe en excès est un tir perdu, pas
  un crédit reporté.
