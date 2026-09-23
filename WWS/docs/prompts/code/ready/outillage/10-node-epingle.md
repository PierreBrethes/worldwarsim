# 10-node-epingle — une seule version de Node, déclarée par `.nvmrc`, suivie par la CI et par l'image du front, et bornée par `engines`

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `package.json` (aucun `engines` ; `@types/node` ~37), `.github/workflows/ci.yml`
(`setup-node` ~20-23 et ~46-49), `.github/workflows/surveillance.yml` s'il existe (09 : son
`setup-node`, son `sparse-checkout`), `deploiement/front.Dockerfile` (~1), `package-lock.json`
(`packages[""]` ~6-56 ; `engines` de `jsdom`, `vite`, `eslint`), `vite.config.ts` (projets de
test ~26-35 : `front` prend `scripts/*.test.mjs`), `scripts/a-mesurer.test.mjs` (forme).

## Pourquoi

Aucune version de Node déclarée : ni `.nvmrc`, ni `.node-version`, ni `engines`. La CI prend
`node-version: '24'` (ci.yml ~22 et ~48), l'image du front de prod `node:22-alpine`
(front.Dockerfile ~1) : la prod est construite avec un Node que le vérifieur n'exécute jamais. Sur
le Mac, hors nvm, `/usr/local/bin/node` v19.0.1 répond, et `import('vite')` y meurt sur « does not
provide an export named 'styleText' » (vite 8.2.1 et rolldown : `^20.19.0 || >=22.12.0`).

**Le code contredit le cahier sur le plancher.** Le cahier voulait `engines.node = ">=22.12.0"`,
qui est la borne de vite. Or le vérifieur fait aussi tourner eslint 10 et jsdom 30 : trois tests
sont sous `@vitest-environment jsdom` (`Window.test.tsx`, `__root.test.tsx`,
`TelegraphThread.test.tsx`). Mesuré à la rédaction sur les `engines.node` de tout le lock :

- refusés : 22.12.0 par 16 paquets (eslint 10 et `@eslint/*` : `^22.13.0`) ; 23.x par 19 paquets ;
  22.22.1, 24.0 à 24.14 et 25.x par jsdom 30 (`^22.22.2 || ^24.15.0 || >=26.0.0`) ;
- acceptés partout : 22.22.2, 24.15.0, 24.19.0 et 26.0.0.

## Ce qui change

1. `.nvmrc` (à créer) tient en une ligne, `24`. **Décision : le majeur seul**, comme la CI.
   `nvm use` prend le plus haut 24 installé (v24.19.0 sur le Mac) ; `nvm install`, le dernier.
2. `package.json` : `"engines": { "node": "^22.22.2 || ^24.15.0 || >=26.0.0" }`. C'est
   l'intersection mesurée du lock, écart assumé au `>=22.12.0` du cahier. **Ni `.npmrc` ni
   `engine-strict`** : sur le poste WSL, un Node hors bornes avertit, il ne bloque pas `npm install`.
3. `package-lock.json` : `npm install --package-lock-only --ignore-scripts`. npm recopie
   `engines` dans `packages[""]`. C'est le seul diff attendu : 3 lignes, mesuré à la rédaction.
4. Tout workflow de `.github/workflows/` : `node-version: '24'` devient
   `node-version-file: .nvmrc`, dans les deux jobs de `ci.yml` (`cache: 'npm'` ne bouge pas), et
   dans `surveillance.yml` s'il existe déjà (09). Son `sparse-checkout` gagne alors `.nvmrc` :
   sans le fichier, `setup-node` échoue.
5. `front.Dockerfile` : la ligne ~1 devient `ARG NODE_VERSION=24`, puis
   `FROM node:${NODE_VERSION}-alpine AS construction`. Une ligne de commentaire dit pourquoi :
   même majeur que `.nvmrc`, et le test l'exige. L'étage nginx ne change pas.
6. `scripts/node-version.test.mjs` (à créer), dans le projet vitest `front`, lit les fichiers
   comme du texte, sans dépendance nouvelle (voir cas 1).
7. `CLAUDE.md`, en tête du bloc de commandes (~8) : `nvm use          # Node de .nvmrc`.

## Ce que ce prompt ne fait pas

- Le profil zsh et le node 19 de `/usr/local` : P2 ; d'ici là, la convention 4 du README tient.
- Ni `prepare`, ni nvm ni garde-fou de version dans le pre-push : c'est le 11.
- `@types/node` reste en `^22` : ce serait un changement de lock et de types (« À trancher »).
- Pas de `.dockerignore` (66), pas de déploiement par SHA (62), pas de runbook (67). Les chemins
  absolus de `.claude/settings.local.json` relèvent de 16 et de P5.

## Cas d'acceptation (tests d'abord)

1. `scripts/node-version.test.mjs` s'écrit d'abord (rouge faute de `.nvmrc`), en trois cas :
   - (a) Le majeur de `ARG NODE_VERSION=` dans `front.Dockerfile` égale celui de `.nvmrc`, et le
     `FROM` de l'étage de construction lit `${NODE_VERSION}`.
   - (b) Chaque fichier de `.github/workflows/` porte autant de `node-version-file: .nvmrc`
     (guillemets tolérés) que de `uses: actions/setup-node`, et aucune clé `node-version:`.
   - (c) `engines.node` est déclaré, et une de ses branches admet le majeur M de `.nvmrc` :
     `^M.` ou `>=X.` avec X ≤ M.
2. Mutation : `.nvmrc` passé à `22` fait rougir (a), qui nomme les deux valeurs. Remettre `24`.
3. `git diff package-lock.json` ne montre que l'ajout d'`engines` sous `packages[""]`.
4. Depuis la racine, `sh -c '. "$HOME/.nvm/nvm.sh" --no-use && nvm use'` annonce le plus haut
   24 installé (v24.19.0 sur le Mac).
5. Facultatif, si `docker info` répond : un contexte temporaire hors du dépôt avec `package.json`,
   `package-lock.json` et le Dockerfile coupé après `RUN npm ci` ; son `docker build` passe sans
   `EBADENGINE`, puis supprimer l'image. Pas le Dockerfile entier depuis le dépôt : sans
   `.dockerignore` (66), `COPY . .` écraserait `node_modules` par celui du Mac.

## Vérifications

- `npx vitest run scripts/node-version.test.mjs` : vert, 3 tests.
- `git status --short` : `.nvmrc`, `package.json`, `package-lock.json`, `ci.yml` (et
  `surveillance.yml` si 09 est passé), `front.Dockerfile`, `CLAUDE.md`, le test ; rien d'autre.
- `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus :

- l'intersection des `engines.node` du lock, **re-mesurée** par le semver de `node_modules`
  depuis le shell (rien de commité), et l'écart au `>=22.12.0` du cahier ;
- le cas 5 : fait, avec sa durée et l'image de base résolue, ou non fait, et pourquoi ;
- en « À trancher », `@types/node` : 1a l'aligner sur `^24` dans un commit à part, ou 1b le
  laisser. Recommander.
