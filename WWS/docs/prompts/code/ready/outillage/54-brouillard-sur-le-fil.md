# 54-brouillard-sur-le-fil — ce que le serveur sert à un adversaire est une liste blanche, et un champ nouveau fait échouer un test

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `convex/view.ts` (`viewOf` ~92, sans type de retour ; l'objet rendu ~338-945 et ses
19 clés de premier niveau ; `lastEdition` ~955 ; `named` ~1065, qui envoie une dépêche entière,
`{ ...notice }` ; `detectedArcs` ~1116-1209 : arc figé ~1146 avec `landCost: undefined`, arc
vivant ~1179), `convex/control.ts` (`heldOf` ~46 : une ligne par siège, `suspended` à son seul
propriétaire), `src/data/serverView.ts` ~21, `CONVENTIONS.md` §8. Les tests existants, à ne pas
toucher : `movements.test.ts` ~3102-3105, `notices.test.ts` ~349-415, `off-season.test.ts`
~378-382 et ~431, `press.test.ts` ~144-160. Pour le montage : `convex/seats.fixture.ts`
(`foundSeat`, `joinSeat`, `placeHq`, `attacking`, `surveyRegion`, `surveyCamp`), le relevé d'une
colonne de `notices.test.ts` ~349, `post`, `plant`, `garrison` de `movements.test.ts` ~261-305,
`plantObjective` ~135 et `commit` ~363 d'`objectives.test.ts`, `advance` de `press.test.ts` ~47.

## Pourquoi

Côté client, le compilateur garantit le brouillard (`PlayerView`, unions discriminées, CONVENTIONS
§8). Sur le fil, rien : le websocket porte le type de retour **inféré** de `viewOf`
(`git grep -n "returns:" -- convex` : rien), et l'adaptateur ignore les champs en trop. Un champ
ajouté par erreur à un arc relevé, un camp, un adversaire ou une dépêche partirait chez
l'adversaire, lisible dans les outils du navigateur, sans erreur. Les tests sont surtout des
listes noires (absence de `type`, `roles`, `troopIds`, `playerId`, `stack`, `doctrine`) ; deux
seuls comparent `Object.keys` : `press.test.ts` ~144-160 (ligne de presse d'un autre) et
`notices.test.ts` ~390 (dépêche `movementSighted`). Ce prompt généralise ce geste. `view.ts` a
changé dans 25 des 80 derniers commits, et 73 découpera `viewOf` : ce test sera son filet.

## Ce qui change

1. `convex/view-shape.test.ts` (à créer), projet `convex`, montage local (la fixture de 56 vient
   après). Deux sièges, A (france) et B (ussr), QG posés, horloge simulée à midi UTC (`Date.UTC`).
   Passe par le chemin réel quand un helper existe ; sinon, écris la ligne à la main, conforme au
   schéma, comme `surveyRegion` et `surveyCamp`. Ne contourne jamais `view.ts`. B relève de A une colonne en marche (arc **vivant**) puis la même,
   mouvement fini (arc **figé**) ; une troupe posée (un camp) ; un avant-poste (sa garnison en
   camp, sa zone dans `control.held`) ; une installation (`surveyRegion`) ; une caisse
   (`lootCrateSightings`) ; un objectif neutre, posé par `internal.objectives.commit` **avant
   toute avance d'horloge** (piège décrit par 53 : l'action `place`, planifiée au lancement, le
   refuserait ensuite) ; une édition de presse (`advance` de 3 h). Enfin, A attaque le camp relevé
   de B (`attacking`) : comptes rendus et dépêches de la passe.
2. Un collecteur `keyPathsOf` produit des chemins pointés, un par clé (objet, tableau ou feuille ;
   `null` est une feuille), avec `[]` pour un tableau et l'union sur tous ses éléments. Il regroupe
   les dépêches par `kind` (`notices[movementSighted].headingDegrees`). Il lit **la forme du
   fil** : `convexToJson(vue)` (`convex/values`) retire les champs `undefined`, comme le
   websocket ; un objet dont les clés commencent par `$` (`$float` d'un `-0` ou d'un `NaN`,
   `$integer`) y encode un scalaire et compte comme une feuille.
3. Une liste blanche versionnée dans le test, `SERVED_ABOUT_OTHERS`, par section : `detected`,
   `camps`, `opponents`, `objectives`, `surveyedInstallations`, `lootSightings`, `press.others`,
   `season.reduction.standings`, `reports`, `warEntries`, `notices` (par `kind`),
   `me.founderAbsence`, et les lignes des autres sièges dans `control.held`. En tête, le
   commentaire « information servie à un adversaire, ADR 0005 — un chemin ajouté ici est une
   décision, que le message de commit dit ». La comparaison est exacte, chemins triés, sur l'union
   des vues prises pendant la marche, après sa fin, après la passe et après l'édition.
4. Les 19 clés de premier niveau sont figées elles aussi, chacune rangée « à soi » ou « sur
   autrui ». Une section nouvelle échoue tant que personne ne l'a rangée.
5. Chaque section de la liste doit être **non vide** dans le scénario : une comparaison sur une
   section vide ne prouve rien. Une section trop coûteuse à peupler va dans une constante
   `NOT_COVERED` commentée. Candidates probables : `warEntries`, qui demande une entrée en guerre
   tardive, et `me.founderAbsence`, qui demande un fondateur près du seuil.
6. `CONVENTIONS.md` §8 : après « garanti par le compilateur », une phrase dit que sur le fil, la
   forme servie à un adversaire est une liste blanche (`convex/view-shape.test.ts`).

## Ce que ce prompt ne fait pas

- Aucun champ servi n'est retiré, renommé ou modifié, même douteux : le test fige l'existant et
  le signale ; changer `view.ts` est un autre commit. Les listes noires restent. Ni validateur
  `returns:` ni type de retour sur `viewOf`, dont le découpage revient à 73.
- La forme seulement : aucune **valeur** n'est jugée (une durée, une heure, un compte qui
  trahirait). `lootRumors.list`, une seule liste pour toute la saison, est hors du test.

## Cas d'acceptation (tests d'abord)

1. `npx vitest run convex/view-shape.test.ts` : vert, « non vide » sur chaque section couverte.
2. Le test mord. Avec `ownerId: camp.ownerId` ajouté temporairement aux camps servis (`view.ts`,
   `camps`), il échoue en nommant `camps[].ownerId`. Même chose avec `nation` sur l'arc vivant.
   Une fois les deux retirés : vert.
3. Une clé de premier niveau ajoutée temporairement à la vue fait échouer le contrôle des 19 clés
   (point 4 de « Ce qui change »).
4. `git diff --stat` : `convex/view-shape.test.ts` et `CONVENTIONS.md`, rien d'autre.

## Vérifications

`npx vitest run convex/view-shape.test.ts` (durée relevée), puis `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : le nombre de chemins par section ; les sections
`NOT_COVERED` et pourquoi ; la durée du test. En « À trancher » : chaque chemin servi à un
adversaire que ni un commentaire de `view.ts` ni un ADR ne justifie, avec une recommandation (par
exemple `landCost`, que porte l'arc vivant et pas l'arc figé).
