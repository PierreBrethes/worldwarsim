# Brief design — dégraisser les quatre surfaces, et commander l'arsenal

**Statut : brief pour maquettes HTML.** Session du 16/08/2026. Destiné à Claude design.
Ne produit pas de code : des planches à regarder, sur lesquelles on tranchera.

L'interface tient en quatre fenêtres et un bandeau. Elles fonctionnent. Le problème est qu'elles
se répètent, qu'à trois endroits elles disent faux, et qu'elles taisent la chose la plus utile de
la carte — **où sont les gisements**. Ce brief les dégraisse, sort les réserves du bandeau vers un
panneau de carte, rend les gisements visibles, et ouvre une décision de jeu : l'arsenal cesse de
tourner tout seul.

## Le principe

> **Une donnée a une maison. Ailleurs, elle n'apparaît que si elle est le sujet de la décision
> qu'on prend là.**

Le bandeau est l'exception assumée : il veille en permanence, donc il répète. Tout le reste doit
se justifier. Un stock affiché dans la fiche Nation n'y sert aucune décision — on n'y dépense
rien.

## 1 · Ce qui se répète, mesuré

| Donnée | Vue dans | Verdict |
|---|---|---|
| **Les huit stocks** | bandeau · Nation · Industrie · Production (2 sur 8) | **quatre surfaces** |
| **« / 400 plafond »** | Nation ×8 · Industrie ×8 · Production ×2 | **dix-huit fois** — et sans entrepôt les huit plafonds sont identiques |
| Plafond de bâtiments | Nation, en toutes lettres **et** en barre | deux fois sur le même écran, à trois centimètres |
| Niveau du QG · « chaîne ×1.00 » | Nation · Production | deux fois |
| « plafonné par le QG » | Nation · Industrie | deux fois, en toutes lettres |
| Slots de mouvement | Nation (le total) · Troupes (le reste) | **pas un doublon** — deux faits différents |

**Les coupes retenues :** la fiche Nation perd sa colonne STOCKS ; Production perd son en-tête
alliage + munitions et sa mention « chaîne ×1.00 — QG niveau 1 » ; « 5 bâtiments debout au plus »
disparaît au profit de la seule barre ; « reste N avant plafond » ne s'affiche qu'au-dessus de
85 % du plafond.

Le recensement de la fiche Nation **reste** : c'est la seule lecture des quinze d'un coup, et elle
sert à comparer des niveaux. Il doit être dense — une ligne tient sur une ligne.

## 2 · Trois choses qui sont fausses, pas redondantes

1. **« 3 / h » s'affiche à côté de « À SEC — ALLIAGE ».** Un arsenal à sec produit **zéro**. Le 3
   est le débit nominal. Le joueur lit la ligne et croit produire trois munitions par heure.
   Il faut le **débit réel**, le nominal en second : « 0 / h — nominal 3 ».
2. **« 3 sur 5 » surmonte deux lignes de recensement.** Le troisième bâtiment est le quartier
   général, qui vit dans son bloc au-dessus. Le chiffre et la liste se contredisent à l'œil, et
   ça fait douter du chiffre. Le QG doit entrer dans le recensement.
3. **Deux jeux d'icônes pour les mêmes huit ressources** : glyphes abstraits pour les coûts,
   planches illustrées pour les réserves et le bandeau. Les glyphes étaient un provisoire en
   attendant les planches — les planches existent. **Un seul dessin par ressource, partout** :
   bandeau, réserves, coûts d'amélioration, coûts de recrutement.

## 3 · Les jauges

Les réserves passent en jauges. Une jauge porte le rapport au plafond **sans écrire le plafond** —
c'est ce qui fait disparaître les dix-huit répétitions.

Le partage a changé avec le §6 : **le panneau des réserves** porte chiffre et jauge côte à côte,
en haut à droite ; **Industrie** garde le détail que le panneau ne peut pas tenir — plafond chiffré,
débit, distance, et l'amélioration du bâtiment de stockage. Le panneau dit *où j'en suis*,
Industrie dit *pourquoi*.

Une jauge doit rendre **la saturation visible** : un joueur au plafond gaspille sa production en
continu, et rien ne le lui dit aujourd'hui. Une jauge pleine doit se voir de loin.

## 4 · L'arsenal se commande — la décision de fond

**La règle :** une chaîne tourne seule tant que son entrée ne sert qu'à elle. Dès qu'elle mange
une matière qu'on dépense ailleurs, c'est le joueur qui décide combien.

| Chaîne | Entrée | Cette entrée sert-elle ailleurs ? | |
|---|---|---|---|
| Fonderie | minerais + charbon | non | tourne seule |
| Intendance | tissus | non | tourne seule |
| **Arsenal** | **alliage** | **oui — bâtiments, améliorations, troupes** | **se commande** |

**Le défaut que ça corrige existe déjà et personne ne peut le voir :** l'arsenal transforme
automatiquement l'alliage en munitions, trois par heure et par niveau, sans qu'on puisse
l'arrêter. Un joueur qui économise 430 d'alliage pour un porte-avions se fait prendre 216 par
jour par un arsenal de niveau 3.

Ce n'est pas une exception à retenir, c'est une règle qui s'étend : le jour où les tissus servent
à autre chose, l'Intendance devient commandable sans qu'on ait rien à décider.

### La commande

Un **lot ponctuel**, pas un ordre permanent ni un débit. Le joueur choisit une quantité, elle se
produit, l'arsenal s'arrête et rend l'alliage. C'est net : la chaîne consomme **exactement ce qui
a été commandé, une fois**.

Ce qu'il faut voir en tirant le curseur :

```
ARSENAL  en Aisne · niv. 1        1 alliage → 1 munition        3 / h
   ▐████████░░░░░░░░░░░░▌      200 munitions           max 1000
   coûte 200 alliage   ·   durée 66 h   ·   fin le 19/08 à 09 h
```

- **le maximum se calcule sur le stock d'entrée** — 1000 d'alliage donne 1000 munitions, 100
  tissus à 2 par bandage en donneraient 50 ;
- **la durée est la vraie réponse à la question du joueur.** C'est elle qui dit si le lot couvre
  une nuit. C'est aussi pourquoi il ne faut **pas** de réglage de débit : le débit vient du niveau
  du bâtiment, et un contrôle ne servirait qu'à ralentir volontairement sa propre usine.
- un lot en cours doit être **visible et annulable**, et son annulation suit la règle déjà en
  place pour le recrutement : intégralement remboursé tant qu'il n'a pas commencé.

**À maquetter aussi : l'état vide.** Un arsenal sans commande ne doit pas ressembler à un arsenal
en panne. « À sec » et « en attente d'ordre » sont deux choses différentes et doivent se
distinguer d'un coup d'œil.

## 5 · Trois emprunts qui valent le détour

**Le temps jusqu'à** *(Travian, Rise of Kingdoms)*. La fiche Nation dit aujourd'hui « il faut 72
de charbon (0 disponibles) ». Un refus. « Disponible dans 4 h 20 » serait un plan. Et quand le
débit est nul — le cas ici, aucune mine de charbon — la bonne phrase n'est pas un compte à rebours
mais **« jamais : aucune mine de charbon »**, qui dit au joueur quoi construire. Un refus qui
nomme sa cause vaut mieux qu'un refus chiffré.

**La jauge qui déborde** *(Frostpunk, Rimworld)*. Le gaspillage au plafond doit être visible avant
d'être subi. Une jauge saturée n'est pas un état neutre, c'est une perte en cours.

**Le goulot nommé** *(Europa Universalis, Factorio)*. C'est déjà ce que fait le mieux cette
interface : « À SEC — ALLIAGE » nomme la cause au lieu de décrire le symptôme. **Généralise-le.**
Partout où quelque chose est empêché, la bonne formulation nomme le facteur limitant unique, pas
la liste des conditions.

## 6 · Les réserves quittent le bandeau pour un panneau

**Tranché le 16/08, après avoir dessiné les deux.** Les huit ressources passent dans un panneau
vertical **en haut à droite de la carte**. Le bandeau les perd.

### Le seul découpage acceptable : par chaîne

Un découpage en onglets *primaires / craftées* a été essayé et rejeté : **sa frontière est
perpendiculaire aux chaînes.** `minerais · charbon → alliage → munitions` traverse les deux
groupes — entrées primaires, sorties craftées. Séparés, les flèches n'ont plus où vivre, et avec
elles disparaît le seul diagnostic de l'interface.

**En vertical, le groupement par chaîne tombe tout seul** et les flèches descendent :

```
RÉSERVES                    –
  minerais    20   ▐███░░░░░░░▌
  charbon      0   ▐░░░░░░░░░░▌
        ↓
  alliage      0   ▐░░░░░░░░░░▌
        ↓  À SEC
  munitions   60   ▐████░░░░░░▌
  ─────────────────────────────
  tissus      40   ▐███░░░░░░░▌
        ↓
  bandages     0   ▐░░░░░░░░░░▌
  ─────────────────────────────
  nourriture 368   ▐█████████░▌
  pétrole      0   ▐░░░░░░░░░░▌
```

Icônes et chiffres plus grands qu'en bandeau, **jauges pleine largeur** — c'est ce que la bande
horizontale ne pouvait pas donner, et c'est la vraie raison du déplacement.

### Il a déjà un frère : aligne-toi dessus

`src/map/ControlsCard.tsx` est un panneau HUD **en bas à droite** : 300 px, fond `--desk`, bordure
`--ink-quiet`, plié par un bouton carré de 22 px placé sous lui. **Reprends tout** — même largeur,
même matière, même geste. Deux panneaux de largeurs ou de fonds différents dans deux coins se
verraient.

Résultat : **réserves en haut à droite, contrôles en bas à droite**, la colonne droite devient
celle du HUD et la carte garde sa gauche. Vérifier qu'il n'écrase pas `EdgeIndicators`.

### Replié, il ne parle que s'il a quelque chose à dire

Une chaîne à sec, un plafond atteint — sinon « rien à signaler ». C'est la réponse à l'objection
du panneau qui cache l'alerte : **c'est l'alerte qui survit au repli, pas les chiffres.** Un
panneau replié qui tairait une fonderie à l'arrêt serait pire que pas de panneau.

## 7 · Ce que devient le bandeau

Il perd les ressources et **il maigrit** : environ 32 px au lieu de 44. Quarante-quatre pixels
pour trois blocs, c'est du vide qui coûte de la carte — et sur un jeu de carte, une bande de
hauteur rendue au plateau se sent.

Il porte, de gauche à droite : le **cartouche de nation**, le **chantier en cours** avec son
échéance, les **slots de mouvement**, puis le **journal** qui garde la fin de la bande et son
poids — le bandeau répond d'abord « quoi de neuf ».

**Le chantier et les slots sont séparés par un filet**, jamais groupés : ce sont deux comptes à
rebours de nature différente. Le chantier est une échéance unique qui arrive ; les slots sont une
ressource qui se reprend. Les coller ferait croire à un même système.

Les deux entrent pour des raisons écrites, pas par goût :

- **les slots**, parce que l'[ADR 0006](../../adr/0006-slots-de-mouvement.md) dit « *il faut une UI
  claire sur les slots disponibles : c'est l'information la plus consultée du jeu* » — et ils sont
  aujourd'hui enterrés dans la fenêtre Troupes ;
- **le chantier**, parce qu'il y en a **un seul à la fois** (ADR 0015), qu'on le consulte souvent,
  et qu'il n'a aucune maison permanente.

**Ce qu'il ne prend pas : les filtres d'affichage de la carte.** Le bandeau *surveille* — il montre
ce qui change sans qu'on le demande. Un filtre est un *réglage* : il ne change jamais tout seul, on
y touche trois fois par partie. Les mélanger fait chercher l'alerte au milieu des interrupteurs.
Ils restent dans le rail ; ce qui peut se travailler, c'est leur lisibilité, pas leur adresse.

## 8 · Les gisements sont invisibles — la lacune la plus coûteuse

**On ne peut pas savoir où bâtir une mine.** `grep deposit src/map/**` ne renvoie rien : aucune
couche de gisements n'existe sur la carte. Le seul moyen de trouver un gisement est le clic droit,
région par région. **Cent une fois pour la France.**

La donnée est pourtant **déjà servie** : `PlayerView.me.regions` porte tout le pays d'origine avec
son `deposit` et son `coastal` — le commentaire de `view.ts` l'explique. Il ne manque que le rendu.

### La densité rend la chose facile

Mesuré sur `public/deposits.json` et `region-index.json` : **96 régions sur 1553 portent un
gisement, soit 6,2 %.** Environ dix par nation.

| Nation | régions | gisements | manque déclaré |
|---|---|---|---|
| France | 101 | 10 | pétrole |
| Royaume-Uni | 232 | 10 | pétrole |
| Allemagne | 16 | 11 | pétrole |
| Italie | 110 | 10 | pétrole |
| Chine | 32 | 13 | pétrole |
| Japon | 47 | 9 | **minerai et pétrole** |
| USA | 51 | 15 | aucun |
| URSS | 85 | 17 | aucun |

**Un pictogramme par gisement, c'est dix marqueurs sur la France, pas cent.** L'encombrement n'est
pas un argument.

### La forme

Un **pictogramme**, pas une teinte. La hiérarchie des trois teintes est déjà saturée — nation en
remplissage, région bâtie en remplissage plus dense, survol en contour. Une quatrième teinte
entrerait en conflit avec les trois.

Le pictogramme doit être **plus discret que le jalon d'un bâtiment** : il désigne un potentiel, pas
une possession. Et il lui faut une bascule dans le rail, comme celle des bâtiments qui existe déjà
(`toggleBuildingsTitle`).

**Le brouillard se règle tout seul :** `PlayerView` ne sert que le pays d'origine et les régions
déjà bâties, donc on ne voit jamais les gisements d'un adversaire sans avoir à écrire une règle.

### Deux mensonges à corriger au passage

**L'infobulle de région affiche un terrain inventé et tait le gisement.** `RegionTooltip` montre
`regionType(name)` — un **hachage du nom**, un factice assumé en attendant la vraie classification.
Elle affiche donc une information fausse à la place de la seule vraie. Même défaut que « 3 / h » à
côté de « à sec » (§2). **Le type disparaît, le gisement le remplace.**

**Le manque national ne se voit nulle part.** Que la France n'ait pas de pétrole est une décision
centrale — l'ADR 0015 dit que le manque unique *protège la promesse anti-élimination*, et
`second-manque-declare.md` en fait une exception qui se déclare avec sa justification. Aujourd'hui
un joueur ne peut l'apprendre qu'en cherchant en vain pendant une partie. **Sa place est dans la
fiche Nation**, à côté du pouvoir national : « la France ne tient aucun gisement de pétrole ».

## 9 · Le panneau de construction dit le plafond trop tard

`heldByCap(view.me.buildingCap)` n'apparaît **qu'au moment où le plafond mord**. Avant, rien ne dit
combien d'emplacements restent — le joueur découvre la limite en la heurtant.

Le panneau doit porter, en tête : **combien sont pris, combien le QG en autorise, combien il en
reste.** Les deux nombres sont déjà servis (`buildings.length`, `buildingCap`).

C'est un rappel de la barre de la fiche Nation, et **c'est légitime** : le principe de ce brief dit
qu'une donnée reparaît ailleurs si elle est le sujet de la décision qu'on y prend. Choisir où bâtir
*est* cette décision. C'est la seule répétition que ce brief ajoute au lieu d'en retirer.

## 10 · Le débit dans le panneau des réserves

Chaque ligne porte son **débit par heure**, discret, à côté du chiffre. La jauge dit le présent,
le débit dit l'avenir — sans lui, on ne sait pas si une jauge monte ou descend.

Il devient indispensable avec l'entretien des troupes (`consommation-continue.md`) : **le débit
pourra être négatif**, et une nation qui perd de la nourriture doit le lire avant d'être à sec, pas
après. Le signe compte autant que le nombre.

Le débit affiché est le **réel**, jamais le nominal — même exigence qu'au §2.

## 11 · Ce qu'on attend des planches

Quatre fenêtres, le panneau des réserves — déplié et replié, dans ses deux états d'alerte — et le
bandeau aminci, sur écran large **et** sur 1024 px. **La carte avec sa couche de gisements**, et
l'infobulle de région corrigée. Le panneau de construction avec son budget en tête. La commande de
l'arsenal dans ses trois états.

Montre au moins une planche **entière**, carte comprise, pour qu'on juge ce que le HUD laisse du
plateau — c'est le seul moyen de voir si le panneau haut-droit, la bascule des gisements et le
bandeau cohabitent. La commande de l'arsenal dans ses trois états : sans
ordre, en cours, terminé.

Contraintes qui ne se négocient pas : esthétique **presse illustrée 1940**, encre sur papier,
`--desk: #0f0a04` pour le bandeau, `--paper: #e4d8bd` pour les fenêtres, `--neutral-land: #d5c5a0`
pour la carte. `--critical` sert l'urgence et rien d'autre. Les libellés en français, le
vocabulaire de `WWS/CONTEXT.md` — *mouvement*, *passe de résolution*, avant-poste
*désactivé/détruit* ; jamais tick, temps réel, micro, base, rush.

**La question à laquelle chaque planche doit répondre :** qu'est-ce qu'on a retiré, et qu'est-ce
que ça a rendu lisible ?
