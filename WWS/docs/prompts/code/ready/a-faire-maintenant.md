# Prompt Claude Code — « À faire maintenant » (couche permanente 3/3)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`. Maquette validée :
`WWS/docs/prompts/design/maquette-couche-permanente.md` planche 1a (canvas « Interface de
saison »). Prérequis : les prompts 1/3 et 2/3 sont passés. Ne commit pas, ne push pas.

## La décision (Pierre, 30/08)

**Ce qui a une position ne vit pas dans un panneau.** Le widget Troupes est un inventaire de
ce que la carte montre déjà, avec deux sections vides et une phrase de règle imprimée en
permanence. Il est remplacé par une carte **« À faire maintenant »** : une ligne par chose qui
attend le joueur, chaque ligne recentre la carte ou ouvre la surface. Elle généralise
l'ordre de mobilisation (`MobilizationCard.tsx`), qui devient sa première ligne.

## Ce qui change

**Domaine pur** : `src/domain/next-actions.ts` — `nextActionsOf(view)` retourne une liste
ordonnée d'actions `{ kind, label, target }`, `target` = `{ kind: 'map', point }` ou
`{ kind: 'surface', surface }`. Les sortes, dans cet ordre, seulement quand elles s'appliquent :
1. `foundation` — « 2 poses de fondation offertes » (`view.me.foundation` non vide) → la ligne
   se déplie sur les clés à poser, geste identique à `MobilizationCard` (clic sur la clé, le
   sol s'allume, clic sur la région). `MobilizationCard` devient ce corps déplié, plus une
   carte à part.
2. `idleSite` — « chantier libre — rien en file » (pas de tête de file) → Économie.
3. `idleBarracks` — « caserne inactive — Lyon » (caserne sans recrutement en cours) → Production.
4. `troopWithoutOrder` — « 1 troupe sans ordre — Piémont » : troupe **posée hors avant-poste
   et hors garnison**, stationnaire → carte, recentrée sur elle. Une troupe en garnison ou
   dans un avant-poste n'attend rien.
5. `unsupplied` — « 1 troupe hors ravitaillement — en mer » (`supplied === false`) → carte.
6. `freeSlot` — « 1 slot de mouvement libre » (`slots.used < slots.total` **et** au moins une
   troupe capable de partir ; sinon rien) → carte.
Tests : chaque sorte présente puis absente ; l'ordre ; liste vide quand tout est en ordre.

**`src/routes/-plateau/NextActions.tsx`**, bas-gauche, style dépêche militaire comme l'ordre
de mobilisation : en-tête « À FAIRE MAINTENANT » avec le compte, une ligne par action, à
droite la destination en petit (« carte › », « production › »). **Quand la liste est vide, la
carte n'existe pas** — pas d'état fermé, son absence est l'état fermé.

**`TroopsWidget.tsx` supprimé**, avec `plateau.tsx:859`. Ce qu'il portait va où ça se lit :
la liste complète des troupes → fenêtre Nation, section armée (`NationWindow.tsx:61`), en
ajoutant une ligne par troupe si elle n'y est pas, cliquable → recentre ; les colonnes en vol
→ la carte (elles y sont) ; le renseignement → la carte et le journal (les relevés y sont
déjà) ; la phrase « une sentinelle ne voit que ce qui part après elle » → nulle part.
`TypeMark` et `stationNamer` partent avec lui s'ils n'ont plus de lecteur, sinon ils
déménagent dans un module qui dit ce qu'ils sont.

## Vérifications

`npm run verifier`. À la main : début de partie → 2 poses + chantier libre + slot libre ;
poser → la ligne des poses décroît puis disparaît ; tout en ordre → aucune carte ; clic sur
« Piémont » → la carte se recentre ; la fenêtre Nation liste les troupes.
