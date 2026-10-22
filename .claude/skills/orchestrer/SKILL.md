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
- la prod, les secrets et l'argent.

Pose-lui ces questions numérotées et groupées, chacune avec ta recommandation et des boutons.

Tout le reste, tu le tranches toi-même et tu le notes dans la section « Décisions prises seul » du rapport et de la PR. Dans ce projet, tu fusionnes toi-même un lot complet ; le `CLAUDE.md` global de Pierre vaut pour ses autres projets.

## 3. Le pipeline d'un lot

1. **Issue** : skill `ticket`. Les décisions de Pierre vont en commentaire « Décisions » de l'issue.
2. **Branche** depuis `main` à jour. Les lots d'un même thème partagent une branche et une seule PR, pour économiser les minutes de CI.
3. **Agents** (définis dans `.claude/agents/`) :
   - un agent `dev` par issue ;
   - **un seul agent qui écrit à la fois** dans le checkout ;
   - `enqueteur`, `relecteur` et `designer` tournent en parallèle ;
   - la consigne d'un agent porte l'issue, ce qui a changé sur la branche, les décisions de Pierre, ce qui est propre au lot et la règle d'arrêt. Ce que disent déjà sa définition et le skill `lot` ne s'y recopie pas : vérifieur unique, fichiers de Pierre, commits locaux, format du rapport.
4. **Revue** : un agent `relecteur` après chaque lot. Ses findings repartent au même `dev` (SendMessage), les bloquants d'abord.
5. **Rendu** : tu regardes toi-même les captures, à côté de leur référence, avant de dire que c'est fait. Tu les envoies à Pierre (SendUserFile) quand le rendu change.
6. **Fusion** : vérifieur vert sur la pointe (relance seuls les timeouts de `convex/`), PR (skill `pr`), puis fusion par toi. Exception : un lot qui exige de vider la pré-prod attend que Pierre l'ait vidée.

| Le lot | Modèle, effort |
|---|---|
| mécanique, spec fermée (brancher des GLB, déplacer du code) | Sonnet, low |
| feature à spec claire, maquette choisie | Sonnet, medium |
| conception, rendu 3D, diagnostic, revue | Opus, medium |
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
