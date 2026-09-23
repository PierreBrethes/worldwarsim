# 09-surveillance-planifiee — `.github/workflows/surveillance.yml` interroge la prod toutes les trois heures, en dépose un export par jour, et son échec part par e-mail

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 08, poussé et déployé par la CI (`ops:health` existe en prod).

**À lire :** `convex/ops.ts` (réponse de `health`, argument `now`), `.github/workflows/ci.yml`
(secrets ~56-57, versions des actions), `package-lock.json` (`packages["node_modules/convex"]`,
1.43.0 à la rédaction), `node_modules/convex/dist/cli.bundle.cjs` (`run` ~148629 et `export` ~132828 :
`ensureHasConvexDependency` exige un `package.json` qui déclare `convex` ; `formatValue` ~127968 :
hors TTY, le résultat sort en JSON sur stdout), `scripts/generate-a-mesurer.mjs` ~153 (garde du
`main`), `deploiement/README.md` (§ Presse ~38-57, § Sauvegardes ~243).

## Pourquoi

08 a donné la requête ; rien ne l'appelle. Les pannes restent vues par les joueurs : la presse le
12/09, un backend arrêté après un reboot faute de `restart:` (constat v2, 06), et aucune copie de la
base ne quitte le VPS (le cron du README appelle un `sqlite3` absent de l'image, constat 1, 07).
Dépôt privé, minutes Actions comptées : pas de `npm ci`, un seul job (chacun arrondi à la minute).

## Ce qui change

1. `scripts/read-health.mjs` (à créer), sans dépendance : lit sur stdin la sortie de `ops:health`,
   imprime une ligne par problème (le code, puis les noms de `failedJobs`/`overdueJobs` ou les codes
   des `details.seasons` qui le portent dans leurs `problems` : aucun seuil refait ici), l'ajoute à
   `$GITHUB_STEP_SUMMARY` s'il existe ; sort 0 si `ok === true`, 1 sinon, et 1 sur une entrée vide
   ou non JSON. Exporte `verdictOf(text)` → `{ ok, lines }`, `main` gardé (57, 60, 61 le reprennent).
2. `.github/workflows/surveillance.yml` (à créer) :
   - **deux** crons, `'17 0,6,9,12,15,18,21 * * *'` et `'17 3 * * *'`, plus `workflow_dispatch`
     avec une entrée booléenne `exporter`. Écart assumé au `'17 */3 * * *'` du cahier :
     `github.event.schedule` rend l'expression qui a déclenché, donc un cron unique ne distingue
     aucune exécution du jour, et deux crons qui se recoupent lanceraient deux runs à 3 h 17 ;
   - `permissions: contents: read` ; un job, `ubuntu-latest`, `timeout-minutes: 10` ;
   - `actions/checkout@v7`, `sparse-checkout` non-cône (motifs ancrés : `/package.json`,
     `/package-lock.json`, `/scripts/read-health.mjs`), ce qu'exigent `convex run` et `export` (cas 3) ;
     `actions/setup-node@v7`, `node-version: '24'` comme ci.yml, sans cache ;
   - `CONVEX_VERSION` lue dans `package-lock.json` par `node -p` vers `$GITHUB_ENV`, jamais recopiée ;
   - « Santé » : `npx -y convex@$CONVEX_VERSION run ops:health "{\"now\":$(date +%s)000}" > sante.json`
     puis `node scripts/read-health.mjs < sante.json`, secrets en `env:` de l'étape comme ci.yml ;
   - « Front » (`curl -fsS -o /dev/null https://wws.pierrebrethes.cloud/`) et « Backend »
     (`curl -fsS https://convex.pierrebrethes.cloud/version`, en clair comme le cahier), en
     `if: ${{ !cancelled() }}` : les trois contrôles parlent même quand l'un tombe ;
   - « Export », `if: ${{ !cancelled() && (github.event.schedule == '17 3 * * *' || inputs.exporter) }}`
     (une base malade est celle qu'on veut copier) : `convex export --path wws-$(date -u +%F).zip`
     par le même `npx`, puis `actions/upload-artifact` (dernière majeure, par `gh api
     repos/actions/upload-artifact/releases/latest`), `retention-days: 14`, `if-no-files-found: error` ;
   - en tête, quatre lignes au plus : l'alerte est l'e-mail d'échec de GitHub ; l'export contient
     les empreintes de mots de passe (`accounts`), d'où dépôt privé et rétention courte ; il
     n'emporte pas les travaux planifiés en attente (cas 4), donc une saison restaurée depuis lui
     est figée : repli portable, la sauvegarde principale est la copie du volume (07).
3. `deploiement/README.md`, section « Surveillance », dix lignes au plus : heures (UTC), sens de
   l'e-mail, où lire le résumé, `Run workflow` avec `exporter`, rétention, et `dev:relaunchPress`
   sur `PRESS_CHAIN_DEAD`. Les URL `pierrebrethes.cloud` s'écrivent dans le YAML, jamais appelées.

## Ce que ce prompt ne fait pas

- `ops.yml` (61, qui mutualisera avec ce fichier), `npm run prod -- status` (57), copie du volume
  (07), `restart:` (06), restauration (60), `.nvmrc` (10), actions par SHA (63), `version.json`
  (64). Aucune réparation : le workflow ne lance jamais `dev:relaunchPress`.

## Cas d'acceptation (tests d'abord)

1. `scripts/read-health.test.mjs` (à créer), avant le script, enfant par `process.execPath` :
   `ok: true` sort 0 ; `ok: false` avec `PRESS_CHAIN_DEAD` et `FAILED_JOBS` sort 1, une ligne par
   code nommant saison et travail ; vide, non JSON, JSON sans `ok` sortent 1 ; avec
   `GITHUB_STEP_SUMMARY` sur un fichier temporaire, le résumé y est ajouté.
2. `curl -fsS http://127.0.0.1:3210/version` sort 0 (corps `unknown` à la rédaction : le code prouve).
3. Dossier temporaire `$T` hors du dépôt, seulement `package.json` et `package-lock.json` copiés
   (ni `convex/`, ni `node_modules`) ; URL et clé chargées par `( set -a; . <dépôt>/.env.local;
   set +a; cd "$T"; … )`, jamais imprimées : `npx -y convex@<version du lockfile> run ops:health
   "{\"now\":…}"` rend le JSON, et `node <dépôt>/scripts/read-health.mjs` sort selon `ok`.
   `ops:health` absent du backend local : `npx convex dev --once` depuis le dépôt d'abord.
4. Même dossier : `npx -y convex@… export --path x.zip` réussit ; `unzip -l x.zip` dit si
   `_scheduled_functions` y figure, et le commentaire et le README s'écrivent selon ce résultat.
5. `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:<dernière version>` : aucun constat
   (Docker absent : le dire).

## Vérifications

- `npx vitest run scripts/read-health.test.mjs` : vert. Les cas 2 à 5 contre le backend local
  (127.0.0.1:3210, permis ici), sorties notées. `npm run verifier` : vert (`format:check` lit le YAML).

## Rapport attendu

Format commun (README de la série), plus : la durée du cas 3 (téléchargement de convex compris) et
la taille de l'export local, ramenées à un mois (8 runs par jour, 14 exports gardés) ; le cas 4, et
si le backend local a gardé l'export dans `storage/exports` (« À trancher » : purge) ; qu'un
`FAILED_JOBS` sonne 24 h, soit 8 e-mails ; pour Pierre après la fusion, un `Run workflow` avec
`exporter`, et le rappel que les e-mails d'un workflow planifié vont à qui a touché le cron en
dernier, notifications d'échec des Actions actives dans son compte GitHub.
