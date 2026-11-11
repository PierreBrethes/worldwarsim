# ADR 0035 — Une échelle commune des pièces

**Statut :** acceptée (23/10/2026). Pierre a choisi la variante D, tranché ses suites (Q2 à Q7),
puis la figurine plancher (Q1, §10) et la plage du curseur (Q3, §6). **Précise l'ADR 0026** (la
carte en figurines) sur la taille des pièces. Précisée le 23/10 sur le storyboard de la caserne :
l'homme ×1,5 (§2), et chaque char à la longueur de son modèle (§1). Amendée le 26/10 (#286) : le
hangar fait 50 m, celui du modèle neuf (§1) ; les deux hangars viendront au lot des kits de terrain.

## Contexte

Le POC des animations (`WWS/prototypes/animations-3d/`, 23/10) a buté sur l'échelle : un
fantassin faisait 7 fois la porte de sa caserne, un chasseur 2,3 fois la porte de son hangar, un
cargo deux fois la longueur de son port. Les bâtiments étaient tous ramenés à la même largeur,
0,7 u, soit 58 km (`MAQUETTE_SPAN`), et les troupes à un seul facteur (`FIGURINE_SCALE`), sans
normalisation par rôle : les modèles n'étaient pas à la même échelle entre eux. Pierre : « que la
taille des troupes et des bâtiments soient réels, un tank qui sort du garage reste de cette
taille ; il faudra pas mal réduire les tailles, et ce sera plus précis sur la carte ». Enquête
chiffrée et maquette comparée : `WWS/prototypes/echelle-commune/`.

## Décision

1. **Une taille réelle, une seule exagération.** Chaque pièce, troupe ou bâtiment, est posée à sa
   taille réelle (fantassin 1,75 m, char 6 m — chaque modèle à sa longueur, du L3/35 de 3,2 m au
   T-34 de 6,7 m —, chasseur 11 m d'envergure, cargo 130 m, caserne 50 m, hangar 60 m…)
   multipliée par **E = 1 600**. Une caserne fait alors la largeur d'un département (80 km), un
   char 9,6 km. Ce qui sort d'un bâtiment garde sa taille en sortant.

   > **Amendé le 11/11/2026, décisions de Pierre, en deux temps le même jour.** D'abord les seuls
   > bâtiments à 0,5 (`BUILDING_SCALE`), les troupes à 1 : sur les captures, les piles tenues par
   > leur plancher masquaient les bâtiments de loin, et de près un char paraissait deux fois trop
   > gros devant son garage. Pierre est revenu dessus : « il faudrait encore réduire la taille des
   > bâtiments et troupes, que tout "scale" bien ensemble […] j'ai vraiment envie d'avoir une
   > impression de grandeur, et jouer sur le zoom / dézoom ». Désormais **toute pièce, troupe ou
   > bâtiment, est dessinée à la même part de cette taille** : `DRAWN_SHARE` = 0,25
   > (`src/domain/piece-size.ts`, `@a-mesurer`) : Pierre a tranché 0,25 le 11/11/2026, sur captures
   > à 0,5, 0,35 et 0,25 ; il valide aussi les deux planchers (§10) et laisse la couronne intacte.
   > « Ce qui sort d'un bâtiment garde sa taille » tient de nouveau.
   > C'est le dessin seul : E = 1 600, les mesures et les règles qui en sortent ne changent pas.
   > La couronne de dissolution (`movement-orders.ts`) reste donc à 2,1 longueurs de pièce
   > *pleines*, soit 8,4 longueurs *dessinées* : des chars dissous se posent à 20 km de leur point
   > quand ils en paraissent 2,4. Le plafond par région et l'échelle par pays restent écartés.
2. **Deux écarts déclarés.** L'homme est agrandi ×1,5 (2,6 m), à hauteur du char : il passe sous
   la porte de sa caserne, à régénérer à 3,4 m (#268) ; la figurine plancher (§10) le garde
   lisible. La mer est à demi-échelle : ports et navires restent liés entre eux, mais un port fait
   168 km et un cargo 104 km au lieu de 340 et 210.

   > **Amendé le 11/11/2026, décisions de Pierre** (#534) : **l'écart de l'homme tombe.** Il
   > reprend sa taille réelle, 1,75 m (`MAN_EXAGGERATION` disparaît) : sous la porte de sa caserne
   > à 3,4 m, qui reste, le R35 fait 2,3 fois l'homme et le Sherman 3,3. Il ne reste qu'un écart
   > déclaré, la mer ; les « ×1,5 » du §10 se lisent à ce nouveau rapport.

   > **Précisée le 04/11/2026** (#433, décisions de Pierre) : le lien port-navire tient **à
   > quai, pas en mer**. Un anneau qui réduit un port (jusqu'à ×0,4) réduit aussi sa garnison à
   > quai, escorteur et porte-avions compris : son seuil d'épingle, son plancher (§10) et son pied
   > sont ceux du tas à cette taille. Le navire qui appareille part du quai tel qu'il est dessiné
   > et reprend sa taille en 0,5 s ; celui qui arrive la quitte de même. Une flotte relevée reste
   > à son point et à pleine taille. Les garnisons de terre gardent leur taille (§1) et se rangent
   > sur la cour de leur socle (ADR 0038 §5) : rien n'y change à l'écran. Seul le pied d'un modèle
   > sans `fx_rang` — aucun des treize bâtiments aujourd'hui — ne multiplie plus la demi-pile par
   > l'échelle du site.
3. **Deux distances d'épingle.** Une pièce devient épingle selon sa taille à l'écran, non plus à
   une distance commune : les troupes vers d ≈ 3 à 7 (tenues jusqu'à d ≈ 30 par le plancher,
   §10), les bâtiments vers d ≈ 56 à 68. Le fondu des régions et des ombres garde ses propres
   seuils. Mesuré dans le code (`pieceWeight`, 20 px lus sur une fenêtre de 900 px de haut,
   quelle que soit la fenêtre) : de l'homme à d ≈ 3,0, le R35 à 4,7, le char à 7,0, le chasseur à
   12,7, la caserne à 58 et le hangar à 70, jusqu'au port à 122 et au porte-avions à 145.

   > **Amendé le 05/11/2026** (#465, décisions de Pierre) : un bâtiment sur son socle ne se pèse
   > plus par sa taille à l'écran. Il passe en épingle avec mes piles, au plancher des troupes
   > (§10, d ≈ 30 à 35), quelle que soit la taille de son socle (ADR 0038 §7 amendé). Un
   > objectif neutre, sans socle, et une pièce plus grande que le plancher (un navire) gardent la
   > règle des pixels.

   > **Amendé le 11/11/2026** (§1 amendé) : ces distances se lisent à l'échelle pleine ; chacune
   > est plus proche de la part dessinée. À 0,25 : l'homme se lit à 20 px à d = 0,75, mes piles et
   > mes sites tiennent debout jusqu'à d ≈ 11 et sont leur épingle à d ≈ 13 (`FLOOR_UNTIL` = 43 à
   > l'échelle pleine, là où la caserne fait encore 26 px, `@a-mesurer`) ; un objectif neutre
   > passe à d ≈ 11, l'escorteur à 16, le cargo à 19, le porte-avions à 36. Le fondu des régions
   > (30 à 65), des ombres (65) et des noms ne bouge pas : entre d ≈ 13 et 65, la carte se lit en
   > épingles sur ses régions.
4. **Le clic ne suit pas la taille dessinée.** La zone qu'on vise garde une taille minimale à
   l'écran ; une figurine petite reste facile à prendre.
5. **Les bâtiments gardent leur disposition** en anneau autour d'un site, agrandie dans la même
   proportion (×1,37).

   > **Amendé le 11/11/2026, décisions de Pierre** : l'anneau espace les sites par leur taille
   > dessinée (§1 amendé, 0,25 de la taille pleine) : un site seul se pose à son point, et deux
   > sites ne se gênent plus qu'à un quart de la distance d'avant. Un groupe trop serré rétrécit
   > encore à 0,8 puis 0,6 de cette taille avant de laisser chaque site à son point
   > (`SHRINK_STEPS`, ADR 0038 §6).
6. **Un seul curseur de taille** remplace les deux du joueur (troupes, bâtiments) : régler l'un
   sans l'autre casserait le lien. Sa valeur par défaut est l'échelle de cet ADR (100 %), sa
   plage 80 à 125 % : en dessous, le plancher (§10) porte presque seul les troupes et le curseur ne change plus rien qu'aux bâtiments ; au-dessus, une caserne
   dépasse 100 km.

   > **Amendé le 11/11/2026, décisions de Pierre** : le curseur s'applique **par-dessus** la part
   > dessinée (§1 amendé), pour toutes les pièces : un joueur à 80 % voit tout à 0,2 de la taille
   > pleine, à 125 % à 0,31. Les 100 % du curseur sont la part dessinée ; le plancher et le seuil
   > d'épingle le suivent comme avant.
7. **Les avions volent à environ trois envergures** au-dessus du sol, au lieu d'une altitude fixe.

   > **Amendé le 11/11/2026** (§1 amendé) : trois envergures *dessinées* (`HOVER_ALTITUDE`). La
   > largeur d'un fil de mouvement, d'une flèche de visée et le halo d'une lampe suivent de même.
8. **Ce qui appartient au bâtiment vit dans son modèle** (portes à battants nommées, remise de la
   caserne, portes de hangar) ; **ce qui appartient au terrain est dessiné par le moteur** (piste
   d'aérodrome, môle du port). Une piste à la bonne proportion ferait plus de 1 000 km : elle est
   un symbole court.
9. **La Blitz suit la même échelle.**
10. **La figurine plancher.** Une troupe ne descend pas sous ~20 px à l'écran jusqu'à d ≈ 30, puis
    devient épingle : ni jeton 2D, ni cadrage déplacé. Entre d ≈ 3 et 30 elle grandit donc par
    rapport à son bâtiment ; le lien strict tient au rapproché, là où se jouent les sorties
    (POC `WWS/prototypes/echelle-commune/lisibilite.html`, #266). Le zoom descend à d = 3 (24/10),
    où l'homme ×1,5 se voit à sa proportion ; au-delà, le plancher.

    > **Amendé le 11/11/2026, décisions de Pierre** (§1 amendé) : **le zoom descend à trois fois
    > la part dessinée** (d = 0,75 à 0,25), où l'homme se lit à ses 20 px d'avant : on descend voir
    > ses hommes d'aussi près, sur une carte trois fois plus grande. **Deux planchers** remplacent
    > les 20 px : **16 px pour une pile en campagne**, sur un fil ou dans la main, **8 px pour une
    > garnison**, le tiers de sa caserne au seuil d'épingle (`FLOOR_PX`, `GARRISON_FLOOR_PX`,
    > `@a-mesurer`). Une pile ne paraît plus jamais plus grosse que le site qu'elle garde ; une
    > troupe qui sort de sa garnison grandit de 8 à 16 px à mi-distance, et pas du tout au
    > rapproché. Le plancher tient jusqu'à d ≈ 11 au lieu de 30.

    > **Amendé le 11/11/2026, décisions de Pierre** (#534) : **le plancher de ce qui roule se lit
    > sur l'homme** (`floorSpanOf`). Sur terre, tant que l'homme est tenu à 16 px, char, camion et
    > artillerie grandissent du même facteur que lui : un char reste aussi gros qu'il l'est devant
    > l'escouade (le rapport de leurs spans, ≈ 2,3 pour le R35, 3,3 pour le Sherman) à toute
    > distance où les pièces tiennent debout. Cela vaut pour un tas seul, pour une pile mêlée (elle
    > prend le domaine de sa plus grande pièce), pour un fil en marche (tous ses rangs) et dans la
    > main. L'avion et le navire gardent leur plancher propre, y compris dans une scène de combat
    > dont la plus longue pièce est un avion (`sceneDomain`). **Ce qui n'a pas de rôle** garde le
    > sien (bloc ennemi, relique, annotation d'un arc détecté, silhouette : `facesEye`, et
    > `ANONYMOUS_SPAN`) : un bloc grossi ×2,3 trahirait un char. **Garnison** : le plancher reste
    > celui de la pièce (8 px sur son propre span), sans plafond neuf ; un char y vaut à peu près
    > l'escouade. **Deux limites connues** : sur un très petit site (puits, station d'écoute), une
    > pile peut dépasser le tiers du bâtiment ; dans un tas mêlé en garnison, l'homme descend sous
    > les 8 px, calé sur le plancher de la plus grande pièce. Le seuil d'épingle (`troopPinSpan`)
    > ne change pas : le char grandi s'épingle au même d que l'homme, par le fondu existant.

    > **Amendé le 11/11/2026, décisions de Pierre** (#535) : **le zoom descend à d = 0,25**
    > (`CLOSEST_DISTANCE`, une part dessinée), où l'homme se lit à ≈ 60 px et le char à ≈ 135 px,
    > bien au-delà de leur plancher : toutes les pièces grandissent avec le zoom, à leur vraie
    > proportion. Les côtes à grands pans du niveau près sont acceptées. **La caméra se penche davantage sous d = 0,75** :
    > le plafond d'inclinaison monte de 1,15 à 1,3 rad à d = 0,4 et y reste (`steepestTiltAt`,
    > `camera-tilt.ts`) ; un avion en vol, plus haut que l'œil, peut sortir du cadre par le haut au
    > plus près. Le retour au QG, la recherche et le replay gardent leurs distances.

## Ce qu'on abandonne

- **Le lien strict à toute distance.** Entre d ≈ 5 et 30, la figurine plancher (§10) garde une
  troupe lisible au prix de sa proportion avec son bâtiment.
- **Le jeton 2D entre figurine et épingle** (trois paliers à apprendre), et **des cadrages de jeu
  ramenés au rapproché** (une garnison réduite à des points de 9 px à d = 10).
- **Des bâtiments tous de la même taille** : un hangar est plus large qu'une caserne, un port
  plus grand que tous.
- **Le réglage séparé des troupes et des bâtiments.**
- **Le lien strict sur l'eau et pour l'homme** (§2).

## Options écartées

- **A, les bâtiments gardent leur taille et les troupes reprennent leur vraie proportion** (E ≈ 1 160) : un
  fantassin fait 7 px au rapproché, l'infanterie reste une épingle même en zoomant deux fois plus.
- **C, plan-relief** (E ≈ 3 300) : une caserne couvre deux départements, et la mer liée à la terre
  donne un port de 693 km.
- **Bâtiments ×8** : une caserne de 465 km, plus qu'un Land.

## Conséquences

- Les constantes absolues du moteur qui supposaient la taille d'avant (espacement des piles,
  pied de garnison, rive, hauteur du tir, survol, flèche de visée) sont rééchelonnées ; la liste
  est dans l'enquête du 23/10.
- Les animations (sortie de caserne, décollage, accostage, chargement, combat, repos) deviennent
  possibles sans tricher sur la taille ; chacune passe par un storyboard que Pierre valide.
- Les modèles à régénérer sont listés dans `WWS/prototypes/echelle-commune/a-regenerer.md`.
