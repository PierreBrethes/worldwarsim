# fenetres-sur-mobile — toutes les fenêtres et panneaux exploitables sur un téléphone, la carte inchangée

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, `WWS/docs/design/11-brief-ui.md` §5. Ne
commit pas, ne push pas. Suppose `correctifs-ui-discord` livré. Un chantier, un commit.

## Le périmètre — décision du 15/09 (révise la 2a du même jour)

**La carte reste telle qu'elle est.** Pas de mode mobile de la carte, pas de gestes nouveaux,
pas de rose au long-press, pas d'entrée retirée : ce qui marche au doigt marche, ce qui demande
un clic droit ne marche pas, et c'est assumé pour ce lot. **Tout ce qui n'est pas la carte
devient exploitable sur un écran étroit** : les huit fenêtres de `WINDOWS` (`plateau.tsx:170`),
les trois panneaux d'angle, les cartouches, l'aperçu de mouvement, « à faire maintenant », le
bandeau et le rail. Exploitable = lisible sans zoom, fermable, défilable, saisissable au
clavier virtuel. Le point 9 de la vision V1 (continuité mobile) reste hors périmètre.

## Où ça se joue — deux cadres, pas dix fenêtres

Les huit fenêtres passent par **un seul cadre**, `FloatingWindow` (`Window.tsx:43`) ; les
trois panneaux (`ConstructionPanel`, `GarrisonPanel`, `GroundPanel`) par **un seul** `Panel`
(`Panel.tsx:16`). C'est là que ça se corrige — pas dans chaque contenu. Un contenu ne se touche
que si, une fois le cadre en feuille, il déborde encore (tableaux de la presse, de l'abaque,
de Nation).

- **Seuil** : `< 768px` (le `md` de Tailwind, convention du dépôt). Pas de détection d'agent,
  pas de réglage.
- **`FloatingWindow` sous le seuil** : feuille plein écran, `width` ignoré, ni déplacement ni
  redimensionnement (`useDragOffset` et la poignée de coin ne se montent pas), la géométrie
  mémorisée (`readWindowGeometry`) n'est ni lue ni écrite. **Une seule feuille visible** : la
  dernière de `BoardSearch.windows` ; les autres restent dans l'URL, donc fermer la dernière
  révèle la précédente — la pile existe déjà, on ne rend que son sommet. L'URL reste celle du
  bureau : un lien partagé s'ouvre des deux côtés.
- **`Panel` sous le seuil** : feuille ancrée en bas, hauteur au contenu bornée à ~60 % de
  l'écran, défilante, poignée de fermeture visible sans survol. La carte reste visible
  au-dessus — un panneau de garnison qui cache la carte ne sert plus la visée.
- **Cartouches** (`TroopBadge`, `CampBadge`) et `MovementPreview` : vérifier qu'ils ne sortent
  pas de l'écran quand ils se posent près d'un bord ; les recaler, sans les redessiner.
- **`NextActions`** (bas-gauche) : ne doit pas recouvrir le rail ni le bandeau ; replié par
  défaut sous le seuil, une ligne d'en-tête qui déplie.
- **Rail** (`SurfaceRail`) en bas, fixe, pictogrammes seuls, badges conservés. **Bandeau**
  (`ResourceBand`) sur deux lignes de quatre ou en défilement horizontal — lisible sans zoom.
- **Cibles tactiles** : tout bouton de fermeture, d'onglet ou de ligne cliquable fait au moins
  44 px de haut sous le seuil (les boutons `text-[9px]` du style presse restent tels quels au
  bureau ; sous le seuil c'est le padding qui grandit, pas la fonte).
- **Clavier virtuel** : le champ du télégraphe et ceux de connexion / salon restent visibles
  clavier ouvert (`100dvh`, pas `100vh`).
- **Accueil, connexion, salon** : vérifier qu'ils tiennent ; corriger ce qui déborde, sans
  refonte.

## Ce qui ne change pas

Le moteur de carte (`src/map/`), les ordres, `PlayerView`, le serveur. Aucune règle, aucun
champ, aucun libellé nouveau hors `fr.ts` si un en-tête de feuille en demande un.

## Cas d'acceptation

1. iPhone SE (375 px) : connexion → accueil → salon → plateau sans débordement horizontal.
2. Chaque fenêtre de `WINDOWS` s'ouvre en feuille plein écran, se lit sans zoom, se ferme ;
   presse, abaque et Nation : tableaux en liste ou défilants, jamais coupés.
3. Deux fenêtres ouvertes dans l'URL : seule la dernière se voit ; la fermer révèle l'autre.
4. Tap sur un mât de caserne → `SiteModal` en feuille ; recruter une compagnie depuis le
   téléphone aboutit.
5. Tap sur une pile posée → cartouche entièrement dans l'écran ; le panneau de garnison, s'il
   s'ouvre, laisse la carte visible au-dessus.
6. Télégraphe : écrire un message clavier ouvert, le champ reste visible.
7. Au-dessus du seuil : captures avant/après identiques sur les huit fenêtres et les trois
   panneaux — rien n'a bougé au bureau.
8. Vérifieur vert.
