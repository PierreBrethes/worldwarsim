# 17-hook-prettier — chaque fin de tour formate les fichiers modifiés ou nouveaux, quel que soit l'outil qui les a écrits

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 16.

**À lire :** `.claude/settings.json` (créé par 16 : on y ajoute `hooks.Stop`), `.prettierignore`
(dist, coverage, .tanstack, node_modules, `src/routeTree.gen.ts`, `convex/_generated`, WWS, public,
package-lock.json, `*.md`), `.prettierrc.json` (`singleQuote`, `printWidth` 100), `package.json`
(`format:check` dans `verifier`), `scripts/garde-prod.test.mjs` (16 : un hook lancé par `spawnSync`),
https://code.claude.com/docs/en/hooks (§ Stop).

## Pourquoi

Transcripts (audit) : 63 `prettier --write` lancés à la main dans 16 sessions, parfois sur tout le
dépôt (`prettier --write CLAUDE.md convex src`), et au moins 9 des 100 lancements du vérifieur tombés
sur `format:check`. Un hook PostToolUse(Edit|Write) raterait l'essentiel : 585 éditions passaient par
des heredocs python, contre 302 Edit/Write. Un hook Stop regarde l'arbre tel qu'il est, par quelque
outil qu'on l'ait écrit. Mesuré à la rédaction : lister les fichiers modifiés et nouveaux puis
`prettier --list-different` sur eux prend 0,22 s sous `/usr/local/bin/node` v19.0.1 — le node que
voient les hooks sur le Mac tant que P2 n'est pas fait ; prettier 3.9.6 y tourne. Un fichier passé
explicitement et couvert par `.prettierignore` est sauté sans bruit (vérifié sur `CLAUDE.md` et
`WWS/simulation/opening/engine.mjs`).

## Ce qui change

1. `.claude/hooks/formater-modifies.sh` (à créer), sh POSIX, deux lignes de commentaire en tête au
   plus (pourquoi Stop et pas PostToolUse) :
   - `cd "$CLAUDE_PROJECT_DIR" || exit 0` ;
   - la liste : `git diff -z --name-only --diff-filter=ACMR HEAD`, puis
     `git ls-files -z -o --exclude-standard` (nouveaux, non ignorés) — séparateur NUL, le dépôt a des
     chemins avec espace (`Claude outputs/`) ;
   - `xargs -0 -r ./node_modules/.bin/prettier --write --ignore-unknown --no-error-on-unmatched-pattern --log-level warn`
     (`-r` : aucun appel sur liste vide ; GNU l'exige, BSD l'accepte) ;
   - `exit 0` toujours : ni l'absence de git, de `HEAD` ou de `node_modules`, ni un fichier au code
     invalide (prettier formate les autres et signale celui-là) n'empêchent un tour de finir. Aucun
     `git add` : l'index n'est pas touché.
2. `.claude/settings.json` : `hooks.Stop` (sans matcher) →
   `sh "$CLAUDE_PROJECT_DIR/.claude/hooks/formater-modifies.sh"`, `timeout` 30. Rien d'autre ne bouge.
3. `scripts/formater-modifies.test.mjs` (à créer), **avant** le script. Le test monte lui-même un
   dépôt jetable (`mkdtemp` sous `os.tmpdir()`, `git init -q`, commits en
   `-c user.name=… -c user.email=… -c commit.gpgsign=false`) — jamais à la main : `git commit` est en
   `ask` depuis 16. Il y copie `.prettierrc.json` et `.prettierignore`, écrit un `.gitignore`
   (`node_modules`, `ignore-moi.ts`) et un lien `node_modules` vers celui du dépôt. Premier commit :
   `a.ts` et `d.ts` formatés, `notes.md`. Puis `a.ts` réécrit mal formaté, `b.ts` et
   `dossier avec espace/c.ts` nouveaux et mal formatés, `ignore-moi.ts` (mal formaté aussi), `notes.md`
   modifié, `d.ts` supprimé, `casse.ts` au code invalide. Hook lancé par `spawnSync('sh', …)`,
   `CLAUDE_PROJECT_DIR` sur ce dépôt. Le test lit aussi `.claude/settings.json` : le hook Stop y est déclaré.

## Ce que ce prompt ne fait pas

Pas de PostToolUse. Ni `eslint --fix`, ni `tsc`, ni tests en fin de tour (tsc seul : 9 s ; l'audit
les écarte). `.prettierignore` et `.prettierrc.json` ne changent pas : rien sous `WWS/` ni aucun
`*.md` n'est formaté. Le hook de démarrage est le 18.

## Cas d'acceptation (tests d'abord)

1. Le test échoue avant le script (absent).
2. Après le hook, code 0 : `a.ts`, `b.ts`, `dossier avec espace/c.ts` formatés, et `const s = "x"`
   y devient `const s = 'x';` — preuve que `.prettierrc.json` est lu ; `ignore-moi.ts`, `notes.md`
   et `casse.ts` inchangés octet pour octet ; `d.ts` supprimé ne produit aucune erreur.
3. Second passage sur les mêmes fichiers, puis sur un arbre sans modification : code 0, aucun fichier
   réécrit (dates de modification inchangées : prettier n'écrit pas un fichier déjà formaté).
4. Lien `node_modules` retiré, puis `CLAUDE_PROJECT_DIR` sur un dossier vide hors git : code 0.
5. `b.ts` indexé par le test (`git add`, par `spawnSync`) avant le hook : `git diff --cached` du dépôt
   jetable, contenu compris, identique avant et après ; `git status --porcelain` le montre `AM`.

## Vérifications

- `npx vitest run scripts/formater-modifies.test.mjs` vert, nombre de cas donné ; `sh -n` et `dash -n`
  du script.
- Sur le dépôt réel, d'abord en lecture : la même liste passée à `prettier --list-different` — ce
  qu'elle nomme, le hook le reformatera ; le dire. Puis
  `time env CLAUDE_PROJECT_DIR="$PWD" sh .claude/hooks/formater-modifies.sh`, sous le PATH nvm et, si
  `/usr/local/bin/node` existe encore, sous `PATH=/usr/local/bin:$PATH` : 0,1 à 0,6 s, code 0.
- `npx prettier --check .claude/settings.json` et `npm run verifier` : verts.

## Rapport attendu

Format commun (README de la série), plus :

- les deux durées mesurées, et la liste que `--list-different` a nommée ;
- si la configuration a été rechargée en cours de session, dire si le hook a tourné en fin de tour ;
  sinon, Pierre le voit à la session suivante (`/hooks`) ;
- une conséquence à connaître : un fichier indexé puis reformaté par le hook apparaît `MM` dans
  `git status` — c'est le contenu indexé qui ne passerait pas `format:check`, à réindexer.
