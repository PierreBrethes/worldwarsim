# Mondiale : économie, logistique, escouades

**Date : 18/10/2026. Statut : grillée avec Pierre le 18/10 ; rien n'est codé.** Elle donne
une forme aux principes de l'[ADR 0027](../../adr/0027-la-mondiale-au-centre.md) §5, en partant du
code au 17/10. Tous les chiffres sont `@a-mesurer`. **Tout ceci vaut pour la Mondiale seule** : la
Blitz garde ses fonds et tire sans compter ses coups (ADR 0027 §2, correctifs seulement).

## Ce que fait le code aujourd'hui

- **Huit ressources** (`RESOURCES`). Les tissus ne nourrissent que l'intendance, et rien ne
  consomme les bandages. Le minerai ne sert qu'à la fonderie. Le pétrole ne se consomme pas : seul
  l'aérodrome en coûte. Le charbon nourrit la fonderie et paie quelques chantiers.
- **Former coûte de l'alliage seul** (`COST_BY_ROLE`). Les chantiers coûtent de l'alliage et une
  seconde ressource.
- **Les munitions se débitent du stock national** à chaque passe, où que soit la troupe
  (`convex/combat.ts`) ; à sec, on tire à ×0,6 (`DRY_AMMUNITION_FACTOR`).
- **Seuls les vivres s'entretiennent** : 1 par heure et par troupe, ×2 hors ancrage
  (`convex/upkeep.ts`). À sec, la file de formation s'arrête et personne ne meurt.
- **Les verrous sont des niveaux** : le catalogue au niveau du QG (`UNLOCKED_AT`), le MK2 et le
  blindé au QG 2 (`TIER_2_HQ_LEVEL`), le rôle au niveau du site (`ROLE_SITE_LEVEL`). Le QG accélère
  aussi la formation de 22,5 % par niveau (`chainSpeed`), un pourcentage contraire à la règle 1.
- **Les gestes existent** : lâcher une pièce sur une autre l'embarque ou la fait rejoindre
  (`dropReadingOf`) ; plusieurs troupes à une adresse forment une escouade (`squadMarks`). Une
  troupe porte déjà une charge de butin (`CARRY_CAPACITY_BY_ROLE`, `convex/cargo.ts`).

## 1. Cinq ressources

| Ressource | Vient de | Usage direct | À sec, la règle qui casse |
|---|---|---|---|
| Vivres | ferme | chaque troupe mange ; soigne les hommes ; forme l'infanterie | ni formation, ni soin, capture gelée ; personne ne meurt (R13) |
| Acier | mine sur du fer | bâtir, élever, former, réparer les machines | ni chantier, ni réparation, ni formation |
| Charbon | mine sur du charbon | le plein des navires, la station d'écoute, l'usine | flotte sans plein, écoute muette, usine arrêtée |
| Pétrole | puits ; usine après recherche | le plein des blindés, de l'artillerie, des camions et des avions | les moteurs à sec ne repartent plus |
| Munitions | usine (charbon + acier) | les coups de chaque troupe | sans coups, ni attaque ni riposte : la troupe encaisse (R4) |

- Le minerai, les tissus et les bandages disparaissent, et l'alliage devient l'acier. **Le fer
  donne l'acier directement** : la fonderie disparaît avec le seul ingrédient pur du jeu.
- **Une seule transformation reste, l'usine** : des munitions, et du pétrole synthétique après
  recherche. Le charbon et l'acier y entrent, mais chacun a d'abord un usage direct.
- **Quatre gisements** au lieu de cinq : terres, fer, charbon, pétrole. Les garde-fous de la
  distribution (ADR 0015, révision du 15/08) se rejouent sur quatre.
- **Un gisement est un point de la carte** (Q31, [ADR 0029](../../adr/0029-placement-libre-et-gisements-ponctuels.md)) :
  visible, il porte une seule exploitation. Leur nombre et leur place sont cuits par le
  générateur.
- **Ne jamais perdre le joueur** (Pierre, 18/10) : chaque ressource a un picto et une couleur, les
  mêmes partout. Une pénurie se dit là où elle mord, sur la pièce ou la tuile touchée, avec la
  règle cassée et le bâtiment qui la répare (`PRODUCER_OF`).

## 2. Des coûts mêlés, et la consommation à l'usage

Chaque chose coûte de l'acier et la ressource de sa famille. Ce qu'elle consomme ensuite est son
vrai prix : ce qu'on engage ne revient pas vite.

| Famille | Former ou poser | À l'usage |
|---|---|---|
| Hommes : infanterie | acier + vivres | entretien, coups |
| Machines de terre : blindé, artillerie, camion | acier + pétrole | plein de pétrole, coups (sauf le camion), entretien |
| Navires : escorte, cargo, porte-avions | acier + charbon | plein de charbon, coups (sauf le cargo), entretien |
| Avions : chasseur, bombardier, transport aérien | acier + pétrole | plein de pétrole, qui est leur allonge ; coups ; entretien |
| Production : exploitation, usine, entrepôt | acier + charbon | l'usine mange charbon et acier |
| Projection : caserne, port, aérodrome | acier + vivres, charbon ou pétrole, dans cet ordre | — |
| Station d'écoute | acier + charbon | du charbon, en continu (R17) |
| Avant-poste : fonder, élever | acier + vivres | des vivres en continu, selon son niveau |
| Recherche | acier + la ressource de la famille qu'elle débloque | — |
| Soin, réparation | — | vivres pour les hommes, acier pour les machines |

- **L'entretien croît avec l'armée, par paliers** : 1 par troupe jusqu'à la dixième, 2 de la
  onzième à la vingt-cinquième, 3 au-delà ; toujours ×2 hors ancrage. Repère gardé du code : une
  ferme de niveau 1 nourrit douze troupes du premier palier.
- **Élever coûte ×1,8 par niveau** (`LEVEL_COST_FACTOR`) et ajoute un rendement de base : chaque
  niveau se rembourse plus lentement que le précédent.
- **Ce qu'un niveau rend**, partout : une exploitation ou une usine produit N fois la base ; une
  caserne, un port ou un aérodrome forment et soignent N troupes à la fois (R2) ; un avant-poste
  ouvre son rayon, son dépôt, et une escale aérienne au niveau 2 ; le QG porte 1 + N slots. Un
  niveau ne débloque plus rien.

## 3. La recherche débloque

- **Une recherche à la fois, au QG.** On pose sa carte sur le QG, comme une tuile. Elle dure
  quelques heures et coûte selon sa branche.
- **Elle débloque une unité, une tuile ou une ligne d'usine**, jamais un chiffre (44a). Elle
  remplace les verrous de niveau (`UNLOCKED_AT`, `TIER_2_HQ_LEVEL`, `ROLE_SITE_LEVEL`).
- **Au départ** : infanterie, camion, cargo ; QG, exploitation, usine à munitions, entrepôt,
  caserne, port, avant-poste. Le port et le cargo d'emblée tiennent la décision 66a : une île n'est
  pas tarifée au-dessus de son voisin.

| Branche | Cartes, dans l'ordre |
|---|---|
| Terre | infanterie MK2 → blindé → blindé MK2 ; artillerie |
| Mer | escorte → porte-avions (après l'aviation aussi) |
| Air | aviation (aérodrome et chasseur) → bombardier ; transport aérien |
| Industrie | pétrole synthétique (≈ 3 charbon pour 1) ; station d'écoute |

- **Un invariant testé : le contre coûte moins et dure moins que l'arme qu'il contre.**
  L'infanterie MK2 vient avant le blindé. Il remplace « l'arme et son contre arrivent ensemble »,
  qui supposait un niveau de QG commun aux deux camps.
- Onze cartes, environ 180 h de recherche pour une saison de 168 h : on ne finit pas l'arbre, et
  choisir sa branche, c'est choisir sa guerre.
- Avant de coder, Pierre veut une passe sur l'arbre lui-même, dans un artefact :
  [Arbre de recherche Mondiale](https://claude.ai/artifact/MUm2rQF8mY82rLtdz3VTpx) (18/10).

## 4. La logistique passe par les pièces

**Chaque troupe porte ses coups et son plein.** Ses coups, ce sont les passes qu'elle peut tirer,
en attaque ou en riposte. Son plein, c'est la distance que ses moteurs couvrent encore. Les deux se
lisent chez son propriétaire seulement, **par deux pictos faciles à retenir** (une cartouche, un
jerrican), aux quatre mêmes endroits : sous la figurine, dans la fiche au survol, dans l'abaque,
et dans la réserve de pièces au moment de former (Pierre, 18/10).

**Ils se comptent en crans** (Q20) ; un cran coûte 10 de sa ressource (Q28). Un cran de plein vaut
≈ 500 km, soit ≈ 1 h 20 de route en Mondiale.

| Troupe | Coups | Plein |
|---|---|---|
| Infanterie | 3 | — (à pied) |
| Blindé | 2 | 3 crans (1 500 km) |
| Artillerie | 2 salves | 2 crans |
| Camion | — | 4 crans |
| Navires | 3 (cargo : —) | 6 crans de charbon |
| Avions | 2 | 3 crans, leur allonge |

- **Ancrée, une troupe se ravitaille ; ailleurs, elle vit sur ce qu'elle porte.** Une troupe posée
  là où elle est ancrée (`isAnchored` : sol national, ou rayon d'un de ses avant-postes debout)
  reprend ses coups et son plein sur le stock de l'ancre. Chez soi, c'est le plateau personnel ;
  ailleurs, le dépôt de l'avant-poste. Une seule lecture sert l'entretien et le ravitaillement.
- **Le plein se paie au départ.** Le mouvement débite sa route du plein de chaque moteur. Une route
  plus longue que le plus petit plein de l'escouade est refusée, et le refus le dit (ADR 0015).
  Le retour automatique d'une colonne qui a combattu reste gratuit (précision du 18/10, à la
  revue de la 4.3) : il n'est l'ordre de personne, et le payer coincerait loin de chez soi une
  troupe qui n'a pas choisi d'y rester.
- **Le dépôt d'avant-poste** porte des munitions, du pétrole et du charbon : 400 par niveau du
  point, **au total**, partagés librement (Q27, Q28). Réarmer une escouade de dix troupes coûte
  environ 200. Les vivres et l'acier restent au plateau personnel.
- **Ravitailler, c'est charger un transport.** Un camion se charge **au QG ou à un entrepôt**, un
  cargo **au port**, un avion **à l'aérodrome** (Q29) : on voit où se fait la logistique, et
  l'entrepôt devient un nœud, donc une cible. Hors du sol national, un transport se charge au
  dépôt de l'avant-poste où il se tient. **Une seule charge maximale**, partagée librement entre
  munitions, pétrole et charbon : camion 200, cargo 800, avion 120. Un transport ne prend ni
  vivres ni acier. Puis on
  lâche le transport sur un de ses avant-postes, et la pastille dit « livrer ». C'est un mouvement,
  avec son slot. Il décharge à l'arrivée, garde à bord ce qui ne tient pas, et rentre seul, comme
  un pillage. Le camion livre par la route, le cargo à un avant-poste côtier.
- **Le largage, l'urgence qui coûte cher** (Pierre, 18/10) : le transport aérien ne se pose pas.
  Il largue sa charge, un paquet descend sous parachute, et l'avion rentre ; il lui faut le plein
  de l'aller-retour. Sur un de ses avant-postes, le paquet remplit le dépôt. Sur une de ses
  escouades en campagne, il recharge directement ses coups et son plein : c'est le seul moyen de
  ravitailler une troupe isolée.
- **Un transport porte des troupes et des ressources à la fois**, dans deux capacités séparées : les
  places (ADR 0025) et la charge. Un cargo emmène quatre blindés et leur ravitaillement.
- **Charger doit être fluide** : le geste est celui de l'embarquement, et il se met au point sur
  un prototype avant d'être codé.
- **La tournée de ravitaillement** (Pierre, 18/10, Q22 à Q26) : un transport enregistre une boucle
  de quatre arrêts au plus, **qui part de son point de chargement et y revient** (Q29) : on ne
  l'enregistre que depuis ce point, jamais depuis un champ. On le lâche sur le premier dépôt avec
  la variante « tournée » (Tab), puis sur les suivants ; la boucle se trace à l'encre, chez soi
  seulement ; relâcher sur le point de chargement la ferme et la lance. Ce qu'on a
  chargé au premier tour devient la **consigne**, rechargée à chaque tour. À chaque tour, il dépose
  à chaque dépôt ce qui lui manque, **saute un dépôt plein**, revient, et recommence jusqu'à ce
  qu'on le rappelle ou qu'on l'intercepte. Si le plateau personnel manque, il attend au chargement
  et une dépêche le dit. **Une tournée garde son slot tant qu'elle tourne** : on choisit entre
  automatiser et opérer. La navette est une tournée à un arrêt ; avec l'avion, chaque arrêt est un
  largage.
- **Le génie** (des sapeurs qui bâtiraient et ravitailleraient seuls) est écarté pour l'instant
  (`QUESTIONS.md`) : la tournée couvre le besoin sans nouvelle pièce.
- **Un ravitaillement se relève et s'intercepte** comme tout mouvement (R8). Un transport détruit
  laisse une caisse, à terre seulement : en mer, le large prend sa charge, et celle d'un camion
  à bord d'un cargo coulé avec lui. L'atout américain devient « vos ravitaillements ne sont
  jamais relevés ».
- **Se défendre chez soi ne coûte aucune logistique** : le pays ravitaille. L'attaquant paie le
  chemin.

## 5. Les escouades de Mondiale

- **Une escouade, ce sont les troupes d'un joueur au même endroit** (ADR 0026, révision du
  16/10) : la même case de carte, le même bâtiment, le même avant-poste, ou à bord du même
  transport. Deux escouades qui se rejoignent n'en font plus qu'une. On ne la forme pas : on lâche
  une pièce sur une autre, elle la rejoint ; un appui long en tire une seule troupe.
- **Sa taille est libre.** Elle part en un mouvement et un slot, au pas de sa troupe la plus
  lente, si chaque moteur a le plein pour la route.
- **Chaque troupe se ravitaille pour elle-même** : une grosse escouade vide un dépôt.
- **L'artillerie répond à l'escouade monstre, par une salve bornée** : une salve touche jusqu'à
  quatre troupes de l'escouade visée, jamais ses voisines. Un pion seul prend un coup, une grosse
  escouade en prend quatre. Le tir direct frappe une troupe. La Blitz, sans escouade, n'y voit
  aucune différence.
- **L'adversaire n'en relève qu'une taille** : petite, moyenne ou grande force (N4), jamais la
  composition.
- **Au-delà de douze troupes**, l'escouade se dessine en une figurine par rôle, et son fanion porte
  le compte.

## 6. Le dilemme d'une visite

Une visite, une décision d'économie. Les trois familles puisent dans le même acier :

- **Investir** : élever une tuile ou lancer une recherche. Le rendement court jusqu'à la fin de la
  saison : investir tôt rapporte, investir tard ne rapporte plus.
- **Armer** : former des pièces. Elles coûtent ensuite chaque jour, et plus cher au palier suivant.
- **Projeter** : fonder un avant-poste, l'élever, le ravitailler. C'est le seul chemin vers les
  points stratégiques, qui ne sont jamais sur un sol national.

Aucune ne domine : l'investissement s'essouffle (×1,8 le niveau pour un rendement constant),
l'armée coûte par paliers, la projection se consomme.

## 7. Le plateau personnel

Un panneau à soi, sous la table au bureau, en tiroir au téléphone. On dit toujours « plateau
personnel » : « le plateau » seul désigne la table.

- **Cinq bacs, en nombres et en barres** (Q27) : chaque ressource montre son nombre exact et une
  barre qui se remplit jusqu'au plafond de l'entrepôt (400, puis +600 par niveau, `BASE_CAP` et
  `STORAGE_CAP_PER_LEVEL`) ; un bac plein ne reçoit plus rien. Un transport et un dépôt ont une
  barre unique, découpée par couleur de ressource, comme la charge de la fiche au survol du
  prototype « table d'état-major ». **Les chiffres sont ceux du code** (Q28) : une ferme de niveau 1
  donne 12 vivres par heure, et une troupe en mange 1. Les **jetons** ne servent plus qu'en
  animation : quelques pastilles qui volent pour montrer un flux (récolte, paiement, chargement),
  jamais pour compter. *(Remplace Q7 et Q21 : petits entiers et jetons de valeur.)*
- **La récolte** : à l'ouverture, ce qui est entré depuis la dernière visite tombe dans les bacs,
  et ce qui en est sorti (entretien, usine) s'en va. Elle suit le réglage d'animation
  (`src/domain/map-motion.ts`).
- **Les tuiles**, une par bâtiment débloqué. Lâchée à un **emplacement libre**, une tuile y bâtit,
  à la position exacte visée, sur le sol national ou dans le rayon d'un avant-poste, à un
  espacement minimum des autres bâtiments ; une exploitation se pose sur un gisement libre (Q30,
  Q31, ADR 0029). Lâchée sur sa pareille déjà posée, elle l'élève. La pastille dit le prix ou le
  refus, par la fonction du serveur. Les jetons payés volent jusqu'à la tuile.
- **La réserve de pièces**, une silhouette par rôle débloqué. Lâchée sur une caserne, un port ou un
  aérodrome, elle y commande une troupe.
- **Les cartes de recherche**, qu'on pose sur le QG.
- **Glisser d'un bac sur un transport le charge** (§4) : 10 à la fois, l'appui maintenu accélère.

## 8. Les cinq cas de casse

| Cas | Parade |
|---|---|
| Boule de neige du plus riche | entretien par paliers ; l'investissement s'essouffle ; les points sont loin de chez lui et la projection se paie à l'usage ; le défenseur se ravitaille gratuitement chez lui ; un bâtiment capturé perd un niveau |
| Tortue chez soi | elle ne tient aucun point ; ses bacs plafonnent à l'entrepôt ; l'excédent sur le seuil scellé se pille |
| Tapis d'avant-postes | chaque point mange des vivres selon son niveau ; il n'ouvre plus d'emplacement ; il se capture avec son dépôt ; un dépôt vide n'arme personne ; le tenir garni prend des tournées, donc des slots |
| Escouade monstre | une salve d'artillerie touche jusqu'à quatre de ses troupes ; elle vide les dépôts ; elle va au pas de la plus lente ; elle paie les paliers d'entretien |
| Des centaines de pièces | une borne serveur invisible (≈ 150 troupes par joueur), dont le refus se dit sans compteur ; une escouade dessinée en douze figurines au plus ; les paliers rendent la centaine ruineuse avant la borne |

## 9. Les points stratégiques touchés

| Point | Règle | Ce qui change |
|---|---|---|
| Bakou | vos motorisés font le plein partout | ils reprennent leur pétrole sur le plateau personnel, ancrés ou non ; la règle prend tout son poids (★★ → ★★★) |
| Narvik | vos exploitations produisent même hors réseau | règle inchangée ; elle vaut plus, puisque le pétrole et le fer d'ailleurs se tiennent par avant-poste |
| Dakar | vos réserves ne se pillent pas | elle s'étend aux dépôts : un dépôt du teneur, capturé, brûle au lieu de passer |
| Singapour | vos blindés et camions se forment sans pétrole → **vos camions et vos cargos roulent sans plein** | l'ancienne règle s'affaiblit avec le plein (un blindé formé sans pétrole reste à sec) ; la nouvelle rend la logistique du teneur gratuite en carburant |

## 10. Le code que ça rend mort

- Les ressources `textile`, `ore`, `bandages` ; les bâtiments `mill`, `quartermaster`, `foundry`,
  `billets` ; les chaînes `foundry` et `quartermaster`. Le point fixe de `settleStocks`
  (`drawnDownstream`, `allowance`) aussi : plus aucune chaîne n'en nourrit une autre.
- `chainSpeed`, `UNLOCKED_AT`, `unlockLevel`, `TIER_2_*`, `roleHqLevel`, `ROLE_SITE_LEVEL` :
  la recherche les remplace.
- `DRY_AMMUNITION_FACTOR`, le débit national des munitions au combat (`convex/combat.ts`) et
  `STRENGTH_PER_ROUND` : les coups les remplacent.
- `COST_BY_ROLE` en alliage seul, `STARTING_STOCK` à huit clés, les tissus de
  `FOUNDATION_ORDER`, le commentaire « fuse » de `STARTING_OIL`.
- Avec le lot 2 de la file : `TROOP_CAP_*`, `troopCap`, `PLACEMENTS_PER_HQ_LEVEL`, `homeSlots`,
  `SITE_SLOTS_FULL`.
- Le relais d'avant-poste (`RELAY_SPEED_MULTIPLIER`, ×1,5) est un pourcentage. Le dépôt devient la
  fonction logistique de tout point, et l'écoute la seule spécialisation.
- Le wipe d'avant la saison test emporte les clés historiques `depot`, `recall` et `decoy`.
- L'entrée « Jeton » de `WWS/CONTEXT.md` (le disque « ×N », retiré le 16/10) : le mot passe aux
  ressources.

## Contre la boussole et les trois règles

- **La boussole** : tout se fait à la main (jetons, tuiles, transports). D'un dépôt adverse, on ne
  voit que ce qu'on y pille. Un plein dépensé ne revient pas.
- **Règle 1** : aucun pourcentage ne survit (`chainSpeed`, le relais et le ×0,6 partent). La
  recherche débloque, les points cassent une règle.
- **Règle 2** : on ne voit passer un ravitaillement que si on l'a relevé, et une caisse se
  ramasse. Coups et plein ne se lisent que chez soi.
- **Règle 3** : la famine ne tue pas, et le pays ravitaille chez soi : l'acculé se défend sans
  logistique.

## La suite en lots

Reprise en tête de `RESTE-A-CODER.md`, point 4 de la file au 17/10, en dix features (placement libre compris) : livrer et
larguer y sont séparés, et chacune dit ce qui se voit.

1. **Cinq ressources** : retirer tissus, bandages et minerai ; le fer donne l'acier ; retirer la
   filature, l'intendance, la fonderie et les casernements ; régénérer les gisements ; relire le
   socle. Le wipe d'avant la saison test le permet.
2. **Coûts mêlés et entretien** : les barèmes par famille, les paliers, l'entretien d'avant-poste,
   l'écoute au charbon.
3. **Coups et plein** : portés par la troupe, repris à l'ancre, départ refusé sans plein, à sec ni
   attaque ni riposte ; les deux pictos aux quatre endroits.
4. **Le prototype du plateau personnel** (`WWS/prototypes/`) : charger un transport, livrer,
   larguer, la récolte. Il règle la fluidité avant les lots 5 et 6.
5. **Le plateau personnel** : bacs, récolte, tuiles, réserve de pièces. Il remplace la fenêtre
   Économie.
6. **Dépôts, livraison, largage, tournées** : charger à un bâtiment, au port ou à l'aérodrome,
   livrer, retour seul, larguer sur un point ou une escouade, la tournée en boucle, interception,
   caisse ; ce que le niveau d'un point rend.
7. **La recherche** : l'arbre de l'artefact, ses cartes, les verrous de niveau retirés,
   l'invariant du contre.
8. **Les escouades** : la salve bornée de l'artillerie, le dessin regroupé, la borne serveur.

Les règles de Bakou, Dakar et Singapour attendent les lots 3 et 6.

## Grilling du 18/10

Pierre a validé les trois tours : cinq ressources et le fer qui donne l'acier, coups et plein
repris à l'ancre, coûts mêlés, entretien par paliers, recherche par cartes (arbre de l'artefact),
escouade définie par le lieu, jeton d'une unité, relais retiré, dépôt d'avant-poste, livraison et
largage, entretien d'avant-poste sur le plateau personnel, salve bornée (b), dessin regroupé
au-delà de douze, borne serveur, points stratégiques du §9, transport mixte, prototype d'abord.
Ses deux exigences : ne jamais perdre le joueur, et des pictos simples pour ce que porte une troupe.

Après le prototype (même jour, Q19 à Q26) : charger à un bâtiment, au port ou à l'aérodrome ;
coups et plein en crans, un jeton par cran ; dépôts de 20 par ressource et par niveau ; jetons de
valeur 1, 5, 25 ; la tournée de ravitaillement, qui garde son slot, à la place des workers ; le
génie écarté.

Après la deuxième version du prototype (Q27 à Q31) : des nombres et des barres à la place des
jetons, qui ne restent qu'en animation ; l'échelle du code, un cran à 10, une charge unique par
transport et par dépôt ; un camion qui se charge au QG ou à l'entrepôt, une tournée en boucle
depuis le point de chargement ; le placement libre des bâtiments et les gisements ponctuels
(ADR 0029). Pierre veut aussi un avion qui atterrit sur la piste et un navire qui accoste le long
du quai.
