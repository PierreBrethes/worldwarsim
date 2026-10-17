---
type: index
statut: validé
maj: 2026-10-02
code: []
decisions: []
voir: [../../skills/wws-fin-session/SKILL.md]
---
# Prompts Claude Code — cycle de vie

**En bref.** Règle du cycle de vie des prompts Claude Code : `ready/` pour ce qui se donne, `done/` pour ce qui est consommé et immuable, `_to_delete/` pour le périmé avant d'être donné. Fait autorité sur ce cycle ; ne décrit pas `prompts/coffre/`.

Deux dossiers, une règle.

- **`ready/`** — les prompts prêts à donner, dans l'ordre où ils se donnent quand un ordre existe
  (chaque prompt dit ce qu'il suppose passé). On lance avec :
  `Lis WWS/docs/prompts/code/ready/<nom>.md et applique-le.`
- **`done/`** — les prompts consommés. On ne les modifie plus : ce sont les traces de ce qui a
  été demandé, et les ADR citent certains d'entre eux. Un prompt périmé **avant** d'avoir été
  donné ne va pas dans `done/` — il va dans `WWS/docs/_to_delete/`, parce qu'il n'est la trace
  de rien.

Le déplacement `ready/` → `done/` se fait quand le rapport d'exécution est accepté, pas quand le
prompt est donné — un prompt refait suite au rapport reste dans `ready/` sous sa nouvelle forme.

C'est le rituel de fin de session qui tient ce dossier à jour.
