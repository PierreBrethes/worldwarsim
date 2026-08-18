# Prompt Claude Code — traverser demande un port et un navire

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'**ADR 0019 §2**, l'**ADR 0012**, puis
`WWS/docs/design/09-unites.md` — en particulier **§ « Les transports sont des troupes »**, que ce
prompt code enfin. Ensuite `src/domain/movement-orders.ts` (`closedGate`, `routeModeOf`,
`Column`), `src/domain/troops.ts` (`DOMAIN_BY_ROLE`, `NOMINAL_STRENGTH`), `convex/constants.ts` et
`convex/movements.ts`.
Ne commit pas, ne push pas.

## La décision

**Une troupe terrestre ne traverse la mer qu'à bord d'un navire de transport, parti d'un port.**
Même règle dans les airs : elle ne survole qu'à bord d'un transport aérien parti d'un aérodrome.
Franchir un milieu qui n'est pas le sien devient un **investissement** — une flotte qu'on
construit, qu'on protège et qu'on peut perdre — au lieu d'un supplément de trajet.

C'est ce que la fiche 09 décrit depuis l'ADR 0014 (« un transport est une troupe, avec une
capacité d'emport typée ») et que rien ne code : aucune constante de capacité n'existe
aujourd'hui, et depuis `la-porte-se-lit-sur-la-route.md` une colonne d'infanterie pure traverse la
Méditerranée sans un seul navire.

## Ce que tu retires

`la-porte-se-lit-sur-la-route.md` avait raison de rendre le mode combiné atteignable et **tort**
de faire dépendre le refus de la route. Avec la décision ci-dessus, la porte redevient décidable
sur la **composition seule** — ce que `mouvement-sans-origine.md` faisait déjà et qui était juste.

- `Column.crossesSea` disparaît, et avec lui l'inversion « la route d'abord, le refus ensuite ».
- La rose des vents cesse de répondre `false` faute de route : elle sait tout ce qu'il faut savoir
  en regardant la pile. **Elle redevient exacte, et c'est le point qui compte** — l'ADR 0015 veut
  qu'un refus n'y arrive jamais.
- `refusalOf` redevient pure.

## Ce que tu poses

### 1. Le mode de trajet se lit sur les domaines présents

- terrestre pur → `'land'` ;
- terrestre **et** maritime → `'combined'` ;
- maritime pur → `'naval'` ;
- aérien présent → `'air'`.

Le cas mixte cesse d'être « inatteignable » : il devient **le seul chemin** vers un autre
continent. Réécris le commentaire de `routeModeOf` dans ce sens.

Une colonne terrestre pure route en `'land'` : si aucune route terrestre n'existe, elle est
refusée par `NO_LAND_ROUTE`, qui dit alors exactement la vérité — la dette de libellé signalée au
prompt 1 se referme sans renommage.

### 2. La capacité d'emport

Une constante de places par transport, et un coût en places par rôle transporté :

| | |
|---|---|
| `LIFT_CAPACITY.cargo` | 6 |
| `LIFT_CAPACITY.airTransport` | 2 |
| `LIFT_COST.infantry` | 1 |
| `LIFT_COST.armor` | 2 |
| `LIFT_COST.landTransport` | 1 |

**Cinq nombres, pas une table par rôle** — c'est la leçon de D1 dans
`consommation-continue.md`. Ils sont assumés et non mesurés, au même titre que
`INTERCEPTION_RADIUS_KM` : dis-le en commentaire. Le repère qui les a choisis : le plafond de
troupes est 24, deux cargos portent donc la moitié d'une armée, ce qui fait d'un débarquement une
opération et non un réflexe.

Un nouveau refus, `NOT_ENOUGH_LIFT`, quand les places demandées dépassent les places offertes. Le
libellé doit donner les deux nombres — le joueur compose sa pile, il a besoin de savoir combien il
lui manque, pas seulement qu'il manque.

Aucun typage plus fin que ces deux lignes de coût. Un blindé pèse deux places, c'est tout ce que
la fiche 09 demande vraiment par « capacité typée » tant qu'aucun troisième cas ne se présente.

### 3. Les portes restent où elles sont

`closedGate` ne change pas : un cargo réclame un port au départ, un transport aérien un aérodrome,
parce qu'ils sont de domaine `sea` et `air`. Une colonne terrestre pure ne réclame rien. Vérifie
seulement que le message nomme bien le **départ** et pas la cible.

## Ce que tu ne codes pas, mais que tu nommes

**Le sort des passagers quand le transport coule.** Un convoi intercepté en mer perd son cargo :
que deviennent les fantassins à bord ? `combat.ts:182` sait déjà qu'un transport ne sert pas de
bouclier ; il ne sait rien d'une cargaison. C'est une question de la passe de résolution, pas
celle-ci. Pose la question en commentaire à l'endroit exact où elle se posera, et **arrête-toi
là** — ne choisis pas une réponse en passant.

## Critères d'acceptation

- Un test : deux fantassins et un cargo partant d'une région portuaire vers un autre continent →
  le mouvement part, la route comporte des tronçons `sea`, le transbordement est facturé.
- Les mêmes deux fantassins **sans cargo** → route `'land'` ; si la terre ne mène nulle part,
  `NO_LAND_ROUTE`.
- Sept fantassins et un cargo → `NOT_ENOUGH_LIFT`, avec les deux nombres dans le message.
- Un cargo sans port au départ → `NO_PORT_AT_DEPARTURE`, **et la rose le sait sans route** : un
  test vérifie que `legalMovementTypes` répond la même chose que la mutation, sans qu'aucune route
  n'ait été calculée.
- `Column` ne porte plus `crossesSea` et `refusalOf` ne lit plus rien qui vienne d'un routage.
- Aucun texte affiché hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et
  `npm run test` passent.

## Ce que tu ne fais pas

Tu ne touches ni au schéma, ni à `stationedAt`, ni à `MovementAim`. Tu ne codes pas le sort des
passagers. Tu ne changes ni `COST_BY_MEDIUM` ni `TRANSFER_COST` — la mer est déjà plus rapide que
la terre (1,0 contre 1,6) et c'est ce qui fait qu'un navire vaut son prix.
