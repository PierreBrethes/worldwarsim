# Prompt Claude Code — la porte se lit sur la route, pas sur la cargaison

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'**ADR 0019 §2**, puis l'**ADR 0012 en
entier** — c'est lui que le prompt précédent a rendu inatteignable sans le voir. Ensuite
`src/domain/routing.ts` (`computeRoute`), `src/domain/movement-orders.ts` (`closedGate`,
`routeModeOf`), `src/domain/route-timing.ts` et `convex/movements.ts`.
Ne commit pas, ne push pas.

**Correctif de `mouvement-sans-origine.md`, à passer avant `visee-sur-un-point.md`.** Rien de ce
qui a été fait n'est à défaire : la porte de domaine est juste posée sur le mauvais objet.

## Le défaut

`computeRoute` n'autorise le milieu maritime que pour les modes `naval` et `combined`
(`routing.ts:180` — `allowed = mode === 'land' ? [LAND] : …`). Or `routeModeOf` ne renvoie
`'combined'` que pour une colonne à plusieurs domaines, cas que son propre commentaire déclare
« unreachable today ».

Conséquence : **aucune colonne terrestre ne peut plus traverser la mer.** Le trajet combiné de
l'ADR 0012 — « colonne terrestre, embarquement, traversée, débarquement », sa raison d'être — n'a
plus aucun appelant. `TRANSFER_COST = 8` (`routing.ts:41`, « embarking or landing ») et la
mécanique de `dock` / `embarking` de `route-timing.ts` sont devenues du code mort.

Ce que ça fait au jeu :

- **plus aucun débarquement** — l'infanterie ne quitte jamais son continent ;
- **plus aucun avant-poste outre-mer**, puisque fonder exige de l'infanterie (ADR 0015) ;
- le Japon, dont toute la fiche 06 tient dans « il doit sortir ou mourir », ne peut plus sortir ;
- l'ADR 0013 ne rend plus l'action lointaine *coûteuse*, il la rend **impossible** — ce qui
  n'aide pas le 🔴, ça le remplace par un mur.

## La cause, et la règle juste

La porte a été posée sur la **composition** de la colonne : `closedGate` cherche une troupe de
domaine `sea` et réclame un port. Mais l'ADR 0019 §2 ne dit pas « une flotte exige un port », il
dit **« embarquer exige un port »**. Embarquer est une propriété de la **route**, pas de la
cargaison : une infanterie qui traverse la Manche embarque, et doit donc payer la porte.

La règle juste, et elle sert mieux les deux intentions :

- une colonne terrestre calcule sa route en **`'combined'`** — terre et mer autorisées ;
- si la route retenue comporte au moins un tronçon `sea` et qu'aucun **port** ne se tient là d'où
  part la colonne → `NO_PORT_AT_DEPARTURE` ;
- une colonne navale reste en `'naval'`, une colonne aérienne en `'air'` et réclame un aérodrome.

L'ADR 0013 retrouve exactement le rôle que l'ADR 0019 lui donne : il ne ferme pas la mer, il la
fait payer. Et il la fait payer à l'infanterie qui débarque, c'est-à-dire à celui qui vient de
loin — ce qui est le levier attendu contre l'avantage d'isolement, pas son contraire.

## Ce que ça demande d'instruire

Le refus dépend maintenant de la route, et la route se calcule avant lui. `refusalOf` doit rester
**la seule** table de ce qui est légal, lue par la rose des vents et par les mutations (ADR 0015).
Deux façons, tranche et écris le pourquoi :

1. `Column` gagne un fait d'entrée — `crossesSea: boolean` — calculé par l'appelant à partir du
   même module de routage des deux côtés du fil, comme `departureBuildings` l'est déjà ;
2. `closedGate` reçoit la route en argument.

Ma préférence est **1** : elle garde `refusalOf` pur et fait de la traversée un fait au même titre
que les bâtisses au départ, sans qu'aucun des deux côtés ne calcule une route que l'autre ignore.

## Deux traces à corriger dans le même geste

- Le commentaire de `routeModeOf` dit qu'une colonne est mono-domaine « by construction — every
  troop it carries stands at one address ». C'est vrai aujourd'hui et **faux dès
  `adresse-sur-la-carte.md`** : plusieurs troupes de domaines différents pourront se tenir au même
  point. Ne supprime pas la branche `'combined'` ; réécris le commentaire pour qu'il annonce la
  bascule au lieu de la contredire.
- `convex/movements.ts:747` appelle `routeBetween(..., 'land')` en dur pour le retour d'une
  troupe dont le bâtiment a disparu. Une troupe qui rentre d'outre-mer ne trouvera aucune route et
  restera accrochée à un bâtiment détruit. Même correctif, même raison.

## Critères d'acceptation

- Un test : une colonne d'infanterie partant d'une région **portuaire** vers un point outre-mer
  obtient une route dont les tronçons comportent du `sea`, et le mouvement part.
- Le même départ **sans port** est refusé par `NO_PORT_AT_DEPARTURE`.
- Une colonne d'infanterie vers un point du même continent ne réclame **aucun** port — la route
  combinée doit préférer la terre, `COST_BY_MEDIUM` et `TRANSFER_COST` s'en chargent déjà.
- `TRANSFER_COST` et la mécanique `dock` de `route-timing.ts` ont de nouveau un appelant.
- Aucun texte affiché hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et
  `npm run test` passent.

## Ce que tu ne fais pas

Tu ne touches ni au schéma, ni à `stationedAt`, ni à `MovementAim`. Tu ne rétablis aucune règle
d'origine. Tu ne renommes pas `NO_LAND_ROUTE` — c'est une dette signalée, elle a sa place ailleurs.
