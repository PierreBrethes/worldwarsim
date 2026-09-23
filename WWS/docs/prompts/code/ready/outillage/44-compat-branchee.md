# 44-compat-branchee — le pre-push et le job `deployer` passent par `compat-deploiement` ; `WIPE-REQUIS` annonce un wipe voulu, `DEPLOIEMENT_AUTO` gèle le déploiement

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 43, 11.

**À lire :** `scripts/compat-deploiement.mjs` et son test (43 : options, codes 0/1/2) ;
`.githooks/pre-push` tel que 11 l'a laissé (branche Windows ~11-22, son `exec wsl.exe` ~20, le
`npm run verifier` final) ; `.github/workflows/ci.yml` (`on:` ~3-6, commentaire ~32-39, job
`deployer` ~40-57, checkout ~44, `npx convex deploy` ~53) ; `deploiement/README.md` (§ CI/CD ~199,
paragraphe ~216-218 ; « le wipe de C3, et son ordre » ~21, le wipe d'aujourd'hui).

## Pourquoi

43 dit si un déploiement exige un wipe, mais personne ne le lance : l'incompatibilité se découvre
au `npx convex deploy`, après la poussée (ci.yml ~37-39), puis on wipe et on relance à la main
(README ~216-218). Du 12 au 18/09, 22 poussées sont parties en prod pendant une saison jouée
(reflog d'`origin/main`), dont edae56b qui change la résolution du combat. C'est Pierre qui pousse,
jamais Claude : le déploiement automatique reste le défaut, la variable n'est qu'un gel.

## Ce qui change

1. **Script (43).** `deploiement/WIPE-REQUIS` présent dans la tête (arbre de travail, ou
   `git cat-file -e <tete>:deploiement/WIPE-REQUIS`) donne le code 3, **quel que soit** le
   résultat, imprimé quand même. Message : le contenu du fichier (une ligne, ce qui exige le wipe),
   puis « le job deployer s'arrête avant convex deploy — lancer le wipe (npm run prod -- wipe,
   prompt 59 ; d'ici là « le wipe de C3 », deploiement/README.md), puis retirer
   deploiement/WIPE-REQUIS dans un commit et pousser : cette poussée-là déploie ». Sans fichier, le
   code 1 ajoute « wipe voulu : commiter deploiement/WIPE-REQUIS avec le changement ». Sous
   `GITHUB_ACTIONS=true`, le verdict des codes 1 à 3 tient sur une ligne qui commence par
   `::error::` (une annotation GitHub s'arrête au retour à la ligne). **Écart au cahier**
   (« relancer le workflow ») : relancé, le même commit porte encore le fichier et s'arrête de
   nouveau ; c'est le commit qui le retire qui déploie.
2. **`.githooks/pre-push`**, après le `npm run verifier` final. Sans `origin/main`
   (`git rev-parse -q --verify refs/remotes/origin/main`), il écrit sur stderr « pre-push :
   origin/main introuvable — compatibilité du déploiement non vérifiée (git fetch origin) » et
   continue. Sinon, il lance `node scripts/compat-deploiement.mjs`, sans `--tete` (l'arbre de
   travail, comme le vérifieur ; un `WIPE-REQUIS` non commité passe ici, la CI qui lit le commit
   s'arrête) : 0 et 3 passent, tout autre code sort en 1 (sous `set -e`, `|| code=$?`). La
   branche Windows relance le hook entier sous WSL (`sh .githooks/pre-push` au lieu de
   `npm run verifier`) : `uname` n'y matche plus, donc pas de boucle, et les deux chemins font les
   mêmes étapes. L'`echo` ~17 et le commentaire ~18-19 suivent.
3. **`ci.yml`**, job `deployer` :
   - `if: github.event_name == 'workflow_dispatch' || vars.DEPLOIEMENT_AUTO != '0'`. Non définie,
     la variable vaut `''` et le job déploie ; à `0`, une poussée ne déploie plus ; un
     `workflow_dispatch` passe toujours, décision explicite. `success()` reste implicite ;
   - checkout en `fetch-depth: 0` : `git archive` veut la référence en local (pack de 74 Mio) ;
   - input facultatif `contre` sur `workflow_dispatch`, « SHA en prod (défaut HEAD~1) » : après un
     gel, un arrêt ou une poussée forcée, ni `HEAD~1` ni `event.before` ne sont ce qui tourne ;
   - étape « Compatibilité du déploiement », après `npm ci`, avant `npx convex deploy`. `env:`
     `CONTRE: ${{ inputs.contre }}` et `AVANT: ${{ github.event.before }}`, jamais interpolés dans
     le shell ; le `run:` retient `REF` = `$CONTRE`, sinon `$AVANT` hors vide et hors SHA de zéros,
     sinon `HEAD~1`, puis `node scripts/compat-deploiement.mjs --contre "$REF"`. Tout code non nul
     arrête le job avant `convex deploy` et le front ;
   - le commentaire ~35-39 nomme l'étape, le fichier et la variable, en trois lignes au plus.
4. **`deploiement/README.md`**, § CI/CD : le paragraphe ~216-218 devient une dizaine de lignes. Ce
   que l'étape compare (la poussée précédente, pas la version en place) ; `WIPE-REQUIS` (quand le
   commiter, ce que fait le job, quand le retirer) ; le gel (`gh variable set DEPLOIEMENT_AUTO
   --body 0`, `gh variable delete DEPLOIEMENT_AUTO`) et le rattrapage
   (`gh workflow run CI -f contre=<SHA en prod>`, celui du dernier job `deployer` vert). Le reste
   attend 67.
5. **Tests** dans `scripts/compat-deploiement.test.mjs` : code 3 avec et sans incompatibilité,
   texte du code 1, préfixe `::error::` ; et, par lecture du texte, `fetch-depth: 0`,
   `DEPLOIEMENT_AUTO` et l'étape avant le pas qui lance `convex deploy` dans le job `deployer`
   (repéré par `convex deploy`, pas par la ligne exacte : 62 à 66 retouchent ce job), l'appel après
   le dernier `npm run verifier` dans `.githooks/pre-push`.

## Ce que ce prompt ne fait pas

Rien ne se pousse : ni `git push`, ni `gh workflow run`, ni `gh variable` (gestes de Pierre,
documentés au point 4). Ni wipe (59), ni version servie (64), ni déploiement par SHA (62), ni
`npm run verifier` modifié. Ni tag `prod-*` ni environnement à approbation (écartés par l'audit).

## Cas d'acceptation (tests d'abord)

1. Les tests du point 5 s'écrivent d'abord et échouent.
2. Avec un `deploiement/WIPE-REQUIS` temporaire (`printf 'essai\n' >`), `--contre 1adb0f3~1` et
   `--contre HEAD` sortent en 3 (la liste de 43, puis l'avis). Sans lui, 1 (« commiter
   deploiement/WIPE-REQUIS ») et 0. `GITHUB_ACTIONS=true` préfixe `::error::`. Le fichier part.
3. Hook, sans pousser : `R=$(git rev-parse --show-toplevel)`, `T=$(mktemp -d)`, `git clone -q
   --shared "$R" "$T/c"`, `ln -s "$R/node_modules" "$T/c/node_modules"`, copie de travail du
   script dans `$T/c/scripts/`, `npm` bouchon exécutable dans `$T/bin` (`exit 0`). Dans la même
   commande, depuis `$T/c` : `env -i HOME="$HOME" TMPDIR="$TMPDIR" NVM_DIR=/nonexistent PATH="$T/bin:$HOME/.nvm/versions/node/v24.19.0/bin:/usr/bin:/bin" sh "$R/.githooks/pre-push" </dev/null`
   (sans `TMPDIR`, l'atelier irait dans `/tmp`). (a) Tel quel : 0, « compatible ». (b) Après
   `git -C "$T/c" update-ref refs/remotes/origin/main 11f72d9~1` : 1 et la liste. (c) (b) plus
   `$T/c/deploiement/WIPE-REQUIS` : 0 et l'avis. (d) Après `git -C "$T/c" update-ref -d
   refs/remotes/origin/main` : 0, avertissement sur stderr.
4. Le bloc `run:` de l'étape, extrait du YAML, `node` remplacé par `echo`, lancé par `bash -e`
   avec `CONTRE` et `AVANT` posés : `abc` pour `CONTRE=abc`, le SHA pour `CONTRE=` `AVANT=<sha>`,
   `HEAD~1` pour `AVANT=` et pour `AVANT=` suivi de 40 zéros.
5. `python3 -c 'import yaml; yaml.safe_load(open(".github/workflows/ci.yml"))'` et
   `sh -n .githooks/pre-push` passent ; actionlint seulement si `docker info` répond
   (`docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest`).

## Vérifications

Le test vitest vert ; cas 2 à 5 ; `npm run verifier` vert ; `git status --short` : le script, son
test, `.githooks/pre-push`, `ci.yml`, `deploiement/README.md`, sans `WIPE-REQUIS` ; `$T` supprimé.

## Rapport attendu

Format commun (README de la série), plus : les sorties des cas 2 à 4, le cas 5 (actionlint fait ou
non) ; l'écart au cahier sur `WIPE-REQUIS` ; la branche Windows, non testable sur le Mac, à essayer
au prochain push depuis Windows. « À trancher » : 1a `fetch-depth: 0` ou un
`git fetch --depth=1 origin <sha>` ciblé ; 1b l'input `contre` gardé, ou remplacé par la version
servie une fois 64 passé.
