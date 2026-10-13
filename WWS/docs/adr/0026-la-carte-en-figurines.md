# ADR 0026 — La carte en figurines

**Statut :** acceptée (12/10/2026) — **révise la décision du 30/08** « la carte au clic droit
agit, la popin lit » sur deux points : le cartouche d'une troupe à soi (`TroopBadge`) et l'armement
de la visée ; et la [fiche 10](../design/10-direction-artistique.md) sur les unités (« silhouettes
à plat, encre unique »). Restent fermés : la grammaire de la souris et ses quatre invariants
(`src/domain/mouse-mapping.ts`), le brouillard (ADR 0005, 0021, 0024 §1), la rose qui sort de la
même fonction que le refus du serveur (ADR 0015). **Aucune règle de jeu ne change.**

## Contexte

L'audit visuel du 12/10/2026 a relevé quatre registres d'image côte à côte sur le plateau : la
photo détourée du char, les rendus isométriques des bâtiments et des camions, les pictos plats des
régions, les traits blancs du vent. Les planches flottent, faute d'ombre ; c'est le risque
« bancal » de la fiche 10, déplacé de la carte vers les assets. Huit versions d'un prototype
autonome ([`prototypes/table-etat-major.html`](../../prototypes/table-etat-major.html)) puis un
grilling en quatre tours ont fixé ce qui suit. Le détail, les lots et les pistes vivent dans la
proposition [table-etat-major](../design/propositions/table-etat-major.md).

## Décision

### 1. Sur la carte, ses troupes sont des figurines

Une **figurine** est un modèle peint, posé sur la carte sans socle, avec son ombre. Les
**planches** 2D de `src/emblems/` cessent d'être affichées sur la carte et restent partout
ailleurs : abaque, modale de site, dépêches — elles sont le catalogue et la référence. Les
bâtiments suivent : des **maquettes** fidèles à leurs planches, les mêmes pour toutes les nations.

### 2. Les figurines sont faites d'après les planches, sur un gabarit commun

**Précisé le 12/10, au premier essai** : les figurines sortent de **Claude Design**, une
conversation par rôle et par nation, sur un **gabarit de prompt commun** — y en haut, avant vers
+z, origine au sol, la longueur fixée par rôle, un plafond de triangles, des pièces nommées à
leur pivot et des repères `fx_*` pour les effets — et entrent dans le dépôt en GLB, à côté de leur
planche. Le gabarit est ce qui empêche le style de dériver ; un test tient chaque fichier à son
plafond et à ses noms. Le code reste la seconde source, quand un rôle n'a pas encore de modèle
(le soldat provisoire du lot 1). Le premier essai, un M5 Stuart, a convaincu : plus fidèle que les
primitives du prototype. Peinture militaire réelle ; la nation
se lit aux détails (cocardes, gouvernail), et sous le brouillard on ne voit de figurines que les
siennes. **L'infanterie suit le même chemin** : le soldat de Claude Design exporte une hiérarchie de
groupes nommés à leurs articulations, que le code pose (trois par troupe, en marche, à genou…).
La piste d'un corps humain libre de droits (CC0) est abandonnée : aucun candidat ne tenait le
budget, et le premier soldat de Claude Design tient en 2 380 triangles.
Un rôle sans figurine retombe sur la silhouette de domaine, comme une planche manquante
aujourd'hui.

### 3. Figurines au rapproché, silhouettes au loin

Les figurines sont pleines sous 30 unités de distance, absentes au-delà de 65, en fondu entre les
deux — les seuils des régions admin-1. Au loin, la silhouette de domaine reste la lecture
stratégique.

### 4. Tout ce qui est adverse est un bloc vu de dos

Une force adverse relevée, posée ou en mouvement, est un **bloc** dont on ne voit que l'envers,
avec un pictogramme de domaine sur le dos. Il ne dit que ce que le relevé sert déjà — une position,
un milieu, un cap et des dates — et rien de plus : ni type, ni composition, ni nation. Une dernière
position connue est un bloc délavé. Un relevé qui apparaît sous les yeux du joueur se pose sur la
carte d'un geste de main ; au chargement, tout est déjà posé.

### 5. Une pile se lit en groupes, et ses figurines disent la force

Sur ses propres pièces seulement :

- **un groupe de figurines par rôle présent**, les trois plus nombreux et un jeton « +N » au-delà ;
- **trois figurines par troupe d'infanterie**, un véhicule par troupe ;
- **un jeton** « ×N » au pied d'un groupe quand le rôle compte plus d'une troupe — pas de jeton,
  troupe seule ;
- **les figurines disent la force cumulée** du groupe : 3, 2 ou 1 par tiers de la force nominale ;
  un véhicule fume sous deux tiers, fume épais et noircit sous un tiers ;
- **seules les marques présentes se montrent** : une pile tout MK1 n'a que des figurines MK1 ;
  une pile mixte répartit au prorata, au moins une de chaque.

### 6. On lève la pièce, on la pose — révision du 30/08, précisée le 13/10

**Lever**, c'est le clic gauche net sur une de ses piles : une main fermée la prend et la pièce
suit le pointeur, l'original reste délavé. **Lever ne fait que lever** : la pièce en main suffit
à dire qu'un ordre est armé. Il n'y a ni cartouche ni bandeau.

**Ce qu'on lève.** Un clic sur un groupe de figurines prend ce groupe seul. Un clic sur
l'étiquette ou sur un jeton prend toute la pile. Maj + clic ajoute un autre groupe de la même
pile. Pièce en main, la fiche s'ouvre **sur le côté**, avec les cases du panneau de garnison :
cocher ou décocher y ajuste la composition sans lâcher la pièce.

**La route est celle du serveur, jamais une courbe à part.** Tant que le pointeur bouge, aucun
trait n'est montré. Quand il s'arrête un court instant, la route et l'heure de
`movements.preview` s'affichent. Une seule demande est en vol, et une réponse périmée est
ignorée.

**Poser**, c'est le clic gauche pièce en main : il révise l'invariant « le clic net gauche lit »
(`src/domain/mouse-mapping.ts`), qui ne vaut plus que pièce posée. La pose ouvre la rose au
point de pose avec les seuls ordres possibles ; s'il n'y en a qu'un, on passe directement à
« envoyer — irréversible ». Rien n'est deviné à la place du joueur. Échap, ou un clic sur la
pièce levée, la repose chez elle. Seul le serveur date un mouvement.

**Au toucher**, un tap lève la pièce et ouvre sa fiche sur le côté, un tap sur la carte la pose,
un tap sur la pièce levée la repose. La fiche ne bloque pas la pose. La main ne se montre qu'à
la souris.

**La fiche au survol remplace le cartouche** d'une troupe à soi : une ligne par rôle, la vie sur
100, la charge. Le bloc adverse garde un cartouche au clic.

### 7. Le rejeu s'en sert sans lever le brouillard

Le rejeu (surface 4.7) se lance depuis la dépêche du combat, jamais seul. La caméra voyage
jusqu'au lieu, une main place les pièces des deux camps, puis la passe se joue : les deux salves
partent ensemble, les pertes tombent ensemble, la déroute se lit après. **En face, des blocs et
les totaux que `CombatReport` sert déjà** ; chez soi, le détail par rôle, qui demande un champ
réservé au camp du joueur. Les tirs de `strikes` portent les rôles des deux camps : un rejeu qui les
lirait devra les filtrer par camp.

### 8. Le réglage d'animations commande les figurines

`actives / réduites / coupées` vaut pour elles comme pour la carte vivante : réduites, ni
balancement ni main animée, poses et tampons immédiats ; coupées, le rejeu saute au compte rendu.
La lumière est douce, teintée comme une lampe, et porte les ombres ; le vrai système de lumière
attend le chantier jour et nuit.

## Ce qu'on abandonne

- **Les planches sur la carte** : le pion-planche des mouvements (`Pawn`) au rapproché, et les
  étiquettes DOM des troupes posées et des bâtiments (`MapLabels.tsx`) — elles ne restent qu'au
  loin, en silhouettes.
- **Le visage unique d'une pile** : `representativeRole` cesse de décider ce qu'on voit au
  rapproché, où chaque rôle a son groupe.
- **Le cartouche d'une troupe à soi** et l'armement de la visée par la lecture suivie d'un clic
  « agir » ailleurs : la pièce levée porte désormais l'état armé.
- **Un catalogue d'images pour habiller la carte** : chaque rôle et chaque nation deviennent un
  modèle à produire et à tenir — environ neuf rôles et huit nations, sur un gabarit qui ne vaut que
  s'il est suivi.
- **La table autour du plateau** (bois, lampe, vignettage), essayée dans le prototype et refusée.

## Conséquences

- **Le brouillard ne bouge pas**, et c'est vérifiable : le bloc n'a structurellement aucun champ
  de plus que le relevé, et la seule donnée nouvelle servie — le détail par rôle du rejeu — ne
  concerne que le camp du joueur.
- **Les troupes posées deviennent un rendu du moteur** et non plus du DOM : jusqu'à 24 troupes,
  soit environ soixante-dix figurines, instanciées, sous les règles de `frame-demand` (toute
  animation continue se déclare, toute méthode publique qui change l'image invalide).
- **L'ordre des lots** — fondation, troupes posées, blocs, lever-poser, autres nations, bâtiments,
  rejeu, décor — est dans la proposition ; chacun se livre et se joue seul.
