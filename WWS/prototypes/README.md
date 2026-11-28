# Prototypes

## carte-3d.html

Prototype de carte, autonome. Ouvrir dans Chrome — si three.js ne se charge pas depuis le CDN en
`file://`, lancer `npx serve` dans ce dossier.

**Ce qu'il valide :**

- 163 pays extrudés depuis Natural Earth, projection Natural Earth 1, découpe correcte à
  l'antiméridien
- orbite bridée (polaire 17°–66°, azimut libre, zoom clampé)
- courbure de faux horizon réglable en direct — **le curseur est le vrai livrable** : c'est ce qui
  permet de trancher globe vs plan incliné à l'œil
- survol, sélection, label suivant le curseur
- arcs de trajet animés, avec panneau d'opérations en cours
- **limite du monde** dessinée sur le contour réel de la sphère projetée, et **enroulement
  est-ouest** des trajets : la Nouvelle-Zélande vers l'Amérique passe par le Pacifique, pas par
  l'Eurasie

**Ce qu'il prouve techniquement :**

- le picking reste correct sous courbure (163/163, vérifié automatiquement) — cf.
  [ADR 0003](../docs/adr/0003-courbure-cpu.md)
- l'animation d'un mouvement est dérivée uniquement de `departedAt` / `arrivesAt`, donc pure
  interpolation client, zéro coût serveur pendant le trajet

**Sur l'enroulement.** Le monde est un **cylindre**, pas un tore : la longitude s'enroule, la
latitude non. On ne passe pas par le pôle nord pour ressortir en Antarctique. La limite dessinée est
le contour de la sphère projetée — les deux bords gauche et droit sont le même méridien, le 180ᵉ.

Un trajet s'enroule uniquement si c'est **plus court**. Le point de sortie et le point de rentrée
sont à la même latitude, calculés sur le contour, et le tout est vérifié automatiquement (8 cas,
dont Nouvelle-Zélande → États-Unis à 294 u en direct contre 150 u par le Pacifique).

⚠️ **Ce n'est pas cosmétique, c'est un levier d'équilibrage** : l'enroulement divise par deux la
distance entre l'Asie-Océanie et les Amériques. Cf. `docs/design/03-carte-et-avant-postes.md`.

**Ce qu'il ne fait pas :** ce sont des pays, pas des provinces. Pas de brouillard, pas de LOD, pas de
textures, pas d'avant-postes. Les données sont embarquées dans le fichier (~146 Ko).

**Usage : clic** sur un pays = origine, **clic** sur un second = envoi. **Glisser** pour orbiter.

## Généré comment

Les données viennent de `world-atlas` (countries-110m), projetées en Node avec `d3-geo-projection`
(`geoProject` traverse le stream d3, ce qui découpe correctement l'antiméridien — projeter point par
point produit une Russie qui traverse toute la carte).

Point représentatif de chaque pays calculé par pôle d'inaccessibilité approché, **pas** par centroïde
arithmétique : le centroïde place la France en Espagne (la Guyane tire la moyenne) et le Japon en
pleine mer. Environ 10 % des pays sont concernés.

## table-etat-major.html

Prototype de direction visuelle du 12/10/2026, autonome (three.js depuis jsDelivr). Carte
inventée, aucune donnée de partie. Décisions et pistes :
[propositions/table-etat-major.md](../docs/design/propositions/table-etat-major.md).

**Ce qu'il montre :** carte gravée sur une table sous une lampe ; R35, soldat 1940 et D.520
sculptés en code d'après leurs planches ; un kit de fantassin habillé par nation (revue
France / Allemagne / Royaume-Uni) ; les piles (un groupe par rôle, jeton « ×N », figurines qui
disent la force, MK présents seulement) ; la fiche au survol avec vie sur 100 et charge par
ressource, chargement en direct ; l’adversaire en bloc de wargame vu de dos ; lever une troupe et la poser ailleurs pour lui donner un ordre ; les dessins de terrain au survol d’une région ; le rejeu d’un engagement.

Le fichier est la page brute publiée en artifact : sans `<!doctype>` ni `<body>`, il s'ouvre
quand même dans Chrome.

## pions/

POC du 16/10/2026 : **la manipulation des pièces sur le plateau**, pensée hors du système de
mouvement actuel. Carte inventée (Varonie, la mer de Kessel, l'île de Brandt), figurines du jeu
(GLB britanniques et allemands copiés dans `pions/glb/`), three.js depuis jsDelivr.

**Lancer :** modules ES et GLB → il faut un serveur. Config `pions` de `.claude/launch.json`
(serveur sans cache, port 5198), puis `http://localhost:5198/WWS/prototypes/pions/`.
Ou `python3 -m http.server` à la racine du dépôt.

**La grammaire, en trois règles :**

- **ce qui s'allume sous la main est ce qu'on prend** — une pièce, une escouade entière, ou une
  seule pièce d'une escouade après un appui maintenu (cercle qui se remplit) ;
- **ce qu'on lâche dit ce qui arrive** — une seule fonction (`interpret`, `play.js`) lit la dépose
  pendant le geste (pastille sous la main, route, heure, cible qui s'allume, eau ou terre voilée)
  et la même réponse est obéie au lâcher : marcher, embarquer, rejoindre/former une escouade,
  attaquer, accoster, débarquer sur une côte, atterrir, parachuter ;
- **rien n'est grisé, tout se dit** — un refus garde la pièce en main, en rouge, avec la phrase ;
  lâchée quand même, elle fait non de la tête et rentre.

Seize cas dans le manuel de gauche, chacun jouable à la main ou en démonstration (une main
fantôme qui passe par la même porte `input` que la souris). ⌘Z annule le dernier ordre, et lui seul.

**Ce qu'il ne fait pas :** pas de serveur, pas de brouillard, pas de temps de jeu réel (une heure
de trajet = 1,1 s), combat déterministe de démonstration, mer et terre seulement (pas de relief).

## plateau-personnel/

Prototype du 18/10/2026 (v3) : **le plateau personnel et les gestes du ravitaillement** de la Mondiale
(ADR 0028 §3, §4, §7), pour en régler la fluidité avant tout code de jeu. Il emprunte la table, les
figurines et la boucle d'image de `pions/` (importés, non modifiés) ; plateau personnel et étiquettes
sont en DOM par-dessus la table, pictos dans `plateau-personnel/pictos/`.

**Lancer :** config `pions` de `.claude/launch.json` (port 5198), puis
`http://localhost:5198/WWS/prototypes/plateau-personnel/`. Les règles ont un contrôle :
`node WWS/prototypes/plateau-personnel/rules.check.mjs`.

**La grammaire,** celle des pions : une seule fonction (`interpret`, `rules.js`) lit la dépose
pendant le geste et la même réponse est obéie au lâcher.

- **des nombres et des barres, plus de piles.** Chaque bac montre le nombre exact et une barre jusqu'à
  son plafond : 400 + 600 par niveau d'entrepôt (départ : un entrepôt de niveau 1, soit 1 000). Un
  transport et un dépôt d'avant-poste ont **une seule charge maximale**, partagée librement entre
  munitions, pétrole et charbon : une barre découpée par couleur de ressource (l'encre des bacs), le
  total écrit (« 120 / 200 »). Camion 200, cargo 800, avion 120 ; dépôt 400 par niveau, au total. Les
  jetons ne servent qu'en animation : quelques pastilles volent pour montrer un flux (récolte, paiement,
  chargement), jamais pour compter ;
- **prendre :** glisser depuis un bac prend 10 ; l'appui maintenu accélère (10, puis 50 par 50) ; le
  nombre porté s'affiche sous la main. Munitions, pétrole et charbon se lâchent sur un transport
  (vivres et acier : refus) ;
- **où charger :** un camion au QG ou à un **entrepôt** (une tuile à poser sur le sol national), le cargo
  au port, l'avion à l'aérodrome ; hors du sol national, au dépôt de l'avant-poste où se tient le
  transport, en glissant depuis le dépôt. Sinon la pastille le dit (« Un camion se charge au QG ou à un
  entrepôt »). Les troupes (et les transports au repos) se rechargent seules sur le sol national ;
- **crans :** coups (cartouche) et plein (jerrican) se lisent en crans sous la figurine ; un cran coûte
  10 de la ressource. Coups/plein : infanterie 3/–, blindé 2/3, artillerie 2/2, camion –/4, cargo –/6
  (charbon), avion 2/3. Un cran ≈ 500 km, soit 11 unités de la carte ; un avion en couvre 3 fois plus.
  Le départ débite l'aller-retour des transports (l'aller des troupes) ; une route plus longue que les
  crans est refusée, avec les crans qu'il faut ;
- **placement libre :** plus de cercles d'emplacement. Une tuile se pose à la **position exacte** visée,
  sur le sol national ou dans le rayon d'un avant-poste, à 30 km au moins de tout autre bâtiment (QG,
  port, aérodrome compris) : « Trop près de l'usine : 30 km au moins ». La pastille montre la tuile
  fantôme pendant le geste, à l'endroit visé. Sur sa pareille (à portée d'aimant) elle devient
  « Élever » ; prix ×1,8 par niveau, il vole des bacs. Les régions ne donnent plus que la couleur du
  territoire ;
- **gisements :** 6 points sur la carte (terres ×2, fer ×2, charbon, pétrole, dont un dans le rayon de La
  Crête). Une exploitation ne se pose que sur un gisement libre (elle s'y aimante, les libres
  s'éclairent) : « Une exploitation se pose sur un gisement libre ». Un gisement, une exploitation ;
- **un transport chargé** se lâche sur un de ses avant-postes : « Livrer » (camion par la route, cargo
  vers un quai) ou « Larguer » (avion), aussi sur une escouade isolée. Lâché sur le QG ou un entrepôt, le
  camion y roule ;
- **une tournée** (jamais « convoi », jamais « route ») : le transport chargé, **Tab** (ou le bouton
  « tournée » à l'écran), lâché sur un premier dépôt, puis repris et lâché sur les arrêts suivants (4 au
  plus). **Elle part d'un point de chargement et y revient** : on ne l'enregistre que si le transport s'y
  tient (« Une tournée part d'un point de chargement : amenez le camion au QG ou à un entrepôt »), la
  boucle se ferme en le relâchant sur ce point, et le transport ne revient jamais à sa position d'avant.
  Ce qu'il portait devient la **consigne**, rechargée à chaque tour ; il dépose à chaque dépôt ce qui
  lui manque, **saute un dépôt plein**, revient, recommence, jusqu'à « rappeler ». Si les bacs manquent
  de jetons, il attend au point de chargement et une dépêche le dit. Avec l'avion, chaque arrêt est un
  largage et chaque tour coûte du plein. Temps accéléré : tant qu'une tournée tourne, les troupes ancrées
  vident les dépôts (20 munitions et 20 pétrole par membre toutes les 6 s) ;
- **pas de socle :** aucun disque permanent sous une troupe ou une escouade (masqué depuis
  `table.js:hideBases`, `pions/` intact) ; seuls restent les anneaux du geste ;
- **précision des mouvements :** l'avion décolle de la piste (retour au seuil, demi-tour, roulage,
  montée dans l'axe) et atterrit dessus (approche alignée, toucher, roulage, arrêt, parking) ; le
  navire s'écarte du quai en restant parallèle, arrive en biais puis se range le long du quai ;
- **rien n'est grisé** : un refus garde la pièce en main avec sa phrase, lâchée elle fait non et
  rentre. Réglage « anim. actives / réduites / coupées » (suivi par ces mouvements), `prefers-reduced-motion`
  respecté.

Douze cas dans le manuel, chacun jouable à la main ou en démonstration (main fantôme par la même porte
`input`) : la récolte, prendre dans un bac, charger un camion, les refus de charge, poser une tuile
(espacement, élever), l'exploitation sur un gisement, livrer (et les troupes ancrées), larguer depuis la
piste, le cargo qui accoste, un départ refusé faute de plein, la tournée qui part de l'entrepôt, le dépôt
plein sauté et les bacs à sec. « Remettre » rejoue la récolte.

**Ce qu'il ne fait pas :** pas de serveur ni de brouillard, pas d'embarquement de troupes ni de
formation d'escouade (voir `pions/`), pas d'interception ni de caisse au transport détruit, pas
d'artillerie sur la table (seulement ses chiffres), pas d'effet des bâtiments hors le plafond des bacs
(l'entrepôt) et le point de chargement, pas de rotation de la vue (glisser à vide fait défiler ;
pincement au téléphone, molette au bureau). Tous les chiffres (prix, capacités, rayons, crans, 30 km)
sont des `@a-mesurer`.
