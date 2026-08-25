# 02 — Économie et bâtiments

**Statut : réécrite le 15/08/2026 depuis l'[ADR 0015](../adr/0015-economie-v2-ressources-localisees.md).**
La version précédente — ravitaillement, acier, effectifs, cinq bâtiments nationaux — n'existe plus.
L'ADR fait autorité ; cette fiche l'explique. Tous les chiffres sont des placeholders à simuler.

## Le critère qui a tout coupé

**Une ressource n'existe que si elle crée une décision différente.** Sinon c'est de la
comptabilité. Le jeu tourne à environ 1,2 décision par joueur et par heure — chiffre mesuré :
chaque ligne d'inventaire se paie en attention.

C'est ce critère qui a supprimé la chaîne de l'électricité (charbon → électricité → bâtiments
n'offrait aucun choix, seulement une étape) et fondu quatre bâtiments dans d'autres.

## Les huit ressources

**Sur la carte**, en gisements par région, à exploiter :

| Ressource | Ce qu'elle décide |
|---|---|
| **nourriture** | exister — entretien permanent des troupes |
| **tissus** | l'amont des bandages |
| **charbon** | produire — la fonderie et l'industrie le brûlent |
| **pétrole** | se déplacer — unités motorisées seulement |
| **minerais** | l'amont de tout le métal |

**Transformées**, une étape de filière, jamais deux :

| Ressource | Filière | Ce qu'elle décide |
|---|---|---|
| **alliage** | minerais + charbon | ce qu'on produit avec une industrie limitée |
| **munitions** | alliage | se battre — consommées au combat |
| **bandages** | tissus | se remettre — récupération après combat |

**Le duo pétrole / charbon est le pivot stratégique voulu.** Bombarder les stocks de pétrole
cloue les blindés adverses au sol. C'est une cible qui raconte quelque chose, contrairement à
un entrepôt générique.

**Types réels et types décoratifs.** La Gironde produit « du vin » à l'étiquette et de la
*nourriture* dans le stock. Blé, porc, avoine, soie, obus : décor régional, texte, art. Le stock
ne connaît que les huit types ci-dessus.

**Les hommes ne sont pas une ressource.** Pas de stock d'effectifs : une troupe coûte des
matières. En revanche l'armée a un **plafond d'hommes**, porté par les casernements. Le plafond
reste la contrainte d'équilibrage centrale — c'est lui qui rend un engagement coûteux, et donc
qui rend la couche information rentable. Si les pertes ne comptent pas, savoir ce qui arrive ne
vaut rien.

## Les gisements

Un gisement est **attaché à une région**, au plus un par région, et il ne se déplace jamais.
La distribution est générée hors ligne par `scripts/generate-deposits.mjs`, cuite dans
`public/deposits.json`, et **jamais retouchée à la main**.

Elle suit une logique **réaliste corrigée** : le monde réel d'abord — bassins houillers, champs
pétroliers, terres arables, districts textiles — puis une passe de correction explicite dont
chaque entrée porte sa source. Quatre garde-fous exécutables la tiennent, détaillés dans l'ADR
0015 : un manque volontaire par nation (exceptionnable sur déclaration), une bande de 2× sur les
totaux, aucun profil plat, aucune nation au plafond partout.

**La géographie fait désormais partie de l'identité nationale** : voir [06 — Nations](06-nations.md)
pour l'excédent et le manque de chacune. Six nations sur huit manquent de pétrole, et c'est
délibéré — il devient le motif universel de sortir de chez soi, et chaque nation a sa façon
d'aller le chercher.

## Le parc de quinze bâtiments

Règle de lecture : **un bâtiment, une idée**. Le bâtiment qui ouvre un domaine fabrique aussi ses
unités — la production est localisée, donc ciblable.

| Famille | Bâtiment | Rôle |
|---|---|---|
| Commandement | **Quartier général** | unique, **posé au lancement** sur la région de la capitale ; plafonne le niveau des autres, porte les **slots de mouvement** et la **recherche** |
| Exploitation | **Ferme** | nourriture |
| | **Filature** | tissus |
| | **Mine** | charbon *ou* minerais, selon le gisement de la région |
| | **Puits de pétrole** | pétrole |
| Transformation | **Fonderie** | minerais + charbon → alliage |
| | **Arsenal** | alliage → munitions |
| | **Intendance** | tissus → bandages |
| Projection | **Caserne** | ouvre le terrestre ; forme infanterie et véhicules |
| | **Aérodrome** | ouvre l'aérien ; assemble les avions |
| | **Port** | ouvre le maritime ; construit les navires (région côtière) |
| Renseignement | **Station d'écoute** | détection passive ; contre-espionnage actif |
| Plafond | **Casernements** | relève le plafond d'hommes de l'armée |
| Stockage | **Entrepôt** | matières et alliage — se **pille** |
| | **Dépôt** | pétrole et munitions — **explose**. Le raid spectaculaire |

**Les deux stockages se distinguent par leur mort** : l'entrepôt se vole, le dépôt saute. C'est
la seule différence qui compte, et elle suffit à en faire deux bâtiments plutôt qu'un.

**L'écran de construction reste digeste parce qu'il est contextuel** : une région à charbon ne
propose que la mine, une région côtière ajoute le port, le reste n'apparaît pas. Règle de la rose
des vents : rien de grisé, jamais.

### Ce qui a disparu, et pourquoi

Le **complexe industriel** est dissous dans la fonderie et les bâtiments de projection. Le
**centre logistique** aussi : ses effets deviennent les *niveaux* des bâtiments de projection (un
port de niveau 2 embarque plus vite), et ses slots remontent au QG. La **conscription** devient
les casernements. Le **centre de recherche** un temps envisagé est fondu dans le QG — pas de
bâtiment dédié, pas d'arbre géant.

## Un seul bâtiment existe au lancement

Un bâtiment se construit sur une région, ou il n'existe pas — il n'y a plus de « niveau 1 par
défaut ». **Le quartier général est la seule exception** : il est posé au niveau 1 sur la région
de la capitale nationale, parce qu'une nation a une capitale et ne la construit pas.

Sans cette exception, le QG étant à zéro et plafonnant tous les autres bâtiments, le premier
chantier de chaque saison serait forcément le QG — une règle émergente, que rien n'écrivait et
que le kit de départ ne payait pas. Elle est maintenant explicite.

Le QG a donc une **adresse connue de tous**. Frapper la capitale adverse, c'est frapper son
commandement, ses slots et sa recherche.

## Une bâtisse par région

**Une région ne porte qu'un seul bâtiment.** C'est ce qui fait du territoire une ressource :
chaque pose coûte une alternative, l'économie s'étale au lieu de tenir sur un point, et elle
devient donc raidable en plusieurs endroits.

Effet qu'on n'a pas eu à écrire : un gisement occupe déjà sa région, donc **la mine et la fonderie
ne peuvent pas cohabiter**. L'extraction et la transformation se séparent d'elles-mêmes sur la
carte, et une géographie logistique interne apparaît sans qu'aucun convoi n'existe.

**C'est une règle de placement, pas un plafond.** Le nombre de bâtiments qu'un joueur peut
posséder est **global et indexé sur le QG**, et il reste strictement sous 16 — le compte de
régions de la plus petite nation jouable. Sinon le découpage de Natural Earth deviendrait un
équilibrage : 232 régions pour le Royaume-Uni, 16 pour l'Allemagne, un écart de 14,5× qui ne dit
rien des deux pays et tout de la façon dont un cartographe a tracé ses lignes.

> **La règle générale, valable partout : aucune quantité de jeu ne se compte en régions.
> Le quartier général est l'unique étranglement.** Une région est un lieu, jamais un compteur.

### Un seul nombre borne toute la saison

Puisque le QG est l'unique étranglement, **son niveau maximal plafonne tout** : six slots de
mouvement, niveau cinq pour n'importe quel autre bâtiment, treize bâtiments en tout. C'est
cohérent, et c'est aussi la raison de s'en méfier — une seule constante décide de l'ampleur d'une
saison entière. Elle appartient au simulateur, pas à l'intuition.

Le plafond règle l'**ampleur**, pas la **marge de manœuvre** : treize bâtiments à poser dans les
101 régions françaises est un choix, treize dans les seize régions allemandes n'en est presque
plus un. À mesurer avant la première saison.

## Un chantier à la fois

Un joueur ne mène **qu'un chantier à la fois**, dans tout son empire. La tentation d'en autoriser
un par région est tuée par le découpage administratif : 9 régions pour la Bolivie, 51 pour les
États-Unis, 101 pour la France, 232 pour le Royaume-Uni. Ce serait un multiplicateur variant d'un
ordre de grandeur selon la nation — un déséquilibre offert par Natural Earth, pas par le design.

Le jour où ce plafond serrera trop, le régulateur sera un **plafond global indexé sur le QG**,
comme les slots de mouvement. Jamais un compteur par région.


> ⚠️ **Révision (25/08/2026)** : la règle vaut désormais pour l'**exécution** seulement — une
> file d'attente **prépayée** s'ajoute derrière le chantier en cours (paiement intégral à la
> mise en file, remboursement intégral d'un non-commencé, re-vérification des droits au
> démarrage de chaque tête). Voir la note du même jour dans l'ADR 0015 ; le modèle est celui
> de la file de recrutement.

## Placement et expansion

- **Chez soi** : un bâtiment se pose librement sur n'importe quelle région de sa nation.
- **Ailleurs** : il faut un **avant-poste**, qui ne peut être fondé que par de l'infanterie MK1 ou
  MK2 — l'infanterie gagne un rôle hors combat. Une fois fondé, il ouvre un rayon de quelques
  régions où l'on peut bâtir.

**La boucle d'expansion** : repérer un gisement, envoyer l'infanterie fonder, bâtir la mine ou le
puits dans le rayon, défendre la ligne. Et recommencer plus loin.

## Stocks, plafonds et acheminement

Les stocks sont **plafonnés bas** par défaut. L'entrepôt et le dépôt relèvent le plafond, chacun
sur sa moitié. L'entrepôt devient donc vite nécessaire — donc vite une cible, ce qui est le but.

**L'acheminement est automatique** : une exploitation verse au stock national. Les convois
interceptables restent une extension possible, non gravée : on ne paie pas leur complexité avant
d'avoir mesuré le besoin.

## Accumulation et transformation paresseuses

On stocke `stock` et `updatedAt`, on calcule au moment de la lecture. Pas de boucle de jeu, pas de
cron d'accumulation — c'est ce qui rend le format asynchrone quasi gratuit à opérer.

**La transformation suit le même régime.** À chaque lecture, le temps écoulé convertit ce que les
intrants permettent, borné par le niveau du bâtiment. Pas de file, pas d'ordre du joueur :
*construire la fonderie est la décision*. Le débit, lui, n'est plus stocké — il se recalcule
depuis les bâtiments d'exploitation du joueur et les gisements de leurs régions.

Attention : cela vaut pour **l'accumulation et la conversion seulement**. Les résolutions datées —
arrivée d'un mouvement, fin de chantier, fin d'embargo — ont besoin du scheduler.
Cf. [technique/architecture.md](../technique/architecture.md).

## Les slots de mouvement

`slots = 1 + niveau du quartier général`

**C'est la ressource la plus rare du jeu, et le régulateur central du design.** Attaquer,
ravitailler, raider, feinter et poser un agent puisent tous dans le même stock. Depuis l'ADR 0015,
ils sont portés par le QG et non plus par le centre logistique, qui n'existe plus.

Trois problèmes réglés d'un coup :

- **Le spam de leurres.** Sans slots, un mouvement vide coûte presque zéro : espionnage noyé sous
  le bruit, et facture serveur qui explose. Avec slots, feinter se paie en attaques qu'on ne
  lancera pas.
- **L'arbitrage permanent.** Chaque envoi se fait au détriment d'un autre. C'est la décision que
  le joueur prend le plus souvent dans la journée.
- **Le plafond de charge serveur.** Le nombre de mouvements en cours est borné par construction.

Cf. [ADR 0006](../adr/0006-slots-de-mouvement.md).

## Le kit de départ

Assez pour se **déployer**, pas pour s'installer : de quoi bâtir une caserne, une ferme et une
filature, plus une avance offerte d'alliage et de munitions pour former les premières troupes
légères. Le reste s'exploite.

## Ce qui reste ouvert

- **Tous les taux.** Débits d'exploitation, coûts de transformation, entretien par rôle : à
  chiffrer, puis à passer au simulateur refondu. Le rapport de simulation existant, calibré sur
  trois ressources, ne vaut plus une ligne.
- **Le bandeau ne peut pas montrer huit stocks.** L'affichage devra hiérarchiser — question UI
  ouverte, à trancher avec la surface 4.5.
- **La nourriture est-elle encore contraignante ?** La distribution finale place tout le monde
  entre 2 et 6 gisements de nourriture à domicile. Si personne n'en manque jamais, la pression
  d'entretien disparaît et il ne reste que le plafond d'hommes pour freiner les armées. À
  surveiller dès la première campagne de simulation.
