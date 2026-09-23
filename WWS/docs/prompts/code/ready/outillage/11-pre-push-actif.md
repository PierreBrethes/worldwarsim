# 11-pre-push-actif — le pre-push est exécutable, `npm install` l'active sur tout clone, et il tourne sous le Node de `.nvmrc` ou refuse en clair

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 10.
**Pierre d'abord :** P2 (README) — recommandé, pas bloquant : le hook charge nvm lui-même.

**À lire :** `.githooks/pre-push` (branche Windows ~11-22, qu'on garde ; ~24-25),
`deploiement/front.Dockerfile` tel que 10 l'a laissé (`RUN npm ci` ~6 avant `COPY . .` ~7 : ni
`.git` ni `git` à ce moment-là), `package.json` (`scripts`, `engines` du 10), `.nvmrc`,
`.github/workflows/ci.yml` (`npm ci` ~25 et ~51), `scripts/node-version.test.mjs` (forme).

## Pourquoi

`core.hooksPath` n'est pas posé (`git config --get` sort en 1) : git ne cherche pas le hook, et
l'ignorerait s'il le cherchait (« not set as executable ») : il est en 100644 depuis sa création
(d2068af, 19/08). Les 34 commits de PierreBrethes du 12 au 18/09 sont partis sans vérification
locale ; le rouge n'arrive qu'en CI, des minutes après (`deployer` attend `verifications`, la prod
ne casse pas). Même actif, `/bin/sh` hérite du PATH de l'appelant et, hors nvm, trouve
`/usr/local/bin/node` v19.0.1 : vitest y plante.

**Un `prepare` naïf casserait la prod.** `npm ci` lance `prepare` (vérifié), et front.Dockerfile ne
copie que `package.json` et le lock avant : `node scripts/installer-hooks.mjs` y échouerait en
`MODULE_NOT_FOUND`, et le front ne se reconstruirait plus après un `convex deploy` réussi. Le poste
Windows commite encore (Taco, 124 commits, dernier le 16/09) : sa branche reste.

## Ce qui change

1. `chmod +x .githooks/pre-push` (`core.fileMode` vaut `true` ici). Pas de `git update-index` :
   le `git add` de Pierre enregistrera 100755.
2. `scripts/installer-hooks.mjs` (à créer) sort en 0 sans rien écrire s'il n'y a pas de `.git`
   dans le dossier courant, ou pas de binaire `git` (`spawnSync` en `ENOENT`). Sinon, il lance
   `git config core.hooksPath .githooks` et rend son code. Un commentaire nomme l'image du front.
3. `package.json` : `"prepare": "node scripts/installer-hooks.mjs"` (lock inchangé, mesuré).
4. `front.Dockerfile` : `COPY scripts/installer-hooks.mjs scripts/` entre `COPY package.json
   package-lock.json ./` et `RUN npm ci` (**écart au cahier**, qui supposait le script présent).
   Pas de `npm ci --ignore-scripts` : il sauterait l'install d'esbuild sous `convex`.
5. Le hook, **après** le `case` Windows inchangé, avant l'`echo` ~24 (commentaire : PATH hérité) :
   - si `"${NVM_DIR:-$HOME/.nvm}/nvm.sh"` existe, le sourcer avec `--no-use` puis `nvm use
     --silent` (lit `.nvmrc`), les deux entre `set +e` et `set -e` : nvm.sh ne promet rien sous
     `set -e`, et le nvm du poste WSL n'est pas celui du Mac. Mesuré : `nvm use --silent` sur une
     version absente sort en 3 **sans rien dire** ; son échec imprime donc sur stderr « pre-push :
     nvm use a échoué — .nvmrc est-il installé ? (nvm install) », et le garde-fou tranche ;
   - garde-fou : `NODE_MIN=22.22.2` et un `node -e` qui compare `process.versions.node`. En cas
     d'échec, ou sans node : sortie 1 et « pre-push : Node >= 22.22.2 requis (trouvé : vX) —
     nvm install && nvm use, ou git push --no-verify ». **Écart au cahier** (`>= 22.12`) : c'est
     le plancher d'`engines` posé par 10. C'est un plancher, pas la plage : 24.0-24.14 passent.
6. `CLAUDE.md` : la ligne `git config core.hooksPath …` (~14 après 10) disparaît ; `npm install`
   gagne `# pose aussi core.hooksPath : le pre-push est actif`.
7. `scripts/hooks.test.mjs` (à créer), dans le projet vitest `front` (voir le cas 1).

## Ce que ce prompt ne fait pas

- **Jamais de `git push`**, pas même `--dry-run` : on lance le hook directement.
- La branche Windows et `usePolling` restent (voir 20). Le hook appelle toujours
  `npm run verifier`, pas `verif:rapide` (48). Ni compatibilité (44) ni état au démarrage (18).

## Cas d'acceptation (tests d'abord)

1. `scripts/hooks.test.mjs` s'écrit d'abord ; le cas (a) est rouge avant le `chmod`.
   - (a) Chaque fichier de `.githooks/` est exécutable (`statSync(f).mode & 0o111`), CI comprise.
   - (b) `installer-hooks.mjs`, lancé par `process.execPath` dans un dossier `mkdtemp` sans
     `.git`, sort en 0, sans sortie et sans créer `.git`.
   - (c) Dans `front.Dockerfile`, `COPY scripts/installer-hooks.mjs` précède `RUN npm ci`.
   - (d) `NODE_MIN` du hook = le plus bas des planchers `^x.y.z` / `>=x.y.z` d'`engines.node`.
2. Depuis la racine, `env PATH="$(dirname "$(command -v node)")" node scripts/installer-hooks.mjs`
   (git hors du PATH) sort en 0, muet. `git config --get core.hooksPath` sort toujours en 1.
3. `npm run prepare`, puis `git config --get core.hooksPath` : `.githooks`. Idempotent.
4. Image du front simulée : un dossier temporaire hors du dépôt, sans `.git`, avec `package.json`,
   `package-lock.json` et `scripts/installer-hooks.mjs` : `npm run prepare` y sort en 0, sans le
   script en 1. Facultatif, si `docker info` répond : `docker build` du Dockerfile coupé après
   `RUN npm ci` sur ce contexte (le `npm ci` de la prod, `prepare` compris), puis `docker image rm`.
5. Sur le Mac (ailleurs, tout Node < 22.22.2 installé sous nvm) :
   `env -i HOME="$HOME" NVM_DIR=/nonexistent PATH="$HOME/.nvm/versions/node/v18.15.0/bin:/usr/bin:/bin" ./.githooks/pre-push < /dev/null`
   sort en 1. Le message contient `22.22.2` et `v18.15.0`, et le vérifieur ne part pas.
6. Le même appel, sans `NVM_DIR=/nonexistent`, charge nvm et passe au plus haut 24 (v24.19.0 sur
   le Mac). Il imprime « pre-push : vérifications » et mène `npm run verifier` au vert.
7. `git diff --summary .githooks/pre-push` : `mode change 100644 => 100755`.

## Vérifications

- `npx vitest run scripts/hooks.test.mjs` : vert, 4 tests.
- Le cas 6 tient lieu de `npm run verifier` final : donner sa durée.

## Rapport attendu

Format commun (README de la série), plus :

- les sorties des cas 2 à 7, dont la valeur de `core.hooksPath`, et le cas 4 (fait ou non) ;
- les deux écarts au cahier : le `COPY` du Dockerfile et le plancher 22.22.2 ;
- « À trancher » : 1a contrôle exact d'`engines` (petit script lu par le hook), 1b le plancher.
