# Série outillage — 74 prompts, un agent chacun

Issue de l'audit du 23/09/2026 (six dimensions : outillage IA, documentation, qualité du code,
tests, déploiement, environnement Claude Code ; 100 constats prouvés puis revérifiés). Chaque
prompt tient en **un commit** et se donne **seul**, dans l'ordre des numéros ; la ligne
« Suppose » de chaque prompt dit ce qui doit être passé avant.

## Lancer

```
Lis WWS/docs/prompts/code/ready/outillage/NN-slug.md et applique-le.
```

Une session neuve (ou `/clear`) par prompt. **Entre deux prompts, Pierre relit le rapport et
commite** avec le message proposé : l'agent suivant part alors d'un arbre propre. Le prompt
accepté passe ensuite dans `done/outillage/` (à la main jusqu'au prompt 27, puis
`npm run prompts -- done outillage/NN-slug`).

## Conventions communes

Chaque prompt les suppose ; aucun ne les recopie.

1. **Ni commit, ni push, ni stash**, et le prompt ne se déplace pas vers `done/` : c'est l'acte
   de Pierre, à l'acceptation du rapport.
2. **Rien contre la prod** : jamais `npx convex deploy`, jamais une URL `pierrebrethes.cloud`,
   jamais la clé d'admin. Le backend local (`127.0.0.1:3210`) seulement quand le prompt le dit.
3. **Même en mode auto**, lire avec Read ce qu'on modifie et modifier avec Edit/Write — c'est ce
   qui donne à Pierre le retour arrière et le diff. Un script (python, sed) seulement pour un
   remplacement mécanique sur trois fichiers ou plus, et il échoue si la cible manque.
   Jamais de copie de sauvegarde dans `/tmp`.
4. **Node sur le Mac** : tant que la tâche P2 n'est pas faite, préfixer chaque commande
   node/npm/npx par
   `unfunction node npm npx nvm 2>/dev/null; export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH";`
   (inutile sous WSL). Sans ce préfixe, chaque appel imprime l'aide de nvm, et hors nvm c'est
   un node 19 qui répond, sous lequel vite et vitest plantent.
5. **Tests d'abord** quand le prompt touche du code. Pendant le travail, des tests ciblés
   (`npx vitest run <fichier>`, puis `npm run verif:rapide` une fois le prompt 48 passé) ; à la
   fin, `npm run verifier` vert. Un prompt de doc pure nomme sa propre vérification.
6. **Rangement et changement de comportement** mêlés : le dire dans le rapport ; Pierre fera
   deux commits.
7. Dans un prompt, un chemin qui n'existe pas encore s'écrit suivi de « (à créer) ».
8. **Rapport**, toujours dans cet ordre : **Fait** · **Écarts au prompt** (et pourquoi) ·
   **Vérifications** (commandes lancées et chiffres : nombre de tests, durées) · **Docs
   touchées** · **Message de commit proposé** (en français, le sujet nomme le prompt) ·
   **À trancher** (numéroté 1a/1b, avec une recommandation).

## À faire par Pierre, hors agents

| | Quand | Quoi |
|---|---|---|
| **P1** | tout de suite | Sur le VPS : `ls -la ~/sauvegardes` (une copie existe-t-elle ?), `systemctl is-enabled docker`, `docker ps -a`, et pour le prompt 15 le digest des images **qui tournent** (pas `:latest`) : `docker image inspect --format '{{json .RepoDigests}}' $(docker inspect --format '{{.Image}}' worldwarsim-backend-1)`, puis la même chose pour `worldwarsim-dashboard-1`. |
| **P2** | tout de suite (recommandé avant 11 ; requis avant 18 et 70) | Profil zsh du Mac. Dans `~/.zshrc` : supprimer les enveloppes `node()`, `npm()`, `npx()` et l'une des deux lignes `export PATH="/usr/local/bin:$PATH"` ; après celle qui reste, `export NVM_DIR="$HOME/.nvm"` puis `export PATH="$NVM_DIR/versions/node/v24.19.0/bin:$PATH"` (à changer avec `.nvmrc`) ; garder `nvm()` paresseux avec `--no-use`. Les deux mêmes lignes dans `~/.zshenv`. Inventaire `npm ls -g --prefix /usr/local --depth=0`, puis retirer le node 19 de 2022 et le faux paquet `nvm@0.0.4` de `/usr/local`, réinstaller sous nvm ce qui sert encore. Relancer `claude` depuis un terminal neuf : `npm --version \| wc -l` doit rendre 1. |
| **P3** | fait le 23/09 | `sweep.json` régénéré depuis le moteur de 735dda2 (commit f7660ab). |
| **P4** | au lancement du prompt concerné | Décisions : « convoi immobilisé » et désignations d'équipement (40) ; `verify.mjs` gardé ou non (51, gardé par défaut) ; « MANQUÉ » assertion ou retrait (52) ; langue des commentaires (68) ; coller le `FORMAT-REPONSE.md` du Project Cowork (29). |
| **P5** | après 16 | Purger `.claude/settings.local.json` : `git add/commit/mv *`, `cp *`, `cd *`, `python3 *`, `node *` (ils rendent tout refus contournable), les `perl -pi` et `cp … /tmp` ponctuels, les chemins absolus vers `~/.nvm/…/node`, les scripts de scratchpads morts. Couper le plugin vercel pour ce projet ; réparer ou couper serena. |
| **P6** | après 07 | Installer la ligne de cron de `deploiement/sauvegarder.sh` sur le VPS ; le lendemain, vérifier qu'une copie existe. |
| **P7** | après 60 | Rotation d'`INSTANCE_SECRET` (la clé d'admin a transité dans une conversation le 12/09) : tester d'abord sur la copie restaurée, puis régénérer la clé, mettre à jour le secret GitHub et `~/.config/wws/prod.env`. |
| **P8** | avant de pousser 63 | Ajouter le secret `VPS_HOTE_CLE` ; restreindre la clé de CI dans `authorized_keys` par `command=` (ligne donnée par le prompt). |
| **P9** | après 72 | Publier `wws-fin-session` sur claude.ai pour Cowork ; conditionner la description de `hueco-fin-session` au dépôt hueco_umbral (mêmes mots déclencheurs). |

## Ordre

Les vagues vont du plus urgent au plus confortable. À l'intérieur d'une vague, l'ordre des
numéros respecte les dépendances.

### Vague 1 — ce que le joueur voit

| | Prompt | Suppose |
|---|---|---|
| 01 | `01-depeche-objectif-revele` — la dépêche « objectif révélé » nomme sa région, et plus aucun cast ne cache la forme d'une dépêche | — |
| 02 | `02-journal-kind-inconnu` — un onglet resté ouvert ignore une dépêche qu'il ne connaît pas au lieu de planter | — |
| 03 | `03-clic-droit-du-mappage` — aucun libellé n'écrit plus « clic droit » en dur | — |
| 04 | `04-generateurs-de-grille` — `generate-grid` et `generate-region-grid` tournent de nouveau | — |
| 05 | `05-tests-en-utc` — les tests tournent à l'heure de la CI, quel que soit le fuseau | — |

### Vague 2 — les données de prod en sécurité

| | Prompt | Suppose |
|---|---|---|
| 06 | `06-conteneurs-relances` — les conteneurs redémarrent seuls après un reboot du VPS | — |
| 07 | `07-sauvegarde-du-volume` — une sauvegarde quotidienne qui marche, contrôlée | — |
| 08 | `08-sante-du-serveur` — une requête dit si le temps du jeu tourne | — |
| 09 | `09-surveillance-planifiee` — la prod vérifiée toutes les 3 h, une copie exportée chaque jour | 08 déployé |

### Vague 3 — socle Node et vérifieur

| | Prompt | Suppose |
|---|---|---|
| 10 | `10-node-epingle` — une seule version de Node, déclarée et suivie | — |
| 11 | `11-pre-push-actif` — le pre-push tourne sur tout clone, avec le bon Node | 10 (P2 recommandé) |
| 12 | `12-types-de-convex` — le vérifieur type ce que `convex deploy` type | — |
| 13 | `13-verifieur-sans-doublon` — tsc une fois, le format d'abord, une sortie courte | 12 |
| 14 | `14-avertissement-des-routes` — plus d'avertissement du générateur de routes | 13 |
| 15 | `15-images-convex-epinglees` — backend et dashboard épinglés par digest | P1 |

### Vague 4 — l'environnement de Claude Code

| | Prompt | Suppose |
|---|---|---|
| 16 | `16-garde-fous-claude-code` — `.claude/settings.json` versionné et hook garde-prod | — |
| 17 | `17-hook-prettier` — les fichiers modifiés formatés à chaque fin de tour | 16 |
| 18 | `18-hook-demarrage` — six lignes d'état au plus au démarrage d'une session | 16, 10, 11 |
| 19 | `19-sur-head` — mesurer avant/après sur une copie de HEAD, jamais par stash | — |
| 20 | `20-deux-postes` — scrutation seulement sous WSL, doc de dev pour les deux postes | — |
| 21 | ~~`21-instructions-en-tete`~~ — fait le 17/10 : `CLAUDE.md` redevenu une carte | — |

### Vague 5 — la mémoire du projet

| | Prompt | Suppose |
|---|---|---|
| 22 | `22-docs-wws-a-jour` — WWS/CLAUDE.md, WWS/README.md, architecture.md alignés | — |
| 23 | `23-docs-design-a-jour` — index des ADR, glossaire, fiches alignés sur les révisions | — |
| 24 | ~~`24-etat-du-code-deplace`~~ — fait le 17/10 : récit figé dans `WWS/docs/technique/recit-du-code-2026-10-17.md` | — |
| 25 | ~~`25-claude-md-invariants`~~ — fait le 17/10 : `CLAUDE.md` à 6 500 caractères | — |
| 26 | ~~`26-etat-du-code-corrige`~~ — abandonné le 17/10 : le récit est figé, le code fait foi | — |
| 27 | `27-cycle-des-prompts` — `npm run prompts`, `plus-tard/`, ready/ remis à jour | — |
| 28 | `28-modele-de-prompt` — `_modele.md` et le lint d'un prompt | 27 |
| 29 | `29-archives` — `_to_delete/` et `Claude outputs/` retirés, `HANDOFF.md` unique | 27, P4 |
| 30 | `30-reste-a-coder-en-file` — RESTE-A-CODER redevient une file aux numéros stables | 27, 29 |
| 31 | `31-doc-lint` — `npm run doc-lint`, en rapport | 22 à 30 |
| 32 | `32-doc-lint-nettoyage` — zéro référence morte dans la doc vivante | 31 |
| 33 | `33-doc-lint-bloquant` — contrôles structurels bloquants, hors du chemin du déploiement | 32, 10 |

### Vague 6 — les garde-fous statiques

| | Prompt | Suppose |
|---|---|---|
| 34 | `34-frontieres-eslint` — les frontières de CONVENTIONS vérifiées par eslint | 13 |
| 35 | `35-traducteur-de-bouton` — un bouton ne devient un rôle que par `mouse-mapping.ts` | 03 |
| 36 | `36-regles-react-compiler` — les règles du React Compiler actives | 34 |
| 37 | `37-knip-configure` — knip configuré, zéro constat, dans le vérifieur | 13, 14, 35 |
| 38 | `38-shell-sans-cycle` — le shell n'importe plus la route plateau | — |
| 39 | `39-regles-partagees` — chaque refus de la rose déclaré partagé ou propre au client | — |
| 40 | `40-hygiene-de-fr` — termes bannis, français en dur, clés mortes | 03, P4 |
| 41 | `41-validateurs-miroirs` — unions des validateurs égales à celles du domaine | — |
| 42 | `42-constantes-importees` — plus aucune constante recopiée | — |
| 43 | `43-compat-deploiement` — un script dit avant la poussée si un déploiement exige un wipe | — |
| 44 | `44-compat-branchee` — compatibilité au pre-push et en CI, `WIPE-REQUIS` | 43, 11 |
| 45 | `45-marqueurs-wipe` — `git grep @wipe` est l'inventaire du prochain wipe | 41 |

### Vague 7 — la boucle de vérification et les tests

| | Prompt | Suppose |
|---|---|---|
| 46 | `46-isolat-en-parallele` — mesure-isolat sans attente inutile | — |
| 47 | `47-verifieur-orchestre` — `scripts/verifier.mjs` : toutes les étapes, un tableau lisible | 13, 37, 46 |
| 48 | `48-verif-rapide` — `npm run verif:rapide` pendant une tâche | 47 |
| 49 | `49-registre-a-mesurer` — `npm run a-mesurer`, registre sans numéros de ligne | 04 |
| 50 | `50-assets-verifies` — `npm run assets:check` recuit et compare | 04, 47, 49 |
| 51 | `51-miroir-profond` — le miroir du simulateur comparé en profondeur | — (P3 fait) |
| 52 | `52-simulateur-verifie` — `run.mjs --check` | 47, 48, P4 |
| 53 | `53-test-adaptateur-vue` — `adaptServerView` testé sur une vraie vue servie | 01, 02 |
| 54 | `54-brouillard-sur-le-fil` — ce qui est servi à un adversaire est une liste blanche | — |
| 55 | `55-fenetres-montees` — quatre fenêtres du plateau montées en jsdom | 53 |
| 56 | `56-fixtures-communes` — le montage des tests convex dans la fixture | 05 |

### Vague 8 — l'exploitation

| | Prompt | Suppose |
|---|---|---|
| 57 | `57-prod-socle` — `npm run prod -- status`, clé hors du dépôt | 08, 09, 16 |
| 58 | `58-prod-operations` — backup, presse, mot de passe, export d'état | 57 |
| 59 | `59-prod-wipe` — le wipe à la main, dans l'ordre, après une sauvegarde | 58, 44, 56 |
| 60 | `60-test-de-restauration` — une sauvegarde se restaure, le temps du jeu y tourne | 07, 08, 15, 57, 69 (donner 69 avant 60) |
| 61 | `61-ops-depuis-le-telephone` — statut, presse, export depuis GitHub | 08, 09 |
| 62 | `62-deploiement-par-sha` — le VPS déploie exactement le commit vérifié | 07, 15 |
| 63 | `63-ci-durcie` — permissions, délais, ssh natif, clé restreinte | 62 poussé et déployé, P8 |
| 64 | `64-version-servie` — le front propose de recharger quand une version sort | 62, 02, 63 |
| 65 | `65-retour-arriere` — relancer le workflow sur un SHA | 44, 62, 63, 64 |
| 66 | `66-contexte-docker` — `.dockerignore`, URL Convex exigée | 62, 12, 64 |
| 67 | `67-runbook` — le README de déploiement en cinq sections | 57 à 66 |

### Vague 9 — conventions et skills

| | Prompt | Suppose |
|---|---|---|
| 68 | `68-conventions-et-garde-fous` — CONVENTIONS dit ce que le code fait et nomme ses garde-fous | 31 à 45, P4 |
| 69 | `69-partie-locale` — `npm run partie:locale` monte une saison à deux en local | — |
| 70 | `70-partie-locale-pilotee` — `window.wws.toScreen`, launch.json, skill de partie locale | 69, P2 |
| 71 | `71-skill-wws-prompt` — `/wws-prompt <nom>` : exécuter un prompt de bout en bout | 27, 28, 39, 48, 54, et les outils que le skill nomme |
| 72 | `72-skill-fin-de-session` — le rituel installé, ses passes mécaniques en commandes | 24, 25, 27, 29, 30, 31 à 33, 71 |

### Au fil de l'eau (optionnels, rangement pur)

| | Prompt | Suppose |
|---|---|---|
| 73 | `73-vue-en-sections` — `viewOf` découpé en constructeurs de section | 21, 53, 54 |
| 74 | `74-tests-de-mouvement-decoupes` — les deux fichiers de test qui fixent la durée de la suite | 56 |
