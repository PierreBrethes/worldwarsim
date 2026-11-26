# Déploiement — Convex auto-hébergé ([ADR 0010](../WWS/docs/adr/0010-convex-auto-heberge-sur-vps.md))

La même pile partout : `convex-backend` + dashboard en Docker, front statique Nginx. En dev le
front tourne via Vite, sur le VPS il est servi par le conteneur `front`, derrière le **Traefik
déjà en place sur le VPS** qui porte le TLS.

Les quatre adresses de production :

| Adresse | Sert | Conteneur |
|---|---|---|
| `wws.pierrebrethes.cloud` | le jeu | `front` (Nginx, port 80) |
| `convex.pierrebrethes.cloud` | l'API Convex + WebSocket | `backend` (port 3210) |
| `convex-actions.pierrebrethes.cloud` | les actions HTTP Convex | `backend` (port 3211) |
| `convex-dashboard.pierrebrethes.cloud` | la console d'admin Convex | `dashboard` (port 6791) |

Le dashboard s'ouvre depuis n'importe où, mais derrière deux barrières : le BasicAuth de
Traefik, puis la clé d'admin Convex (§ Dashboard).

## Dev local (Windows, Docker Desktop)

### Comptes — le wipe de C3, et son ordre

**C3 demande un wipe, et il n'est pas négociable** (décision 85a) : `players.accountId` est
obligatoire et `players.token` a disparu, donc les places déjà écrites ne passent plus la
validation du schéma. Aucune reprise, aucune migration — la saison en cours est perdue, c'est
le prix accepté pour que le compte possède ses places. Dans cet ordre, jamais l'inverse :

```bash
npx convex run dev:reset      # sur l'ANCIEN déploiement : les fonctions en place le portent
npx convex deploy             # ensuite seulement — sinon la poussée est refusée
```

Poussé d'abord, `convex deploy` échouerait sur les `players` sans `accountId`, et `dev:reset`
ne serait plus déployé pour les effacer. **Les comptes et les sessions survivent** : ils sont
hors de `GAME_TABLES` (`convex/dev.ts`), et un joueur retrouve son dossier après le wipe — il
n'y retrouve simplement aucune partie.

### Presse — rallumer une chaîne d'éditions

La presse n'a pas de planificateur au-dessus d'elle : chaque `press:publish` prend le
rendez-vous du suivant. Une saison dont ce maillon tombe **ne publie plus jamais, et rien ne le
dit** — c'est arrivé le 12/09 à 23 h 55, l'édition ayant dépassé la seconde d'une mutation et
emporté sa replanification dans l'annulation. Le travail est scindé depuis le 13/09
(`press:publish` prend le rendez-vous, `press:writeEditionJob` écrit l'édition), ce qui ferme
cette cause-là ; la sortie de secours reste :

```bash
CONVEX_SELF_HOSTED_URL=https://convex.pierrebrethes.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY=<la clé du VPS> \
npx convex run dev:relaunchPress
```

Elle rend `{ "relaunched": ["<code de saison>", …] }` — la liste vide veut dire que toutes les
saisons lancées ont déjà un travail en attente. **Idempotente** : elle ne relance que ce qui n'a
aucun `press:publish` en attente ou en cours, donc la lancer deux fois ne double pas une chaîne
et ne double pas les lignes d'une édition. Le symptôme à surveiller est la page Presse figée sur
une édition vieille de plus de trois heures.

### Vigies — après le déploiement de #370

Le silence des vigies et des stations d'écoute se tient sur la ligne du joueur
(`players.listeningSilent`, ADR 0037 §2), lu « entend » quand il manque. Une fois, juste après
la poussée qui l'apporte, sur chaque déploiement qui a des saisons lancées :

```bash
npx convex run dev:backfillListeningSilent
```

Elle rend `{ "players": N }` et planifie un `listening.reassess` par belligérant, qui règle son
économie et écrit son verdict. **Idempotente** : la relancer ne fait que relire.

### Tas — après le déploiement de #555

La dépêche « tas plein » vit d'un job par tas, que chaque écriture du tas replanifie. Une fois,
juste après la poussée, sur chaque déploiement qui a des Mondiales lancées :

```bash
npx convex run dev:commissionHeapFull
```

Elle rend `{ "players": N }` et planifie un `heapFull.commission` par belligérant : un tas déjà
plein est marqué dit, **sans dépêche rétroactive** ; les autres planifient leur plein. **Idempotente**.

### Avant-postes desservis — après le déploiement de #640

Les colonnes en route qui desservent un avant-poste vivent dans `outpostServing` (#640), et non
plus sur la ligne du point (`outposts.servedBy`, #633). Sans la migration, un point d'avant la
poussée sous une colonne déjà partie se démantèlerait jusqu'à son arrivée. Elle relit les
mouvements en route et vide l'ancienne liste. Une fois, juste après la poussée, sur chaque
déploiement qui a des saisons (elle remplace celle de #633, qu'il n'est plus utile de lancer) :

```bash
npx convex run dev:backfillOutpostServing
```

Elle rend `{ "scheduled": true }` et ne fait que planifier la première page : chaque page de
points se relit seule puis planifie la suivante. `npx convex logs` imprime une ligne par page,
`backfillOutpostServing: N points, more`, et la dernière finit par `done`. Une page qui échoue
s'annule en entier ; relancer reprend du début, sans risque. Une fois passée partout, `servedBy`
peut sortir du schéma : tant qu'un document le porte, la poussée est refusée.

### Comptes — récupération administrateur

Après un déploiement autorisé, un administrateur du backend peut exécuter la fonction
**interne** `auth:resetPassword` depuis la console Convex, avec les arguments
`{"nickname":"Pierre","password":"nouveau mot de passe"}` (exemple à remplacer).
L'équivalent CLI est `npx convex run auth:resetPassword '<objet JSON des arguments>'`.
Utiliser la console évite de saisir le secret dans l'historique du shell. Ne pas copier de
vrai secret dans un rapport. La fonction remplace le digest et révoque toutes les sessions
du compte dans une transaction ; les autres appareils doivent se reconnecter. Elle ne
crée pas de session et refuse un compte absent avec `ACCOUNT_NOT_FOUND`.

Les portes publiques sont les actions Node `auth:register` et `auth:login`, la query
`accounts:me` (`{nickname, seats}` ou `null` pour une session inconnue) et la mutation
`accounts:logout`, idempotente. La présence du jeu se tient sur la place (`players.lastSeenAt`,
`players:touch`) ; `sessions.lastSeenAt` reste seulement initialisée, personne ne la lit.

Pour C2, `npx convex codegen --typecheck disable` a échoué faute de backend local joignable
sur `127.0.0.1:3210`. Les deux références `accounts` et `auth` ont été ajoutées mécaniquement
à `convex/_generated/api.d.ts`, puis validées par TypeScript. Ce n'est pas une génération
automatique réussie ni une méthode universelle pour les futurs composants Convex.

### Démarrage local

1. Créer `.env` à la racine (jamais commité) :

   ```
   INSTANCE_SECRET=<64 caractères hexadécimaux — openssl rand -hex 32>
   ```

2. Lancer le backend et générer la clé d'admin (une fois) :

   ```bash
   docker compose up -d backend dashboard
   docker compose exec backend ./generate_admin_key.sh
   ```

3. Coller la clé dans `.env.local` (jamais commité) :

   ```
   CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
   CONVEX_SELF_HOSTED_ADMIN_KEY=<la clé>
   VITE_CONVEX_URL=http://127.0.0.1:3210
   ```

4. Déployer les fonctions puis lancer le front :

   ```bash
   npm run dev:complet   # Vite (HMR front) + convex dev (redéploie convex/ à chaque sauvegarde)
   ```

   → http://localhost:5173. Le front seul : `npm run dev` ; le backend seul : `npx convex dev`
   (`npx convex deploy` est le one-shot utilisé par la CI).
   Le dashboard est sur http://127.0.0.1:6791 (se connecter avec la clé d'admin).

## Voir une partie Mondiale en local

Avant : Docker (`worldwarsim-backend-1`) levé, `.env.local` visant 127.0.0.1, fonctions déployées
(`npx convex deploy`), `npm run dev` en cours, et une fois `npm i playwright-core@1.58` dans un
dossier hors du dépôt (`PLAYWRIGHT_DIR`).

```bash
npm run demo:mondiale   # deux comptes, une Mondiale lancée, stocks pleins, troupes posées
PLAYWRIGHT_DIR=/chemin/pw npm run capture -- '/plateau?season={saison}' plateau.png [--heure 2026-10-21T12:00Z] [--lieu …] [--compte a|b] [--largeur 390 --hauteur 844] [--attendre ms]
```

Le premier écrit `scripts/demo-mondiale.accounts.json` (ignoré par git : comptes, code et saison) et
refuse tout backend non local ; le second s'y connecte par `/connexion`, tamponne la notice d'entrée
et relève les erreurs de console. `--nu` au premier saute stocks et troupes. `--geste` (répétable :
`texte=…`, `clic=x,y`, `survol=x,y`, `molette=x,y,dy`, `pause=ms`, `ralenti=10` pour voir une animation à mi-course) provoque un état avant la
capture — par exemple `--geste 'clic=1392,660' --geste 'texte=Mine — charbon' --geste 'survol=995,425'`
pour voir le fantôme d'une pose.

Toujours `--heure` (un instant ISO avec Z ; midi UTC sans elle) : le cycle de deux heures fait sinon
tomber une capture sur deux de nuit, et une heure illisible est refusée. Et viser par id, pas à
l'œil : `--geste 'lieu=@stack-point:4.94,49.7'` cadre la pile là où elle est dessinée (3 par défaut,
`,distance,pente` pour changer) et attend ses figurines ; `lieu=@combat`, `@camion`, `@valette`,
`@paris` lisent les lieux que la démo écrit dans le fichier des comptes ; `toucher=@id`,
`doigt=@id`, `clic=@id` visent l'étiquette de l'id (`building-barracks@lon,lat`). `--compte` prend
toute clé du fichier des comptes.

## Jouer une Mondiale contre des bots en local (#601, ADR 0042)

Avant : Docker (`worldwarsim-backend-1`) levé, `.env.local` visant 127.0.0.1, fonctions de `main`
déployées, `npm run dev` en cours. Un bot est un joueur : il lit sa vue et passe ses ordres par les
mutations publiques, jamais par `dev:*`. Le script refuse tout backend non local et ne lit que
`VITE_CONVEX_URL` de `.env.local`.

```bash
npm run bots:mondiale -- --bots 3 --humains 1   # fonde, imprime le lien, attend 4 places prêtes, lance
npm run bots:mondiale -- --bots 2 --cadence 5   # sans humain : deux bots seuls, un passage toutes les 5 s
npm run bots:mondiale -- --bots 3 --code ABC123 # rejoint la saison d'un humain, qui la lance lui-même
```

- **Avec ton compte** : sans `--code`, ouvre le lien `/rejoindre/CODE` imprimé, prends une nation
  libre, déclare-toi prêt ; le script lance dès que les `--bots` plus `--humains` places sont
  prêtes. Avec `--code`, fonde ta saison dans le jeu, donne son code, puis lance-la toi-même.
- **Relance** : sans `--code`, le script reprend la saison de `scripts/bots-mondiale.accounts.json` tant qu'elle n'est pas conclue ; `--nouvelle` en fonde une autre. Avec `--code`, une saison déjà lancée est refusée (« rien à rejoindre »).
- **En pré-production** : ajoute `--preprod` à n'importe laquelle de ces commandes. Le script vise
  `https://convex.pierrebrethes.cloud` sans lire `.env.local`, imprime le lien
  `https://wws.pierrebrethes.cloud/rejoindre/CODE` et range ses comptes dans
  `scripts/bots-mondiale.preprod.accounts.json`. Il faut le laisser tourner toute la saison (sept
  jours) : sa machine éteinte, les bots ne jouent plus. Les fonctions de la pré-production doivent
  être celles de `main`, sinon un ordre que le domaine accepte peut être refusé.
- `--cadence` : secondes entre deux passages (30 par défaut). Un refus du serveur s'écrit sur une
  ligne (bot, ordre, code) et la boucle continue.
- Comptes `Bot1`…`BotN` (clés `a`…) et saison dans `scripts/bots-mondiale.accounts.json`, ignoré
  par git ; `npm run capture -- … --comptes scripts/bots-mondiale.accounts.json --compte a` filme la carte d'un bot.
- **Arrêter** : Ctrl-C, ou la fin de la saison.

## Banc de charge de la Mondiale (#143)

Même prérequis que ci-dessus (Docker levé, `.env.local` sur 127.0.0.1, `npx convex deploy` : le banc
appelle les fonctions `dev:bench*`). Il refuse tout backend non local.

```bash
npm run banc:mondiale   # 8 joueurs, ~150 troupes chacun, 161 mouvements en vol, 7 tournées, 7 rondes, ~35 s
npm run banc:mondiale -- --sans-rondes   # le même sans rondes, comparable aux mesures d'avant #377
```

Il fonde une nouvelle saison à chaque passage (comptes `Banc1`..`Banc8` dans
`scripts/banc-mondiale.accounts.json`, ignoré par git), puis imprime : `playerView` d'un joueur,
`reassessDetection`, `marchTo` sous charge, `recordLinkage` (la couleur retenue, #144), la chute
d'un QG tenant trois points (`captures.complete`, le pire geste de couleur, joué en dernier), jobs
planifiés en attente, et une montée en charge (20 à 161 mouvements). Durées et documents lus viennent du backend lui-même, par
`/api/stream_function_logs` (`executionTime`, `usageStats.databaseReadDocuments`) : pas le temps
client, réseau compris. Une exécution coupée à la seconde permise est marquée « coupée à 1 s » et
ne rend que ce qu'elle avait lu. Le nombre de jobs varie d'un passage à l'autre (rendez-vous de
contact selon les positions tirées).

## Banc client (#189)

Réservé au Mac : il lance le Chromium en cache de `~/Library/Caches/ms-playwright` (Metal) et lit
le temps CPU par `ps` à la manière de macOS ; il ne tourne pas sous Windows+WSL.

Même prérequis que la capture, plus une démo chargée (`npm run demo:mondiale -- --niveaux --edition
--points --artillerie` : bâtiments, presse, journal qui défile, colonnes en vol).

```bash
PLAYWRIGHT_DIR=/chemin/pw npm run banc:client   # build de prod VITE_BANC=1, ~8 min pour 2 profils × 3 passes
```

Il construit le front avec `VITE_BANC=1` (React de profilage, noms gardés, moteur en
`window.mapEngine`) dans `--sortie` (par défaut `$TMPDIR/banc-client`), le sert sur :4173, puis
joue le même parcours au téléphone (390×844, ×3, toucher, CPU ralenti ×4) et au bureau
(1440×900) : chaque surface ouverte puis fermée, le journal défilé, le plateau personnel tiré, la
fiche d'un bâtiment, la carte déplacée, zoomée, inclinée, 10 s de repos, puis le zoom d'un bout à
l'autre, l'abaque trié et une région survolée (touchée au téléphone). Par geste : images
(médiane, p95), tâches longues, délai jusqu'à l'image, commits et composants React, images de
carte par seconde, temps JS et GPU d'une image, appels de dessin, CPU du processus GPU. Médiane
de 3 passes (`--passes`), dans `banc-client.json` et `banc-client.txt`. `--profil telephone`
n'en joue qu'un, `--sans-build` reprend le dernier build, `--photos` capture chaque geste, `--sans-ombres` coupe les ombres de la lampe, pour lire leur coût, `--couches` mesure le GPU
d'une image de près puis de loin, chaque couche de la carte retirée à son tour (ombres, voile de nuit,
dessins, lavis, contours, mer…), `--heure 2026-10-21T00:00Z` tient le soleil à cet instant, `--cpu
'motif'` enregistre le profil CPU des gestes qui y répondent et en imprime les fonctions les plus
chères. Il imprime le haut de `ps` d'abord : un vérifieur ou des captures à côté faussent tout.

## VPS (Hostinger) — mise en prod initiale

En prod, le compose de dev est complété par
[`deploiement/compose.prod.yml`](compose.prod.yml) : **plus aucun port publié** (Docker
contourne ufw — un port publié sur le VPS est un port mondial), Traefik route par le réseau
Docker, dashboard compris. Toute commande compose sur le VPS prend les deux fichiers :

```bash
alias wws-compose='docker compose -f docker-compose.yml -f deploiement/compose.prod.yml'
```

### 0 · Vérifier Traefik — trois noms à relever

`compose.prod.yml` suppose un réseau `traefik`, un entrypoint `websecure` et un certresolver
`letsencrypt`. Relever les vrais noms et corriger le fichier si besoin :

```bash
docker ps                                  # le conteneur Traefik
docker inspect <traefik> --format '{{json .NetworkSettings.Networks}}'   # → le réseau
docker inspect <traefik> --format '{{json .Args}}'                       # → entrypoints + certresolver
                                           # (sinon : son traefik.yml / ses labels)
```

Vérifier aussi que Traefik écoute bien 80 **et** 443, et qu'il fait la redirection 80 → 443.

### 1 · DNS

Trois enregistrements A vers l'IP du VPS : `wws`, `convex`, `convex-actions`. Attendre la
propagation avant le premier `up` — Let's Encrypt échoue sur un DNS pas encore résolu, et
Traefik retente mais en pénalisant.

### 2 · Le repo

```bash
sudo mkdir -p /opt/worldwarsim && sudo chown $USER /opt/worldwarsim
git clone git@github.com:<compte>/worldwarsim.git /opt/worldwarsim
```

Avec une **deploy key en lecture seule** (GitHub → repo → Settings → Deploy keys), jamais une
clé de compte : le VPS n'a besoin que de `git pull`.

### 3 · `.env` de production (jamais commité)

```
INSTANCE_SECRET=<un autre secret que le dev — openssl rand -hex 32>
CONVEX_CLOUD_ORIGIN=https://convex.pierrebrethes.cloud
CONVEX_SITE_ORIGIN=https://convex-actions.pierrebrethes.cloud
```

`VITE_CONVEX_URL` n'a pas à y figurer : le build du front prend `CONVEX_CLOUD_ORIGIN` par
défaut (voir `docker-compose.yml`).

### 4 · Backend, clé d'admin, fonctions

```bash
wws-compose up -d backend dashboard
wws-compose exec backend ./generate_admin_key.sh    # → la clé, à garder pour la CI
```

Puis déployer les fonctions **une première fois à la main** (depuis le poste de dev — la CI
prendra le relais) :

```bash
CONVEX_SELF_HOSTED_URL=https://convex.pierrebrethes.cloud \
CONVEX_SELF_HOSTED_ADMIN_KEY=<la clé du VPS> \
npx convex deploy
```

### 5 · Le front

```bash
wws-compose --profile prod up -d --build front
```

### 5 bis · Notifications — clés VAPID

Les notifications (Web Push) signent leurs envois d'une paire de clés VAPID. **Elles vivent dans
l'environnement du Convex du VPS, jamais dans le dépôt ni dans le `.env` du front** — le client ne
reçoit que la clé publique, par `notifications:publicKey`.

```bash
npx web-push generate-vapid-keys        # une fois ; garder la paire hors du dépôt
```

Les poser sur le backend auto-hébergé (même variables d'environnement que pour `convex deploy`) :

```bash
export CONVEX_SELF_HOSTED_URL=https://convex.pierrebrethes.cloud
export CONVEX_SELF_HOSTED_ADMIN_KEY=<la clé du VPS>
npx convex env set VAPID_PUBLIC_KEY  <clé publique>
npx convex env set VAPID_PRIVATE_KEY <clé privée>
npx convex env set VAPID_SUBJECT     mailto:<une adresse qui répond>
```

Sans elles, rien ne casse : la file se remplit et se vide, et l'envoi consigne « clés VAPID
absentes » au lieu de partir. **Changer la paire désabonne tous les appareils** (leurs abonnements
sont liés à la clé publique) : ils devront réactiver la case des Réglages.

### 6 · Contrôle

- `https://wws.pierrebrethes.cloud` répond et le jeu se charge ;
- dans l'onglet réseau du navigateur, le WebSocket vers `convex.pierrebrethes.cloud` est
  **101 Switching Protocols** — c'est le test du passage des upgrades par Traefik ;
- `curl https://convex-actions.pierrebrethes.cloud` répond (peu importe le code : c'est le
  routage 3211 qu'on teste, l'ancien README l'oubliait) ;
- depuis l'extérieur, `curl http://<IP>:3210` et `:6791` **échouent** — rien ne publie ;
- `curl -o /dev/null -w '%{http_code}' https://convex-dashboard.pierrebrethes.cloud` répond
  **401** sans identifiants et **200** avec — un 200 tout court voudrait dire que le middleware
  BasicAuth n'est pas attaché au routeur.

## L'atlas (#213, ADR 0034)

`public/atlas.json` et `public/atlas-near.json` se cuisent depuis sept sources hors du dépôt,
épinglées par SHA-256 dans le script (qui dit où les télécharger) :

```bash
node scripts/generate-atlas.mjs <ne_10m_admin_1_states_provinces.geojson> \
  <vg2500_12-31.utm32s.shape.zip> <ne_10m_lakes.geojson> <ne_10m_populated_places.geojson> \
  <ne_10m_rivers_lake_centerlines.geojson> <rivers10.dbf> \
  <ne_10m_geography_marine_polys.geojson>
```

Natural Earth v5.1.2, tag du dépôt `nvkelso/natural-earth-vector` : admin-1, lacs et lieux
habités 10m (le fichier complet : `_simple` n'a pas `NAME_FR`), tous trois sous
`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/`, et le VG2500
du BKG (« © GeoBasis-DE / BKG », dl-de/by-2-0). Les fleuves (#440) viennent de deux fichiers du
même tag : la géométrie de `geojson/ne_10m_rivers_lake_centerlines.geojson`, restée ancienne
(noms anglais seuls, sans accents), et `name_fr` de
`10m_physical/ne_10m_rivers_lake_centerlines.dbf`, renommé `rivers10.dbf`. Les deux ne sont pas
dans le même ordre : le script apparie un tracé et un enregistrement par nom, `rivernum`,
`scalerank` et classe. Les mers et les océans (#457) viennent de
`geojson/ne_10m_geography_marine_polys.geojson`, du même tag. Puis, dans cet ordre : `generate-grid`, `generate-coast`,
`generate-region-index`, `generate-region-grid`,
`generate-region-types <dossier des rasters>` (qui écrit aussi `terrain-cells.json`, le terrain
des dessins par cellule), `generate-deposits`, `generate-deposit-basins`.

**Déployer le socle de l'atlas vide la base** (ADR 0034) quand ses arcs changent, en
pré-production comme en production : le sol, les points des régions, les gisements et la côte
changent sous une saison en cours, et aucune migration ne la porte. Base vidée d'abord, fonctions
déployées ensuite. Un ajout qui laisse les arcs tels quels (les villes et les fleuves, #440, les
mers, #457) ne vide pas la base.

Le script affiche le diff des `regionId` contre l'atlas qu'il remplace : un id qui disparaît
orpheline une capitale, un gisement ou une saison en cours.

## Médias

Les films ne sont pas dans le dépôt (plan-4b-2026-10-02) : le conteneur `front` monte
`/opt/worldwarsim-media` (ou `WWS_MEDIA_DIR` dans `.env`) en lecture seule sur `/media/`. Le
dossier se crée à la main **avant** le premier `up` — sinon Docker le crée vide, au nom de root.
Quatre fichiers (`src/shell/media.ts`) :

- `la-manchette-boucle-8s.mp4` et `la-manchette-boucle-poster.jpg` — le fond de `/connexion` et de `/rejoindre/CODE` ;
- `accueil-16x9.webm` et `accueil-9x16.webm` — le film de la une (`/`), bureau et téléphone : il ne se charge qu'à la demande, quand on ouvre « voir le film », sur son affiche (`public/film/`). Absents, la fenêtre dit qu'il n'est pas disponible. `npm run film` les tourne en local sur trois parties de démo et écrit `public/media/` (l'en-tête de `scripts/film-accueil.mjs` donne l'ordre) ; il est dans `scripts/`, il n'en sort rien vers un serveur.

```bash
scp "Claude outputs/film/la-manchette-boucle-8s.mp4" \
    "Claude outputs/film/la-manchette-boucle-poster.jpg" \
    "Claude outputs/film/accueil-16x9.webm" "Claude outputs/film/accueil-9x16.webm" \
    <vps>:/opt/worldwarsim-media/
ssh <vps> 'chmod 755 /opt/worldwarsim-media && chmod 644 /opt/worldwarsim-media/*'
```

**Le `chmod` n'est pas facultatif.** `scp` recopie les droits de la source, et les fichiers du Mac
sont en 600 : le nginx du conteneur, qui lit sous son propre utilisateur, répond alors **403**
(constaté le 05/10/2026).

Absents, rien ne casse : le fond retombe sur la table de carte et la fenêtre du film dit qu'il
n'est pas disponible. En local, les déposer dans `public/media/` (ignoré par git). La création du
dossier sur le VPS : [`WWS/docs/prompts/vps/dossier-media.md`](../WWS/docs/prompts/vps/dossier-media.md).

## CI/CD (GitHub Actions)

Un seul workflow, `.github/workflows/ci.yml` : le job `verifications` (la même liste
`npm run verifier` que le hook pre-push — elle ne diverge jamais) puis, s'il passe, le job
`deployer` — fonctions Convex d'abord, reconstruction du front sur le VPS ensuite.

Secrets à créer dans GitHub → Settings → Secrets and variables → Actions :

| Secret | Contenu |
|---|---|
| `CONVEX_SELF_HOSTED_URL` | `https://convex.pierrebrethes.cloud` |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | la clé générée à l'étape 4 |
| `VPS_HOTE` | l'IP du VPS |
| `VPS_UTILISATEUR` | l'utilisateur SSH |
| `VPS_CLE_SSH` | une clé privée SSH **dédiée au déploiement** (générée pour ça, ajoutée à `authorized_keys` du VPS) |
| `VPS_CHEMIN` | `/opt/worldwarsim` |

Un `convex deploy` dont la migration de schéma est incompatible avec les données en place
**échoue, et c'est voulu** : une saison en cours ne se casse pas en silence — on wipe
(off-season) ou on écrit la migration, puis on relance le job (`workflow_dispatch`).

## Dashboard

`https://convex-dashboard.pierrebrethes.cloud`, depuis n'importe quel navigateur. Deux
barrières successives : le BasicAuth de Traefik, puis la clé d'admin Convex à la connexion.
Le sous-domaine n'est pas secret — c'est le mot de passe qui tient la porte.

Le couple identifiant/hash est dans `WWS_DASHBOARD_AUTH` du `.env` du VPS (jamais commité, le
`.env` est ignoré). Pour le changer :

```bash
htpasswd -nbB <utilisateur> <mot de passe>          # sur le VPS
# reporter dans .env en DOUBLANT chaque `$` du hash — Compose interpole les valeurs du .env,
# et un `$tqFtK…` non doublé part en variable vide, ce qui laisserait un users vide.
docker compose -f docker-compose.yml -f deploiement/compose.prod.yml --profile prod up -d dashboard
```

La clé d'admin, elle, se régénère par `docker compose exec backend ./generate_admin_key.sh` :
elle dérive d'`INSTANCE_SECRET`, donc la relancer ne casse pas les clés déjà distribuées.

`NEXT_PUBLIC_DEPLOYMENT_URL` pointe sur l'origine publique : le dashboard parle au backend par
`https://convex.pierrebrethes.cloud`, depuis le navigateur — normal, il n'y a pas d'appel
serveur à serveur.

## Sauvegardes (#650)

Tout l'état vit dans le volume `convex-data` : la base SQLite et le stockage de fichiers du
backend (les modules déployés y vivent). `deploiement/sauvegarde.sh` en tire chaque nuit une
archive `wws-AAAA-MM-JJTHHMMZ.tar.gz` et son empreinte `.sha256` :

- la base est copiée à chaud par `VACUUM INTO` (une seule transaction de lecture, que les
  écritures du backend ne dérangent pas), puis relue en entier (`PRAGMA integrity_check`) ;
- un `MANIFEST` dit la date et **l'image exacte du backend** (son digest) : restaurer sous une
  autre version de Convex est un pari ;
- la copie locale reste 14 jours dans `WWS_SAUVEGARDES_DIR` (`./sauvegardes`, ignoré par git),
  et part **hors du VPS** par rclone si `WWS_DISTANT` est posé.

Les outils (sqlite3, rclone) tournent dans le conteneur `outils`, sur le même volume que le
backend : l'hôte n'a besoin que de Docker. Le cron d'avant (`sqlite3` dans le conteneur du
backend, copies dans `~/sauvegardes`) est remplacé.

### Mise en place sur le VPS (une fois)

1. **Un stockage objet chez un autre fournisseur que l'hébergeur du VPS**, compatible S3
   (Scaleway Object Storage, Backblaze B2…). Un bucket `wws-sauvegardes`, une **règle de cycle
   de vie qui efface après 30 jours**, et une clé d'accès limitée à ce bucket, **sans droit
   d'effacer** si le fournisseur le permet : un VPS compromis ne peut alors rien effacer
   au-dehors.
2. `sauvegardes/rclone/rclone.conf` (`chmod 600`), sur ce modèle :

   ```ini
   [stockage]
   type = s3
   provider = Scaleway
   region = fr-par
   endpoint = s3.fr-par.scw.cloud
   access_key_id = <clé>
   secret_access_key = <secret>

   # Chiffrée avant de partir : la base porte les empreintes des mots de passe et les
   # abonnements aux notifications.
   [hors-vps]
   type = crypt
   remote = stockage:wws-sauvegardes
   password = <sortie de : wws-compose --profile outils run --rm outils rclone obscure '<phrase>'>
   ```

3. Dans `.env` :

   ```
   WWS_DISTANT=hors-vps:
   # Vide : le cycle de vie du bucket fait la rétention. `30d` si la clé a le droit d'effacer.
   WWS_RETENTION_DISTANTE=
   # Facultatif : un contrôle healthchecks.io, qui écrit si aucun ping n'arrive en 25 h.
   WWS_PING_URL=https://hc-ping.com/<uuid>
   ```

4. Le cron (`crontab -e`), à la place de l'ancien :

   ```
   10 4 * * * /opt/worldwarsim/deploiement/sauvegarde.sh >> $HOME/wws-sauvegarde.log 2>&1
   ```

5. **Garder hors du VPS** (gestionnaire de mots de passe) le `.env` de production et
   `rclone.conf` : sans la phrase du `crypt`, les copies distantes sont illisibles ; sans
   `INSTANCE_SECRET`, la clé d'admin ne se régénère pas à l'identique.

### Vérifier que la dernière copie distante est récente

```bash
wws-compose --profile outils run --rm outils fraicheur
# dernière copie : hors-vps:/wws-2026-11-25T0410Z.tar.gz, il y a 6 h
```

Elle échoue au-delà de 26 h. Une archive sans son `.sha256` est un envoi interrompu : elle ne
compte pas, ni ici ni pour `recuperer derniere`.

### Essai de restauration

À jouer après la mise en place, puis après chaque changement d'image du backend :

```bash
deploiement/restauration.sh derniere      # ou le nom d'une archive de WWS_SAUVEGARDES_DIR
```

Il ramène la copie distante, vérifie son empreinte et l'intégrité de la base, la remonte dans
un projet compose à part (`wws-essai`, son propre volume) sous l'image du `MANIFEST`, puis
imprime l'adresse (`127.0.0.1:3310`) et la clé d'admin. Le backend d'essai **n'a aucune sortie
réseau** (`deploiement/compose.essai.yml`) : ses jobs planifiés tournent dès le démarrage, et
une copie ne doit jamais envoyer une notification à un vrai joueur. Depuis le poste de dev :

```bash
ssh -L 3310:127.0.0.1:3310 <vps>          # dans un autre terminal
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3310 CONVEX_SELF_HOSTED_ADMIN_KEY='<la clé imprimée>' \
  npx convex data seasons                 # les saisons de la copie se relisent
deploiement/restauration.sh --nettoyer    # sur le VPS : arrête l'essai, efface son volume
```

### Restaurer la production

Base perdue ou abîmée, sur le VPS :

```bash
deploiement/sauvegarde.sh                                          # l'état présent, d'abord
wws-compose --profile outils run --rm outils recuperer derniere    # imprime le nom de l'archive
tar -xzOf sauvegardes/<archive> --wildcards '*/MANIFEST'           # relever image=…
wws-compose stop backend
wws-compose --profile outils run --rm -e WWS_ECRASER=1 outils restaurer <archive>
# Si l'image relevée n'est pas celle qui tourne : WWS_BACKEND_IMAGE=<image> dans .env
wws-compose up -d backend
```

Sur un VPS neuf : les étapes 0 à 2 de la mise en prod, le `.env` et le `rclone.conf` gardés
hors du VPS remis en place, puis la même suite sans sa première ligne ; ensuite l'étape 5 (le
front). Les fonctions déployées et les variables d'environnement Convex (clés VAPID) sont dans
l'archive ; si une fonction manque malgré tout, `npx convex deploy` la repousse.

Le port de l'essai se change par `WWS_ESSAI_PORT` s'il est pris sur le VPS.
