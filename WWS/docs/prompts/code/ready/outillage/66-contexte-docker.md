# 66-contexte-docker — le contexte Docker du front ne porte que ce que `vite build` lit, une URL Convex absente fait échouer le build de prod, et `convex deploy` ne retype plus

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 62, 12, 64 (ajoutés : 12, car `--typecheck disable` n'est sûr que si `npm run types` type
déjà `convex/tsconfig.json`, le projet que `convex deploy` type ; 64, pour `BUILD_SHA` et `version.json`).

**À lire :** `deploiement/front.Dockerfile` (entier) · `docker-compose.yml` (`front.build.args` ~37) ·
`deploiement/compose.prod.yml` (service `front` ; le `:?` de `WWS_DASHBOARD_AUTH` ~60) ·
`.github/workflows/ci.yml` (le `npx convex deploy` de `deployer`) · `package.json` (`types` après 12) ·
`deploiement/deployer.sh` (62 : ses purges) · `deploiement/README.md` (§ 3 ~154-163) · `.gitignore`.

## Pourquoi

Aucun `.dockerignore` : `COPY . .` met tout le dossier dans le contexte et dans une couche. Par `du -sk`
à la rédaction : `.git` 102 Mio, `WWS` 83 (74 de sprites), sur le Mac `node_modules` 336 et `dist` 11,
contre environ 12 Mio que le build lit (`src` 5, `public` 4,7, `convex` 1,5, le lockfile). Sur le VPS
le `.env` (`INSTANCE_SECRET`, `WWS_DASHBOARD_AUTH`) y entre. Le gain est le contexte, pas le build : le
SHA gravé par 64 relance `vite build` (870 Mio de RSS en pointe) à chaque déploiement. docker-compose.yml
~37 retombe sans bruit sur 127.0.0.1 : `WWS_DASHBOARD_AUTH=x:y docker compose -f docker-compose.yml -f
deploiement/compose.prod.yml --profile prod config` sort 0 avec `VITE_CONVEX_URL:
http://127.0.0.1:3210` (vérifié ; le `.env` du Mac ne porte qu'`INSTANCE_SECRET`), un front qui ne
parle à personne. Et `convex deploy` type par défaut (`--typecheck try`, `cli.bundle.cjs` ~132628) :
un troisième tsc, quand `verifications` type les deux projets depuis 12.

## Ce qui change

1. `.dockerignore` (à créer), à la racine : `.git`, `WWS`, `node_modules`, `dist`, `.env*`, `.claude`,
   `**/*.md`, et `Claude outputs` seulement s'il existe encore (29 le retire). En tête, deux lignes de
   `#` : le contexte part au démon du VPS avec le `.env`, et le build ne lit que `src`, `public`,
   `convex`, `index.html`, les configurations, `deploiement/nginx.conf` et `scripts/installer-hooks.mjs`
   (le `prepare` de 11, copié avant `npm ci`). **Avant d'écrire**, le vérifier : chaque `COPY` du
   Dockerfile trouve sa source ; `git grep -n "WWS/" -- src convex vite.config.ts` ne rend que des
   commentaires ; le seul `?raw` est `src/emblems/ussr.svg` ; `src` importe `convex/` (`_generated`,
   `constants`, `errors`, `constructions`) et `public/*.json`, qui restent. Compose lit `.env` depuis le
   disque, pas depuis le contexte : l'exclure ne change pas l'interpolation.
2. `compose.prod.yml`, service `front` : `build.args.VITE_CONVEX_URL: ${CONVEX_CLOUD_ORIGIN:?definir
   CONVEX_CLOUD_ORIGIN dans .env — voir deploiement/README.md}`, même forme que `WWS_DASHBOARD_AUTH`,
   avec une ligne de pourquoi. `docker-compose.yml` ne bouge pas : un build local du profil `prod`
   garde 127.0.0.1. Désormais toute commande `wws-compose` exige la variable, que le `.env` du VPS
   porte déjà (README § 3).
3. `ci.yml` : `npx convex deploy --typecheck disable`, avec une ligne : les types sont vérifiés par le job
   `verifications`, les deux projets tsc compris (12).
4. `deploiement/README.md` § 3 : « `VITE_CONVEX_URL` n'a pas à y figurer : le build du front prend
   `CONVEX_CLOUD_ORIGIN` par défaut » devient : il n'y figure pas, le build prend `CONVEX_CLOUD_ORIGIN`,
   que `compose.prod.yml` exige.

## Ce que ce prompt ne fait pas

Les purges sont dans deployer.sh (62). Ni `dist/` construit en CI puis copié (seulement si `docker
stats` montre une contention pendant un build), ni `mem_limit`, ni répétition du déploiement en CI
(réservée au prochain refus d'une famille inconnue), ni `vite build` dans `verifier` (13), ni runbook (67).

## Cas d'acceptation (tests d'abord)

Taille de contexte mesurée par le constructeur classique, qui envoie tout le contexte (BuildKit ne transfère
que la différence) : `printf 'FROM scratch\nLABEL essai=66\n' | DOCKER_BUILDKIT=0 docker build -f - -t
essai66-contexte .`, ligne `Sending build context to Docker daemon`.

1. Avant tout changement : la mesure (≈ 540 Mio attendus sur le Mac), et la commande `config` du
   Pourquoi, `| grep VITE_CONVEX_URL`, qui rend `127.0.0.1` : c'est le rouge.
2. Après : la mesure (≈ 12 Mio attendus). `docker build -f deploiement/front.Dockerfile -t essai66 .`
   (constructeur par défaut, comme le VPS) réussit ; `docker run --rm essai66 ls /usr/share/nginx/html`
   montre `index.html`, `assets` et `version.json` (64).
3. `docker build --target construction -f deploiement/front.Dockerfile -t essai66-construction .`, puis
   `docker run --rm essai66-construction sh -c 'ls -A /app; ls /app/node_modules/@rolldown; find /app
   -name "*.md" -not -path "/app/node_modules/*"'` : ni `.git`, ni `WWS`, ni `.env*`, ni `.claude`,
   aucun `binding-darwin-*` (le `node_modules` est celui de `npm ci`), aucun `.md`.
4. `env -u CONVEX_CLOUD_ORIGIN WWS_DASHBOARD_AUTH=x:y docker compose -f docker-compose.yml -f
   deploiement/compose.prod.yml --profile prod config >/dev/null` sort non nul, stderr nomme
   `CONVEX_CLOUD_ORIGIN` ; avec `CONVEX_CLOUD_ORIGIN=https://exemple.invalid` et `| grep VITE_CONVEX_URL`,
   `https://exemple.invalid` ; `docker compose -f docker-compose.yml --profile prod config | grep
   VITE_CONVEX_URL`, toujours `127.0.0.1:3210`. Jamais la sortie entière : elle porte l'`INSTANCE_SECRET`.
5. `git grep -c "convex deploy --typecheck disable" .github/workflows/ci.yml` : 1. actionlint par Docker
   (`rhysd/actionlint`, dernière version) : aucun constat.

## Vérifications

Les cas 1 à 5, sorties notées ; images `essai66*` supprimées. `npx prettier --check deploiement/compose.prod.yml
.github/workflows/ci.yml`, `git diff --quiet docker-compose.yml`, `npm run verifier` : verts.

## Rapport attendu

Format commun (README de la série), plus :

- les deux tailles de contexte, la durée du build complet, et celle d'un second build (mêmes arguments)
  avec un `essai66.md` posé à la racine (puis retiré) : la couche `COPY` y reste `CACHED` ;
- pour Pierre au prochain déploiement : `docker system df` sur le VPS avant et après ; une commande
  `wws-compose` qui échoue sur `CONVEX_CLOUD_ORIGIN` voudrait dire que le `.env` du VPS l'a perdu ;
- en « À trancher » : construire `dist/` en CI et le copier (retour arrière instantané, plus de Node sur
  le VPS), à décider sur une mesure de `docker stats` pendant un build.
