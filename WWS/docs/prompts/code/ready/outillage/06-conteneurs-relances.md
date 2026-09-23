# 06-conteneurs-relances — backend, dashboard et front repartent seuls après un reboot du VPS ou un redémarrage de Docker

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `deploiement/compose.prod.yml` (entier : en-tête ~1-15, les trois services ~17-70),
`docker-compose.yml` (services ~1-42 ; `front` est sous `profiles: ['prod']` ~32),
`deploiement/README.md` (alias `wws-compose` ~121, § « 6 · Contrôle » ~187-197),
`.github/workflows/ci.yml` (~69 : le déploiement ne relance que `front`).

## Pourquoi

Aucun des deux fichiers compose ne déclare `restart:` : `grep -n restart docker-compose.yml
deploiement/compose.prod.yml` sort en 1. Le conteneur local le confirme, `docker inspect
worldwarsim-backend-1` rend `RestartPolicy {"Name":"","MaximumRetryCount":0}`, soit « no ». Après un
reboot du VPS (maintenance de l'hébergeur, mise à jour du noyau ou de Docker) ou un redémarrage du
démon, backend, dashboard et front restent arrêtés. Le jeu tombe avec ses **travaux planifiés** :
arrivées, chantiers, presse, tout le temps du jeu passe par eux (24 appels `runAt`/`runAfter` hors
tests, 18 fichiers de `convex/`). Il reste à terre jusqu'à un `up` tapé à la main ou jusqu'au
déploiement suivant, qui ne reconstruit que `front` et ne relance le backend que par `depends_on`
(ci.yml ~69).
Personne n'est alerté (09). Le même VPS a déjà porté des conteneurs Hueco restés `Exited` 28 h le
12/09 (`Claude outputs/HANDOFF-2026-09-13.md` ~63, cause non vérifiée).

## Ce qui change

1. `deploiement/compose.prod.yml` : `restart: unless-stopped` sur `backend`, `dashboard` et `front`,
   en première clé de chaque service. **La prod seulement** : `docker-compose.yml` ne bouge pas, et
   un Mac qui redémarre ne relance pas le backend de dev.
2. **`unless-stopped` et non `always`** : un conteneur arrêté à la main (`docker compose stop`) reste
   arrêté après un reboot, parce qu'on ne veut pas voir ce geste d'exploitation défait. Un
   commentaire de deux ou trois lignes au-dessus de `services:` le dit, avec la raison : sans
   politique, les travaux planifiés restent morts jusqu'au `up`.
3. `deploiement/README.md`, § « 6 · Contrôle », deux puces. D'abord, `systemctl is-enabled docker`
   doit rendre `enabled` : sans cela, la politique ne sert à rien au démarrage de la machine.
   Ensuite, `docker inspect --format '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' $(docker ps -q
   --filter label=com.docker.compose.project=worldwarsim)` doit rendre trois fois `unless-stopped`.

## Ce que ce prompt ne fait pas

- Ni `mem_limit`, ni borne mémoire au build du front : aucune mesure de la mémoire du VPS n'existe.
- L'en-tête faux de `compose.prod.yml` (~5-7, qui dit le dashboard « lié à 127.0.0.1 », démenti par
  ~40-60) reste tel quel : c'est 67.
- Pas de sonde qui alerte quand le backend ne répond plus (09).
- Rien n'est lancé contre le VPS : Pierre applique et vérifie lui-même (voir le rapport).

## Cas d'acceptation (tests d'abord)

Les cas 2 et 3 se lancent d'abord sur le fichier intact : 2 lève `backend`, 3 rend `0`. Les cas 3 et
4 lisent le `.env` du poste (`INSTANCE_SECRET` est en `:?`) et n'en impriment rien.

1. `git diff --quiet docker-compose.yml` : le fichier du dev est inchangé.
2. Lecture YAML avec la bibliothèque `yaml` déjà présente dans `node_modules` (dépendance
   transitive, 2.9.0) :
   `node -e "const Y=require('yaml'),d=Y.parseDocument(require('fs').readFileSync('deploiement/compose.prod.yml','utf8'));if(d.errors.length)throw d.errors;const s=d.toJS().services;for(const k of ['backend','dashboard','front'])if(s[k].restart!=='unless-stopped')throw k;console.log('ok',d.warnings.length)"`
   doit rendre `ok 3`. Les trois avertissements viennent des `!reset`, que `yaml` ne résout pas.
3. Fusion par le compose du Mac (v2.12.2) :
   `WWS_DASHBOARD_AUTH=x:y docker compose -f docker-compose.yml -f deploiement/compose.prod.yml --profile prod config | grep -c 'restart: unless-stopped'`
   doit rendre `3`. Cette version ne lit pas `!reset` (il faut ≥ 2.24) : les `published:` encore
   présents dans la sortie sont donc attendus sur le Mac, et ne disent rien du VPS.
4. `docker compose -f docker-compose.yml config | grep -c restart` doit rendre `0` : le dev n'a pas bougé.
5. `npx prettier --check deploiement/compose.prod.yml` : vert.

## Vérifications

- Les cas 1 à 5, avec leurs sorties.
- `npm run verifier` : vert. Le format vérifie le YAML.

## Rapport attendu

Format commun (README de la série), plus :

- comment la validation a été faite sur le Mac (cas 2 à 4), et ce qu'elle ne prouve pas : le
  `!reset` ne se lit que sur le VPS ;
- la marche à suivre de Pierre sur le VPS, dans `/opt/worldwarsim` (l'alias a des chemins
  relatifs), dans l'ordre, commandes exactes :
  1. `docker compose version` doit être ≥ 2.24 ;
  2. `wws-compose --profile prod config | grep -c 'restart: unless-stopped'` doit rendre 3, et
     `wws-compose --profile prod config | grep -c 'published:'` doit rendre 0 — des comptes et
     jamais la sortie entière, qui imprime `INSTANCE_SECRET` et le hash du BasicAuth ;
  3. `systemctl is-enabled docker` doit rendre `enabled`, sinon `sudo systemctl enable docker`
     (reprendre la réponse de P1 si elle existe déjà) ;
  4. après la poussée, le déploiement recrée `front`, et sans doute `backend`, dont `front` dépend
     et dont la configuration a changé ; `dashboard`, dont rien ne dépend, garde l'ancienne. Dans
     tous les cas : `wws-compose --profile prod up -d backend dashboard` (sans effet sur un
     conteneur déjà à jour). Le backend s'arrête une dizaine de secondes (`stop_grace_period:
     10s`), et ses travaux planifiés, écrits en base, l'attendent ;
  5. la commande `docker inspect` du README doit rendre trois fois `unless-stopped` ;
  6. en option, hors d'une partie en cours : `sudo systemctl restart docker` puis `docker ps`, les
     trois conteneurs doivent revenir seuls.
