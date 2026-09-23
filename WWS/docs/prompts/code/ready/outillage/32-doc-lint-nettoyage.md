# 32-doc-lint-nettoyage — la doc vivante n'a plus une référence morte, et chaque proposition dit son statut

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 31.

**À lire :** la sortie de `npm run doc-lint`, d'abord, et celle de `npm run prompts -- status` (27)
· `scripts/doc-lint.mjs` (`HISTORIQUES`, `ABSENTS_VOULUS`, exemptions de (b)) · `CONVENTIONS.md`
~14-22 (table « Portée / Où / Exemple ») et ~46-49 · `src/shell/NationBanner.tsx` (`SiteStrip`
~146) · l'ADR 0016 ~72-76 (les ADR antérieures gardent les noms français) · les dix premières
lignes des 23 fichiers de `WWS/docs/design/propositions/`.

## Pourquoi
33 rendra (a), (b), (c), (e), (f) bloquants en CI : il faut d'abord un arbre à zéro. Le prototype du
23/09 (avant 22 à 30) donnait 6 liens cassés, 39 chemins morts (exemptions de 31 appliquées), 14
identifiants absents, 0 § d'ADR. Le rapport comptait 23 propositions sur 23 sans statut fermé, dont
10 sans aucune ligne Statut (`classement-bareme`, `direction-v1-2026-09-09`, `frappe-de-batiment`,
`lot-petits-surs`, `objectifs-mobiles`, `objectifs-neutres`, `page-de-presse-et-scores`,
`pillage-et-butin`, `recherche-par-deblocage`, `vision-v1-expeditions`), et des livrées qui se disent
ouvertes : `clic-batiment-et-surfaces.md` ~3 « proposition, non gravée » alors que
`src/routes/-plateau/SiteModal.tsx` existe, `ordre-de-mobilisation-…` ~3 alors que
`FoundationRows.tsx` existe. Enfin 58 lignes de commentaire (32 fichiers de `src/` et `convex/`)
citent une décision sans date ni ADR : `convex/schema.ts` ~124 « décision 85a »,
`convex/players.ts` ~116 « décision 47a ».

## Ce qui change
Doc et commentaires seulement : aucune ligne exécutable. Dans cet ordre :
1. **Constats structurels, jusqu'à zéro.** Déjà faits, à ne pas refaire : les générateurs de
   `CLAUDE.md` et d'`ETAT-DU-CODE.md` (25, 26), les renvois du « Pourquoi » de 27 vers `ready/`
   (27), RESTE-A-CODER (30) ; `contours-de-region-paresseux.md` et `noms-de-modules-convex.md` sont
   dans `done/` depuis 27 : exclus, intouchables. Ce qui ressort de cette liste est un écart au rapport.
   - (a) : ADR 0020 ~31, lire `0023-geographie-serveur-en-raster.md`.
   - (e) : un renvoi vers un prompt passé dans `done/` vise `done/` (une trace se cite) ; il se
     répare par `npm run prompts -- done <slug>`, pas à la main : la cible est déjà dans `done/`,
     rien ne bouge, seuls les renvois sont réécrits. Un doublon entre deux dossiers : au rapport.
   - (b) ADR 0017 ~249 : le chemin du prompt `ecretage-et-palier.md` omet `done/`.
   - (b) ADR et fiches : un chemin cité comme l'état d'alors entre dans `HISTORIQUES` avec sa
     raison (noms français des ADR 0011, 0012, 0015 : `constantes.ts`, `unites.ts`,
     `etat-reference.json`… ; table de renommage de 0016 ~29 et ~74). Un chemin cité comme lieu
     actuel d'une règle se corrige vers le fichier d'aujourd'hui (`git log --follow --name-status`) :
     `04-information.md` ~174 (`Milieu` de `trajets.ts` est devenu `Medium`, `src/domain/ids.ts`
     ~163 ; `src/domaine/` → `src/domain/`), `10-direction-artistique.md` ~61 (`src/emblems/ussr.svg`).
   - (b) prompts de `ready/` (28 a corrigé ceux que son lint voit) : le prompt qui crée un fichier,
     même temporaire, le marque « (à créer) » une fois (31 l'exempte alors dans tout `ready/`) ; un
     chemin d'exemple devient un gabarit `<…>` ; un chemin partiel hors du dépôt (sous
     `node_modules/`) s'écrit depuis la racine.
   - (c) CONVENTIONS ~18 : `Counter`, `Slots` → `SiteStrip` (dans `NationBanner.tsx`, seul
     appelant) ; ~19 `SelectedCountryPanel.tsx` (supprimé en 2b74301) →
     `routes/-plateau/SiteModal.tsx` (seul appelant : la route plateau) ; ~48 `loadPlayerView()` →
     `adaptServerView()` (`src/data/serverView.ts`). Un autre constat (c) de CONVENTIONS se corrige
     de même, par un exemple réel ; réécrire ses règles (§4, §5, §10) relève de 68.
   On corrige la doc ; on n'élargit pas une liste pour taire un chemin qu'un lecteur croirait actuel.
2. **Les 23 propositions** portent en ligne 3, sous le H1, `**Statut :** <état> — <précision>` (un
   bandeau qui l'occupe descend dessous). L'état est l'un de `ouverte`, `gravée par ADR NNNN`,
   `livrée`, `abandonnée` — livrée l'emporte sur gravée ; une proposition en partie livrée dit
   `ouverte` et nomme en précision ce qui l'est. L'ancienne phrase de statut se fond dans la
   précision ou le paragraphe suivant sans rien perdre (date de session, destinataire). Chaque
   état se prouve (`git grep`, ETAT-DU-CODE, ADR) et la précision cite la preuve. Pistes à confirmer : livrée — `clic-batiment-et-surfaces`, `ordre-de-mobilisation-…`,
   `flux-mouvement-en-carte`, `pillage-et-butin` (10/09), `classement-bareme` et
   `page-de-presse-et-scores` (`convex/press.ts`) ; gravée ou livrée — `economie-v2` (ADR 0015),
   `mouvement-libre-et-troupes-posees` (ADR 0019) ; en partie livrée — `objectifs-neutres` (lot 1,
   17/09) ; ouverte — `frappe-de-batiment`, `objectifs-mobiles`, `notifications-push-et-alarmes`,
   `espionnage-et-formats`, `recherche-par-deblocage`.
3. **Ancres de décision** (rubrique **décisions**) : chaque ligne signalée reçoit sa date, dans la
   langue et la forme du commentaire (« décision 85a du 10/09 », « (decision 64b, 01/09) »), ou
   l'ADR § qui la grave. La date vient, dans l'ordre : d'une occurrence datée du même code
   (`src/domain/movement-orders.ts` ~111 « decision 64b, 01/09 » ; « 72a, 04/09 ») ; d'une ancre
   vivante de WWS/ ; du commit qui l'a introduite (`git log -S'<code>' --reverse -- <fichier>`),
   recoupé avec son prompt de `done/`. Les codes courts (1a à 6a) repartent à chaque session :
   chaque occurrence se date à part, jamais par remplacement global. Connues : 85a → 10/09
   (`done/comptes-c3-places-et-connexion.md` ~15, « décidé (85a, 10/09) » ; le wipe est du 11/09),
   47a → 31/08 (`done/capitulation-et-observateur.md` ~9 et ~38). Un script est permis (convention
   3) s'il part d'une table `fichier:ligne → texte` et s'arrête si une cible manque.

## Ce que ce prompt ne fait pas
`--strict` et la CI (33) ; les règles de CONVENTIONS et leurs garde-fous (68) ; l'index des ADR,
les fiches et les statuts suspects (23) : s'ils restent au rapport, « À trancher ». Ni `done/` ni
`rapports/`. `doc-lint.mjs` ne change que par ses deux listes : un faux positif de règle se signale
en « À trancher », il ne se contourne pas.

## Cas d'acceptation (tests d'abord)
Doc et commentaires : chaque cas est une commande, lancée d'abord **avant** toute édition.
1. `npm run doc-lint` : zéro constat structurel. Un faux positif de règle qui resterait est un
   « À trancher » bloquant : 33 ne se donne pas tant qu'il existe.
2. Rapport : propositions à 0 ; décisions à 0, ou chaque reste en « À trancher » avec sa raison.
3. `git diff -U0 -- src convex | grep -E '^[-+][^-+]' | grep -vE '^[-+]\s*(\*|//|/\*|\{/\*)'` : vide.
4. `git diff -- scripts/doc-lint.mjs` : seules `HISTORIQUES` et `ABSENTS_VOULUS` bougent.
5. `git status --short` : rien sous `done/` ni `rapports/`.

## Vérifications
`npm run doc-lint` au départ (les comptes) et à la fin ; `npm run verifier` vert (des commentaires
de code ont bougé).

## Rapport attendu
Format commun (README de la série), plus : les comptes avant/après par contrôle et par rubrique ; le
tableau des 23 propositions (ancien statut → nouveau, preuve) ; les entrées ajoutées aux deux
listes et leur raison ; la table des codes datés (code → date → source) et ceux restés sans date.
