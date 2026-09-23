# 62-deploiement-par-sha — le VPS construit et sert exactement le commit que la CI a vérifié, par `deploiement/deployer.sh <sha>`

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 07, 15 (ajoutés : la branche backend appelle `deploiement/sauvegarder.sh` et compare la configuration que 15 épingle).

**À lire :** `.github/workflows/ci.yml` (pas SSH ~59-69, commentaires ~8-12 et ~32-39), `docker-compose.yml`
(`front` ~31-42, sans `image:`), `deploiement/front.Dockerfile`, `deploiement/sauvegarder.sh` (07 : forme,
codes), `deploiement/README.md` (§ 2 ~144-152, § CI/CD ~199-218), `scripts/exporter-etat-reference.test.mjs`.

## Pourquoi

Le pas SSH (ci.yml ~65-69) fait `git pull --ff-only` puis `up -d --build front` : le front construit est la
pointe de main **au moment du pas**, pas `github.sha`. La concurrence est au niveau du workflow (~10-12) : le
run N+1 attend, mais le pull du run N prend déjà la pointe N+1, non vérifiée (reflog : 21 min d'écart au plus
court, pas encore arrivé). Aucune version identifiable. Sans `--no-deps`, ce `up` recrée aussi backend et
dashboard si leur configuration change : un digest neuf (15) passerait sans sauvegarde. Rien ne purge rien.

## Ce qui change

1. `deploiement/deployer.sh` (à créer) : sh POSIX (dash sur le VPS), `set -eu`, `chmod +x`, corps dans une
   fonction `main` appelée en dernière ligne (git réécrit le fichier pendant qu'il tourne). Dépôt déduit de
   l'emplacement du script, compose lancé depuis lui avec `-f docker-compose.yml -f deploiement/compose.prod.yml
   --profile prod`. Pas de `PATH` forcé (la commande forcée de 63 hérite de celui de sshd ; le test place ses
   doublures devant). Une ligne par étape ; code 2 = entrée refusée, rien touché ; code 1 = échec en route.
2. **Le SHA** : `$1`, sinon le **dernier mot** de `$SSH_ORIGINAL_COMMAND`, pris par `${…##* }` (63 enverra
   `sh <chemin>/deployer.sh <sha>`, qui sert avant et après la restriction de la clé), sans `eval` ni `set --`.
   Rien, deux arguments, un saut de ligne dans `$SSH_ORIGINAL_COMMAND` ou autre chose que 40 caractères
   `[0-9a-f]` : code 2, ni git ni docker appelés ; contrôle par `case` et `${#…}`, pas par grep.
3. **L'extraction.** Arbre suivi modifié (`git diff --quiet HEAD`) : code 2, `git status --short` imprimé. Si
   `HEAD` ne vaut pas le SHA : `git fetch origin` ; code 2 si le SHA est absent (`git cat-file -e "$SHA^{commit}"`)
   ou si son arbre n'a pas `deploiement/deployer.sh` (la clé de 63 ne lance que lui) ; `git checkout --detach
   "$SHA"`, `HEAD` contrôlé, puis `exec sh` du script **extrait** : lui trouve `HEAD` égal, et c'est lui qui construit.
4. **Le front.** `docker-compose.yml`, `front` : `image: wws-front:en-service` (sinon le nom dépend de la
   version de compose : `worldwarsim_front` en 2.12 sur le Mac). Étage nginx du Dockerfile : `ARG BUILD_SHA`,
   `LABEL org.opencontainers.image.revision=$BUILD_SHA`. Le script : `compose build --build-arg BUILD_SHA=<sha>
   front`, `docker tag wws-front:en-service wws-front:<sha>`, `compose up -d --no-deps --force-recreate front` ;
   code 1 si le conteneur ne tourne pas l'image de `wws-front:<sha>` ou si son label diffère. Restent les
   trois `wws-front:<sha>` les plus récents (ordre de `docker image ls`), le servi compris ; `rmi` refusé : avertit.
5. **Backend et dashboard**, ensuite : `compose config --hash <service>` contre le label
   `com.docker.compose.config-hash` du conteneur, la règle par laquelle `up` décide de recréer (égaux sur le Mac
   à la rédaction, `da85344c…` pour le backend) ; il suit le digest (15), `.env` et les labels. Sortie `<service>
   <hash>`, dépendances comprises (`--hash dashboard` rend aussi `backend` en 2.12) : lire la ligne du service.
   Backend différent : avertissement, `sh deploiement/sauvegarder.sh` d'abord (échec : code 1, front servi,
   backend intact), puis `compose pull` et `compose up -d --wait --no-deps` des services différents. Dashboard
   seul : sans sauvegarde. Aucun conteneur backend : code 1, vu avant la construction du front (README § 4).
6. **Purges** : `docker image prune -f`, `docker builder prune -f --keep-storage 2GB` ; un échec avertit sans
   changer le code (`--keep-storage` cède à `--reserved-space` sur les Docker récents). Fin : `déployé <sha>`.
7. `ci.yml`, pas SSH : l'action reste (63). `script` : `cd`, un amorçage commenté (`test -f
   deploiement/deployer.sh || { git fetch origin && git checkout --detach <sha>; }`, le VPS n'a pas encore
   le fichier), puis `sh deploiement/deployer.sh ${{ github.sha }}`. Commentaire ~32-39 à l'avenant.
8. `deploiement/README.md` : § 2, `git fetch` et dépôt détaché sur le SHA servi (`git rev-parse HEAD`) ;
   § CI/CD, trois lignes (appel à la main, `docker image ls wws-front`, branche backend). Rien de plus (67).

## Ce que ce prompt ne fait pas

ssh natif (63), `version.json` (64), retour arrière (65), `.dockerignore` (66), runbook (67) ; rien sur le VPS.

## Cas d'acceptation (tests d'abord)

`scripts/deployer.test.mjs` (à créer ; `scripts/` pour les globales node d'eslint), rouge avant le script.
Par cas, un dossier temporaire : dépôt git neuf et `origin` nu (commits du test, `-c user.*`,
`GIT_CONFIG_GLOBAL=/dev/null`), le `deployer.sh` de l'arbre, doublures `sauvegarder.sh` et `docker` devant le
`PATH` ; le script lancé par `/bin/dash` s'il existe (le `sh` du VPS et de la CI), sinon `sh`.

1. Code 2, journal vide (`git` doublé aussi) : rien ; `abc` ; 40 hex majuscules ; 39 et 41 caractères ;
   deux arguments ; `SSH_ORIGINAL_COMMAND` finissant par `$(id)`, par `<sha>;`, ou sur deux lignes.
2. Nominal, commit A extrait, `SSH_ORIGINAL_COMMAND='sh /x/deployer.sh <B>'` : code 0, `HEAD` détaché
   sur B, le marqueur du `deployer.sh` de B dans la sortie (l'`exec` a eu lieu), journal dans l'ordre
   build `BUILD_SHA=<B>`, tag, `up … front`, purges ; ni `pull` ni sauvegarde.
3. Backend différent : sauvegarde avant `pull` et `up --wait` ; sauvegarde en échec : code 1, ni `pull`
   ni `up` du backend ; dashboard seul différent : pas de sauvegarde.
4. Code 2, `HEAD` inchangé, aucun `docker` : arbre modifié ; SHA inconnu ; commit sans `deployer.sh`.
5. Image ou label du `front` discordant : code 1. Cinq `wws-front:<sha>` : `rmi` des deux plus anciens.
6. `sh -n` et `dash -n deploiement/deployer.sh` : 0.

## Vérifications

`npx vitest run scripts/deployer.test.mjs` puis `npm run verifier` : verts. `docker compose -f docker-compose.yml
--profile prod config --images` montre `wws-front:en-service`. Si `docker info` répond : `git ls-files -co
--exclude-standard -z | tar --null -T - -cf - | docker build -f deploiement/front.Dockerfile --build-arg
BUILD_SHA=essai62 -t essai62 -` (pas `.` : sans `.dockerignore`, 66, le `node_modules` du Mac entrerait), label
`org.opencontainers.image.revision` = `essai62`, image supprimée. actionlint par Docker (`rhysd/actionlint`,
dernière version) : aucun constat (Docker absent : le dire).

## Rapport attendu

Format commun (README de la série), plus : tests, durée, lignes du script, journal `docker` du cas 2 ; mode
100755 à commiter (CI et commande forcée passent par `sh`, sans en dépendre) ; pour Pierre **avant de pousser**,
`git -C /opt/worldwarsim status --short` vide sur le VPS (sinon le premier passage refuse) ; le premier passage
peut recréer backend et dashboard (conteneurs antérieurs à 15) : sauvegarde, puis quelques secondes de coupure.
