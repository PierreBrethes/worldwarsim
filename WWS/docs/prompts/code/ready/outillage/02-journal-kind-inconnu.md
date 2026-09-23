# 02-journal-kind-inconnu — un onglet resté ouvert ignore une dépêche qu'il ne connaît pas au lieu de planter

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `src/domain/journal.ts` (`journalDispatches` ~51, `notices.map(written)` ~103, le
tri ~107, `written()` ~137 : un switch sans `default`), `src/domain/journal.test.ts` (la forme
des cas, `finished()` ~33), `.github/workflows/ci.yml` (~32-40 : les fonctions d'abord, le front
ensuite), `src/main.tsx` (~26 : il ne recharge que sur `vite:preloadError`),
`src/routes/plateau.tsx` (`BoardError` ~307), et pour l'inventaire `src/domain/labels.ts`
(`missionLabel` ~807), `src/domain/troops.ts` (`stationKeyOf` ~151), `src/i18n/fr.ts`
(`lowerFirst` ~52 et ses appelants).

## Pourquoi

ci.yml déploie les fonctions, puis reconstruit le front. Les onglets déjà ouverts gardent
l'ancien bundle bien après la fin du déploiement (un jeu asynchrone reste ouvert des jours), et
Convex leur pousse en direct les dépêches des nouvelles fonctions. `written()` n'a pas de `default` : sur
un kind qu'il ne connaît pas, il rend `undefined`, et le tri lit `b.at`. L'audit l'a rejoué avec
`journalDispatches([], null, [], [{ kind: 'someFutureKind', at }])`, qui lève
`TypeError: Cannot read properties of undefined (reading 'at')`. Le plateau tombe alors dans
`BoardError`, puis `ErrorScreen`. « Réessayer » rejoue le même bundle, et rien ne recharge sur
une version nouvelle : main.tsx ne réagit qu'à un chunk introuvable. Un lot qui ajoute une
dépêche (03b6dff, 2e2da13, 078feb0) met donc à terre chaque onglet ouvert au moment du
déploiement, jusqu'à ce que le joueur recharge à la main.

## Ce qui change

1. `written(notice: Notice): Written | null`. Les cases ne bougent pas. Un `default` écrit
   `notice satisfies never;` puis `return null;`. L'exhaustivité tient donc toujours à la
   compilation : un kind ajouté à `Notice` sans son case ne compile pas. On n'emploie pas
   `const _exhaustive: never = notice` : essayé sur la config du dépôt, `noUnusedLocals` le
   refuse (TS6133). `satisfies never` passe tsc et eslint.
2. `journalDispatches` écarte les `null` avant le tri, par un `flatMap` ou un filtre typé.
3. Au `default`, un commentaire d'une ou deux lignes dit **pourquoi** : l'ancien bundle reçoit les
   dépêches des nouvelles fonctions, dans l'ordre de ci.yml.
4. Inventaire des lectures du client qui lèveraient sur une valeur servie inconnue. Point de
   départ vérifié :
   - `missionLabel` (labels.ts ~807) fait un switch sans `default` sur `mission.kind`, servi par
     convex/view.ts ~769. Il rend `undefined` comme texte de ligne ;
   - `stationKeyOf` (troops.ts ~151) lit `station.kind`, servi par view.ts ~209. Il rend
     `undefined` comme clé ;
   - les lectures `fr.X[clé servie]` passées à `lowerFirst` (fr.ts ~1674 `fromChain`, qu'appelle
     EconomyWindow.tsx ~651 avec `source.by` ; `noBuilding` ~2468, `theBuilding` ~2473,
     `aBuilding` ~2481, selon que leurs appelants passent une clé servie ou calculée : par
     exemple `theBuilding(site.key)` ~1226, `aBuilding(entry.producedBy)` de SiteModal ~466).
     `lowerFirst(undefined)` lève. Le ~1024 (`constructionCancelled`) relève de 01 ;
   - les autres `switch` de `src/` (compass-rose ~956, movement-orders ~288/~403/~524,
     FoundationRows ~197, ConstructionPanel ~420, fr.ts ~2429/~2450, labels ~458, plateau.tsx
     ~691/~1724) portent a priori sur des valeurs que le client calcule. À confirmer.
   Les comptes rendus d'engagement passent par `fromCombat`, sans switch, et les frappes ne sont
   pas servies (view-budget.test.ts ~229). Corriger ce qui **lève** (une TypeError au rendu ou
   dans l'adaptateur), avec un test pour chaque correction. La correction se fait là où la clé
   servie est lue, en retombant sur la clé brute (`fr.buildings[key] ?? key`, la forme de
   `workName`, serverView.ts ~18) ; `lowerFirst` garde sa signature `string`. Ce qui affiche
   seulement un blanc ou « undefined » se liste au rapport, sans correction.

## Ce que ce prompt ne fait pas

- Proposer le rechargement quand une version sort : c'est 64.
- La forme des dépêches connues (`regionName` des objectifs, `constructionCancelled` d'une
  élévation d'avant-poste) : c'est 01. Si 01 n'est pas encore passé, ne pas y toucher.
- Les `?? défaut` « version en retard » de serverView.ts : ils protègent l'autre sens (un front
  neuf face à un backend ancien). On n'y touche pas.

## Cas d'acceptation (tests d'abord)

1. `src/domain/journal.test.ts`, cas « un kind inconnu est ignoré, pas levé » :
   `journalDispatches([], null, [], [inconnu, finished(NOON - HOUR)])` ne lève pas, et rend une
   seule dépêche, celle de `finished`. Le premier élément est forcé par `as unknown as Notice`.
   Ce cas est rouge avant le correctif.
2. Contre-épreuve : retirer temporairement un case de `written()` fait échouer `npm run types` sur
   la ligne `satisfies never`. Remettre le case ensuite.
3. Chaque lecture corrigée au point 4 a un test qui lui passe une valeur inconnue et vérifie
   qu'elle ne lève pas.

## Vérifications

- `npx vitest run src/domain/journal.test.ts` : vert, nouveau cas compris, avec les fichiers de
  test des lectures corrigées.
- `npm run types` : vert.
- `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus :
- le tableau de l'inventaire : fichier ~ligne, valeur servie lue, verdict (lève, affiche mal, sans
  objet), corrigé ou non ;
- le résultat de la contre-épreuve 2.
