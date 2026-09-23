# 57-prod-socle — `npm run prod -- status` et `logs` parlent à la prod avec une clé lue dans `~/.config/wws/prod.env`, jamais tapée ni collée

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 08, 09, 16 (09 ajouté : `status` lit la santé par son `verdictOf`, pas par une seconde lecture).

**À lire :** `deploiement/README.md` (clé en préfixe ~47-51, ~59-68, ~175-179) · `convex/ops.ts` (08 :
`health`, argument `now`) · `scripts/read-health.mjs` (09 : `verdictOf(text)` → `{ ok, lines }`) ·
`scripts/exporter-etat-reference.mjs` (~37-44 : la CLI sans shell ; ~517 : garde du `main`) ·
`.claude/settings.json`, `.claude/hooks/garde-prod.sh`, `scripts/garde-prod.test.mjs` (16) ·
`node_modules/convex/dist/cli.bundle.cjs` : `resolveBaseDeploymentSelection` ~131630 (`.env.local` chargé
~131656 sans écraser l'environnement), `getDeploymentSelectionFromEnv` ~131727 (`CONVEX_DEPLOY_KEY` lue
avant l'auto-hébergé ; `CONVEX_DEPLOYMENT` fait échouer ~131805), `logs` ~138696 (suit sans fin) ·
https://code.claude.com/docs/en/permissions (§ Wildcard, `Read(~/…)`).

## Pourquoi

Chaque opération de prod se tape avec `CONVEX_SELF_HOSTED_URL=… CONVEX_SELF_HOSTED_ADMIN_KEY=<la clé du
VPS>` en préfixe (README ~47-51, ~175-179 ; les `export` ne passaient pas dans le terminal de Pierre), et
la clé a transité par une conversation le 12/09 (P7). `settings.local.json` autorise `Bash(npm run *)`
(~4) et `Bash(node *)` (~23) : seul un `deny` versionné l'emporte (vérificateur). Côté CLI, un
environnement injecté bat `.env.local` (dotenv sans `override`), mais une `CONVEX_DEPLOY_KEY` passe devant.

## Ce qui change

1. `scripts/prod.mjs` (à créer), node pur ; `"prod": "node scripts/prod.mjs"`. Exports purs :
   - `prodEnvPath(home)` → `<home>/.config/wws/prod.env` ; l'appelant passe `os.homedir()` ;
   - `readProdEnv(path)` → `{ url, adminKey }` par `util.parseEnv`. Refus nommés : absent (renvoi à la
     recette du README) ; `mode & 0o777` autre que `0o600` (le message donne `chmod 600 <chemin>`) ;
     une clé absente ou vide ; URL non `http(s)` ;
   - `childEnv(inherited, prod)` → copie sans `CONVEX_DEPLOY_KEY`, `CONVEX_DEPLOYMENT_TOKEN`,
     `CONVEX_DEPLOYMENT`, plus les deux valeurs du fichier, qui remplacent celles du shell ;
   - `convexCall(args)` → `[process.execPath, [<racine>/node_modules/convex/bin/main.js, ...args]]`, `cwd`
     la racine (`run` et `export` y exigent le `package.json` qui déclare `convex`) ; ni `npx`, ni shell,
     ni `--admin-key` : la clé ne vit que dans `env` ;
   - `parseLogsOptions(argv)` → `{ history, seconds }`, défauts 100 et 15, bornes 1-1000 et 1-300.
2. Aiguillage `status` | `logs`, sinon l'usage. **`prod.env` se lit dans la sous-commande, jamais avant
   l'aiguillage** (60 ajoutera `restore-test`, qui ne doit pas le lire). Sorties : 0 ; 1 si la santé
   n'est pas `ok` ; 2 pour un refus (usage, fichier, mode, `win32` : sous WSL) ; sinon celle de la CLI.
3. `status` : `run ops:health {"now":<Date.now()>}`, stdout capturé, 60 s au plus ; `santé de <hôte>`
   puis les `lines` de `verdictOf` ; sortie selon `ok`. S'il ne dit rien quand `ok` est vrai, imprimer
   `ok` : une lecture plus riche de `health` s'écrit dans `read-health.mjs`, pour la surveillance aussi.
4. `logs [--history N] [--secondes S]` : `logs --history N`, stdio hérité, `SIGINT` après S secondes
   (`SIGKILL` 2 s plus tard) ; sortie 0 quand la minuterie l'arrête.
5. `.claude/settings.json` (chemin protégé : Pierre accorde l'écriture) : `deny` += `Bash(npm run prod --
   wipe*)`, `Bash(npm run prod wipe*)` (npm passe aussi les arguments sans `--`, vérifié), `Bash(node
   scripts/prod.mjs wipe*)`, `Read(~/.config/wws/**)`, `Bash(*CONVEX_SELF_HOSTED_ADMIN_KEY*)` (ce nom ne
   se cherche plus que par l'outil Grep) ; `allow` += `Bash(npm run prod -- status)`. Première barrière
   seulement (`npm run -s prod -- wipe` y échappe) : le verrou du wipe est son refus sans TTY (59).
6. `deploiement/README.md` : `## Opérations de prod` (à créer dans le fichier), avant `## CI/CD`, dix
   lignes au plus : le fichier (un par poste), ses deux clés, `chmod 600` ; une recette sous `umask 077`
   qui y verse la dernière ligne de `generate_admin_key.sh` lue par `ssh`, sans que la clé passe par
   l'écran ni le presse-papiers ; `status` et `logs`, une ligne chacune. Les recettes en place restent (58).
7. `CLAUDE.md`, `## Instructions` (21) : « **Prod.** La clé d'admin ne se colle jamais dans une
   conversation ni une commande : `npm run prod -- <commande>` la lit dans `~/.config/wws/prod.env`. »
   La section garde ses 25 lignes (21) : au besoin, la phrase rejoint le paragraphe **Git.**

## Ce que ce prompt ne fait pas

Ni `backup`, `relaunch-press`, `reset-password`, `export-etat` (58), ni `wipe` (59), ni `restore-test` (60),
ni GitHub (61), ni rotation (P7), ni purge (P5). Un `cat` de `prod.env` échappe à `Read(…)` : le dire.

## Cas d'acceptation (tests d'abord)

`scripts/prod.test.mjs` (à créer), avant le script, dans `mkdtempSync(os.tmpdir())`, jamais le vrai `HOME` :

1. `readProdEnv` : absent, `0644`, `0640`, clé vide, URL `ftp:` → chacun son refus ; `0600` avec
   commentaires et lignes vides → `{ url, adminKey }`.
2. `childEnv` : les trois variables retirées, l'URL du shell remplacée, l'objet reçu intact ;
   `convexCall` ne porte la clé dans aucun argument ; `parseLogsOptions` : défauts, bornes, drapeau inconnu.
3. Enfant par `process.execPath`, `HOME` temporaire sans `prod.env` : `inconnue` sort 2 sur l'usage,
   **pas** sur le fichier ; `status` sort 2 sur le fichier absent.
4. `scripts/garde-prod.test.mjs` : les cinq `deny` et l'`allow` ; un compte de `deny` posé par 16 suit.

## Vérifications

- `npx vitest run scripts/prod.test.mjs scripts/garde-prod.test.mjs` : vert, nombre de cas donné.
- Backend local seulement (permis ici ; `.env.local` vise 127.0.0.1:3210), `npx convex dev --once` si
  `ops:health` n'y est pas. `T` = un dossier du scratchpad ; `mkdir -p "$T/.config/wws"`, `grep
  '^CONVEX_SELF_HOSTED' .env.local > "$T/.config/wws/prod.env"`, `chmod 600`. Ce fichier ne s'ouvre ni
  par Read ni par Edit (la clé s'imprimerait) : `sed` et `chmod` ; **aucun `npm run prod` sans `HOME="$T"`**.
  - `HOME="$T" npm run prod -- status` : les lignes, sortie 0 ou 1 selon `ok` (laquelle, pourquoi) ;
  - `chmod 644` → sortie 2 ; URL passée à `http://127.0.0.1:9` → échec de connexion, donc `.env.local`
    ne reprend pas la main ; chaque fois, remise en état ;
  - `HOME="$T" npm run prod -- logs --secondes 5` rend la main en moins de 10 s, sortie 0.
- La recette du README, sans rien imprimer : `docker compose exec -T backend ./generate_admin_key.sh |
  tail -n 1 | grep -Eq '^[^|[:space:]]+\|[^|[:space:]]+$' && echo forme-ok`.
- `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : la sortie locale de `status`, sa durée ; `wc -m CLAUDE.md`
avant et après ; `cut -d= -f1 .env.local` sans `CONVEX_DEPLOY*`, que dotenv rendrait à l'enfant ; `npm
run prod -- wipe` refusé par la règle si la session a rechargé sa configuration ; pour Pierre, son
`prod.env` par la recette, sur chaque poste ; « À trancher » : le hook de 16 et `cat`.
