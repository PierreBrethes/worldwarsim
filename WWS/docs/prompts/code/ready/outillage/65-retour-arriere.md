# 65-retour-arriere — relancer le workflow sur un SHA vérifie ce commit puis le redéploie, fonctions et front ensemble, et le README dit comment

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 44, 62, 63, 64 (44 et 64 ajoutés : la garde, l'entrée `contre` et l'étape de compatibilité de 44 ; le `SHA` du job, 64).

**À lire :** `.github/workflows/ci.yml` (`on.workflow_dispatch` ~6 et son entrée `contre`, 44 ; checkouts de
`verifications` et de `deployer`, celui-ci en `fetch-depth: 0` ; garde `if:` de `deployer`, 44 et 63 ; `env:
SHA` du job, lu par le pas ssh et par « Contrôler la version servie », 64 ; l'étape « Compatibilité du
déploiement » et sa référence, 44), `deploiement/deployer.sh` (62 : refus d'un commit sans
`deploiement/deployer.sh`), `deploiement/README.md` (§ CI/CD : `WIPE-REQUIS`, `DEPLOIEMENT_AUTO`, `contre`).

## Pourquoi

Aucune procédure de retour arrière : `grep -rni 'rollback\|retour arri\|revert' deploiement/
WWS/docs/adr/0010* WWS/docs/technique/` ne rendait rien à la rédaction. `workflow_dispatch` (ci.yml ~6) n'a
aucune entrée qui choisisse le commit (44 n'y a mis que `contre`) : il redéploie la pointe de la branche
choisie, jamais un commit antérieur. Le seul geste restant est un `git revert` poussé, qui mêle
l'annulation à l'historique et attend un commit pour chaque aller-retour.

## Ce qui change

1. `on.workflow_dispatch.inputs.ref`, à côté de `contre` : `type: string`, `required: false`, `default:
   main`, description « SHA complet (40 caractères), branche ou tag à vérifier puis déployer ».
2. `verifications` : checkout de `${{ inputs.ref || github.sha }}` (une poussée n'a pas d'`inputs`, elle
   garde `github.sha`) ; un pas `id: version` écrit `sha=$(git rev-parse HEAD)` dans `$GITHUB_OUTPUT`, et
   le `ref` demandé (texte libre : par `env:`, jamais interpolé dans `run:`) avec le SHA résolu dans
   `$GITHUB_STEP_SUMMARY` ; le job expose `outputs.sha`. Les vérifications tournent sur ce commit.
3. `deployer` : `if: (github.ref == 'refs/heads/main' || inputs.ref != '') && (github.event_name ==
   'workflow_dispatch' || vars.DEPLOIEMENT_AUTO != '0')`, la clause de 44 intacte ; checkout de
   `needs.verifications.outputs.sha` (`fetch-depth: 0` gardé), **pas** de `inputs.ref` : une branche qui avance
   entre les deux jobs ferait déployer un commit non vérifié, la course que 62 a fermée. Le `SHA` du job (64 ;
   ou du pas ssh) vaut ce même SHA. Juste après le checkout, un pas échoue si `deploiement/deployer.sh` manque
   au commit : sinon les fonctions reculeraient et le front non, `deployer.sh` refusant après coup (62).
4. Le job `documentation` (33) ne change pas : il ne retient rien.
5. **La compatibilité (44) ne se réécrit pas.** Selon son prompt, sa référence est `inputs.contre`, sinon
   `github.event.before` (absent d'un dispatch), sinon `HEAD~1` : sans `contre`, un retour se compare à son
   propre parent, pas à ce qui tourne. Le vérifier dans le code, dire tout écart. La parade est la procédure :
   `contre` = le SHA servi. La garde qui ne dépend de rien reste `convex deploy`, qui refuse un schéma que les
   données en place ne valident plus (commentaire ci.yml ~37-39).
6. `deploiement/README.md`, section « Retour arrière » (à créer) après § CI/CD, cinq points d'une
   ou deux lignes, et le § CI/CD y renvoie :
   1. Actions → CI → Run workflow depuis `main`, `ref` = le SHA complet à remettre (avant-dernier run
      vert, ou `git log --oneline origin/main`), `contre` = le SHA servi (`version.json`, 64) ; ou
      `gh workflow run ci.yml -f ref=<sha> -f contre=<sha servi>`.
   2. Les vérifications tournent sur ce SHA, puis ses fonctions et son front partent ensemble ; un SHA
      antérieur au déploiement par SHA (62) est refusé.
   3. Un retour à travers un changement de schéma incompatible échoue par construction : l'étape de
      compatibilité (44) l'arrête avant `convex deploy`, qui le refuserait de toute façon. C'est voulu :
      on corrige en avant, ou on wipe. Même arrêt si le retour retire la cible d'un travail planifié.
   4. Même règle pour le digest du backend (15) : reculer au-delà d'une montée de version redescendrait
      le backend sur des données plus récentes. `git diff <sha> origin/main -- docker-compose.yml` ne
      touche aucune ligne `image:`, sinon on ne recule pas.
   5. Toute poussée sur main redéploie la pointe : le retour tient jusqu'au correctif, ou tant que
      `DEPLOIEMENT_AUTO` vaut `0` (44).

## Ce que ce prompt ne fait pas

Pas de retour instantané par les images `wws-front:<sha>` de 62 (front seul, fonctions désaccordées) ; `contre`
ni exigé ni lu dans `version.json` (« À trancher ») ; ni tags `prod-*`, ni runbook (67). Aucun workflow lancé.

## Cas d'acceptation (tests d'abord)

Aucun code applicatif n'est touché ; les cas se jouent une fois, hors du dépôt pour les fichiers temporaires.

1. Lecture YAML (paquet `yaml` de `node_modules`, comme au cas 4 de 33) : `inputs.ref.default` vaut `main`,
   `inputs.contre` demeure ; `jobs.verifications.outputs.sha` lit le pas `version` ; les deux `with.ref` ;
   `fetch-depth: 0` sur le checkout de `deployer` ; `jobs.deployer.if` ; `needs` inchangés.
2. Le bloc `run:` du pas `version` joué par `bash` dans le dépôt, `GITHUB_OUTPUT` et `GITHUB_STEP_SUMMARY`
   sur des fichiers temporaires : `sha=` suivi de `git rev-parse HEAD` ; avec le `ref` d'`env:` valant
   `$(touch pris)`, le résumé porte ce texte tel quel et aucun fichier `pris` n'apparaît.
3. Le pas de refus joué dans un dossier temporaire sans `deploiement/deployer.sh` : code non nul et
   message ; avec le fichier : 0.
4. Même lecture : `JSON.stringify(jobs.deployer)` ne contient plus `github.sha` (tout vient de
   `needs.verifications.outputs.sha`).
5. actionlint par Docker (`rhysd/actionlint`, dernière version) : aucun constat ; il type `inputs.ref`
   et `needs.verifications.outputs.sha` (sans Docker : le dire).

## Vérifications

Les cas 1 à 5, sorties notées ; `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : la table de vérité de la garde, par l'égalité lâche de GitHub
(`null` et `''` valent 0) — poussée sur main, la même avec `DEPLOIEMENT_AUTO` à `0`, dispatch depuis main
(`ref` par défaut), dispatch avec un SHA, dispatch depuis une autre branche (`ref` vidé, puis `ref` = `main`) ;
ce que fait la compatibilité (44) sur un dispatch, lu dans le code ; en « À trancher » : 1a `contre` exigé dès
que `ref` n'est pas `main`, 1b `contre` lu par défaut dans `version.json` (64), avec une recommandation ; pour
Pierre après la poussée : un Run workflow avec `ref` = `contre` = le SHA de la pointe de main, qui redéploie
la même version et prouve le chemin.
