# 60-test-de-restauration — `npm run prod -- restore-test <copie>` restaure une sauvegarde sur un backend jetable local et prouve que le temps du jeu y tourne

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 07, 08, 15, 57, 69.
**Pierre d'abord :** le backend local tourne le digest épinglé par 15, recréé par Pierre après sa propre copie (`docker inspect --format '{{.Config.Image}}' worldwarsim-backend-1` → la référence `@sha256:` du compose).

**À lire :** `deploiement/sauvegarder.sh` (07 : `wws-*`, `MANIFEST`) ; `scripts/prod.mjs` et son test
(57 : `childEnv`, `convexCall`, sorties) ; `scripts/read-health.mjs` (09 : `verdictOf`) ; `convex/ops.ts`
(08 : `health`, `internalQuery` qui exige `{ now }` et ne compte pas les travaux en attente) ;
`docker-compose.yml` (15 ; `INSTANCE_NAME` ~11) ; `convex/press.ts` (`publish` ~68-97) ; `convex/seasons.ts`
(~446) ; `/convex/read_credentials.sh` de l'image backend ; `node_modules/convex/dist/cli.bundle.cjs`
(`listDocuments` ~133616 : `data` rend 100 documents par défaut) ; `WWS/docs/RESTE-A-CODER.md` (~145,
ou là où 30 l'a rangé) ; `WWS/docs/technique/partie-de-controle-a-deux.md` (Préalable 1, ~9).

## Pourquoi

Aucune restauration n'a jamais été tentée : « le plus vieux point ouvert » (RESTE-A-CODER ~145, repris
par la feuille de contrôle ~9 et deux rapports datés). Tout le temps du jeu passe par les travaux
planifiés (24 appels `runAt`/`runAfter` hors tests) : une base restaurée sans eux sert ses pages et ne
bouge plus. Relevé le 23/09 sur une copie de la base locale : la saison `6TX4V5` est `launched` sans
**aucun** travail en attente (horloge de 168 h passée, `publish` ne reprend plus rendez-vous) ; une
copie prise ce jour-là ne prouverait rien, d'où 69.

## Ce qui change

1. **`restore-test <dossier> [--garder]`** dans `scripts/prod.mjs` (57), **local seulement** : jamais
   `prod.env` (57 ne le lit que dans ses sous-commandes) ; une garde n'accepte que `http://127.0.0.1:3310`.
   Sorties de 57 : 0, 1 verdict en échec, 2 refus. Parties pures exportées.
2. **Avant de créer quoi que ce soit** : le dossier porte `db.sqlite3`, `storage.tar.gz` et
   `MANIFEST` ; `db_sha256` et `storage_sha256` concordent (`node:crypto`) ; `docker-compose.yml`
   donne `convex-backend@sha256:…` (refus si `:latest`) et c'est `backend_digest` du MANIFEST, sinon
   refus qui nomme les deux (une copie se relit sur la version qui l'a écrite).
3. Volume et conteneur `wws-restauration-<horodatage>`, étiquetés `wws.restore-test=1` ; la copie
   entre par un jetable de **l'image backend** (`cp`, `tar`) : `db.sqlite3` et `storage/`, sans `credentials/`.
4. Démarrage : `127.0.0.1:3310→3210`, `127.0.0.1:3311→3211`, `INSTANCE_NAME=worldwarsim` (défaut du
   compose), `CONVEX_*_ORIGIN` sur 3310/3311, `DISABLE_BEACON=true`. **Secret neuf par défaut** (rien
   de passé, `read_credentials.sh` en tire un : la perte du VPS emporte son `.env`) ; `WWS_RESTORE_INSTANCE_SECRET`
   le remplace (`-e INSTANCE_SECRET` sans valeur, jamais en argv). Attente de `/version`, 60 s au plus.
5. Clé d'admin : dernière ligne de `docker exec … ./generate_admin_key.sh`, en mémoire, jamais imprimée.
   Chaque appel à la CLI passe par `convexCall`, `env: childEnv(process.env, { url, adminKey })` (57, `url` celle de la garde) :
   la clé ne vit que dans l'environnement, jamais en argv, et il l'emporte sur le `.env.local` (3210).
6. **Verdict** : `run ops:health {"now":<Date.now()>}` relu toutes les 10 s, 60 s au plus (un backend
   restauré rattrape d'abord ses échéances), lu par `verdictOf` ; puis les travaux `pending` par `data
   _scheduled_functions --format jsonl --limit 100000`, filtrés sur `state.kind` (forme à vérifier ;
   `ops.ts` ne se touche pas). **Échec** si `health` n'est pas ok ou si **aucun** travail en attente
   n'a survécu. Rien n'est redéployé : si `ops:health` manque, la copie précède 08, le dire.
7. **Démontage garanti** : `finally` et `SIGINT`/`SIGTERM` → `docker rm -f` puis `docker volume rm`.
   `--garder` le saute et imprime URL, commande de la clé et nettoyage (la copie de P7). Un reste
   étiqueté fait refuser la commande ; elle ne supprime jamais ce qu'elle n'a pas créé.
8. Docs : l'item de RESTE-A-CODER dit ce qui est fait (date, commande, copie locale) et ce qui reste
   (une copie de **prod**, P7) ; le Préalable 1 de `partie-de-controle-a-deux.md` remplace la procédure
   morte (le `wws-*.sqlite3` du cron) par la commande. Rapports datés intouchés.

## Ce que ce prompt ne fait pas

Rien contre la prod : ni copie tirée du VPS, ni rotation du secret (P7), ni export (09), ni réplique.

## Cas d'acceptation (tests d'abord)

1. Unitaires (`scripts/prod.test.mjs`), rouges puis verts : MANIFEST sans `db_sha256`, digests
   différents (message qui nomme les deux), `https://convex.pierrebrethes.cloud`, `http://localhost:3310`,
   `http://127.0.0.1:3210`, compose en `:latest` → refus ; `health` ok + 0 en attente ou `health` non ok
   → échec ; ok + ≥ 1 → succès ; `HOME` temporaire sans `prod.env` : sans dossier, sortie 2 sur l'usage.
2. Source (backend local permis ici, lui seul) : `npm run partie:locale` (69), puis `npx convex run
   ops:health "{\"now\":$(date +%s)000}"` contre 3210 (absent : `npx convex dev --once`, jamais `deploy`) ;
   source pas ok : s'arrêter et le rapporter (c'est 08). Noter ses travaux en attente.
3. `dash deploiement/sauvegarder.sh "$ESSAI"` (un `mktemp -d` du scratchpad) puis `npm run prod --
   restore-test "$ESSAI"/wws-…` : succès, au moins un travail en attente restauré ; durée notée.
4. Un octet altéré dans `db.sqlite3` : refus avant tout objet Docker ; `kill -INT` pendant l'attente
   de `/version` : rien ne reste (`docker ps -a`, `docker volume ls` filtrés sur l'étiquette).
5. Backend de dev intact : même `State.StartedAt`, toujours `healthy`.
6. Seulement si le secret neuf échoue : relancer avec `WWS_RESTORE_INSTANCE_SECRET` = l'`INSTANCE_SECRET`
   du `.env` local, jamais imprimé (si 16 l'interdit, ne pas contourner).

## Vérifications

`npx vitest run scripts/prod.test.mjs` ; les cas 2 à 5 ; `npm run verifier` vert.

## Rapport attendu

Format commun (README de la série), plus :

- durée de `restore-test`, taille restaurée, travaux en attente source → restauré ; le verdict au
  secret neuf, première réponse à P7 (changer `INSTANCE_SECRET` casse-t-il les données ?) ;
- **la procédure P7** pour Pierre. Sur une copie de prod (`scp` d'un `wws-*`, `restore-test --garder`) :
  ancienne clé refusée, nouvelle acceptée, un compte se connecte (`VITE_CONVEX_URL=http://127.0.0.1:3310 npm
  run dev`), un travail planifié s'exécute. En prod : sauvegarde (07) → `openssl rand -hex 32` dans le `.env`
  → `wws-compose up -d backend` → `generate_admin_key.sh` → secret GitHub `CONVEX_SELF_HOSTED_ADMIN_KEY` et
  `~/.config/wws/prod.env` → `npm run prod -- status` → un `workflow_dispatch`. Le secret se range **hors** du VPS ;
- l'item de RESTE-A-CODER tel que réécrit.
