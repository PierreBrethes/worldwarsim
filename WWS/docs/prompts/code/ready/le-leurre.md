# Prompt Claude Code — le leurre

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, `WWS/docs/adr/0006-slots-de-mouvement.md`,
`WWS/docs/design/04-information.md` (§Outils, « Pourquoi le leurre coûte un forfait fixe », « Ce
que révèle un mouvement détecté »), ADR 0018 §3 et 0019, puis `convex/movements.ts` (`marchTo`,
`scheduleInterception`, `fileSightings`, `arrive`, `engageAt`, `standAt`),
`src/domain/movement-orders.ts`, `compass-rose.ts`, `src/-plateau/GarrisonPanel.tsx` et
`MovementPreview.tsx`. Ne commit pas, ne push pas. **Suppose `gardes-de-saison-et-slots` et
`journal-complet-et-lu` passés.**

## Pourquoi

La fiche 04 le dit : « le leurre coûte trois lignes de code et produit à lui seul la moitié des
histoires que vous vous raconterez après la saison ». Le type `decoy` existe dans
`MOVEMENT_TYPE` depuis le début, et `movements.ts:56` l'exclut encore. Tout ce dont il a besoin
est là depuis l'ADR 0019 : le mouvement terrestre libre, les relevés qui ne disent ni type ni
composition, l'interception calculée au départ. Sans leurre, le brouillard n'a rien à cacher.

## La règle (ADR 0006, fiche 04)

Un leurre est un **mouvement sans troupe**. Il occupe un slot comme un vrai, il part d'une
origine où le joueur a une garnison ou un bâtiment de projection (les mêmes portes que la marche
— un leurre ne part pas de nulle part, sinon il perce le brouillard à rebours), il suit la même
route, à l'allure de l'infanterie (la plus lente : un leurre qui va plus vite qu'une colonne se
reconnaît). Il coûte un **forfait fixe**, indépendant de la cargaison : `DECOY_COST` en alliage,
placeholder marqué `@a-mesurer` (« assez cher pour être une décision, pas un réflexe »).

Pour les autres, il est **indiscernable** : mêmes relevés (`fileSightings`), même interception
(`scheduleInterception`). Quand une force adverse l'intercepte ou qu'il arrive sur un camp posé,
la passe de résolution trouve **une colonne vide** : aucun engagement n'est créé (rien à frapper,
rien à débiter — pas de munitions tirées contre du vent), le mouvement s'efface, et l'adversaire
reçoit une dépêche (`decoyExposed`, via les notices du prompt précédent) : « La colonne relevée à
… n'était qu'un leurre. » Le propriétaire reçoit la sienne (« Votre leurre a été éventé à … »). Un
leurre qui arrive sans être intercepté s'efface sans bruit pour tout le monde sauf son
propriétaire (« Votre leurre est arrivé à … sans rencontre. »).

Le leurre **ne peut rien faire à l'arrivée** : ni attaquer, ni raider, ni fonder, ni se poser. La
rose ne propose « leurre » qu'avec une cible de *marche* ; l'ordre est `decoy`, jamais un autre
type avec un manifeste vide — refuser côté serveur un `march`/`attack`/`raid` à manifeste vide
(`MOVEMENT_EMPTY`), exactement pour que « à zéro troupe » ne soit pas une porte dérobée.

## Ce que tu codes

1. `convex/constants.ts` : `DECOY_COST` (`@a-mesurer`).
2. `movements.ts` : mutation `decoy` (même signature que `marchTo` sans troupes) ; débit du
   forfait par `resources.debit` ; slot compté ; route et allure ; `scheduleInterception` et
   `fileSightings` inchangés — vérifie surtout que `troopsCarriedBy` vide ne fait pas *sortir*
   des fonctions d'arrivée avant d'avoir écrit les notices et effacé le mouvement.
3. Refus partagé (`refusalOf`) : pas de slot, pas d'alliage, origine sans porte — les mêmes mots
   que la marche, et le refus dit le forfait.
4. Front : entrée « Leurre » dans la rose des vents en visée de marche (encre sourde, pictogramme
   à définir simplement — une silhouette vide) ; carte d'aperçu qui dit le forfait, le slot, et la
   phrase de la fiche : « Indiscernable d'une vraie colonne. Éventé au premier contact. » Dans le
   widget troupes, le leurre en vol s'affiche comme un mouvement à part (« leurre → Bruxelles »),
   jamais mélangé aux colonnes.
5. `WWS/simulation/opening/README.md` : une ligne « leurre non modélisé ».

## Critères d'acceptation

- Test Convex : un leurre part, un adversaire posé à portée reçoit un relevé identique à celui
  d'une vraie colonne (même forme de document `sightings`).
- Test Convex : intercepté → aucun engagement, aucune munition débitée, mouvement effacé, deux
  notices (une par camp). Arrivé sans rencontre → une notice au propriétaire seulement.
- Test Convex : `marchTo` avec `troopIds: []` refusé `MOVEMENT_EMPTY`.
- Test domaine : le leurre occupe un slot et le forfait apparaît dans le refus.
- Aucun terme banni (le mot est **leurre**, jamais « convoi leurre » — CONTEXT.md bannit convoi).
  `npm run build`, `npm run test`.

## Ce que tu ne fais pas

Pas de leurre maritime ni aérien (ADR 0019 : le naval de combat n'existe pas, le cargo est une
porte). Pas d'agent. Pas d'identification.
