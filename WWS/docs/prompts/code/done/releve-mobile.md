---
type: prompt
statut: livré
maj: 2026-10-03
code: []
decisions: []
voir: [../done/fenetres-sur-mobile.md, ../../../design/11-brief-ui.md]
---
# releve-mobile — l'état du jeu sur téléphone, mesuré écran par écran, sans rien corriger

**En bref.** Un relevé, pas un correctif. Pierre trouve le jeu « utilisable mais mal intégré » sur
téléphone : des pages qui bougent, des éléments qui dépassent. Avant de décider jusqu'où refaire
le mobile, il faut la liste exacte, avec captures. Ce lot ne modifie aucun fichier de `src/`.

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, `WWS/docs/design/11-brief-ui.md` §5 et
`WWS/docs/prompts/code/done/fenetres-sur-mobile.md` (le lot du 15/09 : fenêtres en feuilles
sous 768 px, carte volontairement inchangée). Ne commit pas, ne push pas.

## 1. L'outil

Un script Playwright **hors du dépôt suivi** : `Claude outputs/releve-mobile/releve.mjs`, avec ses
captures dans le même dossier. Ajoute `Claude outputs/releve-mobile/` à `.gitignore`. Aucune
dépendance ajoutée à `package.json` : installe Playwright dans ce dossier.

Trois appareils émulés, `isMobile` et `hasTouch` actifs : iPhone 13 (390 × 844), iPhone SE
(375 × 667), Pixel 7 (412 × 915). Contre le front local (`npm run dev:complet`) avec une saison
réelle à deux joueurs : prépare-la comme les tests d'intégration le font, ou dis précisément ce
qui t'en empêche.

## 2. Les écrans

`/connexion`, `/rejoindre/<code valide>`, `/accueil`, `/salon`, puis `/plateau` :
- à vide ;
- chacune des huit fenêtres de `WINDOWS`, ouverte par l'URL ;
- les trois panneaux (construction, garnison, sol) ;
- « à faire maintenant » replié puis déplié ;
- une troupe touchée (cartouche) ;
- la rose des vents ouverte sur une troupe ;
- l'aperçu d'un mouvement ;
- le télégraphe avec le champ de saisie au focus.

## 3. Ce qui se mesure, sur chaque écran

1. **Débordement horizontal** : `scrollWidth > clientWidth` sur `html`, `body`, `#root` et
   chaque conteneur défilant ; nomme l'élément le plus large.
2. **Éléments hors de l'écran** : tout élément interactif ou texte visible dont la boîte sort
   du viewport, même d'un pixel.
3. **Cibles tactiles** sous 44 × 44 px (boutons, liens, cases, poignées).
4. **Champs de saisie** dont la taille de police calculée est sous 16 px : Safari zoome sur
   eux au focus, et la page reste zoomée.
5. **Les gestes sur la carte** : un glissé d'un doigt, un pincement, un double toucher. Après
   chacun, relève `visualViewport.scale`, `window.scrollX/Y` et la position de la caméra. Une
   page qui défile ou qui zoome pendant que la carte bouge, c'est « la page qui bouge ».
6. **Les déclarations manquantes**, relevées dans le code et non supposées : `touch-action` sur
   le canevas et sur les fenêtres, `overscroll-behavior` sur `html`/`body`, la balise `viewport`
   d'`index.html`, `env(safe-area-inset-*)` en mode installé sur l'écran d'accueil.
7. **Les gestes sans équivalent tactile** : depuis `buttonAt` et le réglage de la souris
   (`7bc3a69`), la rose des vents, les raccourcis clavier et les menus contextuels, liste tout ce
   qui ne s'atteint qu'au clic droit, au clic milieu, au survol ou au clavier. Pour chacun,
   précise si le jeu reste jouable sans.

## 4. Le rendu

`WWS/docs/rapports/2026-10-03-releve-mobile.md` :
- un tableau `écran × appareil × problème × capture`, trié par gravité :
  1. bloque une action de jeu ;
  2. gêne la lecture ;
  3. cosmétique ;
- la liste des gestes sans équivalent tactile (point 7) ;
- les causes communes : un défaut qui touche dix écrans est une ligne, pas dix ;
- ce que l'émulation ne montre pas, honnêtement. Safari iOS réel diffère sur l'élasticité, la
  barre d'adresse et le clavier : liste ce que Pierre doit vérifier lui-même sur son iPhone.

Pas de correctif, même évident : note-le dans la colonne « piste ». La décision de périmètre
(intégration seule, ou carte jouable au doigt) se prend après ce relevé.
