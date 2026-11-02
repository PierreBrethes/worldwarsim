# ADR 0037 — Un avant-poste qui stocke et guette, trois spécialisations au niveau 2

**Statut :** acceptée (01/11/2026). Tranchée par Pierre en quatre manches de grilling (28/10 au
30/10, Q1 à Q22), après un POC (`WWS/prototypes/avant-postes/`) ; les onze points restés ouverts
ont été tranchés le 01/11 (« je valide toutes tes recos ») et sont écrits ci-dessous à leur place.
La vigie et les liaisons (§1, §2, §8) sont codées par #370, les spécialisations, leur choix et
leur changement (§3, §7, §11) par #371 ; les lots suivants (#372 à #377) codent le reste.
**Mondiale seule** : la Blitz n'a pas d'avant-postes (`refuseInBlitz` dans `foundOutpostHere` et
`raiseOutpost`), et rien ici ne lui en donne.

**Révise** l'ADR 0004 (la spécialisation exclusive relais / écoute), l'ADR 0021 §1 (« la simple
présence d'un avant-poste n'ajoute aucun bonus ») et §4 (le changement de spécialisation),
l'ADR 0024 §1 (les détecteurs, et « jamais la composition » pour le Guet), l'ADR 0028 (§1, le
charbon de l'écoute ; « Ce qu'on abandonne », le relais). **Précise** l'ADR 0019 §4 (l'avant-poste
qui ravitaille) et l'ADR 0020 §8 (ralentir n'est pas bloquer).

## Contexte

Aujourd'hui, un avant-poste choisit entre deux métiers qui s'excluent (`SPECIALIZATION`,
`convex/validators.ts` ; `Specialization`, `src/domain/ids.ts`) :

- **le relais** accélère les mouvements de son propriétaire : `pacedMinutes`
  (`convex/movement/pace.ts`) retient les points en relais, debout et non désactivés, et
  `relayedCostUnits` (`src/domain/route-timing.ts`) divise par `RELAY_SPEED_MULTIPLIER` (1,5) le
  coût des tronçons qui passent dans leur rayon, transbordements exceptés. `legCost` compte tous
  les milieux : un vol sous un relais va aussi plus vite. Le calcul se fait au départ
  (ADR 0018 §3) ;
- **l'écoute** fait du point un détecteur au rayon entier (120 à 240 km) dans `detectionBoard`
  (`convex/movement/detection.ts`), et brûle `LISTENING_COAL_PER_HOUR` (1 charbon/h, forfait)
  dans `upkeepOf` (`convex/upkeep.ts`), comme la station d'écoute (le bâtiment). Sans charbon,
  toutes les écoutes se taisent (`listeningSilent`, `convex/resources.ts`). Un point en relais ne
  détecte rien.

Tout avant-poste debout, quel que soit son métier, tient la couleur, ouvre ses emplacements,
nourrit au tarif simple, recharge au dépôt du plus proche point qui couvre (`storeOf`,
`convex/upkeep.ts`), et relève le sol de son disque (`convex/surveys.ts`). Le dépôt fait
`depotCapacity(level)` = 400 × niveau (`convex/constants.ts`), une seule charge pour les
munitions, le pétrole et le charbon. Les rayons : `OUTPOST_REACH_KM_BY_LEVEL` = 120, 180, 240 km.

Le client fonde toujours en `'relay'`, en dur (`src/routes/plateau.tsx`). On change ensuite par
`respecialize` (`convex/movements.ts`) tant que le point n'est pas **scellé** :
`outpostServed` (`convex/movement/forces.ts`) répond vrai dès qu'un mouvement de n'importe
quel joueur est parti après la fondation en passant dans le rayon. Le même critère interdit le
démantèlement (`OUTPOST_SERVING`, `outpostDismantleRefusalOf`, `src/domain/construction.ts`).

Trois écarts doc/code pèsent sur la décision :

- l'ADR 0028 abandonne le relais (« un pourcentage ») ; le code le garde ;
- la fiche 03 dit la spécialisation « irréversible, choisie à la construction » ; le code la laisse
  changer tant que rien n'a servi ;
- la fiche 03 promet d'autres spécialisations « sans migration » ; le littéral vit dans cinq
  validateurs (`outposts.specialization` et quatre dépêches), et le retirer fait échouer la poussée.

Ce que le joueur en voit : un choix qu'on ne fait jamais (le relais est posé d'office), un point
aveugle par défaut, un relais dont l'effet ne se dessine nulle part, et aucun moyen de défendre
un endroit chaud : l'ADR 0024 §3 retire tout combat sans ordre, et l'ADR 0020 §8 refuse le
blocage.

Le POC a mesuré quatre choses que cette ADR reprend : un débit de 10 munitions/min remplit
presque tout (une traversée d'un dépôt de niveau 2 donne ~400) ; un Fort au rayon entier couvre la
destination et retient des colonnes que sa vigie ne voit pas ; « les rayons se touchent » tisse une
toile (6 points, 8 liaisons) ; élaguer cette toile *dans la règle* casse des trajets.

## Décision

### 1. Un seul avant-poste, qui stocke et guette

Il n'y a plus deux métiers. **Tout avant-poste debout** garde ce qu'il donne aujourd'hui (couleur,
emplacements, entretien, dépôt, recharge, relevé du sol) **et guette** : il porte une **vigie**.
À la fondation, il est **généraliste**. (Q1)

### 2. La vigie détecte à mi-rayon, et brûle du charbon

- Le rayon de la vigie est **la moitié du rayon de contrôle** : 60, 90, 120 km selon le niveau.
  `@a-mesurer`. (Q2)
- Elle détecte comme tout détecteur (ADR 0021 §1, ADR 0024 §1) : mouvements et forces posées,
  avec un relevé sans composition, sans nation, sans effectif.
- Elle brûle **1 charbon/h par niveau** (1, 2, 3). `@a-mesurer`. Le forfait de l'écoute part ; la
  station d'écoute (le bâtiment) garde le sien. (Q3, Q12)
- **Le charbon vient du stock national**, comme celui de l'écoute aujourd'hui (`upkeepOf`), et
  **le silence est global** : à court, toutes les vigies du joueur se taisent ensemble, stations
  d'écoute comprises (`listeningSilent`). Un dépôt qui se viderait seul priverait la vigie et la
  recharge des troupes en même temps, sans un geste du joueur. (01/11)
- **Sans charbon, la vigie est aveugle ; le dépôt reste intact** : il stocke et ravitaille
  toujours. (Q3)
- Comme aujourd'hui, un point en chantier de fondation ou désactivé ne guette pas.

### 3. Trois spécialisations, au niveau 2

Généraliste à la fondation ; au niveau 2, l'avant-poste prend **une** spécialisation parmi
trois. (Q4, Q5) Chacune ajoute à ce que fait le généraliste ; aucune ne retire rien.

| Spécialisation | Ce qu'elle fait | Chiffres (`@a-mesurer`) |
|---|---|---|
| **Magasin** | Dépôt doublé, et ravitaille au passage (§4) | 1 600 au niveau 2, 2 400 au niveau 3 |
| **Guet** | Vigie au rayon entier, et ses relevés livrent la composition (§5) | 180 km au niveau 2, 240 au niveau 3 |
| **Fort** | Ralentit les colonnes adverses dans le rayon de sa vigie (§6) | ×1,5 sur la durée, dans 90 ou 120 km |

- **Erratum (01/11)** : la capacité du Magasin vaut `depotCapacity(level)` × 2, soit
  400 × niveau × 2 : 1 600 au niveau 2 et 2 400 au niveau 3. La première ligne du tableau
  écrivait 800 et 1 200, la capacité du généraliste. #371 code cette capacité.
- **« Magasin », pas « Entrepôt »** : l'entrepôt est déjà le seul stockage national
  (`WWS/CONTEXT.md`), et un refus qui dit « entrepôt plein » doit désigner une seule chose. (01/11)
- **Une spécialisation est ce que fait le bâtiment, pas un bonus.** La règle 1 vaut pour les
  atouts et la recherche ; l'ADR 0031 admet déjà le pourcentage pour le niveau d'un bâtiment, et
  l'accélération des liaisons (÷1,5, §8) et le Fort (×1,5) s'y rangent au même titre. (01/11)
- **L'ordre d'élévation au niveau 2 porte le choix** : un geste, un chantier (`raiseOutpost`). Il
  n'existe donc aucun avant-poste « niveau 2 généraliste » à dessiner ni à refuser. Le niveau 3
  garde la spécialisation du niveau 2. (01/11)

Chaque spécialisation se reconnaît sur la carte à un accessoire posé au pied du mât : des caisses
pour le Magasin, une antenne pour le Guet, des sacs empilés et une pièce pour le Fort ; rien pour
le généraliste (Q1, et #298 tranchée le 30/10 : maquette mât et sacs de sable). La maquette suit
la file des modèles (#298), pas cette ADR.

### 4. Le Magasin ravitaille au passage

Un mouvement **de son propriétaire** qui traverse le rayon d'un Magasin y reprend **2 munitions et
2 de pétrole par minute passée dans le rayon**, **par colonne**, pris sur le dépôt de ce Magasin.
`@a-mesurer`. (Q9, Q9b) Les troupes le reçoivent **cran par cran** : 10 munitions font un cran de
coups, 10 de pétrole un cran de plein (`SUPPLY_STEP_COST`), dans la limite de ce que chaque
troupe porte. Le débit est en unités de dépôt et non en crans, parce que c'est l'échelle que le POC
a réglée pour « un peu » ; lu en crans, le pétrole coulerait dix fois plus vite. (01/11) Un passage
bref ravitaille un peu, un long passage davantage : c'est le « un peu » que Pierre a demandé, et le
POC a montré que 10/min remplit tout.

Le montant **se relit à l'arrivée** (invariant « Échéance ») : la part de route passée dans chaque
rayon, ce que le dépôt contient alors, plancher à 0 (`takeFromDepot`, `convex/supplies.ts`). Le
dépôt a pu être vidé, capturé ou désactivé entre le départ et l'arrivée.

La recharge des troupes posées ne change pas : au dépôt du plus proche point debout qui les
couvre, quelle que soit sa spécialisation (ADR 0019 §4).

### 5. Le Guet voit loin, et lit ce qu'il voit

- Sa vigie porte au **rayon de contrôle entier**. (Q2, Q10)
- **Ses relevés livrent la composition**, des **colonnes** comme des **forces posées** : un relevé
  est la même chose pour une marche et une pile posée (ADR 0024 §1). (01/11) Pour une colonne, c'est
  la branche `{ pierced: true, type, stack }` que `MovementIdentification` porte déjà
  (`src/domain/player-view.ts`) et que `src/data/serverView.ts` cloue aujourd'hui à
  `{ pierced: false }` ; pour un camp, `CampView` n'a pas encore cette branche et la reçoit.
  Jamais la nation (sauf au teneur de Lisbonne, P11, comme aujourd'hui). (Q10)
- **La composition suit la pile tant que la fenêtre de relevé est ouverte** (recrues, pertes,
  troupes qui partent), puis **se fige dans la dernière position connue**, qui garde ce qu'elle a
  lu en dernier. (01/11)
- L'invariant « Brouillard » tient : la composition est **écrite dans la ligne de relevé du
  joueur** (`sightings`, `campSightings`) à l'écriture, jamais lue sur une table de vérité ; une
  mutation qui change une pile relevée par un Guet réécrit ces lignes par `reassessDetection` avec
  `changed`.

### 6. Le Fort retient, il ne bloque pas

- Une colonne adverse va **plus lentement** sur la part de sa route qui passe dans le rayon de
  **vigie** du Fort (moitié du rayon de contrôle), pas dans son rayon de contrôle. (Q11, Q15) Un
  Fort ne retient donc que ce qu'il voit.
- **Il retient sur terre et sur mer, pas dans l'air** : un vol passe au-dessus. La part retenue se
  lit sur les tronçons de terre et de mer de la route, par le même échantillonnage que les
  liaisons (`relayedShare`). (01/11 ; voir « L'air sous une liaison »)
- **Elle le découvre en route** : son arrivée, chiffrée au départ sans le Fort, est rechiffrée
  quand elle entre dans le rayon, et une dépêche le lui dit. (Q11)
- **Le propriétaire reçoit une dépêche** quand son Fort retient une colonne. (Q15)
- Le Fort n'arrête rien, n'engage rien, ne rend aucune région imprenable : l'ADR 0020 §8 et
  l'ADR 0024 §3 tiennent. Ralentir n'est pas bloquer.

### 7. Changer de spécialisation, c'est un chantier

- Un avant-poste spécialisé en change par **un chantier** dans la file du QG, comme une élévation
  (`raiseOutpost`) : **la durée de sa dernière élévation** (130 min au niveau 2, 260 au niveau 3,
  avant l'accélération du QG, ADR 0031) et **la moitié de son acier** (65 ou 130). (Q13)
- **Pendant le chantier, l'effet de la spécialisation est coupé : le point agit en généraliste**
  (dépôt simple, vigie à mi-rayon, liaisons). Le dépôt d'un Magasin qui change garde son surplus
  au-delà de la capacité simple, et **rien n'y entre tant qu'il dépasse** : un changement de
  spécialisation ne doit rien brûler. (Q13, 01/11)
- **L'effet se coupe au départ du chantier, pas à sa mise en file** : une ligne en file est une
  promesse qui s'annule et se rembourse ; un Guet qui part en chantier guette à mi-rayon dès ce
  départ. (Pierre, 01/11)
- **Un point spécialisé capturé garde son métier chez le preneur**, comme son niveau et son dépôt ;
  un changement en cours est annulé et l'ancien métier reste ; les liaisons se recalculent, la
  ronde s'arrête. (Pierre, 01/11)
- **Le scellement disparaît** : `SPECIALIZATION_SEALED` et le blocage de `respecialize` partent ;
  `specializationLocked` est **renommé `serving`**, puisqu'il ne garde plus que le démantèlement
  (`outpostServed`, `convex/movement/forces.ts`). (Q13, #371)
- **Le démantèlement garde sa garde** : `OUTPOST_SERVING` reste, sur le critère d'aujourd'hui
  (un mouvement est passé dans le rayon depuis la fondation). (Q13)

### 8. Les liaisons : des rayons qui se touchent se relient d'eux-mêmes

- **Deux avant-postes d'un même joueur dont les rayons de contrôle se touchent** (distance ≤ somme
  des rayons), debout et non désactivés, **sont en liaison**, sans geste. (Q14) On dit
  **liaison**, jamais « route », qui est le chemin terrestre (`WWS/CONTEXT.md`, Tournée) ; et on
  ne dit pas « relié », qui nomme un bâtiment dont la région porte sa couleur. (01/11)
- **L'accélération du relais passe aux liaisons** : un mouvement du propriétaire va **÷1,5**
  (`RELAY_SPEED_MULTIPLIER`, `@a-mesurer`) sur la part de sa route qui passe **dans le rayon d'un
  avant-poste en liaison**, sur la terre et la mer, transbordements exceptés, jamais dans l'air
  (`relayedCostUnits` ; voir « L'air sous une liaison »). (Q6, Q14, Q16) La règle ne dépend pas de la forme du réseau : un point en liaison avec un seul
  voisin accélère autant qu'un nœud. Un point seul n'accélère rien.
- Chiffrée au départ, comme aujourd'hui (ADR 0018 §3).
- **Le dessin est épuré, la règle ne l'est pas** (Q16) : la carte trace les liaisons sans le
  côté long de chaque triangle (voisins les plus proches), pour ne pas tisser de toile ; la règle
  lit toutes les paires qui se touchent.

### 9. Le rendu : lavis au repos, trait gradué en main, un calque

Pierre : que ça se voie, « que ça ne pollue pas non plus la carte, mais que ce soit utile, joli et
très ergonomique ». (Q6, Q17)

- **Au repos**, les rayons de ses avant-postes se lisent en **lavis**, et les liaisons en trait
  d'encre fin.
- **Au survol et en main** (un avant-poste ou un ordre sous la main ; au toucher sur téléphone),
  le **cercle gradué** du rayon de contrôle et de la vigie, et le trait des liaisons plus net.
- **Un calque « zones et liaisons des avant-postes »** rejoint le menu « Calques de la carte »
  (`IndicatorCategory`, `src/domain/indicators.ts`) pour les montrer ou les cacher. « Liaisons »
  et non « routes », parce que le chip de route (#302) écrit déjà la longueur d'une route au sens
  du chemin. (01/11)
- Toute animation suit le réglage `actives / réduites / coupées` ; le dessin suit « Carte à la
  demande ».

### 10. Les rondes (second lot, même ADR)

Une **ronde** est une troupe qui tourne sur une liaison et y tient une **ligne de guet**. (Q7,
Q18 à Q22)

- **Elle ne bloque rien** (ADR 0020 §8). Toute colonne adverse **qui franchit la ligne est
  relevée**, où que soit la ronde sur son trajet, et une dépêche le dit. La ligne voit sur toute
  sa longueur. (Q18)
- **Seulement sur une liaison dessinée** (l'épure du §8) entre deux de ses avant-postes, jamais
  sur un segment libre ni sur une paire que la carte ne trace pas : la ronde se lit sur le trait,
  et une paire non dessinée n'a pas de trait. Pas de longueur maximale, le réseau la fixe. (Q19,
  01/11)
- **Une troupe terrestre de combat** (infanterie, blindé, artillerie), jamais un transport ;
  **une seule ronde par liaison** ; la troupe **garde son slot** tant qu'elle tourne, comme une
  tournée. (Q20)
- **Une halte d'une heure à chaque bout**, en garnison de l'avant-poste, où on peut l'attaquer :
  une colonne en marche ne s'attaque pas en Mondiale. L'ennemi qui l'a relevée connaît son trajet
  et peut viser ses haltes. `@a-mesurer` : 1 h. (Q21)
- **L'ennemi voit une colonne comme une autre**, relevée par ses seuls détecteurs ; il ne voit
  jamais la ligne de guet. (Q22)
- **La ronde dont la liaison tombe** (un bout capturé, désactivé ou démantelé, ou la liaison
  retirée du dessin par un nouveau point) **finit son étape et s'arrête au bout qu'elle atteint**,
  en garnison, avec une dépêche. C'est ce que fait une tournée à qui il ne reste plus d'arrêt
  (`stopsOf` puis `endTour(…, 'cut')`, `convex/tours.ts`) ; une ronde n'a que deux bouts, la
  perte d'un seul suffit. (01/11)
- La mécanique de la tournée se reprend (slot gardé, étapes en `march` avec `keepsSlot`, rappel,
  arrêt aux points perdus, `convex/tours.ts`), pas son contrat : ni consigne, ni livraison, ni
  `tourRefusalOf`, qui refuse tout ce qui n'est pas un transport.

### 11. La migration ne vide pas la pré-prod

(Q8) La spécialisation neuve vit dans un **champ neuf**, `v.optional`, lu `?? 'general'`. L'ancien
`specialization` passe en `v.optional` dans ses cinq validateurs (`outposts` et les dépêches
`outpostFounded`, `outpostDisabled`, `outpostStands`, `foundationLost`) ; le nouveau code ne le lit
ni ne l'écrit plus, et le littéral part au prochain vidage, sur le modèle de `regionId`
(`convex/schema.ts`). Si le vidage du socle de l'atlas (ADR 0034) passe avant, rien de tout cela
n'est utile.

Un point d'avant la refonte se lit généraliste. **Celui qui est déjà au niveau 2 ou 3 choisit sa
spécialisation une fois, sans chantier ni acier**, et agit en généraliste jusque-là : il a déjà
payé son élévation, et c'est le seul cas où un niveau 2 sans spécialisation existe. (01/11)
**Ce point ancien monte au niveau 3 sans choisir**, et le choix gratuit lui reste ouvert ensuite.
(Pierre, 01/11)

## Conséquences

- **Tout avant-poste voit.** Un réseau d'avant-postes devient un réseau de guet : la frontière se
  tient par la détection, comme l'ADR 0020 §8 le voulait. Le charbon devient le prix de cette vue
  (1 à 3 /h par point), et le joueur à court de charbon est aveugle partout d'un coup.
- **Le choix existe enfin, et il arrive tard** : au niveau 2, sur un point qui a déjà servi. Il se
  défait, au prix d'un chantier.
- **Le Guet ouvre une brèche voulue dans le brouillard** : pour la première fois, un relevé sert
  la composition. Le coût est serveur (ligne de relevé réécrite à chaque changement de pile
  observée) ; à mesurer au banc de fan-out.
- **Le Fort introduit le premier effet adverse d'une pièce sur la durée d'un mouvement.** Une
  arrivée chiffrée au départ peut désormais changer en route ; le rejeu, l'écran « cap sur moi »
  et le compte à rebours de l'attaquant doivent le suivre.
- **L'accélération se voit** : elle tient aux liaisons tracées sur la carte, plus à un choix caché
  dans une fiche.
- **Une ronde engage une troupe de combat et un slot** pour une ligne de guet ; ses haltes sont sa
  faiblesse, et l'adversaire qui la relève la lit.
- **Documents à reprendre**, chacun par le lot qui code la règle : fiche 03 (l.60-78), fiche 04
  (l.74), `CONTEXT.md` (Avant-poste, Palier d'entretien ; ajouter vigie, ronde, Guet, Fort),
  `decisions.md` (l.84, 92, 118), `QUESTIONS.md` (l.123), l'invariant « Brouillard » de
  `CLAUDE.md` (le Guet sert la composition), `fr.ts` (dont le refus `src/i18n/fr.ts:730`, qui dit
  « vos magasins » pour le stockage national et doit cesser de le dire), le grand livre
  (`src/domain/ledger.ts`), la fiche de stats (`src/domain/stat-sheet.ts`),
  `src/routes/-plateau/GarrisonPanel.tsx`, `src/domain/compass-works.ts` et les seeds de
  `convex/dev.ts` (dix `'relay'`).

## L'air sous une liaison (tranché le 01/11)

**Les liaisons n'accélèrent que la terre et la mer, jamais un vol** (Pierre, 01/11). Le relais
divisait tous les tronçons que compte `legCost`, air compris, et `pacedMinutes` chiffre aussi les
vols ; le §8 aurait gardé l'air quand le §6 le retire au Fort. `relayedCostUnits`
(`src/domain/route-timing.ts`) ne divise plus que les tronçons de terre et de mer : un vol garde
sa durée pleine. Registre :
`pierre-2026-11-01-liaisons-sans-air`.

## Ce qu'on abandonne

- **Le relais et l'écoute, deux métiers qui s'excluent** (ADR 0004 ; décision `2a-2026-08-25`).
- **L'avant-poste aveugle** : « la simple présence d'un avant-poste n'ajoute aucun bonus » (ADR
  0021 §1) ne vaut plus pour la vigie.
- **Le forfait d'1 charbon/h par écoute d'avant-poste**, pour 1 charbon/h par niveau sur tout point.
- **Le scellement de la spécialisation** et son code `SPECIALIZATION_SEALED`.
- **La spécialisation irréversible, choisie à la construction** (fiche 03).
- **L'abandon du relais par l'ADR 0028** : l'accélération revient, attachée aux liaisons.
- **Le relevé qui ne livre jamais la composition**, pour le seul Guet (ADR 0024 §1).
- **Une ronde qui intercepte ou qui bloque** : elle relève, rien de plus.
- **Une liaison tracée à la main**, et une ronde sur un segment libre.
- **La toile complète à l'écran** : la carte dessine les voisins, la règle lit toutes les paires.
- **Le débit de 10 munitions/min** du POC, et le ravitaillement instantané au passage.

## Options écartées

- **Élaguer la toile dans la règle** (sans le côté long de chaque triangle) : un nouveau point
  ferait perdre l'accélération à des trajets qui passaient par une liaison retirée.
- **Accélérer seulement le long de la liaison** (bande de quelques km autour du trait) : lisible
  en main, mais une route utile qui coupe le rayon à côté du trait ne gagnerait rien.
- **Le Fort au rayon de contrôle entier** : il couvre souvent la destination, la dépêche ne
  tombe qu'à l'arrivée, et il retient des colonnes que sa vigie ne voit pas.
- **Spécialiser à la fondation** : un point neuf n'a encore rien servi, et le choix se ferait à
  l'aveugle.
- **Un chantier de spécialisation distinct après l'élévation au niveau 2** : il ferait exister un
  niveau 2 généraliste à dessiner et à refuser.
- **Le charbon de la vigie pris au dépôt du point** : la vigie et la recharge se videraient
  ensemble.
- **Une migration en deux poussées** (élargir l'union, backfill, resserrer) : coûte deux
  déploiements pour un littéral qui part au prochain vidage.
