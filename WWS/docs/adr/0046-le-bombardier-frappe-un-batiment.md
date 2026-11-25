# ADR 0046 — Le bombardier frappe un bâtiment, qui passe par trois états

**Statut :** proposée (25/11/2026), points 🟠 en attente de Pierre. **Mondiale seule** (`modeOf`).
**Remplace** la proposition `propositions/frappe-de-batiment.md` (06/09, décision 78a), qui
posait une intégrité de 0 à 100. **Répond** à `QUESTIONS.md`, « Que devient un quartier général
frappé ? ». Réutilise la désactivation du sabotage (`buildings.disabledUntil`,
`convex/plunder.ts`), la passe de contact (`resolveContact`, ADR 0018) et le refus partagé
(ADR 0015). Issues #647 (la frappe) et #648 (le QG).

## Contexte

Le bombardier se forme à l'aérodrome mais ne vise que des troupes : `DAMAGE_TABLE`
(`src/domain/combat.ts`) n'a pas de colonne bâtiment. Il n'a donc aucune raison d'être acheté
contre un adversaire qui ne sort pas.

Depuis la proposition du 06/09, le code a gagné une **désactivation de bâtiment** : le sabotage
(une expédition de pillage sur un producteur, `PLUNDER_DISABLED_HOURS` = 12 h) pose
`buildings.disabledUntil`, règle les stocks (`settleBeforeChange`) et planifie le retour
(`scheduleRestore`). Un bâtiment hors service ne produit plus et ne stocke plus
(`activeBuildings`, `convex/buildingReads.ts`). Ce n'est qu'un booléen daté : aucun état
intermédiaire, et rien ne gate la formation ni l'embarquement, parce que le sabotage ne vise ni
caserne, ni aérodrome, ni port.

Décision de Pierre du 25/11 : une intégrité simple à deux ou trois états, pas de points de vie.

## Décision

1. **Trois états, aucun nombre.** Un bâtiment est **intact**, **endommagé** ou **désactivé**.
   L'état se lit de deux dates optionnelles sur `buildings` : `damagedUntil` (neuve) et
   `disabledUntil` (celle du sabotage, la même). Une seule fonction pure,
   `integrityOf(building, now)` (`src/domain/integrity.ts`), dit l'état ; tout le reste la lit.
   Le sabotage et la frappe désactivent par le même champ : un seul « désactivé » dans le jeu.
2. **Endommagé ne fait rien d'autre que se lire** 🟠. Il produit, forme et embarque comme intact.
   Il sert à ce qu'un second coup désactive. Pas de pourcentage (règle n° 1 du projet).
3. **L'ordre « frapper ».** Un mouvement de mission `strike`, parti d'un aérodrome du joueur,
   qui porte au moins un bombardier ; les chasseurs l'escortent (ADR 0021), aucun autre rôle n'y
   monte. La cible est un bâtiment adverse **relevé** (le même relevé que l'expédition,
   `surveyedPlunderTarget`), jamais un avant-poste (il a sa désactivation par le raid,
   ADR 0019/0020 §7). Refus par `strikeRefusalOf` (`src/domain/movement-orders.ts`), lu par la
   rose et par le serveur : `STRIKE_NEEDS_BOMBER`, `NO_AIRFIELD_AT_DEPARTURE`, `FRIENDLY_TARGET`,
   `NOT_A_STRIKE_TARGET`, puis la porte de départ commune (`dry`, `closedGate`). Le mouvement
   s'intercepte en route comme tout autre.
4. **À l'arrivée, la garnison tire d'abord.** `resolveContact` entre les troupes posées sur le
   bâtiment et la colonne, la défense à l'initiative (inverse d'une attaque), munitions facturées
   comme tout engagement. Si au moins un bombardier tient encore, le bâtiment **perd un cran** 🟠 :
   intact → endommagé, endommagé → désactivé. Puis la colonne rentre à son aérodrome (le
   `return` de la résolution, comme le pillage). L'échéance relit la cible : un bâtiment rasé,
   capturé ou déjà désactivé n'est pas frappé, la colonne rentre et la dépêche le dit
   (`strikeFoundNothing`, motif `gone` ou `disabled`).
5. **Le rétablissement est seul** 🟠. Endommagé dure `DAMAGED_HOURS` (24, `@a-mesurer`) ;
   désactivé dure `BUILDING_DISABLED_HOURS` (12, l'actuel `PLUNDER_DISABLED_HOURS` renommé), puis
   le bâtiment revient **intact**. Ni ordre ni coût. Un bâtiment qui se rétablit est **à l'abri**
   `BUILDING_IMMUNITY_HOURS` (6, `@a-mesurer`, comme l'avant-poste) 🟠 : une frappe qui arrive sur
   lui ne porte pas, la colonne rentre et `strikeFoundNothing` le dit (motif `immune`). L'abri se
   lit à l'arrivée, jamais à l'ordre : un refus à l'ordre apprendrait à l'attaquant un état que
   son relevé ne montre pas (ADR 0005, point 7). Sans abri, un joueur riche maintient l'économie d'un autre
   éteinte à perpétuité.
6. **Ce que perd un désactivé** (même lecture `integrityOf`, à l'écran par son refus) :
   - les quatre extracteurs, les chaînes, l'entrepôt : ce que le sabotage fait déjà (ne produit
     ni ne stocke ; le teneur de Dakar garde ce que le pillage lui laisse) ;
   - la caserne : ne lance plus de formation (`recruitRefusalOf` → `BUILDING_DISABLED`), la file
     en cours se fige jusqu'au retour, par la suspension de la famine ;
   - l'aérodrome et le port : rien n'en part (porte de départ → `BUILDING_DISABLED`) ; on y
     rentre et on y atterrit toujours ;
   - le centre de recherche et le QG : #648, point 8 ;
   - le poste d'écoute : **hors V1**, il porte une portée et donc le brouillard
     (`reassessDetection`) ; il n'est pas une cible.
7. **Lecture et dépêches.** La vue sert `integrity: 'damaged' | 'disabled'` et l'heure de retour
   (absents = intact) au **propriétaire** ; à l'adversaire, seulement ce que son relevé lui
   montre au moment de la frappe (sa propre dépêche), jamais un état suivi en continu : le
   relevé ne dit pas l'état d'un site (`PlayerView`). Dépêches `buildingStruck` (victime, critique
   si désactivé) et `strikeDelivered` (attaquant, avec ses pertes et le cran porté).
8. **Le QG** (#648) 🟠. Il se frappe comme les autres et ne se rase jamais (`HQ_NEVER_DEMOLISHED`).
   Désactivé, il ne lance plus de chantier ni de recherche, ses chantiers en cours attendent ;
   les mouvements partent toujours (règle n° 3 : un joueur frappé riposte). Son niveau ne bouge
   pas ; capture et élimination ne changent pas (ADR 0027 §4). Le centre de recherche désactivé
   suspend de même la recherche.
9. **Hors périmètre.** Le porte-avions ne frappe pas en V1 🟠 ; la DCA (63a) attend le test ; la
   Blitz n'a pas de frappe.

## Conséquences

- Le bombardier a une cible au sol, et la garnison une raison d'être au-delà de la capture.
- Frapper un aérodrome cloue les avions qui y sont : c'est le contre de l'air par l'air.
- Deux passages pour désactiver : l'adversaire voit venir le second (dépêche du premier).
- Le sabotage gagne l'abri du point 5, puisqu'il pose le même état.

## Ce qu'on abandonne

- L'intégrité de 0 à 100 et la réparation linéaire de la proposition du 06/09.
- Une colonne `building` dans `DAMAGE_TABLE` : le cran ne dépend pas du nombre de bombardiers,
  seulement de ce qu'il en reste après la riposte.
- Le QG qui n'ordonne plus de mouvement (point 4 de la proposition) : paralysant.
