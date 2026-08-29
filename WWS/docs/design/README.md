# Design

Une fiche par système. Tous les chiffres sont des **placeholders à simuler**, jamais des décisions.

**Hiérarchie : l'ADR fait foi.** Une fiche raconte un système ; l'ADR grave une décision ; le code
et ses tests sont la règle exécutable. En cas d'écart, l'ordre de confiance est code → ADR →
fiche, et l'écart est un défaut de la fiche — soit on la met à jour, soit elle porte en tête une
ligne « ⚠️ en retard sur l'ADR NNNN ».

| # | Fiche | Statut |
|---|---|---|
| 01 | [Vision et format de saison](01-vision-et-format.md) | stable |
| 02 | [Économie et bâtiments](02-economie.md) | réécrite 15/08 — taux à simuler |
| 03 | [Carte et avant-postes](03-carte-et-avant-postes.md) | à jour ADR 0019 (18/08) |
| 04 | [Information : brouillard, espionnage, leurres](04-information.md) | à jour ADR 0019 (18/08) · **leurre retiré du jeu le 29/08** (note en tête de fiche) |
| 05 | [Doctrines et conditions de victoire](05-doctrines.md) | stable |
| 06 | [Nations](06-nations.md) | réécrite 15/08 — à équilibrer |
| 07 | [Friction sociale : élimination, sommeil, drame](07-friction-sociale.md) | stable |
| 08 | [Combat](08-combat.md) | réécrite 15/08 — modèle figé, taux non simulés |
| 09 | [Unités](09-unites.md) | à jour ADR 0019 (18/08) — taux non simulés |
| 10 | [Direction artistique](10-direction-artistique.md) | palette testée, typo à faire |
| 11 | [Brief UI](11-brief-ui.md) | transmis — 4.1 à 4.4 implémentées |
| 12 | [Hors-saison : accueil, salon, choix de nation](12-hors-saison.md) | à valider |

Le document monolithique v0.2 dont ces fiches sont issues vit dans l'historique git.
