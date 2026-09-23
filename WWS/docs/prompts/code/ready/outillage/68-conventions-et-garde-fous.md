# 68-conventions-et-garde-fous — CONVENTIONS.md ne dit plus que ce que le code fait, et chaque règle nomme ce qui la vérifie

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 34 à 45 (et 31 à 33, pour `npm run doc-lint`).
**Pierre d'abord :** la langue des commentaires (P4). (a) Français et anglais acceptés, un bloc
dans une seule langue ; l'ADR 0016 (~37-38 y met les commentaires) prend une révision datée.
(b) L'anglais pour tout commentaire écrit à partir du jour du prompt, l'existant traduit quand on
le réécrit ; l'ADR reste debout. Sans réponse : (b), réviser une ADR étant l'acte de Pierre.

**À lire :** `CONVENTIONS.md` (entier, tel que 32 et 40 l'ont laissé) ; ADR 0016 ~35-40, ADR 0012
~67 (forme d'une révision) ; `src/data/loadGame.ts`, `src/data/serverView.ts` ~21-30,
`src/routes/plateau.tsx` ~295 et ~345-350 ; pour les garde-fous : `eslint.config.js`, `knip.jsonc`,
`package.json`, `.githooks/pre-push`, `.github/workflows/ci.yml`.

## Pourquoi
`CONVENTIONS.md` « fait autorité » (~3), et trois règles y sont démenties par le code :
- §10 (~150) : « `loadGame()` est la seule porte ». Il n'est lu que par le `loader` de
  `plateau.tsx` ~295 et ne rend que le monde et la place (« The view itself is **not** loaded
  here ») ; `useQuery`/`useMutation` s'appellent dans 18 fichiers hors `src/data/` (plateau 12,
  salon 9, MovementPreview 8…). La couture réelle est `adaptServerView`.
- §5 (~84) met les commentaires en anglais : 873 blocs de 40 caractères et plus sont en français
  contre 1 237 (41 %, audit). CLAUDE.md n'exige l'anglais que des identifiants et fichiers.
- §4 : « deux commits distincts » vise qui commite ; l'agent ne commite pas (convention 6).
Seul §3 (~66) dit ce qui le vérifie : une règle tenue ne se distingue pas d'un vœu. Et un code
de session repart de zéro : « 1b du 13/09 » (QG posé) n'est pas « 1b du 16/09 » (tir simultané).

## Ce qui change
Doc seule. Dans `CONVENTIONS.md` :
1. §10, seconde moitié : la vue d'un joueur entre par une porte, `api.view.playerView` lu par
   `plateau.tsx` puis `adaptServerView` (`src/data/serverView.ts`, qui déclare aussi les types des
   réponses servies) ; aucun composant ne lit la forme servie. Les autres queries et les mutations
   `api.*` s'appellent du composant qui lit ou qui agit ; `loadGame` charge la route, rien de plus.
2. §5 selon la décision : (a) `**Statut :**` de l'ADR 0016 complété, `## Révision du JJ/MM — la
   langue des commentaires`, et sa ligne de `WWS/docs/adr/README.md` ; (b) la date en clair. Puis
   `git grep -n -i "anglais\|english" -- CLAUDE.md AGENTS.md WWS/CLAUDE.md` : chaque phrase suit.
3. §4 gagne : « L'IA ne commite pas : elle livre le rangement en lot séparé (fichiers et message à
   part dans son rapport), que Pierre commite avant le changement. » Idem la puce de CLAUDE.md.
4. §2 gagne : un commentaire cite une décision par l'ADR et son paragraphe (`ADR 0020 §7`) ou par
   sa date (« décision 1b du 13/09 »), jamais par un code de session nu (« décision 85a »).
5. §7 : `src/i18n/fr.ts` s'importe en relatif (le bundler de Convex ignore `@/`, décidé en 34).
   §9 : les règles du React Compiler sont actives, un `eslint-disable` porte son `-- pourquoi`.
6. **Décision : deux § nouveaux, pour des règles déjà écrites ailleurs et désormais outillées.**
   §12 « Écrit une fois » : rose et serveur lisent la même fonction de refus (ADR 0015, révision
   du 24/08) ; une constante de `convex/constants.ts` ne se recopie pas ; une union de
   `convex/validators.ts` égale celle de `src/domain/ids.ts`, legacy nommé ; un bouton ne devient
   un rôle que par `src/domain/mouse-mapping.ts` ; ce qui n'a plus de lecteur part.
   §13 « Le schéma ne casse pas la partie en cours » : champ ajouté `v.optional` et lecteur `??`,
   ou migration ; cible planifiée retirée gardée en bouchon, arguments compris ; ce qui ne sert
   qu'aux documents d'avant porte `@wipe <sujet>`. `## Schéma Convex` de CLAUDE.md y renvoie.
7. **Chaque § finit par `**Garde-fou :** …`** : l'outil par son fichier, sa règle ou sa commande
   (jamais un numéro de prompt), où il tourne s'il est hors de `npm run verifier`, « relecture
   seule » pour le reste. Table de départ ; chaque nom se vérifie, un outil absent va au rapport :

| § | Garde-fou |
|---|---|
| 1, 4 | relecture seule (§4 : au rapport de l'agent) |
| 2 | relecture ; codes nus : rubrique « décisions » de `npm run doc-lint` (rapport) |
| 3 | `convex/invariants.test.ts`, `convex/view-budget.test.ts`, `scripts/mesure-isolat.mjs`, `tsc -p convex/tsconfig.json` ; les noms : relecture |
| 5 | `src/i18n/fr-hygiene.test.ts` ; langue des commentaires : relecture |
| 6 | eslint `no-restricted-syntax` (ré-exports) ; `src/import-cycles.test.ts` |
| 7 | eslint `no-restricted-imports`, `no-restricted-globals` (bloc `src/domain/`) |
| 8 | tsc ; sur le fil `convex/view-shape.test.ts` s'il existe, sinon relecture |
| 9 | `npm run types` ; eslint `react-hooks`, `--max-warnings 0` |
| 10 | eslint (three hors du moteur, React dans le moteur) ; la porte du serveur : relecture |
| 11 | eslint (`throw new Error` sous `convex/`) ; `satisfies Record<ErrorCode, …>` dans `fr.ts` |
| 12 | `convex/shared-rules.test.ts`, `convex/invariants.test.ts`, `convex/validators.test.ts`, `src/domain/mouse-mapping.test.ts`, `npm run knip` ; `npm run fr:cles-mortes` (rapport) |
| 13 | `npm run compat` (pre-push, job `deployer`, `deploiement/WIPE-REQUIS`) ; `git grep -n '@wipe' -- src convex` |

## Ce que ce prompt ne fait pas
Ni code, ni commentaire du code, ni règle eslint, ni test ; le fond des autres § ne change pas.

## Cas d'acceptation (tests d'abord)
1. `grep -c '^## ' CONVENTIONS.md` et `grep -c 'Garde-fou :' CONVENTIONS.md` rendent 13 ; chaque
   `Garde-fou :` est la dernière ligne non vide de son §.
2. Un script jetable du scratchpad lit ces lignes : chaque chemin entre backticks est dans
   `git ls-files`, chaque `npm run <x>` est une clé de `scripts` de `package.json`.
3. `git grep -n "loadGame\|adaptServerView" -- CONVENTIONS.md` : §10 nomme la porte réelle.
4. `git diff --stat -- src convex scripts` vide ; `git diff --stat` ne nomme que `CONVENTIONS.md`,
   les phrases alignées et, en (a), l'ADR 0016 et l'index.
5. `npm run doc-lint -- --strict` finit par `doc-lint : propre` ; rubrique « décisions » à 0.

## Vérifications
Doc pure : cas 1 à 5, `wc -l CONVENTIONS.md` avant/après, `wc -m < CLAUDE.md` ≤ 8 000 (`*.md` est
dans `.prettierignore`).

## Rapport attendu
Format commun (README de la série), plus : la décision de langue et d'où elle vient (Pierre ou le
défaut) ; la table § → garde-fou écrite et ses écarts à la table de départ ; **À trancher** : 1a/1b
une règle eslint qui réserve `api.view.playerView` à `plateau.tsx` et `serverView.ts` ; chaque
partie restée « relecture seule », avec l'outil qui la tiendrait ou « aucun ».
