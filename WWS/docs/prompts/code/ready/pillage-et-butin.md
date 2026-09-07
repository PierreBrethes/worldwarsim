# pillage-et-butin — lot 1 : piller, porter, rentrer

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, **`propositions/pillage-et-butin.md`**
(règles 1-4 et 6 ; la capture (5) est le lot 2, le QG (7) n'est pas dans ce lot), l'ADR 0020 §6-§7,
l'ADR 0021 §2 et §4, l'ADR 0019 §2-§3, `convex/movements.ts` + `convex/movement/*` (le raid : sa
visée, `defenceOf`, l'arrivée, le retour créé par la résolution), `src/domain/movement-orders.ts`
(`MOVEMENT_TARGET`, la table des ordres), `convex/resources.ts` (`extractionSites`, `chainsOf`,
`storageCaps`), `src/domain/economy.ts` (`clipToCapacity`), `src/domain/control.ts`
(`heldRegions`), `convex/schema.ts` (`movements`). **Suppose livrés : `production-reliee`,
`portees-et-postures`, `stockage-unique`.** Sans la réévaluation du contact, une colonne qui
rentre est intouchable et le butin est un cadeau — ne donne pas ce prompt avant. Ne commit pas,
ne push pas. Un chantier, un commit.

## La règle

Une colonne **d'infanterie** (seule à piller — règle 6 ; les autres rôles peuvent l'escorter,
jamais piller) reçoit l'ordre **piller** sur un **bâtiment adverse connu** (relevé — jamais un
bâtiment jamais vu, ADR 0005) : un bâtiment de production (extracteur, fonderie, arsenal,
intendance) ou l'entrepôt. Elle y va, bat la garnison (comme un raid), reste
`PLUNDER_HOURS_PRESENT` (`@a-mesurer`, 2 h), et repart avec **du butin** : pour un bâtiment de
production, l'équivalent de `PLUNDER_YIELD_HOURS` (`@a-mesurer`, 12 h) de sa production au
moment du pillage (donc **zéro** s'il est hors réseau — ADR 0020 §6, et c'est voulu) ; pour un
entrepôt, une part du stock national **au-dessus de `BASE_CAP`**, pro rata des ressources. Le
bâtiment pillé est **désactivé** `PLUNDER_DISABLED_HOURS` (`@a-mesurer`, 12 h) — jamais détruit
(un entrepôt désactivé fait chuter le plafond, `clipToCapacity` écrête : le dépôt qui explose).
La colonne porte au plus sa **capacité** (`CARRY_CAPACITY_BY_ROLE`, `@a-mesurer` : infanterie
40, transport terrestre 150, les autres 0 — seuls les rôles terrestres portent). Le butin
**n'entre au stock qu'à l'arrivée du retour** sur le territoire du pilleur ; interceptée et mise
en déroute avant, la colonne **perd tout**.

## Ce qui change

1. **Ordre** `plunder` dans la table des ordres (`movement-orders.ts` — la rose et le serveur
   lisent la même fonction) : cible `building` adverse **connu** (`sightings`/relevé de région :
   le bâtiment doit figurer dans ce que le joueur a relevé — sers-le dans `me.known` si ce n'est
   pas déjà là, sinon le client ne peut pas viser). Refus lisibles : `NOT_INFANTRY`,
   `UNKNOWN_TARGET`, `NOT_PLUNDERABLE` (QG, projection, cantonnement, station).
2. **Arrivée** : même engagement que le raid (`defenceOf` du bâtiment : sa garnison ; posture
   offensive par défaut). Gagné → **présence** : la colonne est posée sur le bâtiment pendant
   `PLUNDER_HOURS_PRESENT` (job planifié `plunderComplete`, gardé par `seasonStillPlays`), et
   pendant ce temps une défense qui arrive l'engage normalement. Au terme : butin calculé
   (`src/domain/loot.ts`, pur : `lootOf(site, stocks, caps, capacity)`), bâtiment
   `disabledUntil`, **retour créé par la résolution** (comme aujourd'hui) vers **le point le
   plus proche de mon territoire** — la région tenue par moi (`heldRegions`) dont le pôle est le
   plus proche, calculé serveur, posture **discrète** par défaut (règle 3 de la proposition).
3. **Schéma** : `movements.loot: Record<ResourceKey, number> | null` (optionnel jusqu'au wipe) ;
   `troops`/`stationedAt` inchangés. `ArcView` adverse ne sert **jamais** `loot` — une colonne
   chargée se voit comme une colonne (ADR 0021 : c'est la posture discrète qui protège, pas le
   secret du champ).
4. **Livraison** : à l'arrivée du retour, `settleStocks` puis `+loot`, écrêté par
   `clipToCapacity` — l'excédent est perdu et **dit** (dépêche). Déroute en route → `loot`
   perdu ; le vainqueur **ne le prend pas** (lot 1 : le butin se perd, il ne se reprend pas —
   la reprise attend le lot 2 avec la capture).
5. **Dépêches** : victime `sitePlundered` (critique, alarme rouge : « <bâtiment> pillé — <pays>,
   désactivé jusqu'à HH:MM ») ; pilleur `lootTaken` (notable, la liste), `lootDelivered`
   (notable, avec l'écrêtage s'il y en a), `lootLost` (critique). Le journal reçoit les sortes,
   les tampons, l'encre.
6. **Client** : branche « piller » dans la rose en visée sur un bâtiment adverse connu (même
   grammaire que « entrer en garnison » — 64b), aperçu qui dit la présence et le retour
   (« pille 2 h, rentre vers <région> ») ; le cartouche d'une pile chargée montre le butin
   (mienne seulement) ; « à faire maintenant » : rien de nouveau.

## Ce que ce prompt ne fait pas

Pas de capture (lot 2). Pas de pillage du QG (décision 39 — un prompt à part, avec sa recherche).
Pas de reprise du butin par l'intercepteur. Pas d'objectif neutre (prompt suivant, qui réutilise
`loot` et le retour).

## Cas d'acceptation (tests d'abord)

1. Une colonne blindé seul → `NOT_INFANTRY` ; blindé + infanterie → acceptée, capacité = celle
   de l'infanterie et du transport seuls.
2. Cible non relevée → `UNKNOWN_TARGET` ; cible QG → `NOT_PLUNDERABLE`.
3. Pillage d'une mine à 9/h reliée : butin `ore: min(108, capacité)` ; la même mine hors réseau :
   butin 0, dépêche `lootTaken` vide dit « rien à prendre » ; la mine est désactivée dans les
   deux cas.
4. Pillage d'un entrepôt avec un stock national 1 000 d'alliage (cap 1 000, `BASE_CAP` 400) :
   part prélevée sur les 600 au-dessus de `BASE_CAP`, écrêtée par la capacité ; l'entrepôt
   désactivé → cap 400 → `clipToCapacity` écrête le reste chez la victime, dépêche.
5. Retour intercepté et mis en déroute → `loot` = null, `lootLost` ; retour arrivé → stock
   crédité, `loot` = null, `lootDelivered`.
6. Le point de retour est une région que je tiens ; si je n'en tiens aucune hors sol national,
   c'est la capitale (`hq`).
7. `ArcView` adverse d'une colonne chargée est identique à celui d'une colonne vide (test sur
   la forme).
8. Un job `plunderComplete` sur une saison conclue est un no-op (`seasonStillPlays`).

`npm run verifier` vert. `a-mesurer.md` régénéré (quatre valeurs de plus). `CLAUDE.md`,
`WWS/CONTEXT.md` (piller, butin, présence), `RESTE-A-CODER.md` (8 livré, lot 1).
