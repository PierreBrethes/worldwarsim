# 01-depeche-objectif-revele — la dépêche « objectif révélé » nomme sa région, et plus aucun cast ne cache la forme d'une dépêche

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `convex/view.ts` (le champ `notices` de `playerView` ~923, `notDecoyNotice` ~1054,
`named()` ~1065), `convex/validators.ts` (`NOTICE` ~217 : `constructionCancelled` ~222,
`objectiveRevealed` ~494, `objectiveTaken` ~503), `src/domain/player-view.ts` (`Notice` ~605 :
~607, ~823, ~830), `src/data/serverView.ts` (~171, le cast ; `workName` ~18),
`src/domain/journal.ts` (`written()` ~137, cases ~143 et ~493), `convex/constructions.ts`
(`refundHead` ~507), `convex/objectives.test.ts` (`noticesOf` ~84 ; ~363, `commit` pose un
objectif et sa dépêche à un lieu choisi, sans l'action de pose).

## Pourquoi

Depuis be9fcd5 (17/09), chaque siège lit au lancement des dépêches comme « convoi immobilisé —
undefined, Pologne. ». `objectiveRevealed` est stocké avec `regionId`. `named()` n'a pas de case pour lui
et le rend tel quel (`default: return notice`), alors que le journal lit `notice.regionName`
(journal.ts ~500). `named()` promet qu'un kind ajouté « casse la compilation ici » ; le cast
`(server.notices ?? []) as ReadonlyArray<Notice>` de serverView.ts ~171 l'en empêche, et
objectives.test.ts ~313 compte les dépêches sans lire leur forme servie.

Une sonde tsc du 23/09 a comparé la forme servie à `Notice`, kind par kind. Elle trouve trois
écarts de forme, pas un seul :
- `objectiveRevealed` n'a pas de `regionName` : c'est le bug visible ;
- `objectiveTaken` non plus : le journal ne le lit pas, mais le type client ment ;
- pour `constructionCancelled`, le serveur sert `building: BUILD_COST_KEY`, `outpost` compris
  (`refundHead`, dont le commentaire affirme à tort que « le journal sait lire » cette clé), et
  le client déclare `BuildingKey`. Avec `outpost`, journal.ts ~148 passe `undefined`
  (`fr.buildings['outpost']`) à `lowerFirst` (fr.ts ~52) : la TypeError fait tomber le plateau.

Et un reste de typage : le type servi garde les trois `decoy*`, parce que `named()` prend
`Doc<'notices'>` entier et que son `default` les rend malgré le filtre.

## Ce qui change

1. `convex/view.ts` : `notDecoyNotice` devient un vrai type guard,
   `` notice is Exclude<T, { readonly kind: `decoy${string}` }> ``. `named()` prend ce type filtré
   (un alias local `Exclude<Doc<'notices'>, …>`), et son `default` ne sert plus de `decoy*`
   (forme validée par tsc sur une union factice).
2. `named()` : `objectiveRevealed` et `objectiveTaken` rejoignent la branche
   `{ ...notice, regionName: nameOf(notice.regionId) }`.
3. `src/data/serverView.ts` ~171 : le cast disparaît et il reste `server.notices ?? []`. `Notice`
   quitte l'import s'il n'y sert plus.
4. `src/domain/player-view.ts` déclare `building: BuildCostKey` pour `constructionCancelled`.
   `journal.ts` nomme la clé `outpost` par `fr.garrison.raiseWork` (le mot de `workName`) et un
   bâtiment par `fr.buildings`. `isOutpostWork` (`src/domain/ids.ts` ~126) départage les deux.
5. Tout autre écart que tsc révèle au retrait du cast se corrige dans le même sens : le client
   déclare ce que le serveur sert. Chaque écart se liste au rapport. Le commentaire de `named()`
   est réécrit pour dire vrai : un kind oublié casse désormais la compilation dans serverView.ts.

Le nom se calcule **à la lecture**, dans `playerView`, et la base garde `regionId` : les dépêches
déjà écrites se liront justes dès le déploiement, sans migration ni wipe ni champ de schéma.

## Ce que ce prompt ne fait pas

- Le kind inconnu d'un vieux bundle (le `default` de `written()`) : c'est 02. Le test de bout en
  bout serveur → adaptateur → journal : c'est 53.
- Les autres casts de serverView.ts (~62, ~97, ~110, ~219) et ses `?? défaut` « version en
  retard » : on n'y touche pas.
- Le chemin qui écrit `constructionCancelled` avec `outpost` reste en l'état (« À trancher »).
  `raiseOutpost` (constructions.ts ~197) accepte un point en chantier, et `collapseIfAbandoned`
  (convex/outposts.ts ~100) le supprime sans annuler son élévation en file, là où
  `cancelRaisesOf` (~250) l'annule.

## Cas d'acceptation (tests d'abord)

1. `convex/objectives.test.ts`, cas nouveau : après `internal.objectives.commit` sur
   `{ key: 'abandonedStores', regionId: HAINAUT }`, la dépêche `objectiveRevealed` que sert
   `api.view.playerView` porte `regionName === regionFacts(HAINAUT)!.name`. Rouge avant.
2. Même fichier : la dépêche `objectiveTaken` servie après la prise (cas ~497, « reduces the
   garrison… ») porte le `regionName` du Hainaut. Rouge avant.
3. `src/domain/journal.test.ts` : un `constructionCancelled` avec `building: 'outpost'` ne lève
   pas. Son texte contient `fr.garrison.raiseWork` et pas `undefined`. Le cas est rouge avant le
   correctif (TypeError).
4. `git grep -n "as ReadonlyArray<Notice>" -- src` ne rend rien.
5. Contre-épreuve : retirer temporairement `'objectiveRevealed'` de la branche de `named()` fait
   échouer `npm run types` sur serverView.ts. Remettre la ligne ensuite.

## Vérifications

- `npx vitest run convex/objectives.test.ts src/domain/journal.test.ts` : vert, nouveaux cas
  compris. `npm run types` : vert, sans cast. `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : les écarts signalés par tsc au retrait du cast (trois
attendus, plus les `decoy*` si la garde ne suffit pas), avec la correction de chacun ; le
résultat de la contre-épreuve 5 ; en « À trancher », le chemin `raiseOutpost` →
`collapseIfAbandoned`.
