# ADR 0019 — Mouvement libre, troupes posées, et l'avant-poste qui ravitaille

> ⚠️ **Révision (01/11/2026, [ADR 0037](0037-un-avant-poste-qui-stocke-et-guette.md), non codée).** §4 précisé : le Magasin ravitaille aussi la colonne de son propriétaire qui traverse son rayon (2 munitions et 2 de pétrole par minute, relus à l'arrivée) ; la recharge des troupes posées ne change pas.

**Statut :** acceptée (18/08/2026). Remplace une première version du 0019 (« l'avant-poste ouvre
le terrain, il ne projette pas ») qui n'a jamais été acceptée et que cette décision rend sans
objet. **§5 et les conséquences de détection sont révisées le 08/09/2026 par
l'[ADR 0021](0021-portee-de-detection-et-postures.md). §3 et §6 révisés le 13/09/2026 par l'[ADR 0024](0024-engagement-intentionnel-et-forces-posees-visibles.md). §2 révisé le 04/09/2026 puis le 18/09/2026 — voir les deux bannières en fin de fiche —, et le 08/10/2026 par l'[ADR 0025](0025-capacite-encombrement-et-embarquement-de-proximite.md) : le port n'est plus la porte de l'embarquement.**

> **Révision S5b (09/09/2026).** Une expédition de pillage arrivée et victorieuse devient une
> présence durable de 2 h au point du site. Elle reste un mouvement : ses troupes et son slot
> sont donc indisponibles à un second ordre. Elle n'engage rien spontanément, mais riposte comme
> toute force qui tient un point. À l'échéance, encore de l'infanterie est nécessaire ; sinon les
> survivants repartent vides. La valeur de 2 h est un point de départ `@a-mesurer`, pas un temps
> équilibré. L'ordre public reste fermé jusqu'au lot S8.

## Contexte

Le modèle en place attachait chaque troupe à un bâtiment. `stationedAt` était *un rattachement,
jamais une position* ; une colonne partait d'une caserne ou d'un avant-poste, et ce qu'elle
pouvait demander dépendait de cette origine (`Column.origin`). La décision du 18/08 qui a fait de
la colonne fondatrice la garnison de son avant-poste a ouvert une cascade de questions — que peut
demander une garnison, vers où peut-elle se replier, comment le lui dire — dont aucune n'avait de
bonne réponse et dont la dernière, en partie, se manifestait comme une panne de clic droit.

Le symptôme a fait remonter la cause : **le rattachement à un bâtiment est un modèle plus
contraignant que ce que le jeu demande.** Il produisait une origine, donc des ordres légaux par
origine, donc un vocabulaire de repli, donc un écran muet quand rien n'était légal.

Trois modèles étaient en présence :

1. le rattachement (ce qui était codé) ;
2. le mouvement libre sans aucune contrainte — toute troupe part de partout vers partout ;
3. le mouvement libre borné par les **domaines** — libre sur terre, conditionné par un bâtiment
   pour entrer en mer ou dans les airs.

## Décision

**Le modèle 3, augmenté d'un coût d'entretien qui dépend de l'ancrage.**

### 1. Le mouvement est libre, la destination est un point

Une troupe se déplace d'où elle est vers un point de la carte, choisi par le joueur, jamais le
centre d'une région. Aucune origine ne restreint ce qu'elle peut demander. Un mouvement en cours
reste **irréversible** : c'est la thèse du jeu et cette décision ne l'entame pas.

Le point plutôt que la région n'ajoute aucune géométrie : la grille de routage travaille déjà en
raster (ADR 0012), l'avant-poste est déjà un point (ADR 0004), et l'interception est déjà une
intersection segment/cercle (ADR 0008). La règle générale devient lisible — **les points sont
pour ce qui bouge et ce qui se conteste, les régions pour ce qui produit.**

### 2. Les domaines restent des portes

Embarquer exige un port au départ, décoller exige un aérodrome. L'ADR 0013 est conservé là où il
paie : il reste la seule chose qui rende l'action lointaine structurellement coûteuse, et c'est
l'un des trois leviers listés contre l'avantage d'isolement géographique (`QUESTIONS.md`, 🔴). Le
mouvement terrestre, lui, ne demande plus rien.

> ⚠️ **Révision (27/08/2026) : la porte navale se lit à l'embarquement, jamais depuis l'eau.**
> « Embarquer exige un port » était juste et se lisait au mauvais moment : la porte était
> consultée à *chaque* ordre, y compris sur une pile déjà à flot. Conséquence, découverte en
> jouant : une flotte arrivée au large avait son adresse écrite sur l'eau, et on lui réclamait
> ensuite un quai qu'elle ne retrouverait jamais — des troupes que le jeu tient, place et
> nourrit, et qu'aucun ordre ne peut plus bouger. Un **mouvement fantôme**, pas une règle.
>
> La porte se lit désormais sur une pile **qui n'est pas encore à l'eau, ou qui emporte une
> aile** — l'air garde sa clause, parce que rien n'est jamais posté dans le ciel. La colonne
> combinée est exemptée comme les autres : le port a été payé au premier départ, quand les
> bottes ont quitté le sol pour l'eau, et le passage de l'ADR 0013 reste acheté là où il
> s'achète. Ce qui n'a pas bougé : `overloaded` compte les places à chaque ordre, donc la
> contrepartie du transport — une flotte qu'on construit, protège et peut perdre — tient
> toujours. Une pile qui n'est pas à flot est refusée exactement comme avant.
>
> « À flot » se lit sur le **point de départ** (`hostAtPoint` ne répond la chaîne vide qu'en
> haute mer) et n'est **jamais stocké** : ce serait une seconde vérité à tenir en phase avec
> `stationedAt`. Implémentée le 27/08 (`src/domain/movement-orders.ts`, `closedGate` et
> `embarking` ; `Column.afloat` rempli par `convex/movement/orders.ts` et par `plateau.tsx`).

> ⚠️ **Révision (09/09/2026) : « à flot » se lit sur la grille de routage, plus sur le polygone.**
> Deux géométries répondaient à une même question : la visée lisait « à terre » sur la grille
> (`onLand`, révision du 08/09), le départ lisait « à flot » sur le polygone (`hostAtPoint === ''`).
> Elles se contredisent sur toute bande côtière plus étroite qu'une demi-cellule (~14 km) : terre
> pour le polygone, mer pour la grille. Une coque envoyée là était acceptée — la cible n'est pas
> à terre — puis n'en repartait plus, ni à flot ni sur une plage : un quai réclamé à un point que
> Dijkstra tient pour de l'eau. Le mouvement fantôme, une troisième fois, par le rivage.
> `afloat` = `!landAtPoint(point)` désormais, des deux côtés du fil (`departureOf`, `view.ts` qui
> le sert avec l'adresse, `plateau.tsx` qui ne le déduit plus de `country`). `country` reste lu
> sur le polygone, pour la phrase seulement. La règle ne change pas, sa lecture si.

### 3. Une troupe peut rester sur la carte, et elle y défend son sol

> ⚠️ **Révision (13/09/2026, ADR 0024).** Une force posée **ne frappe plus ce qui s'arrête près
> d'elle** : une marche peut s'arrêter à moins de `ARRIVAL_RADIUS_KM` d'un camp adverse sans
> passe. Elle défend toujours — attaquée, elle riposte, initiative à l'attaquant (ADR 0014). Le
> rayon d'arrivée devient l'allonge d'un ordre d'attaque, plus un déclencheur.


**Amendé le 18/08/2026.** La première rédaction disait « une cible, jamais un attaquant » et
n'intercepte rien. C'était trop court : on aurait traversé une armée sans conséquence.

Une troupe posée **n'ordonne jamais rien** — aucun ordre ne part d'elle sans que le joueur le
donne — mais elle **défend le sol où elle se tient**. Un mouvement qui arrive à moins de
`ARRIVAL_RADIUS_KM` (25 km), ou dont la route y passe, la croise : une passe de résolution a lieu
et **l'initiative va au posé**. Il tient le terrain, l'arrivant est surpris — c'est ce qui
distingue une attaque, qui cherche le combat et en garde l'initiative (ADR 0014), d'une marche,
qui le subit.

**Trois précisions ratifiées le 18/08 au soir, la première amendée le 19/08.** Une force en
déroute dont l'adresse est un point **reflue vers son ancrage le plus proche** — le sol national
ou le rayon d'un de **ses** avant-postes, le même ensemble qui met l'entretien à ×1 et définit le
« sol reconnu » de la visée. Par le même `return` que toute déroute : créé par la résolution,
jamais ordonné, aucun slot (ADR 0018 §1, le terrain nettoyé) ; elle ne reste jamais posée à côté
de son vainqueur, et elle ne se téléporte jamais — le temps de trajet est réel aussi pour les
vaincus. L'avant-poste gagne ainsi son troisième rôle sans une règle de plus : il ouvre le
terrain, il nourrit, il **rallie**. Une colonne partie d'un bâtiment continue, elle, de rentrer à
son bâtiment. Conséquences assumées : un réseau d'avant-postes rend les défaites moins chères
(les survivants se regroupent en avant), et désactiver l'avant-poste de ralliement fait refluer
les déroutes suivantes beaucoup plus loin — deux paramètres que le simulateur refondu devra voir.
La **passe gagnée par le posé compte pour sa victoire lorsqu'un mouvement arrive sur son point** :
poser le campement était l'ordre — un slot, une troupe sur vingt-quatre, un entretien majoré — et
le défenseur y riposte par la règle d'arrivée existante. À distance, il observe seulement.

**Vingt-cinq kilomètres pour l'arrivée, indépendamment des portées de détection.** Le rayon
d'arrivée est une aiguille sur une carte mondiale ; la détection par rôle ne l'élargit pas et ne
la transforme pas en interception. `defenceOf` répond une seule fois au point visé.

### 4. L'entretien dépend de l'ancrage, et l'avant-poste ravitaille

`consommation-continue.md` (D1) pose un forfait d'entretien identique pour tous les rôles, et
(D3) qu'à sec **rien ne meurt** : la file de recrutement s'arrête. Une troupe posée au bout du
monde coûterait donc exactement ce que coûte une troupe restée chez soi, et ne mourrait jamais —
« à ses risques et périls » ne désignerait aucun risque, et vingt sentinelles gratuites videraient
le brouillard (ADR 0005) de son contenu.

L'entretien est donc **multiplié selon l'ancrage** :

| Où se tient la troupe | Entretien |
|---|---|
| Sur son territoire national | ×1 |
| Dans le rayon d'un de **ses** avant-postes (`outpostReachKm`, suivant leur niveau) | ×1 |
| Partout ailleurs | `UPKEEP_UNSUPPLIED_MULTIPLIER` |

Une constante et un multiplicateur : D1 tient, aucune table de neuf nombres. Rien ne meurt : D3
tient. **Un avant-poste allié ne ravitaille pas** — le ravitaillement deviendrait une monnaie
diplomatique avant que la diplomatie existe.

**L'avant-poste devient un point de ravitaillement avancé.** Il ne projette pas la force, il la
nourrit. **Désactivé, il ne ravitaille plus** (appliqué le 19/08) : c'est ce qui fait du raid le
moyen d'affamer l'armée qui campe dans le rayon — un point qui nourrirait hors service laisserait
au raid son seul sens économique. Il **rallie** en revanche même désactivé : ce qu'une
désactivation suspend, ce sont ses effets, jamais son adresse.

### 5. L'entretien et les portées passives

**`UPKEEP_UNSUPPLIED_MULTIPLIER` vaut 2.** Ce n'est pas une valeur mesurée — même statut que
les portées passives (ADR 0018 §5) : un point de départ délibérément léger, choisi pour que
la règle existe et se mesure plutôt que pour équilibrer quoi que ce soit. Le risque connu est
qu'à ×2 le surcoût se noie dans une économie où l'alliage est le goulot et la nourriture
abondante ; si la mesure le confirme, la valeur monte, la règle ne change pas.

**`DETECTION_RANGE_KM` porte maintenant une valeur par rôle.** Une troupe posée ou en mouvement
observe à la portée de son rôle ; une pile prend le maximum. Les neuf valeurs sont des placeholders
`@a-mesurer`. La portée ne dit jamais si une passe s'ouvre : une force posée n'intercepte pas, et
un mouvement n'engage que si son ordre est `attack` ou `raid` et que les deux mouvements occupent
le même milieu.

**Un avant-poste allié ne ravitaille pas.** Décision, pas placeholder ; elle se rouvre le jour où
l'alliance est un objet du jeu.

### 6. Une force posée ne se voit pas de loin

> ⚠️ **Révision (13/09/2026, ADR 0024) : ce paragraphe est renversé.** Une force posée **se voit
> dans la portée** de tout détecteur — position, milieu, heure — jamais sa composition ni sa
> nation. L'agent dormant garde le métier d'identifier, pas de repérer. « Sol non reconnu » tient.


`convex/view.ts` le dit déjà d'un avant-poste — *« an opponent's outpost is exactly the kind of
thing the fog exists to hide »*. Une troupe posée suit la même règle : **aucune détection à
distance**, ni par le rayon d'un territoire, ni par celui d'une autre force posée. Ce qui se voit
de loin, c'est ce qui **bouge** — un convoi fait du bruit, un campement non. Trois choses seules
révèlent une force posée : l'agent dormant, un mouvement qui la croise, et l'arrivée sur elle.

Cela préserve le métier de l'agent dormant, que n'importe quel fantassin doublerait autrement, et
avec lui les couples nation × doctrine adossés à Influence.

Le contrepoids, qui ne perce aucun brouillard : **la visée dit ce que le joueur ne sait pas.** Un
point hors de son sol et hors du rayon de ses avant-postes est signalé *sol non reconnu* — pas
« il y a un adversaire », et surtout pas la promesse qu'un sol reconnu serait sûr, puisqu'une
force posée est invisible partout, y compris chez soi. C'est de l'information sur son propre
niveau d'information, et c'est ce qui transforme un piège en pari assumé.

### 7. La marche

Le type de mouvement qui réalise le §1 et le §3 : aller à un point et y rester. Un slot
(ADR 0006), irréversible, mêmes portes de domaine que les autres, aucune cible refusée pour
appartenance — on marche sur son sol comme sur celui d'un autre. À l'arrivée sans contact, la
colonne se pose ; `stationedAt` reçoit le point.

## Justification

**Contre le modèle 1.** Il produisait une règle par origine, un ordre de repli au vocabulaire
trompeur, et un écran muet — trois problèmes dont aucun n'existe dans le jeu, tous créés par le
modèle de données. Il fallait trois correctifs pour rendre lisible une contrainte dont personne
n'avait établi qu'elle servait le jeu.

**Contre le modèle 2.** Un naval qui part de n'importe où retire le seul coût structurel de
l'action lointaine, au moment précis où le remplacement n'est pas trouvé. Le 🔴 empirerait.

**Pourquoi l'entretien par ancrage plutôt qu'une attrition.** L'attrition tue, et la règle n°3 du
projet interdit d'éliminer un joueur. Un surcoût d'entretien punit sans supprimer, se voit
immédiatement, et se répare en rentrant ou en fondant un avant-poste. Il transforme la distance en
**coût continu** là où elle n'était qu'un temps de trajet payé une fois — ce qui prolonge
exactement le levier que la simulation a mesuré comme central (14 min / 1 000 km).

**Ce que la décision fait gagner au raid.** Jusqu'ici on désactivait un avant-poste pour couper une
exploitation : une cible économique sous un vocabulaire militaire. Il devient possible de le
désactiver pour **affamer l'armée qui campe dans son rayon**. La promesse et la règle se
rejoignent.

## Conséquences

- **Suppressions.** `Column.origin` (`src/domain/movement-orders.ts:31`), l'ordre `recall`, le
  type de mouvement `outpost` (fonder devient une action d'une colonne déjà arrivée), la décision
  12a de `flux-mouvement-en-carte.md`, l'exception `except: aim.outpostId` de l'ADR 0018 §3. Ce
  chantier retire plus de code qu'il n'en ajoute.
- **`stationedAt` devient une adresse à trois formes** : un bâtiment, un avant-poste, ou un point.
  Jamais deux, jamais aucune hors mouvement — l'invariant posé par `garnison-adresse.md` survit
  tel quel, et le champ reste unique pour la raison que le schéma donne déjà.
- **Le widget de troupes perd son regroupement par bâtiment.** Une troupe n'a plus de bâtiment
  pour adresse ; le regroupement est à maquetter.
- **Le repérage est un système nouveau, et le seul.** Une troupe posée ou en mouvement voit ce
  qui passe dans la portée maximale de ses rôles : un fil, un cap, un domaine — jamais le type ni la composition, ce que la
  fiche 04 accorde déjà à un mouvement détecté non identifié. L'agent dormant garde la portée,
  l'identification et la discrétion ; sans cet écart, six couples nation × doctrine adossés à
  Influence tomberaient avec lui.
- **Le relevé suit les événements du plateau.** Poser, déplacer ou retirer un détecteur, changer
  sa composition ou son état, partir et arriver recalculent les fenêtres futures concernées. Une
  fenêtre déjà ouverte reste une dernière position connue ; une fenêtre future devenue impossible
  est annulée avant d'être révélée.
- **Le plafond de troupes devient le seul frein à la dispersion.** Chaque sentinelle est une
  troupe qui ne combat pas, sur vingt-quatre. L'arbitrage est bon ; il n'est pas mesuré.
- **Fiches à reprendre** : 03 (l'avant-poste gagne le ravitaillement), 04 (quatrième source de
  détection), et `flux-mouvement-en-carte.md` dont la décision 12a est annulée.

## Ce qu'on abandonne

L'idée qu'une troupe a toujours une maison. Avec elle, la lecture immédiate d'une armée rangée par
bâtiment, et la garantie qu'aucune force ne traîne quelque part sans que le joueur s'en souvienne.
Ce qui la remplace est un coût qui rappelle sa présence : une troupe oubliée au bout du monde se
paie en nourriture jusqu'à ce que la file de recrutement s'arrête.

Réversible en partie seulement. Rétablir une origine contrainte après avoir laissé les joueurs
poser des troupes partout serait vécu comme un retrait, pas comme un correctif — c'est le genre de
décision qu'on prend avant la première saison test, et cet ADR est écrit pour être relu à ce
moment-là.

## Révision du 04/09 — les navires ne roulent pas

> ⚠️ **Révision (04/09/2026, décision 72a), elle-même révisée le 18/09 (ci-dessous).** Une
> colonne embarquée (terre + mer) **ne vise qu'un point de côte, un avant-poste côtier ou un port
> ami** : sa route finit à la côte, et à l'arrivée coques et passagers sont posés au même point
> (§1 inchangé — une seule adresse, sinon rien ne se recompose). Le débarquement est une
> opération : choisir la plage, puis marcher. **§2, la porte de départ, s'assouplit d'un cas** :
> une coque part d'un port, d'un point en mer, ou d'un point de côte où elle se tient — elle y
> est arrivée par la mer. Un port ne se fabrique pas ailleurs : une coque posée à l'intérieur des
> terres reste sans départ. Même jour, 64b codée : entrer en garnison est une marche visant un
> bâtiment à soi.
>
> **Ce que le 18/09 en retire** : la première phrase. Le large rejoint les destinations d'une
> colonne embarquée. Le reste tient mot pour mot — l'adresse unique à l'arrivée, le débarquement
> qui se vise, la porte de départ et ses trois cas.

## Révision du 18/09 — rester en mer

> ⚠️ **Révision (18/09/2026, décision de Pierre).** « Un cargo peut rester en mer avec des unités
> dedans. » Une colonne embarquée (terre + mer) peut **viser un point de mer** ; elle y arrive,
> elle y reste, passagers à bord. Le débarquement demeure une opération à part — viser une côte,
> depuis la mer comme depuis la terre — et **l'intérieur des terres reste refusé** à une colonne
> embarquée, pour la raison d'origine : la jambe terrestre après la mer n'existe toujours pas
> (ADR 0012, même bannière).

Ce que le 04/09 avait fermé sans le dire : une flotte pouvait mouiller au large, une colonne
embarquée non. La mer était un couloir pour les troupes et un domicile pour les coques seules, et
la différence ne tenait à rien d'autre qu'au refus `LANDING_NEEDS_A_COAST` lu sur une cible d'eau.
Or rester au large est une **position**, au sens du §1 : entre deux rives, à cheval sur deux
débarquements possibles, hors de tout ravitaillement. C'est le seul endroit du jeu où une force
est à la fois menaçante et sans ancrage.

Six conséquences, et une seule est nouvelle comme règle :

1. **Viser la mer.** Pour une colonne embarquée, un point d'eau est légal ; une côte l'est
   (inchangé) ; tout le reste refuse `LANDING_NEEDS_A_COAST` (inchangé). Les deux modes de mer —
   naval et combiné — lisent désormais le même sol, à la phrase de refus près.
   **Un camp relevé porte son milieu** avec lui depuis ce lot (`onLand`, `coastal`) : une pile
   mouillée en mer était une cible qu'aucune flotte ne pouvait viser, donc le §4 de l'ADR 0024
   n'avait aucune passe où s'appliquer au large.
2. **Arriver en mer.** Coques et passagers au même point (§1, une seule adresse) ; être à bord
   reste un état **calculé** (`StackRow.carrier`) — aucun champ nouveau, aucune migration. `afloat`
   vaut vrai pour la pile, et sa garnison se lit au panneau comme à terre.
3. **Repartir de la mer.** Par sa coque (§2 : une coque part d'un point en mer), vers une côte ou
   vers une autre eau. Une pile en mer **sans coque** ne part pas : `NO_HULL_AT_SEA`, un refus
   nommé plutôt qu'un `NO_LAND_ROUTE` qui parlerait d'une route que personne ne cherchait. C'est
   le *mouvement fantôme* pris de front une quatrième fois — mais **dit**, cette fois, faute de
   pouvoir être empêché : un joueur qui fait partir sa coque seule laisse ses passagers à l'eau,
   et il le lit.
4. **Coulés avec la coque** *(la règle neuve)*. Après toute passe de résolution à un point de mer,
   les troupes terrestres que la capacité d'emport des coques **debout** ne couvre plus sont
   **détruites** — pas déroutées : il n'y a rien où se replier. Une coque **déroutée** emporte ses
   passagers dans son repli, à sa capacité ; l'excédent coule. Le siège est celui du panneau de
   garnison (`stackRows`), pas une seconde arithmétique de places : la place qu'on voit au départ
   est la place qui sauve à l'arrivée. Dépêche `drownedAtSea` chez le seul propriétaire, en hommes
   et en machines, la place nommée en degrés. C'est le prix de rester au large, et la première
   raison mécanique de construire une escorte.
5. **Vivre en mer.** Aucun ravitaillement : l'entretien joue à `UPKEEP_UNSUPPLIED_MULTIPLIER`, et
   ce n'était **pas** déjà le cas — un rayon d'avant-poste est un disque, donc un point côtier
   couvrait l'eau devant lui et une flotte mouillée là mangeait au tarif domestique. La géométrie
   répondait à une question que personne n'avait posée. Le ravitaillement en mer par un port ami
   à portée reste ouvert (`QUESTIONS.md` 🟡). Fonder est refusé (`NO_FOUNDING_AT_SEA`) : le large
   passait *parce que* le sol de personne satisfaisait la seule condition que la fondation posait.
6. **Ce qu'on voit.** Un camp en mer se relève par son milieu (ADR 0024 §1) : silhouette de coque,
   et rien de la cargaison. **Un cargo vide et un cargo plein sont indiscernables du dehors** —
   c'est le gain de leurre que l'ADR 0014 annonçait (« en mer, on voit le navire, pas la
   cargaison »), et il devient réel avec ce lot, parce qu'il y a enfin une raison de laisser un
   transport mouillé quelque part.

**Ce que la décision achète**, et ce n'est pas une commodité : une menace sans adresse. Une flotte
chargée au large ne dit pas sur quelle rive elle débarquera, elle coûte le tarif majoré tant
qu'elle attend, et elle coule entière si personne ne l'escorte. Le débarquement cesse d'être un
aller simple calculé d'un quai à une plage pour devenir une opération en deux temps dont le
second se décide en mer.

**Hors périmètre, et nommé pour ne pas dériver** : le combat air–mer, l'abordage, le sauvetage des
naufragés.
