# 53-test-adaptateur-vue — `adaptServerView` testé sur une vraie vue servie

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 01, 02.

**À lire :** `src/data/serverView.ts` (en entier, 338 lignes : `adaptServerView` ~30, le throw
~35, `asArc` ~198, `asLocalWindow` ~234, `asDetectedArc` ~268), `convex/invariants.test.ts`
(import de `public/world.json` ~20, `worldOf` ~174), `convex/seats.fixture.ts` (`placeHq`,
`attacking`), `convex/movements.test.ts` (~999, l'engagement le plus court),
`convex/notices.test.ts` (~144, `marchTo`), `convex/detection.test.ts` (`launchedSeason` ~70,
`moving` ~164, `sentry` ~747, `watchedMarch` ~753), `convex/objectives.test.ts` (~363,
`commit`), `convex/seasons.ts` (~460, `place` planifiée au lancement), `src/domain/next-actions.ts`
(`pointOfStation` ~322), `vite.config.ts` (projet vitest `convex` : edge-runtime, alias `@`).

## Pourquoi

`adaptServerView` (seul appelant : plateau.tsx ~350) est la seule traduction de ce que sert
`playerView` vers ce que lit tout le front. Modifié dans 13 des 80 derniers commits (31 en tout),
il n'est appelé par aucun test : `src/data` n'a que `settings.test.ts`. convex-test couvre
`playerView` ; `arcTiming`, `journalDispatches` et rest-window sont testés chacun seul, jamais
composés sur une vraie vue. Or l'adaptateur a sa logique : `enemyDetected` ou `lastKnown` selon
la fenêtre (~285), `progress` bornée (~282), fuseau par `getTimezoneOffset` (~235), throw sur une
nation sans position (~35). Le bug de 01, une dépêche qui s'imprime « undefined », est ce qu'un
tel test voit.

## Ce qui change

Un seul fichier : `convex/view-adapter.test.ts` (à créer), projet vitest `convex` (convex-test,
fixtures de siège). Il recopie `worldOf` et les helpers locaux utiles (`form`, `raise`, `sentry`…).

**Scénario.** Deux sièges (france, ussr), horloge figée (`vi.useFakeTimers`, `setSystemTime`) :
1. lancement, puis un QG par siège (`placeHq`) ;
2. **avant toute avance d'horloge**, une réserve posée par `internal.objectives.commit` sur
   `BEL-2` (Hainaut). L'action `place`, planifiée au lancement, tire ses lieux : posé d'abord,
   `commit` la rend inerte (`placementInput` rend `null`) ; posé après elle, il refuse ;
3. une marche à soi (`api.movements.marchTo`), lue en vol : un arc `mine` ;
4. une colonne adverse relevée, par **un ordre réel** (`marchTo`, `attacking`) et jamais par
   `moving` de detection.test.ts, qui écrit `stationedAt: null`, servi en adresse `home`. Si
   l'observateur ne la relève pas seul, une `sentry` postée **avant** l'ordre : le relevé se
   réévalue au départ d'un mouvement, pas à un `patch`. Lue au milieu de sa fenêtre (la ligne
   `sightings`, comme `watchedMarch`) : `enemyDetected` ; après la fermeture et avant
   `LAST_KNOWN_HOURS` : `lastKnown`. Chaque `vi.advanceTimersByTime` est suivi de
   `await t.finishInProgressScheduledFunctions()`, un ordre réel ayant son arrivée planifiée ;
5. un engagement (motif de movements.test.ts ~999), puis `finishAllScheduledFunctions(vi.runAllTimers)`.

**Lectures.** `adaptServerView(world, await t.query(api.view.playerView, seat))`, pour les deux
sièges, à chaque instant : marche en vol, fenêtre ouverte, fenêtre fermée, après l'engagement.

**Assertions.** Aucune exception. Une boucle ne porte que sur une liste d'abord déclarée non
vide là où le scénario en produit une : troupes et dépêches à chaque instant, arc `mine` en vol
chez celui qui marche, `enemyDetected` puis `lastKnown` chez l'observateur, comptes rendus après
l'engagement.
- Chaque troupe à soi se place sans repli. Une adresse `point` a des coordonnées finies. Une
  adresse `building` vise un bâtiment de `me.buildings` dont la région est dans `me.regions`.
  Une adresse `outpost` vise un point de `me.outposts`. Aucune adresse `home`.
- Un arc `enemyDetected` ou `lastKnown` n'a ni `type`, ni `stack`, ni `troopIds`
  (`not.toHaveProperty`). Chaque arc a une `progress` dans [0, 1].
- Le journal adapté compte au moins `notices.length + reports.length` entrées, et aucun `text` ne
  contient `undefined`, `NaN` ni `[object`. La dépêche `objectiveRevealed` nomme le Hainaut.
- Avec `getTimezoneOffset` espionné à `-120` après `vi.useFakeTimers`, puis restauré,
  `me.restWindow` se lit deux heures après la plage servie en minutes UTC.
- Un monde privé du pays de la nation fait lever `nation without a position`.

Un défaut de l'adaptateur que le test révèle se corrige ici et se nomme. Un défaut du serveur ne
se corrige pas ici : s'arrêter et le rapporter, assertion rouge et sortie à l'appui.

## Ce que ce prompt ne fait pas

- La vue en fixture JSON pour les tests de rendu (55) ; la fixture commune de montage (56, où
  cette suite ne migre pas) ; la liste blanche servie à un adversaire (54).
- Toucher aux `?? défaut` de serverView.ts ou au découpage de `playerView` (73).

## Cas d'acceptation (tests d'abord)

1. `npx vitest run convex/view-adapter.test.ts` passe, avec chaque assertion ci-dessus.
2. Contre-épreuve de 01 : sans `'objectiveRevealed'` dans la branche `regionName` de `named()`
   (convex/view.ts), le test échoue sur « undefined » (vitest ne type pas : c'est bien lui qui
   échoue). Remettre la ligne.
3. Contre-épreuve du brouillard : un `type: 'march'` ajouté à `asDetectedArc` fait échouer le
   test. Le retirer ensuite.

## Vérifications

`npx vitest run convex/view-adapter.test.ts` : vert, durée relevée. `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : la durée du fichier ; par instant lu, les arcs par
état, les dépêches et les comptes rendus ; l'observateur a-t-il relevé seul la colonne, ou par
la sentinelle ; tout défaut de l'adaptateur trouvé ; le résultat des deux contre-épreuves.
