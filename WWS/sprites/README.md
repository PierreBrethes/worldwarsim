# Sprites d'unités — pipeline

Une planche de dix visuels par nation, huit nations. **La France est faite** ; les sept autres
suivent ce document. L'enjeu n'est pas la beauté d'un sprite isolé : c'est que les quatre-vingts
tiennent ensemble sur une même planche, au même angle et sous la même lumière. Un seul sujet
généré de trois-quarts arrière se voit immédiatement et ne se rattrape pas au filtre.

```
WWS/sprites/units_<nation>_clean/   la source — PNG détourés, pleine résolution. Ne quitte jamais WWS/.
WWS/sprites/optimiser.py            la conversion vers le front
src/emblemes/unites/<nation>/       l'optimisé — WebP, seul ce qui part au navigateur
src/emblemes/unites/manifeste.ts    la table typée qui relie un rôle à son fichier
```

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

**Orientation de référence.** Les navires et les gros porteurs — escorte, porte-avions, cargo,
transport aérien, bombardier — font **cap ouest-sud-ouest**, soit environ **8 h 30 sur un
cadran**. C'est ce qui donne à une planche son unité : deux navires qui se croisent en sens
inverse se lisent comme une erreur. Les sujets courts (infanterie, blindé, camion, chasseur)
tolèrent la variation, à condition de rester dans le même quart de tour.

## 2. Détourage

Fond retiré, alpha net, sujet recadré sur son enveloppe avec une marge de quelques pixels. Le
résultat n'a plus une seule ligne du vert d'origine, franges de bord comprises.

**Les ombres portées se retirent, toutes.** Deux formes, et la seconde se rate :

- l'ombre douce projetée au sol, semi-transparente — visible, on y pense ;
- l'**ombre verte opaque cuite sous le sujet**, de la couleur du fond, que le détourage prend
  pour de la matière et conserve. Elle ne se voit qu'une fois le sprite posé sur du papier, où
  elle apparaît en tache sombre sous les chenilles ou la coque. Il faut la chercher exprès.

Le jeu ne compose aucune ombre : la charte est à angles vifs, sans ombre ni rayon
(`src/styles/tokens.css`). Une ombre cuite dans l'asset est une ombre qu'on ne peut plus retirer.

## 3. Nommage

Un fichier porte la **clé `RoleUnite`** de `src/domaine/vue-joueur.ts`, et rien d'autre — pas de
nom de matériel. Le B1 bis est un `blinde-2` ; le jour où la France change de char, l'asset
change et le manifeste ne bouge pas.

```
infanterie-1  infanterie-2      blinde-1  blinde-2      transportTerrestre
chasseur      bombardier        transportAerien
escorte       cargo             porteAvions
```

Le suffixe `-1` / `-2` ne s'écrit que pour les **rôles à palier**, listés par
`PALIERS_PAR_ROLE` dans `src/domaine/troupes.ts` : infanterie, blindé et **porte-avions**. Les
six autres n'ont qu'un visuel et pas de suffixe.

**La planche France est incomplète sur ce point** : le porte-avions attend son palier 2. En
attendant, le manifeste sert la même image aux deux niveaux — `manifeste.test.ts` garde la
trace du manque.

Les sources gardent en pratique leurs noms de génération. Le rapprochement se déclare dans un
**`noms.json` posé à côté d'elles**, une table par nation — voir
`units_fr_clean/noms.json`. Une source déjà nommée par sa clé n'a pas besoin d'entrée.

## 4. Optimisation

```bash
python WWS/sprites/optimiser.py --source WWS/sprites/units_fr_clean --destination src/emblemes/unites/france
```

Redimensionne à **512 px de large au plus** (jamais d'agrandissement) et encode en **WebP
qualité 80**. Ordre de grandeur mesuré sur la France : 3,4 Mo de PNG → **240 Ko**, une vingtaine
de Ko par sprite. Une planche complète doit rester sous ce budget ; au-delà, c'est que le
détourage a laissé du fond.

Le script demande **Pillow** (`pip install Pillow`), qui n'est pas une dépendance du dépôt :
c'est un outil de préparation d'assets, exécuté à la main quand une nation arrive, jamais au
build.

## 5. Le filtre encre n'est pas dans l'asset

Les sprites sont livrés dans leurs couleurs. La désaturation vers la palette 1940 est appliquée
**à l'affichage**, en CSS, par `src/emblemes/SpriteUnite.tsx` :

```
filter: saturate(.5) sepia(.22) brightness(.94)
```

Même principe que les drapeaux (`src/emblemes/Drapeau.tsx`). Le budget de contraste appartient à
la couche de jeu : une DA cuite dans quatre-vingts fichiers se réencode à chaque révision de la
palette, et interdit de resservir le même sprite ailleurs — au rejeu, par exemple — sous un autre
traitement.

## 6. Brancher une nation

1. Générer les dix visuels au gabarit, détourer, poser dans `WWS/sprites/units_<nation>_clean/`.
2. Écrire le `noms.json` de rapprochement.
3. Lancer `optimiser.py` vers `src/emblemes/unites/<nation>/`.
4. Ajouter l'entrée dans `SPRITES_PAR_NATION` (`src/emblemes/unites/manifeste.ts`).

Le type `NationSprites` est un `Record` **complet** des neuf rôles : une nation qui en oublie un
ne compile pas, et un rôle sans visuel s'écrit `null` — explicitement, pas par omission. Le test
`manifeste.test.ts` vérifie la couverture et les paliers.

**Le cargo n'existe encore pour personne.** Il est à `null` partout ; `SpriteUnite` rend alors un
cadre pointillé portant le libellé du rôle, jamais une image cassée.
