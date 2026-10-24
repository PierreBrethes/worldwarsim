# ADR 0035 — Une échelle commune des pièces

**Statut :** acceptée (23/10/2026). Pierre a choisi la variante D, tranché ses suites (Q2 à Q7),
puis la figurine plancher (Q1, §10) et la plage du curseur (Q3, §6). **Précise l'ADR 0026** (la
carte en figurines) sur la taille des pièces. Précisée le 23/10 sur le storyboard de la caserne :
l'homme ×1,5 (§2), et chaque char à la longueur de son modèle (§1).

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
2. **Deux écarts déclarés.** L'homme est agrandi ×1,5 (2,6 m), à hauteur du char : il passe sous
   la porte de sa caserne, à régénérer à 3,4 m (#268) ; la figurine plancher (§10) le garde
   lisible. La mer est à demi-échelle : ports et navires restent liés entre eux, mais un port fait
   168 km et un cargo 104 km au lieu de 340 et 210.
3. **Deux distances d'épingle.** Une pièce devient épingle selon sa taille à l'écran, non plus à
   une distance commune : les troupes vers d ≈ 3 à 7 (tenues jusqu'à d ≈ 30 par le plancher,
   §10), les bâtiments vers d ≈ 56 à 68. Le fondu des régions et des ombres garde ses propres
   seuils. Mesuré dans le code (`pieceWeight`, 20 px lus sur une fenêtre de 900 px de haut,
   quelle que soit la fenêtre) : de l'homme à d ≈ 3,0, le R35 à 4,7, le char à 7,0, le chasseur à
   12,7, la caserne à 58 et le hangar à 70, jusqu'au port à 122 et au porte-avions à 145.
4. **Le clic ne suit pas la taille dessinée.** La zone qu'on vise garde une taille minimale à
   l'écran ; une figurine petite reste facile à prendre.
5. **Les bâtiments gardent leur disposition** en anneau autour d'un site, agrandie dans la même
   proportion (×1,37).
6. **Un seul curseur de taille** remplace les deux du joueur (troupes, bâtiments) : régler l'un
   sans l'autre casserait le lien. Sa valeur par défaut est l'échelle de cet ADR (100 %), sa
   plage 80 à 125 % : en dessous, le plancher (§10) porte presque seul les troupes et le curseur ne change plus rien qu'aux bâtiments ; au-dessus, une caserne
   dépasse 100 km.
7. **Les avions volent à environ trois envergures** au-dessus du sol, au lieu d'une altitude fixe.
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
