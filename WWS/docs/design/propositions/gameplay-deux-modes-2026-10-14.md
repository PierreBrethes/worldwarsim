# Deux modes de jeu : Blitz et Mondiale

**Date : 14/10/2026. Statut : décidé par Pierre au grilling du 14/10, rien n'est codé.** Le
grilling partait des trois questions de la revue de game design du 13/10 (tempo, victoire, ce
qu'on prend durablement) ; Pierre l'a réorienté vers deux modes. Les ADR ont été mises de côté
le temps de revoir le gameplay : ce document fait référence pour les lots à venir, et les ADR
qu'il contredit seront révisées quand un lot s'y appuiera.

Sources, hors dépôt (`Claude outputs/`, non versionné) : `REVUE-GAMEPLAY-2026-10-13.md` (la
revue), `PROPOSITION-RESSOURCES-MONDIALE-2026-10-14.md` (la refonte des ressources, adoptée
avec un amendement, R4), `POINTS-STRATEGIQUES-2026-10-14.md` (le vivier, adopté tel quel,
fiches détaillées par lieu).

## Le principe

**Un même support, deux gameplays.** Carte, unités, rendu, brouillard, compte et télégraphe
sont partagés. Ce qui diverge : l'économie, la victoire, l'horloge, et la façon d'ordonner.

| | Blitz | Mondiale |
|---|---|---|
| Durée | 1 à 2 h | 7 jours |
| Joueurs | 2 à 4, présents ensemble | 2 à 8, asynchrone, 2-3 visites/jour |
| Inspiration | Advance Wars | semi-Ogame |
| Terrain | un théâtre (Europe, Pacifique…) | le monde |
| Économie | une ressource, des bâtiments à capturer | six ressources, des bâtiments à bâtir et élever |
| Victoire | prendre le QG adverse | 4 points stratégiques sur 7 tenus 24 h, ou tous les QG |

**Ordre de construction : la Blitz d'abord** (O1). Elle exige la capture, le combat à
l'initiative et l'unité seule, dont la Mondiale a aussi besoin, et elle les met à l'épreuve en
une soirée au lieu d'une semaine.

## Ce qui est commun aux deux modes

- **La capture, à la Advance Wars** (B3, B3b, M7). Seule l'infanterie capture. Elle tient le
  bâtiment ; la capture avance **au rythme de ses PV** (10/10 = vitesse de base, 5/10 = moitié).
  Un combat ne la remet jamais à zéro : seuls le départ ou la mort de l'unité qui capture le
  font. Une présence ennemie ne la suspend pas — il faut attaquer. Revue du lot 3 : la
  meilleure infanterie présente fixe la vitesse, pas la somme (K1) ; l'infanterie qui capture
  un avant-poste y entre en garnison (K2) ; un bâtiment capturé n'occupe aucun emplacement
  (K3) ; la rose annonce la durée à la force réelle (K4) ; l'heure de perte, qui laisse deviner
  la force du capteur, est acceptée (K5) ; un bâtiment repris reperd un niveau, jamais sous 1
  (K7) ; un avant-poste désactivé reste capturable, même immunisé (K8).
- **Le combat à l'initiative** (B16, M14). L'attaquant frappe avec ses PV actuels × la table
  de dégâts (`DAMAGE_TABLE`) ; le défenseur riposte avec ce qui lui reste, s'il peut toucher.
  La passe simultanée disparaît. Revue du lot 2 : **la garnison encaisse moins** (≈ ×0,7 des
  dégâts reçus, les « étoiles » d'Advance Wars) et riposte normalement — un avant-poste en
  chantier ou désactivé n'abrite pas (C1, C4) ; un blindé MK1 riposte au MK2 à 25 % de sa
  case contre un MK1 (C2) ; on ne paie en munitions que ce qu'on tire (C3).
- **Charge contre charge = choc simultané** (B17, option b). Deux unités qui s'attaquent l'une
  l'autre au contact tirent ensemble. Qui frappe une cible posée ou occupée ailleurs a
  l'initiative. Voir venir laisse trois parades : tenir (étoiles), contre-charger, reculer.
- **Le tir direct et le tir indirect** (B20). Les unités directes frappent au contact. Un rôle
  neuf, l'**artillerie**, tire de loin (≈ 150 km), a une **zone morte** proche (< 50 km), ne
  riposte pas et ne subit pas de riposte, et doit être **en batterie** (immobile ≈ 30 s). En
  Blitz d'abord ; d'autres rôles indirects (cuirassé) plus tard.
- **Au feu, on voit l'ennemi** (F1, 14/10). Qui prend part à une passe voit ce qu'il a en face
  — rôles, effectifs, nation —, pendant le combat comme au rejeu, en vraies figurines. Le
  brouillard garde tout ce qu'on n'a pas affronté ; une force seulement relevée reste un bloc,
  dessiné plus « carte » que la stèle actuelle. Révise l'ADR 0026 (rejeu en blocs et totaux).
- **Le soin** : sur un bâtiment à soi (B12, R2).
- **Pas de plafond de troupes affiché** (R10b). Le frein est l'économie ; une borne technique
  invisible (≈ 80) protège le serveur.
- **Le télégraphe** (T1, R19) : une seule vue, messages regroupés par auteur, au bureau comme
  au téléphone ; des onglets « Général » et une conversation à deux par joueur, dans les deux
  modes.

## Blitz

- **Terrain** (B1) : un théâtre par partie, et une vitesse calée pour le traverser en 15 à
  20 min (≈ 5 min pour 1 000 km en Europe).
- **Présence** (B2) : 2 à 4 joueurs présents à heure convenue. Pas de plage de repos, pas de
  notification.
- **Départ** (B7) : un QG, une caserne, deux fantassins, un petit pécule. Tout le reste est
  neutre.
- **Bâtiments générés** (B8) par la règle des objectifs (`objective-placement`) : N proches de
  chaque QG à distance de route égale, des bâtiments disputés entre voisins, des ports sur la
  côte seulement, une graine.
- **Quatre types** (B14) : ville (fonds), caserne / port / aérodrome (produisent leur domaine,
  **sans revenu**), QG (revenu, produit l'infanterie, se capture plus lentement).
- **Économie** (B4) : une ressource, les fonds, versés par minute par bâtiment tenu. On recrute
  dans un bâtiment de production qu'on tient ; la recrue sort en ≈ 1 min. Ni construction ni
  élévation.
- **Unités** (B9, B15) : les neuf rôles actuels (3 terre, 3 mer, 3 air) plus l'artillerie, une
  marque par rôle. Chaque troupe est un pion seul, 10 PV, sans pile. Une unité par bâtiment ;
  ailleurs, placement libre.
- **Ordres** (B5, B13, B17, B18) : pas de slots. On n'attaque que sur ordre, la riposte est
  automatique. L'ordre d'attaque vise une **unité** : l'attaquant la poursuit et frappe au
  contact (≈ 25 km), et abandonne si elle sort de sa vue. Revue du lot 5 : pas de déroute, un
  pion tient ou tombe (U1) ; une frappe oppose l'attaquant à sa seule cible (U2) ; une seule
  unité entre dans un bâtiment, la seconde se pose devant (U3) ; aucune visée hors du théâtre,
  région comprise (U4) ; lever prend la première troupe du groupe touché (U5).
- **Cadence** (B19) : après une frappe, un **rechargement propre à chaque rôle** (l'artillerie
  plus lent que l'infanterie) ; on peut bouger pendant. La riposte ne recharge pas.
- **Brouillard** (B6) : gardé, à la portée des unités et des bâtiments.
- **Fin** (B10, B11) : QG capturé = joueur éliminé, ses bâtiments passent au capteur, ses
  troupes disparaissent. À 2 h, le plus gros revenu gagne.

## Mondiale

### Tempo
- **Une opération dure 0,5 à 2 intervalles entre visites** (Q2). Les mouvements vont **×12**
  plus lentement qu'aujourd'hui (M5) : Paris-Berlin ≈ 2 h 30, Paris-Moscou ≈ 7 h, Atlantique
  ≈ 16 h, `@a-mesurer`.
- Les « 14 min / 1 000 km » perdent leur statut de mesure (Q3) : calés par un simulateur mort,
  ils deviennent l'ordre de grandeur de la Blitz.
- **Le préavis s'achète** (M6, option a). La détection (60 à 200 km) ne donne aucune avance à
  ces vitesses : le renseignement à longue portée est un achat (station d'écoute ≈ 800 km qui
  brûle du charbon, reconnaissance aérienne).

### Victoire et fin
- **Points stratégiques** (M1, M1b) : un vivier d'une quinzaine de lieux réels de 1940 ; chaque
  saison en tire 7, pour que chaque joueur en ait à peu près autant à portée de route, jamais
  sur le sol d'une nation jouée (R15). Chacun **casse une règle** pour qui le tient et ne
  produit rien (R18). Victoire : en tenir **4 sur 7 pendant 24 h d'affilée**. Le vivier et la
  façon de tenir sont dans la section suivante.
- **Écrasement** : prendre le QG de tous les adversaires.
- **Horloge de 7 jours** (M4) ; à défaut de vainqueur, **cumul d'heures de points tenus**, le
  territoire pour départager (M12).
- **Pas de victoire au compte de régions** (M3) : il favorise les grands pays. Le territoire
  reste au classement de la presse.

### Les points stratégiques (P1-P12)

Dix-huit lieux, chacun une règle cassée pour qui le tient (format de Cosmic Encounter : le
pouvoir est la règle). ★ utile, ★★ forte, ★★★ change la partie ; code F faible, M moyen, L lourd.

| Lieu | Règle cassée | ★ | Code |
|---|---|---|---|
| Gibraltar | le détroit est fermé à vos rivaux, sauf à qui vous l'ouvrez (liste publique) | ★★★ | L |
| Suez | une fois par jour, un de vos mouvements partis change de destination | ★★ | L |
| Panama | toute coque qui franchit le canal vous est relevée en clair | ★ | M |
| Bakou | vos motorisés font le plein partout | ★★ | F |
| Narvik | vos exploitations produisent même hors réseau | ★★ | M |
| Dakar | vos réserves ne se pillent pas | ★★ | F |
| Tanger | vous seul commercez avec un comptoir neutre (3 contre 1, plafonné par édition) | ★★ | F |
| Istanbul | une fois par jour, vous lisez le dernier télégramme privé entre deux joueurs ; tampon « lu à Istanbul » chez eux (essai, P7) | ★★ | F |
| Stockholm | les traités que vous enregistrez lient (aucun ordre offensif entre signataires, 48 h au plus) ; tous tombent si le point change de main | ★★★ | M |
| Rangoun | une fois par jour, un joueur sous embargo 24 h (aucun envoi vers lui) | ★ | F |
| Lisbonne | vous lisez la nation de tout ce que vous relevez ; l'agent dormant est gelé en V1 (P9) | ★★ | M |
| Montevideo | une fois par jour, une fausse dépêche dans les Échos, par formulaire à trous (P6) | ★ | M |
| Hong Kong | vous lisez l'événement de la une 24 h avant les autres | ★ | F |
| Malte | vos garnisons tirent avant l'assaillant, sauf celles des points stratégiques (P5) | ★★★ | M |
| Halifax | vos mouvements maritimes ne prennent pas de slot | ★ | F |
| Manille | vos avions ignorent leur allonge au-dessus de la mer | ★★ | M |
| Singapour | vos blindés et camions se forment sans pétrole | ★ | F |
| Brazzaville | votre QG pris, il se relève ici au niveau 1, une fois par saison (exception assumée à M2a, P8) | ★★★ | L |

**Au banc** (P12) : Varsovie (capture pendant la plage de repos, trop cruelle), Reykjavik, Le
Cap, Darwin, Pearl Harbor, Bosphore.

**Tirage** : par la graine, au lancement, comme les objectifs neutres. Exclus : sol national
d'une nation jouée et régions voisines ; deux points à moins de 1 500 km ; un point par pays.
Diversité : au moins 4 familles, au plus 2 points ★★★, au moins 2 points ★, un seul verrou de
route. Équité : depuis la capitale de 1940, en heures de route combinée, chaque joueur a au
moins 2 points à moins de 24 h, à un point près des autres. À 2 ou 3 joueurs, le vivier se
limite à la région jouable.

**Tenir** :
- trois états publics : neutre, tenu (teneur, depuis quand, heures cumulées), contesté. Qui
  conteste reste caché jusqu'à la prise (P2) ;
- le teneur garde le point sans garnison ; une alarme part dès qu'une capture commence (P1) ;
- le point colore sa région mais n'ouvre aucun emplacement, ne produit rien et ne ravitaille
  pas ; sa règle s'applique dès la prise et s'éteint à la perte ;
- les pouvoirs quotidiens se rechargent à l'édition de 9 h, sans cumul (P4) ;
- le compte à rebours de 24 h repart à zéro à la **perte** d'un des quatre, pas à la
  contestation (P3).

**Presse** : la une des Sept au jour 0 ; l'encadré « La course aux Sept » à chaque édition ;
le compte à rebours en manchette ; le palmarès par lieu à l'édition finale.

**Premier vivier codé** (P11) : les dix règles légères — Bakou, Dakar, Tanger, Istanbul,
Rangoun, Hong Kong, Halifax, Singapour, Narvik, Lisbonne. Malte vient avec le combat à
l'initiative ; Gibraltar, Suez et Brazzaville ensuite. Plus tard (P10) : le vainqueur bannit
un lieu du tirage suivant.

### Prendre et perdre
- **Tout ce qui a un propriétaire se capture** (M7, M9) : bâtiment (≈ 6 h) et avant-poste, avec
  son rayon et ce qu'il ancre. Le raid qui désactive reste possible. Un bâtiment capturé perd
  un niveau (R12).
- **Le sol national s'occupe** (M8) : un bâtiment capturé colore sa région pour le capteur.
- **Pas de siège séparé** (M10) : la capture en tient lieu ; la proposition « l'attaque qui
  tient le terrain » est abandonnée.
- **QG** (M15) : capture en **12 h par défaut**, réglage de partie (12 ou 24 h). Toute capture
  **s'arrête pendant la plage de repos du défenseur**.
- **QG capturé = éliminé** (M2a). Le capteur prend le QG et le stock du vaincu au-dessus du
  seuil scellé (R12) ; le reste (bâtiments, troupes) devient un **siège irrégulier**,
  capturable et pillable par tous (M16).
- **L'éliminé observe** (M17) : sa carte figée à sa chute, la presse, les événements mondiaux,
  le télégraphe ; aucun mouvement, aucun relevé neuf, aucun chiffre que la presse ne publie pas.
- Une capitulation reste possible ; un siège abandonné 48 h passe en irrégulier (revue #22).

### Économie (proposition ressources, adoptée)
- **Six ressources** (R1) : vivres (tenir), charbon (usine, marine, écoute), minerai (acier),
  pétrole (motorisés, aviation), acier (bâtir, armer, réparer), munitions (frapper). Textile et
  pansements disparaissent ; le générateur de gisements est à refaire.
- **À sec, une règle casse** : vivres → ni formation, ni soin, capture gelée, personne ne meurt
  (R13) ; charbon → usine arrêtée, flotte à quai, écoute muette ; pétrole → motorisés et avions
  cloués ; munitions → **ni attaque ni riposte**, la troupe encaisse sans tirer (R4, amendement
  de Pierre : pas d'évacuation automatique).
- **La marine au charbon**, l'aviation et les blindés au pétrole (R3).
- **Huit bâtiments** au lieu de quinze : QG (porte le plafond de chantier et les slots ; les
  casernements y sont fondus, R10), **exploitation** (ferme, mine, puits sous une clé, R11),
  **usine à lignes assignables** — acier, munitions, pétrole synthétique au niveau 3 (≈ 3
  charbons pour 1), réaffectation gratuite (R5, R6) —, entrepôt, caserne, port, aérodrome,
  station d'écoute.
- **Le soin** (R2) : en garnison d'un site de son domaine, vivres pour les hommes, acier pour
  les machines, un site de niveau N soigne N troupes à la fois.
- **Seuil scellé** (R7) : ce qui est sous ≈ 400 par ressource ne se pille jamais.
- **Envoi de ressources par mouvement**, relevable et interceptable (R8) ; l'atout américain
  devient « vos envois ne sont jamais relevés ». **Pas de marché neutre** en V1 (R9).
- **L'URSS sans manque** (R14). Chantiers : niveau 1 en 1 à 2 h, ×1,8 par niveau (R16). Seules
  l'usine et la station d'écoute consomment en continu (R17).
- **Aviation** : allonge ≈ 1 500 km depuis un aérodrome ou un avant-poste de niveau 2, et du
  carburant (revue #18).

### Nations (N1-N3)
- **En Blitz, les nations sont identiques** : drapeau et figurines seulement (N1).
- **En Mondiale, les atouts restent, les troupes signature sont gelées en V1** (N2).
- Trois atouts refaits (N3) : **États-Unis** — vos envois de ressources ne sont jamais relevés ;
  **Japon** « Banzaï » — son infanterie capture toujours à pleine vitesse, même entamée (la
  réorientation en vol est passée à Suez) ; **Chine** « Terre brûlée » — un bâtiment chinois
  capturé est détruit au lieu d'être pris. France, Royaume-Uni, URSS, Allemagne et Italie
  gardent leur atout de la fiche 06.

### Reconnaissance aérienne (N4)
Un ordre de chasseur ou de bombardier, depuis un aérodrome et dans son allonge, pour une sortie
de pétrole. À son passage, elle relève dans ≈ 200 km tout ce qui est posé ou en mouvement :
domaine et **taille approximative** (petite, moyenne, grande force), jamais la composition ni
la nation. Le relevé vieillit comme les autres.

### Récit et social (reprises de la revue, M18)
- Événements de la une, un par jour, tirés d'une table (#8).
- Traités déclaratifs publiés à la une ; la trahison fait la une (#10).
- Ordres du jour pendant les 48 premières heures (#11).
- Atouts nationaux débloqués, quatre d'abord, après les points stratégiques (#17).
- Raid et attaque fusionnés ; le pillage reste un verbe (#21).
- Région jouable lue selon le nombre de joueurs ; curseur de compensation supprimé (#12).
- La station d'écoute de niveau 2 relève **qui parle à qui** sur les canaux privés, jamais le
  contenu.
- Refusé : « le meneur fait la une » (#16) — la course publique aux points désigne déjà le
  meneur. Plus tard : l'archive de saison au compte (#23). Piste : un « mouvement de
  résistance » pour l'éliminé.

## Ce que ces décisions remplacent

| Aujourd'hui | Devient |
|---|---|
| Un seul jeu, des paramètres (fiche 01) ; pas de partie courte (ADR 0001) | deux modes |
| « Pas une couche tactique façon Advance Wars » (fiche 01) | la Blitz l'est |
| Passe simultanée, une seule passe (ADR 0014) | initiative et riposte ; choc simultané seulement charge contre charge |
| Un avant-poste se désactive, jamais pris (ADR 0020, vocabulaire) | il se capture |
| Sol national intouchable | occupable |
| Une troupe entamée reste entamée | soin |
| Domination simplifiée par réduction (`victory.ts`) | points stratégiques, écrasement, horloge |
| Horloge optionnelle | 7 jours obligatoires (Mondiale) |
| 14 min / 1 000 km, « seul nombre mesuré » | ordre de grandeur Blitz ; Mondiale ×12 |
| Huit ressources, quinze bâtiments | six ressources, huit bâtiments (Mondiale) ; fonds (Blitz) |
| `DRY_AMMUNITION_FACTOR` 0,6 | à sec, ni attaque ni riposte |
| Plafond de 24 troupes | pas de plafond affiché |
| Atouts Prêt-bail, réorientation en vol (Japon), Masse (Chine) ; troupes signature | envois jamais relevés, Banzaï, Terre brûlée ; troupes signature gelées |
| Un seul canal public (29/08) | canaux privés à deux |
| Vocabulaire banni : temps réel, rush, micro | à revoir pour la Blitz |

## Encore ouvert

- Toutes les valeurs (vitesses, rechargements, portées, durées, coûts) sont `@a-mesurer`.
- Le dernier 🔴 (avantage d'isolement géographique) : les points stratégiques hors du sol
  national lui donnent un levier, rien ne l'a encore mesuré.
