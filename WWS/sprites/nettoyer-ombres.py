"""Retire les ombres portées restées dans l'alpha d'un sprite détouré.

    python WWS/sprites/nettoyer-ombres.py --source WWS/sprites/UK \
                                          --destination WWS/sprites/units_uk_clean \
                                          --controle WWS/sprites/controle

Le détourage par couleur de fond laisse une ombre : ce n'est plus du vert, donc rien ne la
retire, et elle ne se voit qu'une fois le sprite posé sur du papier clair — en tache sous les
chenilles ou la coque. Mesuré sur la planche britannique : 2 300 à 9 000 pixels par sprite au
delà de trois pixels du sujet, invisibles sur fond sombre.

**Deux ombres, deux critères, qui se cumulent.**

1. *L'ombre semi-transparente* — celle des unités. Trois traits simultanés : alpha partiel,
   **sombre**, et **hors du sujet**. Le critère de luminance est ce qui sauve le disque
   d'hélice d'un chasseur, lui aussi semi-transparent et hors silhouette, mais clair. Relever
   `LUMINANCE_MAX` nettoie plus fort et finit par manger l'hélice.

2. *L'ombre opaque* — celle des planches de bâtiments, rendue à `alpha = 254`, que le premier
   critère ne voit pas du tout. Mesuré sur les quinze planches : la couleur ne la sépare pas
   du sujet — l'ombre du `port` (V 0,28, S 0,10) et le toit du même `port` (V 0,31, S 0,15)
   sont indiscernables. Ce qui les sépare, c'est la **matière** : une ombre est un aplat, un
   toit est texturé. Le critère est donc *sombre, peu saturé et **lisse***, décidé **par
   région entière** plutôt que par pixel — une composante connexe assez vaste et assez lisse
   est une ombre, le reste est du sujet. Mesuré : ombres 2 457 à 39 421 px à `texture` 0,44 à
   0,97 ; faux positifs (cuves du `depot`, bardage du `warehouse`) 1 911 px au plus à
   `texture` 1,14 et au-delà. Les deux seuils passent entre les deux populations.

**Le contrôle se fait sur fond clair, toujours** : `--controle` écrit la planche nettoyée
composée sur le papier de la carte (`neutralLand`), le seul fond où une ombre se voit. Un
changement de seuil sans ce contrôle est un pari.

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

# L'ombre opaque. `OPAQUE` écarte le liseré d'anticrénelage, qui est noir sur ces planches et
# passerait pour de la texture ; `FENETRE` est la taille du voisinage où se mesure la matière.
OPAQUE = 200
FENETRE = 7
VALEUR_MAX = 0.42
SATURATION_MAX = 0.45
TEXTURE_MAX = 2.0
AIRE_MIN = 800
TEXTURE_MOYENNE_MAX = 1.0
PENOMBRE = 6
TEXTURE_PENOMBRE_MAX = 8.0
POUSSIERE = 120
ECART_MAX = 60

PAPIER = (0xD5, 0xC5, 0xA0)


def texture(luminance: np.ndarray, sujet: np.ndarray) -> np.ndarray:
    """L'écart-type local, mesuré **sur le sujet seul**.

    Sans le masque, le bord de la silhouette borde du noir transparent et se lit comme la
    texture la plus forte de la planche : l'ombre s'en trouve ceinturée de fausse matière, et
    aucun critère de voisinage ne la rattrape ensuite.
    """
    poids = np.maximum(ndimage.uniform_filter(sujet.astype(float), FENETRE), 1e-6)
    moyenne = ndimage.uniform_filter(luminance * sujet, FENETRE) / poids
    carres = ndimage.uniform_filter(luminance * luminance * sujet, FENETRE) / poids
    return np.sqrt(np.maximum(carres - moyenne * moyenne, 0))


def ombre_semi_transparente(pixels: np.ndarray) -> np.ndarray:
    alpha = pixels[..., 3].astype(int)
    luminance = pixels[..., :3].astype(int).mean(-1)
    sujet = alpha > OPACITE_SUJET
    # La dilatation garde le liseré d'anticrénelage, qui est semi-transparent lui aussi.
    voisinage = ndimage.binary_dilation(sujet, iterations=MARGE_ANTICRENELAGE)
    return (alpha > 0) & (alpha < OPACITE_SUJET) & (~voisinage) & (luminance < LUMINANCE_MAX)


def ombre_opaque(pixels: np.ndarray) -> np.ndarray:
    canaux = pixels[..., :3].astype(float)
    alpha = pixels[..., 3].astype(int)
    sujet = alpha >= OPAQUE

    haut = canaux.max(-1)
    bas = canaux.min(-1)
    valeur = haut / 255.0
    saturation = np.where(haut > 0, (haut - bas) / np.maximum(haut, 1), 0)
    matiere = texture(canaux.mean(-1), sujet)

    aplat = (
        sujet
        & (valeur < VALEUR_MAX)
        & (saturation < SATURATION_MAX)
        & (matiere < TEXTURE_MAX)
    )

    regions, nombre = ndimage.label(aplat)
    ombre = np.zeros_like(aplat)
    for indice in range(1, nombre + 1):
        region = regions == indice
        if region.sum() < AIRE_MIN:
            continue
        if matiere[region].mean() >= TEXTURE_MOYENNE_MAX:
            continue
        ombre |= region

    # La pénombre borde l'ombre d'un dégradé de six pixels : dégradé donc texturé, il survit
    # au critère et dessine le **contour** de l'ombre qu'on vient de retirer — pire que
    # l'ombre elle-même. Elle se reprend au voisinage immédiat de l'ombre, sous un plafond de
    # texture bien plus haut : un dégradé monte à 4, une arête de bâtiment à 15.
    penombre = (
        ndimage.binary_dilation(ombre, iterations=PENOMBRE)
        & (alpha > 0)
        & (valeur < VALEUR_MAX)
        & (saturation < SATURATION_MAX)
        & (matiere < TEXTURE_PENOMBRE_MAX)
    )
    return ombre | penombre


def isolats(alpha: np.ndarray) -> np.ndarray:
    """Ce qui reste après les deux retraits et n'est pas le sujet.

    Deux morceaux détachés se ressemblent en taille — le drapeau du quartier général fait
    5 077 px, la pointe d'ombre survivante 1 153 — mais pas en **distance** : le drapeau est à
    17 px de son mât, la pointe à 187 px de tout. C'est l'écart qui tranche, jamais l'aire ;
    l'aire ne sert plus qu'aux miettes de quelques dizaines de pixels.
    """
    presence = alpha > 0
    regions, nombre = ndimage.label(presence)
    if nombre == 0:
        return np.zeros_like(presence)
    aires = ndimage.sum(presence, regions, range(1, nombre + 1))
    sujet = int(np.argmax(aires)) + 1
    ecart = ndimage.distance_transform_edt(regions != sujet)
    perdus = [
        indice
        for indice in range(1, nombre + 1)
        if indice != sujet
        and (aires[indice - 1] < POUSSIERE or ecart[regions == indice].min() > ECART_MAX)
    ]
    return np.isin(regions, perdus) if perdus else np.zeros_like(presence)


def nettoyer(image: Image.Image) -> tuple[Image.Image, int, int]:
    pixels = np.array(image.convert("RGBA"))
    diffuse = ombre_semi_transparente(pixels)
    portee = ombre_opaque(pixels)
    pixels[..., 3] = np.where(diffuse | portee, 0, pixels[..., 3])
    pixels[..., 3] = np.where(isolats(pixels[..., 3]), 0, pixels[..., 3])
    return Image.fromarray(pixels), int(diffuse.sum()), int(portee.sum())


def sur_papier(image: Image.Image) -> Image.Image:
    fond = Image.new("RGBA", image.size, (*PAPIER, 255))
    return Image.alpha_composite(fond, image.convert("RGBA")).convert("RGB")


def traiter(source: Path, destination: Path, controle: Path | None) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    if controle is not None:
        controle.mkdir(parents=True, exist_ok=True)
    for fichier in sorted(source.glob("*.png")):
        nettoye, diffuse, portee = nettoyer(Image.open(fichier))
        cible = destination / fichier.name
        nettoye.save(cible)
        if controle is not None:
            sur_papier(nettoye).save(controle / fichier.name)
        print(
            f"{fichier.name:22} {diffuse:>7} px diffus + {portee:>7} px opaques retirés"
            f" → {cible.name}"
        )


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument("--source", type=Path, required=True)
    analyseur.add_argument("--destination", type=Path, required=True)
    analyseur.add_argument("--controle", type=Path, default=None)
    arguments = analyseur.parse_args()
    traiter(arguments.source, arguments.destination, arguments.controle)
