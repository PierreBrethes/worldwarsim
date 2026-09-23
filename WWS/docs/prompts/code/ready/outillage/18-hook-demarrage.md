# 18-hook-demarrage — une session neuve commence par six lignes d'état au plus : node, pre-push, prompts en attente, arbre, backend local, sondes

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 16, 10, 11.

**À lire :** `.claude/settings.json` (16 : on y ajoute `hooks.SessionStart`), `.nvmrc` (10),
`package.json` (`prepare`, 11), `.env.local` par `grep -E '^(CONVEX_SELF_HOSTED_URL|VITE_CONVEX_URL)='`
seulement (`http://127.0.0.1:3210` au 23/09 ; ni Read ni `cat` : la clé d'admin y est),
`WWS/docs/prompts/code/ready/` (trois prompts à la racine, la série `outillage/` et son `README.md`),
`scripts/garde-prod.test.mjs` (16 : un hook lancé par `spawnSync`), https://code.claude.com/docs/en/hooks
(§ SessionStart : le stdout d'un code 0 entre dans le contexte de Claude).

## Pourquoi

Au démarrage, l'IA refait l'orientation à la main (audit, 26 sessions) : 55 `git status`, 19 `ls` des
prompts, 29 sondes de version de node, 7 sondes du backend local (`.env.local`, `curl …/version`). Ce
qu'elle voyait était en partie faux : sur le Mac, le process `claude` hérite d'un PATH où
`/usr/local/bin` passe devant nvm, et tout ce que Claude Code lance lui-même — hooks, `launch.json`,
serveurs MCP — tourne sous node v19.0.1, où vite et vitest plantent. Un hook SessionStart tourne avec
ce PATH : son `node -v` est le bon témoin. D'autres états ont dormi sans que personne les voie :
`core.hooksPath` non réglé, donc aucun pre-push sur les pushes du Mac du 12 au 18/09 ; `ready/` qui
garde deux prompts exécutés le 11/09 (`noms-de-modules-convex`, `contours-de-region-paresseux`) et un
remis à plus tard le 16/09.

## Ce qui change

1. `.claude/hooks/etat-du-depot.sh` (à créer), sh POSIX des deux postes (ni `date -d` ni `stat -f`),
   `cd "$CLAUDE_PROJECT_DIR"`, `exit 0` toujours. Texte brut en français, qui entre dans le contexte :
   ni couleur ANSI ni cadre ; une ligne par sujet, tronquée à 160 caractères, `ALERTE` en tête si ça cloche :
   1. **node** : `node -v` contre `.nvmrc` (majeur lu après un `v` éventuel) ; `ALERTE` si le majeur
      est inférieur, en disant que c'est le node des hooks, de `launch.json` et des MCP. `.nvmrc`
      absent ou node introuvable : le dire.
   2. **pre-push** : `git config --get core.hooksPath` doit rendre `.githooks`, sinon `ALERTE` et le
      remède (`npm install`, qui le règle depuis 11).
   3. **prompts** : les `.md` de `WWS/docs/prompts/code/ready/`, sous-dossiers compris, hors
      `README.md` ; un compte par dossier ; l'âge en jours est la date du dernier commit du fichier,
      tirée d'**un seul** `git log --format=%ct --name-only -- WWS/docs/prompts/code/ready` (0,03 s,
      contre ~0,7 s pour un `git log -1` par fichier sur 74) ; les non suivis comptés à part, « non
      commités » ; `ALERTE` au-delà de 7 jours, trois noms au plus puis « +N ».
   4. **arbre** : fichiers indexés, modifiés, non suivis (`git status --porcelain`).
   5. **backend** : `CONVEX_SELF_HOSTED_URL` de `.env.local` (à défaut `VITE_CONVEX_URL`). Si l'hôte de
      l'une des deux n'est ni `127.0.0.1` ni `localhost` : `ALERTE` qui la nomme, et **aucun appel**.
      Sinon `curl -s -m 1 -o /dev/null -w '%{http_code}' <url>/version` : « joignable » sur 200 (le
      backend répond `unknown`), « injoignable » sinon, avec le remède
      (`docker compose up -d backend`). Sans `.env.local` ou sans curl : le dire.
   6. **sondes**, seulement s'il y en a : `find src convex scripts -name '*.sonde.test.*'` — le motif
      entre au `.gitignore` en 21, et `find` les voit ignorées ou non.
2. `.claude/settings.json` : `hooks.SessionStart`, matcher `startup|clear`,
   `sh "$CLAUDE_PROJECT_DIR/.claude/hooks/etat-du-depot.sh"`, `timeout` 5. Rien d'autre ne bouge.
3. `scripts/etat-du-depot.test.mjs` (à créer), **avant** le script. Le test monte lui-même un dépôt
   jetable (`mkdtemp`, commits en `-c user.name=… -c user.email=… -c commit.gpgsign=false`, jamais à
   la main : `git commit` est en `ask` depuis 16) : `.nvmrc`, `.env.local`, sous
   `WWS/docs/prompts/code/ready/serie/` un prompt commité avec `GIT_AUTHOR_DATE` et
   `GIT_COMMITTER_DATE` reculés de 12 jours, un récent, un non suivi, un `README.md`, et
   `src/a.sonde.test.ts`. Il lit aussi `.claude/settings.json` : le hook y est déclaré.

## Ce que ce prompt ne fait pas

Il constate, il ne répare rien : ni `.nvmrc` (10), ni `core.hooksPath` (11), ni le motif des sondes au
`.gitignore` (21), ni le rangement de `ready/` (27). Aucun appel réseau hors de `127.0.0.1` et
`localhost`, jamais la clé d'admin à l'écran, rien sur `resume` ni `compact`.

## Cas d'acceptation (tests d'abord)

1. Le test échoue avant le script (absent).
2. `.nvmrc` à `99` : ligne node en `ALERTE` ; à `v1.0.0` : sans alerte.
3. `core.hooksPath` absent : `ALERTE` ; réglé à `.githooks` : sans alerte.
4. Prompts : compte juste par dossier, le vieux à 12 j en `ALERTE`, le récent sans, le non suivi
   compté « non commité », `README.md` ignoré.
5. `.env.local` en `http://127.0.0.1:1` : « injoignable ». En `https://convex.example.org` : `ALERTE`,
   et un faux `curl` placé en tête du `PATH`, qui écrit un témoin, prouve qu'aucun appel n'est parti.
   Sans `.env.local` : dit.
6. La sonde est nommée ; sans sonde, pas de sixième ligne.
7. Au plus 6 lignes de 160 caractères, code 0 ; code 0 aussi sur un dossier vide hors git.

## Vérifications

- `npx vitest run scripts/etat-du-depot.test.mjs` vert, nombre de cas donné ; `sh -n` et `dash -n`.
- Sur le dépôt réel : `time env CLAUDE_PROJECT_DIR="$PWD" sh .claude/hooks/etat-du-depot.sh`, sous le
  PATH nvm puis, si `/usr/local/bin/node` existe encore (P2), sous `PATH=/usr/local/bin:$PATH` pour
  voir l'alerte node. Moins de 1,5 s dans les deux cas.
- `npx prettier --check .claude/settings.json` et `npm run verifier` : verts.

## Rapport attendu

Format commun (README de la série), plus :

- la sortie réelle recopiée telle quelle, et sa durée sous chacun des deux PATH ;
- ce que la ligne node dit du node que voit ce process `claude` ;
- le hook ne se voit qu'au prochain `/clear` ou à une session neuve : dire comment Pierre le vérifie.
