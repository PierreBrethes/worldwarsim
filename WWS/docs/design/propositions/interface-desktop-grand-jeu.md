# Interface desktop — passer du bon au grand jeu — proposition du 08/10/2026

**Statut : proposition, rien n'est tranché.** Demande de Pierre : une UI/UX desktop « digne des
meilleurs jeux », sur toutes les vues, au plateau et en dehors. Cette note fait trois choses :
l'audit de ce qui existe (capturé le 08/10 en 1440×900 sur une saison locale réelle), la cible
vue par vue, et **l'architecture qui la rend possible** — vocabulaire du skill `codebase-design`
(module, interface, profondeur, couture). Elle finit par les décisions à prendre et les lots.

Elle ne relitige rien en silence : chaque point qui heurte une décision gravée est marqué
**⚖ décision** et renvoyé au §6.

## 1 · En bref

Le jeu a déjà une identité que peu de jeux ont : la presse de 1940, l'encre, le tampon. Ce qui
le sépare des meilleurs n'est pas l'habillage, c'est **la tenue de main** :

1. **La carte ne vous aide pas à la regarder.** Ouverture sur le monde entier avec 40 % d'écran
   noir au-dessus du plateau, caméra oubliée à chaque chargement, pas de touche « retour au QG »,
   un QG aussi gros que la France au zoom monde, et la France d'une encre si proche de la mer
   que sa côte atlantique disparaît.
2. **Tout s'ouvre au centre, par-dessus ce qu'on regarde.** Huit fenêtres centrées qui
   s'empilent en cascade ; « recentrer » pose la cible sous la fenêtre qui l'a demandée ; la
   carte « à faire maintenant » couvre l'Atlantique et une partie de la France.
3. **Le clavier n'existe pas.** Quatorze écouteurs `keydown` indépendants, Échap qui ferme
   certaines choses et pas d'autres, aucun raccourci de caméra, de bureau ou de cycle.
4. **Le temps — la ressource d'un jeu asynchrone — n'a pas de vue.** Arrivées, chantiers,
   édition, plage de repos, fin de désactivation : chacun vit dans sa surface, aucune ne dit
   « voilà ce qui se passe dans les douze prochaines heures ».

Et une cause commune côté code : `BoardContent` porte **une machine d'états implicite** —
~30 `useState`, une exclusivité tenue par des effets de nettoyage, six façons de poser quelque
chose sur le plateau. Tant qu'elle reste implicite, chaque amélioration d'UX coûte une
régression. L'architecture (§5) passe donc **avant** le gros de l'UX.

## 2 · Ce que l'audit a vu

### 2.1 Bugs visibles (à corriger quoi qu'on décide)

| Où | Quoi |
|---|---|
| Accueil | Le tampon « ÉTAT-MAJOR » recouvre le lien « se déconnecter ». |
| Plateau | Les indicateurs de bord (`EdgeIndicators`) se dessinent **par-dessus** la carte « à faire maintenant » : glyphes et chiffres dans le texte de la carte. |
| Économie | « ne produit rien » déborde dans les colonnes voisines (« ne produit rienne produit rienne produit rien »). |
| Carte | Encre France (`#3f5a7d`) quasi identique à la mer rendue : le littoral atlantique s'efface. Toute nation sombre a le même risque. |
| Carte | « Recentrer » (fiche Nation → ligne de troupe) pose la cible au centre de l'écran, **sous** la fenêtre ouverte. |
| Plateau | `RouteScale` et la bannière `orderError` partagent `top-4 left-4` : ils se chevauchent. |
| Plateau | Échap ne ferme ni `GarrisonPanel`, ni `ConstructionPanel`, ni les cartes caisse/camp/objectif, ni les cartes de démolition/démantèlement. |
| Partout | **77 `title=` natifs dans 38 fichiers**, contre la décision 68a (« `HoverCard`, jamais un `title` natif »). |
| Carte | Quatre curseurs dessinés sur cinq (`public/cursors/`) ne sont branchés nulle part. |

**Lot 0, le 08/10.** Corrigés et vérifiés au navigateur : le tampon de l'accueil (la déconnexion
se colle au pseudo, le tampon s'efface sous le seuil), l'ordre des indicateurs de bord (le
conteneur de la carte « à faire » passe de `z-10` à `--z-indicator`), le débordement d'Économie
(la phrase qui remplace un taux peut passer à la ligne), le refus de fondation (en haut à droite
sur desktop, l'échelle de route garde le haut-gauche), et Échap (une couche par touche : fenêtres,
puis visée et pose, puis cartes et panneaux ancrés). **Reportés** : le littoral et les curseurs
sont des choix de dessin (planches P1 et P2 du
[brief Claude Design](brief-claude-design-interface-desktop.md)), le recentrage sous la fenêtre
attend la zone sûre (lot 3), les `title` natifs attendent `Hint` (lot 4).

### 2.2 Frictions, vue par vue

**Une, connexion, invitation.** Solides. Rien d'urgent.

**Accueil.** Une colonne papier de 720 px au milieu d'un bureau de 1440 : la moitié de l'écran
ne sert à rien. Une partie se lit comme une ligne d'annuaire — elle ne dit pas **ce qui vous
attend** (dépêches non lues, slot libre, chantier fini), qui est la seule question d'un joueur
asynchrone qui revient.

**Salon.** Le bouton « lancer » et le télégraphe sont **sous la ligne de flottaison** à
1440×900. On choisit sa nation sur une grille de drapeaux, sans voir ni la carte ni ce qui
distingue les nations (pouvoir national, manque national — qui ne se lisent qu'une fois la
partie lancée, dans la fiche Nation).

**Entrée en campagne.** L'aide-mémoire est un mur de vingt paragraphes avant la première image
de la carte. C'est de la documentation, pas une prise en main.

**Pose du QG.** On choisit « quartier général », la carte reste sur le monde entier, et la carte
« à faire » se déplie en une liste de **101 noms de régions** en texte courant, avec la
consigne « rapprochez-vous ». Le clic de pose ne donne aucun retour.

**Carte.** Zoom lent (≈ 60 crans de molette du monde à la France). Pas de recherche de région
(4 589 régions). Huit interrupteurs d'indicateurs de 20 px dans le rail, sans libellé visible.
Les indicateurs de bord saturent les bords droit et bas dès qu'on zoome (« 34 gisements hors
champ »…).

**Bureaux (Nation, Économie, Abaque, Presse, Journal, Télégraphe, Réglages).** Tous en fenêtre
flottante centrée, chacune avec sa propre en-tête (huit copies). Deux ouvertes font une cascade.
Économie et Abaque occupent 90 % de l'écran tout en laissant voir des bouts de carte inutiles.

**Panneaux de carte.** Le panneau de garnison s'ouvre à côté du QG… et couvre l'étiquette du QG.
La rose au clic droit marche bien ; c'est la meilleure pièce de l'interface.

## 3 · Ce que font les meilleurs jeux et qu'on ne fait pas

Références : *Hearts of Iron IV*, *Crusader Kings III*, *Europa Universalis IV* (Paradox),
*Civilization VI*, *Total War*, et pour l'asynchrone *Neptune's Pride*, *Supremacy 1914*.

| Principe | Chez eux | Chez nous |
|---|---|---|
| **La caméra sert le joueur** | Ouverture sur sa capitale, `Home`, mémoire de la vue, recherche de province | Monde entier à chaque chargement, aucune touche |
| **Rien ne s'ouvre sur ce qu'on regarde** | Panneaux ancrés aux bords ; la caméra décale sa cible hors des panneaux | Fenêtres centrées ; le recentrage tombe dessous |
| **Modes de carte** | Lentilles Civ, *map modes* Paradox : une touche, une lecture | Huit interrupteurs anonymes |
| **Alertes compactes** | Pastilles en haut d'écran, détail au survol, clic = aller voir | Une grande carte en bas à gauche |
| **Le clavier d'abord** | Tout raccourci affiché dans l'infobulle ; cycle « unité suivante » | Rien |
| **Infobulles imbriquées** | CK3 : un terme souligné ouvre sa définition | 77 `title` natifs |
| **Prise en main contextuelle** | Une astuce au premier geste concerné | Un mur de texte au lancement |
| **Le temps se voit** (asynchrone) | Neptune's Pride : quand arrive quoi, quand revenir | Dispersé dans six surfaces |
| **Le geste répond** | Tampon, son, encre qui se répand | Interdit par la DA (⚖ décision 1) |

## 4 · La cible, vue par vue

### 4.1 Le plateau — un écran à zones

```
┌──────────────────────────────────────────────────────────────────────────┐
│ MANCHETTE  France │ chantier 01:21 │ slots 0/2 │ ⚑ alertes ⚑ ⚑ │ journal │  bandeau
│ 🍞118 +4/h · 🧵40 · ⛏20 … (taux sous chaque stock, rouge si négatif)   │  ressources
├──┬───────────────────────────────────────────────────────────┬──────────┤
│R │                                                           │          │
│A │                       LA CARTE                            │ (registre│
│I │        zone sûre = ce que la caméra vise                  │ ⚖ déc. 2)│
│L │                                                           │          │
│  │  carte ancrée au point (garnison, troupe, camp…)          │          │
│  ├───────────────────────────────────────────────────────────┤──────────┤
│  │ ÉCHÉANCIER  ──|──────|────────|───|──────────|──  +12 h   │ FICHE    │
│  │ arrivée 1h12  chantier 3h  édition 4h  repos 23h          │ survol   │
└──┴───────────────────────────────────────────────────────────┴──────────┘
```

- **Zone sûre.** Toute surface ouverte publie le rectangle qu'elle occupe ; la caméra vise le
  centre de ce qui reste. « Recentrer », « aller voir », la pose d'une rose : tout tombe dans la
  zone sûre (§5, M2 + M4).
- **Alertes.** « À faire maintenant » devient une rangée de **pastilles** dans le bandeau, une par
  famille (fondations dues, chantier libre, troupe sans ordre, hors ravitaillement, slot libre),
  avec le compte ; survol = la liste, clic = aller à la suivante (le cycle existe déjà depuis
  `154b53c`). Vide, il n'y a rien — la règle actuelle tient. ⚖ décision 3 (révise la place
  décidée le 30/08).
- **Échéancier.** Une frise basse des douze prochaines heures : arrivées des siens, caps estimés
  sur soi (l'estimation que la dépêche sert déjà), fin de chantier, prochaine édition, plage de
  repos, fin de désactivation. Survol = la ligne ; clic = aller voir. **N'invente aucune donnée** :
  ne trace que les dates que `PlayerView` sert ; ce qui manque est marqué « ⚠ pas-servi » à la
  maquette. C'est la vue qui manque le plus à un jeu asynchrone : elle dit quand revenir.
- **Fiche de survol.** `GroundPanel` reste la fiche de ce que survole la souris, bas-droite, et
  grandit pour tout ce qui se survole (région, bâtiment, pile, relevé) — un seul endroit pour lire.
- **Ressources.** Le taux (+x/h) imprimé sous chaque stock, en `--critical` s'il est négatif ;
  l'infobulle garde le plafond et la source.

### 4.2 La carte

- **Caméra.** Ouverture sur le QG (ou la capitale tant qu'il n'existe pas) ; la dernière vue
  retenue par saison dans `localStorage` (c'est la main du joueur, comme le mappage de souris) ;
  inclinaison bornée pour qu'aucun écran ne montre de vide noir ; un préréglage **vue
  verticale** (demandé sur Discord le 15/09).
- **Clavier.** Flèches / ZQSD pour glisser, `+`/`−` pour le zoom, `Origine` = QG, `Tab` = élément
  suivant de l'alerte sous le pointeur, double-clic = zoomer sur le point.
- **Recherche de région** (`/` ou `Ctrl+F`) : un champ, les 4 589 noms, la caméra y vole et la
  région se sélectionne. C'est aussi ce qui remplace la liste des 101 régions de la pose du QG.
- **Échelle des planches.** Une planche de bâtiment ou d'unité rapetisse au zoom monde et se
  regroupe en pastille numérotée sous un seuil — le QG ne couvre plus la France.
- **Littoral toujours encré.** Le trait de côte passe **au-dessus** de l'aplat de nation : la
  palette ne bouge pas, la France retrouve sa côte.
- **Modes de carte** (lentilles), une touche chacune, dans le rail à la place des huit
  interrupteurs :

  | Mode | Ce qu'il montre | Touche |
  |---|---|---|
  | Politique | encre des sièges, relevés délavés (l'actuel) | `1` |
  | Gisements | pictogrammes de gisement, régions bâties | `2` |
  | Logistique | rayons de ravitaillement, hors réseau, troupes hors ravitaillement | `3` |
  | Renseignement | **couverture de détection et ses angles morts** — la carte de la §4.9 du brief, qui n'existe pas encore ; ce que la vue sert des portées des siens est à vérifier au contrat 05 | `4` |
  | Menaces | relevés adverses, caps estimés sur soi, dernières positions connues | `5` |

  Les interrupteurs d'indicateurs de bord restent, rangés dans le mode qui les concerne.

- **Pose d'un bâtiment** (QG, dette de mobilisation, port) : la caméra vole jusqu'au sol éligible,
  les régions éligibles se hachurent, le curseur devient `curseur-construire.png` et porte le nom
  de la région survolée ; la carte « à faire » dit « 101 régions éligibles » et offre la recherche.
- **Rose.** Inchangée, plus une lettre de raccourci par branche.

### 4.3 Les bureaux

Deux formats, pas un, et **une seule en-tête** pour tous :

- **Volet** (Nation, Journal, Télégraphe, Réglages) : pleine hauteur, accolé au rail, ~480 px. La
  carte reste visible et jouable à droite ; la zone sûre se décale.
- **Bureau plein écran** (Économie, Abaque, Presse) : on change d'écran, comme l'arbre
  technologique de Civ ou l'écran de production de HOI. La carte s'efface derrière le papier,
  Échap y ramène. C'est plus honnête qu'une fenêtre de 1280 px qui laisse voir des miettes de carte.
  ⚖ décision 4.

Un seul bureau ouvert à la fois (règle des maquettes), donc plus de cascade. Chaque bureau a sa
touche (`N`, `E`, `A`, `P`, `J`, `T`).

### 4.4 Les cartes ancrées au point

Garnison, chantier, cartouche de troupe, camp, objectif, caisse, aperçu de mouvement, démolition,
démantèlement : **une seule pièce** qui choisit son côté, n'empiète jamais sur la cible ni sur une
zone réservée (bandeau, rail, échéancier), se ferme à Échap et se traîne. Le panneau de garnison ne
couvre plus l'étiquette de son QG.

### 4.5 Prise en main

L'aide-mémoire reste, rangé derrière `?` et dans Réglages. À sa place au lancement : **trois
astuces de premier geste** dans la forme du bandeau de gestes qui existe (`GestureHint`) — la
première pose, la première rose, le premier envoi — chacune affichée une fois, au moment où le
geste est possible.

### 4.6 Infobulles

`HoverCard` partout, les 77 `title` natifs remplacés. Chaque infobulle d'un élément commandable
porte son raccourci. Les termes du glossaire (relevé, désactivé, slot de mouvement, passe de
résolution…) s'impriment soulignés d'un pointillé et ouvrent leur définition au survol prolongé,
sans clic — l'idée de CK3 sans sa profondeur : un seul niveau.

### 4.7 Hors plateau

- **Accueil — « le bureau des engagements ».** Deux colonnes à partir de 1200 px : à gauche les
  parties, chacune avec **ce qui vous attend** (« 3 dépêches · 1 slot libre · chantier terminé »)
  et l'heure du prochain événement ; à droite fonder et rejoindre. ⚠ Cela demande d'élargir
  `accounts.seats` ; à chiffrer côté serveur (lecture par place, bornée).
- **Salon.** Trois colonnes tenues au-dessus de la flottaison à 1440×900 : **la carte du théâtre**
  où l'on choisit sa nation en cliquant le pays (les nations réservées à l'encre de leur siège), sa
  fiche de nation (pouvoir national, manque national — on choisit enfin en connaissance de cause),
  puis joueurs, plage de repos, prêt / lancer, et le télégraphe à demeure.
- **Fin de saison (4.10).** L'édition finale en une, pleine page : le vainqueur en manchette, le
  classement final, la carte des couleurs au dernier jour. Le plateau d'une saison conclue y
  renvoie au lieu de s'ouvrir sur une carte morte.
- **Rejeu de bataille (4.7).** Une planche par engagement, depuis la dépêche : les deux piles face
  à face, la salve de chaque camp, les pertes par rôle, le bonus de défense. Construite sur le
  compte rendu, sans re-résoudre, passable, sans aucun bouton qui agisse. ⚠ Le compte rendu ne
  sert aujourd'hui que des totaux par camp : les salves (`strikes`) sont écrites mais aucune query
  ne les sert, et les rôles sont fondus dans les totaux. Le lot 7 commence côté serveur.

## 5 · L'architecture qui rend la cible possible

Six modules à approfondir. Pour chacun : ce qu'il cache, son interface, le test de suppression,
et sa surface de test. Les dépendances sont toutes **en processus** (catégorie 1 de
`DEEPENING.md`) sauf M4 et M5, qui ont le moteur three.js derrière leur couture.

### M1 · `BoardMode` — la machine d'interaction du plateau

**Aujourd'hui.** `BoardContent` (`plateau.tsx`, ~1 770 lignes) tient ~30 `useState` dont une
quinzaine décrivent **un seul fait** : ce que la main est en train de faire — `garrison`,
`column`, `order`, `posted`, `buildingSite`, `placing`, `mobilized`, `demolition`,
`dismantling`, `selectedLoot`, `selectedCamp`, `selectedObjective`, `selectedRumorId`… Leur
exclusivité est tenue par des effets de nettoyage et par des gardes éparses (`aimingOnPhone`) ;
Échap est traité à six endroits.

**Interface.**

```ts
// src/domain/board-mode.ts — TS pur
export type BoardMode =
  | { kind: 'idle' }
  | { kind: 'reading'; target: MapTarget }          // troupe, camp, objectif, caisse, rumeur
  | { kind: 'composing'; garrison: GarrisonRef }
  | { kind: 'aiming'; column: ArmedColumn }
  | { kind: 'ordering'; column: ArmedColumn; order: Order }
  | { kind: 'building'; site: BuildingSite }
  | { kind: 'placing'; held: HeldBuilding | DebtKey }
  | { kind: 'confirming'; act: Demolition | Dismantling };

export function nextMode(mode: BoardMode, event: BoardEvent, view: PlayerView): BoardMode;
```

**Ce qu'il cache.** L'exclusivité (structurelle : un seul `kind`), le sens d'Échap (un cran en
arrière, `ordering → aiming → composing → idle`), la priorité des clics pendant une visée ou une
pose, et la disparition d'une cible que la vue ne sert plus (les effets `view.camps`,
`view.lootCrates`…). Le téléphone n'a pas d'autre mode : seule la projection change.

**Test de suppression.** Supprimer M1 refait apparaître ses règles dans chaque gestionnaire de
clic et chaque effet : il gagne sa place. **Surface de test** : des tables
`(mode, événement, vue) → mode`, sans React. Les tests de `plateau` qui vérifient l'exclusivité à
travers le DOM deviennent redondants et se suppriment (remplacer, pas empiler).

### M2 · `Overlay` — une seule façon de poser quelque chose sur le plateau

**Aujourd'hui.** Six mécanismes (`FloatingWindow`, `Panel`, `Draggable`, `MapCard`,
`BottomSheet`, `div` absolus), le calcul de quadrant **copié six fois**
(`fromRight = at.x > innerWidth/2`) et comparé à la fenêtre alors que `at` est relatif au
plateau, huit en-têtes de fenêtre, `z-10`/`z-50` en dur à côté de l'échelle `--z-*`, et un
`remember` de `Draggable` que personne ne passe.

**Interface.**

```tsx
<Overlay
  frame="card" | "drawer" | "bureau"
  anchor={{ at: BoardPoint } | { edge: 'left' }}
  title={fr.…}
  onClose={…}
>
  …
</Overlay>
```

**Ce qu'il cache.** Le placement (côté, écart, évitement de la cible et des zones réservées), le
repère (plateau, jamais `innerWidth`), l'ordre d'empilement, l'en-tête, le glisser et sa mémoire,
la fermeture à Échap (par M3), la bascule en feuille basse sous le seuil, et la **publication de
son rectangle** dans la zone sûre que lit M4.

**Test de suppression.** Supprimé, le calcul de quadrant revient six fois et l'évitement nulle
part. **Surface de test** : la fonction pure `placeOverlay(anchor, size, reserved, board)` en
tables, plus un test de rendu par format.

### M3 · `commands` — le clavier et l'aide en un endroit

**Interface.**

```ts
// src/domain/commands.ts — une table, comme OBJECTIVE_ARCHETYPES
export const COMMANDS: ReadonlyArray<{
  id: CommandId; keys: ReadonlyArray<string>; label: (fr: Fr) => string;
  when: (mode: BoardMode) => boolean;
}>;
// src/shell/useCommand.ts
useCommand('openEconomy', handler);
```

**Ce qu'il cache.** L'écoute unique, la garde `isTyping`, l'ordre d'Échap (la surface du dessus
d'abord, puis M1), les conflits. **Il alimente** la carte `?`, le raccourci imprimé dans chaque
infobulle, et plus tard la réassignation dans Réglages — même idée que `roleOf` pour la souris.

**Surface de test.** Aucune touche liée deux fois dans le même mode ; chaque commande a son
libellé ; la carte `?` liste exactement la table ; un test par grep refuse
`addEventListener('keydown'` hors du module (le procédé de `roleOf` et de `frame-demand.test.ts`).

### M4 · `CameraDirector` — la caméra qui sert le joueur

**Interface.** `show(subject, { reason })`, `home()`, `remember()`/`restore(seasonId)`, où
`subject` est des identifiants, des points, une région ou une nation. **Il lit la zone sûre**
publiée par M2. **Ce qu'il cache** : `focus`/`nonce`/`reveal`/`lift`/`distance` d'aujourd'hui, les
paramètres de `journeyTo`, les bornes d'inclinaison, le préréglage vertical. La couture est réelle
(moteur three.js en production, faux moteur en test : deux adaptateurs).

### M5 · `MapScene` — une carte déclarative (dernier lot, à concevoir deux fois)

**Aujourd'hui.** `<WorldMap>` reçoit **43 props** ; `MapEngine` expose **34 méthodes et
10 rappels**, dont une quinzaine de `show*`/`set*` (`showBuiltRegions`, `showHeldRegions`,
`showDesignatedRegions`, `showReach`, `setBuilding`, `setAiming`, `setDesignating`,
`setPlacing`…). C'est un module **peu profond** : l'appelant doit savoir quoi allumer, dans quel
ordre, et ne pas oublier `invalidate()` — que le test de `frame-demand` doit lire dans la source
pour s'en assurer.

**Interface visée.** `engine.display(scene)` où `scene = sceneOf(view, mode, mapMode, toggles)`
est **pure** ; le moteur fait le diff. L'invalidation devient structurelle (une seule entrée). Les
modes de carte (§4.2) ne sont qu'une entrée de `sceneOf`. Le plus gros chantier : à passer par
`DESIGN-IT-TWICE` (trois interfaces concurrentes) avant d'écrire une ligne.

### M6 · `Hint` — une seule infobulle

`HoverCard` existe et est la bonne pièce ; il lui manque d'être **la seule**. `Hint` l'enveloppe
avec le raccourci (lu dans M3) et le terme de glossaire. Un test par grep refuse ` title=` dans
`src/` hors attributs SVG.

### Ce qui ne bouge pas

`PlayerView` reste la seule source. Les unions discriminées des arcs restent le brouillard du
compilateur. `src/i18n/fr.ts` reste la seule table. La rose et `movement-orders.ts` ne changent
pas : M1 consomme ce qu'elles décident, il ne le rejuge pas.

## 6 · Décisions à prendre

1. **Le mouvement dans l'interface.** La DA interdit animations d'entrée et transitions. Les
   meilleurs jeux répondent au geste. Proposition : lever l'interdit pour un **vocabulaire
   d'imprimerie fermé** — le tampon qui frappe (120 ms), l'encre qui se répand sur une région
   qui change de couleur, le volet qui glisse du rail, le vol de caméra — et rien d'autre ; plus
   le son du téléscripteur déjà prévu (`carte-plaisirs-apres-test.md`). Tout coupable dans
   Réglages, et coupé sous `prefers-reduced-motion`.
2. **Un registre.** Tous les jeux de référence ont un *outliner* (la liste de ses forces, points
   et chantiers, chaque ligne recentre). La décision du 30/08 (« ce qui a une position ne vit pas
   dans un panneau ») l'a retiré. Proposition : un registre **de lecture**, repliable, à droite,
   sans aucun ordre — ou le statu quo, la fiche Nation tenant ce rôle.
3. **Les alertes en pastilles dans le bandeau** au lieu de la carte « à faire » en bas à gauche.
4. **Deux formats de bureau** : volet pour Nation, Journal, Télégraphe, Réglages ; plein écran
   pour Économie, Abaque, Presse.
5. **L'ordre des lots** (§7) : architecture d'abord (recommandé), ou gains visibles d'abord.

## 7 · Les lots

| Lot | Contenu | Dépend de |
|---|---|---|
| 0 | Les bugs du §2.1 — **fait le 08/10** pour cinq, quatre reportés à leur lot | — |
| 1 | Maquettes HTML des vues cibles : [brief Claude Design](brief-claude-design-interface-desktop.md), sept planches | — (elles servent à trancher 1–4) |
| 2 | **M1** `BoardMode` + **M3** `commands` — rangement sans changement de comportement (tidy first), puis Échap partout et les raccourcis | — |
| 3 | **M2** `Overlay` + zone sûre + **M4** caméra : ouverture sur le QG, mémoire, `Origine`, recentrage hors des panneaux | 2 |
| 4 | Plateau : bureaux en volet / plein écran, pastilles d'alerte, échéancier, recherche de région, pose guidée, lettres de la rose, **M6** | 3 |
| 5 | Hors plateau : salon sur carte, accueil « ce qui vous attend », fin de saison | 1 |
| 6 | **M5** `MapScene` (concevoir deux fois d'abord), modes de carte, échelle des planches, littoral encré, vue verticale | 3 |
| 7 | Rejeu de bataille (4.7) : servir les salves et les pertes par rôle, puis la planche | 4 |
