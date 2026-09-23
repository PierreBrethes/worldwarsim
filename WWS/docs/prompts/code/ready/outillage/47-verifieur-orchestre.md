# 47-verifieur-orchestre — `scripts/verifier.mjs` fait tourner toutes les étapes, et un tableau dit lesquelles tombent

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 13, 37, 46.

**À lire :** `package.json` (`verifier` et les scripts qu'il enchaîne, après 12, 13, 34 et 37) ·
l'appel `npm run verifier` de `.githooks/pre-push`, le pas `Vérifications` de
`.github/workflows/ci.yml` et son commentaire · `scripts/mesure-isolat.mjs` (ligne finale) · la fin
de `WWS/simulation/opening/verify.mjs`
· `buildReporterPlugin` (`node_modules/vite/dist/node/chunks/node.js`) · `scripts/generate-a-mesurer.mjs`
~153 (garde du `main`) · `scripts/a-mesurer.test.mjs` (un test de script, projet vitest `front`).

## Pourquoi
`verifier` est une chaîne de `&&` (`package.json`). Le premier échec arrête tout : un fichier mal
formaté cache un test rouge, et chaque correction relance la chaîne entière pour trouver l'échec
suivant. Du 13 au 23/09, les transcriptions comptent 100 lancements dans 22 sessions (environ 1 h 50
de vérifieur), lus par `| tail -40` (11 fois) ou `| tail -30`, alors qu'un handoff du 11/09 exigeait
« le nombre de tests ». Une sortie jetée coûte aussi une cause : sur 9 exécutions de vitest en
parallèle avec tsc, eslint, vite build et l'isolat, une est sortie en 1, huit relances n'ont rien
reproduit, et rien n'avait été capturé.

## Ce qui change
1. `scripts/verifier.mjs` (à créer) commence par `export const STEPS` : une entrée par maillon de la
   chaîne laissée par 13 et 37, même commande, dans cet ordre : `format`, `lint`, `types`, `knip`,
   `test`, `build`, `isolat`, `miroir`. Forme, que 50 et 52 recopieront :
   `{ name, command, keyFigure }`. `command` commence par `'npm'` (`format` vaut
   `['npm', 'run', 'format:check']`, jamais `format`, qui réécrit) ou `'node'`
   (`['node', '--expose-gc', 'scripts/mesure-isolat.mjs']`). **Décision :** `build` vaut
   `['node', 'node_modules/vite/bin/vite.js', 'build']`, sans le `--logLevel warn` de 13 : il ne
   raccourcissait que l'écran, que le journal remplace, et il tait `✓ N modules transformed`
   (`buildReporterPlugin` ne passe `logInfo` qu'au niveau info). Jamais `npm run build`, qui
   relancerait `types`. `'node'` devient `process.execPath` ; `'npm'`, `process.execPath`
   puis `process.env.npm_execpath` (hors de `npm run` : le `npm` du PATH), `--silent` après `run`.
   Le `PATH` de chaque étape commence par `dirname(process.execPath)` : npm n'y ajoute que
   `node_modules/.bin`, dont les `#!/usr/bin/env node` prendraient sinon le node 19 du Mac. Un
   maillon hors des huit étapes est gardé tel quel et signalé.
2. **Séquentiel, et toutes les étapes tournent**, même après un KO. L'en-tête dit pourquoi : un
   échec vitest inexpliqué sous charge, que les journaux captureront. Aucune option `--parallel`.
3. **Journal par étape** : `node_modules/.cache/wws/verifier/<name>.log`, écrasé à chaque passe,
   stdout et stderr mêlés dans l'ordre d'arrivée, sans séquences de contrôle (`stripVTControlCharacters`
   de `node:util` : rolldown colore même hors TTY). Une étape KO le copie dans `<name>.ko.log`,
   qu'une passe verte n'écrase pas : il gardera le prochain échec intermittent.
4. **Affichage.** Chaque ligne s'imprime dès que son étape finit, colonnes alignées d'avance :
   `étape | OK/KO | durée (12,3 s) | chiffre clé`, nombres en `fr-FR`. `keyFigure(output, ok)` ne
   lève jamais ; une sortie illisible donne `—`. `test` : `1 319 tests / 79 fichiers` (lignes
   `Tests` et `Test Files` ; sur KO, `2 échecs / 1 319`). `isolat` : `44 modules, max 5,9 Mio`, tiré
   de « 44 modules de convex/ sous le budget de 10 Mio à l'import (le plus lourd : 5.9 Mio). », que
   46 ne change pas. `miroir` : `145 valeurs, 4 non vérifiées`. `build` : `437 modules`. Sur KO
   seulement : `types`, la somme des `Found N error(s)` des deux passes tsc ; `lint`,
   `✖ N problem(s)` ; `format`, le nombre de fichiers signalés ; `knip`, la somme des compteurs de
   section. Puis, par étape KO, un titre avec le chemin de son journal et ses 40 dernières lignes,
   ou le journal entier si `process.env.CI` est posé (le fichier ne survit pas au runner). La
   dernière ligne donne le nombre d'étapes et de KO, la durée totale et le dossier des journaux.
   Sortie 1 si une étape est KO. Au vert, 20 lignes au plus, en-tête de npm compris.
5. **Exports**, que 48 réutilise : `STEPS`, `runStep(step, { logDir })` (qui rend
   `{ name, ok, ms, keyFigure, output, logPath }`), `renderRow(result)` et `tail(text, lines)`. Le
   `main` est gardé comme celui de `generate-a-mesurer.mjs` ~153. SIGINT n'est pas intercepté.
6. `package.json` : `"verifier": "node scripts/verifier.mjs"`. Les scripts appelés restent la seule
   source des drapeaux ; `.githooks/pre-push` ne bouge pas. Le commentaire du pas `Vérifications`
   de `ci.yml` et la ligne `npm run verifier` de `CLAUDE.md` renvoient à `STEPS` au lieu d'énumérer.

## Ce que ce prompt ne fait pas
- Aucune commande d'étape ne change, hormis le `--logLevel warn` de `build` (point 1) : ni
  drapeaux, ni caches (13, 34), ni knip (37), ni l'isolat (46), ni budget de temps d'un test.
- Pas de mode parallèle ni de sélection d'étapes : la vérification rapide revient à 48. Les étapes
  `assets` (50) et `simulateur` (52) viendront plus tard.

## Cas d'acceptation (tests d'abord)
1. `scripts/verifier.test.mjs` (à créer). Chaque `keyFigure` rend la chaîne attendue sur une sortie
   réelle collée en littéral : résumé vitest vert et rouge, ligne finale de l'isolat, résumé du
   miroir, `✓ N modules transformed`, `Found 3 errors in 2 files.` et `Found 1 error in …`,
   `✖ 2 problems` et `✖ 1 problem`. Sur une chaîne vide ou quelconque, `—`, sans lever.
2. Même fichier, dossier temporaire : `runStep` sur `['node', '-e', 'console.log("a"); process.exit(1)']`
   rend `ok: false` et écrit `<name>.log` et `<name>.ko.log` ; sur une commande qui réussit, `ok: true`
   sans `.ko.log`. `tail` rend les N dernières lignes, sans ligne vide finale.
3. `npm run verifier` sort 0 : huit lignes OK avec leurs chiffres clés, 20 lignes au plus (`wc -l`).
4. Échec provoqué : `scripts/echec-provoque.test.mjs` (à créer puis supprimer ; pas en `.sonde.test.ts`,
   que 21 gitignore et que prettier sauterait) contient `import { expect, it } from "vitest";` et
   `it("échoue", () => expect(1).toBe(2));`. Sortie 1 ;
   `format` (guillemets doubles) et `test` sont KO, avec leurs 40 dernières lignes ; les autres
   s'affichent avec leur durée, donc ont tourné (que knip signale le fichier est indifférent). Avec
   `CI=true`, le journal entier de `test` s'imprime. Fichier supprimé, `git status --short` inchangé.
5. `.githooks/pre-push` est identique, et `ci.yml` ne diffère que par son commentaire.

## Vérifications
- `npx vitest run scripts/verifier.test.mjs` vert ; le cas 4, puis `ls node_modules/.cache/wws/verifier/` ;
  `time npm run verifier` avant tout changement (la chaîne), puis après : même verdict.

## Rapport attendu
Format commun (README de la série), plus : le tableau vert tel qu'imprimé et les deux durées
(chaîne, orchestrateur) ; la sortie du cas 4, coupée après les titres des étapes KO ; tout maillon
hors des huit étapes, et tout chiffre clé resté à `—` faute de ligne stable.
