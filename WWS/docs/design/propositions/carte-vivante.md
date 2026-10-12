# Carte vivante — mer, vent, encre

**Date : 10/10/2026. Statut : décidé, prototypes en cours.** Décisions de Pierre au grilling du
10/10. Trois prototypes à juger à l'œil, deux chantiers parqués, un catalogue d'idées. Aucune
règle de jeu touchée.

## But

Rendre la carte vivante par des effets dynamiques **légers**. Registre 1940 d'abord : encre,
gravure, trame de similigravure, saccade d'une bobine d'époque. Un autre registre seulement si le
1940 ne rend pas bien à l'essai. La DA ([doc 10](../10-direction-artistique.md)) a posé la mer
gravée et le grain ; il reste à les faire bouger.

## Règle : décor pur

**Ces effets sont calculés côté client et ne lisent jamais l'état de la partie.** Aucun ne dépend
d'une position, d'un mouvement adverse, d'une saison. Le vent, lui, est le même pour tous : une
fonction de l'heure réelle et d'une graine fixe, jamais du joueur. Ce qui sort d'un événement du joueur (envoi, arrivée,
combat) vient de ce qu'il reçoit déjà en dépêche : aucune information nouvelle, donc aucune
fuite (ADR 0005, brouillard).

## Ce que ce lot révise — 10/10/2026

**Le pilier « rien ne bouge sans raison » admet une deuxième exception : l'ambiance.** La
[recherche 3D du 08/09](../recherches/3d-2026-09-08.md) en faisait un pilier, la dérive des tirets
étant « l'unique exception », et écartait les particules continues ; le refus du 26/08 écartait la
météo visuelle. Décision de Pierre : la houle et le vent entrent, sous deux garde-fous.

- **Contraste faible.** Le budget de contraste appartient à la couche de jeu (`WWS/CLAUDE.md`) :
  l'ambiance reste dans les encres sourdes du plateau, sous les fils, les pions et les mâts.
- **Rien qui ressemble à une information.** Un trait de vent ne doit pas pouvoir passer pour un
  fil, ni une silhouette pour un mouvement : les mouettes restent écartées.

L'encre des trajets, elle, ne révise rien : elle marque un moment, ce que la recherche du 08/09
recommandait. Le réglage « réduites » rend à qui le veut la carte du pilier d'origine.

## Cadence

- **Chaque couche d'ambiance a sa cadence**, son temps **quantifié** à son pas même quand la
  carte rend à 60 pendant un geste : la houle à **12 images par seconde** (saccade de bobine,
  invisible sur une onde si lente), les rubans de vent à **30** — à 12 ils saccadaient, et le
  style moderne voulu par Pierre demande qu'ils coulent.
- **Trajets et caméra restent fluides.** Tirets qui coulent, tracé d'encre, inertie : plein débit.
- **Rendu à la demande** (`frame-demand.ts`, 05/10). L'ambiance demande **une image par pas de
  la couche la plus rapide**, pas une fenêtre d'activité de `SETTLE_MS`. Posée et sans effet actif, la carte
  retombe au battement. Elle ne casse l'économie de batterie que de ce pas-là, rien de plus.
- **Chiffrage réel au prototype**, mesure sur téléphone. Pas de budget annoncé d'avance.
- Comment : le temps est arrondi côté JS avant d'aller dans l'uniform (`floor(t × hz) / hz`),
  dans `ambience.ts`, au pas que chaque couche déclare (`hz`).

## Prototype 1 — Houle

**Essai 1, la trame de points à 45° — rejeté le 10/10 par Pierre** : « perturbant, ça fait mal
aux yeux ». Une trame fine et régulière sur toute la mer fatigue l'œil, quel que soit son
réglage ; la similigravure reste réservée aux images posées (la photo de presse du 08/09).

**Essai 2, la houle de teinte** : la mer garde sa marbrure de papier (`sea.ts`), et de larges
ondes de bruit l'éclaircissent et l'assombrissent dans l'amplitude même de la marbrure
(`SWELL_AMPLITUDE`), ancrées au plateau pour ne pas glisser pendant un pan, dérivant lentement
sur l'horloge d'ambiance. Aucun motif fin, donc rien qui scintille ni qui moire.

## Prototype 2 — Météo de vent

**Essai 1, les rafales à traits d'encre — rejeté le 10/10 par Pierre** : « ça fait un peu
cheap ». Il voulait plus moderne, « avec de belles courbes ». Deux démos (rubans enroulés, lignes
de flux d'une carte météo) ont mené au mélange retenu.

**Essai 2, la météo de vent** : des **rubans effilés** couleur papier — épais au milieu, bouts
ronds — qui suivent un **champ de vent continu** et s'enroulent d'eux-mêmes dans les dépressions.

- **Le même ciel pour tous** (`src/domain/weather.ts`, `windAt`) : une fonction pure de l'heure
  réelle et d'une graine fixe, sans aléa ni état de partie. C'est la base toute prête de la
  [météo jouable](#hors-lot--météo-jouable) : elle passera côté serveur telle quelle.
- **Le champ** : un fond par bandes climatiques (alizés d'est, vents d'ouest aux latitudes
  moyennes, retombée polaire), et six systèmes de pression nés et éteints de façon déterministe,
  qui **vivent ~45 min**, dérivent avec le fond et tournent selon l'hémisphère. Le ciel change
  pendant une session, sans frénésie.
- **Les rubans** sont ancrés au monde mais comptés en **pixels d'écran** (épaisseur, vitesse) et
  à **densité constante à l'écran** ; sous les fils et les pions. Leur naissance est tirée au
  hasard : seul le champ est déterministe.
- **Les accessoires de région ne ploient pas** : Pierre les juge à revoir (« un peu moches, là
  pour le fun ») ; leur flexion au vent attendra leur refonte.
- **Prototype** : `?weather=fast` accélère le ciel ×20, retiré avant la fusion.

## Prototype 3 — Encre des trajets

- **À l'envoi d'un mouvement** : la route se trace à l'encre, de la source à la cible, en
  800 ms d'un geste de plume. **Ce que le joueur a envoyé, et rien d'autre** : un retour, créé
  par la résolution, apparaît sans trait, comme l'aperçu de la visée. Comment : la polyligne
  recoupée à chaque image sous **un seul** `LineMaterial`, que le calque garde — en libérer un
  par image faisait recompiler son programme.
- **À l'arrivée** : un tampon rond sur la cible ; un combat, une éclaboussure dentelée au point
  de la passe. Une dépêche d'arrivée ne nomme pas son mouvement : le tampon se pose au bout du fil
  qui vient de disparaître, **et seulement si chaque fil disparu a sa dépêche** — sinon une
  attaque résolue dans le même instant volerait le tampon de la marche. Dans le doute, rien.
- **L'effet d'arrivée joue en direct seulement**, pour deux familles d'événements : l'arrivée
  de **ses propres mouvements**, et **les combats où le joueur est partie** (attaque ou
  défense). C'est exactement ce qu'il reçoit déjà en dépêche : aucune fuite.
- **Ce qu'on a manqué relève du rejeu** (surface 4.7), pas de cet effet. Rien ne se rejoue à la
  reconnexion.
- **Restent sobres** : l'aperçu en visée, le trajet en cours (tirets qui coulent) et les arcs
  adverses. Un arc adverse ne s'orne jamais, le brouillard l'interdit déjà structurellement.
- Vocabulaire : un *mouvement*, jamais un convoi ; la *passe de résolution*, jamais un tour.

## Prototype 4 — Courants et écume — 11/10/2026

Après le vent, la houle seule jurait. Pierre a proposé « une écume côtière + des courants qui
tracent les routes maritimes connues ». **Les courants, oui ; les routes, non** : une voie
maritime tracée ressemble à un fil de mouvement et se lirait comme un conseil de route, que le
routage du jeu ne suit pas. Un courant est de la nature, comme le vent.

- **Les courants** (`src/domain/currents.ts`, `currentAt`) : une climatologie fixe — cinq gyres
  à intensification ouest (Gulf Stream, Kuroshio, Brésil, Est-australien, Agulhas), courants
  équatoriaux et contre-courant, circumpolaire — animée de lents méandres, **même mer pour tous**
  (fonction de l'heure). Rubans du moteur du vent (`ribbons.ts`, style `CURRENT_RIBBONS`) : encre
  de mer, **filigrane** (validé à l'œil par Pierre : peu nombreux, longs, très pâles), sur l'eau
  seulement, sous le vent. Ni dérive nord-atlantique ni courant de Norvège pour l'instant : la
  mer du Nord n'a pas de courant.
- **L'écume** : un ressac de deux anneaux qui partent de la côte en pâlissant, boucle de 6 s,
  **au rapproché seulement** (fondu au seuil des régions). Une bande géométrique par pays laissait
  une couture là où deux côtes se croisent et des anneaux anguleux aux caps : l'écume lit
  désormais **un seul champ de distance à la côte** pour toute la mer (`coast-distance.ts`,
  transformée exacte sur la grille de routage, ~60 ms au chargement, lissée, en texture
  bilinéaire), et les côtes voisines se fondent d'elles-mêmes.
- **Le vent s'éclaircit au rapproché** : un tiers des rubans en vue pays, plein en vue monde.

## Réglage « animations de la carte »

Quatre valeurs : **auto** (suit `prefers-reduced-motion`), **actives**, **réduites**, **coupées**.

| Valeur | Mer (houle, écume ; courants) | Vent | Tracé | Tirets, effet d'arrivée | Caméra, pousse des accessoires |
| --- | --- | --- | --- | --- | --- |
| actives | 12 i/s ; courants 30 i/s | rubans, 30 i/s | progressif | oui | animées |
| réduites | figée, sans courants | pas de rubans | instantané | gardés : ils informent | sautent à leur état final |
| coupées | figée, sans courants | pas de rubans | instantané | tirets figés, pas d'éclat | sautent à leur état final |

La caméra et la pousse suivent le réglage, et non plus la seule requête système : choisir
« réduites » est une demande de moins de mouvement, et un vol de caméra en est un.

**Coupées : plus rien ne bouge, sauf la position du pion**, qui avance au battement de secours
— deux pas par seconde, c'est le prix d'une carte qui ne rend plus en continu. La carte revient
au rendu à la demande pur (`frame-demand.ts`). C'est aussi le **mode batterie**.

Le réglage est d'abord une préférence d'appareil comme les autres ; il passera au compte avec le
lot « Réglages au compte » ci-dessous.

## Prototype : l'interrupteur `?fx=`

`?fx=sea,wind,ink` dans l'URL allume **chaque effet seul**. **Absent : tous. Vide (`?fx=`) :
aucun**, pour comparer avant et après. **Retiré avant la fusion.** Il sert à juger à l'œil, pas à
régler les joueurs : le réglage ci-dessus est la seule porte durable.

## Hors lot — Météo jouable

Idée de Pierre, **parquée en chantier séparé** (grilling puis ADR). Tempête en mer : bateaux à
80 %. Tempête de sable au Sahara : troupes à découvert entamées. Elle touche les règles, donc
n'a rien à faire dans ce lot décoratif. Conflits déjà repérés :

- `regionType` est **factice** (hachage du nom) : le Sahara n'existe pas encore comme désert
  fiable.
- Un dégât périodique est un **tick**, banni ; et sans soin, une troupe entamée le reste.
- Un joueur absent ne peut pas s'abriter : **annonce à l'avance**, bulletin dans l'édition de
  presse des 3 h.
- L'arrivée est datée au départ : **seuls les départs pendant l'alerte sont ralentis**.
- Le combat n'a pas d'aléa : **hasard ou calendrier public**, à trancher.

Point de départ : le **bulletin météo M8** du [tri des mécaniques du 29/08](../recherches/mecaniques-2026-08-29-tri.md)
— un événement par jour, annoncé une passe à l'avance, effet en règle dure.

Le refus du 26/08 (« météo/saisons, une simulation pour un effet cosmétique ») tenait tant que
c'était cosmétique ; ici l'idée est une règle, d'où le chantier à part.

## Hors lot — Réglages au compte

Passer les réglages de `localStorage` en base : **lot séparé**. Partage arrêté :

- **Compte** : mappage souris, son du télégraphe, préférences de notification, animations de la
  carte, « déjà vu », indicateurs.
- **Appareil** : échelle du HUD, disposition des fenêtres, bandeaux repliés, abonnement push.

Règle de partage : ce qui est la main du joueur suit le compte, ce qui est l'écran reste local.

## Catalogue des idées non prototypées

Toutes en décor pur. Une ligne de quoi, une ligne de coût.

- **Grain et vignettage d'écran** (doc 10). Post-traitement papier-journal sur toute l'image.
  *Coût : une passe plein écran ; peut animer le grain à 12 i/s « sur deux ».*
- **Isobathes à l'encre.** Traits pleins de gravure de carte ancienne, déjà dans le prototype
  Journal 1947. *Coût : géométrie suivant la côte, donc ne pas les cuire en texels (cf. `sea.ts`).*
- **Ombres de nuages qui passent.** Taches de trame plus dense qui glissent sur terre et mer.
  *Coût : un masque de bruit de plus ; risque de salir la lecture des régions.*
- **Fumée de bataille.** Panache d'encre au lieu d'un éclat, sur un combat où le joueur est
  partie. *Coût : particules ; même règle de direct seulement que l'arrivée.*
- **Accessoires qui ploient au vent local.** Sapins et dunes inclinés selon `windAt` là où ils
  sont, plus fort sous une dépression. *Coût : faible (vertex shader) ; attend la refonte des
  accessoires.*
- **Drapeau qui flotte sur le QG.** Le sprite ondule en lacet. *Coût : peu ; un mât de plus à
  animer en permanence, donc rendu continu si visible.*
- **Terminateur jour/nuit en temps réel.** Ligne d'ombre qui suit l'heure réelle. *Coût :
  faible ; il lit l'heure comme le vent, la même pour tous, mais dans un jeu sans horloge de
  partie une nuit sur la carte pourrait se lire comme un rythme de jeu.* À garder pour la fin.

Deux idées ajoutées, tenant le 1940 et le décor pur :

- **Chute d'encre de la dépêche.** Une goutte ou un point d'encre tombe sur le rail à l'arrivée
  d'une dépêche. *Coût : nul pour le rendu de la carte ; à lier au télégraphe.*
- **Registre décalé.** Un léger défaut de calage entre l'encre des nations et le trait de côte,
  comme une impression à deux passes, qui bat à 12 i/s. *Coût : un décalage de quelques pixels ;
  à juger, il peut fatiguer.*

## À décider à l'essai

- La houle à 12 images par seconde se voit-elle saccader pendant un pan ?
- Le nombre, l'épaisseur et l'opacité des rubans (`wind.ts`) : présents sans voler la lecture
  des fils et des frontières ?
- Le coût des rubans à 30 images par seconde tient-il sur téléphone sans le mode « réduites » ?
