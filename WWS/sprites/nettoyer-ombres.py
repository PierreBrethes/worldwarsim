"""Retire les ombres portées restées dans l'alpha d'un sprite détouré.

    python WWS/sprites/nettoyer-ombres.py --source WWS/sprites/UK \
                                          --destination WWS/sprites/units_uk_clean

Le détourage par couleur de fond laisse une ombre : ce n'est plus du vert, donc rien ne la
retire, et elle ne se voit qu'une fois le sprite posé sur du papier clair — en tache sous les
chenilles ou la coque. Mesuré sur la planche britannique : 2 300 à 9 000 pixels par sprite au
delà de trois pixels du sujet, invisibles sur fond sombre.

Une ombre se reconnaît à trois traits simultanés : semi-transparente, **sombre**, et **hors du
sujet**. Le critère de luminance est ce qui sauve le disque d'hélice d'un chasseur, lui aussi
semi-transparent et hors silhouette, mais clair. Relever `LUMINANCE_MAX` nettoie plus fort et
finit par manger l'hélice : vérifier sur fond clair après chaque changement.

Dépend de Pillow, NumPy et SciPy — outil de préparation d'assets, jamais lancé au build.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

OPACITE_SUJET = 235
MARGE_ANTICRENELAGE = 3
LUMINANCE_MAX = 118


def nettoyer(image: Image.Image) -> tuple[Image.Image, int]:
    pixels = np.array(image.convert("RGBA"))
    alpha = pixels[..., 3].astype(int)
    luminance = pixels[..., :3].astype(int).mean(-1)

    sujet = alpha > OPACITE_SUJET
    # La dilatation garde le liseré d'anticrénelage, qui est semi-transparent lui aussi.
    voisinage = ndimage.binary_dilation(sujet, iterations=MARGE_ANTICRENELAGE)
    ombre = (alpha > 0) & (alpha < OPACITE_SUJET) & (~voisinage) & (luminance < LUMINANCE_MAX)

    pixels[..., 3] = np.where(ombre, 0, alpha)
    return Image.fromarray(pixels), int(ombre.sum())


def traiter(source: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for fichier in sorted(source.glob("*.png")):
        nettoye, retires = nettoyer(Image.open(fichier))
        cible = destination / fichier.name
        nettoye.save(cible)
        print(f"{fichier.name:34} {retires:>7} px d'ombre retirés → {cible.name}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument("--source", type=Path, required=True)
    analyseur.add_argument("--destination", type=Path, required=True)
    arguments = analyseur.parse_args()
    traiter(arguments.source, arguments.destination)
