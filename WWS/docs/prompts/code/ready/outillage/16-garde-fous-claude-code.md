# 16-garde-fous-claude-code — un `.claude/settings.json` versionné refuse push, stash et deploy, demande avant un commit, et un hook arrête toute commande qui vise la prod

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `.claude/settings.local.json` (lecture seule : 48 règles, dont `git add *`, `git commit *`,
`git mv *`, `cp *`, `cd *`, `node *`, `python3 *`), `.github/workflows/ci.yml` (~4 et ~40-65 : un push
sur `main` vérifie, puis `npx convex deploy` et reconstruit le VPS), `deploiement/README.md` (~47-50,
~175-179 : recettes prod en `CONVEX_SELF_HOSTED_URL=https://convex.pierrebrethes.cloud \`),
`scripts/a-mesurer.test.mjs` (un test de script, projet vitest `front`), la doc
https://code.claude.com/docs/en/permissions (§ Wildcard, Compound, Wrappers, Redirections) et
https://code.claude.com/docs/en/hooks (PreToolUse, code 2).

## Pourquoi

CLAUDE.md (~617-626) dit « ne commit pas, ne push pas » et rien ne l'applique : `git ls-files .claude`
ne rend que `launch.json`. Sur 26 sessions (audit) : 12 `git stash` dont un `pop` en conflit, un
`git checkout -- convex/_generated/api.d.ts`, deux `npx convex deploy -y`, un `printf
'INSTANCE_SECRET=…' > .env`, contre le backend local par chance ; un push sur `main` **est** un
déploiement. 18 sessions sur 26 sont en mode auto, où `deny` et `ask` décident. Mais 10 commits
`Co-Authored-By: Claude` du 12 au 14/09 (8fd0986 … ce27a91) ont été demandés par Pierre : un commit se demande.
La doc (relue le 23/09, Claude Code 2.1.280) : forme `Bash(git push *)`, `:*` équivalent, `*` final
qui couvre la commande nue ; deny, ask puis allow, **portées fusionnées** (un `ask` du projet bat
l'`allow` local) ; un `ask` **demande même en mode auto** ; deny et ask voient **au-delà d'une
affectation en tête** (l'audit disait l'inverse). Mais une règle Bash lit la forme écrite de chaque
sous-commande (`git -C . push` lui échappe), et la cible d'un `>` ou d'un `tee` ne passe qu'aux règles
`Edit` (aucune ici) : un hook PreToolUse lit tout le JSON, son code 2 bloque avant toute règle, en tout mode.

## Ce qui change

1. `.claude/settings.json` (à créer, versionné), avec `"$schema": "https://json.schemastore.org/claude-code-settings.json"` :
   - `deny` : `Bash(git push *)`, `Bash(git stash *)`, `Bash(git reset --hard *)`,
     `Bash(git clean *)`, `Bash(git checkout -- *)`, `Bash(npx convex deploy *)` ;
   - `ask` : `Bash(git commit *)`, `Bash(git add *)`, et `Bash(git mv *)`, `Bash(git rm *)`,
     `Bash(git restore *)`, qui écrivent l'index ou jettent du travail de la même façon ;
   - `allow` : `Bash(git <verbe> *)` pour status, diff, log, show, blame, ls-files, grep ;
     `Bash(npm run verifier)`, `Bash(npm run test *)`, `Bash(npm run types)`, `Bash(npm run lint)`,
     `Bash(npm run format:check)`, `Bash(npx vitest run *)`, `Bash(npx tsc *)`, `Bash(npx eslint *)`,
     `Bash(npx prettier *)`, `Bash(node scripts/*)`, `Bash(node WWS/simulation/opening/*)`. Rien de
     plus large : `node *`, `python3 *`, `cp *` rendraient tout refus contournable ;
   - `hooks.PreToolUse` : matcher `Bash`, `sh "$CLAUDE_PROJECT_DIR/.claude/hooks/garde-prod.sh"`,
     `timeout` 5. Passer par `sh` affranchit du bit exécutable (le pre-push est resté en 100644 jusqu'au 11).
2. `.claude/hooks/garde-prod.sh` (à créer) : sh POSIX (dash sous WSL), ni jq ni node. Il fouille tout
   le JSON de stdin (une commande multiligne y tient sur une ligne ; la `description` est lue aussi,
   c'est accepté) ; les deux littéraux par `case`, sans processus, la redirection par un `grep -E`.
   Code 2 et un message français sur stderr par cause : `pierrebrethes.cloud` (la prod passe par la CI
   ou par Pierre ; pour chercher dans un fichier, chercher `pierrebrethes` sans le domaine) ;
   `CONVEX_SELF_HOSTED_ADMIN_KEY=` (la clé d'admin ne s'écrit jamais dans une commande) ; `>`, `>>`
   ou `tee [-a]` vers un fichier dont le nom commence par `.env`, quels que soient dossier et
   guillemets (un `.env` ne s'écrit pas depuis le shell). Sinon, et sur stdin vide ou illisible,
   code 0 en silence. En tête, deux lignes au plus : pourquoi un hook et pas une règle.
3. `scripts/garde-prod.test.mjs` (à créer), **avant** le hook : `spawnSync('sh', …)`, et `/bin/dash`
   s'il existe, sur des JSON bâtis par `JSON.stringify` à la forme de la doc (`tool_name`,
   `tool_input.command`, `tool_input.description`, `cwd`) ; puis `.claude/settings.json` : six deny,
   ask `git commit`/`git add`, hook PreToolUse présent (17, 18 en ajoutent), ni `node *`, ni `python3 *`, ni `cp *` en allow.

## Ce que ce prompt ne fait pas

`.claude/settings.local.json` n'est pas touché : Pierre le purge (P5) ; d'ici là, ses `python3 *` et
`node *` laissent un script contourner les refus. Ni la consigne git de CLAUDE.md (21), ni les hooks
Stop (17) et SessionStart (18), ni les refus de `npm run prod` (57), ni le remplaçant de `git stash`
(19). Rien pour `git -C . push` ou `sh -c` : aucune règle ne les tient, l'audit n'en a vu aucun.

## Cas d'acceptation (tests d'abord)

1. Le test échoue avant le hook (script absent) ; ensuite chaque cas passe sous `sh` et sous `dash`.
2. Refusés, code 2, la cause nommée : `CONVEX_SELF_HOSTED_URL=https://convex.pierrebrethes.cloud npx convex run dev:snapshot` ·
   `curl -s https://wws.pierrebrethes.cloud` · `export CONVEX_SELF_HOSTED_ADMIN_KEY=abc && npx convex data` ·
   `printf 'INSTANCE_SECRET=%s\n' x > .env` · `echo X >> .env.local` · `echo X >"./.env.docker"` ·
   `openssl rand -hex 32 | tee -a .env` · deux lignes dont la seconde contient `pierrebrethes.cloud`.
3. Acceptés, code 0, stderr vide : `npm run verifier` · `cat .env.local` · `grep -n VITE_CONVEX_URL .env.local` ·
   `git grep -n pierrebrethes -- deploiement/` · `git grep -n CONVEX_SELF_HOSTED_ADMIN_KEY` ·
   `npx vitest run 2>&1 | tail -5` · `node run.mjs --json /tmp/a.json > /tmp/log.txt` · `grep X .env.local > "$T/prod.env"` (57) ·
   `curl -s -m 1 http://127.0.0.1:3210/version` · stdin vide · stdin `pas du json`.
4. Assertions de `.claude/settings.json` vertes ; `npx prettier --check .claude/settings.json` vert.
5. Si la session a rechargé la configuration (le dire) : `echo pierrebrethes.cloud` est refusé par le
   hook, `git stash list` par la règle. Sinon, Pierre le voit à la session suivante (`/hooks`).

## Vérifications

`npx vitest run scripts/garde-prod.test.mjs` vert, nombre de cas donné ; `sh -n` et `dash -n` du
hook ; 100 passages sur un JSON accepté sous `time`, moins de 30 ms chacun (il précède chaque commande
Bash ; trois `grep` en coûtent ~29 sur le Mac) ; `git status --short` : les trois fichiers créés et
l'état de départ ; `npm run verifier` vert.

## Rapport attendu

Format commun (README de la série), plus : `claude --version` (si ce n'est plus 2.1.280, relire les §
cités, dire ce qui a changé) ; comment l'écriture dans `.claude/`, chemin protégé, est passée ; ce qui
reste contournable et par quoi (P5, `git -C`, `sh -c`) ; les faux positifs du hook et leur parade.
