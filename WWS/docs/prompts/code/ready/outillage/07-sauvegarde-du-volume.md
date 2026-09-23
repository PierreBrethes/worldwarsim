# 07-sauvegarde-du-volume — `deploiement/sauvegarder.sh` copie la base et les modules hors du volume, contrôle la copie et la date

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `deploiement/README.md` (§ Sauvegardes ~243-253 ; dépôt du VPS dans `/opt/worldwarsim`,
~147), `docker-compose.yml` (volume `convex-data` ~9 et ~44-45, sans `name:`), `/convex/read_credentials.sh`
de l'image backend (`docker exec worldwarsim-backend-1 cat …`).

## Pourquoi

Le cron du README (~250) lance `sqlite3` **dans** le conteneur backend, dont l'image (Ubuntu 24.04)
ne l'a pas : `docker exec worldwarsim-backend-1 sh -c 'command -v sqlite3'` sort en 127, la chaîne
`&&` s'arrête sans rien copier ni rien dire. Aucune sauvegarde n'a donc probablement jamais tourné
(P1 le dira). Réparée, elle écrirait dans le volume vivant et ne prendrait que `db.sqlite3` (8,3 Mo
en local), sans `storage/` (96 Mo, 145 paquets dans `storage/modules`) que la base référence, ni le
commit ou le backend d'origine. L'ADR 0010 en fait pourtant « le prix accepté » de l'auto-hébergement.

## Ce qui change

1. `deploiement/sauvegarder.sh` (à créer) : sh POSIX (le `/bin/sh` du VPS est dash), `set -eu`,
   `chmod +x`. Dépôt déduit de l'emplacement du script (`dirname "$0"`, `..`, `pwd -P`) ; `PATH`
   posé en tête (`/usr/local/bin:/usr/bin:/bin`), cron n'en fournit presque pas. Un argument
   facultatif, la destination (`$HOME/sauvegardes` par défaut).
2. **Le volume se résout, il ne se recopie pas** : clé `convex-data`, nom Docker lu dans
   `docker compose -f "$DEPOT/docker-compose.yml" config` (bloc `volumes:`, ligne `name:`, sans `jq`) —
   `worldwarsim_convex-data` sur le Mac comme sur le VPS ; introuvable par `docker volume inspect` :
   échec. Cette sortie porte `INSTANCE_SECRET` (lu dans `.env`) : en mémoire, jamais au journal.
3. **Un conteneur jetable** (`docker run --rm`) d'une image qui **contient** sqlite3, épinglée par le
   digest de son **index** multi-architecture : `alpine/sqlite@sha256:cd3fda4f01e81f3ea0142a9e3da0cfabfa4bf86669fdcbff1fbeb73d6ba313aa`
   (relevé le 23/09, index OCI amd64 et arm64 ; revérifier par `docker buildx imagetools inspect`).
   Pas d'`apk add` : rien ne passe par le réseau à 4 h. `--entrypoint sh`, `--user "$(id -u):$(id -g)"`,
   volume en **lecture seule** (`:ro`), destination en écriture. Dedans, dans cet ordre : `sqlite3`
   avec `.timeout 20000` puis `.backup` de `/data/db.sqlite3` (cohérent à chaud) ; `PRAGMA
   integrity_check` sur la **copie**, exactement `ok` ; `tar -czf storage.tar.gz -C /data storage`
   **après** le `.backup` (les modules que la copie référence sont déjà là) ; `sha256sum` des deux.
   Essayé le 23/09 à chaud sur le backend local : `ok`, 145 blobs, 98 Mo de tar. Ni `credentials/`
   (`instance_secret` en clair, qui vit dans `.env` ; une copie qui voyage, 09, ne l'emporte pas) ni `tmp/`.
4. Travail dans `<dest>/.en-cours-<horodatage>`, renommé `<dest>/wws-<AAAA-MM-JJTHHMMSSZ>` (UTC)
   une fois tout réussi — cible déjà présente : échec, un `mv` la rangerait dedans ; sur échec, un
   `trap` retire le partiel : il n'a jamais l'air d'une copie.
5. `MANIFEST`, lignes `clé=valeur` que 60 relira : `date` ; `depot_sha` (`git -C "$DEPOT" rev-parse
   HEAD`) et `depot_modifie` (`oui`/`non`, `git diff --quiet HEAD`) ; `backend_image_id` et
   `backend_digest` (conteneur `backend` du compose, en marche ou arrêté, `ps -a -q backend`, puis
   `.Image`, puis `RepoDigests` → `…convex-backend@sha256:…`) ; `sqlite_image` ;
   `integrity_check=ok` ; `db_sha256` ; `storage_sha256`. Sans conteneur ou sans digest : échec.
6. **Rétention**, après un succès seulement : `find "$DEST" -maxdepth 1 -type d -name 'wws-*'
   -mtime +14` supprimé, rien d'autre. Une ligne par étape, la dernière donne le chemin. Code non
   nul au moindre échec ; sh n'a pas `pipefail`, donc aucun tube dans un pas qui compte.
7. `deploiement/README.md`, § Sauvegardes : le bloc cron devient
   `10 4 * * * /bin/sh /opt/worldwarsim/deploiement/sauvegarder.sh >> $HOME/sauvegardes/sauvegarde.log 2>&1`,
   puis ce que contient une copie, puis les étapes de Pierre (P6) : `ls -la ~/sauvegardes`, `crontab -l`
   et retrait de l'ancienne ligne, `mkdir -p ~/sauvegardes`, `docker pull` de l'image épinglée, un
   passage à la main et lecture du `MANIFEST`, la nouvelle ligne, le lendemain `ls` et `tail` du journal.

## Ce que ce prompt ne fait pas

Ni restauration (60), ni copie hors du VPS ou alerte (09), ni épinglage du backend (15), rien sur le
VPS ; `depot_sha` est l'arbre du VPS, pas ce que `convex deploy` a poussé (62).

## Cas d'acceptation (tests d'abord)

Scénario écrit avant le script, rouge (script absent) puis vert, dans le scratchpad et hors du dépôt
(il exige Docker et le backend local, que ni `verifier` ni la CI n'ont), sur le Mac contre
`worldwarsim-backend-1`, sans rien y écrire ; `ESSAI` = un `mktemp -d` sous le scratchpad.

1. `sh -n` et `dash -n deploiement/sauvegarder.sh` : exit 0.
2. `dash deploiement/sauvegarder.sh "$ESSAI"` : exit 0 ; un seul `wws-*` (`db.sqlite3`,
   `storage.tar.gz`, `MANIFEST`), aucun `.en-cours-*`.
3. `sqlite3 "$ESSAI"/wws-*/db.sqlite3 'PRAGMA integrity_check'` → `ok` ; autant de
   `storage/modules/*.blob` dans `tar -tzf` que dans `/convex/data/storage/modules` du conteneur.
4. `MANIFEST` : `depot_sha` = `git rev-parse HEAD` ; `backend_digest` = le `RepoDigests` du conteneur
   local (`sha256:69885bae…` au 23/09) ; `db_sha256` = `shasum -a 256` ; rien sur `credentials`.
5. Un `"$ESSAI"/wws-2000-01-01T000000Z` vieilli (`touch -t 200001010000`) disparaît au passage
   suivant ; un `"$ESSAI"/autre` aussi vieux reste.
6. Destination non inscriptible (`chmod 500`) : code non nul, aucun dossier créé.
7. `docker exec worldwarsim-backend-1 ls /convex/data` : mêmes noms avant et après ; `healthy`.

## Vérifications

Les cas 1 à 7 et la durée d'un passage (`time`) ; `npm run verifier` vert, lancé quand même.

## Rapport attendu

Format commun (README de la série), plus :

- tailles de `db.sqlite3` et `storage.tar.gz`, durée, poids estimé de 14 jours de rétention ;
- le digest `alpine/sqlite` épinglé et la sortie `imagetools` qui prouve que c'est un index ;
- le mode : à commiter en 100755 (`git ls-files -s` après le `git add` de Pierre ; le cron passe
  par `/bin/sh` et n'en dépend pas, le lancement à la main si) ; les étapes P6 telles qu'écrites.
