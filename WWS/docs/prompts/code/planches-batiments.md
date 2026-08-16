# Prompt Claude Code — la chaîne d'assets des quinze bâtiments

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, `WWS/sprites/README.md` et
l'[ADR 0016](../../adr/0016-code-en-anglais-jeu-en-francais.md). Ne commit pas, ne push pas.

**Les quinze planches existent.** Elles sont dans `WWS/sprites/buildings/`, nommées par leur clé :
`airfield, arsenal, barracks, billets, depot, farm, foundry, hq, listening, mill, mine, oilWell,
port, quartermaster, warehouse`. Elles sont déjà détourées — fond transparent, sujet entier, base
visible. Ce prompt les fait entrer dans `src/` proprement, puis débloque la partie B de
[`batiments-sur-la-carte.md`](batiments-sur-la-carte.md).

Ignore le dossier `_to_delete/` : ce sont les versions remplacées, Pierre les videra.

> **Périmé sur un point, gardé comme trace.** La table d'échelle par clé (`echelles.json`,
> points 2 et 5 ci-dessous) a été **supprimée le 16/08** : elle n'a jamais rien produit, le CSS
> du jalon épinglant une hauteur commune. Les quinze planches sortent désormais à la même
> hauteur — cf. [`echelles-a-plat.md`](echelles-a-plat.md) et `WWS/sprites/README.md` §7. Le
> recadrage sur la boîte englobante alpha et la normalisation par la hauteur, eux, sont
> toujours en place.

## Ce qui ne va pas aujourd'hui, mesuré

Deux défauts, tous deux invisibles tant qu'on regarde les planches sur fond sombre.

**1. Des ombres portées survivent, et `nettoyer-ombres.py` ne peut pas les voir.** Le script filtre
sur `alpha < OPACITE_SUJET` (235) : il suppose qu'une ombre est semi-transparente. Sur les planches
de bâtiments, l'ombre a été rendue **opaque** — mesurée à `alpha = 254` sur `port`, `depot` et
`farm`. Le critère actuel passe à côté à 100 %.

**2. Les planches ne portent aucune échelle commune.** Elles ont été générées une par une : le
sujet occupe de **21,5 % à 57,7 %** du cadre selon la planche. Un `warehouse` cadré serré et une
`foundry` cadrée large sortiront donc de la même taille après réduction à 512 px, et la carte
perdra toute hiérarchie — un baraquement aussi imposant qu'une fonderie.

C'est le même piège que celui de l'ADR 0015 sur les quantités comptées en régions : une grandeur
qui vient d'un accident du cadrage plutôt que d'une décision.

## Étape 1 — `nettoyer-ombres.py` apprend l'ombre opaque

Ajoute un **second critère, indépendant de l'alpha** : un pixel est une ombre s'il est **sombre**,
**désaturé** et **hors du noyau dilaté du sujet**. Le critère existant reste — il sert toujours aux
unités, où l'ombre est semi-transparente. Les deux se cumulent, ils ne se remplacent pas.

Deux garde-fous, parce que ce critère mord plus fort que l'ancien :

- **le seuil de désaturation protège le sujet**, dont les matériaux (acier peint, brique, bois
  goudronné) sont ternes mais jamais neutres. Une ombre est une teinte de fond assombrie : ses
  canaux restent proportionnels entre eux. Mesure avant de figer plutôt que de deviner ;
- **le contrôle se fait sur fond clair, toujours.** Le script imprime déjà le nombre de pixels
  retirés ; ajoute une sortie de contrôle optionnelle — la planche nettoyée composée sur
  `neutralLand: #d5c5a0` — parce qu'une ombre ne se voit que là. C'est le seul moyen de savoir si
  un changement de seuil a nettoyé ou mangé.

`oilWell` a déjà été traité à part : le fond était **enclavé entre les barres du treillis**, ce
qu'aucun détourage par remplissage depuis les bords n'atteint. Note le cas dans le README — pour
tout sujet ajouré, le détourage doit être une **clé chromatique globale**, pas un remplissage.

## Étape 2 — `optimiser.py` cadre et met à l'échelle

Aujourd'hui il se contente de réduire à 512 px de large. Il lui faut deux passes de plus, dans cet
ordre :

1. **recadrer sur la boîte englobante alpha**, ce qui supprime la marge variable de génération ;
2. **redimensionner selon une table d'échelle par clé**, lue dans un `echelles.json` posé à côté
   des sources — même mécanique que le `noms.json` des unités. La hauteur est la grandeur de
   référence, pas la largeur : le point d'ancrage à l'affichage est la base du bâtiment, donc
   c'est la hauteur qui décide de la présence à l'écran.

Table de départ, à l'œil ensuite. `1,00` est la référence, le quartier général :

| clé | échelle | pourquoi |
|---|---|---|
| `hq` | 1,00 | il domine — c'est l'étranglement de toute l'économie, ça doit se voir |
| `foundry` | 0,90 | grande halle industrielle |
| `port` | 0,90 | hangar et cale |
| `mill` | 0,85 | long bâtiment d'usine |
| `barracks` | 0,85 | caserne à deux niveaux |
| `mine` | 0,80 | le chevalement est haut |
| `airfield` | 0,80 | hangar à toit en arc |
| `oilWell` | 0,75 | haut mais étroit |
| `arsenal` | 0,75 | atelier bas et long |
| `farm` | 0,70 | le silo la fait paraître plus haute qu'elle n'est |
| `warehouse` | 0,70 | entrepôt |
| `quartermaster` | 0,70 | grange d'intendance |
| `depot` | 0,60 | trois cuves basses |
| `billets` | 0,55 | baraquements |
| `listening` | 0,50 | cabane et antennes |

**Une clé absente de `echelles.json` est une erreur, pas un `1,0` par défaut.** Un défaut
silencieux redonne exactement le problème qu'on corrige. Le script s'arrête et nomme la clé
manquante.

Le filtre encre reste une passe d'affichage, jamais cuit ici — c'est déjà écrit dans le README,
ça ne change pas.

## Étape 3 — le manifeste

`src/emblems/buildings/` reçoit les quinze WebP. Écris le manifeste typé sur le modèle de celui
des unités : un `Record<BuildingKey, ...>` **complet**, les quinze clés présentes, une absence
s'écrivant `null` et jamais une clé manquante. C'est ce qui fait qu'un bâtiment ajouté au domaine
sans planche casse la compilation au lieu de casser l'affichage.

## Étape 4 — la partie B

Une fois `src/emblems/buildings/` peuplé, la partie B de
[`batiments-sur-la-carte.md`](batiments-sur-la-carte.md) peut tourner : le billboard sur la
région, le seuil de disparition au dézoom, la mesure du coût d'affichage. Rien n'y change.

Vérifie au passage que la **partie A** (la teinte des régions bâties) est bien passée. Si non,
fais-la d'abord — elle ne dépend d'aucune planche et c'est elle qui dit si la couche carte se lit.

## Critères d'acceptation

- Les quinze planches nettoyées, contrôlées **sur fond clair**, sans ombre portée résiduelle.
- `src/emblems/buildings/` contient quinze WebP dont les hauteurs respectent la table d'échelle.
- Une clé absente de `echelles.json` fait échouer le script avec son nom, sans repli silencieux.
- Le manifeste est un `Record<BuildingKey, ...>` complet ; retirer une clé casse la compilation.
- `WWS/sprites/README.md` gagne sa section « bâtiments » : quinze visuels neutres, gabarit,
  ombre opaque, clé chromatique pour les sujets ajourés, table d'échelle.
- `npm run build` et `npm run test` passent ; aucun terme banni.

## Ce que tu ne fais pas

Tu ne retouches pas les planches à la main et tu n'en redessines aucune — ce qui manque se
signale, ne s'invente pas. Tu ne touches ni au schéma serveur, ni aux règles de pose, ni à la
fenêtre Nation. Tu n'affiches toujours pas les gisements.
