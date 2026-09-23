# 58-prod-operations — `npm run prod` sauvegarde, relance la presse, change un mot de passe et exporte l'état de référence ; le README n'a plus une recette à clé en préfixe

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 57.

**À lire :** `scripts/prod.mjs` et son test (57 : `readProdEnv`, `childEnv`, `convexCall`, sorties) ·
`convex/dev.ts` (`relaunchPress` ~115-144 : idempotente, rend `{ relaunched }`) · `convex/auth.ts`
(`resetPassword` ~66-76, une `internalAction`) et `convex/accounts.ts` (~100-120 : `ACCOUNT_NOT_FOUND`,
sessions supprimées) · `convex/errors.ts` (`fail` ~117 : `ConvexError({ code })`) ·
`scripts/exporter-etat-reference.mjs` (en-tête ~11-16, `fetchSnapshot` ~37-44 qui hérite de
l'environnement, drapeaux `--token=` `--saison=` ~517-535) · `node_modules/convex/dist/cli.bundle.cjs` :
`run` ~148629 (arguments d'une fonction en argv, nulle part ailleurs), `runFunctionAndLog` ~127753 (la
CLI elle-même : `ConvexHttpClient`, `setAdminAuth`, `function`), `export` ~132813 (`--path`, un zip
non occupé), `--env-file` de `deploy` ~134088 · `node_modules/convex/dist/esm/browser/http_client.js`
(`setAdminAuth` ~112, `function` ~409, `@internal`) · `deploiement/README.md` (~38-68, ~165-179, la
section de 57).

## Pourquoi

Après 57, `npm run prod` ne fait que lire. Le reste est recette : la presse relancée clé en préfixe
(README ~47-51) ; le mot de passe par la console ou par `npx convex run auth:resetPassword
'{"nickname":…,"password":…}'`, le secret dans l'historique du shell (~59-68) ; le premier
déploiement clé en préfixe (~175-179) ; l'export d'état contre « le déploiement configuré du dépôt »
(exporter ~15-16), donc celui de `.env.local`. Aucune sauvegarde ne se prend du poste, et 59 en exige une.

## Ce qui change

1. `backup` : `export --path <chemin>`. `backupPath({ home, now, sha })`, pure →
   `<home>/wws-sauvegardes/wws-<AAAA-MM-JJTHHMMZ>-<sha>.zip`, par `toISOString()` (UTC) ; `sha` = `git
   rev-parse --short=12 origin/main` (la dernière vue du poste, `sans-sha` à défaut ; 64 donnera le SHA
   servi). Dossier en `0700`, zip en `0600` : l'export porte les empreintes de mots de passe (`accounts`).
   Imprime chemin et taille ; zip absent ou vide → sortie 1. `backup(prod)` exportée, rend le chemin (59).
2. `relaunch-press` : `run dev:relaunchPress` ; `relancées : <codes>` ou `aucune chaîne à relancer`.
3. `reset-password <pseudo>` : refus sans TTY (`process.stdin.isTTY`), **avant** de lire `prod.env` —
   un masque n'a de sens qu'au clavier, et un agent n'en a pas. Deux saisies en mode brut, sans écho ;
   `Ctrl-C` sort 130 ; saisies différentes, refus. Cœur pur : `applyKey(buffer, key)` →
   `{ buffer, done, aborted }`. **L'appel ne passe pas par `convex run`**, dont les arguments se lisent
   dans `ps` : `callFunction(prod, name, args)` exportée — `ConvexHttpClient` (`convex/browser`),
   `setAdminAuth(adminKey)`, `function(name, undefined, args)`, la voie même de la CLI ; une ligne de
   commentaire dit pourquoi un `@internal`. Un refus imprime son code (`ACCOUNT_NOT_FOUND`,
   `PASSWORD_TOO_SHORT`…) ; le succès dit que les sessions du compte sont révoquées.
4. `export-etat --token=… --saison=…` : les deux exigés (sans jeton, `node
   scripts/exporter-etat-reference.mjs` suffit, le message le dit) ; `exportArgs({ token, saison })`
   pure ; l'exporter lancé par `process.execPath`, `env: childEnv(…)`, que son `npx convex run` hérite.
   L'exporter n'est pas touché.
5. `deploiement/README.md` : une ligne par sous-commande dans la section de 57 ; ~47-51 devient
   `npm run prod -- relaunch-press` ; la recette CLI ~64, `npm run prod -- reset-password <pseudo>`
   (la console reste) ; ~175-179, `npx convex deploy --env-file ~/.config/wws/prod.env` (Pierre seul :
   16 refuse `npx convex deploy` aux agents). Il ne reste aucune commande précédée de la clé ; les
   lignes de `.env.local` (dev) restent.

## Ce que ce prompt ne fait pas

Ni `wipe` (59), ni `restore-test` (60), ni GitHub (61), ni la refonte du README (67). Le jeton de
session d'`export-etat` reste en argv, comme aujourd'hui. Aucune règle de plus dans `.claude/settings.json`.

## Cas d'acceptation (tests d'abord)

Dans `scripts/prod.test.mjs`, rouges puis verts :

1. `backupPath` : forme exacte ; `sha` tel quel ; 23 h 30 UTC garde son jour, vérifié dans un enfant
   `process.execPath` sous `TZ=Europe/Paris` (vitest tourne en UTC depuis 05 : local et UTC s'y confondent).
2. `applyKey` : caractères, retour arrière sur tampon vide et plein, `\r` et `\n` terminent, `\u0003` interrompt.
3. `exportArgs` : `--token=` puis `--saison=` ; l'un sans l'autre → refus.
4. Enfant par `process.execPath`, `HOME` temporaire sans `prod.env`, stdin en tube : `reset-password
   Pierre` sort 2 sur le TTY, pas sur le fichier ; sans pseudo, et `export-etat --token=x`, sortie 2.

## Vérifications

- `npx vitest run scripts/prod.test.mjs` : vert, nombre de cas donné.
- Backend local seulement, un `HOME` temporaire monté comme en 57 (`prod.env` tiré de `.env.local`,
  jamais imprimé, réécrit par `grep`) :
  - `backup` : le zip sous `$T/wws-sauvegardes`, modes `0700` et `0600`, taille, durée, `unzip -l` ;
  - `relaunch-press` deux fois : la liste (quelles saisons locales, pourquoi), puis vide — sauf une
    saison au bout de son horloge, que `publish` (press.ts ~88-94) ne replanifie pas : elle revient ;
  - `reset-password`, chemin réseau, sans TTY : un script du scratchpad importe `readProdEnv`,
    `prodEnvPath` et `callFunction`, change le mot de passe d'un compte `essai58` créé par
    `npx convex run auth:register` ; `auth:login` refuse ensuite l'ancien, accepte le nouveau ;
  - `export-etat` avec l'URL `http://127.0.0.1:9` dans le `prod.env` temporaire : l'échec de connexion
    prouve que l'environnement atteint le `npx convex run` de l'exporter ; `git status --short WWS/simulation` inchangé.
- `grep -n 'ADMIN_KEY=<' deploiement/README.md` (motif partiel : 57 refuse le nom entier en Bash) : seul
  le `.env.local` du dev. `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : durée et taille du `backup` local, `_scheduled_functions`
dans le zip ou non ; les réponses locales ; le compte `essai58` laissé en local ; pour Pierre,
`reset-password` une fois au clavier contre le backend local (commande exacte, `HOME` temporaire) ;
« À trancher » : lire aussi le jeton d'`export-etat` sans écho ; refuser `reset-password` aux agents
par une règle, en plus du TTY.
