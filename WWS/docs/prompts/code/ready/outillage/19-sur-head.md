# 19-sur-head — `npm run sur-head -- "<commande>"` lance une commande sur une copie jetable de HEAD, sans toucher ni l'arbre, ni l'index, ni un worktree

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `package.json` (`scripts`, dont `routes`), `scripts/generer-routes.mjs` (6 lignes : le
`routeTree` que seul Vite produit), `.gitignore` (`src/routeTree.gen.ts`, `.env.local` : absents de
toute archive), `.gitattributes` (`* text=auto eol=lf`, aucun `export-ignore`),
`WWS/simulation/opening/run.mjs` (`--grille` et `--sweep` écrivent `grille.json` et `sweep.json`
**à côté de `run.mjs`**, par `new URL('./…', import.meta.url)` : ~279 et ~306 dans l'arbre, ~171 et ~198 à HEAD),
`scripts/a-mesurer.test.mjs` (un test de script, projet vitest `front`).

## Pourquoi

Pour comparer à HEAD, l'IA a fait `git stash`, mesuré, puis `git stash pop` dans l'arbre : 12 fois en
3 sessions (audit), dont un `pop` en conflit démêlé par `git stash show -p`. Tout le travail non
commité est en jeu à chaque fois, et un `pop` sans `--index` désindexe : l'index porte aujourd'hui 9
fichiers de `WWS/simulation/opening`. Mesuré à la rédaction, sur une copie de HEAD (7bc3a69) :
`git archive HEAD -- . ':!WWS/sprites' | tar -x` prend 0,24 s pour 20 Mo (`WWS/sprites` pèse 74 Mo,
et `src/` ne le cite qu'en commentaire) ; avec un lien `node_modules` vers celui du dépôt, `npx vitest
run` y est vert (79 fichiers, 1 319 tests, 16 s ; `src/domain` : 613 tests, 2,3 s) et le plugin de
routes y produit `src/routeTree.gen.ts` de lui-même ; `node scripts/generer-routes.mjs` le produit
en 0,27 s pour `tsc`, qui ne passe pas par Vite ; `node WWS/simulation/opening/run.mjs` y rend la
sortie de HEAD (`actions : 28`), celle de l'arbre diffère (`27`), à cause des 9 fichiers indexés.

## Ce qui change

1. `scripts/sur-head.sh` (à créer), sh POSIX, `set -eu`, deux lignes de commentaire en tête au plus
   (pourquoi pas `git stash`, pourquoi pas un worktree) :
   - usage `sh scripts/sur-head.sh [--garder] "<commande>"` ; sans commande : usage sur stderr, code 2 ;
   - `RACINE=$(git rev-parse --show-toplevel)` ; `D=$(mktemp -d "${TMPDIR:-/tmp}/sur-head.XXXXXX")` ;
     sans `--garder`, un `trap` sur EXIT, INT et TERM supprime `$D` ;
   - `git -C "$RACINE" archive HEAD -- . ':!WWS/sprites' | tar -x -C "$D"`, puis `package.json` exigé
     dans `$D` (sh n'a pas `pipefail`) ; `ln -s "$RACINE/node_modules" "$D/node_modules"` ;
   - **décision** : `node scripts/generer-routes.mjs` toujours, dans `$D`, sortie tue sauf échec
     (0,3 s ; deviner si la commande en a besoin coûterait plus qu'il ne rapporte) ;
   - sur stderr, jamais sur stdout, qui reste à la commande : `sur-head : HEAD <sha court> → <D>` au
     début, `<D> supprimé` ou `<D> gardé` à la fin ;
   - `(cd "$D" && sh -c "$1")`, et le script sort avec **son** code.
2. `package.json` : `"sur-head": "sh scripts/sur-head.sh"`, à côté de `routes`.
3. `scripts/sur-head.test.mjs` (à créer), **avant** le script, par `spawnSync('sh', ['scripts/sur-head.sh', …])`.
   Il se saute (`describe.skipIf`) hors d'un dépôt git : la suite entière doit rester verte quand on la
   lance elle-même par `sur-head`. Chaque cas extrait HEAD et génère les routes (~0,6 s) : un délai
   de test explicite (30 s), pas les 5 s par défaut, qu'une CI lente dépasserait.

## Ce que ce prompt ne fait pas

Ni la consigne de CLAUDE.md qui renvoie à ce script (21), ni le refus de `git stash` (16). Pas d'entrée
en `allow` : le script exécute n'importe quelle commande. Pas d'outil de comparaison : on redirige
les deux sorties et on les compare soi-même. La copie n'est pas un dépôt git et n'a ni `.env.local`
ni `dist/` : ce qui en a besoin ne s'y lance pas. Un chemin de sortie s'écrit **absolu**, sinon il
disparaît avec la copie (`--json /tmp/avant.json`, ou `--garder` pour `--grille` et `--sweep`).

## Cas d'acceptation (tests d'abord)

1. Le test échoue avant le script (absent).
2. `test -f package.json && test ! -e .git && test -L node_modules && test -f src/routeTree.gen.ts &&
   test ! -e WWS/sprites && pwd` : code 0 ; le chemin imprimé n'existe plus après.
3. `cat package.json` rend exactement `git show HEAD:package.json`.
4. `exit 3` : code 3, dossier supprimé, et `node_modules/.bin/vitest` du dépôt toujours là (le
   nettoyage efface le lien, jamais sa cible : `rm -rf "$D"`, pas de chemin qui traverse le lien).
   Sans commande : code 2. Avec `--garder` : le dossier reste (le test le supprime).
5. `git status --porcelain=v1 -uall`, `git diff --cached --name-only` et `git stash list` du dépôt :
   identiques avant et après chaque cas.

## Vérifications

- `npx vitest run scripts/sur-head.test.mjs` vert ; `sh -n` et `dash -n scripts/sur-head.sh`.
- `npm run sur-head -- "npx vitest run src/domain --reporter=dot"` : vert, compte et durée.
- `npm run -s sur-head -- "node WWS/simulation/opening/run.mjs" > /tmp/sur-head.txt` (`-s` : sans lui,
  npm écrit son bandeau `> … sur-head` sur stdout, vérifié) : identique à la même commande lancée dans
  une extraction faite à la main (`git archive HEAD | tar -x` dans un `mktemp -d`) ; différente de
  celle de l'arbre tant que `git diff --quiet HEAD -- WWS/simulation/opening` sort en 1 (le dire si P3
  a été commité entre-temps).
- Avant et après ces trois commandes : `git status --porcelain=v1 -uall` et `git worktree list`
  identiques. `npm run verifier` vert.

## Rapport attendu

Format commun (README de la série), plus : les durées (extraction, routes, `src/domain`) ; la
confirmation, sur ce poste, que vitest et le plugin de routes passent par le lien ; ce que la copie
écrit dans `node_modules/.vite` (cache partagé par le lien : le dire, ne pas le corriger) ; le code de
sortie de `npm run sur-head -- "exit 3"`, pour savoir si npm le transmet tel quel.
