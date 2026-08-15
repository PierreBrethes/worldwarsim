"""Sprites nettoyés → assets du front : WebP qualité 80, à la taille où ils s'affichent.

    python WWS/sprites/optimiser.py --source WWS/sprites/units_fr_clean \
                                    --destination src/emblems/units/france

    python WWS/sprites/optimiser.py --source WWS/sprites/buildings_clean \
                                    --destination src/emblems/buildings

Les sources restent dans WWS/ ; `src/` ne reçoit que l'optimisé. Le renommage vers les clés
`UnitRole` se lit dans un `noms.json` posé à côté des sources, une table par nation : c'est là
que vivent les noms de matériel (« armor-2-matilda-2 »), qui n'ont rien à faire dans le front.

**Deux régimes, selon qu'un `echelles.json` est posé à côté des sources.**

*Sans* — les unités. Réduction à 512 px de large au plus, jamais d'agrandissement, cadrage
inchangé : `UnitSprite` pose chaque sujet dans une boîte commune en `object-contain`, donc la
marge de génération ne se voit pas.

*Avec* — les bâtiments. Le sujet est **recadré sur sa boîte englobante alpha**, puis mis à
l'échelle **par la hauteur**. Les deux passes vont ensemble et répondent au même défaut : les
planches ont été générées une par une, le sujet y occupant de 21,5 % à 57,7 % du cadre, si bien
qu'un entrepôt cadré serré et une fonderie cadrée large sortiraient de la même taille. La
hiérarchie de la carte viendrait alors d'un accident de cadrage — un baraquement aussi imposant
qu'une fonderie. La hauteur est la grandeur de référence, pas la largeur : à l'affichage le
point d'ancrage est la **base** du bâtiment, donc c'est la hauteur qui décide de la présence à
l'écran.

**Une clé absente d'`echelles.json` arrête le script en la nommant.** Un repli silencieux à 1,0
redonnerait exactement le défaut qu'on corrige, en pire : il serait invisible.

Le filtre encre est une passe d'affichage, jamais cuit ici — cf. README.md.
"""

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

LARGEUR_MAX = 512
HAUTEUR_REFERENCE = 512
QUALITE = 80


def optimiser(source: Path, destination: Path) -> None:
    noms = charger(source / "noms.json")
    echelles = charger(source / "echelles.json")
    destination.mkdir(parents=True, exist_ok=True)

    for fichier in sorted(source.glob("*.png")):
        cle = noms.get(fichier.stem, fichier.stem)
        image = Image.open(fichier).convert("RGBA")
        image = a_l_echelle(image, cle, echelles) if echelles else reduite(image)
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


def a_l_echelle(image: Image.Image, cle: str, echelles: dict[str, float]) -> Image.Image:
    if cle not in echelles:
        raise SystemExit(f"échelle manquante pour « {cle} » — à ajouter dans echelles.json")
    cadre = image.getbbox()
    if cadre is None:
        raise SystemExit(f"planche vide : « {cle} »")
    sujet = image.crop(cadre)
    hauteur = max(1, round(HAUTEUR_REFERENCE * echelles[cle]))
    largeur = max(1, round(sujet.width * hauteur / sujet.height))
    return sujet.resize((largeur, hauteur), Image.LANCZOS)


def charger(table: Path) -> dict:
    return json.loads(table.read_text(encoding="utf-8")) if table.exists() else {}


if __name__ == "__main__":
    # La console Windows est en cp1252 : sans ça, le compte rendu meurt sur une flèche.
    sys.stdout.reconfigure(encoding="utf-8")
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument("--source", type=Path, required=True)
    analyseur.add_argument("--destination", type=Path, required=True)
    arguments = analyseur.parse_args()
    optimiser(arguments.source, arguments.destination)
