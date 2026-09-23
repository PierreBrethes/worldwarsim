# 37-knip-configure — `knip.jsonc` décrit le dépôt, `npm run knip` sort en 0 sans rien signaler, et le vérifieur le lance avant les tests

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 13, 14, 35.

**À lire :** `package.json` (`knip` ~15, `verifier` tel que 13 l'a laissé), dans
`node_modules/knip/dist/` : `plugins/convex/index.js` (`convex/**` en entrées, sans configuration),
`plugins/tanstack-router/index.js` (son entrée, `src/routeTree.gen.ts`, est gitignorée donc non lue),
`util/tag.js` ~20 (`@public`), `constants.js` ~5 (`knip.jsonc`) ; `src/domain/region-crossing.ts`
~62-122, `src/domain/region-raster.ts` ~59-90 et `firstRegionEntry` ~264,
`scripts/generate-region-grid.mjs` ~143, `src/domain/interception.ts` ~137-147 (bannière modèle),
`WWS/simulation/opening/verify.mjs` ~17, `constants.mjs` ~243-249 et ~287, `scenarios.mjs` ~132.

## Pourquoi
1015758 (18/08) a remplacé ts-prune, depcheck et madge par knip, sans configuration. `npx knip`
sort en 1 avec 122 lignes à la rédaction (127 à l'audit) : 18 « fichiers inutilisés » (générateurs,
simulateur, `WWS/docs/_to_delete/`, `WWS/maquettes/`), 9 dépendances en faux positifs, 62 exports
et 24 types. Personne ne le lance, et le code mort part par des commits ponctuels (122d8dc,
ca52b7e, 2b74301, 6a9596f). La configuration ci-dessous, essayée (1,1 s), ne laisse que de vrais
constats :
- deux fonctions orphelines depuis 3603912 (12/09, la carte lue sur le raster), qu'a remplacées
  `firstRegionEntry` : `firstEntryInRegion` (~67) et `pointOnRegionBoundary` (~100) ;
- `encodeRegionRaster` (~61), que le générateur doublonne (`runsOf` ~143) ;
- quatre exports du simulateur sans lecteur : trois copies du miroir que `verify.mjs` (qui lit
  `constants.mjs` par `import * as mirror`) ne nomme pas, `TROOP_CAP_PER_BILLETS_LEVEL` ~246,
  `REST_WINDOW_MINUTES` ~249 et `nominalStrength` ~287, plus `scenario48h` (`scenarios.mjs` ~132).

## Ce qui change
1. `knip.jsonc` (à créer), avec des commentaires pour que chaque exception porte son pourquoi :
   - `entry` : `scripts/*.mjs`, `WWS/simulation/opening/{run,verify,army}.mjs`, `src/routes/*.tsx`.
     **Décision : `*` et non `**`.** Un fichier d'entrée a ses exports exemptés, et `**` y ferait
     entrer les composants de `-plateau/`, qui ne seraient plus vérifiés. Vérifié : même résultat
     aujourd'hui, `-plateau/` compris.
   - `project` : `src/**/*.{ts,tsx,css}`, `convex/**/*.ts`, `scripts/**/*.mjs`,
     `WWS/simulation/opening/**/*.mjs`. **Décision : `css` inclus**, sans quoi knip imprime
     l'indice « Compiled extension excluded by project ». `tailwindcss` n'est signalé ni avec ni
     sans (vérifié) : contrairement à l'audit, il ne va pas dans `ignoreDependencies`.
   - `ignoreDependencies` : `react-compiler-runtime`, injecté par `reactCompilerPreset`
     (`vite.config.ts` ~15), et `world-atlas`, lu par un `require.resolve` à gabarit
     (`scripts/generate-world.mjs` ~31). Aucun autre.
   - `ignoreExportsUsedInFile: true`. Sans lui, 38 exports et 24 types de plus, tous lus dans
     leur propre fichier.
   - Ni `ignore` pour `WWS/maquettes` et `WWS/prototypes`, hors `project` (knip répond « Remove
     from ignore »), ni `convex/**` en entrée, que le plugin Convex pose.
2. Suppression de `firstEntryInRegion`, `pointOnRegionBoundary` et `encodeRegionRaster`, puis de ce
   qui n'a plus de lecteur après eux : `tsc` (`noUnusedLocals`) nomme les privés (`runsOf`…),
   knip les types exportés (`RegionEntry` de `region-crossing.ts` ~15 ; son homonyme de
   `region-raster.ts` ~249 reste). Pas de bannière : elles sont remplacées, pas en attente comme
   `firstMobileEncounter`.
3. Simulateur. Si `git status --short WWS/simulation/opening/` est vide, supprimer les quatre
   déclarations. Sinon, c'est le travail de Pierre en cours (P3) : n'y pas toucher, poser
   `ignoreIssues` (`["exports"]` pour `constants.mjs` et `scenarios.mjs`, une clé chacun) avec son
   commentaire, et le mettre en « À trancher ».
4. Si 04 est passé (`scripts/lib/import-ts.mjs` existe), knip ne suit pas `importTs(…)`. Un export
   que seul un générateur charge ainsi sort donc en « Unused exports » alors qu'il vit : à la
   rédaction, `encodeGrid` (`src/domain/routing.ts`, lu par `generate-grid.mjs` seul). Il reçoit
   `@public` dans sa JSDoc, qui nomme son lecteur ; il n'est jamais supprimé. Toute autre ligne
   restante suit le point 2.
5. `package.json`, `verifier` : `npm run knip` après `npm run types` et avant `npm run test` (l'ordre
   que 47 reprend). Le script `knip` ne change pas.
6. Les énumérations de la chaîne que 13 a écrites (commentaire de `ci.yml` ~27-28, ligne
   `npm run verifier` du bloc de commandes de `CLAUDE.md`) gagnent `knip` entre types et tests.

## Ce que ce prompt ne fait pas
- Les cycles : `--include cycles` liste 38 chemins, ils reviennent au 38. Rien sur les clés mortes
  de `fr.ts`, que knip ne voit pas (40), ni sur l'orchestrateur (47).
- Aucun `export` lu dans son seul fichier n'est retiré. Le générateur ne se met pas à appeler
  `encodeRegionRaster` par `importTs` : « À trancher », avec celui du 04.

## Cas d'acceptation (tests d'abord)
1. Avant : `npx knip > $T/avant.txt; echo $?` rend 1. Noter les lignes et les en-têtes de section
   (après 14 et 35, ni « Unlisted » ni « Duplicate »).
2. `knip.jsonc` posé, rien nettoyé : `npx knip` ne liste que les 3 fonctions, les 4 exports du
   simulateur (et `encodeGrid` si 04), sans autre section ni « Configuration hints ».
3. Chaque exception tient. Sans `react-compiler-runtime` dans `ignoreDependencies`, il sort en
   « Unused dependencies » ; sans `world-atlas`, en « Unused devDependencies ». Rétablir.
4. Après : `npm run knip; echo $?` rend 0, et `git grep -n
   "firstEntryInRegion\|pointOnRegionBoundary\|encodeRegionRaster" -- src convex scripts` ne rend rien.
5. Mutation : `export const zzSonde = 1;` en fin de `src/domain/geo.ts` fait sortir knip en 1, qui
   nomme `zzSonde`. La retirer.

## Vérifications
- `npx vitest run src/domain/region-raster.test.ts convex/invariants.test.ts` : vert (la cuisson reste égale).
- `npm run verifier` : vert, knip une fois, entre les types et les tests.

## Rapport attendu
Format commun (README de la série), plus :
- la sortie de knip avant, puis au cas 2, et sa durée ;
- ce qui est tombé en cascade au point 2 ;
- la voie prise pour le simulateur et pour `encodeGrid`.
