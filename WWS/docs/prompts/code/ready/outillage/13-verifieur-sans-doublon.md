# 13-verifieur-sans-doublon — `npm run verifier` vérifie le format d'abord, lance routes et tsc une seule fois, garde eslint, prettier et tsc en cache, et ne liste plus `dist/`

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 12.

**À lire :** `package.json` (~7 `build`, ~11 `types` tel que 12 l'a laissé, ~12 `lint`, ~14
`format:check`, ~17 `verifier`), `eslint.config.js` (~9 les ignorés ; aucune règle typée),
`.prettierignore`, `.github/workflows/ci.yml` ~26-30, `node_modules/prettier/internal/legacy-cli.mjs`
(~6596-6606 et ~6678 : où prettier range son cache, et quand il l'efface).

## Pourquoi

`verifier` (~17) enchaîne types → lint → format:check → test → build → isolat → miroir, et `build`
(~7) vaut `npm run types && vite build` : routes et tsc tournent **deux fois** (`npm run types`
seul : 8,8 à 11,9 s). Aucun cache. Sortie : 257 à 260 lignes, dont 137 de `dist/assets`. L'audit
a mesuré 65,5 à 69,8 s par passage et compté 100 lancements en 22 sessions (13-23/09), 11 fois
suivis de `| tail -40` ; au moins 9 ont échoué sur le format, après ~15 s de routes, tsc et lint.
À chaud : tsc `--incremental` 1,9 s au lieu de 7,5 (passe convex 0,8 au lieu de 2,3), eslint
`--cache` 0,8 au lieu de 4,0, prettier `--cache` 0,8 au lieu de 3,3 ; `vite build --logLevel warn`
rend ~12 lignes au lieu de ~150. Le front de prod se construit déjà sans `types` (Dockerfile ~8).

## Ce qui change

1. `verifier` : la même liste, rien de retiré, dans cet ordre :
   `npm run format:check && npm run lint && npm run types && npm run test && vite build --logLevel warn && node --expose-gc scripts/mesure-isolat.mjs && node WWS/simulation/opening/verify.mjs`.
   Format et lint d'abord : les plus rapides, et ils ne lisent pas `src/routeTree.gen.ts` (ignoré
   par `.prettierignore` et `eslint.config.js` ~9), donc ils tournent aussi sur un clone neuf en CI.
2. `types`, tel que 12 l'a laissé (`… && tsc --noEmit && tsc --noEmit -p convex/tsconfig.json`) :
   chaque passe tsc reçoit `--incremental --tsBuildInfoFile`, vers `node_modules/.cache/wws/tsc-racine.tsbuildinfo`
   et `node_modules/.cache/wws/tsc-convex.tsbuildinfo`. Sur la ligne de commande, jamais dans un
   tsconfig : `convex deploy` lit `convex/tsconfig.json`.
3. `lint` : `eslint . --cache --cache-strategy content --cache-location node_modules/.cache/wws/eslint/`
   (la barre finale fait un dossier ; `content` : le cache suit le contenu, pas la date). Sûr parce
   qu'aucune règle n'est typée : le verdict d'un fichier ne dépend que de lui et de la config.
4. `format:check` : `prettier --check . --cache --cache-location node_modules/.cache/wws/prettier`.
   `--cache` marche avec `--check` (~6678 : seul un fichier déjà formaté entre au cache, stratégie
   `content` par défaut). Emplacement explicite, parce que `npm run format`, sans `--cache`,
   **efface** le cache de l'emplacement par défaut (~6602-6606).
5. `build` ne change pas (`npm run types && vite build`) : c'est la commande des humains.
6. Le commentaire de `ci.yml` ~27-28 et la ligne `npm run verifier` de CLAUDE.md (~12) disent le
   nouvel ordre (format, lint, types, tests, build, isolat, miroir : `ci.yml` oubliait l'isolat) ;
   le bloc de commandes de CLAUDE.md (~7-14) gagne une ligne : les caches vivent dans
   `node_modules/.cache/wws`, et un `rm -rf` de ce dossier repart à froid.

## Ce que ce prompt ne fait pas

- Ni orchestrateur, ni étapes poursuivies après un échec, ni tableau (47) ; ni `verif:rapide` (48).
- `scripts/mesure-isolat.mjs` n'est pas touché (46) ; l'avertissement des routes reste, une fois
  au lieu de deux (14) ; pas de `--max-warnings 0` ni de règle eslint nouvelle (34, 36).
- Le job `deployer` : le `--typecheck disable` de son `convex deploy` (ci.yml ~54) est au 66.
  Les avertissements que `vite build` garde (morceau > 500 kB, `[PLUGIN_TIMINGS]`) : « À trancher ».

## Cas d'acceptation (tests d'abord)

Cas 1 et 2 **avant** de toucher `package.json`. Journaux dans `T=$(mktemp -d)`. Sonde par Write,
injection par Read puis Edit, tout retiré après. Sous WSL, sans `/usr/bin/time`, le `time` du shell.

1. Avant : `/usr/bin/time -p npm run verifier > $T/avant.log 2>&1`, vert. Noter la durée, `wc -l`,
   `grep -c '^> types$'` (2) et `grep -c 'dist/assets'` (137).
2. Avant, échec de format : `src/zz-sonde-format.ts` (à créer) contient `export const  sonde=1`.
   Le vérifieur échoue ; noter la durée, et que `> types` précède l'échec.
3. Après, à froid : `rm -rf node_modules/.cache/wws`, puis la commande du cas 1 vers `$T/froid.log`,
   verte. `grep -c '^> routes$'` et `grep -c '^> types$'` valent 1 ; `grep -c '^> build$'` et
   `grep -c 'dist/'` valent 0. `ls -a node_modules/.cache/wws` montre `eslint/`, `prettier`,
   `tsc-racine.tsbuildinfo` et `tsc-convex.tsbuildinfo`.
4. Après, à chaud : la même commande vers `$T/chaud.log`, verte et plus courte que 3.
5. Après, échec de format : la sonde du cas 2 fait échouer le vérifieur sur `format:check`, sans
   aucune ligne `> types` au journal. Noter la durée.
6. Le cache ne masque rien : caches chauds, une injection à la fois dans un fichier **déjà en
   cache**, `src/domain/telegraph.ts`. `MESSAGE_MAX_CHARS = 300` (~11) devient `'300'` : `npm run
   types` échoue en nommant `src/shell/TelegraphThread.tsx` (~81) et `convex/messages.ts` (~31),
   non touchés (la passe convex, lancée seule avec ses drapeaux, nomme le second). La même ligne
   écrite `export const  MESSAGE_MAX_CHARS=300;` fait échouer `npm run format:check` ;
   `export function sondeLint() { debugger; }` en fin de fichier, `npm run lint` (`no-debugger`).
   Injections annulées : `npm run format:check && npm run lint && npm run types` redevient vert.
7. `npm run build` passe.

## Vérifications

- `npm run verifier` vert (cas 3 et 4), et les `grep` du cas 3. `git status --short` : seuls
  `package.json`, `.github/workflows/ci.yml` et `CLAUDE.md`, aucune sonde, `src/` intact.
- `git diff package.json` : `build`, `test` et `routes` inchangés.

## Rapport attendu

Format commun (README de la série), plus : durées réelles et user (avant, à froid, à chaud) et
lignes de sortie avant/après ; durée jusqu'à l'échec de format (cas 2 et 5) ; surcoût à froid de
`--incremental` (passe tsc racine à froid, avec et sans), que la CI paie à chaque poussée ; en
« À trancher », avec une recommandation, les lignes que `vite build` garde (taire
`[PLUGIN_TIMINGS]` par l'option `checks` de rolldown, relever `chunkSizeWarningLimit`, ou garder).
