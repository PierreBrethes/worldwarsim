# portees-passives — ADR 0021 révisée : détection et rencontres réévaluées

**Décision Pierre du 08/09/2026.** Aucun sélecteur de posture, aucune discrétion chiffrée, aucune salve d’allonge. Le comportement découle de l’ordre : attaque et raid engagent une force mobile détectée ; marche, rappel legacy et retour voient sans engager ; une force immobile défend sa position sans intercepter à distance.

## Lot

- Une portée par rôle, la meilleure d’une pile, sans addition ; stationnement et mouvement la conservent.
- Une station d’écoute apporte sa propre portée. Aucun bonus de bâtiment ordinaire ou de durée.
- Visibilité des forces mobiles et stationnées, sans fuite de composition, de portée, d’ordre ou de futur adverse.
- Rencontres mobiles dans le même milieu réel, aux horaires réels des jambes et transferts d’une route combinée.
- Réévaluation événementielle au départ, à l’arrivée, après une passe et quand un détecteur pertinent apparaît, disparaît ou change.
- Jobs périmés annulés et vérifiés au déclenchement ; une seule passe pour un croisement malgré les réévaluations.
- Portée de notre pile ou mouvement sélectionné sur la carte ; portée par rôle dans l’abaque-catalogue.

## Compatibilité et garde-fous

- `src/domain/movement-orders.ts` porte l’unique règle du comportement dérivé de l’ordre.
- `PlayerView` ne lit que les `sightings` de l’observateur ; un relevé futur n’est pas servi avant `from`.
- La portée détecte, elle ne tire pas et ne modifie pas `resolveEngagement`.
- `defenceOf` et `standAt` conservent les combats de défense à l’arrivée.
- Les champs ajoutés aux tables existantes sont optionnels avec défaut de lecture ; aucun wipe ni déploiement.
- Les valeurs initiales sont `@a-mesurer` et doivent être signalées comme telles.

## Cas de recette

- détecteur posé après un départ ; départ du détecteur avant la fenêtre ; conservation de la dernière position connue ;
- deux mouvements croisés avec zéro, une ou deux intentions offensives ;
- même croisement réévalué plusieurs fois mais une seule passe ;
- force immobile qui relève sans engager et défend toujours à l’arrivée ;
- route combinée, quai et milieux incompatibles ;
- saison conclue et documents legacy ;
- coût borné avec plusieurs joueurs et slots remplis ;
- non-régression débarquement, regroupement et entrée en garnison.

## Hors lot

Salve d’allonge, nouveau système de tir, pillage, stockage unique, objectifs PNJ, cargo public, victoire territoriale et nouvel ordre d’interception ou de poursuite.

À la livraison, déplacer ce brief vers `docs/prompts/code/done/`, mettre à jour l’ADR, les contrats de vue, la documentation du brouillard et `RESTE-A-CODER.md`, puis exécuter `npm run verifier`.
