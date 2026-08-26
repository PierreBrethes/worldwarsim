# Prompt Claude Code — découper `movements.ts`, alléger les commentaires qui recopient les ADR

Lis `CLAUDE.md`, `CONVENTIONS.md` (§2 sur les commentaires), puis `convex/movements.ts` en
entier. Ne commit pas, ne push pas. **Refactor mécanique : aucun comportement ne change, les
tests existants sont le juge. À faire après `cloisonner-par-saison` et après le skirmish.**

## Pourquoi

`movements.ts` fait 2 179 lignes (632 de commentaires) et porte quatre vies différentes : les
ordres, l'arrivée, la détection, le calcul des forces. Chaque prompt qui touche un mouvement le
fait relire en entier — c'est le fichier le plus cher du projet à chaque session, et le plus
risqué à modifier (un `collect()` global s'y est glissé sans que personne le voie). Les
commentaires y sont majoritairement des **paragraphes qui recopient une ADR** : utiles à froid,
mais ils dérivent comme les fiches ont dérivé, et ils coûtent leur poids à chaque lecture.

## Ce que tu fais

1. **Quatre modules, une surface.** `convex/movements.ts` ne garde que les mutations, queries et
   `internalMutation` exportées (`foundOutpostHere`, `marchTo`, `attack`, `raid`, `decoy`,
   `preview`, `arrive`, `intercept`, `restHold` et les lecteurs `movementsOf`/`outpostsOf`…),
   pour que les chemins `api.movements.*` **ne bougent pas** — le front ne change pas d'une ligne.
   Les aides vont dans `convex/movement/` (pas de fonctions Convex exportées dedans, donc rien
   n'apparaît dans `api`) :
   - `orders.ts` — `aimOf`, `columnOf`, `departureOf`, `claimSlot`, `march`, `decoyGate`,
     `pacedMinutes`, `troopsAmong`, `pointOf` ;
   - `arrival.ts` — `engageAt`, `standAt`, `fadeAt`, `exposeDecoy`, `recallAt`, `attachHome`,
     `homeOf`, `homeFor`, `nearestAnchor`, `walkHome`, `forgetMovement`, `deactivate` ;
   - `detection.ts` — `scheduleInterception`, `fileSightings`, `watchersAgainst`, `crossedSoil` ;
   - `forces.ts` — `postedForces`, `defenceOf`, `defenceNear`, `stanceOf`, `forceOf`,
     `troopsCarriedBy`, `recognises`.
   Si une aide est appelée par deux modules, elle vit dans celui qui la possède et l'autre
   l'importe — pas de `shared.ts` fourre-tout. Vérifie l'absence de cycle d'import.
2. **Chaque module ouvre sur cinq lignes** : ce qu'il contient, la règle qu'il applique, et
   **où elle vit** (ADR, fiche, §). C'est le commentaire qui sert vraiment une IA à froid.
3. **Commentaires : trois cas, une règle chacun.**
   - Un paragraphe qui **recopie** une ADR ou une fiche → remplacé par une ligne
     `// ADR 0018 §3 : calculé une fois au départ.` Le texte long reste dans l'ADR.
   - Un commentaire qui explique un **choix local non évident** (un ordre de lecture qui évite
     une dépendance à l'ordre de frappe, un `runAfter(0)` qui contourne une transaction) →
     conservé tel quel, c'est le « pourquoi » de CONVENTIONS §2.
   - Un commentaire qui décrit **ce que fait** le code → supprimé ; si le code ne se lit pas
     sans lui, renomme.
   Objectif indicatif : le total de commentaires des quatre modules + surface sous 250 lignes
   (contre 632). Ne coupe pas à la hache : lis chacun.
4. Même traitement, plus léger, pour **`convex/constants.ts`** (429 lignes de commentaires sur
   833) : les justifications de valeur restent sur la ligne (elles nourrissent `@a-mesurer`),
   les paragraphes d'ADR deviennent des pointeurs.

## Critères d'acceptation

- `git diff --stat` du front : vide. `api.movements.*` inchangé (`_generated/api.d.ts` ne
  change que si un export a bougé — il ne doit pas).
- Tous les tests passent sans modification autre que des chemins d'import.
- `wc -l convex/movements.ts` < 500 ; aucun module de `convex/movement/` > 700.
- Le rapport liste, par module, les commentaires supprimés en les classant dans les trois cas,
  et signale tout commentaire dont tu n'as pas su décider (garde-le dans ce cas).
- Aucun terme banni. `npm run build`, `npm run test`.

## Ce que tu ne fais pas

Aucun changement de comportement, aucune correction « en passant » — si tu vois un bug, note-le
dans le rapport. Tu ne touches ni à `fr.ts` ni à `EconomyWindow.tsx` (prompts à part).
