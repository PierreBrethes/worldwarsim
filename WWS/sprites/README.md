# Sprites d'unités — pipeline

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
