# Sprites — pipeline

Deux jeux d'assets passent par cette chaîne : les **unités**, une planche par nation, et les
**bâtiments**, une planche unique de quinze visuels neutres. Les sections 1 à 6 décrivent les
unités ; la section 7 dit ce que les bâtiments font différemment, et pourquoi.

## Unités

Une planche de **onze visuels** par nation, huit nations. **La France, le Royaume-Uni et les
États-Unis sont faits et branchés au front** ; les cinq autres nations suivent ce document. L'enjeu n'est pas la beauté d'un sprite isolé :
c'est que les quatre-vingt-huit tiennent ensemble sur une même planche, au même angle et sous
la même lumière. Un seul sujet généré de trois-quarts arrière se voit immédiatement et ne se
rattrape pas au filtre.

> Les identifiants sont **en anglais** depuis l'[ADR 0016](../docs/adr/0016-code-anglais-jeu-francais.md) ;
> les libellés affichés vivent dans `src/i18n/fr.ts`. Ce document est de la documentation,
> donc en français — mais toute clé qu'il cite est celle du code.

```
WWS/sprites/units_<nation>_clean/   la source — PNG détourés, pleine résolution. Ne quitte jamais WWS/.
WWS/sprites/nettoyer-ombres.py      le retrait des ombres portées restées dans l'alpha
WWS/sprites/optimiser.py            la conversion vers le front
src/emblems/units/<nation>/         l'optimisé — WebP, seul ce qui part au navigateur
src/emblems/units/manifest.ts       la table typée qui relie un rôle à son fichier
src/emblems/units/equipment.ts      le nom du matériel réel, par nation et par palier
```

`<nation>` est l'identifiant de `NATIONS` dans `src/domain/ids.ts`, en minuscules et en
anglais : `france`, `uk`, `usa`, `ussr`, `germany`, `japan`, `italy`, `china`.

---

## 1. Génération

Même gabarit pour les huit nations, sans exception :

| | |
|---|---|
| Vue | trois-quarts, environ **60°** |
| Lumière | **haut-gauche**, unique, sans contre-jour |
| Fond | **uni `#4a7060`** — un vert franc, pour que le détourage ait une couleur à retirer |
| Sujet | **seul dans le cadre**, occupant ~**80 %** — ni socle, ni décor, ni personnage d'échelle |
| Cadre | **1024 × 1024** |

**Orientation de référence.** Les navires et les gros porteurs — escorte, porte-avions,
cargo, transport aérien, bombardier — font **cap ouest-sud-ouest**, soit environ **8 h 30 sur
un cadran**. C'est ce qui donne à une planche son unité : deux navires qui se croisent en sens
inverse se lisent comme une erreur. Les sujets courts (infanterie, blindé, camion, chasseur)
tolèrent la variation, à condition de rester dans le même quart de tour.

**Un sprite à l'envers se retourne au miroir horizontal**, sans perte — mais la lumière se
retourne avec lui et passe en haut-**droite**. À vérifier à l'œil sur fond clair : un sujet
miroité posé à côté d'un sujet d'origine trahit deux soleils. Les détails asymétriques
s'inversent aussi (poste de conduite, culasse, insignes) ; à la taille d'affichage c'est
invisible sur un fantassin, pas sur un véhicule.

**Cohérence de planche.** Le théâtre et la tenue comptent autant que l'angle : un fantassin en
short tropical à côté d'un fantassin en tenue de campagne européenne, ce sont deux guerres sur
une planche. Idem pour les marquages — une étoile blanche alliée est de 1943-44, hors du cadre
de l'[ADR 0007](../docs/adr/0007-epoque-1940.md).

## 2. Détourage

Fond retiré, alpha net, sujet recadré sur son enveloppe avec une marge de quelques pixels. Le
résultat n'a plus une seule ligne du vert d'origine, franges de bord comprises.

**Les ombres portées se retirent, toutes.** Deux formes, et la seconde se rate :

- l'ombre douce projetée au sol, semi-transparente — visible, on y pense ;
- l'**ombre verte opaque cuite sous le sujet**, de la couleur du fond, que le détourage prend
  pour de la matière et conserve.

Aucune des deux ne se voit sur fond sombre. **Le contrôle se fait sur fond clair** : poser la
planche sur du papier, où l'ombre apparaît en tache sous les chenilles ou la coque.

Le jeu ne compose aucune ombre : la charte est à angles vifs, sans ombre ni rayon
(`src/styles/tokens.css`). Une ombre cuite dans l'asset est une ombre qu'on ne peut plus
retirer.

### `nettoyer-ombres.py`

```bash
python WWS/sprites/nettoyer-ombres.py --source WWS/sprites/UK \
                                      --destination WWS/sprites/units_uk_clean
```

Un détourage par couleur laisse l'ombre : ce n'est plus du vert, donc rien ne la retire. Le
script la reconnaît à trois traits **simultanés** — semi-transparente, **sombre**, et **hors
du sujet** (au-delà de trois pixels, pour épargner le liseré d'anticrénelage). C'est le
critère de luminance qui sauve le disque d'hélice d'un chasseur, lui aussi semi-transparent
et hors silhouette, mais clair.

Mesuré sur la planche britannique : 2 300 à 9 000 pixels d'ombre par sprite, 222 000 au total.

### `--sol`, l'ombre qui a sa propre matière

La planche américaine a été rendue **sur un plan de sol**, pas sur le fond vert : son ombre est
opaque, vaste, et par endroits **plus claire que le plafond de valeur** du critère précédent
(0,46 mesuré contre 0,42 admis) — passée sans `--sol`, elle ressort en plaques vertes sous les
ailes du B-17 et en croissant sous le Stuart, et le nettoyage mange au passage l'antenne du char,
trop fine pour survivre au critère de semi-transparence.

Ce qui sépare cette ombre-là, c'est la **chromaticité**. Le sol est un gris-vert neutre : ses
rapports `R/V` et `B/V` tiennent dans une fenêtre étroite qu'aucun matériau du sujet ne visite —
l'olive du blindé sort par le rouge (0,97), l'aluminium du B-17 est neutre (1,00), la coque du
destroyer sort par le bleu. Trois précautions rendent le critère utilisable :

- **une planche a une ombre de sol ou n'en a pas.** Tant qu'aucune plaque n'atteint 1 600 px,
  rien ne part : c'est ce qui sauve le destroyer, dont cinq aplats de coque (622 à 1 484 px)
  passeraient sinon pour de l'ombre. La preuve faite, les éclats de 600 px comptent aussi — le
  B-17 découpe son ombre en une dizaine de morceaux dont deux seulement atteignent le seuil de
  preuve ;
- **la frange se reprend à l'alpha**, pas à la couleur : au bord extrême elle vaut `(0,1,0)`,
  elle n'a plus de chromaticité du tout, et la laisser dessine le *contour* de l'ombre retirée ;
- **`protections.json` existe pour ce qui ne se sépare pas.** La bâche du GMC *est* un aplat
  gris-vert de 11 850 px : aucun seuil ne la distingue du sol. Un rectangle `[x0, y0, x1, y1]`
  par planche la met hors d'atteinte, et le fichier dit pourquoi.

```bash
python WWS/sprites/nettoyer-ombres.py --source WWS/sprites/USA/all_images \
                                      --destination WWS/sprites/units_usa_clean \
                                      --controle /tmp/controle --sol
```

Mesuré sur la planche américaine : cinq sujets posés au sol perdent 16 000 à 89 000 px, les six
autres — les navires, les fantassins, le Sherman, le C-47 — moins de 1 400 px de poussière.

## 3. Nommage

Un fichier du front porte la **clé `UnitRole`** de `src/domain/ids.ts`, et rien d'autre — pas
de nom de matériel. La Matilda II est un `armor-2` ; le jour où le Royaume-Uni change de char,
l'asset change et le manifeste ne bouge pas.

```
infantry-1   infantry-2      armor-1   armor-2      landTransport
fighter      bomber          airTransport
escort       cargo           carrier
```

Le suffixe `-1` / `-2` ne s'écrit que pour les **rôles à palier**, listés par `TIERS_BY_ROLE`
dans `src/domain/troops.ts` : infanterie, blindé et **porte-avions**. Les six autres n'ont
qu'un visuel et pas de suffixe.

**La France est la seule incomplète.** Elle n'a pas de `cargo` ; le Royaume-Uni est le premier
du projet à en avoir un, et les États-Unis furent la première planche complète branchée au front.
Les deux répondent aujourd'hui pour les neuf rôles. Le palier 2 du porte-avions n'existe nulle part
et n'a pas à exister : la fiche de chiffrage ne lui donne aucune force nominale, donc le rôle n'a
qu'un palier (ADR 0014). `manifest.test.ts` garde la trace des deux constats.

Le nom de matériel, lui, **est affiché** — « Blindé — Matilda II » sur la surface 4.6. Il vit
dans `src/emblems/units/equipment.ts`, une table par nation, jamais dans le nom de fichier ni
dans le domaine : c'est une propriété de la planche, pas de la règle du jeu. Les désignations
historiques sont des noms propres et ne se traduisent pas, donc elles ne passent pas par
`fr.ts`.

Les sources, elles, **gardent leur nom de matériel** (`armor-2-matilda-2.png`) : c'est là
qu'il sert, à l'œil, quand on ouvre le dossier. Le rapprochement vers les clés se déclare dans
un **`noms.json` posé à côté d'elles**, une table par nation — voir `units_uk_clean/noms.json`.
Une source déjà nommée par sa clé n'a pas besoin d'entrée.

## 4. Optimisation

```bash
python WWS/sprites/optimiser.py --source WWS/sprites/units_uk_clean \
                                --destination src/emblems/units/uk --serrer
```

Redimensionne à **512 px de large au plus** (jamais d'agrandissement) et encode en **WebP
qualité 80**. Compter **25 à 30 Ko par sprite**, soit 300 Ko pour une planche de onze ; au-delà,
c'est que le détourage a laissé du fond.

**`--serrer` recadre chaque sujet sur sa boîte alpha, et n'est pas optionnel** pour une planche
générée en 1024² avec le sujet au milieu. La marge de génération n'est pas neutre : `UnitSprite`
pose chaque sujet en `object-contain` dans une boîte commune, donc elle sort en taille perdue à
l'écran. Les sources françaises arrivaient déjà détourées serré — 99,6 % du cadre — d'où la
croyance, tenue jusqu'au 24/08, qu'un cadrage large ne se voyait pas. Les planches britannique
et américaine ont montré le contraire : de 59 % (le Bedford) à 87 % du cadre, soit un camion
britannique affiché deux tiers de son voisin français dans le même widget. Un plateau serré
pèse un tiers de plus qu'un plateau lâche à qualité égale — c'est du sujet, pas du fond.

Le script demande **Pillow**, `nettoyer-ombres.py` demande en plus **NumPy** et **SciPy** —
aucun n'est une dépendance du dépôt : ce sont des outils de préparation d'assets, exécutés à
la main quand une nation arrive, jamais au build.

## 5. Le filtre encre n'est pas dans l'asset

Les sprites sont livrés dans leurs couleurs. La désaturation vers la palette 1940 est
appliquée **à l'affichage**, en CSS, par `src/emblems/UnitSprite.tsx` :

```
filter: saturate(.5) sepia(.22) brightness(.94)
```

Même principe que les drapeaux (`src/emblems/Flag.tsx`). Le budget de contraste appartient à
la couche de jeu : une DA cuite dans quatre-vingt-huit fichiers se réencode à chaque révision
de la palette, et interdit de resservir le même sprite ailleurs — au rejeu, par exemple — sous
un autre traitement.

`UnitSprite` fixe **la boîte, pas l'image** : les rapports vont du fantassin debout au navire
couché de tout son long, donc à hauteur égale une colonne de sprites part en dents de scie.
C'est `object-contain` qui laisse chaque sujet respirer dans une boîte commune — ça vaut aussi
entre deux sprites d'un même rôle, un fantassin qui court étant bien plus large qu'un
fantassin au repos.

## 6. Brancher une nation

1. Générer les onze visuels au gabarit, détourer, poser dans `WWS/sprites/units_<nation>_clean/`.
2. Passer `nettoyer-ombres.py`, puis **contrôler sur fond clair**.
3. Écrire le `noms.json` de rapprochement.
4. Lancer `optimiser.py --serrer` vers `src/emblems/units/<nation>/`, puis **vérifier le
   remplissage** : la boîte alpha doit toucher le cadre, sinon le sujet s'affichera petit.
5. Ajouter l'entrée dans `SPRITES_BY_NATION` (`src/emblems/units/manifest.ts`) et la table de
   matériel dans `equipment.ts`.

Le type `NationSprites` est un `Record` **complet** des neuf rôles : une nation qui en oublie
un ne compile pas, et un rôle sans visuel s'écrit `null` — explicitement, pas par omission. Le
test `manifest.test.ts` vérifie la couverture et les paliers.

`UnitSprite` rend un cadre pointillé portant le libellé du rôle quand le visuel est `null`,
jamais une image cassée : une nation à moitié dessinée est jouable.

---

## 7. Bâtiments

**Quinze visuels, pas cent vingt.** Un par `BuildingKey` de `src/domain/ids.ts`, **neutres —
et neutres ils restent à l'affichage** (voir « le manifeste » plus bas : aucune teinte n'est
appliquée, et c'est délibéré). Une caserne à pagode pour le Japon serait belle et coûterait
huit planches, pour un sujet haut de deux centimètres à l'écran.

```
airfield  arsenal  barracks  billets  depot  farm  foundry  hq
listening  mill  mine  oilWell  port  quartermaster  warehouse
```

```
WWS/sprites/buildings/            les sources — PNG détourés, 1024², pleine résolution
WWS/sprites/buildings_clean/      le nettoyé
src/emblems/buildings/            l'optimisé — WebP recadrés et mis à l'échelle
src/emblems/buildings/manifest.ts la table typée, un Record<BuildingKey, …> complet
```

### Gabarit

Le même que les unités — trois-quarts à ~60°, lumière haut-gauche, fond `#4a7060`, **1024 ×
1024**, sujet seul — avec une exigence de plus :

**Sujet entier, base visible, jamais coupé.** La règle de dessin est inchangée, sa
justification non : à l'affichage la planche n'est **pas un sprite posé au sol**, c'est la
vignette d'un **jalon** — elle pend au bout d'un mât, dans la couche DOM
(`src/map/MapLabels.tsx`, classe `.label-plate`), et c'est le pied du mât qui désigne la
région. Il n'y a **pas de billboard 3D pour les bâtiments et pas de `engine/buildings.ts`**.
Un bâtiment coupé en bas ou vu en plongée reste inutilisable : au bout d'un mât comme au sol,
il se lit comme une erreur.

**Pourquoi le jalon a gagné contre le sprite posé** (tranché le 15/08, contre le plan initial
de `docs/prompts/code/batiments-sur-la-carte.md`) : les régions admin-1 varient d'un facteur
mille en surface. Un sprite posé au sol hérite de ce désordre — la même caserne serait un
timbre sur la Iakoutie et un pâté sur Monaco. Le mât **découple la taille du symbole de celle
de la région**, ce qui est précisément la propriété qu'on cherchait.

### L'ombre est opaque ici, et c'est un piège

Sur les planches de bâtiments, l'ombre portée a été rendue **opaque** — mesurée à `alpha =
254`. Le critère historique de `nettoyer-ombres.py` filtrait sur `alpha < 235` : il passait à
côté à 100 %.

Pire, **la couleur ne sépare pas** l'ombre du sujet. Mesuré : l'ombre du `port` (valeur 0,28,
saturation 0,10) et le toit du même `port` (0,31 / 0,15) sont indiscernables. Ce qui les
sépare, c'est la **matière** — une ombre est un aplat, un toit est texturé. Le second critère
du script est donc *sombre, peu saturé et **lisse***, décidé **par région connexe** et non par
pixel : ombres mesurées à 2 457–39 421 px pour une texture de 0,44 à 0,97 ; faux positifs
(cuves du `depot`, bardage du `warehouse`) 1 911 px au plus pour une texture ≥ 1,14.

Deux effets de bord réglés dans le script, qui se reproduiront sur toute planche du même
rendu :

- la **pénombre** borde l'ombre d'un dégradé de quelques pixels. Retirer l'ombre sans elle
  laisse son *contour* dessiné sur le papier — pire que l'ombre ;
- le liseré d'anticrénelage est **noir** ici, ce qui en fait la texture la plus forte de la
  planche si on la mesure sans masque : l'ombre s'en trouve ceinturée de fausse matière.

```bash
python WWS/sprites/nettoyer-ombres.py --source WWS/sprites/buildings \
                                      --destination WWS/sprites/buildings_clean \
                                      --controle /tmp/controle
```

**`--controle` écrit la planche composée sur `neutralLand: #d5c5a0`** — le seul fond où une
ombre se voit. Changer un seuil sans regarder cette sortie est un pari.

### Sujets ajourés : clé chromatique, pas remplissage

`oilWell` a demandé un traitement à part : le fond était **enclavé entre les barres du
treillis**, ce qu'aucun détourage par remplissage depuis les bords n'atteint. Pour tout sujet
ajouré — derrick, pylône, grue, antenne — le détourage doit être une **clé chromatique
globale**, appliquée à toute l'image, jamais un remplissage propagé depuis l'extérieur.

### L'échelle : hauteur unique, tranché le 16/08

**Les quinze planches s'affichent à la même hauteur.** Il n'y a pas de hiérarchie de taille
entre un quartier général et une cabane d'écoute sur la carte.

La table `echelles.json` (`hq` 1,00 → `listening` 0,50) a existé et **n'a jamais rien produit** :
le CSS du jalon épingle `height: 46px` sur toutes les vignettes, ce qui écrase l'échelle cuite
à l'export. La contradiction a vécu un mois sans être vue.

Elle a été tranchée en la regardant, pas en la raisonnant — planches réelles, fond de terre
nue, taille réelle de la carte. Deux constats :

- l'amplitude 1,00 → 0,50 était confortable sur un cadre de 512 px et **brutale à 46** : les
  trois derniers sujets tombaient sous 25 px, sous le seuil de lisibilité que ce README pose
  lui-même plus bas ;
- à taille égale, la carte ne perd rien. **La hiérarchie passe entièrement par la silhouette** —
  c'est la règle « une masse, pas un détail » qui porte la distinction, pas les pixels.

Ce qui reste vrai du raisonnement d'origine : `optimiser.py` recadre sur la **boîte englobante
alpha** puis normalise **par la hauteur**, pas par la largeur. Sans ce recadrage, un entrepôt
cadré serré et une fonderie cadrée large sortiraient de tailles différentes — et la carte
hériterait d'un accident de cadrage. C'est le piège de l'[ADR 0015](../docs/adr/0015-economie-v2-ressources-localisees.md)
sur les quantités comptées en régions, transposé aux pixels. Ce qui change, c'est qu'après
normalisation **toutes les clés valent 1,00**.

**Conséquence acceptée :** un sujet élancé (`oilWell`, ratio 0,49) et un sujet large
(`airfield`, ratio 1,38) auront la même hauteur et des largeurs très différentes. C'est le
prix de la normalisation par la hauteur, et c'est le bon axe : le jalon pend par le haut, la
hauteur est ce qui décide de sa présence.

```bash
python WWS/sprites/optimiser.py --source WWS/sprites/buildings_clean \
                                --destination src/emblems/buildings --recadrer
```

`--recadrer` est ce qui sépare les deux régimes du script depuis la suppression
d'`echelles.json` : sans lui, on est dans le régime des unités (réduction seule, cadrage
inchangé).

Mesuré : 5,5 Mo de PNG → **121 Ko** de WebP, 5 à 12 Ko par bâtiment.

**`HAUTEUR_REFERENCE` vaut 160 px, tranché le 16/08 après mesure.** Les vignettes s'affichent à
46 px : 160 couvre un écran 3× DPR avec une échelle HUD jusqu'à ~1,16, ou 2× DPR jusqu'à ~1,74.
La référence précédente de 512 px sur-échantillonnait d'un facteur 11 pour 618 Ko. Contrôlé à
l'œil, planches avant/après rendues à 138 px (46 px sur 3× DPR) sur fond de terre nue : aucune
n'est visiblement plus floue, y compris les sujets à traits fins (`oilWell`, `listening`).

Le poids ne suit pas le nombre de pixels : ÷10,2 en surface ne donne que ÷5,1 en octets. Un WebP
petit paie proportionnellement plus d'en-tête et de détail par pixel — l'attendu de 60 Ko était
optimiste du double, le gain reste de 5×.

**Rien n'est perdu en la baissant.** `buildings_clean/` garde les sources pleine résolution et
regénérer est une commande : le jour où une fenêtre affiche une planche en grand, remonter la
constante coûte une minute.

### Le manifeste, et pourquoi il n'y a pas de teinte

`BUILDING_SPRITES` est un `Record<BuildingKey, string | null>` **complet** : une clé ajoutée au
domaine sans planche casse la compilation au lieu de casser l'affichage, et une absence s'écrit
`null` — explicitement, jamais par omission. `manifest.test.ts` vérifie la couverture et
qu'aucune clé ne partage la planche d'une autre.

**Les planches de bâtiments ne sont pas teintées, et ne doivent pas l'être.** Contrairement aux
unités (§5), aucun filtre encre n'est appliqué : `.label-plate` ne porte qu'une réserve de
papier et une ombre portée.

Ce n'est pas un oubli, c'est une conséquence du brouillard. **`PlayerView` ne sert jamais les
bâtiments adverses** ([ADR 0005](../docs/adr/0005-brouillard-par-defaut.md)) : tout bâtiment
affiché appartient déjà au joueur qui regarde. Une teinte nationale ne distinguerait donc rien
de rien — elle coûterait une passe de rendu pour porter zéro information.

Ce qui porte l'appartenance sur la carte, c'est le **remplissage de la région** (l'encre du
pays, plus dense là où l'on a bâti) et la **barre du jalon**, qui est à l'encre nationale. Le
sujet, lui, reste neutre.

**Ce que ça libère, et qui n'a pas encore été exploité :** la règle de génération « toit clair
plutôt que sombre, l'encre a besoin de place » n'existait que pour ce filtre. Sans teinte, les
planches peuvent être **plus contrastées et plus sombres** — les quinze actuelles ont été
générées sous une contrainte qui n'a plus lieu d'être.

---

## 8. Ressources

Huit planches, une par `ResourceKey`, sorties du même générateur que les bâtiments et passées
au même régime : recadrage sur la boîte englobante alpha puis normalisation par la hauteur.

```bash
python WWS/sprites/optimiser.py --source WWS/sprites/ressources \
                                --destination src/emblems/resources --recadrer
```

Mesuré : 2,5 Mo de PNG → **64 Ko** de WebP, 6 à 11 Ko par ressource.

### Deux jeux, pas deux versions

`ResourceIcon` (vectoriel, `currentColor`) et `RESOURCE_PLATES` (illustré) **coexistent**, et le
partage se fait sur la taille d'affichage, jamais sur le goût : sous ~20 px la texture d'une
illustration se réduit en bouillie, et le contour vectoriel gagne. La planche tient donc tout ce
qui se dessine à 20 px et au-dessus — bandeau compris, à 20 px, et fenêtres à 22-44 — et le
vectoriel garde les lignes de facture à 11 et 12 px, où il n'a pas de concurrent. `Plate.tsx`
porte la règle en commentaire, à l'endroit où on serait tenté de l'oublier.

**Le bandeau y est passé sur décision explicite**, contre ce que disait
`docs/prompts/code/bandeau-huit-ressources.md`. Ça se paie en largeur : les huit planches boîtées
prennent 200 px là où les huit vectoriels tenaient en 104, donc les chiffres des compteurs ne
sortent qu'à partir de `2xl` (1536 px) au lieu de `xl`. L'ordre de sacrifice n'a pas bougé — les
chiffres cèdent avant les icônes, un groupe calme avant un groupe à sec — seul son seuil a
glissé, ce qui est exactement ce qu'un ordre sert à encaisser.

Sur fond de nuit, la passe d'encre est **relevée** au lieu d'être assombrie
(`brightness(1.18)` contre `.94` sur papier) : `.94` est une correction contre le papier et
pousse du mauvais côté sur `--desk`. Deux fonds, deux valeurs — `resourceColor` porte la même
bascule `onPaper` depuis que le vectoriel existe.

Les planches **portent leur propre encre** et ne reçoivent aucune teinte : ce sont des objets
posés sur du papier, pas des silhouettes coloriées par l'appelant. C'est pour ça que
`resourceColor` reste utile au vectoriel et n'a rien à dire ici.

### Le `noms.json` des ressources est inversé, et c'est voulu

Les unités sortent d'un dossier rangé à la main, donc leur table dit
`{"chasseur-D520": "chasseur"}` — le fichier porte déjà un nom de matériel. Les ressources
sortent du générateur avec un UUID pour seul nom : leur table part de la **clé** et pointe vers
le fichier, parce que la clé est le seul bout lisible. Elle garde à côté le sujet dessiné, le
ratio de la boîte englobante et les réserves mesurées — l'appariement a été vérifié sur ces
ratios, pas sur l'ordre du dossier, et aplatir la table pour uniformiser les deux formes ferait
perdre la seule trace de cette vérification.

`charger()` normalise les deux formes. Depuis, **une table présente fait autorité** : un PNG
qu'elle ne nomme pas est ignoré avec un mot dans le compte rendu — le dossier des ressources
traîne un rejet de génération qui, sans cette règle, sortirait en `Default_Emblme_….webp`.

### Le charbon, mesuré

`noms.json` note la seule réserve chiffrée : la planche du charbon tombe à **2,80 de contraste**
sur `--desk` (`#0f0a04`), sous le plancher de 3:1 admis pour un pictogramme, avec 33 % de pixels
quasi noirs. Sur fond de papier, aucun problème — c'est le fond de nuit qui l'avale. Le bandeau,
qui est le seul fond sombre, applique `.resource-reserve` (`drop-shadow(0 0 1px var(--paper))`)
aux **huit** icônes vectorielles : une exception par ressource serait une exception à maintenir.
