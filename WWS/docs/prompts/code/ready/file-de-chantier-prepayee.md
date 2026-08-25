# Prompt Claude Code — la file de chantier prépayée

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, et le modèle à imiter :
`convex/recruitments` dans `convex/schema.ts` + `convex/troops.ts`. Ne commit pas, ne push pas.

## Pourquoi

Décision de Pierre (25/08) : la construction gagne une **file illimitée, payée à la mise en
file**. C'est une révision de « un chantier à la fois, aucune file » (proposition
`ordre-de-mobilisation-et-fenetre-economie.md`) — mais l'objection d'origine visait une file
qui *promettait* un empilement que le serveur refuse ; une file **prépayée** ne promet rien :
chaque entrée a déjà réglé sa facture, le serveur l'a déjà acceptée. Ajoute une note de
révision datée dans la proposition (section « Ce que ça ne touche pas »), comme la maison le
fait pour les ADR.

Le modèle existe déjà dans le code : **le recrutement** — file séquentielle, seule la tête
porte un `finishesAt`, les suivants ne sont datés nulle part, le débit a lieu à la mise en
file, l'annulation d'un non-commencé rembourse intégralement. La construction s'aligne sur ce
patron ; n'invente pas un second modèle de file.

## Ce qui change

- `convex/schema.ts` + `convex/constructions.ts` : la table `constructions` passe de
  « au plus un chantier » à **une file séquentielle par joueur** (rang, seule la tête datée).
  « Un chantier à la fois » reste vrai *en exécution* : une seule tête avance ; la file ne
  fait qu'attendre son tour.
- **Paiement à la mise en file** : coût débité intégralement à l'ajout (comme `recruit`).
  Pas les poses de fondation offertes — gratuites et immédiates, elles ne passent jamais par
  la file (acquis du 19/08, ne pas le défaire).
- **Contrôles aux deux portes** : à la mise en file, toutes les règles actuelles (gisement,
  une bâtisse par région, chez-soi/portée, plafond du QG, verrou de niveau) s'évaluent contre
  l'état courant **plus la file** — deux entrées ne peuvent pas viser la même région. Au
  démarrage d'une tête, re-vérification : si le monde a changé entre-temps (région perdue,
  plafond descendu), l'entrée est **annulée avec remboursement intégral et une ligne de
  journal** — jamais un chantier qui démarre sur un droit disparu.
- **Annulation** : tête commencée = règle actuelle inchangée ; suivant non commencé =
  remboursement intégral (le patron du recrutement).
- **Écran** : la fenêtre Économie maquettée affiche « le chantier, en tête, une seule fois » —
  la file s'y ajoute sobrement sous la tête (rang, nom, région, bouton annuler par ligne).
  Pas de nouvelle fenêtre.

## Côté troupes

Rien à construire : le recrutement paie déjà à la mise en file et rembourse les non-commencés.
Ajoute seulement un test qui grave cette symétrie (même comportement de débit/remboursement
constaté sur les deux files), pour que l'un ne dérive pas de l'autre.

## Vérifications

Tests : file de 3 chantiers payés d'avance et exécutés dans l'ordre ; deux entrées sur la même
région refusées à la mise en file ; démarrage refusé (droit disparu) → remboursement + journal ;
annulation d'un suivant → remboursement intégral ; pose offerte toujours hors file. `npm run
verifier` complet.
