# 50-assets-verifies — `npm run assets:check` rejoue les générateurs dans un dossier temporaire, et le vérifieur échoue si un asset de `public/` ne sort plus de son script

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 04, 47, 49.

**À lire :** `scripts/verifier.mjs` et `scripts/verifier.test.mjs` (posés par 47 : la forme d'une
entrée de `STEPS`, les chiffres clés testés sur des sorties en littéral), `scripts/generate-world.mjs`
(`--skip-region-grid`, posé par 49), les lectures relatives au `cwd` de `generate-region-index.mjs`
(~56-57), `generate-deposits.mjs` (~44 `src/domain/ids.ts`, ~513) et `generate-region-grid.mjs`
(~26-28), `scripts/generate-a-mesurer.mjs` ~153 (garde du `main` d'un script qui exporte ses
fonctions), `convex/invariants.test.ts` ~187-195.

## Pourquoi

Les sept assets dérivés (world, grid, region-grid, projection, region-index, country-names,
deposits) se rejouent octet pour octet, vérifié à la rédaction ; pourtant rien ne rejoue les
scripts : `invariants.test.ts` vérifie les assets, jamais les générateurs. Deux dérives muettes :

- générateur cassé, asset juste : `generate-grid.mjs` et `generate-region-grid.mjs` ont planté du
  17/09 jusqu'au prompt 04 ;
- script juste, asset faux : `regions.json` datait du 15/08, son script corrigé le 09/09
  (`invariants.test.ts` ~192-195). Lui reste hors contrôle (source externe) ; ce prompt ferme la
  même porte pour les sept assets qui en dérivent.

## Ce qui change

1. `scripts/check-assets.mjs` (à créer), en Node seul (`node:fs`, `node:child_process`, aucune
   commande shell, pour tourner pareil sous WSL, macOS et en CI) :
   - Il crée un dossier par `mkdtemp(join(tmpdir(), 'wws-assets-'))` et n'y copie, **aux mêmes
     chemins relatifs**, que les deux entrées lues par chemin relatif et qu'aucun générateur ne
     produit : `public/regions.json` et `src/domain/ids.ts`.
   - Il y lance les scripts **du dépôt** par `process.execPath`, avec ce dossier pour `cwd`.
     L'ordre est celui de `generer:derives` (49) : `generate-world.mjs --skip-region-grid`, qui
     fait le monde et la grille, puis `generate-region-index.mjs`, puis `generate-deposits.mjs`.
     Avec `--full`, `generate-region-grid.mjs` passe en dernier (environ 14,6 s).
   - Il compare octet à octet à `public/` : `world.json`, `grid.json`, `region-index.json`,
     `country-names.json` et `deposits.json`. Avec `--full`, il ajoute `region-grid.json` et
     `projection.json`.
   - En cas de succès, il sort 0 et imprime une seule ligne, par exemple « 5 assets identiques,
     rejoués en 1,1 s ». Sans `--full`, cette ligne précise que region-grid et projection ne sont
     rejoués qu'avec `--full`. Le dossier est ensuite supprimé. La sortie des générateurs est
     capturée, jamais affichée sur un succès, et rien ne s'écrit dans le dépôt.
   - En cas d'échec, il sort 1. Il imprime soit les fichiers qui diffèrent (un fichier absent
     compte comme différent), soit le générateur qui a échoué avec la fin de sa sortie d'erreur. Le
     dossier est gardé, et son chemin est imprimé.
   - Son en-tête dit pourquoi `regions.json` est hors contrôle : sa source est le geojson Natural
     Earth 10m, absent du dépôt, et `generate-regions.mjs` reste manuel. L'en-tête documente aussi
     `--full`, à lancer à la main après un recuit de raster.
   - Il exporte `compareOutputs(generatedDir, referenceDir, names)`, qui rend les noms qui
     diffèrent, et `runGenerator(script, args, cwd)`, qui rend le succès et la fin de stderr. Son
     `main` est gardé comme celui de `generate-a-mesurer.mjs` ~153.
2. `package.json` : `"assets:check": "node scripts/check-assets.mjs"`. On passe `--full` par
   `npm run assets:check -- --full`.
3. `scripts/verifier.mjs` : l'entrée `{ name: 'assets', command: ['node', 'scripts/check-assets.mjs'],
   keyFigure }` après `miroir`, **sans** `--full`. `keyFigure` rend `5 assets identiques` au vert ;
   au KO, le nombre de fichiers qui diffèrent ou le générateur tombé, et `—` sur une sortie
   illisible. `scripts/verifier.test.mjs` gagne ces sorties en littéral.

## Ce que ce prompt ne fait pas

- Aucun asset n'est régénéré ni corrigé. Un asset qui diffère se rapporte, sans plus.
- `--full` n'entre ni au vérifieur ni à la CI, et `verif:rapide` (48) n'appelle pas le contrôle.
- Les générateurs ne sont pas touchés, et `regions.json` reste hors contrôle.

## Cas d'acceptation (tests d'abord)

1. `scripts/check-assets.test.mjs` (à créer) teste `compareOutputs` sur deux dossiers temporaires.
   Il rend `[]` pour des copies identiques, `['deposits.json']` quand un octet diffère, et le nom
   du fichier quand celui-ci manque au dossier généré.
2. Même fichier : `runGenerator` sur un petit script temporaire qui lève une erreur rend un échec,
   avec le message dans la fin de stderr. Sur un script qui réussit, il rend un succès.
3. `npm run assets:check` sort 0 en 1 s environ (à mesurer) ; le script n'imprime qu'une ligne
   (hors en-tête de npm). `git status --short` n'a pas bougé, et aucun `wws-assets-*` ne reste
   sous le dossier temporaire du système.
4. `npm run assets:check -- --full` sort 0 et compare sept fichiers.
5. `npm run verifier` affiche l'étape `assets` au vert.

## Vérifications

- `npx vitest run scripts/check-assets.test.mjs scripts/verifier.test.mjs` : vert.
- `time npm run assets:check`, puis la même chose avec `-- --full` : deux sorties 0, chronométrées.
- `npm run verifier` : vert, avec l'étape `assets`.

## Rapport attendu

Format commun (README de la série), plus :

- les deux durées (rapide et `--full`), la ligne imprimée sur un succès, et l'étape telle que la
  table du vérifieur l'affiche ;
- toute lecture d'un générateur qui dépend d'autre chose que le `cwd` et les deux entrées copiées.
