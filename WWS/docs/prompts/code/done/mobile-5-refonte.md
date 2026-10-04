---
type: prompt
statut: livré
maj: 2026-10-04
code: [src/shell/NarrowBand.tsx, src/shell/FootBar.tsx, src/shell/LayersSheet.tsx, src/shell/BottomSheet.tsx, src/domain/underway.ts, src/routes/-plateau/UnderwayColumn.tsx, src/routes/-plateau/MovementPreview.tsx, src/routes/-plateau/AimingSheet.tsx, src/routes/-plateau/TroopBadge.tsx, src/routes/-plateau/SentNotice.tsx, src/routes/-plateau/GarrisonStack.tsx, src/routes/-plateau/EconomyWindow.tsx, src/routes/-plateau/JournalWindow.tsx, src/shell/TelegraphThread.tsx, src/routes/-plateau/PressWindow.tsx, src/domain/label-groups.ts, src/map/MapLabels.tsx, src/map/CompassRose.tsx, src/i18n/fr.ts]
decisions: []
voir: [mobile-3-ordres.md, mobile-2-cadre.md, ../../design/plateau-sur-telephone-2.md]
---
# mobile-5-refonte — les douze planches de « Refonte mobile »

**En bref.** La maquette Claude Design `Refonte mobile.dc.html` (projet
`8f6003da-e967-4a69-9754-95d224d81a25`) mise en code sous 768 px : plateau et dossier de la nation
(1a, 1s), fiche de troupe et visée (1b), feuille d'ordre tenue pour envoyer (1c), cartouche
« transmis » (1d), cartes de garnison (1e), Chantiers (1f, 1g), journal (1h), télégraphe (1i),
presse (1j), piles de mâts (1r). **Au-dessus de 768 px, rien ne change**, sauf trois choses qui
servent les deux : les piles de mâts (moteur de carte partagé), l'estimation de fin de lot
(`lotFinishesAt`, que l'Économie du bureau lit aussi) et le plan du coin bas-droit de la carte,
passé au-dessus des étiquettes (`--z-indicator`), qui le recouvraient.

## Ce qui a été fait

- **Cadre (1a, 1s).** `NarrowBand.tsx` sort de `ResourceBand.tsx`, sans poignée de pli ;
  « France ▾ » ouvre le dossier (fiche, abaque, calques, réglages, aide-mémoire). Barre de pied à
  cinq entrées, « à faire » en tuile centrale levée, « plus » retiré. Boutons recentrer et calques
  sur la carte. Colonne « En cours » (`domain/underway.ts`), repli gardé en `localStorage`.
- **Ordres (1b, 1c, 1d).** Pendant la visée, toucher une cible ouvre la feuille d'ordre au lieu de
  la rose ; les types d'ordre y sont des onglets, l'envoi se **tient** 700 ms. Les cibles les plus
  proches sont proposées sous le pouce (`AimingSheet.tsx`). Le cartouche « transmis » remplace un
  temps les boutons de carte.
- **Garnison (1e).** Cartes, raccourcis par rôle, pied collant.
- **Chantiers (1f, 1g).** En-tête collant et quatre onglets suivis au défilement ; élévation d'un
  toucher avec sa facture ; « annuler » sur le cartouche de mise en file.
- **Journal, télégraphe, presse (1h, 1i, 1j).** Filtres et sections ; fil groupé par auteur avec
  séparateurs de jour (`threadLayout`) ; rang en vedette, onglets de tri, ligne propre collante,
  compte à rebours de l'édition suivante.
- **Piles de mâts (1r).** « N sites › », et une liste quand les bâtiments partagent la région.

## Écarts volontaires à la maquette

- **La fiche de troupe ne porte pas les raccourcis de cible** de la planche 1b (décision de Pierre,
  04/10) : « la popin lit, la carte agit » tient, et tout ce qu'ils offraient se touche sur la
  carte — cibles cerclées, celles hors champ annoncées au bord. La fiche dit seulement où toucher.
  Les raccourcis restent dans la feuille de visée d'une pile armée depuis un mât ou un avant-poste
  (`AimingSheet`), qui n'a pas de fiche ; ils y disent les **types d'ordre, pas les durées** : une
  durée demande un `movements.preview` serveur par cible.
- La presse du téléphone s'ouvre **triée par territoire**, comme au bureau : le rang servi est
  celui du territoire, et la vedette lit sa mesure en premier (la maquette ouvrait sur le score
  général, à côté d'un rang qui n'était pas le sien).
- Les cartes de garnison montrent l'**entretien** à la place d'un nom d'équipement, qui n'existe pas
  dans le jeu.
- Journal : seules les dépêches de **combat** mènent à la carte (les autres n'ont pas de lieu) ;
  pas de pagination (« 190 plus anciennes… ») — le journal est borné et rendu entier.
- Le QG n'est **pas** dans la liste « Commandement » des sites : il a sa carte, et deux boutons
  d'élévation pour un même bâtiment se seraient contredits.
- Les lignes de ressources brutes ne portent pas de tampon d'état : seules les conversions ont un
  verdict serveur.
- Le titre de « transmis » est `<ordre> — <destination>`, pour éviter les accords de genre faux.
- L'« annuler » des Chantiers retrouve l'entrée dans `constructionQueue`, sans changement serveur ;
  si elle est devenue tête de file aussitôt, il n'est pas offert.

## Relevé sur écran (390×844 et 375×667, Chromium tactile)

Script : `Claude outputs/releve-mobile/mobile5.mjs` (fenêtres) et `probe6.mjs` (troupe → cible →
feuille d'ordre). Retouches qui en sont sorties :

- bandeau : « 0 / 3 » se cassait en colonne ; le libellé « mouvements » passe au-dessus des cases ;
- la feuille de troupe armée monte jusqu'à mi-hauteur avec ses cibles et couvrait la troupe : la
  rose au doigt se cale au-dessus de la **demi**-feuille et compte son réticule (`CompassRose`) ;
- titres de feuille sur deux lignes au plus plutôt que tronqués ; boutons « fermer » qui ne
  rétrécissent plus ; titre du journal (accent de « OPÉRATIONS » sur la ligne du dessus, « non
  lues » qui débordait) ; canal du télégraphe sous le titre ; dates de la presse ; nom de site des
  Chantiers (le niveau descend sur la ligne de la région) ; types d'ordre des raccourcis sur deux
  lignes ;
- accords : « 1 fait », « 1 emplacement sur 4 ».

Relecture du diff (04/10), quatre bloquants corrigés : des piles de troupes confondues ouvraient
une liste vide (`coincident` réservé aux mâts) ; le rang de la presse contredisait son tri ; la
tenue d'envoi gardait l'ordre du premier toucher et allait au bout sous un bouton désactivé (elle
lit l'envoi au bout, s'arrête à la désactivation, repart à zéro au changement d'ordre) ; les cartes
de garnison taisaient la coque d'un passager (« à bord · cargo »). Puis quatre retouches : les cibles
les plus proches se rangent après que le moteur a reçu les ancres (au rendu, elles tombaient à
l'infini) ; « En cours » et « recentrer » visent le point de la région quand le calque bâtiments
est éteint ; l'exposant de rang passe par `fr.press.ordinalSuffix` ; les séparateurs de jour du
télégraphe gardent leur marge.

## Ce qui reste

- **Aucun vrai téléphone** n'a été regardé : le relevé tourne dans Chromium en émulation tactile.
  Safari iOS (clavier, `dvh`, tenue du bouton d'envoi) reste à voir.
- Le mappage des feuilles de **garnison** et le **dossier** sur iPhone SE couché ne sont pas relevés.
- L'en-tête du panneau de garnison garde le titre générique de `Panel` (la maquette voulait
  « Garnison · Caserne — Nord » et un compte).
- La modale de site (non touchée par ce lot) est serrée sous 400 px : « fermer » passe sous le titre.
- Le titre de la feuille « à faire maintenant » s'affiche « A faire » sans accent dans la police
  de titre (`first-letter:uppercase`) — à vérifier.
- L'aide-mémoire du bureau parle encore du widget « Troupes, en bas à gauche », retiré le 30/08.
