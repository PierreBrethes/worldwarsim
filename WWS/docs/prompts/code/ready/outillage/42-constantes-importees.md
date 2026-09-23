# 42-constantes-importees — Les cinq recopies relevées entre `convex/`, `src/` et `fr.ts` sont importées, et un test refuse qu'une constante de `convex/constants.ts` soit redéfinie

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `src/routes/salon.tsx` (~520-535), `convex/constants.ts` (`REST_WINDOW_MINUTES` ~830,
`restWindowFrom` ~835), `src/domain/loot.ts` (~22), `convex/cargo.ts` (imports ~1-12, ~53),
`convex/lootCrates.ts` (~1-18), `convex/routes.ts` (~15-48 et les cinq `decodeGrid`),
`convex/regionGeometry.ts` (~17-45), `src/i18n/fr.ts` (~2551-2571 ; appelants ~371, ~392, ~428,
~470, ~2315), `src/domain/journal.ts` (imports ~1-8, ~556-559), `src/domain/nations.ts` (`isNation`
~71), `convex/invariants.test.ts` (~105-145 : lecture des sources, budget d'import).

## Pourquoi

La règle affichée est « importée, jamais recopiée ». Cinq recopies y dérogent, dont une constante
d'équilibrage, et rien ne le voit :
- `salon.tsx` ~525-527 : `/** Mirrors restWindowFrom on the server */ const REST_WINDOW_MINUTES =
  7 * 60;`, face à `convex/constants.ts` ~830. Pourtant, 11 modules de `src/` importent déjà
  `convex/constants` (17 avec les tests), dont `EconomyWindow.tsx` pour cette même constante.
- `emptyAmounts` existe en trois exemplaires identiques : `src/domain/loot.ts` ~22,
  `convex/cargo.ts` ~53 et `convex/lootCrates.ts` ~16.
- Le faux monde `{ sphere, outline, countries: [] } as unknown as World` est écrit deux fois :
  `convex/routes.ts` ~44-48 et `convex/regionGeometry.ts` ~37-41.
- Dans `fr.ts`, `homeSlotRelief` (~2557) et `slotRelief` (~2562) ont le même corps. `nationName`
  est défini deux fois, dans `fr.ts` ~2569 et `journal.ts` ~558, et répond pareil pour toute chaîne.
- Relevé du 23/09 : `convex/constants.ts` exporte 74 noms en capitales, et un seul est redéfini
  dans `src/` et `convex/`, celui du salon.

## Ce qui change

Rangement pur, aucun changement de comportement.
1. `salon.tsx` : `endOf` rend `restWindowFrom(startMinutes).endMinutes`, importé de
   `convex/constants` comme dans `EconomyWindow.tsx`. La constante locale et son commentaire
   « Mirrors » disparaissent : on importe la fonction que ce commentaire disait recopier.
2. `src/domain/loot.ts` exporte `emptyAmounts`. `cargo.ts` et `lootCrates.ts` l'importent et
   perdent leur copie, ainsi que les imports devenus inutiles.
3. `convex/projectionWorld.ts` (à créer) exporte `projectionWorld(): World`, mémoïsé
   (`world ??= …`). C'est le seul module de `convex/` qui importe `public/projection.json`.
   `routes.ts` (cinq `decodeGrid`) et `regionGeometry.ts` (`rasterOf`) l'appellent au décodage et
   perdent leur `projectionAsset` et leur `import type { World }`.
   - Nom en camelCase (`invariants.test.ts` ~105-130), et aucun travail à l'import (~144).
   - Replier les cinq `grid ??=` en un seul n'est pas demandé.
4. `fr.ts` ne garde que `slotRelief`, pour les trois appelants (`SITE_SLOTS_FULL` ~428,
   `MOVEMENT_IN_FLIGHT` ~470, `heldBySite` ~2315). Son commentaire nomme les deux plafonds et
   l'origine de leurs nombres :
   - `homeSlotReliefOf`, `convex/constructions.ts` ~705 (servi en `me.homeSlotRelief`) ;
   - `movementSlots`, via `slotRelief` de `convex/movement/orders.ts` ~436.
   Le nom `homeSlotRelief` reste au champ servi et au type.
5. `fr.ts` exporte le seul `nationName` :
   `(value: unknown): string => isNation(value) ? fr.nations[value] : str(value)`.
   - `isNation` remplace `value in fr.nations`, sans cast. La réponse est la même pour toute
     nation et toute chaîne ordinaire ; seules différaient les clés héritées d'`Object`
     (`'constructor'`), qu'aucune charge utile ne porte.
   - `journal.ts` perd sa copie et son import d'`isNation`, et importe celui de `../i18n/fr`.
6. `convex/invariants.test.ts` reçoit un `describe` (« les constantes de convex/constants.ts ne se
   recopient pas »). Il lit les noms `/^export const ([A-Z][A-Z0-9_]*)\b/gm` de `constants.ts` (en
   garde : la liste contient `REST_WINDOW_MINUTES` et `BASE_CAP`).
   - Il parcourt récursivement les `.ts`/`.tsx` de `src/` et `convex/`, hors `convex/constants.ts`,
     `_generated/` et `*.test.ts(x)`, et y refuse `\bconst\s+<NOM>\b\s*[:=]`.
   - L'échec liste `fichier:ligne NOM` et dit : importer depuis `convex/constants.ts`.

## Ce que ce prompt ne fait pas

Le miroir du simulateur (`WWS/simulation/opening/constants.mjs`) est une copie voulue, gardée par
`verify.mjs` (51, 52). Restent aussi en place : les neuf paires de dix lignes identiques relevées
par l'audit, `nationLabel` (fr.ts ~2519, repli « sans nation ») et les faux mondes des tests. Ni
knip (37), ni ESLint (34).

## Cas d'acceptation (tests d'abord)

1. Écrit avant les corrections, le test est rouge et ne nomme que `REST_WINDOW_MINUTES` dans
   `src/routes/salon.tsx` (~526). Il passe au vert après le point 1.
2. Mutation `const BASE_CAP = 400;` dans `src/domain/economy.ts` : le test retombe et nomme ce
   fichier. Retirer la mutation.
3. `git grep -n "const emptyAmounts" -- src convex`, `git grep -n "const nationName" -- src` et
   `git grep -n "as unknown as World" -- convex ':!*.test.ts'` rendent chacun une ligne : `loot.ts`,
   `fr.ts`, `projectionWorld.ts`. `git grep -n "homeSlotRelief(" -- src/i18n/fr.ts` ne rend rien.
4. `src/i18n/site-slots-relief.test.ts`, `src/domain/journal.test.ts` et `convex/routes.test.ts`
   passent sans modification.

## Vérifications

`npx vitest run convex/invariants.test.ts convex/routes.test.ts src/i18n src/domain/journal.test.ts
src/domain/loot.test.ts`, puis `npm run verifier` : verts. Donner le nombre de tests et la durée
du test d'import.

## Rapport attendu

Format commun (README de la série), plus : la sortie rouge du cas 1 ; les fichiers touchés, point
par point ; toute autre recopie croisée en route, signalée sans être corrigée.
