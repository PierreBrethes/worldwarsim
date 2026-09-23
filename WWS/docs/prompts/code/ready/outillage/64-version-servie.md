# 64-version-servie — le build écrit son SHA dans `version.json`, la CI vérifie que la prod le sert, et un onglet resté ouvert propose de recharger quand une version sort

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 62, 02, 63 (63 ajouté : le contrôle lit le `SHA` que son pas ssh envoie).

**À lire :** `vite.config.ts` (plugins ~10-17) · `deploiement/front.Dockerfile` (`ARG`/`ENV VITE_CONVEX_URL`
avant `npx vite build` ; `ARG BUILD_SHA` et `LABEL` de l'étage nginx, 62) · `deploiement/deployer.sh` (62 :
`compose build --build-arg BUILD_SHA=<sha> front`) · `deploiement/nginx.conf` (~23-29 : `location /` rend
`index.html` en 200 pour un fichier absent) · `src/main.tsx` ~12-31 · `src/routes/__root.tsx` (`Root`
~17-43) · `src/shell/notifications.tsx` (`Card`, `Notice`) · `src/shell/ErrorScreen.tsx` ·
`src/data/presence.ts` · `src/routes/-plateau/Window.test.tsx` (`vi.stubGlobal`) · `.github/workflows/ci.yml`
(job `deployer` après 62, 63, 44 : le `SHA` du pas ssh) · `deploiement/README.md` (§ 6 · Contrôle).

## Pourquoi

Rien ne dit quelle version est servie : `git grep -n "import.meta.env" -- src` ne rend que
`VITE_CONVEX_URL` et `DEV` ; le `LABEL` de 62 ne se lit que par `docker inspect` sur le VPS. Un jeu
asynchrone reste ouvert des jours ; `vite:preloadError` (main.tsx ~26-31) ne recharge que sur un chunk
effacé, « réessayer » (`ErrorScreen` ~29-32) rejoue le même bundle. 02 empêche l'ancien bundle de
planter sur une dépêche inconnue, pas d'afficher les règles d'avant (`PlayerView` a changé dans 20 des
80 derniers commits). Et le job `deployer` ne regarde jamais ce que le public reçoit.

## Ce qui change

1. `src/domain/build-version.ts` (à créer) : `DEV_BUILD = 'dev'` et `isNewBuild(bundled: string, served:
   unknown): boolean`, vrai seulement si `bundled !== DEV_BUILD` et que `served.sha` est une chaîne non
   vide différente de `bundled`. Une réponse illisible n'est pas une version neuve.
2. `vite.config.ts` : `const buildSha = process.env.BUILD_SHA || DEV_BUILD` (`||` : sans argument,
   l'`ENV` du Dockerfile pose une chaîne vide), `DEV_BUILD` importé du domaine (une source, 42). Un
   plugin local (`name: 'wws-version'`, `apply: 'build'`) émet dans `generateBundle` l'asset
   `version.json`, `{ "sha": buildSha, "builtAt": <ISO> }` ; et `define: { __BUILD_SHA__:
   JSON.stringify(buildSha) }`. Jamais `git` dans la config : le contexte Docker perdra `.git` (66).
3. `front.Dockerfile`, étage de construction : `ARG BUILD_SHA` puis `ENV BUILD_SHA=${BUILD_SHA}`, juste
   après la paire `VITE_CONVEX_URL` (plus haut, il invaliderait la couche de `npm ci`). Chaque étage
   déclare ses `ARG` : celui de nginx ne suffit pas. deployer.sh et compose ne bougent pas.
4. `nginx.conf` : `location = /version.json { try_files $uri =404; add_header Cache-Control
   "no-cache"; }` et une ligne de pourquoi (relu à chaque contrôle ; absent, 404 et non `index.html`).
5. `src/shell/NewVersionBanner.tsx` (à créer) : `declare const __BUILD_SHA__: string;`, `export const
   BUILD_SHA = __BUILD_SHA__`, `NewVersionBanner({ bundled })`. Avec `DEV_BUILD`, ni écoute ni
   minuterie. Sinon `fetch('/version.json', { cache: 'no-store' })` au `focus` de `window`, au
   `visibilitychange` redevenu `visible`, et toutes les `VERSION_CHECK_MINUTES = 10` minutes ; l'échec
   se tait ; la version neuve vue, plus de lecture. Bandeau `role="status"`, fixé en bas au centre au
   plan `--z-notice`, `max-w-[calc(100vw-32px)]`, papier et filet d'encre, kicker de `Notice`, bouton à
   l'encre pleine de « réessayer » ; pas de croix, le clic fait `window.location.reload()`. Monté dans
   `Root` à côté de `<Notifications />`, `bundled={BUILD_SHA}`.
6. `src/i18n/fr.ts`, près de `notifications` (~541) : `newVersion: { kicker: 'nouvelle version',
   message: 'Le jeu a été mis à jour depuis l’ouverture de cet onglet.', reload: 'recharger' }`.
7. `ci.yml`, job `deployer`, après le pas ssh : « Contrôler la version servie », six essais espacés de
   10 s de `curl -fsS https://wws.pierrebrethes.cloud/version.json | grep -q "$SHA"` ; au bout,
   `::error::` avec ce qui est servi, sortie 1. `SHA` est celui que le pas ssh envoie à deployer.sh
   (63) : s'il est posé au niveau du pas, le remonter en `env:` du job, lu par les deux pas, pour que 65
   n'ait qu'un endroit à changer. L'URL s'écrit à l'Edit, aucune commande ne la contient (hook de 16 :
   chercher `pierrebrethes` sans le domaine).
8. `deploiement/README.md` § 6 · Contrôle : une puce, `version.json` rend le commit déployé et la CI le
   vérifie après chaque déploiement.

## Ce que ce prompt ne fait pas

Pas de rechargement forcé (un joueur peut être en pleine visée) ; `ErrorScreen`, `vite:preloadError` restent.
Ni version dans Réglages, ni retour arrière (65), ni `.dockerignore` (66), ni runbook (67).

## Cas d'acceptation (tests d'abord)

1. `src/domain/build-version.test.ts` (à créer), rouge avant le module : `('aaa', { sha: 'bbb' })` vrai ;
   même SHA faux ; `bundled` `dev` faux quoi que serve le serveur ; `null`, `'x'`, `{}`, `{ sha: 42 }`,
   `{ sha: '' }` faux.
2. `src/shell/NewVersionBanner.test.tsx` (à créer, jsdom), `fetch` doublé par `vi.stubGlobal` : servi
   `bbb`, `bundled="aaa"`, un `focus` sur `window` → le bouton `fr.newVersion.reload` paraît ; servi
   `aaa` → rien ; `fetch` rejeté → rien, sans erreur ; `bundled="dev"` → `fetch` jamais appelé.
   L'import ne lève pas : que vitest applique `define` se constate, ne se suppose pas.
3. `BUILD_SHA=essai64 npx vite build` : `dist/version.json` porte `"sha":"essai64"` et `builtAt`,
   `grep -rl essai64 dist/assets` trouve le bundle ; sans la variable, `"sha":"dev"`.
4. Si `docker info` répond : `nginx -t` dans `nginx:alpine`, conf montée ; `dist` servi sur
   `127.0.0.1:8089`, `curl -sI …/version.json` montre `Cache-Control: no-cache` ; sans le fichier, 404.
   Puis le Dockerfile entier sur un contexte sans le `node_modules` du Mac (pas de `.dockerignore`
   avant 66) : `git ls-files -co --exclude-standard -z | tar --null -T - -cf - | docker build -f
   deploiement/front.Dockerfile --build-arg BUILD_SHA=essai64 -t essai64 -` ; `docker run --rm essai64
   cat /usr/share/nginx/html/version.json` rend `essai64`. Conteneurs et image supprimés.
5. actionlint par Docker (`rhysd/actionlint`, dernière version) sur ci.yml : aucun constat.

## Vérifications

Les deux tests par `npx vitest run`, puis `npm run verifier` : verts ; les cas 3 à 5 au rapport.

## Rapport attendu

Format commun (README de la série), plus : le constat de `define` sous vitest ; où le bandeau se voit
(plateau face à « à faire maintenant », salon, `BoardError` ; pas l'`errorComponent` de la racine, qui
remplace `Root`) ; pour Pierre au premier déploiement, le pas « Contrôler la version servie » vert, et
un onglet ouvert avant la poussée qui montre le bandeau au retour du focus puis recharge au clic.
