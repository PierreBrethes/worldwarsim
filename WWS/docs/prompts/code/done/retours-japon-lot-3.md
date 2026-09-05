# retours-japon-lot-3 — les pictogrammes de la fiche de rôle, et leur popin

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, puis `WWS/CONTEXT.md`. Ne commit pas, ne push
pas. Suppose les lots 1 et 2 livrés.

Décision 68a (04/09) et retour de Pierre sur la planche design 68a (jointe) : dans la fiche
dépliée de l'abaque, les trois données servies portent un pictogramme, **sans libellé
imprimé** — le pictogramme porte la valeur, et le survol du pictogramme ouvre une popin qui
nomme la donnée et l'explique. Le contrat `06-abaque-catalogue.md` (P2, « pictogrammes de
fiche ») fait loi. Client pur.

## 1. Les trois pictogrammes

| donnée | pictogramme | ce qu'il remplace dans `Mark` (`GunneryWindow.tsx`) |
|---|---|---|
| coût alliage | lingot (un seul, pas la pile du rail — la fiche dit un prix, pas un stock) | le mot `fr.resources.alloy` |
| formation | horloge, aiguilles en réserve dans le plein | `fr.production.trainingLabel` |
| effectif nominal | cœur | `fr.gunnery.strengthLabel` |

Famille pleine du rail, sans contour, 15 px dans la fiche, même encre que le corps. Les
tracés sont sur la planche jointe : si Pierre a exporté `ingot-20/40.png`, `clock-20/40.png`,
`heart-20/40.png` dans `public/pictograms/`, sers-les par `Pictogram` comme les autres ; sinon
trace-les en SVG inline dans `Glyph.tsx`, dans le style des glyphes existants, et dis-le
dans le rapport. La ligne **« en service »** n'a pas de pictogramme : son libellé reste.

## 2. La popin au survol

Même mécanique que la popin du bandeau des ressources (`ResourceBand.tsx` : état `hovered`,
ancre au `onMouseEnter`, composant `Tooltip`) — réutilise-la ou extrais ce qui se partage,
pas une troisième façon de faire une popin. Elle s'ouvre au survol du pictogramme seul (pas
de la valeur), se ferme au départ, ne se clique pas. Elle imprime : le nom de la donnée en
kicker, puis une phrase. Trois nouvelles clés `fr.gunnery.stats` :

- `alloy` : « coût — alliage » · « Ce que la troupe coûte à former, prélevé au lancement du
  lot. »
- `training` : « formation » · « Le temps que la chaîne met à la livrer, à la vitesse de
  votre quartier général. »
- `strength` : « effectif nominal » · « L'effectif est la vie : la part de l'abaque se prend
  sur lui, et une troupe à 32 / 50 tire à 32 / 50. »

Vérifie la dernière phrase contre `combat.ts` avant de l'imprimer : si l'attaquant n'est pas
échelonné par son effectif engagé, réécris-la pour dire ce que le moteur fait — jamais
l'inverse.

Le pictogramme reste lisible sans souris : `aria-label` = le nom de la donnée. Aucun `title`
natif en doublon de la popin.

## 3. Ce qui ne bouge pas

La grille, les bandes, la condition « se forme dans … de niveau n » (lot 2), « en service »,
la modale de site (ses cartes de rôle gardent leurs libellés — la fiche de l'abaque est le seul
endroit qui change ; si `RoleCard` et `Mark` partagent du code, la variante à pictogrammes est
une option, pas le nouveau défaut).

## Cas d'acceptation

1. Étant donné l'abaque avec l'infanterie pliée, chaque marque lit « [lingot] 18 », « [horloge]
   00:20:00 », « [cœur] 50 soldats », puis « en service 3 » avec son libellé — aucun mot
   « alliage », « formation », « effectif » imprimé dans la fiche.
2. Le survol du lingot ouvre la popin « coût — alliage » + sa phrase ; le survol du chiffre 18
   n'ouvre rien ; le départ la ferme.
3. La ligne la plus longue de la fiche (« se forme dans un aérodrome de niveau 2 — quartier
   général niveau 3 requis ») tient toujours d'une volée dans la colonne.
4. Un lecteur d'écran lit « coût — alliage 18 » (aria-label + valeur).
5. Aucune régression sur la popin du bandeau des ressources si du code a été partagé.

`npm run verifier` vert. Un commit, message qui décrit le chantier entier.
