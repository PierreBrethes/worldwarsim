# ADR 0025 — Capacité, encombrement, et l'embarquement de proximité

**Statut :** acceptée (08/10/2026) — **révise l'[ADR 0019](0019-mouvement-libre-et-troupes-posees.md)
§2** (le port comme porte de l'embarquement), la fiche [09](../design/09-unites.md) § « Les
transports sont des troupes » (cinq nombres, cargo 6 et transport aérien 2), et la décision 70b
(`GARRISON_KEYS_BY_ROLE`) pour le port et l'aérodrome. Restent fermés : la colonne qui reste en
mer (révision du 18/09), le noyé, `LANDING_NEEDS_A_COAST`, et l'allure du transport terrestre
(note « le transport terrestre et l'allure »).

> **Révision du 15/10/2026 — on est à bord parce qu'on a embarqué** (grilling de Pierre, « comme
> dans un RTS »). Être à bord n'est plus calculé : c'est un état, `troops.carriedBy`, le transport
> qui porte la troupe, valable à la même adresse que lui. Ce qui change ici :
>
> - **§3, la proximité disparaît** : on embarque au point du transport, sur-le-champ ; de plus loin,
>   c'est une marche qui monte à bord en arrivant (`movements.boardsOn`). `BOARDING_RADIUS_KM` et
>   `TOO_FAR_TO_BOARD` sont retirés.
> - **On débarque** sur place (`movements.disembark`), jamais au large, d'un avion dans un
>   aérodrome ; les débarqués se tiennent à côté du transport, libres.
> - **Le camion est un transport comme les autres** : deux fantassins, qui embarquent ; son
>   rendez-vous en marche (§6) est remplacé par la marche qui embarque. Un camion chargé monte à
>   bord d'un cargo avec ses passagers, qui comptent leurs places.
> - **Les passagers suivent leur transport** : il part avec sa cargaison, un passager ne part pas
>   sans lui (`STILL_ABOARD`) ; une colonne mixte embarque au départ (`seatLoose`) et reste à bord.
> - **Le noyé lit l'état** : une troupe dont la coque n'est plus debout coule, sans changer de coque
>   au milieu d'une passe.
> - **Ce qui est à bord ne se dessine pas** : le transport porte un jeton « N à bord », chez son
>   propriétaire seulement ; l'adversaire voit une coque.
>
> Les capacités et encombrements du §1 tiennent ; le combat ne change pas.

> **Précisée le 18/10/2026 par l'[ADR 0028](0028-l-economie-de-la-mondiale.md) §4** : en Mondiale, un
> transport porte aussi des jetons de ravitaillement, dans une capacité séparée de ses places. Les
> places et l'encombrement ne changent pas.

## Contexte

Audit du 08/10/2026 sur une partie locale : le Royaume-Uni, deux blindés à la caserne, un cargo
au port. Faire passer la Manche aux deux blindés demandait **trois ordres que rien n'annonçait** :
sortir le cargo seul sur une plage, faire marcher les blindés sur sa pile — la branche s'appelait
« entrer en garnison » et la cible « 1 CGO » —, puis composer la pile et partir. Le port leur était
fermé (« un blindé n'entre pas dans un port »), l'aérodrome aussi : un blindé ne pouvait
pratiquement jamais voler. Et ce qu'un transport emporte ne se lisait nulle part avant de cocher
une coque — le catalogue présentait le cargo comme « commerce avec les pays neutres ».

Pierre, le même jour : « ça m'étonne moins de voir dix chars dans un cargo que dans un avion. »

## Décision

### 1. Une capacité, un encombrement, comptés en places

Chaque transport a une **capacité**, chaque troupe terrestre un **encombrement**, tous deux en
**places** — le mot que le joueur lit déjà sous la pile. Par rôle, jamais par palier : un blindé
MK2 pèse ce que pèse un MK1.

| Transport | Capacité | | Troupe | Encombrement |
|---|---|---|---|---|
| cargo | 12 | | infanterie | 1 |
| porte-avions | 6 | | transport terrestre | 2 |
| transport aérien | 2 | | blindé | 3 |

Un cargo emporte quatre blindés ou douze fantassins, un porte-avions deux blindés, un transport
aérien deux fantassins — **et jamais un blindé**. `@a-mesurer` tous ; le seul repère est le
plafond de 24 troupes : deux cargos lèvent toute l'infanterie d'une armée.

### 2. Une troupe tient dans un seul transport

Un passager s'assoit dans **un** transport ou ne monte pas : les capacités ne s'additionnent pas
d'une coque à l'autre. Le refus (`NOT_ENOUGH_LIFT`) lit l'**affectation** — celle qui dessine la
pile et qui décide du noyé (`stackRows`) — et non plus une somme. C'est ce qui garde vraie la
phrase du §1 : trois transports aériens ne font toujours pas voler un blindé.

### 3. On embarque par proximité, sur-le-champ

Une troupe terrestre posée **embarque** sur un transport posé à moins de `BOARDING_RADIUS_KM`
(50, `@a-mesurer`) : elle prend l'adresse du transport, tout de suite, **sans mouvement et sans
slot**. Être à bord reste un état calculé (ADR 0019 §2) — embarquer, c'est se tenir à l'adresse
d'un transport qui a la place.

- **Par mer** : un cargo ou un porte-avions, au port, sur une côte ou mouillé au large —
  n'importe où sur le littoral, tant que les deux sont proches. **Le port cesse d'être une porte**
  : il reste le seul endroit où l'on construit des navires.
- **Par air** : le transport aérien doit se tenir **dans un aérodrome**, et la troupe à moins du
  rayon de cet aérodrome.
- L'ordre se donne **en désignant le transport**, et la rose qui le propose sort de la même
  fonction que le refus du serveur (ADR 0015).
- Le saut est assumé : 50 km valent moins d'une minute de marche
  (`MINUTES_PER_1000_KM_ON_LAND` = 14). Une marche d'embarquement coûterait un slot pour rien.

### 4. On débarque d'un avion dans un aérodrome

Une colonne qui vole en portant de la terre vise **un aérodrome à soi** — sol national ou sous un
avant-poste — et y arrive en garnison. Viser l'aérodrome d'un autre, ce sera le parachutiste
(fiche 09), pas cette règle. Par mer rien ne change : une côte, ou le large.

### 5. Le port et l'aérodrome s'ouvrent à toute troupe terrestre

Le blindé et le transport terrestre entrent au port et à l'aérodrome, comme l'infanterie : une
coque chargée de chars rentre à quai, un avion débarque ses passagers sur son terrain. Les autres
lignes de la décision 70b ne bougent pas.

### 6. Le transport terrestre reste à part

Il motorise l'infanterie et ne fait rien traverser : deux places, que seule l'infanterie occupe.
À bord d'un cargo, il est un passager comme un autre, d'encombrement 2.

## Conséquences

- `LIFT_CAPACITY` et `LIFT_COST` changent de nombres et le porte-avions y entre ; le refus de
  surcharge lit `stackRows` au lieu de `liftOf`.
- Le rendez-vous en marche sur une pile de transport (« entrer en garnison » sur un cargo posé)
  disparaît au profit de la branche **embarquer**.
- Une colonne embarquée part de l'adresse de son transport, côtière ou à quai par construction :
  `NO_PORT_AT_DEPARTURE` ne la concerne plus.
- Embarquer déplace une troupe sans mouvement : les relevés des forces posées se réévaluent comme
  à une arrivée, et la charge de butin suit la troupe.

## Ce qu'on abandonne

- **Le port comme porte de l'embarquement** (ADR 0019 §2, révision du 27/08) : l'investissement
  reste la flotte qu'on construit, protège et peut perdre, pas le quai.
- **La capacité mise en commun** : deux petits transports ne valent pas un gros.
- **L'embarquement comme marche** — avec sa durée, son slot et son fil visible : sur 50 km il
  n'achetait rien qu'un clic de plus.
