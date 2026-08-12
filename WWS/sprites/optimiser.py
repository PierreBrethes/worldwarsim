"""Sprites nettoyés → assets du front : 512 px de large au plus, WebP qualité 80.

    python WWS/sprites/optimiser.py --source WWS/sprites/units_fr_clean \
                                    --destination src/emblemes/unites/france

Les sources restent dans WWS/ ; `src/` ne reçoit que l'optimisé. Le renommage vers les clés
`RoleUnite` se lit dans un `noms.json` posé à côté des sources, une table par nation : c'est là
que vivent les noms de matériel (« blinde-lourd-B1bis »), qui n'ont rien à faire dans le front.

Aucun agrandissement : une source déjà sous la limite est convertie telle quelle. Le filtre encre
est une passe d'affichage, jamais cuit ici — cf. README.md.
"""

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

LARGEUR_MAX = 512
QUALITE = 80


def optimiser(source: Path, destination: Path) -> None:
    noms = charger_noms(source)
    destination.mkdir(parents=True, exist_ok=True)

    for fichier in sorted(source.glob("*.png")):
        cible = destination / f"{noms.get(fichier.stem, fichier.stem)}.webp"
        image = Image.open(fichier).convert("RGBA")
        if image.width > LARGEUR_MAX:
            hauteur = round(image.height * LARGEUR_MAX / image.width)
            image = image.resize((LARGEUR_MAX, hauteur), Image.LANCZOS)
        image.save(cible, "WEBP", quality=QUALITE, method=6)
        print(
            f"{fichier.name:28} → {cible.name:24} {image.width}×{image.height}"
            f"  {fichier.stat().st_size // 1024} Ko → {cible.stat().st_size // 1024} Ko"
        )


def charger_noms(source: Path) -> dict[str, str]:
    table = source / "noms.json"
    return json.loads(table.read_text(encoding="utf-8")) if table.exists() else {}


if __name__ == "__main__":
    # La console Windows est en cp1252 : sans ça, le compte rendu meurt sur une flèche.
    sys.stdout.reconfigure(encoding="utf-8")
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument("--source", type=Path, required=True)
    analyseur.add_argument("--destination", type=Path, required=True)
    arguments = analyseur.parse_args()
    optimiser(arguments.source, arguments.destination)
