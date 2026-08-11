# 09 — Unités

**Époque retenue : 1940.** Décision structurante, cf. [ADR 0007](../adr/0007-epoque-1940.md).

## La règle : une unité doit créer une décision, pas une ligne de stats

Advance Wars a beaucoup d'unités **parce que c'est un jeu tactique sur grille** : le terrain, la
portée de déplacement et le placement au tour par tour font que chaque unité crée une situation
différente.

Ici il n'y a ni grille, ni terrain, ni contrôle pendant le combat. Du coup « char léger » et
« char lourd » se réduisent à *l'un est moins cher* — un nombre, pas une décision. C'est la même
erreur que le bonus national à +15 %.

**Conséquence : les paliers sont des niveaux d'amélioration, pas des unités distinctes.**
On garde toute la variété visuelle sans multiplier la surface à équilibrer.

## Les neuf rôles

| Domaine | Rôle | Niveau 1 → 2 | Ce qu'il décide |
|---|---|---|---|
| Terre | **Infanterie** | soldat → bazooka | tenir, prendre et garnir les avant-postes |
| Terre | **Blindé** | char léger → char lourd | percer une garnison |
| Terre | **Transport** | VTC | projeter de l'infanterie plus loin |
| Air | **Chasseur** | — | intercepter ce qui vole, couvrir un convoi |
| Air | **Bombardier** | — | frapper sans occuper |
| Air | **Transport aérien** | — | vitesse maximale, capacité minimale |
| Mer | **Escorte** | — | protéger et couler les convois |
| Mer | **Cargo** | — | commerce PNJ et logistique lourde |
| Mer | **Porte-avions** | 2 → 4 appareils | **déplacer le point de lancement aérien** |

### Le porte-avions n'est pas une unité de combat

C'est de **l'infrastructure mobile** : un avant-poste qui bouge. Il déplace l'endroit depuis lequel
on peut lancer de l'aviation, donc il agit directement sur le cœur du jeu — la projection de force —
au lieu d'ajouter une ligne de statistiques. C'est la meilleure idée du lot, et probablement l'unité
autour de laquelle construire la couche navale.

## Transport : capacité de pile, pas unité porteuse

Deux modèles possibles :

- **Advance Wars** — un transport est une unité qui doit être présente pour porter l'infanterie.
- **Ogame** — la capacité de transport est une propriété de la pile envoyée.

**On prend le second.** Le premier casse « 1 mouvement = 1 slot = 1 pile », qui est le régulateur
central du design ([ADR 0006](../adr/0006-slots-de-mouvement.md)).

## 💡 À creuser : une unité spéciale par nation

Idée notée, non tranchée. Chaque nation disposerait d'une unité unique en plus des neuf rôles.

Ça rejoint naturellement la logique des pouvoirs nationaux (fiche 06) : une unité spéciale devrait
**casser une règle**, pas être une version améliorée d'un rôle existant. Sinon c'est un dixième rôle
à équilibrer pour rien.

Pistes cohérentes avec 1940 : un sous-marin qui ignore le brouillard adverse, un planeur qui dépose
de l'infanterie sans transport, un cuirassé qui frappe la côte depuis la mer sans débarquer.

**Attention** : 8 nations × 1 unité spéciale = 8 systèmes de plus. À reporter après la première
saison test, et sans doute à réserver à 4 ou 5 nations seulement.

## Combat

Volontairement absent. Cf. [08 — Combat](08-combat.md), qui reste la question bloquante n°1.
