# ADR 0041 — La récolte se rapporte

**Statut :** acceptée (12/11/2026). Retour de Pierre du 11/11 (« un système comme à la Age of
Empires, de rapporter les ressources à un bâtiment spécifique pour vraiment avoir la ressource »),
trois systèmes comparés (tournée de ramassage, rayons de ramassage, un transport par
exploitation), puis ses réponses : tout se rapporte, sol national compris (b) ; la production
s'entasse au pied de chaque exploitation (b) ; les huit recommandations (« Oui pour tes recos ») ;
les exploitations de fondation rapportent seules (« Oui, le socle rapporte »). Une mesure du
11/11 sur les gisements de départ a remplacé la porte de 150 km autour du QG par ce dernier
point, et « Le niveau 1 seul » (12/11) en a fixé le débit (§3). **Mondiale seule.**

**Révise** ADR 0028 §4 (un transport ne porte ni vivres ni acier ; la récolte n'est plus un
débit national lissé) et le glossaire (**Tournée**).

## Contexte

Aujourd'hui, la récolte n'a pas de trajet. Chaque exploitation verse `EXTRACTION_PER_HOUR` ×
niveau × part (`extractionSites`, `convex/resources.ts`) dans un **taux net national** unique
(`economyOf`), intégré paresseusement. Un transport ne sert qu'à porter munitions, pétrole et
charbon (`SUPPLY_KEYS`, `src/domain/logistics.ts`) de son point de chargement vers des dépôts
d'avant-poste, à la main ou en tournée (`convex/tours.ts`). Chez soi, aucune pièce n'a de raison
de rouler.

L'envie de Pierre : que les transports terrestres, maritimes et aériens servent vraiment, avec
un petit aspect gestion, sans complication. La boussole tient le cadre : un plateau qu'on manipule
à la main, et ce qu'on engage ne revient pas vite.

La mesure du 11/11 (relevé `enq-iles`, Dijkstra du jeu depuis la capitale de 1940) :

- le QG n'est pas planté, le joueur le pose où il veut sur son sol (`endow`, `convex/seasons.ts`) ;
- on part sans transport, sans port ni aérodrome, avec 400 acier et 90 pétrole, un QG et **une
  exploitation de fondation par type de gisement du pays** (`foundationFor`,
  `convex/constants.ts`), posées gratuitement sur le gisement de son choix ;
- seul le charbon italien n'existe que hors route : son seul gisement est en Sardaigne ;
- aux USA, en URSS et en Chine, presque tout est à 1 500–2 500 km de la capitale : une porte de
  150 km autour du QG ne servait vraiment que la France et le Royaume-Uni.

## Décision

### 1. Le tas

Une exploitation verse sa production dans son **tas**, au pied du bâtiment, au même débit et à la
même part qu'aujourd'hui (`outputShareOf` : reliée, coupée, Narvik). Le tas porte la seule
ressource du gisement. Il plafonne à **24 h de production** du bâtiment (`@a-mesurer`) ; plein,
l'exploitation s'arrête, et rien de ce qui est au tas ne se perd. Un tas n'entre au stock
national qu'**une fois rapporté**.

Le tas se règle (intégration paresseuse, comme le stock) à chaque prise, à chaque élévation et
dans `settleBeforeChange` avant un changement de couleur. Il n'est jamais servi à l'adversaire.

### 2. La tournée de ramassage

La tournée existante gagne un second genre d'arrêt : **l'exploitation**, où le transport prend le
tas dans la limite de sa capacité. Revenu à son point de chargement, il verse au stock national,
dans la place libre de l'entrepôt (`creditToStorage`). Une même tournée peut livrer des dépôts et
ramasser : un arrêt donne ou prend, et la consigne ne vaut que pour ce qui se donne. Quatre
arrêts au plus, comme aujourd'hui (`TOUR_MAX_STOPS`).

- **Terre d'abord.** Le camion (40 acier, 12 pétrole) se charge au QG : c'est la première
  tournée de toute partie, payée par le kit de départ.
- **La mer.** Le cargo s'arrête à une exploitation dont la région a un quai (`quayOfRegion`). Il
  porte quatre fois plus et brûle du charbon.
- **L'air.** L'avion va chercher les tas d'une enclave ou d'une île sans quai, peu à la fois.

Un transport porte désormais les **cinq ressources** : sa récolte voyage à part de son ravitaillement,
sous la même capacité, et un dépôt d'avant-poste ne reçoit jamais de vivres ni d'acier. **Rien ne se
perd** : ce que l'entrepôt ne prend pas au retour reste à bord, et la récolte d'un transport qui
ne rentre pas en tournée se verse à son prochain retour.
Chaque étape reste un mouvement : un arc sans type, relevable et interceptable (ADR 0021, 0024).
Un transport détruit laisse une caisse chargée de ce qu'il ramassait.

### 3. Les exploitations de fondation rapportent seules

Une exploitation posée comme **pose de fondation offerte** verse directement au stock national,
où qu'elle soit, tant qu'elle est reliée. Elle garantit à chaque pays un revenu de chaque
ressource qu'il possède dès la première heure, Sardaigne comprise, sans transport. Toute autre
exploitation se ramasse.

Le bâtiment porte cette marque depuis sa pose. Rasée, capturée ou perdue, l'exploitation la perd ;
la reconstruire ne la rend pas (la fondation ne se renouvelle pas, `settledFoundation`).

**Le niveau 1 seul** (Pierre, 12/11) : une exploitation de fondation verse seule le débit d'un
niveau 1 ; le surplus de ses niveaux va à son tas, et se ramasse. Sinon, élever les quatre
exploitations de fondation sans fin dispenserait de tout transport, puisque le débit croît avec
le niveau sans plafond (`EXTRACTION_PER_HOUR` × niveau).

### 4. Les règles de bord

- **Blitz** : exemptée. La production verse au stock comme aujourd'hui ; les tournées y restent
  refusées.
- **Pillage** : le raid sur une exploitation emporte son tas, sans plancher épargné, dans la
  place de la colonne (`raidLoots`, `src/domain/loot.ts`, qui n'en donnait rien).
- **À sec**, un camion ou un cargo en tournée **roule au pas** : deux fois plus lent
  (`@a-mesurer`), sans coût. C'est une pénurie qui casse une règle (ADR 0028 §1), jamais un arrêt.
  Un avion à sec reste au sol. Un transport qui s'arrête à un tas de la ressource de son moteur
  (pétrole pour le camion et l'avion, charbon pour le cargo) y fait son plein avant de charger.
- **Atout américain** : la question posée le 11/11 (« vos ravitaillements ne sont jamais relevés »)
  est sans objet. Cet atout de l'ADR 0028 a été remplacé par le Prêt-bail (ADR 0039,
  `src/domain/nation-assets.ts`), qui ne touche pas le ramassage.
- **Mise en service** : les tas naissent vides, et une dépêche dit la nouvelle règle.

## Conséquences

- **Schéma** : un tas par bâtiment et son heure de règlement, en `v.optional` lu à vide ; la
  marque de fondation, en `v.optional` (absente : ramassée). Aucune migration de données : les
  exploitations déjà posées en pré-prod n'ont pas la marque. La dépêche de mise en service le dit.
- **Une règle, une fonction** : le refus d'un arrêt de ramassage (`tourRefusalOf`) et le versement
  sortent du domaine, lus par l'interface et le serveur.
- **Le plateau personnel** montre les tas qui débordent, sans job : c'est une lecture paresseuse.
  La carte montre le tas au pied de l'exploitation, à soi seul.
- **Coût serveur** : un job par étape, comme les tournées actuelles ; rien de global.
- **Premiers pas** : le cinquième geste (charger un transport et le livrer) peut devenir une
  tournée de ramassage ; à juger au lot de l'écran.
- **`CONTEXT.md`** gagne **Tas** et **Exploitation de fondation**, et **Tournée** gagne l'arrêt
  de ramassage.

## Ce qu'on abandonne

- **La récolte nationale lissée** : un débit continu remplacé par des arrivées datées, sauf pour
  les exploitations de fondation et en Blitz.
- **« Un transport ne prend ni vivres ni acier »** (ADR 0028 §4).
- **La porte du QG** (150 km), recommandée le 11/11 puis remplacée par le §3 : elle laissait
  l'Italie sans charbon et ne servait pas les grands pays.
- **Le rattachement** (un transport par exploitation) et **les rayons de ramassage** (un entrepôt
  qui rapporte seul autour de lui) : le premier fait trente navettes là où la tournée en fait sept,
  le second laisse les transports hors de l'économie.

Le ravitaillement des troupes sur le sol national ne change pas : elles se rechargent au stock
national (`toppedUp`, `convex/supplies.ts`).
