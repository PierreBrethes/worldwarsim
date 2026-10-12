# Table d'état-major — figurines, piles, fiche

**Date : 12/10/2026. Statut : convenu sur prototype et grillé le 12/10 ; ADR 0026 à écrire
avant toute ligne dans `src/`.** Décisions de Pierre au fil de six versions du prototype
[`prototypes/table-etat-major.html`](../../../prototypes/table-etat-major.html) (aussi publié en
artifact). La carte du prototype est inventée et rien n'y lit une partie.

## Constat de départ

L'audit visuel du 12/10 sur le plateau réel a relevé **quatre registres d'image côte à côte** :
le char est une photo détourée, les bâtiments et les camions des objectifs sont des rendus
isométriques, les accessoires de région des pictos plats, le vent des traits blancs lisses. C'est
le risque « bancal » de la [fiche 10](../10-direction-artistique.md), déplacé de la carte vers les
assets. S'y ajoutent des planches qui flottent (billboards sans ombre portée), un vent plus
contrasté que la couche de jeu, des étiquettes de carte en mono sans fond qui bavent sur le sol,
et une vue monde vide sur un fond brun.

## Direction

**Le plateau devient une table d'état-major de 1940** : une carte gravée posée sur une table en
bois, sous une lampe, et des pièces peintes posées dessus. C'est le registre presse illustrée
rendu physique, pas un nouveau registre.

## Convenu

### Les pièces

1. **Les figurines sont écrites en code, d'après les planches actuelles.** Les sprites de
   `src/emblems/units/` deviennent des **références**, plus des images affichées. Un kit par rôle
   (caisse, chenilles, tourelle, ailes, coque…), une fiche de réglages par nation. Écartés :
   Claude Design, qui ne produit pas de 3D, et les générateurs image-vers-3D, qui recopient la
   photo et ramènent le mélange de registres.
2. **Peinture militaire réelle**, camouflage compris. La nation se lit aux détails (cocardes,
   gouvernail tricolore) ; sous le brouillard on ne voit de figurines que les siennes, la
   nation n'a donc pas à porter la propriété.
3. **Pas de socle sous les troupes**, une ombre de contact à la place. Les installations
   (bâtiments, avant-postes) gardent leur plinthe.
4. **L'adversaire est un bloc de wargame vu de dos** : on ne voit que l'envers, ce qui est
   exactement ce que le brouillard laisse savoir. Une dernière position connue est un bloc
   délavé sur un cercle pointillé.
5. **Le char et l'avion sont jugés fidèles** ; leur fidélité montera par passes
   (camouflage dessiné d'après la planche plutôt qu'en bruit, rivets, outils de bord, arêtes
   arrondies des pièces moulées).

### L'infanterie

6. **Trois figurines par troupe d'infanterie, les véhicules seuls** : l'escouade a l'emprise
   d'un char.
7. **Un kit de fantassin habillé par nation** (`UNIFORMS` dans le prototype) : casque, coupe
   (capote ou vareuse), jambes (molletières, bottes, guêtres), cuirs et équipement, fusil. Le
   casque porte l'essentiel de l'identité : Adrian à cimier, Stahlhelm, Brodie.
8. **Seules les marques présentes se montrent.** Une pile tout MK1 n'a que des figurines MK1, tout
   MK2 que des MK2 ; une pile mixte répartit au prorata, au moins une de chaque. Le MK2 français
   est le porteur de bazooka à genou de sa planche, posé devant.

### Les piles et la force

9. **Une pile montre un groupe de figurines par rôle présent**, plus seulement le rôle
   majoritaire (`representativeRole`). Au-delà de trois rôles : les trois plus nombreux et un
   jeton « +N ».
10. **Un jeton de bois « ×N » au pied d'un groupe quand le rôle compte plus d'une troupe.** Pas
    de jeton : troupe seule.
11. **Les figurines disent la force** : 3, 2 ou 1 par tranche d'un tiers de la force nominale,
    cumulée sur le groupe (`StationGroup.strength / nominalStrength`).

### La fiche au survol

12. **Survoler une pièce ouvre sa fiche**, sur une emprise de survol invisible qui couvre aussi
    l'espace entre les figurines d'une pile.
13. **Une ligne par rôle**, compteur et **vie sur 100 en dix crans** : encre, ocre sous 67, rouge
    à 33 et moins.
14. **La charge** : barre graduée, un segment par ressource dans ses encres papier, icônes et
    quantités dessous. **Pendant un chargement** des hachures défilent, la ligne dit « chargement
    · reste 0 h 32 », et une caisse tombe près de la pile à chaque quart.

### Ce qui bouge

15. **Une animation dit un état, jamais rien** : la fumée de cheminée dit « relié », et sa
    coupure s'accompagne du tampon « hors réseau » ; l'ombre de l'avion dit son altitude ; le
    sillage dit la mer ; le trajet se trace à l'encre ; le tampon « arrivé » tombe à l'arrivée ;
    le rayon d'un avant-poste se dessine à la fondation.
16. **Les cartouches presse s'ancrent à leur pièce**, avec une tige, plutôt que des étiquettes
    posées sur le sol.

## Grilling du 12/10 — tranché

**Tour 1.**

- **Le rejeu commence par un voyage** : la caméra glisse jusqu'au lieu de l'engagement, en
  accélération et décélération douces ; puis une main **place** les pièces des deux camps à leur
  position du combat, comme pour la pose des relevés — elles ont pu bouger depuis. Le combat
  lui-même se jugera au développement.
- **L'humain est un corps sculpté une fois** (GLB, posable), habillé par nation en code.
- **Figurines au rapproché, silhouettes de domaine au loin**, avec un fondu au seuil.
- **Tout ce qui est adverse est un bloc vu de dos**, posé ou en mouvement : un mouvement adverse
  relevé est un bloc qui glisse sur son tronçon, un pictogramme de domaine gravé sur le dos.
- **Lever-poser remplace le flux actuel.** Lever = le clic net qui lit (le gauche, invariant) ;
  poser = le clic « agir » (droit par défaut, réglable) puis la rose ; Échap repose. Révise la
  décision du 30/08.
- **La fiche au survol remplace le cartouche** des troupes à soi ; le bloc adverse garde un
  cartouche au clic.
- **Le jeton de bois « ×N »** est retenu, son dessin est à reprendre.
- **Pas de table autour du plateau** (Pierre : « pas fan ») : ni bois, ni lampe, ni vignettage.
- **Le jour et la nuit sont un lot à part**, après les figurines.
- **Les planches 2D restent hors de la carte** : abaque, modale de site, dépêches. La carte seule
  passe aux figurines.

**Tour 2.**

- **Lumière douce, teintée comme la lampe** (légèrement jaune), avec les ombres portées des
  figurines. Le vrai système de lumière se cherchera avec le chantier jour et nuit.
- **Les bâtiments deviennent des maquettes en code**, fidèles à leurs planches, d'autant que ce
  sont les mêmes bâtiments pour toutes les nations ; lot après les troupes.
- **Le corps humain vient d'un modèle libre de droits (CC0) avec squelette**, posé en code par ses
  os et retouché pour nos proportions ; candidats et licences à présenter.
- **Le seuil des figurines suit les régions admin-1** (pleines sous 30, absentes au-delà de 65), à
  tester.
- **Lever prend toute la pile** ; si le panneau de garnison est ouvert avec une composition, lever
  prend cette composition.
- **Pièce en main : une courbe locale indicative**, puis la vraie route et l'heure de
  `movements.preview` à la pose, avant « envoyer — irréversible ».
- **Le rejeu sert le détail de mon seul camp** par rôle (champ réservé au camp du joueur dans
  `CombatReport`) ; l'adversaire reste en totaux.

**Tour 3.**

- **Les lots, dans l'ordre**, chacun livrable et jouable seul :
  1. **fondation** — module figurines du moteur (kit, instanciation, ombre de contact, lumière,
     fondu au seuil), qui habille d'abord ses propres mouvements, France complète, les autres
     nations sur la silhouette de domaine ;
  2. **troupes posées** — figurines à la place des étiquettes DOM, piles (groupe par rôle, jeton,
     force, MK présents), fiche au survol à la place du cartouche ;
  3. **l'adversaire en blocs** — forces posées et mouvements relevés, pose animée par la main ;
  4. **lever-poser**, à la place du flux de visée ;
  5. **les autres nations**, rôle par rôle, et l'infanterie sur le corps CC0 (en parallèle de 2 à 4) ;
  6. **bâtiments en maquettes** ;
  7. **rejeu 4.7** ;
  8. **décor** — gravure par relevé, chantier qui monte, terrain au survol (après la vraie
     classification), puis jour et nuit.
- **Une ADR 0026 « La carte en figurines »**, avec ce qu'on abandonne ; elle porte la révision du
  30/08 (lever-poser, fiche au survol). La fiche 10 y renvoie.
- **Au toucher** : un tap sur sa troupe la lève et ouvre sa fiche, un tap sur la carte pose et
  ouvre la rose, un tap sur la pièce levée la repose ; la main ne se montre qu'à la souris.
- **Le rejeu se lance depuis la dépêche du combat** (« rejouer »), jamais seul ; la dépêche toast
  le porte aussi si l'on est sur la carte au moment du combat.
- **Le réglage `actives / réduites / coupées` commande les figurines** : réduites, ni balancement
  ni main animée, poses et tampons immédiats ; coupées, le rejeu saute au compte rendu.

**Faits relevés pour la suite** : seuls les mouvements sont aujourd'hui en 3D (un `Pawn` par arc,
six mouvements au plus par joueur) ; les troupes posées et les bâtiments sont des étiquettes DOM
(`MapLabels.tsx`) — jusqu'à 24 troupes, soit environ 70 figurines à instancier ; les régions
admin-1 apparaissent entre 65 et 30 unités de distance.

**Tour 4.**

- **Une troupe faible dans une pile ne fait tomber aucune figurine** : la carte suit la force
  cumulée ; la fiche marque d'un cran rouge le rôle qui contient une troupe sous un tiers, et le
  panneau de garnison garde le détail.
- **La santé d'un véhicule** : fumée fine sous deux tiers, fumée épaisse et coque noircie sous un
  tiers ; sur ses propres pièces seulement.
- **Les caisses d'une pile qui charge restent** : c'est sa propre information, l'adversaire ne
  voit qu'un bloc ; la spec le dit.

## Pour le développement

- **Le moteur** : instanciation (24 troupes au plafond, trois figurines chacune), les règles de
  `frame-demand` (une fumée continue est une couche d'`Ambience` ou se déclare comme
  `arcs.isFlowing`), chaque méthode publique qui change l'image commence par `invalidate()`.
- **CSS** : la classe `loading` de la fiche entrait en collision avec l'écran de chargement du
  prototype, et `display: grid` écrasait `hidden` ; à scoper dans `src/`.
- **Le prototype pose la pièce levée sur un plan relevé**, pas sur la carte : en jeu, viser la carte
  et compenser la hauteur de la pièce.
- **Le vent** : l'audit du 12/10 le trouvait plus contrasté que la couche de jeu ; à reprendre
  avec les figurines.

## Pistes proposées le 12/10, non décidées

### Décor pur — aucune règle touchée

Avis de Pierre du 12/10 entre crochets.

- **La carte se grave à mesure qu'on la relève.** [*Aime l'idée, à juger au rendu.*] Les trois
  états de l'ADR 0020 §5 deviennent trois stades de gravure : *vierge* au crayon, sans encre ;
  *relevée* gravée et délavée avec l'âge ; *à jour* à l'encre fraîche. C'est la lecture
  existante, rendue matière.
- **Jour et nuit décoratifs** : voir ci-dessous.
- **La presse tombe sur la table** à chaque édition (toutes les 3 h), et les dépêches
  s'empilent en feuilles au bord de la carte. [*Parqué : Pierre ne sait pas s'il veut sortir de
  la carte pour le jeu.*]
- **Le rejeu de combat** (surface 4.7) joué par les figurines, sur le compte rendu, sans
  re-résoudre : elles se font face, éclairs de bouche, celles perdues tombent. [*Oui.*]
  **Prototypé le 12/10** (version 8), en quatre temps : mise en place — ma ligne entre, et le bloc
  relevé se dédouble en autant de blocs que le compte rendu compte de troupes adverses ; salves
  simultanées — éclairs et tirs d'encre partent **ensemble** des deux lignes, les pertes tombent
  ensemble (une figurine couchée, le char qui fume, un bloc renversé) ; déroute — lue une fois
  après, les blocs déroutés reculent et pâlissent ; compte rendu — tampon « terrain tenu », la
  phrase même de la dépêche, le tableau chez moi / en face. **Le brouillard tient** : en face,
  rien que ce que `CombatReport` sert (troupes, pertes, déroutes, détruites), jamais un rôle ;
  chez moi, le détail par rôle. Le brief 4.7 (« trois à quatre passes », « pertes par rôle »,
  « piles des deux camps ») est antérieur à la révision du 16/09 et à ce cloisonnement : une seule
  passe aujourd'hui, et la composition adverse reste à décider — le rejeu ne peut pas la montrer
  tant que rien ne l'autorise. Les tirs de `strikes` (rôles des deux camps) ne sont servis à
  personne : un rejeu qui les lirait devra les filtrer par camp.
  [*Pierre adore l'idée ; il manque une étape au déroulé — laquelle, à dire au grilling.*]
- **Le chantier monte** : échafaudage, puis le bâtiment qui pousse dans un nuage de plâtre ; un
  recrutement fini fait sortir les figurines de la caserne. [*Oui.*]
- **Ce qu'on relève se pose sur la table.** [*D'accord, précisé.*] Quand un relevé adverse
  apparaît **sous les yeux du joueur** — bloc d'une force, mât d'une installation relevée —, il
  descend sur la carte avec un petit choc et un balancement, comme posé par une main. En direct
  seulement, comme l'encre d'arrivée : au chargement de la carte, tout est déjà posé.
- **Les dessins de terrain au survol d'une région** (idée de Pierre, qui remplace le relief en
  hachures et les accessoires 3D jugés « moches » le 10/10). Au survol, des pictogrammes gravés
  de cartographe se dessinent dans la région — sapins pour la forêt, monts hachurés pour la
  montagne, dunes, palmiers, touffes de toundra —, tracés à la plume, puis s'effacent en
  quittant. **Prérequis : la vraie classification** (ETOPO, Köppen-Geiger, landcover dans
  `scripts/generer-regions.mjs`, décidée mais pas écrite) : `regionType` est aujourd'hui un
  hachage du nom, et le dessiner en grand rendrait le faux visible. Décor seulement — la fiche 08
  reste « ni grille, ni terrain ».
  **Prototypé le 12/10** sur la carte inventée : six jeux de pictogrammes tracés à la plume
  (≈ 0,6 s, décalés du centre vers les bords), fondu de sortie, lavis léger de la région, infobulle
  nom et terrain ; le calque n'est redessiné que pendant l'animation. [*Pierre adore l'idée ; certains
  dessins seront retravaillés.*]

### Lever la pièce et la poser ailleurs — proposé par Pierre

**Prototypé le 12/10** (version 7 du prototype) : clic net sur une de ses troupes, une main la
pince et la porte, l'original reste délavé ; l'aperçu d'arc suit, ocre sur terre et rouge en mer ;
la pose ouvre la rose — « marcher » et « fonder un avant-poste » sur terre, « attaquer » seul
près d'une force relevée, et en mer aucune branche mais la phrase « une troupe à pied ne prend
pas la mer » ; « envoyer — irréversible » lance le mouvement ; Échap, clic droit ou clic hors de
la rose reposent la pièce chez elle. **Les deux idées se renforcent** : pièce en main, le terrain
survolé se dessine sous elle.

Comme aux échecs : un clic gauche **lève** la figurine, qui suit la souris tenue par une main ;
un clic ailleurs la **pose** ; la pose ouvre la confirmation du trajet, et l'envoi lance le
mouvement. La pièce d'origine reste en place, délavée, tant que l'ordre n'est pas parti.

À trancher, parce que la grammaire de la souris est réglée
(`src/domain/mouse-mapping.ts`, décision du 30/08 et retour du 11/09) :

- **La pose remplace-t-elle le clic « agir » ?** Aujourd'hui le clic gauche sur une troupe
  ouvre le cartouche et arme déjà la visée ; la destination se nomme au clic « agir », ailleurs.
  Lever-poser fait du clic gauche suivant une pose, et non plus une lecture : il faut dire ce que
  devient le clic gauche sur la carte pendant que la pièce est levée.
- **La rose survit à la pose** : une destination offre plusieurs ordres (marcher, attaquer,
  piller, fonder, embarquer…). Poser = ouvrir la rose au point de pose, puis l'aperçu d'arc et
  « envoyer — irréversible » comme aujourd'hui.
- **Que lève-t-on dans une pile ?** Toute la pile, un groupe de rôle, ou ce que le panneau de
  garnison a composé.
- **L'aperçu suit-il la main ?** `movements.preview` est un Dijkstra serveur (13 à 125 ms) :
  au survol il faut le brider (quelques par seconde) ou ne le demander qu'à la pose.
- **Le curseur « main »** rejoint les cinq curseurs dessinés et jamais branchés
  (`public/cursors/`, fiche 10).

### Jour et nuit — proposé par Pierre

**En décor, c'est compatible tel quel** avec la règle de la [carte vivante](carte-vivante.md) :
le ciel est une fonction pure de l'heure du serveur, le même pour tous. La nuit, la lampe de la
table reste seule, les figurines et les bâtiments portent leurs feux (phares des chars,
fenêtres des usines, feux de navigation rouge et vert, feu clignotant des avions, lanterne de
l'escouade) et les villes s'allument en points d'encre dorée.

**Une précaution même en décor : la période ne doit pas diviser 24 h.** Deux heures de jour et
deux de nuit font six cycles par jour : celui qui joue chaque soir à 20 h verrait toujours la même
phase. Une période qui dérive (2 h 30 + 2 h 30, par exemple) fait tourner la phase d'un jour à
l'autre.

**En règle (« réduire la visibilité »), c'est un autre chantier**, à ranger avec la météo jouable
(note de mémoire du 10/10) sous une ADR :

- **Les bonus cassent une règle**, ils ne modifient pas un pourcentage : « portée de détection
  −30 % la nuit » est exclu par la première des trois règles. Formes qui cassent une règle :
  *de nuit, une force posée n'est plus relevée* (seules les colonnes le sont), ou *un relevé de
  nuit ne donne pas le cap*.
- **L'asynchrone** : la nuit doit être publique et calculable d'avance, sans quoi un absent subit
  ce qu'il n'a pas pu voir venir. La période qui dérive est ici obligatoire, pas une précaution.
- **La faisabilité est bonne** : un cycle fonction pure du temps se découpe d'avance dans les
  fenêtres de `sightings` et `campSightings`, calculées aux événements — aucune horloge à
  ajouter.
