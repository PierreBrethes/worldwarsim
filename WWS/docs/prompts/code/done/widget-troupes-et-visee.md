# Prompt Claude Code — implémenter la maquette « Widget de troupes et visée »

**À lancer en dernier de la série : après `garnison-adresse.md` et `combat-sequentiel.md`.**
La visée propose les types de mouvement que le serveur accepte — avant le combat, la rose ne
connaîtrait que la fondation d'avant-poste, et il faudrait revenir sur les mêmes fichiers dans
la semaine.

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, et **la source de vérité du
comportement : `WWS/docs/design/propositions/flux-mouvement-en-carte.md`** (décisions 12a et
13a). La maquette dit à quoi ça ressemble ; le brief dit ce que ça fait. En cas de divergence
entre les deux, le brief gagne — et tu signales la divergence.

## La maquette

Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to
import this project:
https://claude.ai/design/p/fd04bd89-5f6a-4981-8d3e-2d835d41c809?file=Widget+de+troupes+et+vis%C3%A9e.dc.html
Focus on these files (the whole project is readable):
- `Widget de troupes et visée.dc.html`
Also read these files the selection imports:
- `assets/plateau.png`
- `support.js`
Implement: `Widget de troupes et visée.dc.html`

## Ce que ça remplace — des morts, pas des ajouts

- **La fenêtre Troupes disparaît** (décision 13a) — le widget est la seule maison de la liste.
- **La modale « Envoi d'un mouvement » disparaît** — la visée en carte la remplace.
- **Le widget des trajets disparaît** — les mouvements à moi vivent dans la section
  « en mouvement » du widget.

Supprime, ne cache pas : un composant mort qui reste importable sera réutilisé par erreur.

## Les règles que la maquette ne peut pas te dire

- **Deux pouvoirs, deux sections** : « stationnaires » sélectionnables (clic → caméra au
  bâtiment, panneau de garnison, troupe pré-cochée) ; « en mouvement » **observables seulement**
  — aucun clic droit, rien qui ressemble à une commande, l'irréversibilité est la thèse du jeu.
- **Un seul état de sélection, deux portes** : la carte du widget et le jalon du bâtiment
  ouvrent le même panneau de garnison, le même flux. Jamais deux chemins.
- **La visée est contextuelle, jamais grisée** (ADR 0015) : la rose des vents ne montre que les
  types que le serveur acceptera pour cette cible — elle lit la même règle que lui, pas une
  copie.
- **L'aperçu d'arc trace la route réelle** : celle que `movements` stockera (`points`), rendue
  avec les traits d'arc existants du prototype. Jamais une approximation dessinée à part.
- La carte « en mouvement » porte la **planche de la troupe représentative**
  (`representativeRole`) et le picto de type ; le picto « leurre » n'existera que chez son
  propriétaire le jour où le leurre existera.
- Fenêtre de repos de la cible : si l'arrivée mord, la carte et l'aperçu le disent.
- Replié : **deux lignes** — mouvements en vol avec prochaine arrivée, compte de stationnaires.

## Le bloc « Renseignement » : ne l'implémente pas

La maquette le dessine ; **aucun système de détection n'existe** — la station d'écoute n'a pas
de rayon, aucun arc adverse n'est relevé nulle part. Implémenter le bloc maintenant, ce serait
de l'interface branchée sur du vide. Laisse l'emplacement documenté en commentaire, avec un
renvoi au brief. C'est la question 14 de la session du 18/08, encore ouverte.

## Critères

- Le flux complet se joue **sans quitter la carte** : widget → garnison → visée → rose des
  vents → aperçu → envoi. La modale n'existe plus nulle part.
- Un mouvement en vol n'expose **aucune** affordance d'action — vérifié par l'absence de
  handler, pas par un bouton désactivé.
- `tsc` propre, tests verts, garde-fou du simulateur tenu (il ne touche pas au back, il doit le
  prouver).
- Vocabulaire : *mouvement*, jamais convoi ; bannis : tick, temps réel, micro, base, rush.
