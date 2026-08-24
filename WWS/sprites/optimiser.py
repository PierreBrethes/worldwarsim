"""Sprites nettoyés → assets du front : WebP qualité 80, à la taille où ils s'affichent.

    python WWS/sprites/optimiser.py --source WWS/sprites/units_fr_clean \
                                    --destination src/emblems/units/france

    python WWS/sprites/optimiser.py --source WWS/sprites/buildings_clean \
                                    --destination src/emblems/buildings --recadrer

Les sources restent dans WWS/ ; `src/` ne reçoit que l'optimisé. Le renommage vers les clés
`UnitRole` se lit dans un `noms.json` posé à côté des sources, une table par nation : c'est là
que vivent les noms de matériel (« armor-2-matilda-2 »), qui n'ont rien à faire dans le front.

**Trois régimes.**

*Rien* — cadrage inchangé, réduction à 512 px de large au plus, jamais d'agrandissement. Le
régime d'une planche déjà détourée serré, ce que sont les sources françaises.

*`--serrer`* — les unités générées en 1024², sujet au milieu. Recadrage sur la boîte alpha,
puis la même réduction. **La marge de génération se voit**, contrairement à ce que ce fichier
a longtemps affirmé : `UnitSprite` pose chaque sujet en `object-contain` dans une boîte
commune, donc un sujet qui n'occupe que 59 % de son cadre s'affiche 59 % plus petit que son
voisin serré. Mesuré à l'installation du Royaume-Uni : 59 % pour le Bedford contre 99,6 % pour
le camion français, côte à côte dans le même widget.

Pas de normalisation par la hauteur ici, contrairement aux bâtiments : c'est la boîte de
`UnitSprite` qui joue ce rôle, et le rapport d'un sujet — fantassin debout, navire couché —
doit lui rester lisible.

*Avec* — les bâtiments. Le sujet est **recadré sur sa boîte englobante alpha**, puis normalisé
**par la hauteur** à `HAUTEUR_REFERENCE`. Les deux passes vont ensemble et répondent au même
défaut : les planches ont été générées une par une, le sujet y occupant de 21,5 % à 57,7 % du
cadre, si bien qu'un entrepôt cadré serré et une fonderie cadrée large sortiraient de tailles
différentes — la carte hériterait d'un accident de cadrage. La hauteur est la grandeur de
référence, pas la largeur : le jalon pend par le haut, donc c'est la hauteur qui décide de la
présence à l'écran.

**Les quinze bâtiments sortent à la même hauteur.** Il n'y a pas de hiérarchie de taille sur la
carte, la distinction passe entièrement par la silhouette — tranché le 16/08, cf. README.md §7.

Le filtre encre est une passe d'affichage, jamais cuit ici — cf. README.md.
"""

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

LARGEUR_MAX = 512

# La hauteur commune des bâtiments à l'export. Les vignettes s'affichent à 46 px
# (`.label-plate`) : 160 px couvre un écran 3× DPR avec une échelle HUD jusqu'à ~1,16, ou 2× DPR
# jusqu'à ~1,74. **Rien n'est perdu en la baissant** — `buildings_clean/` garde les sources
# pleine résolution et regénérer est une commande, donc la rebouger le jour où une fenêtre
# affiche une planche en grand coûte une minute, pas un redessin.
HAUTEUR_REFERENCE = 160

QUALITE = 80

# En deçà de quoi un pixel n'est pas du sujet. **Le recadrage se lit sur l'alpha seul, jamais
# sur `Image.getbbox()`** : celui-ci teste les quatre canaux, donc un fond détouré qui garde sa
# couleur sous un alpha nul suffit à lui faire retourner le cadre entier — et le recadrage ne
# fait alors plus rien, en silence.
#
# C'est arrivé : la planche « bandages » traînait un voile d'alpha 1 à 3 sur tout son bas, à
# peine plus d'un pour cent d'opacité et invisible à l'œil. Sa boîte est donc descendue jusqu'au
# bord du cadre, la normalisation a étiré ces 230 px de vide avec le reste, et le rouleau est
# sorti à 70 % de la hauteur des sept autres. Un sujet qui flotte, sans rien dans le front pour
# l'expliquer.
#
# 8 plutôt que 0 : le seuil doit passer au-dessus du voile, pas seulement au-dessus de zéro.
# Sur les sept planches saines il ne retire que 1 à 5 px de frange d'antialiasing sur ~700,
# soit moins d'un pour cent — et sur celle qui est malade il retire 230 px de rien.
SEUIL_ALPHA = 8


def optimiser(source: Path, destination: Path, recadrer: bool, serrer: bool) -> None:
    noms = charger(source / "noms.json")
    destination.mkdir(parents=True, exist_ok=True)

    for fichier in sorted(source.glob("*.png")):
        # Une table présente fait autorité : un fichier qu'elle ne nomme pas est un reste de
        # génération, pas une planche. Sans table, le nom du fichier est déjà la clé.
        if noms and fichier.stem not in noms:
            print(f"{fichier.name:28}   ignoré — absent de noms.json")
            continue
        cle = noms.get(fichier.stem, fichier.stem)
        image = Image.open(fichier).convert("RGBA")
        image = normalisee(image, cle) if recadrer else reduite(serree(image, cle) if serrer else image)
        cible = destination / f"{cle}.webp"
        image.save(cible, "WEBP", quality=QUALITE, method=6)
        print(
            f"{fichier.name:28} → {cible.name:24} {image.width}×{image.height}"
            f"  {fichier.stat().st_size // 1024} Ko → {cible.stat().st_size // 1024} Ko"
        )


def reduite(image: Image.Image) -> Image.Image:
    if image.width <= LARGEUR_MAX:
        return image
    hauteur = round(image.height * LARGEUR_MAX / image.width)
    return image.resize((LARGEUR_MAX, hauteur), Image.LANCZOS)


def serree(image: Image.Image, cle: str) -> Image.Image:
    """Le sujet, sans son air — la même boîte alpha que `normalisee`, sans l'échelle commune."""
    cadre = boite_du_sujet(image)
    if cadre is None:
        raise SystemExit(f"planche vide : « {cle} »")
    return image.crop(cadre)


def normalisee(image: Image.Image, cle: str) -> Image.Image:
    cadre = boite_du_sujet(image)
    if cadre is None:
        raise SystemExit(f"planche vide : « {cle} »")
    sujet = image.crop(cadre)
    largeur = max(1, round(sujet.width * HAUTEUR_REFERENCE / sujet.height))
    return sujet.resize((largeur, HAUTEUR_REFERENCE), Image.LANCZOS)


def boite_du_sujet(image: Image.Image) -> tuple[int, int, int, int] | None:
    """La boîte englobante de ce qui est réellement opaque — cf. `SEUIL_ALPHA`."""
    opaque = image.getchannel("A").point(lambda valeur: 255 if valeur > SEUIL_ALPHA else 0)
    return opaque.getbbox()


def charger(table: Path) -> dict:
    """Le `noms.json` du dossier, ramené à `{nom de fichier: clé}`.

    Deux formes existent et aucune n'est de trop. Les unités sortent d'un dossier déjà rangé à
    la main, donc leur table dit `{"chasseur-D520": "chasseur"}` — le fichier porte un nom de
    matériel. Les ressources sortent du générateur avec un UUID pour seul nom : leur table part
    de la clé et pointe vers le fichier, parce que c'est la clé qui est lisible, et elle garde
    à côté le sujet dessiné et les réserves mesurées. Aplatir ces notes pour uniformiser les
    deux formes ferait perdre la seule trace de l'appariement.
    """
    if not table.exists():
        return {}
    brut = json.loads(table.read_text(encoding="utf-8"))
    ranges = {}
    for cle, valeur in brut.items():
        if cle.startswith("_"):
            continue
        if isinstance(valeur, dict):
            ranges[Path(valeur["fichier"]).stem] = cle
        else:
            ranges[cle] = valeur
    return ranges


if __name__ == "__main__":
    # La console Windows est en cp1252 : sans ça, le compte rendu meurt sur une flèche.
    sys.stdout.reconfigure(encoding="utf-8")
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument("--source", type=Path, required=True)
    analyseur.add_argument("--destination", type=Path, required=True)
    analyseur.add_argument(
        "--serrer",
        action="store_true",
        help="recadre chaque sujet sur sa boîte alpha, sans échelle commune — les unités",
    )
    analyseur.add_argument(
        "--recadrer",
        action="store_true",
        help="recadre sur la boîte englobante alpha et normalise par la hauteur — les bâtiments",
    )
    arguments = analyseur.parse_args()
    optimiser(arguments.source, arguments.destination, arguments.recadrer, arguments.serrer)
