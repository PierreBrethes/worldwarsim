# Vocabulaire du domaine

Ces termes ont un sens précis dans le projet. Les utiliser tels quels dans le code, les docs et les
conversations — y compris avec une IA, qui navigue beaucoup mieux dans un domaine nommé.

## Entités

| Terme | Définition |
|---|---|
| **Saison** | Une partie complète, de la création au wipe. Elle se joue dans un **mode**. |
| **Mode** | La façon dont une saison se joue, sur le même support (carte, unités, brouillard) : **Blitz** ou **Mondiale**. Les deux modes partagent la capture et le combat ; ils diffèrent par l'économie, la victoire et l'horloge. *(décision du 14/10/2026)* |
| **Blitz** | Le mode court : 1 à 2 h, 2 à 4 joueurs présents ensemble, sur un théâtre. Une seule ressource, les fonds ; on ne bâtit rien, on capture. Gagne qui prend le QG adverse. Jamais « partie en temps réel » : c'est une partie **synchrone**. |
| **Mondiale** | Le mode long : 3 à 14 jours réglés au salon, asynchrone, sur le monde entier. On bâtit, on élève, on capture ; on gagne par les points stratégiques ou par les QG. |
| **Théâtre** | La portion de carte où se joue une Blitz (Europe, Pacifique…), tirée ou choisie au salon. |
| **Compte** | Identité durable : pseudo unique et mot de passe, sans e-mail, conservée après la suppression des saisons. **Un compte possède ses places** — au plus une par saison — et l'accueil liste les siennes. *(ADR 0022)* |
| **Place** | Le siège d'un compte dans une saison. Elle porte le pseudo copié à l'entrée et figé pour la saison, la nation, la plage de repos. On la quitte d'un écran, jamais du serveur : seule la destruction de la saison l'efface. |
| **Session** | Accès à un compte par un jeton de 32 octets aléatoires. Plusieurs sessions indépendantes, sans expiration — un second appareil ouvre les mêmes places ; on déconnecte une session, ou on les révoque toutes lors d'une récupération admin. Le jeton de partie n'existe plus : chaque ordre voyage en `{ session, saison }`. |
| **Horloge** | La durée d'une saison, toujours affichée : 2 h en Blitz ; en Mondiale, un réglage du salon (3 à 14 jours, 7 par défaut) qui sert de filet — la victoire aux points arrive normalement avant. *(décisions du 14/10 et du 17/10/2026, ADR 0027 §4)* |
| **Graine de saison** | Aléa fixé à la création. Détermine la richesse des pays. Deux saisons ne se ressemblent pas. |
| **Nation** | Le pays d'origine d'un joueur. Ne change jamais. Ne peut pas être annexé. |
| **Pays neutre** | Un pays non joué. Support d'avant-postes, partenaire commercial, source de mercenaires. |
| **Avant-poste** | Point posé sur un pays neutre. Ouvre un rayon (`outpostReachKm`, 120 à 240 km suivant son niveau) où l'on bâtit et où les troupes posées s'entretiennent au tarif domestique. **Il tient toute région dont un bout entre dans ce rayon** — jamais son seul centre : une géante se tient depuis sa lisière *(révisé 17/09, ADR 0020 §1)*. Une spécialisation (relais ou écoute), choisie à la construction. Se désactive, se démantèle par son propriétaire au clic droit, ou **se capture** — avec son rayon et ce qu'il ancre. *(révisé 16/09 — démantèlement ; capture décidée le 14/10/2026)* |
| **Objectif** | Une réserve neutre posée au lancement sur une région de pays sans siège. **Publique** : dépêche à tous, marqueur sur la carte de tous, dépôt restant lisible. Deux par joueur à moins de `OBJECTIVE_NEAR_KM` de son QG, plus un **dur** par paire de voisins, au milieu de la route qui les sépare. Se réduit, ne se capture pas. |
| **Archétype** | Ce qu'un objectif est : un nom de 1940, un palier, une garnison locale, un dépôt. Une **palette** (`OBJECTIVE_ARCHETYPES`), dont chaque saison tire une partie. Le palier se dit en toutes lettres — *forces irrégulières légères, organisées, retranchées* — et la composition, jamais. |
| **Garnison locale** | La force neutre qui tient un objectif. Posée, elle défend et n'ordonne jamais rien (ADR 0019 §3) ; elle ne se renforce pas, ne se déroute pas, ne mange pas. **Elle n'est pas publique** : elle se relève comme toute force posée (ADR 0024 §1). Jamais « barbares », jamais « camp de barbares ». |
| **Dépôt** | Le stock posé d'un objectif. Le premier qui réduit la garnison l'emporte, borné par ce que sa colonne porte ; **le reste reste au sol** pour le suivant. Vidé, l'objectif passe *épuisé*, et la dépêche le dit à tous sans nommer le preneur. |
| **Mouvement** | Un envoi de troupes d'un point A à un point B. Irréversible. Représenté par un arc. En Blitz, une unité seule ; en Mondiale, une pile. |
| **Point stratégique** | Un lieu réel de 1940, public, tiré parmi un vivier de dix au lancement d'une Mondiale (sept par saison, par la graine de la saison, sous contraintes de diversité : `drawPoints`). Il y a toujours sept points, donc un seul meneur possible. Il ne produit rien : il **casse une règle** pour qui le tient. En tenir quatre 24 h d'affilée gagne la saison. Neutre, **tenu** ou **contesté**. |
| **Teneur** | Le joueur qui tient un point stratégique. Il le garde sans garnison jusqu'à ce qu'on le lui capture. |
| **Éliminé** | Le joueur dont le QG de départ est capturé. Il observe : sa carte figée, la presse, le télégraphe. Jamais « mort », jamais « vaincu ». En Mondiale, son capteur prend le QG et le stock au-dessus du seuil scellé ; le reste passe au **siège irrégulier**. |
| **Siège irrégulier** | La place sans compte ni nation qui tient les garnisons des objectifs neutres et, en Mondiale, ce qu'un éliminé laisse : bâtiments, avant-postes, troupes. Il ne joue pas, ne se défend que sur place, et chacun peut le capturer ou le piller. *(M16, 14/10/2026)* |
| **Sélection** | Plusieurs de ses piles prises ensemble — Maj + clic, le lasso (Maj + glisser sur le plateau), ou au doigt l'appui long sur la carte puis les touchers. Lâchée sur un lieu, chaque pile y part par son propre mouvement, avec son slot ; une seule qui ne peut pas, et le refus se dit avant le lâcher. **G** les fait rejoindre la plus grosse (former une **escouade**), **U** **dissout** l'escouade choisie : ses pièces se posent à part autour de son point, sur-le-champ. Mondiale seulement. Jamais « unité sélectionnée ». *(#130)* |
| **Slot de mouvement** | La ressource la plus rare de la Mondiale. Limite le nombre de mouvements simultanés. La Blitz n'en a pas. |
| **À flot** | Une pile dont le point de départ est sur une cellule d'eau de la grille de routage. La porte navale ne se lit pas sur elle : le port a été payé à l'embarquement, au premier départ. **Mais elle ne repart que par sa coque** — sans rien qui flotte sous elle, aucun ordre (`NO_HULL_AT_SEA`). Se calcule au départ, jamais stocké. *(ADR 0019 §2, révisions du 27/08, du 09/09 et du 18/09)* |
| **Colonne embarquée** | Une pile qui porte à la fois de la terre et de la mer : elle vise **un point de mer ou une côte**, jamais l'intérieur des terres. En mer elle **reste** — coques et passagers à une seule adresse, être à bord est un état calculé — et elle y vit sans ravitaillement, au tarif majoré. On n'y fonde pas. *(ADR 0019 §2, révision du 18/09 — « un cargo peut rester en mer avec des unités dedans »)* |
| **Capacité** | Ce qu'un transport emporte, en **places** : cargo 12, porte-avions 6, transport aérien 2. Une troupe tient dans **un seul** transport — les capacités ne s'additionnent pas d'une coque à l'autre. *(ADR 0025)* |
| **Encombrement** | Ce qu'une troupe terrestre occupe à bord, en **places** : infanterie 1, transport terrestre 2, blindé 3. Par rôle, jamais par palier. Jamais « poids » ni « score de chargement ». *(ADR 0025)* |
| **Embarquer** | Prendre l'adresse d'un transport posé à moins de 50 km, sur-le-champ, sans mouvement ni slot — l'ordre se donne en désignant le transport. Par mer n'importe où sur le littoral ; par air **dans un aérodrome** seulement, et l'on n'en descend que dans un de ses aérodromes. Distinct de *entrer en garnison*, qui est une marche vers un bâtiment. *(ADR 0025)* |
| **Noyé** | Une troupe terrestre qu'aucun banc de coque **debout** ne porte plus après une passe de résolution en mer : **détruite**, jamais déroutée — il n'y a rien où se replier. Une coque déroutée emporte ses passagers à sa capacité ; l'excédent coule. C'est le prix de rester au large, et la première raison mécanique d'une escorte. *(règle 4 du 18/09)* |
| **Arc** | La représentation visuelle d'un mouvement. Visible seulement si détecté. |
| **Figurine** | Ce qu'est une de ses troupes sur la carte au rapproché : un modèle peint d'après sa planche, posé sans socle. Trois par troupe d'infanterie, un par véhicule ; elles disent la force qui reste. Au loin, la silhouette de domaine. Jamais « modèle 3D » ni « sprite » sur la carte. *(ADR 0026)* |
| **Planche** | L'illustration 2D d'un rôle pour une nation, ou d'un bâtiment. Le catalogue et la référence des figurines ; **hors de la carte** depuis l'ADR 0026 (abaque, modale de site, dépêches). |
| **Bloc** | Ce qu'est toute force adverse relevée, posée ou en mouvement : un bloc vu de dos, un pictogramme de domaine sur l'envers. Il ne dit rien de plus que le relevé — ni type, ni composition, ni nation. Délavé, c'est une dernière position connue. *(ADR 0026)* |
| **Fiche au survol** | Ce que dit une de ses pièces quand on la survole : une ligne par rôle, la vie sur 100, la charge. Remplace le cartouche d'une troupe à soi. Dire « fiche au survol », jamais « fiche » seule, qui désigne une fiche de design. *(ADR 0026)* |
| **Relié** | Un bâtiment dont la région porte la couleur de son propriétaire. **Seul un bâtiment relié produit** (ADR 0020 §6) : le sol national l'est toujours, une région d'avant-poste l'est tant que le point la tient, et un point désactivé décolore donc **coupe** (§7). Ce qui n'est pas relié est **hors réseau** — un état, jamais une panne : rien ne se répare sur le site, la région se reprend sur la carte. Ne concerne que ce qui produit, les quatre extracteurs et les trois chaînes. |
| **La Manchette** | Le nom du jeu depuis le 02/10/2026 (décision `marque-nom-2026-10-02`) : le titre d'un quotidien et sa bande. Affiché par `fr.masthead` seulement ; **`worldwarsim`** reste le nom de code — dépôt, paquet, projet Convex, domaine, clés `localStorage`. |
| **Journal d'événements** | L'écran « qu'est-ce qui a changé depuis ma dernière visite ». |
| **Télégraphe** | Le chat de la partie : un **canal général**, ouvert dès le salon, fermé à la conclusion, et un **canal privé** par paire de joueurs. Le mot est imposé — ni « chat » ni « dépêches », qui appartiennent au journal. *(décision du 29/08 ; canaux privés le 14/10)* |

## Ressources

| Terme | Définition |
|---|---|
| **Entrepôt** | Le seul stockage national : chaque niveau relève les huit plafonds, et c'est la seule entrée de l'interface et du simulateur. `depot` est une clé **historique** — rendue comme un entrepôt, jamais posée à neuf, prix et chantiers anciens conservés. *(unifié le 09/09/2026)* |
| **Fonds** | La seule ressource de la Blitz, versée par les villes et le QG tenus. Jamais « argent », jamais « crédits ». |
| **Seuil scellé** | En Mondiale, la part de chaque réserve qui ne se pille jamais (le plafond initial). Seul l'excédent est à prendre. *(décision du 14/10)* |
| **Ressources** | Cinq en Mondiale (ADR 0028) : vivres, acier, charbon, pétrole, munitions. Quatre sortent du sol — **le fer donne l'acier**, sans fonderie — et l'arsenal fait les munitions d'un charbon et d'un acier. Chacune a un picto et une couleur, les mêmes partout (`RESOURCE_KEY`, `convex/validators.ts`). Jamais « alliage », « nourriture », « minerai », « tissus » ni « bandages », morts le 18/10. L'acier des trois anciennes (ravitaillement, acier, effectifs, mortes le 15/08) n'est pas celui-ci. *(révisé 18/10)* |
| **Jeton** | La petite pastille qui vole d'un bac, d'un dépôt ou d'un transport à un autre pour montrer un flux : récolte, paiement, chargement. **Il ne compte rien** : les quantités se lisent en nombres et en barres. *(ADR 0028, précision du 18/10 ; le disque « ×N » qui portait ce nom est retiré depuis le 16/10)* |
| **Plateau personnel** | Le panneau à soi : chaque ressource en nombre et en barre jusqu'au plafond de l'entrepôt, les tuiles, la réserve de pièces, les cartes de recherche. L'adversaire ne le voit jamais. Jamais « plateau » seul, qui désigne la table. *(ADR 0028)* |
| **Récolte** | Ce qui est entré dans les bacs du plateau personnel depuis sa dernière ouverture, moins ce qui en est sorti, qui y tombe en pastilles à l'ouverture suivante. *(ADR 0028 §7)* |
| **Réserve de pièces** | Sur le plateau personnel, une silhouette par rôle et par marque, ouverte ou derrière sa carte de recherche ; lâchée sur une caserne, un port ou un aérodrome, elle y commande une troupe. *(ADR 0028 §7)* |
| **Carte de recherche** | Sur le plateau personnel, une des onze cartes de l'arbre (terre, mer, air, industrie). Lâchée sur son QG, elle se paie à la pose, avance en heures de jeu et débloque à la fin une unité, une tuile ou une ligne d'usine ; elle ne change jamais un chiffre. Une seule à la fois ; un QG absent l'arrête sans rien perdre. Jamais servie à l'adversaire. *(ADR 0028 §5)* |
| **Tuile** | Un bâtiment avant sa pose, sur le plateau personnel. Lâchée à un emplacement libre, elle bâtit à la position exacte visée ; une exploitation se pose sur un gisement. Lâchée sur sa pareille déjà posée, elle l'élève. *(ADR 0028, ADR 0029)* |
| **Dépôt d'avant-poste** | Les munitions, le pétrole et le charbon posés sur un avant-poste, dans une seule charge maximale qui croît avec son niveau. Les troupes ancrées dans son rayon s'y servent ; il se remplit par livraison, tournée ou largage, et se capture avec le point. Distinct du *dépôt* d'un objectif. *(ADR 0028)* |
| **Gisement** | Un point de la carte, visible, qui porte une seule exploitation : terres, fer, charbon ou pétrole. Cuit par le générateur, jamais retouché à la main. Il n'appartient plus à une région. *(ADR 0029)* |
| **Espacement** | La distance qu'un bâtiment garde de tous les autres du même joueur, debout ou en chantier (`BUILDING_SPACING_KM`, ≈ 30 km). Il remplace « une bâtisse par région » : une région ne compte plus rien. *(ADR 0029)* |
| **Coups** | Les munitions qu'une troupe porte, en **crans** : un cran, une passe qu'elle peut tirer, en attaque ou en riposte. Sans coups, ni attaque ni riposte : elle encaisse. Repris quand elle est ancrée ; un cran coûte 10 munitions. *(ADR 0028, Mondiale)* |
| **Plein** | La distance que les moteurs d'une troupe couvrent encore, en **crans** d'environ 500 km ; pour un avion, son allonge. Payé au départ, repris quand elle est ancrée ; un cran coûte 10 de pétrole, ou de charbon pour un navire. L'infanterie à pied n'en a pas. *(ADR 0028, Mondiale)* |
| **Palier d'entretien** | Ce que l'armée mange par heure, par rang : 1 vivre par troupe jusqu'à la dixième, 2 jusqu'à la vingt-cinquième, 3 au-delà, **doublé hors ancrage** (`isAnchored`). La fiche dit le palier de la prochaine troupe et où commence le suivant. Un avant-poste debout mange aussi des vivres selon son niveau, une écoute brûle du charbon. *(ADR 0028 §2, Mondiale)* |
| **Prix mêlé** | Tout coûte de l'acier plus la ressource de sa famille : vivres pour les hommes (et l'avant-poste), pétrole pour les machines de terre et les avions, charbon pour les navires et la production. Toujours montré en deux pictos de leur couleur. *(ADR 0028 §2, Mondiale)* |

## Actions

| Terme | Définition |
|---|---|
| **Capture** | Ce que fait une infanterie qui tient un bâtiment, un avant-poste, un point stratégique ou un QG adverse : au bout du temps, il change de propriétaire. Elle avance **au rythme des PV** de la troupe ; un combat ne la remet jamais à zéro, seuls le départ ou la mort de la troupe l'annulent. En Mondiale elle s'arrête pendant la plage de repos du défenseur. Jamais « prise ». *(décision du 14/10)* |
| **Initiative** | L'attaquant frappe le premier ; le défenseur **riposte** avec ce qui lui reste. Ensemble, frappe et riposte font une **passe de résolution**. |
| **Choc** | Deux unités qui s'attaquent l'une l'autre au contact : elles tirent en même temps, personne n'a l'initiative. |
| **Riposte** | La réponse automatique d'un attaqué, avec ses PV restants, s'il peut toucher l'attaquant. Elle ne coûte pas de rechargement. |
| **Rechargement** | En Blitz, le délai après une frappe pendant lequel une unité ne peut plus attaquer ; propre à chaque rôle. Elle peut bouger. |
| **Tir indirect** | Une frappe à distance, sans riposte reçue ni donnée, avec une **zone morte** proche où l'on ne peut pas tirer. L'artillerie tire ainsi, **en batterie** — immobile depuis un instant. Sa **salve** touche jusqu'à quatre troupes de la pile visée, jamais ses voisines ; en Mondiale, elle coûte un cran de coups et la cible ne sait pas d'où elle vient. *(ADR 0028 §6)* |
| **Raid** | Désactive temporairement un avant-poste. En Mondiale, fusionné avec l'attaque (décision du 14/10, pas encore codé). |
| **Lever / poser** | Lever une pile, c'est la prendre en main au clic qui lit ; la poser, c'est nommer sa destination au clic « agir », ce qui ouvre la rose. Rien ne part avant « envoyer — irréversible » ; Échap repose. *(ADR 0026 §6)* |
| **Pillage** | Expédition dirigée contre une installation adverse **déjà relevée** : elle combat la défense, tient une présence, prélève le surplus disponible au-dessus de la réserve de base, désactive temporairement le site, puis rentre. Sur un entrepôt elle rapporte ; sur un producteur c'est un **sabotage**, le même ordre sans butin. La charge se crédite au premier franchissement d'une région tenue ; ce qui tombe en route devient une **caisse**, ramassable par qui l'a relevée. |
| **Interception** | Combat déclenché en route par un mouvement **offensif** — `attack` ou `raid` — qui rencontre un mouvement adverse dans le même milieu. Une force **posée** voit sans intercepter : détecter et engager sont deux choses depuis la révision de l'ADR 0021 (08/09/2026). |
| **Cap d'arrivée** | Direction depuis laquelle une force atteint sa cible. Modificateur de combat. |
| **Rejeu** | Vue rapprochée d'un combat déjà résolu. Spectacle, jamais interaction. Se lance depuis la dépêche du combat ; en face, des blocs et des totaux — le brouillard ne se lève pas parce qu'on a tiré. *(ADR 0026 §7)* |
| **Plage de repos** | En Mondiale, 7 h par 24 h, déclarées et publiques. Aucun mouvement ne peut y arriver, et aucune capture n'y progresse contre soi. La Blitz n'en a pas. |
| **Largage** | Un ravitaillement par transport aérien qui ne se pose pas : un paquet descend sous parachute sur un de ses avant-postes, dont il remplit le dépôt, ou sur une de ses escouades isolées — non ancrée —, qui reprend ses coups et son plein dans la limite de ce que chaque troupe porte. Une escale n'est pas requise ; l'avion paie le plein de l'aller-retour, rentre seul, et ce qui n'est pas descendu reste à bord. *(ADR 0028)* |
| **Tournée** | Une boucle de ravitaillement qu'un transport enregistre : elle part de son point de chargement (QG ou entrepôt, port, aérodrome, ou un dépôt) et y revient, par quatre dépôts au plus. À chaque tour, il recharge sa **consigne** (ce qu'il portait au premier tour), dépose à chaque dépôt ce qui manque, saute un dépôt plein, et recommence jusqu'à ce qu'on le rappelle ou qu'on l'intercepte. Elle garde son slot. Jamais « route » (le chemin terrestre) ni « convoi ». *(ADR 0028, précision du 18/10)* |
| **Premiers pas** | Le tutoriel de la Mondiale : cinq gestes à faire dans la vraie partie — poser le QG, lever et poser une pièce, former une pièce, poser une carte de recherche, charger un transport et le livrer à un avant-poste. Chacun se coche quand l'état du jeu le montre, jamais sur « suivant » ; la liste se tient en tête de « à faire », une bulle montre où faire le geste. Jamais « didacticiel » ni « partie d'essai ». *(ADR 0027 §2)* |

## Retiré du vocabulaire

> **Le 10/09/2026 : la sonde, l'agent dormant, l'embargo, l'exposition, l'occupation, le
> revanchisme.** Six mots qui nommaient des outils jamais codés, et que le jeu ne prépare plus.
> L'embargo et l'exposition appartenaient aux doctrines, mode unique depuis l'ADR 0020 §9 ;
> l'occupation et le revanchisme attendaient une part de carte qui ne sera pas celle-là. La sonde
> et l'agent dormant nommaient une seconde façon de voir : la détection suit désormais le rôle des
> troupes et rien d'autre (ADR 0021). Ils ne s'emploient plus, et **un terme du glossaire qui ne
> désigne rien coûte plus qu'il ne rapporte** — c'est ce qu'on a appris avec le leurre.
> *Le 14/10/2026, l'occupation est revenue sous un autre nom : la **capture** d'un bâtiment
> colore sa région, sol national compris. Dire « capture », jamais « occupation ».*

> **Retiré du vocabulaire le 29/08/2026 : le leurre.** Il était « un mouvement à zéro unité, un
> slot, indiscernable d'un vrai ». Conçu par la fiche 04, codé, puis retiré sans avoir jamais été
> éprouvé en partie — un outil de plus que personne n'avait demandé. Le mot ne s'emploie plus, ni
> dans le code, ni à l'écran ; la note de révision en tête de
> [fiche 04](docs/design/04-information.md) dit ce que le retrait emporte et ce qu'il laisse en
> trou. Un manifeste vide n'est plus un ordre : c'est un refus.

## Termes bannis

À ne jamais employer, parce qu'ils ramènent des attentes de genre qu'on ne tient pas :
**tick**, **temps réel**, **micro**, **unité sélectionnée**, **base**, **rush** (au sens RTS),
**tour de combat** (il n'y a pas de tours : il y a des *passes* de résolution, même en Blitz),
**convoi** (dire **mouvement**, le terme couvre aussi les agents et les avant-postes).
