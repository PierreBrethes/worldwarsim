---
type: rapport
statut: proposé
maj: 2026-10-03
code: []
decisions: []
voir: [../prompts/code/done/releve-mobile.md, ../prompts/code/done/fenetres-sur-mobile.md, ../design/11-brief-ui.md]
---
# Relevé mobile — l'état du jeu sur téléphone, le 03/10/2026

**En bref.** Aucun fichier de `src/` n'a été touché. Le relevé a tourné sur trois appareils émulés
(iPhone 13 390×844, iPhone SE 375×667, Pixel 7 412×915 — `isMobile` et `hasTouch`, Chromium) contre
le front local et une saison réelle à deux joueurs. Trois causes expliquent presque tout :
**la rose des vents n'a aucun geste tactile par défaut**, **aucune déclaration de contrôle de la
page tactile n'existe dans le code** (la page se zoome sous les doigts), et **les cartes
« papier » sont dimensionnées pour un écran large** (en-têtes et boutons qui sortent de leur
cadre). Ce qui n'a pas pu être mesuré est dit en §5.

Outil, données et captures : `Claude outputs/releve-mobile/` (hors git — `.gitignore`).
`results-*.json` porte toutes les mesures brutes ; les captures sont nommées
`captures/<appareil>__<écran>.png`.

## 1. Les causes communes

| # | Cause | Écrans touchés | Piste (rien n'est corrigé) |
| --- | --- | --- | --- |
| C1 | **Un doigt est le bouton gauche** (`buttonAt(0)` → *orienter*). La rose n'a que clic droit ou clic molette ; le défaut classique la rend donc inatteignable au toucher. Le réglage « bouton gauche = Agir » existe (Réglages, mesuré) : un tap net ouvre alors la rose et un glissé continue d'orienter la caméra — mais rien ne le propose à un téléphone, et il n'y a pas de préréglage « tactile ». | tout ce qui passe par la rose : fonder, bâtir, élever, démanteler, marcher, attaquer, piller, saboter, ramasser, entrer en garnison | décider le périmètre (§6) ; si « carte au doigt » : préréglage tactile détecté à `pointer: coarse`, ou appui long |
| C2 | **Aucun `touch-action`, `overscroll-behavior`, `env(safe-area-inset-*)` ni `user-scalable`/`maximum-scale` dans `src/`, `index.html` ou le manifeste** (grep sur `src`, `index.html`, `manifest.webmanifest` : zéro occurrence). Seul `OrbitControls` pose `touch-action: none` sur le canevas, à l'exécution. Sur les fenêtres, feuilles et docks : pincer **zoome la page** (échelle 2, décalage du viewport visuel jusqu'à 103/229 px) sur les trois appareils. | toute surface hors canevas | `touch-action: manipulation` ou `pan-y` sur les surfaces `.hud`, `overscroll-behavior: none` sur `html`/`body`, `viewport-fit=cover` + `env(safe-area-*)` si l'installé compte |
| C3 | **Les cartes papier gardent une largeur et des polices d'écran large** : `hud-fit` + `px-[30px]` + enseigne en `clamp` ; le contenu sort du cadre de 10 à 109 px (§2 L1-L3). | connexion, accueil, rejoindre, salon | dimensionner au conteneur (`cqi`), retirer le padding fixe sous 768 px |
| C4 | **Le survol est un état collant au toucher.** Un tap sur la carte pose un survol que rien ne retire (`pointerleave` n'arrive pas) : le dock « survol » (pays, région) reste affiché. | plateau (tous) | ne pas afficher le dock de survol sous `pointer: coarse` |
| C5 | **Docks et carte « à faire » mangent la carte.** Dock de survol + panneau de garnison empilés : ~45 % de la hauteur ; carte « à faire » déployée : ~half de l'écran, et les pastilles d'indicateurs de la carte passent **par-dessus** elle. | plateau | un seul dock à la fois ; z-index des indicateurs sous les cartes |

## 2. Tableau écran × appareil × problème

Gravité : **1** bloque une action de jeu · **2** gêne la lecture · **3** cosmétique.
Appareils : 13 = iPhone 13, SE = iPhone SE, P7 = Pixel 7. Les captures se trouvent dans
`Claude outputs/releve-mobile/captures/`.

| Gr. | Écran | App. | Problème (mesuré) | Capture | Piste |
| --- | --- | --- | --- | --- | --- |
| 1 | plateau (carte) | 13 SE P7 | La rose des vents ne s'ouvre pas au toucher par défaut ; l'émulation par clic droit montre qu'elle tient dans l'écran, sauf 3 libellés de la rose sur région « haute mer » qui dépassent de 18 px à droite (13) | `iphone13__rose-des-vents-clic-droit-emule`, `iphone13__rose-region-clic-droit-emule` | C1 |
| 1 | plateau (carte) | 13 SE P7 | **Gestes mesurés sur la carte** : glissé d'un doigt = **orbite** (la caméra tourne, ~100–170 unités), pas de panoramique ; pincer zoome (distance 300 → 110) et déplace la cible de ~2 unités ; double toucher : aucun effet. Sur la carte, `visualViewport.scale` reste 1, `scrollX/Y` 0. | `results-*.json`, entrées `geste-*` | périmètre §6 |
| 1 | plateau, panneau de garnison | 13 P7 | « Préparer un mouvement » arme la visée, mais **choisir la destination exige la rose** (C1) : le flux de mouvement ne s'achève pas sans réglage de souris | `iphone13__garnison-visee-armee` | C1 |
| 2 | fenêtres, feuilles, docks | 13 SE P7 | **Pincer sur une fenêtre zoome la page** (échelle 2,0, décalage 98/211 sur iPhone 13 ; 94/167 SE ; 103/229 P7). Glissé sur une fenêtre : page immobile (correct). | `iphone13__apres-gestes-fenetre` | C2 |
| 2 | rail du bas | 13 SE | Le bouton **Réglages est tronqué par le bord** : x 346–398 pour 390 px (13), 375 px (SE, 23 px coupés) ; il tient sur P7 (412). Non signalé « hors écran » par la règle générale parce que le rail est un conteneur défilant. | `iphonese__plateau-vide` | rail à 6 entrées → `flex` qui rétrécit |
| 2 | rail du bas | 13 SE P7 | **Huit bascules de calques** (bâtiments, gisements, avant-postes, chantiers, forces, mouvements, cap sur moi, renseignement) vivent à x 472–825 : **hors écran, atteignables seulement en faisant défiler le rail horizontalement**, sans indice. | `iphone13__plateau-vide` | les placer dans Réglages, ou les plier sous une entrée |
| 2 | accueil, connexion, rejoindre, salon | 13 SE P7 | **Cartes papier qui débordent** : enseigne « laMANCHETTE » rognée aux bords (+97 à +109 px) ; titre de l'invitation +21 px ; boutons « copier le code / le lien » **sortent du cadre** de ~40 px ; code `YSM8RR` +10 à +20 px ; pseudo du fondateur tronqué (34 px de large). | `iphone13__connexion`, `iphone13__salon`, `iphone13__rejoindre`, `iphone13__accueil` | C3 |
| 2 | plateau | 13 SE P7 | Dock de survol collant + dock de garnison : la carte réduite à une bande (~40 %) ; carte « à faire » déployée recouvre les poses à choisir. Sur SE le texte du bas de la carte (« Rapprochez-vous… ») est rogné. | `iphonese__a-faire-pose-fondation`, `iphone13__panneau-garnison` | C4, C5 |
| 2 | plateau | 13 SE P7 | Les pastilles d'indicateurs (`indicator--deposits`, 29×29) se dessinent **par-dessus** la carte « à faire » et le titre. | `iphone13__plateau-zoome` | C5 |
| 2 | salon, fenêtre Télégraphe | 13 SE P7 | **Champs de saisie sous 16 px** : le champ du télégraphe 13,5 px ; le champ de l'heure de repos 13 px. Chromium n'a pas zoomé au focus (échelle 1) ; Safari iOS le fait. | `iphone13__fenetre-telegraph-focus`, `iphone13__salon-telegraphe-focus` | `font-size: 16px` sous 768 px |
| 2 | plateau | 13 SE P7 | **Cibles tactiles sous 44 px**, 22 écrans sur 22 : bascule `▴` de la bande de ressources 17×17 ; carte des commandes `?` 26×26 ; 8 bascules du rail 43×53 (1 px de moins) ; pastilles d'indicateurs 29×29 ; bouton « – » des cartes 29×53 ; mâts de bâtiments : 150×36 (hauteur 36). | `iphone13__plateau-vide` | grossir à 44 px minimum |
| 2 | connexion, rejoindre, salon, accueil | 13 SE P7 | Liens et boutons bas : « pas encore de dossier » 185×21, « voir le film » 147×21, « quitter » 93×34, « envoyer » 87×33, « déclarer » 82×33, « se déconnecter » 60–69×40, `label` 16 px de haut, case à cocher 16×16. | `iphone13__connexion` | idem |
| 2 | rose (émulée) | 13 | Médaillons 34×34 (`entrer en garnison`, `améliorer`). | `iphone13__rose-des-vents-clic-droit-emule` | idem |
| 3 | plateau | 13 SE P7 | La bande de ressources se replie sur trois lignes sur SE (375) ; la carte « à faire » prend 20 % de la hauteur à vide. | `iphonese__plateau-vide` | — |
| 3 | plateau | 13 SE P7 | `html`/`body`/`#root` ne débordent jamais (`scrollWidth` = `clientWidth`, aucun défilement de page) : le « décalage de la page » ne vient donc pas d'un débordement, mais de C2. | `results-*.json` | — |

Mesures qui sont **sans défaut** : la hauteur dynamique (`100dvh`) est déjà là ; `overflow: hidden` sur
`body` empêche tout défilement de page ; aucun élément interactif ne sort du viewport en dehors des
cas ci-dessus (règle appliquée sans exempter les conteneurs `overflow: hidden`).

## 3. Les gestes sans équivalent tactile

Relevé dans `buttonAt` / `mouse-mapping.ts`, `MapLabels.tsx`, `CompassRose.tsx`,
`Window.tsx`, `plateau.tsx`. « Jouable sans » : le jeu continue-t-il sans ce geste ?

| Geste | Ce qu'il fait | Jouable sans ? |
| --- | --- | --- |
| clic droit (défaut) | ouvre la rose : toute action sur le monde | **non** — hors réglage « gauche = Agir » (C1) |
| clic molette (préréglage « molette agit ») | même rose | non, et il n'existe pas au toucher |
| `espace` + glisser | panoramique | oui : deux doigts font `DOLLY_PAN` (mesuré, `touches.TWO`) |
| glisser clic droit/milieu (orienter/déplacer) | caméra | oui : un doigt oriente, deux doigts zooment/déplacent |
| survol (`onPointerEnter`, `onMouseEnter`) | dock pays/région, bulles de la rose, détail de la bande de ressources | **partiellement** : un tap émule le survol et le garde collant (C4) ; la valeur au survol de l'abaque de tir se lit au tap |
| `Échap` | ferme fenêtres, rose, carte des commandes, bandeau | oui : chaque surface a un bouton « fermer » ; la rose se ferme sans bouton (à vérifier au doigt) |
| `Espace`/`Entrée` sur une caisse | ouvre la caisse | oui, un tap la rouvre |
| menu contextuel du navigateur | coupé partout | sans objet |
| clic droit sur un mât (bâtir, piller, saboter, élever, démanteler) | rose | non — C1 |

## 4. Ce qui a été atteint, et ce qui ne l'a pas été

Atteint et capturé sur les trois appareils : connexion (+ focus), rejoindre `/rejoindre/<code>`,
accueil, salon (+ télégraphe au focus), première visite du plateau (bandeau), plateau à vide,
« à faire maintenant » replié / déplié / pose de fondation armée, les huit fenêtres (`site` ouverte
sans bâtiment, faute de site), télégraphe au focus, plateau zoomé, panneau de garnison, troupe
cochée, visée armée, rose émulée (mât et région), mappage « gauche = Agir ».

**Non atteint ou incomplet** :
- **Panneaux construction et sol** : leur ouverture passe par la rose sur une région, donc par C1 ;
  la rose émulée a bien été ouverte sur le mât et sur une région, mais le parcours jusqu'à ces panneaux n'a pas été poussé plus loin. Non capturés.
- **L'aperçu d'un mouvement** (arc, heure d'arrivée, « envoyer — irréversible ») : exige une
  destination choisie à la rose. Non capturé.
- **Un site (caserne, aérodrome, port)** : la caserne demande le QG niveau 2, et la saison de
  test n'avait pas le charbon pour l'élever sans modifier les données. La fenêtre `site` a été
  ouverte sans bâtiment — non représentative.
- **Un adversaire** sur la carte : le deuxième joueur n'a pas été piloté.
- **iPhone SE, troupe cochée** : n'a pas été atteinte sur cet appareil (délai dépassé).
- **Gestes sur iPhone SE** : les trois glissés mesurés sont **nuls et invalides** — la carte « à
  faire » restait déployée sur la zone du geste. Rejoués isolément, ils bougent la caméra comme sur
  les autres. À ne pas compter.

**03/10, après le lot mobile-1 (socle tactile)** — relevé relancé (`releve.mjs`) et complété par
`mobile1.mjs`, sur les trois appareils. Mesuré : un toucher net ouvre la rose au réglage souris par
défaut ; un glissé d'un doigt déplace sans orienter (0,00° de rotation, cible déplacée de 39 à 61
unités) ; pincer sur une fenêtre laisse `visualViewport.scale` à 1 (contre 2 avant), hors plateau
la connexion zoome toujours (×2) ; aucun dock de survol après un toucher ; champ du télégraphe à
16 px. Désormais atteints et capturés (`captures/<appareil>__…`) : `toucher-net-region`,
`rose-premier-toucher-bulle`, `panneau-construction`, `sol-selection`, `garnison-qg`,
`garnison-visee-armee`, `visee-toucher-destination`, `apercu-mouvement` (jusqu'à « envoyer »),
`camp-releve-toucher`, `site-caserne`, `bande-toucher`, `commandes-doigt`, `reglages-doigt`,
`pincement-sur-fenetre`. Pour y parvenir, la saison de test a reçu des stocks pleins par
`dev:fillStocks` (mutation interne ajoutée pour l'occasion), un QG de niveau 2 et une caserne
achevés par `constructions:finish`, une infanterie livrée par `troops:deliver` et posée près de la
Belgique par `movements:arrive`. La « troupe ennemie relevée » est la **garnison neutre** de
l'objectif belge, pas le joueur britannique, qui ne peut pas rejoindre le continent à pied ; son
camp et l'objectif partagent le même point, et le toucher ouvre la fiche de l'objectif. Toujours
non atteint : un vrai adversaire piloté.

**04/10, après le lot mobile-3 (ordres)** — `mobile3.mjs`, trois appareils, captures
`captures/mobile3__<appareil>__…`. Mesuré : la rose ne sort plus de l'écran (0 pièce hors cadre,
0 sous une feuille, sur les trois, bord droit compris) ; une seule surface ouverte à chaque écran
(fiche, garnison, visée, construction, dépêche) ; à la garnison, le point reste au-dessus de la
feuille (iPhone 13 : point à 221 px, feuille à 368) ; sept destinations cerclées en visée, celles
hors champ nommées au bord ; l'aperçu de visée montre destination, distance, heure, « annuler » et
« envoyer — irréversible » sous le pouce. Parcours au doigt, sans réglage de souris : troupe posée
→ destination → « marche » → bouton « envoyer » en trois touchers ; et, envoyé pour de bon sur
l'iPhone 13 depuis la garnison du QG (six touchers, mouvement parti, 1 / 3). Pour la dépêche, la
saison de test a reçu **un engagement fabriqué** (`convex import --append`, la France défend à son
point posé contre le Royaume-Uni) : `/plateau?report=<id>` ouvre la feuille, retire le paramètre,
et « ouvrir la garnison » ouvre la pile posée ; au bureau, la même adresse ouvre le journal avec
cette dépêche en manchette. Non atteint : un camp relevé *seul* — le camp neutre et l'objectif
belge partagent le point, et le toucher ouvre la fiche de l'objectif (rose réduite à son refus).

## 5. Ce que l'émulation ne montre pas — à vérifier sur ton iPhone

Chromium émulé n'est pas Safari iOS (les captures et mesures sont celles de Chromium).
Vérifie toi-même :
1. **Le zoom au focus** des champs à 13–13,5 px (télégraphe, heure de repos) : Safari zoome et la
   page reste zoomée — Chromium non.
2. **L'élasticité** (rubber-banding) de la page au-delà du haut et du bas : sans `overscroll-behavior`
   ni `touch-action`, Safari peut faire rebondir la page entière.
3. **La barre d'adresse** : `100dvh` suit sa rétraction ; vérifier que le rail et les docks restent
   collés au bas et ne sautent pas.
4. **Le clavier** : la hauteur dynamique suit-elle sur iOS, et le champ du télégraphe reste-t-il visible ?
5. **Le pincement sur une fenêtre** (C2) : confirmer que Safari zoome aussi la page.
6. **L'installé** (écran d'accueil) : encoche et barre d'accueil — `env(safe-area-inset-*)` est
   absent : le rail du bas peut passer sous la barre d'accueil.
7. **WebGL** : le rendu mesuré est celui de SwiftShader (logiciel) ; la fluidité, la mémoire et la
   perte de contexte d'un vrai iPhone ne sont pas mesurées.
8. **Le geste réel de la rose** avec « gauche = Agir » : un tap net ouvre-t-il la rose sans orienter
   la caméra au toucher ?

## 6. La décision qui reste

Deux périmètres, après ce relevé : **intégration seule** (C2, C3, C4, C5 + tailles : la page cesse
de bouger et de déborder, la rose reste au clavier-souris) ou **carte jouable au doigt** (C1 en
plus : préréglage tactile ou appui long). Sans C1, aucune action de jeu sur le monde ne se fait sur
téléphone — c'est le seul résultat de gravité 1.
