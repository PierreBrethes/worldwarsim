# 15-images-convex-epinglees — backend et dashboard sont épinglés par le digest d'index de la version qui tourne en prod, le même sur le Mac et sur le VPS

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.
**Pierre d'abord :** P1. Sur le VPS, la sortie de
`docker image inspect --format '{{json .RepoDigests}}' $(docker inspect --format '{{.Image}}' worldwarsim-backend-1)`,
et de la même commande pour `worldwarsim-dashboard-1`. On veut l'image que les conteneurs **font
tourner**, pas celle que `:latest` désigne. Sans ces deux sorties, ne rien modifier. Si seule la
sortie de P1 sur les tags `:latest` est fournie, le signaler : elle ne vaut celle des conteneurs que
si rien n'a été tiré depuis leur création.

**À lire :** `docker-compose.yml` (~3 et ~22, `:latest`), `.github/workflows/ci.yml` (~69 : le
déploiement ne tire jamais le backend), `deploiement/README.md` (§ 4 ~165-170).

## Pourquoi

`docker-compose.yml` ~3 et ~22 désignent `ghcr.io/get-convex/convex-backend:latest` et
`convex-dashboard:latest`. Les images du Mac datent du 11/09. Leurs `RepoDigests` sont
`sha256:69885bae…` pour le backend et `sha256:88f150c1…` pour le dashboard, deux index OCI qui
couvrent amd64 et arm64 (vérifié par `docker buildx imagetools inspect`) : un `RepoDigests` tiré par
tag est donc bien l'index, pas une plateforme. L'image du VPS date de son dernier `pull` manuel, et
personne ne sait lequel : `up -d --build front` (ci.yml ~69) ne tire jamais le backend, puisque
`pull_policy` vaut `missing` par défaut. Le paquet npm `convex`, lui, est figé à 1.43.0 par le
lockfile. Une réinstallation du VPS ou un `docker compose pull`
changerait le backend sans rien dire. Or une copie SQLite brute (07) ne se restaure que sur une
version compatible (60). L'ADR 0010 range pourtant les « mises à jour de l'image convex-backend »
parmi ce qui nous incombe : aujourd'hui, elles arrivent par accident.

## Ce qui change

1. **Chaque digest fourni doit être un index.** `docker buildx imagetools inspect
   ghcr.io/get-convex/convex-backend@sha256:<digest>` doit rendre le `MediaType`
   `application/vnd.oci.image.index.v1+json` (ou `…manifest.list.v2+json`) et lister `linux/amd64`
   **et** `linux/arm64`. Même contrôle pour le dashboard. Le Mac est en arm64 et le VPS en amd64 :
   le digest d'une seule plateforme casserait l'un des deux. Si un digest n'est pas un index,
   **s'arrêter** sans rien épingler, sans le remplacer par le digest local ni en chercher un autre.
   Le point passe en « À trancher ».
2. **Chaque digest doit se tirer sur le Mac** : `docker pull ghcr.io/get-convex/convex-backend@sha256:<digest>`,
   même chose pour le dashboard ; un pull qui échoue arrête tout, comme au point 1. **Aucun
   `docker compose up`** : les conteneurs locaux gardent leur image jusqu'à ce que Pierre les recrée.
3. `docker-compose.yml` : `image: ghcr.io/get-convex/convex-backend@sha256:<digest>` et
   `image: ghcr.io/get-convex/convex-dashboard@sha256:<digest>`, sans tag. Au-dessus, un commentaire
   court qui dit trois choses :
   - le digest est celui de l'index multi-architecture, et date de telle création
     (`docker image inspect --format '{{.Created}}'`) ;
   - la raison : une copie du volume ne se relit que sur une version compatible ;
   - la règle : une mise à jour est un commit `chore(deploiement): convex-backend → <digest>`,
     backend et dashboard ensemble, précédé d'une sauvegarde (`deploiement/sauvegarder.sh`, 07).
4. `deploiement/README.md` § 4 : une phrase qui dit que le backend tourne le digest du compose, et
   que le changer passe par ce commit. Pas de nouvelle section (67 réécrit le README).

## Ce que ce prompt ne fait pas

- Le déploiement ne tire toujours pas le backend quand le digest change (62).
- Pas de montée de version : le digest épinglé est **celui qui tourne en prod**.
- `compose.prod.yml` n'est pas touché, et rien n'est lancé sur le VPS.

## Cas d'acceptation (tests d'abord)

Les cas 1 et 2 se jouent avant de toucher un fichier.

1. Les deux `imagetools inspect` montrent un index avec amd64 et arm64 ; leur sortie va au rapport.
2. Les deux `docker pull …@sha256:…` sortent en 0 sur le Mac.
3. `docker compose -f docker-compose.yml config --images` affiche les deux références `@sha256:`, et
   `git grep -n ':latest' -- docker-compose.yml deploiement/` ne trouve rien (commentaire et README compris).
4. Les conteneurs locaux n'ont pas bougé : `docker inspect --format '{{.Image}}' worldwarsim-backend-1`
   rend la même valeur avant et après, backend et dashboard sont toujours `Up`.
5. `npx prettier --check docker-compose.yml` : vert.

## Vérifications

- Les cas 1 à 5.
- `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus :

- pour chaque image : le digest épinglé et sa date de création, comparés à l'image locale
  (backend et dashboard du 11/09, `69885bae…` et `88f150c1…`) ;
- la conséquence pour le Mac : au prochain `docker compose up -d`, le backend local passe sur la
  version de prod. Si cette version est **plus ancienne** que celle qui a écrit le volume local, cela
  revient à descendre de version sur des données existantes. Pierre fait donc d'abord une copie
  (`deploiement/sauvegarder.sh`, si 07 est passé). L'agent ne le fait pas à sa place ;
- ce que Pierre verra sur le VPS après la poussée. `up -d --build front` recrée sans doute
  `backend`, dont `front` dépend : la référence change, l'image reste la même, d'où quelques
  secondes de coupure. `dashboard`, dont rien ne dépend, garde `:latest`. Dans `/opt/worldwarsim` :
  `wws-compose up -d backend dashboard`, puis `docker inspect --format '{{.Config.Image}}'
  worldwarsim-backend-1 worldwarsim-dashboard-1` doit rendre les deux références `@sha256:`.
