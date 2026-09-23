# 04-generateurs-de-grille — `generate-grid.mjs` et `generate-region-grid.mjs` chargent de nouveau le domaine, et `generate-world.mjs` va au bout

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `scripts/generate-grid.mjs` (en-tête ~9-11, import ~17), `scripts/generate-region-grid.mjs`
(imports ~19-21, commentaire ~171-175), `scripts/generate-world.mjs` (~162-168, la chaîne par
`await import`), `src/domain/routing.ts:1` (import de valeur depuis `./geo`),
`src/domain/region-raster.ts` (~1-4, même forme), `convex/invariants.test.ts` (messages de
réparation ~309, ~326, ~346, ~442), `tsconfig.json` (`verbatimModuleSyntax`).

## Pourquoi

Depuis be9fcd5 (17/09), `src/domain/routing.ts:1` importe une **valeur** (`distanceKm`) depuis
`'./geo'`, sans extension ; c'était un `import type`, effacé. Les deux générateurs chargent
`routing.ts` par le seul retrait des types de Node, dont le résolveur ESM refuse un chemin sans
extension (`ERR_MODULE_NOT_FOUND … src/domain/geo imported from …/routing.ts`, Node 24.19).
`generate-world.mjs` écrit `public/world.json` **puis** plante à l'étape chaînée (~164) : l'état
périmé que l'égalité octet à octet de `invariants.test.ts` refuse, et dont les messages (~326,
~442) renvoient à la commande cassée. `generate-region-grid.mjs` contournait déjà le piège pour
`region-raster.ts` (~171-175) en recopiant le calcul de cellule. La tâche n'est pas rare :
`grid.json` a été recuit trois fois du 11 au 16/09 (1adb0f3, 98a55ac, 6a3bb8c).

## Ce qui change

1. `scripts/lib/import-ts.mjs` (à créer) exporte `importTs(specifier, parentUrl)`. Au premier
   appel, il installe par `module.registerHooks` (synchrone, dans le même fil) un crochet
   `resolve` : un spécificateur relatif **sans extension**, importé depuis un fichier `.ts`, se
   résout en `spécificateur + '.ts'`. Il rend ensuite `import(new URL(specifier, parentUrl).href)`.
   Rien de plus : ni `index.ts` de dossier, ni alias `@/`.
2. **Décision : ce crochet, pas esbuild ni jiti.** Ni jiti (transitive de `@tailwindcss/node`,
   `@tanstack/router-generator` et `knip`) ni l'esbuild de `node_modules/convex` (`mesure-isolat.mjs`
   ~37) ne sont des dépendances déclarées, et esbuild ajoute un bundle intermédiaire. Avec le
   crochet, Node exécute la source telle quelle et `buildGrid` reste la référence importée ;
   `verbatimModuleSyntax: true` garantit que tout import de type est marqué, donc effacé. Vérifié à
   la rédaction sur une copie : sorties identiques, grille 0,13 s, raster 14,5 s, aucun avertissement.
3. Un module TS se charge par `await importTs(…)`, **jamais par un `import` statique** : ceux-ci
   sont résolus avant que le corps du script s'exécute, donc avant le crochet. Le helper, lui,
   s'importe statiquement. Son commentaire le dit en une phrase ; sans `module.registerHooks`
   (Node < 22.15, le node 19 hors nvm), il lève une erreur qui nomme la version requise.
4. `generate-grid.mjs` : `const { buildGrid, encodeGrid } = await importTs('../src/domain/routing.ts', import.meta.url);`
   à la place de l'import ~17. L'en-tête (~10-11) nomme `scripts/lib/import-ts.mjs`.
5. `generate-region-grid.mjs` : même traitement pour `region-crossing.ts` et `routing.ts`. La
   phrase ~171-173 affirme que « ce script ne peut pas charger `region-raster.ts` » : elle devient
   fausse. La réécrire : le calcul recopie `cellAtPlanePoint`, et `invariants.test.ts` referme la
   boucle. Le calcul, lui, ne bouge pas.
6. Le style d'import du domaine ne change pas (sans extension partout). Aucun fichier de `src/`
   n'est touché.

## Ce que ce prompt ne fait pas

- Pas de commande npm pour les générateurs (49), ni de contrôle qui les rejoue au vérifieur (50).
  Les messages de `invariants.test.ts` ne sont pas réécrits : après ce prompt, leurs commandes
  marchent (cas 4).
- Ni le calcul recopié de `generate-region-grid.mjs` (~177-187), que `cellAtPlanePoint` remplacerait
  (lui replie `x` modulo la largeur : sortie à revérifier), ni la lecture par regex d'`ids.ts` dans
  `generate-deposits.mjs` (~40-48 ; `ids.ts` n'importe rien, un `import` simple le charge déjà, et
  le commentaire ~40-41 dit le contraire) : du rangement, un autre commit, en « À trancher ».
- `public/` du dépôt n'est jamais écrit : toute recuisson se fait dans un dossier temporaire.

## Cas d'acceptation (tests d'abord)

1. `scripts/lib/import-ts.test.mjs` (à créer), dans le projet vitest `front`, lance un `node`
   enfant (`process.execPath`). L'enfant charge `src/domain/routing.ts` et
   `src/domain/region-raster.ts` par `importTs` et imprime `typeof buildGrid` et `typeof cellAt`.
   Le test exige `function` deux fois et un code de sortie 0. Écrit avant le helper, il échoue.
2. Dans un dossier temporaire hors du dépôt (`mktemp -d`), avec `public/regions.json` et
   `public/region-index.json` copiés **sous `public/`** (les scripts lisent et écrivent relativement
   au `cwd`), `node <dépôt>/scripts/generate-world.mjs` va au bout et imprime ses trois comptes
   rendus : monde, grille, raster.
3. Dans ce dossier, `world.json`, `grid.json`, `region-grid.json` et `projection.json` sont
   identiques octet pour octet à ceux du dépôt (`cmp`).
4. Les deux commandes que nomment les messages de `convex/invariants.test.ts`, lancées depuis ce
   dossier, finissent sans erreur : `generate-region-grid.mjs` (~309, ~326, ~346) et
   `generate-grid.mjs` (~442).
5. `git status --short public/ src/` est vide.

## Vérifications

- `npx vitest run scripts/lib/import-ts.test.mjs` : vert.
- La séquence des cas 2 à 4 (`mktemp -d`, `cp`, `node`, `cmp`) : quatre `cmp` silencieux.
- `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus :

- les durées de `generate-grid.mjs` et `generate-region-grid.mjs` rejoués, les quatre `cmp`, la
  version de Node et l'avertissement de `registerHooks` s'il en paraît un ;
- en « À trancher », les deux contournements laissés en place (ci-dessus), avec une recommandation.
