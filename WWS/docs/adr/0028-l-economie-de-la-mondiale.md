# ADR 0028 — L'économie de la Mondiale : cinq ressources, la logistique par les pièces

**Statut :** acceptée (18/10/2026, grilling de la proposition
[Mondiale : économie, logistique, escouades](../design/propositions/mondiale-economie-logistique-escouades.md)
avec Pierre). Elle donne une forme à l'[ADR 0027](0027-la-mondiale-au-centre.md) §5. Elle **révise
l'[ADR 0015](0015-economie-v2-ressources-localisees.md)** (huit ressources, quinze bâtiments, le QG
comme verrou, le verrou local du 04/09), **précise l'[ADR 0025](0025-capacite-encombrement-et-embarquement-de-proximite.md)**
(un transport porte aussi des jetons), **révise l'[ADR 0026](0026-la-carte-en-figurines.md)**
(révision du 16/10, « toutes troupes visibles »), la décision 66a (port et aérodrome au QG 2), la
ressource R1 et l'usine R5 de
[gameplay deux modes](../design/propositions/gameplay-deux-modes-2026-10-14.md), et le relais de la
fiche 03. **Mondiale seule** : la Blitz garde ses fonds et tire sans compter. Rien n'est codé au
18/10, et tous les chiffres sont `@a-mesurer`.

> **Précisée le 18/10/2026, après le prototype du plateau personnel** (Q19 à Q26 de la
> [proposition](../design/propositions/mondiale-economie-logistique-escouades.md)) :
> - **où charger** (§4) : un camion à un de ses bâtiments du sol national, un cargo au port, un
>   avion à l'aérodrome ; ailleurs, au dépôt où il se tient. Un transport ne prend ni vivres ni
>   acier ;
> - **des crans** (§3) : coups et plein se comptent en crans, un jeton recharge un cran ; un cran de
>   plein vaut ≈ 500 km. Un dépôt porte 20 jetons par ressource et par niveau ; un camion en charge
>   10, un cargo 40, un avion 6 ;
> - **des jetons de valeur** (§7) : 1, 5 et 25, la monnaie se fait seule ; les bacs font 20, plus
>   20 par niveau d'entrepôt ;
> - **la tournée de ravitaillement** (§4) : un transport enregistre une boucle de quatre arrêts au
>   plus, recharge à chaque tour la consigne de son premier chargement, saute un dépôt plein,
>   attend si le plateau personnel manque, et garde son slot tant qu'elle tourne. Elle remplace
>   l'idée d'une troupe de génie, écartée (`QUESTIONS.md`).

## Contexte

L'ADR 0027 a fait de l'économie le seul frein de la Mondiale, et a posé ses principes sans leur
donner de forme. Le code du 17/10 les contredit presque tous. Sur huit ressources, quatre ne
servent qu'à en fabriquer une autre ou à rien : les tissus nourrissent l'intendance, rien ne
consomme les bandages, le minerai ne sert qu'à la fonderie, et le pétrole ne se consomme pas.
Former une troupe ne coûte que de l'alliage. Les munitions se débitent du stock national où que
soit la troupe, ce qui rend la logistique invisible. Enfin, un niveau de QG ouvre tout, pour tout le
monde dans le même ordre, et il accélère la formation de 22,5 % par niveau, un pourcentage que la
règle 1 interdit.

## Décision

### 1. Cinq ressources, chacune avec un usage direct et une pénurie qui casse une règle

Vivres, acier, charbon, pétrole, munitions. **Le fer donne l'acier directement** : le minerai, les
tissus et les bandages disparaissent, la fonderie avec eux. L'usine reste la seule
transformation : des munitions (charbon + acier), et du pétrole synthétique après recherche. À sec,
les vivres arrêtent formation, soin et capture ; l'acier, chantiers, réparation et formation ; le
charbon, la flotte, l'écoute et l'usine ; le pétrole, les moteurs. Sans munitions, une troupe ne
peut ni attaquer ni riposter. Personne ne meurt de faim. Chaque ressource a un picto et une couleur,
les mêmes partout, et une pénurie se dit sur la pièce ou la tuile qu'elle touche, avec ce qui la
répare : **on ne perd jamais le joueur**.

### 2. Des coûts mêlés, et le vrai prix à l'usage

Tout coûte de l'acier et la ressource de sa famille : vivres pour les hommes, pétrole pour les
machines de terre et les avions, charbon pour les navires et la production. Ensuite on paie à
l'usage : le plein, les coups, l'entretien. **L'entretien croît par paliers** : 1 par troupe
jusqu'à la dixième, 2 jusqu'à la vingt-cinquième, 3 au-delà, toujours ×2 hors ancrage. Un
avant-poste mange des vivres sur le plateau personnel, selon son niveau.

### 3. Chaque troupe porte ses coups et son plein

Les **coups** sont les passes qu'une troupe peut tirer. Le **plein** est la distance que ses moteurs
couvrent encore ; pour un avion, c'est son allonge. Le plein se paie au départ, et une route plus
longue que le plus petit plein d'une escouade est refusée. **Ancrée, une troupe se recharge ;
ailleurs, elle vit sur ce qu'elle porte.** La lecture est celle de l'entretien (`isAnchored`) : sur
le sol national, la troupe se sert sur le plateau personnel ; dans le rayon d'un avant-poste, sur
son dépôt. Deux pictos, une cartouche et un jerrican, disent coups et plein sous la figurine, dans
la fiche au survol, dans l'abaque et au moment de former.

### 4. La logistique passe par les pièces

Un **dépôt d'avant-poste** contient des munitions, du pétrole et du charbon en jetons, à la mesure
du niveau du point. Il se capture avec lui. **Ravitailler, c'est embarquer des jetons** :
- **charger** : on glisse des jetons sur un camion, un cargo ou un transport aérien, avec le geste
  de l'embarquement ;
- **livrer** : on lâche ce transport sur un de ses avant-postes. C'est un mouvement qui prend un
  slot. Le transport décharge, puis rentre seul.
- **larguer** : le transport aérien ne se pose pas. Il largue un paquet sous parachute, sur un
  avant-poste ou sur une escouade isolée qu'il recharge directement, et il en paie le pétrole.

Un transport porte des troupes et des jetons dans deux capacités séparées. Un ravitaillement se
relève et s'intercepte, et un transport détruit laisse une caisse. Chez soi, le pays ravitaille :
seul l'attaquant paie le chemin.

### 5. La recherche débloque, un niveau rend

On pose une carte de recherche sur son QG, une seule à la fois. L'arbre a quatre branches (terre,
mer, air, industrie) et onze cartes, soit environ 180 h pour une saison de 168 h
([artefact](https://claude.ai/artifact/MUm2rQF8mY82rLtdz3VTpx)). On part avec l'infanterie, le
camion, le cargo, et les tuiles QG, exploitation, usine, entrepôt, caserne, port et avant-poste.
**Le contre coûte moins et dure moins que l'arme qu'il contre**, invariant testé. Un niveau ne
débloque plus rien, il rend : une exploitation de niveau N produit N fois la base, une caserne N
forme et soigne N troupes à la fois, le QG N porte 1 + N slots. Un avant-poste élevé ouvre un plus
grand rayon et un plus grand dépôt, plus une escale aérienne au niveau 2.

### 6. Les escouades de Mondiale

Une escouade, ce sont les troupes d'un joueur au même endroit. Sa taille est libre : elle part en
un mouvement, au pas de la plus lente, et chaque troupe s'y ravitaille pour elle-même. **Une salve
d'artillerie touche jusqu'à quatre troupes de l'escouade visée**, jamais ses voisines. Au-delà de
douze troupes, l'escouade se dessine en une figurine par rôle et son fanion porte le compte. Une
borne serveur invisible (≈ 150 troupes par joueur) a un refus qui se dit.

### 7. Le plateau personnel

C'est un panneau à soi : cinq bacs de jetons, de petits entiers lus par jour, que l'entrepôt borne.
On le nomme toujours en entier, parce que « le plateau » seul désigne la table. À l'ouverture, ce
qui est entré depuis la dernière visite y tombe : c'est la récolte. Il porte aussi :
- les **tuiles**, qu'on lâche sur une région pour bâtir, ou sur leur pareille pour l'élever ;
- la **réserve de pièces**, qu'on lâche sur un site de projection ;
- les **cartes de recherche**.

Chaque visite offre une décision d'économie : investir, armer ou projeter, avec le même acier.

### 8. Les cinq cas de casse et les points stratégiques

Chaque cas de l'ADR 0027 §5 a sa parade :
- **le plus riche** se heurte aux paliers, à un investissement qui s'essouffle (×1,8 par niveau) et
  à des points éloignés, qu'il faut ravitailler ;
- **la tortue** ne tient aucun point, et ses bacs plafonnent ;
- **le tapis d'avant-postes** paie son entretien, n'ouvre plus d'emplacement, et se capture avec
  ses dépôts ;
- **l'escouade monstre** prend la salve de l'artillerie et vide les dépôts ;
- **les centaines de pièces** se heurtent à la borne et au dessin regroupé.

Côté points stratégiques :
- **Bakou** fait le plein sur le plateau personnel où que l'on soit (★★★) ;
- **Narvik** ne change pas ;
- **Dakar** protège aussi les dépôts : un dépôt du teneur, capturé, brûle ;
- **Singapour** devient « vos camions et cargos roulent sans plein ».

## Conséquences

- **Neuf features, back et front ensemble**, qui forment le point 4 de la file
  (`RESTE-A-CODER.md`). La quatrième est un prototype du plateau personnel et des gestes charger,
  livrer, larguer : il règle la fluidité avant le code.
- **Le wipe d'avant la saison test** porte le passage à cinq ressources et le retrait des clés
  historiques (`depot`, `recall`, `decoy`).
- **Les gisements se régénèrent sur quatre types**, et les garde-fous de l'ADR 0015 (bande, aucun
  profil plat) se rejouent.
- **`CONTEXT.md`** recevra coups, plein, dépôt d'avant-poste, plateau personnel, tuile et largage,
  et l'entrée « Jeton » changera de sens (le disque « ×N » est retiré depuis le 16/10).
- L'atout américain devient « vos ravitaillements ne sont jamais relevés ».

## Ce qu'on abandonne

- **Le minerai, les tissus et les bandages**, la fonderie, la filature, l'intendance et les
  casernements.
- **Le débit national des munitions** au combat et le tir à sec à ×0,6
  (`DRY_AMMUNITION_FACTOR`).
- **Les verrous de niveau** (`UNLOCKED_AT`, `TIER_2_HQ_LEVEL`, `ROLE_SITE_LEVEL`) et
  l'accélération de la formation par le QG (`chainSpeed`).
- **Le relais d'avant-poste** (×1,5 sur la route), un pourcentage ; l'écoute reste la seule
  spécialisation.
- **« Toutes troupes visibles »** pour une escouade de plus de douze troupes.
- **L'entretien plat** d'une troupe, quelle que soit la taille de l'armée.
