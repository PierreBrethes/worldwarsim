# Sprites — pipeline

Deux jeux d'assets passent par cette chaîne : les **unités**, une planche par nation, et les
**bâtiments**, une planche unique de quinze visuels neutres. Les sections 1 à 6 décrivent les
unités ; la section 7 dit ce que les bâtiments font différemment, et pourquoi.

## Unités

Une planche de **onze visuels** par nation, huit nations. **La France et le Royaume-Uni sont
faits** ; les six autres suivent ce document. L'enjeu n'est pas la beauté d'un sprite isolé :
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

**Les deux planches sont incomplètes, chacune à sa façon.** La France n'a pas de `cargo` — le
Royaume-Uni est le premier du projet à en avoir un — et aucune des deux n'a le palier 2 du
porte-avions ; le manifeste sert alors la même image aux deux niveaux, et `manifest.test.ts`
garde la trace du manque.

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
                                --destination src/emblems/units/uk
```

Redimensionne à **512 px de large au plus** (jamais d'agrandissement) et encode en **WebP
qualité 80**. Ordre de grandeur mesuré sur la France : 3,4 Mo de PNG → **240 Ko**, une
vingtaine de Ko par sprite. Une planche complète doit rester sous ce budget ; au-delà, c'est
que le détourage a laissé du fond.

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
4. Lancer `optimiser.py` vers `src/emblems/units/<nation>/`.
5. Ajouter l'entrée dans `SPRITES_BY_NATION` (`src/emblems/units/manifest.ts`) et la table de
   matériel dans `equipment.ts`.

Le type `NationSprites` est un `Record` **complet** des neuf rôles : une nation qui en oublie
un ne compile pas, et un rôle sans visuel s'écrit `null` — explicitement, pas par omission. Le
test `manifest.test.ts` vérifie la couverture et les paliers.

`UnitSprite` rend un cadre pointillé portant le libellé du rôle quand le visuel est `null`,
jamais une image cassée : une nation à moitié dessinée est jouable.

---

## 7. Bâtiments

**Quinze visuels, pas cent vingt.** Un par `BuildingKey` de `src/domain/ids.ts`, **neutres**,
teintés à l'encre nationale **à l'affichage**. Une caserne à pagode pour le Japon serait belle
et coûterait huit planches, pour un sujet haut de deux centimètres à l'écran.

```
airfield  arsenal  barracks  billets  depot  farm  foundry  hq
listening  mill  mine  oilWell  port  quartermaster  warehouse
```

```
WWS/sprites/buildings/            les sources — PNG détourés, 1024², pleine résolution
WWS/sprites/buildings_clean/      le nettoyé, plus echelles.json
src/emblems/buildings/            l'optimisé — WebP recadrés et mis à l'échelle
src/emblems/buildings/manifest.ts la table typée, un Record<BuildingKey, …> complet
```

### Gabarit

Le même que les unités — trois-quarts à ~60°, lumière haut-gauche, fond `#4a7060`, **1024 ×
1024**, sujet seul — avec une exigence de plus :

**Posé sur le sol, pas flottant.** Le point d'ancrage à l'affichage est la **base** du
bâtiment, pas son centre : le billboard porte sa géométrie décalée d'une demi-hauteur
(`engine/buildings.ts`). C'est ce qui décide s'il a l'air planté ou collé.

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

### L'échelle est une décision, pas un reste de cadrage

Les planches ont été générées une par une : le sujet y occupe de **21,5 % à 57,7 %** du cadre
selon la planche. Réduites toutes à la même largeur, un entrepôt cadré serré et une fonderie
cadrée large sortiraient de la même taille — et la hiérarchie de la carte viendrait d'un
accident de cadrage. C'est le piège de l'[ADR 0015](../docs/adr/0015-economie-v2-ressources-localisees.md)
sur les quantités comptées en régions, transposé aux pixels.

`optimiser.py` recadre donc sur la **boîte englobante alpha**, puis met à l'échelle **par la
hauteur** — pas par la largeur : le point d'ancrage étant la base, c'est la hauteur qui décide
de la présence à l'écran. La table vit dans `buildings_clean/echelles.json`, même mécanique que
le `noms.json` des unités, `1,00` valant `HAUTEUR_REFERENCE = 512 px`.

| clé | échelle | | clé | échelle |
|---|---|---|---|---|
| `hq` | 1,00 | | `arsenal` | 0,75 |
| `foundry` | 0,90 | | `farm` | 0,70 |
| `port` | 0,90 | | `warehouse` | 0,70 |
| `mill` | 0,85 | | `quartermaster` | 0,70 |
| `barracks` | 0,85 | | `depot` | 0,60 |
| `mine` | 0,80 | | `billets` | 0,55 |
| `airfield` | 0,80 | | `listening` | 0,50 |
| `oilWell` | 0,75 | | | |

**Une clé absente d'`echelles.json` arrête le script en la nommant.** Un repli silencieux à
`1,0` redonnerait le défaut qu'on corrige, en pire : invisible.

```bash
python WWS/sprites/optimiser.py --source WWS/sprites/buildings_clean \
                                --destination src/emblems/buildings
```

Mesuré : 5,5 Mo de PNG → **460 Ko** de WebP, 15 à 42 Ko par bâtiment.

### Le manifeste et la teinte

`BUILDING_SPRITES` est un `Record<BuildingKey, string | null>` **complet** : une clé ajoutée au
domaine sans planche casse la compilation au lieu de casser l'affichage, et une absence s'écrit
`null` — explicitement, jamais par omission. `manifest.test.ts` vérifie la couverture et
qu'aucune clé ne partage la planche d'une autre.

L'encre nationale est une passe d'affichage, comme le filtre encre des unités (§5) : la
planche reste neutre sur le disque et `engine/buildings.ts` multiplie la texture par l'encre
**relevée vers le blanc** — les encres sont sombres par construction, faites pour s'aplatir sur
du papier, et un produit direct noierait la planche.
