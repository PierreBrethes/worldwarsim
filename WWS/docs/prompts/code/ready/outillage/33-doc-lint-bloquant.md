# 33-doc-lint-bloquant — une référence morte dans la doc fait échouer la CI, sans jamais retenir un déploiement

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 32 (et 10, pour la forme de `setup-node`).

**À lire :** `scripts/doc-lint.mjs` (CLI, séparation entre contrôles structurels et rapport) et
`scripts/doc-lint.test.mjs` · `.github/workflows/ci.yml` (`concurrency` ~10-12, jobs `verifications`
~15-30 et `deployer` ~40-41 `needs: verifications`, forme de `setup-node` laissée par 10) ·
`.githooks/pre-push` (fin : `npm run verifier`) · `package.json` (`verifier`, `doc-lint`) ·
`vite.config.ts` ~33.

## Pourquoi
Après 32, l'arbre ne compte aucun constat structurel, mais rien ne l'y maintient : `doc-lint` sort
toujours 0. Le brancher sur le chemin habituel coûterait trop cher. Le job `deployer` de ci.yml
attend `verifications`, qui lance `npm run verifier`, et le pre-push lance ce même `verifier`. Une
étape de `verifier`, ou un test vitest sur les vrais documents, retiendrait donc une mise en prod
pour un lien markdown cassé : le projet `front` prend tout `scripts/*.test.mjs`.

## Ce qui change
1. `scripts/doc-lint.mjs` gagne le drapeau `--strict`. Avec lui, la sortie vaut 1 s'il reste un
   constat de (a), (b), (c), (e) ou (f), et 0 sinon. Le rapport s'imprime comme avant et ne compte
   jamais. Le code de sortie sort d'une fonction pure exportée, `exitCodeOf(findings, { strict })`,
   et une dernière ligne dit le verdict : `doc-lint : N constats structurels` ou
   `doc-lint : propre`. Sans le drapeau, rien ne change.
2. Aucun test ne porte sur les vrais documents : `--strict` est le seul contrôle. Le cahier laissait
   le choix, et un test exclu de vitest par son seul nom de fichier serait un second mécanisme à
   garder hors du chemin du déploiement. `doc-lint.test.mjs` garde ses fixtures.
3. `ci.yml` gagne un job `documentation`, parallèle, sans `needs`, que `deployer` ne cite pas. Il
   fait le même `actions/checkout` que les deux autres jobs, puis `actions/setup-node` dans la
   forme laissée par 10 (`node-version-file: .nvmrc` : `scripts/node-version.test.mjs` en exige un
   par `setup-node`) mais **sans** `cache: 'npm'`, rien n'étant installé, puis lance
   `npm run doc-lint -- --strict`. Pas de `npm ci` : `scripts/doc-lint.mjs` n'importe que des
   modules `node:*` (le vérifier), et `git` est présent. Un commentaire dit pourquoi le déploiement
   ne l'attend pas : un lien cassé ne retient pas une mise en prod, le run passe au rouge, la prod
   est à jour, et la correction vient au commit suivant.
4. `verifier`, `.githooks/pre-push` et le job `deployer` ne changent pas : le pre-push retient la
   poussée, donc le déploiement.
5. Dans CLAUDE.md, le commentaire de la ligne `npm run doc-lint` posée par 31 devient
   `# références de la doc (rapport ; --strict en CI, hors déploiement)`.

## Ce que ce prompt ne fait pas
Les six rubriques du rapport (registres, index des ADR, statuts suspects, propositions, décisions,
taille de CLAUDE.md) restent non bloquantes, même en `--strict`. Ce prompt n'ajoute aucun contrôle. `permissions`,
`timeout-minutes` et l'épinglage des actions relèvent de 63, pour tous les jobs, celui-ci compris.
Le lancement de `--strict` en fin de session relève de 72.

## Cas d'acceptation (tests d'abord)
1. Dans `doc-lint.test.mjs`, `exitCodeOf` rend :
   - 0 sans constat ;
   - 1 avec un constat, en mode strict ;
   - 0 avec le même constat, hors mode strict ;
   - 0 en mode strict quand seules les rubriques du rapport sont pleines.
2. Sur l'arbre, `npm run doc-lint -- --strict; echo $?` affiche `doc-lint : propre` puis 0.
3. On ajoute exprès `[x](inexistant.md)` à `WWS/docs/technique/risques.md`. La sortie vaut 1, et la
   ligne du constat nomme `risques.md` et sa ligne. `npm run doc-lint; echo $?` rend 0 avec ce même
   lien. On retire ensuite le lien : `git diff --quiet -- WWS/docs/technique/risques.md`, et le mode
   strict rend de nouveau 0.
4. ci.yml se lit, et le déploiement n'a pas bougé :
   `node --input-type=module -e "import {parse} from 'yaml'; import {readFileSync} from 'node:fs';
   const j = parse(readFileSync('.github/workflows/ci.yml', 'utf8')).jobs; console.log(Object.keys(j).sort().join(','),
   JSON.stringify(j.deployer.needs), JSON.stringify(j.documentation.needs ?? null))"` affiche
   `deployer,documentation,verifications "verifications" null`. Le paquet `yaml` est déjà dans
   `node_modules` comme dépendance transitive : ne pas l'ajouter à `package.json`.
5. `git diff -- .github/workflows/ci.yml` ne montre que le job ajouté et son commentaire.
   `git diff -- .githooks` est vide, et le script `verifier` de `package.json` n'a pas changé.
6. `grep -oE "from '[^']+'|import\('[^']+'\)|require\('[^']+'\)" scripts/doc-lint.mjs | sort -u`
   ne montre que des spécificateurs `node:`.

## Vérifications
- `npx vitest run scripts/doc-lint.test.mjs` est vert, et les cas 2 à 6 passent.
- `npm run verifier` est vert (dont `scripts/node-version.test.mjs`, qui relit ci.yml).

## Rapport attendu
Format commun (README de la série), plus :
- la durée de `npm run doc-lint -- --strict` et la sortie du cas 3 ;
- le job `documentation` tel qu'il est écrit ;
- en « À trancher » : 1a garder `--strict` seul (recommandé), ou 1b ajouter un test sur les vrais
  documents, nommé hors du motif de vitest.
