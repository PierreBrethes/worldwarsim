# Partie de contrôle en prod — retours du 11/09/2026

Première partie à plusieurs sur la prod (état d'après Codex + S8). Une ligne par observation de
Pierre, avec le tri : **règle voulue** (à mieux dire), **bug**, ou **décision** (à trancher).
La feuille de contrôle : `technique/partie-de-controle-a-deux.md`.

| # | Observation (Pierre) | Tri | Lecture |
| --- | --- | --- | --- |
| 1 | « Veuillez réessayer » par intermittence — `playerView` > 1 s | bug | Grille de routage rasterisée à froid dans une query (`view.ts` → `coastAtPoint`). Prompt `grille-cuite`. |
| 2 | QG : choisir l'emplacement au début ; impossible sur une région à gisement | décision | **Tranchée 1b le 13/09** : le joueur pose son QG où il veut sur son sol, première dette du socle — y compris sur une région à gisement, qu'il sacrifie en connaissance de cause. Révise l'ADR 0015 et l'ADR 0017 §2. Rouvrait `fonder-sans-question` (31/08, sélecteur retiré faute d'enjeu) ; l'enjeu était une bâtisse par région. Question 89. |
| 3 | J'attaque une mine adverse : il voit ma troupe mais pas avec le sprite | règle voulue | ADR 0005/0021 : un arc adverse ne porte que la silhouette de domaine — jamais le type, la composition, la nation. Le compte rendu de l'engagement dit ensuite ce qui a frappé. À guetter : est-ce lu comme un bug ? Si oui, c'est la silhouette qui doit dire « inconnu » plus fort. |
| 4 | Sur une région adverse qui a un bâtiment, je ne vois pas le bâtiment | bug probable | S5a/S8 : une installation relevée (`regionSightings.installations`, écrit à l'arrivée du couloir) se dessine au centroïde dans le délavé des relevés. Soit le relevé d'arrivée ne couvre pas la région cible, soit le marqueur n'apparaît qu'au zoom des bâtiments à soi. Prompt `retours-prod-lot-1`. |
| 5 | J'ai attaqué le bâtiment (mine de charbon) : rien ne s'est passé | règle + trou d'affordance | `attaquer` vise un point ou une pile, jamais un bâtiment — sans garnison, la colonne est **bredouille**. Seul « saboter » (S8) désactive une mine, depuis le marqueur d'installation relevée — invisible ici (4). La dépêche « bredouille » doit dire qu'un bâtiment est là et comment on l'atteint. |
| 6 | Les modales passent sous la barre des ressources | bug | `z-index` : le bandeau au-dessus des fenêtres. Prompt `retours-prod-lot-1`. |
| 7 | Deux troupes posées l'une dans la portée de l'autre ne se voient pas | décision + chantier | Vérifié dans `movement/detection.ts` : `reassessDetection` ne relève **que les mouvements** ; une troupe posée est détecteur, jamais détectée. Le brief de l'ADR 0021 disait « forces mobiles et stationnées ». Ce qu'une pile posée révèle d'une autre reste à trancher — question 90 — puis un chantier (nouveau fait par observateur, servi et dessiné). |
| 8 | « Le binding des actions de caméra / déplacement » — deux potes, deux habitudes : l'un comme aujourd'hui, l'autre veut la rose au clic molette et le déplacement au clic droit | décision prise (91a) → prompt | Quel bouton fait quoi est une préférence de joueur, pas une règle : trois rôles (orienter, déplacer, agir) sur trois boutons, permutation dans Réglages, deux presets nommés (« classique », « molette agit »), la fiche `?` et l'aide-mémoire lisent le mappage. Le clic net gauche lit toujours ; espace + gauche déplace toujours. Prompt `commandes-de-la-souris`. Clavier retiré, faute de demande. |

À noter pendant que ça tourne : attaques volontaires par joueur et par jour, ce qui déclenche
chaque visite, et si quelqu'un bouge à cause d'une rumeur (ADR 0005, 84a).
