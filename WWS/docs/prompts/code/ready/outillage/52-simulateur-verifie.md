# 52-simulateur-verifie — `run.mjs --check` : les sorties suivies du simulateur sortent de son moteur

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 47, 48, P3.
**Pierre d'abord :** trancher (P4) le garde-fou « MANQUÉ » de `run.mjs` (~348-356) : assertion de
`--check` aux seuils qu'il donne, ou retrait de la sortie. Aux seuils écrits (≤ 1 connexion vide,
ADR 0017 ~264), il manque : 7/12 sur l'index du 23/09, 8/12 au HEAD d'alors. Décision au lancement.

**À lire :** `WWS/simulation/opening/run.mjs` (tout : `grid()` ~144, la branche `--sweep` ~288-307
qui calcule, imprime et écrit d'une boucle, la branche par défaut ~308-360) · `army.mjs` (effets de
bord, rien d'exporté) · `report.mjs` (`writeReport` ~264 lit `grille.json`, écrit `rapport.html`)
· les README de `WWS/simulation/opening/` (~7-15) et de `WWS/simulation/` (~32-33) · posés par 47
et 48 : `scripts/verifier.mjs`, `scripts/verif-rapide.mjs` et leurs deux tests (`STEPS`, chiffres
clés en littéral, déclencheurs, `planOf`) · ADR 0017 ~262-266 (la phrase du garde-fou).

## Pourquoi
`grille.json` (72 entrées) et `sweep.json` (16) sont suivis et lus pour trancher l'équilibrage ;
rien ne vérifie qu'ils sortent du moteur : au 23/09, l'index avait régénéré le premier et pas le
second (actions 10 → 9, troopCap 12 → 10), d'où P3. Ni `package.json`, ni la CI, ni le pre-push
n'exécutent `run.mjs`, `army.mjs`, `policy.mjs` ou `report.mjs` (`verify.mjs` n'importe que
`constants.mjs` et `engine.mjs`) ; WWS/ est hors d'eslint et de prettier. Le garde-fou sort en 0
sur « MANQUÉ » (« the tests judge » : aucun ne le juge) et mesure l'escarmouche, que le jeu n'a
plus (ADR 0020 §11). Mesuré : `--grille` 2,1 s, `--sweep` 0,4 s, défaut 0,23 s, `army.mjs` 0,15 s.

## Ce qui change
1. **Rangement d'abord, sorties inchangées.** `run.mjs` : `sweepRows()` extrait la boucle de
   `--sweep` et rend les entrées telles qu'écrites aujourd'hui (`series` et `log` à `undefined`) ;
   `defaultRuns()` rend l'objet `out` de la branche par défaut, mêmes clés ; ces deux branches
   impriment à partir d'eux, même ordre, en-têtes compris. `report.mjs` : `renderReport(runs,
   rows)` rend le HTML, `writeReport(runs)` lit `grille.json`, rend, écrit. Une seule fonction
   produit chaque sortie : `--grille`/`--sweep` l'écrivent, `--check` la compare.
2. **`node run.mjs --check`**, qui n'écrit rien (ni `rapport.html`) :
   - compare octet pour octet `JSON.stringify(grid(), null, 1)` à `grille.json` et
     `JSON.stringify(sweepRows(), null, 1)` à `sweep.json` ; sur écart, nomme le fichier, le rang
     de la première entrée qui diffère, ses champs (suivi → calculé) et la commande qui régénère ;
   - exécute `defaultRuns()`, puis `renderReport` sur les trois profils de la campagne et les
     entrées de la grille ; lance `army.mjs` en processus enfant (`process.execPath`, chemin tiré
     d'`import.meta.url`, sortie capturée, sortie d'erreur montrée sur un code non nul) ;
   - sort en 1 sur tout écart ou exception, en 0 sinon, avec une ligne de résumé (fichiers et
     entrées comparés, scénarios exécutés, durée) ; l'en-tête d'usage de `run.mjs` (~1-10) et le
     bloc de commandes du README nomment le mode.
3. **Le garde-fou, selon Pierre.** (a) Assertion : les seuils, nommés une fois, lus par la sortie
   par défaut (lignes gardées) et par `--check` (échec si l'un manque) ; « Printed rather than
   asserted » réécrit. (b) Retrait du bloc ~348-356, commentaire compris. Sans décision, la
   demander avant d'y toucher. L'ADR 0017 ne bouge pas : le rapport cite sa phrase (~262-266).
4. **Branchement.** `scripts/verifier.mjs` : `{ name: 'simulateur', command: ['node',
   'WWS/simulation/opening/run.mjs', '--check'], keyFigure }` juste après `miroir`, la ligne de
   résumé pour chiffre clé ; `verifier.test.mjs` la gagne en littéral (vert, KO).
   `verif-rapide.mjs` : la même étape pour un fichier sous `WWS/simulation/opening/`, **pas** pour
   `convex/constants.ts` — le simulateur n'importe que `node:fs` et ses propres modules, le jeu ne
   peut pas déplacer sa sortie (sa dérive vers le miroir, c'est `verify.mjs` et 51) ; son test
   gagne ces deux cas de `planOf`. `WWS/simulation/README.md` : `run.mjs --check` rejoint
   `verify.mjs` parmi ce que lance `npm run verifier`.

## Ce que ce prompt ne fait pas
- Ne régénère ni `grille.json` ni `sweep.json` : `--check` rouge sur l'arbre de départ, c'est P3
  pas faite ou un moteur qui a bougé — s'arrêter et le dire. Aucune tolérance numérique.
- Ne met pas WWS/ sous eslint ni prettier ; ne touche ni `verify.mjs`, ni `constants.mjs`, ni
  `engine.mjs`, `policy.mjs`, `scenarios.mjs`, `curves.mjs` ; aucun fichier de test nouveau ; de
  47 et 48, une entrée de table chacun et leurs cas de test, rien de leur affichage.

## Cas d'acceptation (tests d'abord)
0. Au départ : `git status --short WWS/simulation` vide, `scripts/verifier.mjs` et
   `scripts/verif-rapide.mjs` présents ; dans une copie du dossier au scratchpad, `--grille` et
   `--sweep` reproduisent les deux fichiers suivis. Sinon, arrête-toi.
1. Avant d'éditer, capturer au scratchpad la sortie de `node run.mjs` et de `node run.mjs --json
   <scratchpad>/avant.json`, et, dans la copie, celles de `--grille`, `--sweep` et `--rapport` avec
   son `rapport.html` ; après le rangement, tout identique octet pour octet, suivis compris.
2. `node WWS/simulation/opening/run.mjs --check` : 0 sur l'arbre propre (en (a), aux seuils de Pierre)
   sous 4 s ; `git status --short` inchangé ; `find WWS/simulation/opening -newer <témoin>` vide.
3. Dans une copie au scratchpad (jamais dans le dépôt), chaque altération sort en 1 avec un message
   qui la désigne : un chiffre de `sweep.json` (fichier, rang, champ) ; `EXTRACTION_PER_HOUR.ore`
   16 → 17 dans `constants.mjs` (les deux fichiers) ; un `throw` en tête d'`army.mjs` ; un `throw`
   dans `renderReport`.
4. Branche (a) : un seuil rendu intenable dans la copie → sortie 1. Branche (b) :
   `git grep -n "MANQUÉ" -- WWS/simulation` vide.
5. `npx vitest run scripts/verifier.test.mjs scripts/verif-rapide.test.mjs` vert ; `npm run
   verifier` vert, l'étape « simulateur » dans son tableau ; `npm run verif:rapide` la lance après
   une retouche sous `WWS/simulation/opening/`, pas après `src/domain/` ni `convex/constants.ts`.

## Vérifications
- `time node WWS/simulation/opening/run.mjs --check; echo $?` → 0, sous 4 s ; le cas 3 tout en 1.
- `npm run verifier` vert ; `npm run verif:rapide` comme au cas 5 ; `git status --short` : ce prompt seul.

## Rapport attendu
Format commun (README de la série), plus :
- la durée de `--check`, le surcoût mesuré sur `npm run verifier`, la branche du garde-fou ;
- deux commits, deux messages : le rangement (`sweepRows`, `defaultRuns`, `renderReport`, sorties
  identiques) puis le comportement (`--check`, garde-fou, branchement) ; `report.mjs` va entier au
  premier, et le rapport dit quels blocs de `run.mjs` vont à chacun.
