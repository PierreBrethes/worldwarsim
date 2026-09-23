# 49-registre-a-mesurer — le registre `@a-mesurer` et les assets dérivés se régénèrent par une commande npm, et un décalage de ligne ne périme plus le registre

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 04.

**À lire :** `scripts/generate-a-mesurer.mjs` (usage ~22, `where` ~102, empreinte ~119-122, en-tête
généré ~125), `scripts/a-mesurer.test.mjs` (~14-22), `WWS/docs/technique/a-mesurer.md` (en-tête,
colonne « Où »), `package.json` (`scripts`), et ce que chaque générateur lit et écrit, relativement
au répertoire courant : `scripts/generate-world.mjs` (~10, ~21-23 `--detail`, ~162-168),
`generate-region-index.mjs` (~56-57), `generate-deposits.mjs` (~44, ~513),
`generate-region-grid.mjs` (~26-28, ~181), `generate-regions.mjs` (~12-13, ~23-24), `convex/invariants.test.ts` ~217.

## Pourquoi

- Seul `routes` lance un générateur par npm. L'IA lance `generate-a-mesurer.mjs` par un chemin
  absolu vers node, une règle figée dans `.claude/settings.local.json`. `a-mesurer.test.mjs` ~15
  échoue par un `toBe` nu, sans dire quoi lancer. Les tests d'assets, eux, nomment leur commande
  (`convex/invariants.test.ts` ~326).
- `generate-a-mesurer.mjs` ~102 écrit ``where: `${file}:${line + 1}` ``, et l'empreinte l'inclut
  (~120). Une ligne ajoutée au-dessus d'une constante marquée suffit donc à périmer le registre.
  28 commits ont touché `a-mesurer.md`. Sur 313 lignes de tableau réécrites, 269 ne changeaient que
  le numéro de ligne, et 8 commits n'étaient que des décalages (21a9a53, 15b3c22, 766f4c0, 16373f8,
  3272c0f, 4ba8f48, f47bad9, 7e04d36). 28 des 33 lignes pointent vers `convex/constants.ts`.
- L'ordre de la chaîne des assets dérivés n'est écrit que dans des en-têtes.

## Ce qui change

1. `package.json` : `"a-mesurer": "node scripts/generate-a-mesurer.mjs"`.
2. `generate-a-mesurer.mjs` : `where` ne garde que le chemin (`convex/constants.ts`), puisque le nom
   de la constante suffit à grep. Les erreurs de `collectMarkers` (~86, ~97, ~108) gardent
   `fichier:ligne`, parce qu'elles désignent un marqueur à corriger. L'empreinte garde sa formule
   et ne dépend plus des numéros de ligne. L'usage (~22) et l'en-tête généré (~125) nomment
   `npm run a-mesurer`.
3. `a-mesurer.test.mjs` ~15 : `expect(rendu, 'registre périmé : lancer npm run a-mesurer').toBe(…)`.
4. `WWS/docs/technique/a-mesurer.md` est régénéré une fois. Seuls l'en-tête, l'empreinte et la
   colonne « Où » changent.
5. `package.json` : `"generer:derives"` enchaîne les générateurs sans entrée externe. Lectures
   vérifiées : world lit world-atlas et chaîne grid (lit `world.json`) ; region-index lit
   `world.json` et `regions.json` ; deposits, `regions.json` et `src/domain/ids.ts` ; region-grid,
   `world.json`, `regions.json` et `region-index.json`.
   **Le code contredit le cahier** : `generate-world.mjs` chaîne aussi `generate-region-grid.mjs`
   (~168), donc **avant** region-index. Après un `regions.json` neuf, le raster lirait un index
   périmé : une région neuve plus petite qu'une cellule lèverait l'erreur ~182, et la chaîne `&&`
   s'arrêterait là. Décision : `generate-world.mjs` accepte `--skip-region-grid`, qui saute ce seul
   import chaîné ; sans le drapeau rien ne change (ADR 0023 ~143), et 50 réutilise le drapeau.
   `generer:derives` vaut :
   `node scripts/generate-world.mjs --skip-region-grid && node scripts/generate-region-index.mjs && node scripts/generate-deposits.mjs && node scripts/generate-region-grid.mjs`.
6. L'en-tête de `generate-regions.mjs` dit qu'il reste manuel, parce qu'il exige en argument le
   geojson Natural Earth `ne_10m_admin_1_states_provinces`, absent du dépôt (~12-13), et qu'après
   lui on lance `npm run generer:derives`. Le message de `convex/invariants.test.ts` ~217, qui
   n'enchaîne que region-index et region-grid et oublie deposits, renvoie à la même commande.

## Ce que ce prompt ne fait pas

- Pas de régénération automatique du registre : 48 lance son test sans rien écrire, et le message
  du cas 4 donne la commande. `assets:check` revient à 50.
- Les règles à chemin absolu de `.claude/settings.local.json` relèvent de 16 et de P5 ; les noms
  faux de CLAUDE.md (`generer-monde.mjs`, `generer-regions.mjs`, `monde.json`), de 25 et 26.
  CLAUDE.md n'est pas touché (plafond de 25). Aucun script n'est renommé.

## Cas d'acceptation (tests d'abord)

1. `a-mesurer.test.mjs` gagne un cas : chaque `row.where` est un chemin sans `:ligne`
   (`/^[\w./-]+\.ts$/`). Ce cas est rouge avant le changement de `generate-a-mesurer.mjs`.
2. `npm run a-mesurer` régénère le registre. Relancé, il ne change plus rien (`git diff --stat`).
3. Une ligne vide ajoutée en tête de `convex/constants.ts` (elle décale ses 28 constantes marquées ;
   jamais entre un `*/` marqué et son `export const`, que `collectMarkers` refuse) laisse
   `npx vitest run scripts/a-mesurer.test.mjs` vert. Retirer la ligne ensuite.
4. Une cellule de `a-mesurer.md` modifiée à la main fait échouer le test, avec un message qui
   contient `npm run a-mesurer`. Lancer cette commande rétablit le fichier.
5. Dans un dossier temporaire hors du dépôt, avec `public/regions.json` et `src/domain/ids.ts`
   copiés **aux mêmes chemins relatifs** (les générateurs lisent et écrivent par rapport au `cwd`),
   les quatre commandes de `generer:derives` (`node <dépôt>/scripts/…`) vont au bout, et les sept
   fichiers produits sont identiques octet pour octet à `public/`. Lancé sans drapeau,
   `generate-world.mjs` imprime toujours ses trois comptes rendus.
6. Seulement si le cas 5 a donné sept `cmp` silencieux : `npm run generer:derives` à la racine,
   puis `git status --short public/`, qui doit être vide.

## Vérifications

- `npx vitest run scripts/a-mesurer.test.mjs` vert, et `npm run a-mesurer` idempotent.
- Sept `cmp` silencieux, puis `git status --short public/` vide ; enfin `npm run verifier` vert.

## Rapport attendu

Format commun (README de la série), plus :

- le diff de `a-mesurer.md` résumé (lignes touchées, ancienne et nouvelle empreinte), la durée de
  `npm run generer:derives`, et la preuve que `generate-world.mjs` sans drapeau se comporte comme
  avant (`--skip-region-grid` est un écart assumé à la lettre du cahier).
