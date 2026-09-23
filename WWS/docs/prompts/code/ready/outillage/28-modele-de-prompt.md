# 28-modele-de-prompt — un prompt se rédige depuis `_modele.md`, et `npm run prompts -- lint` refuse un chemin mort avant qu'il entre dans ready/

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 27.

**À lire :** `scripts/prompts.mjs` et `scripts/prompts.test.mjs` (27) ; `WWS/docs/prompts/code/README.md`
(réécrit par 27) ; le README de la série, § « Conventions communes » (le format de rapport) ; pour la
structure, `WWS/docs/prompts/code/done/rester-en-mer.md`, `WWS/docs/prompts/code/done/objectifs-neutres.md`
et `WWS/docs/prompts/code/done/commandes-de-la-souris.md`.

## Pourquoi

Sur les 138 prompts de done/, 125 portent « Lis `CLAUDE.md` … » avant leur première section et 125
« Ne commit pas » : CLAUDE.md est déjà chargé, le préambule se recopie à la main. Les titres divergent
(« Critères d'acceptation » ×53, « Ce que tu ne fais pas » ×52, « Hors périmètre » ×9), 9 prompts
seulement fixent un « Rapport attendu » ; les 40 derniers entrés dans done/ convergent (« Cas
d'acceptation » ×25, « Ce qui change » ×21, « La règle » ×19, « Ce que ce prompt ne fait pas » ×18).
Rien ne vérifie un prompt avant qu'il entre dans ready/ : l'audit a compté 28 chemins, cités par 19
prompts, qui n'ont existé à aucun moment. done/rester-en-mer.md (078feb0, 18/09) cite cargo-return.ts
sous convex/movement/, renommé `convex/movement/cargoReturn.ts` une semaine plus tôt (46d2320) ;
contours-de-region-paresseux.md (11/09) cite generer-regions.mjs, devenu `scripts/generate-regions.mjs`
le 15/08 (f6e10fc) ; done/emplacements-par-site.md place QUESTIONS.md sous WWS/docs/.

## Ce qui change

1. `WWS/docs/prompts/code/_modele.md` (à créer), 60 lignes au plus, que Cowork suit pour rédiger :
   `# <slug> — <ce qui sera vrai après>` ; `**Suppose :**` et, si besoin, `**Pierre d'abord :**` ;
   `**À lire :**` (fichiers de code, ADR et §, fiches, chacun avec ce qu'on y regarde ; jamais
   `CLAUDE.md` ni `CONVENTIONS.md`, déjà chargés) ; la seule ligne d'interdit, « Ne commit pas, ne
   push pas : Pierre commite ; le périmètre tient en un commit. » ; puis `## La règle` (ce qui doit
   être vrai, son ADR § ou sa décision datée ; pour un défaut, le constat chiffré),
   `## Ce qui change`, `## Ce que ce prompt ne fait pas`, `## Cas d'acceptation (tests d'abord)`,
   `## Vérifications` (commandes exactes, résultat attendu), `## Rapport attendu`. Le rapport a le
   format de la série : **Fait** (fichiers touchés) · **Écarts au prompt** · **Vérifications**
   (sortie chiffrée de `npm run verifier` : tests, durée) · **Docs touchées** · **Message de commit
   proposé** · **À trancher** (1a/1b, recommandation). Quatre règles d'écriture : « (à créer) »
   après un chemin qui n'existe pas encore ; « ~N » pour une ligne, le nom de fonction prime ; une
   constante `@a-mesurer` nomme sa mesure ; le récit va dans `WWS/docs/ETAT-DU-CODE.md` ou l'ADR
   (règle posée par 25), `CLAUDE.md` ne reçoit qu'un invariant nouveau, sans décompte. Dernière étape :
   `npm run prompts -- lint <fichier>` vert. Un prompt de série remplace l'interdit et le format du
   rapport par le renvoi au README de sa série.
2. `WWS/docs/prompts/code/README.md` : « Rédiger un prompt » — partir de `_modele.md`, finir par le lint.
3. `npm run prompts -- lint <fichier|dossier>...` dans `scripts/prompts.mjs`. Un **chemin** est un
   contenu de backticks sans espace, avec « / », dont le premier segment est une entrée de la racine
   (à HEAD ou sur le disque) ; ne le sont pas `ghcr.io/…`, `linux/amd64`, ni un import de paquet qui
   résout sous `node_modules/` (`convex/values`, `convex/server`). On retire un `:N` ou `:N-M` final, on
   développe les accolades, on ignore ce qui contient `<`, `>`, `…`, `*`, `$` ou vit sous
   `node_modules/`, `dist/`, `.tanstack/`. Verdicts :
   - existe à HEAD (`git ls-tree -r --name-only HEAD`) comme fichier, comme dossier (préfixe) ou,
     sans extension, comme import (`convex/constants` → `.ts`, `.tsx`, `.mjs`, `.js`) → rien ;
   - existe seulement sur le disque (`.claude/settings.local.json`) → **hors HEAD**, information ;
   - suivi de « (à créer) », ou précédé sur sa ligne de « crée », « créer », « nouveau »,
     « nouvelle » → exempté ; déclaré « (à créer) », lui ou un fichier sous lui, ailleurs dans le même
     dossier, ce prompt compris → exempté, « créé par NN » ; par un numéro plus grand → **avertissement** ;
   - sinon **mort**, avec une suggestion : les fichiers de HEAD au même nom de base normalisé (casse,
     `-` et `_` ignorés), à défaut ceux du même dossier à distance d'édition ≤ 3.
   Plus une **alerte** quand une ligne avant le premier `## ` commence par « Lis » et nomme
   CLAUDE.md. Sortie `fichier:ligne chemin → suggestion` ; code 1 s'il reste un chemin mort, 0 sinon.
   `status` gagne un drapeau « N chemins morts » par prompt de ready/, par la même fonction.
4. Tests d'abord dans `scripts/prompts.test.mjs`, HEAD et disque injectés : chaque verdict ; les trois
   suggestions du « Pourquoi » (la troisième vers `WWS/QUESTIONS.md`) ; accolades ; `:N` ; import sans
   extension ; l'alerte en tête mais pas dans le corps.
5. `npm run prompts -- lint WWS/docs/prompts/code/ready/outillage/`, puis chaque chemin mort corrigé
   **dans les prompts de ready/outillage/** : le bon chemin vérifié dans le code, une forme `<…>` pour
   un exemple, ou « (à créer) » quand le prompt crée le fichier. La forme seulement, jamais le fond.

## Ce que ce prompt ne fait pas

- Ni identifiants, ni liens markdown, ni documents hors prompts : c'est le doc-lint (31).
- Aucun prompt de done/ n'est corrigé : ce sont des traces. Pas de skill de rédaction (71 exécute).

## Cas d'acceptation (tests d'abord)

1. `npx vitest run scripts/prompts.test.mjs` : vert, les nouveaux cas écrits avant le code.
2. `npm run prompts -- lint WWS/docs/prompts/code/done/rester-en-mer.md` : code 1, suggère `convex/movement/cargoReturn.ts`.
3. `npm run prompts -- lint WWS/docs/prompts/code/done/commandes-de-la-souris.md` affiche l'alerte.
4. `npm run prompts -- lint WWS/docs/prompts/code/_modele.md` : code 0, aucune alerte.
5. `npm run prompts -- lint WWS/docs/prompts/code/ready/outillage/` : code 0 après les corrections.
6. `git diff --name-only -- WWS/docs/prompts/code/done/` est vide.

## Vérifications

Les cas 1 à 6 ; `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : la sortie du lint sur la série avant correction, chaque
correction (ancien → nouveau, avec sa preuve : `git ls-files`, commit du renommage) ; le nombre de
chemins morts à HEAD sur tout done/ et sur `plus-tard/`, pour mémoire (plus haut que les 28 de
l'audit, qui ne comptait que les chemins jamais existants) ; les faux positifs et la règle qui les écarte.
