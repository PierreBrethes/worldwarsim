# Captures du nettoyage des couleurs — 03/10/2026

1440 × 900, Chrome headless, pile locale (Convex en conteneur, deux comptes, deux saisons).
`avant/` = HEAD, `apres/` = nettoyage appliqué. Scénario : `capture.mjs`, comparateur : `compare.mjs`
(pngjs, installé hors du projet). Seuil : un canal qui s'écarte de plus de 1/255.

| écran | pixels > 1 | écart max |
|---|---|---|
| 01-connexion.png | 1120 | 2/255 |
| 02-rejoindre.png | 89339 | 32/255 |
| 03-accueil.png | 349 | 2/255 |
| 04-salon.png | 21583 | 3/255 |
| 05-plateau.png | 0 | 0/255 |
| 06-economie.png | 0 | 0/255 |
| 07-abaque.png | 0 | 0/255 |
| 08-presse.png | 0 | 0/255 |
| 10-journal.png | 0 | 0/255 |
| 11-aide-memoire.png | 0 | 0/255 |

Plateau, économie, abaque, presse, journal, aide-mémoire : **identiques au pixel près**.

Écarts des quatre premiers écrans :
- `01` et `02` : le fond de carte flou du journal n'est pas stable d'une capture à l'autre (deux
  captures « avant » diffèrent de 20 et 40/255). Sur les pixels stables, 2/255 (connexion) et
  4/255 (invitation). La feuille centrale est identique.
- `03` et `04` : 2 à 3/255, sur les dégradés (reflet sous les drapeaux du salon, trame de papier).
  Chrome interpole les dégradés en flottant dès qu'une couleur sort de `color-mix`
  (`color(srgb …)`) alors qu'il quantifie `rgba()` sur 8 bits. Isolé dans une page d'essai, le même
  dégradé écrit des deux façons diffère de 2/255. C'est un arrondi du navigateur, pas une couleur.
- Non capturé : la fiche de site (aucun site constructible dans une saison neuve : la caserne
  demande un chantier), le télégraphe (la page noircit sous swiftshader).
