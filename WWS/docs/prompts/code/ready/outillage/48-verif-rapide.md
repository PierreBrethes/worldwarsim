# 48-verif-rapide — `npm run verif:rapide` vérifie en quelques secondes ce que touchent les fichiers modifiés

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 47.

**À lire :** `scripts/verifier.mjs` (47 : `STEPS` et leurs `keyFigure`, `runStep`, `renderRow`,
`tail`) · `package.json` (`types`, `lint`, `format:check` : drapeaux et caches de 12, 13 et 34) ·
`WWS/simulation/opening/verify.mjs` ~26-30 (`SOURCES`) · `scripts/generate-a-mesurer.mjs` ~32-42
(`SCANNED`, tests exclus) · dans `CLAUDE.md`, le bloc de commandes et le paragraphe **Tests.** de
`## Instructions` (21, 25) · `.claude/settings.json` (16 : une liste `allow` étroite, exprès).

## Pourquoi
Les commandes de `CLAUDE.md` ne proposent que la suite entière et le vérifieur. L'IA cible déjà,
mais à la main : du 13 au 23/09, 258 appels vitest ciblés contre 55 suites complètes, et 207 `tsc`
isolés, à froid (7,5 s chacun), souvent par un chemin absolu vers node figé dans
`.claude/settings.local.json` (~30-38). Mesuré : `vitest run src/domain` 1,8 s (32 fichiers),
`vitest related src/domain/next-actions.ts` 6,2 s, tsc incrémental à chaud 1,9 s, `eslint --cache`
et `prettier --check --cache` 0,8 s chacun. Le gain est de standardiser et de mettre en cache.

## Ce qui change
1. `scripts/verif-rapide.mjs` (à créer) et `"verif:rapide": "node scripts/verif-rapide.mjs"`.
   - **Fichiers** : `git diff --name-only -z HEAD` plus `git ls-files -o --exclude-standard -z`, sans
     doublons ; des chemins en arguments (`npm run verif:rapide -- <fichiers>`) les remplacent. Aucun
     fichier : une ligne, sortie 0. Un supprimé compte pour les déclencheurs, jamais comme argument.
   - **`planOf(files, { exists, carriesMarker })`**, pure et exportée, rend chaque étape avec sa
     commande ou la raison qui l'écarte ; une table de déclencheurs en tête fixe l'ordre (52 y
     ajoutera `simulateur`). Outils sous la forme `'node'` de 47 (`node_modules/eslint/bin/eslint.js`,
     `prettier/bin/prettier.cjs`, `vitest/vitest.mjs`). « Code » : `.ts .tsx .mjs .js`.
     - `types` : `npm run types` (routes, tsc racine et convex, incrémental), si un fichier est
       sous `src/` ou `convex/`, ou vaut `tsconfig.json`, `vite.config.ts` ou `package.json` ;
     - `lint` : eslint sur le code existant, options de `scripts.lint` (moins `eslint` et `.`) plus
       `--no-warn-ignored` : sans lui, un fichier de `WWS/` passé en argument avertit, donc KO sous
       le `--max-warnings 0` de 34 (vérifié) ;
     - `format` : prettier sur les fichiers existants, options de `scripts['format:check']` (moins
       `prettier` et `.`) plus `--ignore-unknown` ; il saute seul ses ignorés, un chemin absent le
       fait sortir en 2 ;
     - `test` : écarté sans code ; `vitest run src/domain` si tout le code est sous `src/domain/`,
       sinon `vitest related --run --passWithNoTests <code>` (`--run` : pas de surveillance ;
       `related` pose déjà `passWithNoTests` dans vitest 4, `runRelated`, on le garde explicite).
       Jamais `package.json` : dans les `forceRerunTriggers`, il relancerait toute la suite. Un
       test modifié se lance lui-même ;
     - `miroir` : `node WWS/simulation/opening/verify.mjs` si `convex/constants.ts`,
       `src/domain/routing.ts`, `src/domain/troops.ts` ou `WWS/simulation/opening/` a bougé ;
     - `a-mesurer` : `vitest run scripts/a-mesurer.test.mjs` si `WWS/docs/technique/a-mesurer.md`
       a bougé, ou un `.ts` hors test de `convex/` ou `src/domain/` qui porte `@a-mesurer`, dans sa
       version courante ou à `HEAD` (`git show HEAD:<fichier>`) : un marqueur retiré compte.
   - **Exécution** : séquentielle, toutes les étapes, par le `runStep` de 47, journaux dans
     `node_modules/.cache/wws/verif-rapide/`, chaque étape avec le `keyFigure` de son homonyme de
     `STEPS` (`a-mesurer` celui de `test`). Une ligne par étape (`renderRow`) : `—` et la raison si
     écartée, sinon le chiffre clé (`37 tests / 4 fichiers`) ; puis les 40 dernières lignes de
     chaque KO, et `N fichiers, X s — avant de rendre : npm run verifier`. Sortie 1 sur un KO.
   - **Une seule source des drapeaux** : tirées de `package.json`, les options portent les caches
     du vérifieur. `lint`, `format:check` ou un tsc de `types` sans cache après 13 : le poser dans
     `package.json` (sous `node_modules/.cache/wws/`), jamais dans verif-rapide seul, et le dire.
   - **L'en-tête dit ce qui manque et ce que ça coûte.** Seul `src/domain/` modifié, il ne voit pas
     les tests convex qui lisent le domaine ; jamais ni knip, ni le build, ni l'isolat. Compter 2 à
     8 s pour le front et le domaine, mais 15 à 18 s dès qu'un fichier central de `convex/` bouge :
     les tests convex chargent tout le graphe (24 à 48 fichiers de test).
2. `CLAUDE.md`, sans dépasser les 8 000 caractères de 25 (`wc -m`) : au bloc de commandes,
   `npm run verif:rapide # pendant une tâche ; avant de rendre : npm run verifier` ; le paragraphe
   **Tests.** de 21 nomme `npm run verif:rapide` à côté de `npx vitest run <fichier>`.
   `.claude/settings.json` : `allow` gagne `Bash(npm run verif:rapide *)`, par son nom, jamais
   `npm run *` (57 ajoutera `npm run prod`).

## Ce que ce prompt ne fait pas
- Rien de suivi ne s'écrit : ni registre `@a-mesurer` (le test signale l'écart ; 49 donne la
  commande), ni assets (50). `verifier.mjs` : un export manquant au plus. `settings.local.json` : P5.

## Cas d'acceptation (tests d'abord)
1. `scripts/verif-rapide.test.mjs` (à créer), sur `planOf`, `exists` et `carriesMarker` injectés :
   a. `src/domain/next-actions.ts` → `types`, `lint`, `format`, et `test` en
      `vitest run src/domain` ; `miroir` et `a-mesurer` écartés ;
   b. `convex/constants.ts` (porteur) → `test` en `related`, `miroir` et `a-mesurer` lancés ;
   c. `WWS/simulation/opening/engine.mjs` → `miroir` lancé, `types` écarté ; `WWS/docs/x.md` seul
      → ni `types`, ni `lint`, ni `test` ;
   d. `package.json` avec `src/shell/Shell.tsx` → `types` lancé, `package.json` absent de vitest ;
      un fichier supprimé (`exists` faux) déclenche `miroir` sans entrer dans aucune commande.
2. Même fichier : la commande `lint` porte chaque option de `scripts.lint` (hors `eslint` et `.`),
   et `format` chaque option de `scripts['format:check']` (hors `prettier` et `.`), caches compris.
3. `npm run verif:rapide -- src/domain/next-actions.ts` : vert, `test` en `src/domain`. Avec
   `export const probe: number = 'a';` ajouté au fichier puis retiré : `types` KO, l'erreur tsc à
   l'écran, les autres étapes tournent.
4. `npm run verif:rapide -- convex/constants.ts` lance `miroir` et `a-mesurer` ; durée mesurée.
5. `npm run verif:rapide` sans argument voit les fichiers du prompt et sort 0.

## Vérifications
- `npx vitest run scripts/verif-rapide.test.mjs` vert ; `time` sur les cas 3 à 5 ; `git status --short`
  inchangé après chaque retrait ; `wc -m < CLAUDE.md` ≤ 8 000 ; `npm run verifier` vert.

## Rapport attendu
Format commun (README de la série), plus : les durées des cas 3 (vert), 4 et 5 et de `types` seul
à chaud ; la sortie du cas 3 en KO, telle qu'imprimée ; tout cache que ce prompt a dû poser.
