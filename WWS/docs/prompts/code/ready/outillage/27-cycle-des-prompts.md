# 27-cycle-des-prompts — `npm run prompts` dit ce qui cloche dans ready/ et déplace un prompt en réécrivant ses renvois ; ready/ ne contient plus que ce qui se donne

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `WWS/docs/prompts/code/README.md` (`_to_delete/` ~10, « rituel » ~16) ; l'en-tête des
trois prompts de `WWS/docs/prompts/code/ready/` ; `scripts/generate-a-mesurer.mjs` et son test (le
modèle : fonctions pures exportées, garde `process.argv[1]` ~153, projet vitest « front »).

## Pourquoi

ready/ ne contient aucun prompt à donner. `noms-de-modules-convex.md` est entré par 46d2320 et
`contours-de-region-paresseux.md` par 54678c5 (11/09), dans les commits qui les exécutaient
(`convex/movement/cargoReturn.ts` ; `raster ??=` de `convex/regionGeometry.ts` ~45,
`IMPORT_BUDGET_MS` de `convex/invariants.test.ts` ~145) ; `fin-de-saison-au-seuil-tenu.md` porte le
bandeau « Remis à plus tard (Pierre, 16/09) ». Dans l'autre sens, 14 lignes de documents vivants
renvoient vers ready/ des prompts passés en done/ : RESTE-A-CODER.md ~45, ~46, ~255, ~263, ~265,
~268, ~293 ; sous `WWS/docs/design/propositions/`, combat-simultane-terrain-retranchement.md ~21 et
~32, objectifs-mobiles.md ~68, ordre-de-mobilisation-et-fenetre-economie.md ~7 et ~146,
pillage-et-butin.md ~11 ; `WWS/docs/prompts/images/logo.md` ~6. Le déplacement dépend d'un rituel
qui n'a jamais tourné dans Claude Code, et rien ne réécrit les liens entrants. Le README envoie
encore un prompt périmé dans `WWS/docs/_to_delete/`, et ne dit pas que
`git log --diff-filter=AR -- 'WWS/docs/prompts/code/done/<slug>.md'` rend le commit d'un prompt.

## Ce qui change

1. `scripts/prompts.mjs` (à créer), `"prompts": "node scripts/prompts.mjs"` dans `package.json`.
   Identifiants en anglais, sortie en français ; fonctions pures exportées, git et disque à part.
   - **Documents vivants** : les `.md` présents sur le disque, suivis ou non ignorés
     (`git ls-files --cached --others --exclude-standard`), hors `WWS/docs/prompts/code/done/`,
     `_to_delete/`, « Claude outputs/ » et `WWS/docs/rapports/`.
   - **Renvoi** : `ready/<rel>.md`, `done/<rel>.md` ou `plus-tard/<rel>.md`, précédé ou non de
     `prompts/code/`, en backticks, en lien relatif ou en forme courte ; `<rel>` garde le
     sous-dossier de série (`outillage/27-cycle-des-prompts`). Les trois dossiers sont frères
     (`WWS/docs/prompts/code/plus-tard/` (à créer)) : corriger un renvoi, c'est changer ce segment.
2. `npm run prompts -- status`, toujours en code 0 : (a) chaque prompt de `ready/**` (pas le `README.md`
   d'une série), date et hash de son commit d'ajout (`--diff-filter=A`, le plus ancien) ou « non suivi »,
   et ses drapeaux — **ajouté avec du code** (ce commit touche un fichier de `src/`, `convex/` ou
   `scripts/` que le prompt cite entre backticks, au chemin exact, ancien nom d'un renommage compris ; un
   dossier ne compte pas), **bandeau** (une ligne `>` avant le premier `## ` contient « Remis à plus
   tard » ou « Ne pas donner » ; pas dans le corps), **aussi dans done/** ; drapés d'abord, avec la
   commande suggérée ; (b) le contenu de `plus-tard/` ; (c) chaque renvoi d'un document vivant vers un
   `ready/<rel>.md` absent de ready/ mais présent dans done/ ou plus-tard/, en `fichier:ligne` ; (d) pour
   information, les commits qui ont fait entrer plusieurs prompts dans done/ : total, cinq derniers.
3. `npm run prompts -- done <nom>` et `-- plus-tard <nom>` : `<nom>` est un slug, `outillage/NN-slug`,
   avec ou sans `.md`, ou le chemin complet ; ambigu ou introuvable, refus qui liste les candidats.
   Déplacement par `fs.renameSync`, pas `git mv` (l'index reste à Pierre, et la série n'est peut-être
   pas suivie), jamais d'écrasement ; puis réécriture des renvois dans les documents vivants, avec
   la liste des fichiers et leur nombre de renvois. **Idempotent** : un prompt déjà à destination
   ne bouge pas mais ses renvois sont réécrits — c'est ainsi qu'on répare ceux vers done/. Aucun
   fichier de done/ n'est réécrit ; le prompt déplacé non plus, sa profondeur ne change pas.
4. `scripts/prompts.test.mjs` (à créer), écrit d'abord, sur données injectées (jamais le vrai dépôt) :
   réécriture (backticks, lien `../../prompts/code/ready/x.md`, chemin complet, forme courte, sous-dossier ;
   `ready/x-bis.md` intact quand on déplace `x` ; idempotence ; compte) ; bandeau (en tête oui, corps non) ;
   résolution du nom ; filtre des documents vivants ; « ajouté avec du code » ; log multi-prompts.
5. `WWS/docs/prompts/code/README.md` réécrit : `ready/` (ce qui se donne ensuite, un sous-dossier par
   série), `plus-tard/` (parqué par Pierre, bandeau daté), `done/` (jamais modifié) ; un prompt
   périmé avant d'être donné est **supprimé**, git garde l'histoire ; `done <nom>` à l'acceptation
   d'un rapport, `status` pour l'état, la commande `git log --diff-filter=AR` du « Pourquoi ».
6. Maintenant, par le script : `done` des deux prompts exécutés, `plus-tard` pour
   fin-de-saison-au-seuil-tenu (qui réécrit `vision-v1-expeditions.md` ~62), puis `done <slug>`
   pour chaque prompt que `status` (c) signale encore. Ce prompt-ci reste dans `ready/outillage/`.

## Ce que ce prompt ne fait pas

- `_to_delete/`, « Claude outputs/ » (29) ; passe 3 du skill (72) ; `_modele.md` et lint (28) ; CI (31-33).
- Aucun statut de RESTE-A-CODER (« prêt » devant un prompt livré, l'item 12) : les chemins seuls (30).
- Rien dans les deux prompts déplacés : leurs noms morts (`cargo-return.ts`, `generer-regions.mjs`) restent.

## Cas d'acceptation (tests d'abord)

1. `npx vitest run scripts/prompts.test.mjs` : vert, écrit avant le script.
2. Avant tout déplacement, `status` drape « ajouté avec du code » noms-de-modules-convex (46d2320),
   contours-de-region-paresseux (54678c5) et, faux positif attendu, fin-de-saison (1069f99 touche
   `convex/holding.ts`, `press.ts`, `view.ts`, qu'il cite), qui porte aussi « bandeau » ; il liste les 14
   renvois du « Pourquoi » ; il compte au moins 26 commits multi-prompts (dont 03b6dff : trois prompts).
3. Après : `ls WWS/docs/prompts/code/ready` ne rend que `outillage` ; `status` (c) est vide ;
   `vision-v1-expeditions.md` ~62 vise `plus-tard/fin-de-saison-au-seuil-tenu.md`.
4. `git diff --name-only -- WWS/docs/prompts/code/done/` est vide.
5. `git grep -n -E '_to_delete|rituel' -- WWS/docs/prompts/code/README.md` ne rend rien.
6. Relancer `npm run prompts -- done noms-de-modules-convex` ne modifie aucun fichier et le dit.

## Vérifications

Les cas 1 à 6 ; `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : `status` avant et après, et sa durée ; chaque fichier
réécrit avec son nombre de renvois ; les faux positifs du drapeau « ajouté avec du code » constatés.
