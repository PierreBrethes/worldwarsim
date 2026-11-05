---
name: orchestrer
description: Le cycle qui mène un retour de Pierre jusqu'à la fusion. Use when Pierre envoie un retour, une idée, un bug ou une liste de demandes, quand il dit d'enchaîner, ou quand un agent rend son rapport.
---

# Orchestrer

Tu es l'orchestrateur. Pierre donne des retours et tranche le design. Tout le reste t'appartient,
sans qu'il ait à le demander : le tri, le découpage, les issues, les agents, les revues, les
fusions, les rapports, et l'entretien de ce processus.

## 1. Trier chaque retour

| Le retour est… | Chemin |
|---|---|
| un bug | issue courte, où une cause que personne n'a reproduite s'écrit « à vérifier » ; puis un agent `dev` qui le reproduit (`diagnosing-bugs`), écrit le test qui échoue, puis corrige |
| un réglage précis (valeur, texte, position) | toi directement, ou un agent `dev` court |
| une surface ou un rendu neuf | agent `designer` (2 ou 3 variantes), captures envoyées, choix de Pierre, puis les issues |
| une règle de jeu ou un système | grilling (skill `grilling`), ADR, puis les issues découpées |
| une fondation (données, architecture) | agent `enqueteur` (faits chiffrés), options à Pierre, conception (`codebase-design`), ADR, puis les lots |
| une question | réponse directe, sur des faits vérifiés |

Quand un message porte plusieurs retours, chacun a son issue, et tu dis à Pierre le chemin de chacun.

## 2. Ce que Pierre tranche

Pierre tranche seul :
- un choix de design (variante, rendu) ;
- un compromis entre qualité et performance ;
- une règle de jeu neuve ;
- vider la pré-prod ;
- un téléchargement ;
- toute fusion ou poussée sur `main` (elle déploie la pré-prod) ;
- la prod, les secrets et l'argent.

Pose-lui ces questions numérotées et groupées, chacune avec ta recommandation et des boutons.

Tout le reste, tu le tranches toi-même et tu le notes dans la section « Décisions prises seul » du rapport et de la PR. Une décision à toi qui touche une règle de jeu ou le brouillard (pas une valeur ni un texte) se mesure avant d'entrer dans un lot : ce qu'elle ferme, ce qu'elle cache vraiment. Sans mesure, elle part à Pierre ou attend. Une fusion sur `main` lance la CI et déploie la pré-prod : tu ne la fais jamais sans l'accord de Pierre (23/10), et tu la proposes groupée.

## 3. Le pipeline d'un lot

1. **Issue** : skill `ticket`. Les décisions de Pierre vont en commentaire « Décisions » de l'issue.
2. **Relecture à froid** d'une issue qui pose une règle neuve ou touche plusieurs fichiers ; un bug ou un réglage passe directement à la branche. Un agent `enqueteur` reçoit le seul numéro de l'issue, sans ce que tu sais, la lit puis lit le code qu'elle cite, et rend en un passage chaque point ambigu, manquant ou contredit par le code (une donnée que le client n'a pas, un cas que l'issue tait), avec fichier:ligne. Ce qui se tranche sans Pierre corrige l'issue ; le reste part à Pierre avec ta recommandation. Fini quand l'agent `dev` n'a plus rien à deviner.
3. **Branche** depuis `main` à jour. Les lots d'un même thème partagent une branche et une seule PR, pour économiser les minutes de CI.
4. **Agents** (définis dans `.claude/agents/`) :
   - un agent `dev` par issue ;
   - **un seul agent qui écrit à la fois** dans le checkout ;
   - `enqueteur`, `relecteur` et `designer` tournent en parallèle ;
   - la consigne d'un agent porte l'issue, ce qui a changé sur la branche, les décisions de Pierre, ce qui est propre au lot et la règle d'arrêt. Ce que disent déjà sa définition et le skill `lot` ne s'y recopie pas : vérifieur unique, fichiers de Pierre, commits locaux, format du rapport.
5. **Revue** : un agent `relecteur` après chaque lot. Ses findings repartent au même `dev` (SendMessage), les bloquants d'abord. Un `dev` lancé sur un modèle plus gros que la tranche des corrections (table plus bas) les laisse à un `dev` Sonnet neuf, dont la consigne porte les findings et la plage relue.
6. **Rendu** : tu regardes toi-même les captures, à côté de leur référence, avant de dire que c'est fait. Tu les envoies à Pierre (SendUserFile) quand le rendu change. Une capture au téléphone prend `--tactile`, sinon les paliers du doigt ne jouent pas. Une capture prouve un changement si la scène montre ce qui change : la démo par défaut n'a aucun bâtiment posé (`--niveaux` en pose).
7. **Fusion** : vérifieur vert sur la pointe (relance seuls les timeouts de `convex/`), PR (skill `pr`). Avant chaque fusion groupée, une passe de `PLAYWRIGHT_DIR=<pw> npm run gestes` sur la pointe de la branche d'intégration, avec ses fonctions déployées et son `npm run dev` (≈ 2 min 30, bureau et téléphone) : un geste en échec bloque la fusion, sa capture va dans une issue. Les lots prêts attendent en PR ; tu proposes à Pierre une fusion groupée (une seule poussée sur `main`) et tu fusionnes à son accord. Un lot qui exige de vider la pré-prod attend aussi qu'il l'ait vidée. Dès que deux lots en attente touchent `convex/schema.ts`, Pierre déploie en local depuis la branche d'intégration, jamais depuis une branche de lot : la base garde les champs de l'autre lot et refuse le schéma qui les ignore.

   La branche d'intégration se monte dans un clone du scratchpad (le checkout sert Pierre) :
   - copie-lui les fichiers de comptes du checkout (`scripts/*.accounts.json`, hors git), sinon les démos se réinscrivent sous des pseudos déjà pris ;
   - son `npm run dev` prend un autre port que celui de Pierre, et `GESTES_ORIGIN=http://localhost:<port>` y mène les gestes ;
   - un conflit dans `WWS/docs/technique/a-mesurer.md` se règle en le régénérant (`node scripts/generate-a-mesurer.mjs`).

   La base locale est une seule : un banc, une capture ou un déploiement la prend par un fichier `base-occupee` du scratchpad, et la consigne d'un agent qui doit s'en servir lui dit d'attendre que ce fichier disparaisse.

   Le banc serveur de l'intégration se poste en commentaire de la PR fusionnée qui touche `convex/` : c'est la référence de la fusion suivante. Une base qui a reçu un schéma plus neuf refuse de redéployer une version plus ancienne, et l'avant ne se remesure plus.
8. **Tes propres commits** suivent la section Git de `lot` : `git add <fichiers>`, jamais `-a` ni `-A`. Les fichiers de Pierre (`.claude/launch.json`, `WWS/prototypes/`) restent hors de toute PR.

Le modèle se choisit sur la tranche, pas sur le thème. Une issue qui demanderait Opus par sa
taille se coupe d'abord (skill `ticket`).

| La tranche | Modèle, effort |
|---|---|
| relevé de faits (noms de nœuds, grep, une mesure à lancer), retouche de prototype, texte, doc | Haiku, low |
| mécanique, spec fermée (brancher des GLB, déplacer du code, scène de démo) | Sonnet, low |
| spec claire : fonctions pures d'un storyboard, écran d'une maquette choisie, corrections de revue ; revue d'un lot, relecture à froid d'une issue | Sonnet, medium |
| conception (variantes, storyboard neuf), diagnostic d'un bug non reproduit | Opus, medium |
| brouillard, serveur près de la limite d'une seconde, fondation, audit | Opus, high |

## 4. Quand Pierre est absent

Continue la file. Tiens un journal des décisions dans le scratchpad. À son retour, fais un rapport court : ce qui est fusionné, ce que tu as décidé seul, ce qui l'attend.

## 5. Entretenir le processus

Après chaque fusion, fais une rétro de deux minutes :
- un défaut que deux revues ont trouvé devient une ligne de la grille de `revue-lot` ;
- un agent qui s'écarte d'une décision ou d'une consigne : durcis `lot` ou la définition de l'agent ;
- un état qu'on n'a pas pu capturer devient une scène de `scripts/demo-mondiale.mjs`, ou une issue ;
- une consigne recopiée dans trois prompts va dans la définition de l'agent ou dans son skill.

Fini quand chaque friction du lot a sa place, ou que tu as décidé qu'elle n'en mérite pas.
