---
type: prompt
statut: validé
maj: 2026-10-03
code: [src/map/engine/index.ts, src/domain/mouse-mapping.ts, src/map/ControlsCard.tsx, src/routes/-plateau/SettingsWindow.tsx, src/styles/index.css, index.html, public/sw.js]
decisions: [mobile-1c-2026-10-03, mobile-geste-2026-10-03]
voir: [../../../rapports/2026-10-03-releve-mobile.md, ../done/releve-mobile.md, ../done/fenetres-sur-mobile.md, ../../../design/11-brief-ui.md]
---
# mobile-1-socle-tactile — le doigt agit, la page ne bouge plus

**En bref.** Premier lot de la refonte mobile (décision mobile-1c du 03/10/2026, qui **révise la
décision du 15/09** « ce qui demande un clic droit ne marche pas, c'est assumé » et lève
l'exclusion du point 9 de la vision V1). Il pose le socle que toute maquette mobile supposera :
une grammaire du doigt, une page qui ne zoome ni ne rebondit, plus de survol collant. Il ne
redessine **rien** : rail, calques, cartes papier, docks et tailles de cibles viendront des
maquettes (lots suivants).

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, `WWS/docs/design/11-brief-ui.md` §5,
`src/domain/mouse-mapping.ts`, le moteur (`src/map/engine/index.ts` : `buttonAt`, `roleOf`,
`trackGesture`, `endGesture`, `applyMapping`) et le rapport
`WWS/docs/rapports/2026-10-03-releve-mobile.md` (causes C1, C2, C4). Ne commit pas, ne push pas.
Un chantier, un commit.

## 1. La grammaire du doigt (C1)

Elle se décide **par événement**, sur `pointerType === 'touch'`, et ne lit ni ne modifie le
réglage de la souris : un ordinateur tactile garde sa souris telle que le joueur l'a réglée, et
son écran suit la grammaire du doigt.

- **Toucher net** (même seuil de mouvement que le clic net aujourd'hui) = **agir** : ouvre la rose
  des vents, exactement comme le bouton qui agit.
- **Un doigt qui glisse** = **déplacer** la carte (panoramique sur le plateau,
  `screenSpacePanning` inchangé).
- **Deux doigts** : pincer = rapprocher/éloigner ; tourner ou glisser à deux = **orienter**.
  (`OrbitControls.touches` : `ONE: TOUCH.PAN`, `TWO: TOUCH.DOLLY_ROTATE`.)
- **Ce que le clic net gauche lit aujourd'hui ne doit pas disparaître.** Liste-le (popin de
  troupe, mât, dépôt, objectif…). Sur un toucher net, la rose s'ouvre **et** la lecture que
  donnait le clic gauche s'affiche avec elle. Le dessin définitif de ce couple viendra des
  maquettes ; ici, seulement : rien de lisible à la souris n'est illisible au doigt.
- La visée d'un mouvement (« préparer un mouvement » au panneau de garnison) se termine au
  toucher : la destination se choisit par un toucher net sur la carte.
- **Ce qui s'affiche** : la carte des commandes (`ControlsCard`) et la section souris des
  Réglages montrent, sous `(pointer: coarse)`, la grammaire du doigt en trois lignes à la place
  du tableau des boutons. Textes dans `fr.ts`.

Mets à jour le commentaire de tête de `mouse-mapping.ts` (« la grammaire de la carte ne se règle
pas ») : il couvre désormais aussi le doigt.

## 2. La page ne bouge plus (C2)

- `index.html` : `viewport` devient `width=device-width, initial-scale=1, viewport-fit=cover`.
  **Pas** de `user-scalable=no` ni de `maximum-scale` : iOS les ignore et ils retirent le zoom
  d'accessibilité partout.
- `html, body` : `overscroll-behavior: none`.
- Le conteneur du plateau et tout ce qui flotte dessus (fenêtres, feuilles, docks, panneaux,
  cartouches, rose) : `touch-action: pan-x pan-y` (un pincement n'y zoome plus la page, une liste
  défile toujours). Le canevas reste à `touch-action: none`.
- Marges de l'iPhone : le rail du bas, le bandeau du haut et les feuilles plein écran respectent
  `env(safe-area-inset-*)`.
- Hors plateau (connexion, rejoindre, accueil, salon) : on n'y bloque pas le pincement.

## 3. Le survol ne colle plus (C4)

Tout ce qui ne s'affiche qu'au survol (dock pays/région, bulles de la rose, détail de la bande de
ressources) ne se montre **jamais** sur un événement `pointerType === 'touch'`. Ce qui portait une
information utile au toucher passe par le toucher net (§1).

## 4. Les champs à 16 px

Sous 768 px, tout champ de saisie (`input`, `textarea`, `select`) a une taille de police calculée
d'au moins 16 px : télégraphe, heure de repos du salon, code, pseudo, mot de passe. Sinon Safari
zoome au focus et la page reste zoomée.

## 5. Le badge des notifications Android

Copie `Claude outputs/marque/icones/badge-96.png` dans `public/icons/badge-96.png` (silhouette
blanche du M et de son filet, fond transparent : Android ne garde que l'opacité). Dans
`public/sw.js`, `badge` passe de `/icons/icon-192.png` à `/icons/badge-96.png`. L'icône de la
notification, elle, reste `icon-192.png`.

## 6. Hors périmètre

Rail du bas et bascules de calques, cartes papier qui débordent (C3), docks qui mangent la carte
(C5), tailles des cibles tactiles, accueil et salon : tout cela sera redessiné d'après les
maquettes. N'y touche pas, même si c'est tentant.

## 7. Vérification

- Tests unitaires : le rôle d'un geste selon `pointerType` et le bouton (souris inchangée pour
  les trois préréglages ; doigt : toucher net → agir, glissé → déplacer).
- **Relance le relevé** (`Claude outputs/releve-mobile/releve.mjs`, backend local) sur les trois
  appareils, et mesure : un toucher net ouvre la rose (réglage souris par défaut) ; un glissé
  d'un doigt déplace sans orienter ; pincer sur une fenêtre laisse `visualViewport.scale` à 1 ;
  aucun dock de survol après un toucher.
- **Profites-en pour atteindre ce qui manquait** : panneaux construction et sol, aperçu d'un
  mouvement jusqu'à « envoyer », une troupe ennemie relevée, un site (donne au joueur de test le
  charbon nécessaire par les mutations de développement, et dis-le). Captures en plus dans
  `Claude outputs/releve-mobile/captures/` ; complète le §4 du rapport avec une ligne datée.
- `npm run verifier` complet.

Compte rendu : fichiers touchés, tests passés, ce que le relevé relancé montre, et la liste des
écrans capturés (elle servira aux maquettes).
