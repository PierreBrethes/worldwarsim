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

**Ces effets sont calculés côté client, tirés au hasard, et ne lisent jamais l'état de la
partie.** Aucun ne dépend d'une position, d'un mouvement adverse, d'une saison. Deux joueurs ne
voient pas la même rafale, et c'est voulu. Ce qui sort d'un événement du joueur (envoi, arrivée,
combat) vient de ce qu'il reçoit déjà en dépêche : aucune information nouvelle, donc aucune
fuite (ADR 0005, brouillard).

## Ce que ce lot révise — 10/10/2026

**Le pilier « rien ne bouge sans raison » admet une deuxième exception : l'ambiance.** La
[recherche 3D du 08/09](../recherches/3d-2026-09-08.md) en faisait un pilier, la dérive des tirets
étant « l'unique exception », et écartait les particules continues ; le refus du 26/08 écartait la
météo visuelle. Décision de Pierre : la houle et les rafales entrent, sous deux garde-fous.

- **Contraste faible.** Le budget de contraste appartient à la couche de jeu (`WWS/CLAUDE.md`) :
  l'ambiance reste dans les encres sourdes du plateau, sous les fils, les pions et les mâts.
- **Rien qui ressemble à une information.** Un trait de vent ne doit pas pouvoir passer pour un
  fil, ni une silhouette pour un mouvement : les mouettes restent écartées.

L'encre des trajets, elle, ne révise rien : elle marque un moment, ce que la recherche du 08/09
recommandait. Le réglage « réduites » rend à qui le veut la carte du pilier d'origine.

## Cadence

- **L'ambiance (mer, vent) tourne à 12 images par seconde**, le temps passé aux shaders étant
  **quantifié** — même quand la carte rend à 60 pendant un geste. Saccade assumée comme un style
  (animer « à deux » : une pose toutes les deux images d'un film à 24). À confirmer à l'essai ;
  si la mer saccade pendant un pan, on la fige le temps du geste.
- **Trajets et caméra restent fluides.** Tirets qui coulent, tracé d'encre, inertie : plein débit.
- **Rendu à la demande** (`frame-demand.ts`, 05/10). L'ambiance demande **une image par pas de
  1/12 s**, pas une fenêtre d'activité de `SETTLE_MS`. Posée et sans effet actif, la carte
  retombe au battement. Elle ne casse l'économie de batterie que de ce pas-là, rien de plus.
- **Chiffrage réel au prototype**, mesure sur téléphone. Pas de budget annoncé d'avance.
- Comment : le temps est arrondi côté JS avant d'aller dans l'uniform (`floor(t × 12) / 12`),
  un seul endroit, partagé par la mer et le vent. Réf. : [temps quantifié, Remotion](https://www.remotion.dev/docs/posterization).

## Prototype 1 — Houle

**Essai 1, la trame de points à 45° — rejeté le 10/10 par Pierre** : « perturbant, ça fait mal
aux yeux ». Une trame fine et régulière sur toute la mer fatigue l'œil, quel que soit son
réglage ; la similigravure reste réservée aux images posées (la photo de presse du 08/09).

**Essai 2, la houle de teinte** : la mer garde sa marbrure de papier (`sea.ts`), et de larges
ondes de bruit l'éclaircissent et l'assombrissent dans l'amplitude même de la marbrure
(`SWELL_AMPLITUDE`), ancrées au plateau pour ne pas glisser pendant un pan, dérivant lentement
sur l'horloge d'ambiance. Aucun motif fin, donc rien qui scintille ni qui moire.

## Prototype 2 — Rafales

**Toutes les 1 à 3 minutes, au hasard, pendant ~4 s** : des traits d'encre — les traits de
vitesse de l'illustrateur — balaient l'écran sur une bande. **Au rapproché, les accessoires de
région (sapins, dunes…) ploient** au passage. **Visible à toutes les distances** : au lointain,
seuls les traits ; au rapproché, traits et accessoires.

- Direction et bande tirées au hasard à chaque rafale. L'écran, non la carte, porte les traits :
  ils ne dépendent pas du monde.
- Comment : un uniform de rafale (phase, direction), un décalage de sommet appliqué aux
  accessoires par `onBeforeCompile`, pondéré par la hauteur du sommet. Réf. :
  [balancement au vertex shader, forum three.js](https://discourse.threejs.org/t/generate-realistic-procedural-trees/65341).
- Risque : les accessoires sont instanciés dans `terrain.ts` ; le décalage doit rester dans le
  vertex shader, sans toucher aux matrices (pas de réécriture d'instances par image).

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

## Réglage « animations de la carte »

Quatre valeurs : **auto** (suit `prefers-reduced-motion`), **actives**, **réduites**, **coupées**.

| Valeur | Houle | Rafales | Tracé | Tirets, effet d'arrivée | Caméra, pousse des accessoires |
| --- | --- | --- | --- | --- | --- |
| actives | 12 i/s | oui | progressif | oui | animées |
| réduites | figée | non | instantané | gardés : ils informent | sautent à leur état final |
| coupées | figée | non | instantané | tirets figés, pas d'éclat | sautent à leur état final |

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
- **Drapeau qui flotte sur le QG.** Le sprite ondule en lacet. *Coût : peu ; un mât de plus à
  animer en permanence, donc rendu continu si visible.*
- **Terminateur jour/nuit en temps réel.** Ligne d'ombre qui suit l'heure réelle. *Coût :
  ambigu avec un jeu asynchrone sans horloge de partie ; il lirait l'heure, donc l'exclut du
  strict décor.* À garder pour la fin.

Deux idées ajoutées, tenant le 1940 et le décor pur :

- **Chute d'encre de la dépêche.** Une goutte ou un point d'encre tombe sur le rail à l'arrivée
  d'une dépêche. *Coût : nul pour le rendu de la carte ; à lier au télégraphe.*
- **Registre décalé.** Un léger défaut de calage entre l'encre des nations et le trait de côte,
  comme une impression à deux passes, qui bat à 12 i/s. *Coût : un décalage de quelques pixels ;
  à juger, il peut fatiguer.*

## À décider à l'essai

- Les 12 images par seconde donnent-elles un style ou une panne ? Sinon 15, ou mer figée
  pendant les gestes.
- La houle seule suffit-elle, ou la profondeur entre-t-elle ?
- Le coût sur téléphone tient-il sans le mode « réduites » ?
