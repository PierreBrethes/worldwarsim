# 63-ci-durcie — la CI déploie par le ssh du runner, hôte vérifié, actions épinglées, droits en lecture, délais bornés, et le README donne la ligne qui restreint sa clé à `deployer.sh`

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 62, poussé et déployé (`deploiement/deployer.sh` est sur le VPS).
**Pierre d'abord :** P8, avant de **pousser** ce commit (l'agent n'en a pas besoin pour écrire) : le secret `VPS_HOTE_CLE` ; la ligne `authorized_keys` que ce prompt écrit au README peut venir juste avant ou juste après.

**À lire :** `.github/workflows/ci.yml` (pas SSH laissé par 62 et son amorçage, garde `if:` de `deployer`
posée par 44, job `documentation` de 33, commentaire ~32-33 « ne tourne que sur main »), les autres fichiers
de `.github/workflows/` (`surveillance.yml` de 09, `ops.yml` de 61 : leurs `uses:`), `deploiement/deployer.sh`
(lecture de `$SSH_ORIGINAL_COMMAND`, codes), `scripts/deployer.test.mjs` (62), `scripts/node-version.test.mjs`
(10 : il compte les `uses: actions/setup-node`), `deploiement/README.md` (§ CI/CD, secrets ~205-214).

## Pourquoi

`appleboy/ssh-action@v1` (ci.yml ~60) est un tag flottant d'un tiers (`git ls-remote` : `v1` et `v1.2.5`
sur `0ff4204d…`) ; un tag déplacé changerait le code qui reçoit `VPS_CLE_SSH`. Cette clé a les droits
Docker, l'équivalent de root sur un VPS qui héberge deux instances Convex (compose.prod.yml ~40-43), et
rien ne la borne côté VPS. Ni `permissions:` (les droits du jeton dépendent d'un réglage du dépôt,
invisible dans le fichier) ni `timeout-minutes` (un ssh bloqué tient 360 min, payées sur un dépôt
privé). Le commentaire ~32-33 dit que `deployer` ne tourne que sur main ; `workflow_dispatch` se lance
depuis toute branche. 09, 33 et 61 renvoient ici l'épinglage de leurs actions.

## Ce qui change

1. **Pas SSH** de `deployer` : l'action et l'amorçage de 62 disparaissent. Un pas `run:`, secrets passés
   par `env:` et jamais interpolés dans le script, sans `set -x` : clé écrite sous `umask 077` dans
   `$RUNNER_TEMP` (600) par `printf '%s\n'` (OpenSSH refuse une clé sans saut de ligne final, qu'un secret
   collé perd souvent), `known_hosts` depuis `VPS_HOTE_CLE` à côté ; puis `ssh -i <clé> -o
   IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=<fichier> -o BatchMode=yes -o
   ConnectTimeout=20 "$UTILISATEUR@$HOTE" "sh $CHEMIN/deploiement/deployer.sh $SHA"`, `SHA` = `github.sha`.
   Avant la restriction elle s'exécute telle quelle ; après, `deployer.sh` n'en lit que le dernier mot (62)
   et refuse le script multiligne de l'action de 62 : restreindre juste avant ou juste après la poussée de 63.
2. `permissions: contents: read` au niveau du workflow ; `timeout-minutes: 20` sur chaque job de ci.yml
   (`verifications`, `documentation`, `deployer`). `ops.yml` garde ses 10 ; le job `uses:` de
   `surveillance.yml` n'en porte pas (GitHub le refuse, 61).
3. `deployer` : la garde de 44 gagne la branche, `if: github.ref == 'refs/heads/main' &&
   (github.event_name == 'workflow_dispatch' || vars.DEPLOIEMENT_AUTO != '0')` (44 absent : la première
   clause seule ; 65 l'élargira) ; commentaire ~32-33 à l'avenant.
4. Chaque `uses:` qui n'est pas local (`actions/*` compris), dans **tous** les fichiers de `.github/workflows/`,
   par SHA de commit et version en commentaire : `actions/checkout@<40 hex> # v7.0.1`. SHA lu par `git ls-remote
   --tags https://github.com/<propriétaire>/<action> 'refs/tags/v*'`, celui de la version exacte que la
   majeure désigne aujourd'hui (ligne `^{}` si le tag est annoté). Les `uses: ./…` ne bougent pas.
5. `deploiement/README.md`, § CI/CD : `VPS_HOTE_CLE` au tableau des secrets, et une sous-section « Clé
   de CI restreinte » qui donne à Pierre, dans l'ordre :
   - `VPS_HOTE_CLE` : `ssh-keyscan -t ed25519 <VPS_HOTE>` depuis le Mac ; son empreinte
     (`ssh-keygen -lf -`) doit égaler, dans une session déjà ouverte sur le VPS, `ssh-keygen -lf
     /etc/ssh/ssh_host_ed25519_key.pub` ; la ligne commence par la valeur exacte de `VPS_HOTE` ;
   - la ligne de `~/.ssh/authorized_keys` de `VPS_UTILISATEUR`, où `/opt/worldwarsim` est `VPS_CHEMIN` :
     `restrict,command="/bin/sh /opt/worldwarsim/deploiement/deployer.sh" ssh-ed25519 AAAA… wws-ci`.
     `restrict` couvre `no-port-forwarding`, `no-pty`, `no-agent-forwarding`, X11, `~/.ssh/rc` et toute
     restriction future (OpenSSH ≥ 7.2 ; sinon la liste explicite) ; `/bin/sh` affranchit du bit exécutable ;
   - retrouver la ligne (`ssh-keygen -lf ~/.ssh/authorized_keys` contre l'empreinte de la clé de CI) ;
     introuvable ou partagée avec une clé de Pierre : en générer une (`ssh-keygen -t ed25519 -N '' -C
     wws-ci`), poser la ligne, remplacer `VPS_CLE_SSH`, retirer l'ancienne ; une session reste ouverte
     pendant la retouche ;
   - le contrôle, si la clé privée est à portée : `ssh -i <clé> <hôte>` sans commande rend le refus de
     `deployer.sh` (code 2) et aucun shell ; `ssh -N -L 9999:127.0.0.1:3210 …` ouvert, un `curl` sur
     `127.0.0.1:9999` fait écrire au client « administratively prohibited ».

## Ce que ce prompt ne fait pas

Rotation d'`INSTANCE_SECRET` (P7) ; entrée `ref` et retour arrière (65) ; `version.json` (64) ;
Dependabot (« À trancher »). Aucune connexion au VPS, aucune modification de `deployer.sh`.

## Cas d'acceptation (tests d'abord)

1. Dans `scripts/deployer.test.mjs`, un cas de plus d'abord : `SSH_ORIGINAL_COMMAND` à la forme exacte
   que la CI envoie (`sh /opt/worldwarsim/deploiement/deployer.sh <sha>`) est accepté ; vert sans
   toucher au script (sinon, s'arrêter : c'est un écart à 62). Les cas 2 à 4 se jouent une fois, hors du dépôt.
2. Le bloc `run:` du pas SSH joué par `bash`, un `ssh` doublure devant le `PATH` (il imprime ses arguments
   et le mode du fichier `-i`), `RUNNER_TEMP` temporaire, secrets factices : `IdentitiesOnly`,
   `StrictHostKeyChecking=yes`, `UserKnownHostsFile`, `BatchMode` présents, commande distante finie par le
   SHA, mode 600, fichier fini par un saut de ligne même quand le secret factice n'en a pas, le contenu
   de la clé factice nulle part dans la sortie.
3. `git grep -nE 'uses:[[:space:]]+[^.[:space:]]' -- .github/workflows | grep -vE '@[0-9a-f]{40} # v[0-9]'`
   ne rend rien ; `git grep -n appleboy` non plus.
4. Lecture YAML (paquet `yaml` de `node_modules`, comme au cas 4 de 33) : `permissions` vaut
   `{"contents":"read"}`, chaque job de ci.yml a `timeout-minutes: 20`, `jobs.deployer.if` est la garde
   du point 3, les `needs` sont inchangés.
5. `npx vitest run scripts/node-version.test.mjs scripts/deployer.test.mjs` : vert.
6. actionlint par Docker (`rhysd/actionlint`, dernière version) sur tous les workflows : aucun constat (sans Docker : le dire).

## Vérifications

Les cas 1 à 6, sorties notées ; `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : chaque action épinglée (version, SHA, la commande qui l'a lu) ; la
sous-section du README telle qu'écrite, et l'ordre pour Pierre : secret, poussée, ligne `authorized_keys`,
contrôle, puis un déploiement vert qui prouve la commande forcée ; en « À trancher » : 1a Dependabot
`github-actions` mensuel, 1b mises à jour à la main par `git ls-remote` ; recommander.
