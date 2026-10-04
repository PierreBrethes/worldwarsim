---
type: rapport
statut: livré
maj: 2026-10-04
code: []
decisions: []
voir: [../prompts/code/ready/outillage/README.md, ../prompts/coffre/organiser-le-coffre.md, ../prompts/code/README.md]
---

# État de la série outillage au 04/10/2026

**En bref.** Sur les 74 prompts du 23/09, **2 sont faits, 2 caducs, 11 partiels** ; 22 se donneraient tels quels, 37 sont à réécrire. Aucun n'a changé de dossier. Lecture contre `HEAD` (131f6ba), sans rien modifier hors ce rapport. Les repères `~NN` ont presque tous glissé ; « à donner tel quel » veut dire que ce qui est lu n'a pas bougé, repères de ligne à rafraîchir inclus quand c'est noté. Les contrôles ont été faits par lecture et grep ; aucun script n'a été lancé (« à vérifier » signale ce qui n'a pas été exécuté).

## 1. Les 74 prompts

| NN | slug | verdict | preuve ou manque |
|---|---|---|---|
| 01 | depeche-objectif-revele | à réécrire | Bug toujours là : `named()` (`convex/view.ts`) sans cas `objectiveRevealed`/`objectiveTaken`, cast `as ReadonlyArray<Notice>` encore à `serverView.ts:172` ; repères périmés (`notices` ~946, `named` ~1081). |
| 02 | journal-kind-inconnu | à réécrire | `written()` (`src/domain/journal.ts:139`) sans `default` ni `satisfies never` ; `ci.yml` a changé avec 87ed107. |
| 03 | clic-droit-du-mappage | à réécrire | « clic droit » toujours en dur dans `fr.ts` (≈1402, 1872, 1997, 2239), pas de `fr-hygiene.test.ts` ; tous les repères ont glissé. |
| 04 | generateurs-de-grille | caduc | But atteint autrement par 480ef73 (`routing.ts` importe `./geo.ts` avec extension, `scripts/generators-import.test.mjs`). Exécution de `generate-world.mjs` non lancée : à vérifier. |
| 05 | tests-en-utc | fait | 4d9f735 : `process.env.TZ = 'UTC'` dans `vite.config.ts` + garde-fou dans `convex/invariants.test.ts`. |
| 06 | conteneurs-relances | partiel | 2561c07 pose `restart: unless-stopped`, mais dans `docker-compose.yml` de base (dev aussi). Manque : les contrôles du README (`systemctl is-enabled docker`, `docker inspect`). |
| 07 | sauvegarde-du-volume | à réécrire | `deploiement/sauvegarder.sh` absent ; repère README déplacé (~243 → ~288) ; digest `alpine/sqlite` à revérifier. |
| 08 | sante-du-serveur | à donner tel quel | `convex/ops.ts` absent, aucun index `byStatus` ; décompte des `runAt` à re-mesurer (à vérifier). |
| 09 | surveillance-planifiee | à réécrire | `surveillance.yml` absent ; cite les actions par tag alors que 87ed107 les épingle par SHA ; suppose 08. |
| 10 | node-epingle | caduc | 35f5f8b : `.nvmrc`=24, `engines >=24`, Docker, CI, `scripts/node-version.test.mjs`. Plus simple que ce que le prompt prévoyait (pas d'`ARG NODE_VERSION`). |
| 11 | pre-push-actif | partiel | Fait : `.githooks/pre-push` en 100755 + contrôle `.nvmrc` (35f5f8b). Manque : `installer-hooks.mjs`, script `prepare`, `hooks.test.mjs` ; `core.hooksPath` non posé ; plancher 22.22.2 caduc. |
| 12 | types-de-convex | fait | 18675a9 : `types` = routes + `tsc --noEmit` + `tsc -p convex --noEmit`. Phrase demandée dans CONVENTIONS §9 non trouvée. |
| 13 | verifieur-sans-doublon | à réécrire | Doublon `types` dans `build` toujours là ; `-p convex` au lieu de `-p convex/tsconfig.json` ; repères `ci.yml` bougés (87ed107). |
| 14 | avertissement-des-routes | à réécrire | But tient (pas de `tsr.config.json`) mais 9fec412 a déjà épinglé `@tanstack/router-generator` à 1.167.40 : le `npm install -D …@1.167.27` du prompt rétrograderait ; `autoCodeSplitting` (ff8202b) à conserver. |
| 15 | images-convex-epinglees | à réécrire | `:latest` toujours en place ; `restart` ajouté (2561c07), `convex` 1.46, étape de déploiement changée (87ed107) ; attend P1. |
| 16 | garde-fous-claude-code | à donner tel quel | `.claude/` = `launch.json` + `settings.local.json` seulement ; repères CLAUDE.md décalés (~632). |
| 17 | hook-prettier | à donner tel quel | Rien de fait ; dépend de 16. |
| 18 | hook-demarrage | à donner tel quel | Rien de fait ; 10 fait (35f5f8b), 16 et 11 non. |
| 19 | sur-head | à donner tel quel | Pas de `scripts/sur-head.*` ; mesures (79 fichiers, 1 319 tests) à rafraîchir. |
| 20 | deux-postes | à donner tel quel | `usePolling: true` sans condition (`vite.config.ts:31`) ; README « Windows, Docker Desktop » inchangé. |
| 21 | instructions-en-tete | à réécrire | `## Instructions` toujours en queue de CLAUDE.md ; titre devenu « La Manchette » (db27460) ; suppose 16 et 19. |
| 22 | docs-wws-a-jour | partiel | 11fb5fc : en-tête `statut: périmé` + bandeau « En retard » sur `WWS/CLAUDE.md` et `WWS/README.md`. Manque : la réécriture (sections périmées en place, `architecture.md` périmé). Recoupe le coffre. |
| 23 | docs-design-a-jour | à donner tel quel | Index ADR 0014 « séquentiel », `CONTEXT.md` Interception, `RESTE-A-CODER` « 22 / 29 », etc. inchangés ; repères décalés d'~8 lignes par les en-têtes ; à rebaser sur le coffre. |
| 24 | etat-du-code-deplace | à réécrire | `ETAT-DU-CODE.md` absent ; contredit « une seule source d'état » du coffre (voir §3). |
| 25 | claude-md-invariants | à réécrire | Suppose 24 ; CLAUDE.md = 50 933 car. ; push/mobile et La Manchette absents de la table des systèmes ; `INDEX.md` à ajouter. |
| 26 | etat-du-code-corrige | à donner tel quel | Les phrases à corriger sont là (14 occurrences au lieu de 16) ; bloqué par 24/25. |
| 27 | cycle-des-prompts | partiel | e47cc23 a rangé à la main trois prompts dans `done/`. Manque : `scripts/prompts.mjs`, `plus-tard/`, README `prompts/code` (cite encore `_to_delete/`), renvois `ready/` morts dans `RESTE-A-CODER`. |
| 28 | modele-de-prompt | à réécrire | `_modele.md` et lint absents ; le YAML avant le H1 doit être sauté ; bandeau « à reprendre » posé. |
| 29 | archives | partiel | Non commité : `WWS/docs/_to_delete/` supprimé dans l'arbre (22 fichiers ` D`). Manque : `Claude outputs/` (99 fichiers suivis, teaser 31 Mo de 0afc2ea), `HANDOFF.md`, renvois vivants à `_to_delete`. |
| 30 | reste-a-coder-en-file | à donner tel quel | `RESTE-A-CODER.md` 30 636 car., statuts faux toujours là ; dépend de `HANDOFF.md` (29). |
| 31 | doc-lint | à réécrire | Absent ; le statut est maintenant dans le YAML (27 notes sur 200), H1 après le bloc YAML. |
| 32 | doc-lint-nettoyage | à réécrire | Étape 2 (`**Statut :**` ligne 3) caduque ; lien ADR 0020:31 → `0023-geographie-serveur-raster.md` toujours cassé (fichier réel : `…-en-raster.md`). |
| 33 | doc-lint-bloquant | à réécrire | `ci.yml` : `node-version: '24'` littéral, pas `node-version-file` ; permissions et pins déjà faits par 87ed107 ; pas de bandeau « à reprendre ». |
| 34 | frontieres-eslint | à donner tel quel | Aucun bloc de frontière ; 13 violations d'alias `@/` et non 12 (`label-groups.ts`, d47ed93). |
| 35 | traducteur-de-bouton | à réécrire | Repères bougés (`Window.tsx` ~119 → 204, `MapLabels` ~305 → ~485) ; nouveau site hors prompt : `src/shell/BottomSheet.tsx:155` (mobile). |
| 36 | regles-react-compiler | à réécrire | `reactCompilerPreset({ target: '19' })` depuis 1ec8944 (le prompt cite `'18'`) ; compteurs à remesurer ; bug `FounderLine` (`NationWindow.tsx:240`) tient. |
| 37 | knip-configure | à donner tel quel | `knip.jsonc` absent ; compteurs 122/127 peut-être changés (push, mobile). |
| 38 | shell-sans-cycle | partiel | fa0716f a supprimé le cycle plateau/shell mais vers `src/routes/-plateau/board-search.ts` ; manque `AbacusMark` hors `GunneryButton.tsx` et `import-cycles.test.ts`. |
| 39 | regles-partagees | à donner tel quel | `lootCollections.ts:77` `NO_CARGO_CAPACITY` en place ; `shared-rules.test.ts` absent ; repère `movements.ts` à revérifier après 4ec6b23. |
| 40 | hygiene-de-fr | à réécrire | `fr.ts` a grossi (`gamesCount` 609 → 688…) ; textes de push, La Manchette, mobile à relister ; glossaire dans `WWS/CONTEXT.md:69`. |
| 41 | validateurs-miroirs | à donner tel quel | `validators.test.ts` sans `expectTypeOf` ; repères tenus. |
| 42 | constantes-importees | à donner tel quel | `endOf` « Mirrors » (`salon.tsx` 546), `projectionWorld.ts` absent ; repère `heldBySite` ~2315 → ~2537. |
| 43 | compat-deploiement | à donner tel quel | `compat-deploiement.mjs` et `WIPE-REQUIS` absents ; repères tenus. |
| 44 | compat-branchee | à donner tel quel | Dépend de 43 ; ni garde au pre-push ni étape en CI. |
| 45 | marqueurs-wipe | à réécrire | Aucun `@wipe` ; repères glissés de +8 à +20 lignes (`schema.ts`, `validators.ts` retouchés). |
| 46 | isolat-en-parallele | à donner tel quel | `mesure-isolat.mjs` inchangé, boucle séquentielle intacte. |
| 47 | verifieur-orchestre | à donner tel quel | `verifier.mjs` absent ; la chaîne `&&` décrite est celle de HEAD. |
| 48 | verif-rapide | à donner tel quel | `verif-rapide.mjs` absent ; dépendances présentes. |
| 49 | registre-a-mesurer | à donner tel quel | Pas de script `a-mesurer` ; repères de `generate-a-mesurer.mjs` justes. |
| 50 | assets-verifies | à réécrire | `check-assets.mjs` absent ; suppose 47 et 49, non faits. |
| 51 | miroir-profond | à donner tel quel | `mirror.test.mjs` absent ; simulateur inchangé depuis 735dda2, `sweep.json` à jour (f7660ab). |
| 52 | simulateur-verifie | à réécrire | `run.mjs --check` absent ; « MANQUÉ » à l.354-356 ; suppose 47 et 48. |
| 53 | test-adaptateur-vue | à réécrire | `view-adapter.test.ts` absent ; `detection.test.ts` n'a plus `sentry`/`watchedMarch`, `launchedSeason` change de signature ; `view.ts`/`serverView.ts` retouchés par 131f6ba. |
| 54 | brouillard-sur-le-fil | à réécrire | `view-shape.test.ts` absent ; `view.ts` 1 267 lignes (~+16 sur les repères). |
| 55 | fenetres-montees | à réécrire | Rien de fait ; `plateau.tsx` 2 159 lignes (repères ~400 lignes décalés) ; suppose 53. |
| 56 | fixtures-communes | partiel | Prémisse 05 faite (4d9f735). Manque `scenario.fixture.ts` ; le `boot` de `messages.test.ts` a `transactionLimits: true`, ce que le prompt ignore. |
| 57 | prod-socle | à réécrire | Rien de fait (`prod.mjs`, `read-health.mjs`, `ops.ts`, `.claude/hooks/` absents) ; `deploiement/` restructuré (87ed107, db27460). |
| 58 | prod-operations | à réécrire | Suppose 57 ; repères `dev.ts`/`auth.ts` proches, README à revérifier. |
| 59 | prod-wipe | à réécrire | `wipePlan`/`reset({table})` absents ; `dev.ts` repères décalés ; suppose 58, 44, 56. |
| 60 | test-de-restauration | à réécrire | Suppose 07, 08, 15, 57, 69, tous absents ; compose en `:latest`. |
| 61 | ops-depuis-le-telephone | à réécrire | Seul `ci.yml` existe ; suppose 08/09 ; `relaunchPress` ~145 et non ~115. |
| 62 | deploiement-par-sha | partiel | 87ed107 : `git merge --ff-only ${{ github.sha }}`, le SHA vérifié est déployé. Manque : `deployer.sh`, `deployer.test.mjs`, tags `wws-front:<sha>`, `--no-deps --force-recreate`. |
| 63 | ci-durcie | partiel | 87ed107 : `permissions: contents: read`, actions épinglées par SHA, `timeout-minutes` (15 au lieu de 20 sur `deployer`), `concurrency`. Manque : ssh natif + `known_hosts`, `VPS_HOTE_CLE`, clé restreinte (P8), README. |
| 64 | version-servie | à réécrire | Ni `version.json` ni `BUILD_SHA` ; 87ed107 ajoute un smoke test `curl` plus faible que prévu. |
| 65 | retour-arriere | à réécrire | `workflow_dispatch` sans entrée `ref` ; ses repères (garde de 44, `deployer.sh`) n'existent pas. |
| 66 | contexte-docker | partiel | `.dockerignore` créé par a4a8bd0 (`node_modules`, `dist`, `.git`, `.env*`) ; manque `WWS` (83 Mio), `.claude`, `Claude outputs`, `**/*.md`, URL Convex exigée. Le prompt dit « aucun `.dockerignore` » : faux. |
| 67 | runbook | à réécrire | Dépend de 57-66, aucun posé ; README renommé (db27460), compose retouché (2561c07). |
| 68 | conventions-et-garde-fous | à réécrire | CONVENTIONS §5 et §10 inchangés ; les outils cités (34-45) n'existent pas. |
| 69 | partie-locale | à donner tel quel | Pas de `partie:locale` ; repères de `seasons.ts` décalés (`launch` 418 → 479). |
| 70 | partie-locale-pilotee | à réécrire | Pas de `window.wws` ; `window.mapEngine` ~229 au lieu de ~177 ; dépend de 69 et P2. |
| 71 | skill-wws-prompt | à réécrire | Suppose des commandes toutes absentes (`prompts`, `verif:rapide`, `sur-head`, `a-mesurer`, `doc-lint`). |
| 72 | skill-fin-de-session | partiel | 11fb5fc : le SKILL tient la passe « Le coffre suit » (YAML, INDEX, `decisions.md`). Manque : lien `.claude/skills/`, description conditionnée, passes outillées. |
| 73 | vue-en-sections | à réécrire | `viewSections.ts` absent ; filets 53/54/56 absents ; `view.ts` 1 267 lignes. Optionnel. |
| 74 | tests-de-mouvement-decoupes | à réécrire | Rien de fait ; `movements.test.ts` 3 867 lignes (3 730 cités), `economy.test.ts` 2 547 (2 482). Optionnel. |

## 2. Décompte

| Verdict | Nombre | Prompts |
|---|---|---|
| fait | 2 | 05, 12 |
| caduc | 2 | 04, 10 |
| partiel | 11 | 06, 11, 22, 27, 29, 38, 56, 62, 63, 66, 72 |
| à donner tel quel | 22 | 08, 16-20, 23, 26, 30, 34, 37, 39, 41-44, 46-49, 51, 69 |
| à réécrire | 37 | tous les autres |
| **Total** | **74** | |

Écarts avec les repères attendus : 04 est **caduc** et non livré tel quel ; 06 n'est que **partiel** ; 62 et 63 ne sont que **partiels** (87ed107 couvre le noyau, ni `deployer.sh` ni ssh natif).

## 3. Le chantier du coffre

| Élément | État | Recoupe |
|---|---|---|
| `WWS/INDEX.md` | **manquant** | — |
| `WWS/docs/decisions.md` | posé (11fb5fc, 245 lignes) ; sa dernière ligne note que l'INDEX n'existe pas | — |
| `WWS/docs/marque/actifs.md` | posé (11fb5fc, 163 lignes) | — |
| SKILL de fin de session | passe « Le coffre suit » posée (11fb5fc) | 72 (partiel) |
| En-têtes YAML | **27 notes sur 200** (hors `done/` et `_to_delete/`) : `marque/` (3), `WWS/CLAUDE.md`, `WWS/README.md`, `decisions.md`, `prompts/{design,images,vps,coffre}`, `rapports/2026-10-03`, SKILL, `prompts/code/README.md`, 1 prompt `ready/`. **Aucun** pour `adr/` (25), `design/` (13 fiches + 13 contrats + 23 propositions + 2 recherches), `technique/` (7), les 75 prompts outillage, 7 rapports, etc. | 22, 23, 31 |
| `a-mesurer.md` | sans en-tête (correct : généré, comparé octet à octet) | — |
| `.obsidian/app.json` | liens markdown relatifs, `done/` et `_to_delete/` exclus ; le dossier est ignoré par git | — |
| Wikilinks `[[` | corrigés (plus aucun dans `propositions/`) | — |
| Liens `ready/` → `done/` des propositions | corrigés (`ordre-de-mobilisation…`, `pillage-et-butin`) | — |
| Lien ADR 0020:31 → `0023-geographie-serveur-raster.md` | **toujours cassé** | 32 |
| `RESTE-A-CODER.md:45-46` → `ready/stockage-unique`, `ready/pillage-et-butin` | **toujours cassés** (fichiers dans `done/`) | 27, 30 |
| Notes qui renvoient à `WWS/INDEX.md` (absent) | `WWS/README.md`, `WWS/CLAUDE.md`, `docs/decisions.md`, SKILL, `prompts/coffre/organiser-le-coffre.md`, outillage 28, 29, 31, 32, 72, et le prompt `etat-de-la-serie-outillage.md` | — |

Recoupement avec la série, prompt par prompt :
- **22** : le coffre a posé le statut `périmé` sans réécrire ; 22 réécrit le fond, ce que la contrainte 4 du coffre interdit. À arbitrer.
- **23** : reste propre à lui (titre ADR 0014, `CONTEXT.md`, « pas-codé »), statuts YAML couverts par le coffre.
- **24, 25, 26** : **contradiction.** Le coffre veut une seule source d'état (CLAUDE.md racine pour le code, `INDEX.md` pour la doc) ; 24 sort le récit vers `ETAT-DU-CODE.md`, 25 impose 8 000 caractères (le fichier en fait 50 933).
- **27** : e47cc23 a fait trois déplacements à la main.
- **28, 29, 31, 32** : bandeaux « à reprendre » posés (11fb5fc) ; 31 et 32 doivent lire `statut:` du YAML, pas `**Statut :**` en ligne 3. 33 n'a pas son bandeau.
- **29** : suppression de `_to_delete/` faite dans l'arbre, non commitée.
- **30** : non touché par le coffre.
- **72** : partiel (voir tableau).

## 4. P1 à P9

| | Visible dans le dépôt ? |
|---|---|
| P1 | Ne se voit pas d'ici (état du VPS). |
| P2 | Ne se voit pas d'ici (profil zsh). |
| P3 | **Fait** : f7660ab. |
| P4 | Ne se voit pas ; aucun fichier ne porte les décisions (`FORMAT-REPONSE.md` absent de `Claude outputs/project-claude-ai/`). |
| P5 | Ne se voit pas d'ici ; `.claude/settings.local.json` existe, contenu non audité. |
| P6 | Ne se voit pas ; `deploiement/sauvegarder.sh` n'existe pas (07). |
| P7 | Ne se voit pas ; bloqué par 60. |
| P8 | Ne se voit pas ; 63 n'a pas posé `VPS_HOTE_CLE`. |
| P9 | Ne se voit pas ; 72 non terminé. |

## Cinq constats surprenants

1. **29 est à moitié appliqué sans commit** : `_to_delete/` est supprimé dans l'arbre (22 fichiers) pendant que `Claude outputs/` (teaser 31 Mo, poussé par 0afc2ea) est intact et que des documents vivants citent encore `_to_delete/`. Un `git commit -a` figerait cet état.
2. **Le coffre est à mi-temps 2** : `decisions.md`, `actifs.md` et le SKILL sont posés, mais `INDEX.md` manque alors que dix notes y renvoient, et 27 notes sur 200 ont leur en-tête.
3. **04, 06 et 10 ont été absorbés par des commits « chore » qui n'ont pas suivi la lettre** : 480ef73 (`.ts` explicites, plus de crochet), 2561c07 (`restart` dans le compose de base, donc en dev aussi), 35f5f8b (`engines >=24`, plancher 22.22.2 de 11 caduc).
4. **`.dockerignore` existe** (a4a8bd0, commit titré « typesafe environment variables ») alors que le prompt 66 affirme le contraire ; il ne laisse pas encore de côté `WWS` (83 Mio).
5. **La série 24-26 contredit le coffre** (deux sources d'état, 8 000 caractères contre 50 933) et 37 prompts doivent être recalés avant d'être donnés : le dépôt n'a presque aucun artefact de la série à partir de 47.
