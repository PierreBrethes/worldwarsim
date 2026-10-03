# 31-doc-lint — `npm run doc-lint` rapporte les références mortes de la doc vivante, sans échouer

> ⚠️ **À reprendre avant de le donner (02/10/2026).** Le chantier [organiser-le-coffre](../../../coffre/organiser-le-coffre.md) a posé un en-tête YAML (`type`, `statut`, `maj`…) sur les notes de `WWS/` et ouvert [INDEX.md](../../../../../INDEX.md) et [decisions.md](../../../../decisions.md). Le statut d'une note vit dans son en-tête (`statut:`), pas en ligne 3 sous le H1 : le contrôle lit le YAML, et cherche le H1 après le bloc.

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 22 à 30.

**À lire :** `scripts/generate-a-mesurer.mjs` (exports, `ROOT` ~29, garde du `main` ~153) et
`scripts/a-mesurer.test.mjs` · `vite.config.ts` ~33 (le projet `front` prend `scripts/*.test.mjs`)
· `WWS/docs/adr/README.md` (tableau) et les titres `### N.` de l'ADR 0020 ·
`WWS/docs/RESTE-A-CODER.md` (items `- **N.**` laissés par 30) ·
`WWS/docs/design/contrats-de-vue/00-regles.md` ~13 · `.gitignore`.

## Pourquoi
Seul `a-mesurer.md` est vérifié. Un prototype du 23/09 (avant 22 à 30, qui en corrigent une part)
trouvait 6 liens relatifs cassés sur 173 (ADR 0020 ~31 vise `0023-geographie-serveur-raster.md`),
98 chemins morts entre backticks sur 989 (`scripts/generer-*.mjs`, renommés en f6e10fc, recopiés
par `WWS/docs/prompts/code/done/contours-de-region-paresseux.md` ~6), 14 identifiants absents
(`Counter`, `Slots`), 0 « ADR NNNN §M » cassé sur 496 ; au jugement, 11 lignes d'index d'ADR sans
la dernière révision, aucune des 23 propositions au statut fermé, 58 commentaires « décision NNx »
sans date ni ADR, alors que les codes repartent à chaque session.

## Ce qui change
1. `scripts/doc-lint.mjs` (à créer), node pur (seuls des `node:*` importés : 33 le lance sans
   `npm ci`) : des fonctions pures exportées sur `{ files, read, ignored }` rendent des constats
   `{ check, file, line, target }`. Seule la CLI lit le disque : `files` vient de
   `git ls-files --cached --others --exclude-standard`, filtré par existence ; `ignored` de
   `git check-ignore --no-index --stdin`, lancé une fois (il sort en 1 quand rien n'est ignoré :
   ce n'est pas une erreur). `package.json` : `"doc-lint": "node scripts/doc-lint.mjs"`, sortie
   **toujours 0** dans ce prompt.
2. Documents : tous les `CLAUDE.md`, `CONVENTIONS.md`, `AGENTS.md`, `WWS/*.md`,
   `WWS/docs/{adr,design,technique,skills}/**`, `WWS/docs/{ETAT-DU-CODE,HANDOFF,RESTE-A-CODER}.md`,
   `WWS/docs/prompts/code/README.md` et `ready/**`, `deploiement/README.md`,
   `WWS/simulation/**/README.md` ; exclus `done/`, `plus-tard/`, `rapports/`, `_to_delete/`,
   `Claude outputs/`. Code : `src/`, `convex/` hors `_generated/`, `scripts/` (ts, tsx, mjs, js,
   css), lignes de commentaire seules (`//`, `/*`, `*`, `{/*` en tête), sans `scripts/doc-lint*`.
3. Contrôles structurels hors blocs de code, (b) et (f) aussi dans le code (le (d) de l'audit,
   l'index égal aux titres, est abandonné) :
   - **(a)** lien `[…](cible)` relatif (ni `http(s):`, `mailto:`, `#…`), hors code en ligne : sans
     ancre et décodé, il résout depuis le dossier du document.
   - **(b)** backticks sans espace, avec `/` et une extension connue (ts, tsx, mjs, cjs, js, md,
     json, yml, yaml, sh, css, html, svg, png) ; accolades développées, `:N`/`:N-M` retiré ; glob,
     `<gabarit>`, `$variable`, `…`, absolu (`/…`, `~/…`), URL ignorés, et tout chemin que
     `.gitignore` couvre (`ignored`) : un fichier local par nature (`.claude/settings.local.json`,
     `src/routeTree.gen.ts`, `node_modules/…`), jugé pareil en local et en CI. Résout : fichier
     du dépôt, relatif au document, ou suffixe `/chemin` d'un fichier. Exempté s'il est suivi de
     « (à créer », précédé à moins de 40 caractères de « crée », « créer », « nouveau » ou
     « nouvelle », marqué « (à créer » ailleurs dans le document ou dans un document de `ready/`
     (le prompt qui le crée), ou dans `HISTORIQUES` (export, une raison par entrée), ouverte par
     `verif-chiffrage.mjs` sous `WWS/simulation/` (supprimé en ff62b61), leçon que
     `src/domain/combat.test.ts` ~81 cite à dessein par son chemin complet.
   - **(c)** identifiants entre backticks de chaque `CLAUDE.md`, de `CONVENTIONS.md` et de
     `WWS/docs/ETAT-DU-CODE.md` (le récit sorti par 24) : contenu entier `a` ou `a.b…` (`f(…)` lu
     `f`), en SCREAMING_CASE, camelCase, PascalCase (sans lui `Counter` passe) ou pointé (`sim.mjs`
     non lu). Chaque segment est un mot de `src/`, `convex/`, `scripts/` ou des configurations
     racine (`tsconfig.json`, `package.json`, `vite.config.ts`, `eslint.config.js` : CONVENTIONS ~138
     cite des options de tsc). `ABSENTS_VOULUS` : `GameState`, `getEdge`, `obtenirDistance`,
     `OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL`.
   - **(e)** lien ou chemin vers `prompts/code/ready/X` quand `X` (sous-dossier compris) est dans
     `done/` : un constat (e), ni (a) ni (b) ; un même `X` dans deux dossiers parmi `ready/`,
     `plus-tard/`, `done/` : (e).
   - **(f)** « ADR NNNN §M » : chaque nombre du groupe (« §3 et §6 », « §3/§6 », « §1-2-4 ») a son
     ADR et son titre `### M.`.
4. Rapport, jamais bloquant, six rubriques titrées au mot près (68 et 72 les citent ainsi) :
   **registres** : « Registre N » (ou « N-M »), document ou commentaire, sans item `- **N.**` ni
   `- ~~**N.**` dans RESTE-A-CODER.md · **index des ADR** : ligne sans la date de la révision la plus
   récente du fichier, cherchée par `/[Rr]évis\p{L}* (du |le |\()?(\d{2})\/(\d{2})(\/\d{4})?/gu`
   (`\w` rate « Révisée » ; une date sans année prend celle de la date complète qui la précède) ·
   **statuts suspects** : ligne `**Statut` d'une fiche (`design/NN-*.md`) ou d'un contrat de vue
   avec « pas-cod », « à coder », « non cod », et ligne « ⚠ pas-codé » d'un contrat hors
   `00-regles.md` · **propositions** : aucune ligne des dix premières ne commence par
   `**Statut :** ouverte`, `livrée`, `abandonnée` ou `gravée par ADR NNNN` (ADR existante), suivi ou
   non d'une précision (forme de 32) · **décisions** : commentaire de `src/` ou `convex/` citant
   « décision(s) NNx » ou « decision(s) NNx » sans date `JJ/MM` ni « ADR NNNN » sur sa ligne ou la
   suivante · **taille de CLAUDE.md** : caractères (points de code) contre 8 000.
5. Sortie : une ligne triée par constat (`chemin:ligne  (x)  cible`), le total par contrôle
   (constats / références lues), chaque rubrique et son compte. CLAUDE.md, bloc des commandes :
   `npm run doc-lint   # références de la doc (rapport)`.

## Ce que ce prompt ne fait pas
Corriger (32), `--strict` et le job CI (33), le rituel (72), la forme d'un prompt (28). Aucun test
sur les vrais documents : les tests tournent dans `verifier`, sur le chemin du déploiement.

## Cas d'acceptation (tests d'abord)
`scripts/doc-lint.test.mjs` (à créer), fixtures en mémoire (`{ chemin: texte }`), sans le dépôt :
1. (a) absent : constat, ligne juste ; présent avec `#ancre` et `%20`, `https:`, bloc de code, lien
   écrit entre backticks : rien.
2. (b) absent : constat ; résolu par la racine, le document ou le suffixe : rien ; `{a,b}.ts` sans
   `b` : un constat ; `x.ts:12` lu `x.ts` ; glob, `<nom>.md`, `$T/x.json`, `/convex/x.sh`, chemin
   couvert par `ignored` : rien ; chaque exemption éteint le constat, le même chemin sans elle le
   rend ; en code, chemin mort dans un commentaire `//` ou ` * ` : constat, dans une chaîne : rien.
3. (c) `Counter` hors corpus, `a.b` dont un segment manque : constats ; `buildBoard()` (dans le
   corpus de la fixture), `GameState` : rien ; `sim.mjs`, `decoy`, `{ token }` : non lus.
4. (e) renvoi vers `ready/…` dont la cible est dans `done/` : un seul constat, (e) ; idem sous
   `outillage/` ; un doublon entre `ready/` et `done/`.
5. (f) `ADR 0020 §3 et §6` avec le seul `### 3.` : un constat (§6) ; `§1-2-4` : trois nombres ;
   ADR inexistante : constat.
6. Rapport, un cas par rubrique : « Révisée le 09/09 » reconnue, « Registre 29-30 » lu deux fois
   contre `- **29.**` seul, « décision 85a » signalée et « décision 72a, 04/09 » non,
   `**Statut :** livrée — <précision>` accepté et `gravée par ADR 0099` signalée.

## Vérifications
`npx vitest run scripts/doc-lint.test.mjs` vert ; `time npm run doc-lint` sort 0 en moins de 2 s ;
`npm run verifier` vert.

## Rapport attendu
Format commun (README de la série), plus : les totaux sur l'arbre réel par contrôle et par
rubrique, et la durée ; chaque faux positif et la règle générale qui l'écarte (pas d'autre liste
d'exceptions que `HISTORIQUES` et `ABSENTS_VOULUS`) ; le nombre de chemins écartés par `ignored` ;
ce que trouvent en propre les extensions décidées ici au-delà de l'audit (PascalCase, ETAT-DU-CODE
en (c), `skills/` et README des prompts).
