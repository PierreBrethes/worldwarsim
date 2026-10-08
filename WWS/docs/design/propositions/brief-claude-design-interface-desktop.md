# Brief Claude Design — l'interface desktop, sept planches — 08/10/2026

**Statut : brief pour maquettes HTML.** Il ne produit pas de code : des planches à regarder, sur
lesquelles Pierre tranchera les quatre décisions ouvertes de
[interface-desktop-grand-jeu.md](interface-desktop-grand-jeu.md) (§6). Lire cette note d'abord :
elle porte l'audit, la cible et le pourquoi. Ce brief ne dit que **quoi dessiner, avec quelles
données, dans quelles bornes**.

Format : 1440×900, desktop. Chaque planche existe en un état **plein** (une partie au troisième
jour, beaucoup de choses en cours) et, quand c'est dit, un état **vide** (le lendemain du
lancement). Une décision ouverte se dessine en **deux variantes côte à côte**, A et B, jamais en
une seule.

## Avant de dessiner

- **Le système de design doit être à jour.** `ds-bundle/` date du 04/10 et doit être resynchronisé
  avant la passe (`.ds-sync/resync.mjs`, puis régénérer `.design-sync/ds.css` après `vite build`,
  voir `.design-sync/NOTES.md`). Composants à réutiliser tels quels : `Stamp`, `Gauge`,
  `HoverCard`, `Masthead`, `Wordmark`, `Flag`, `FlagBanner`, `FlagWatermark`, `BuildingPlate`,
  `UnitSprite`, `ResourcePlate`, `ResourceIcon`, `ObjectivePlate`, les `Glyph`.
- **Les jetons font foi** : `src/styles/tokens.css`. Aucune couleur, police ou graisse hors jetons.
- **Les captures de l'existant** sont à refaire depuis le jeu local (saison de test) ; l'audit du
  08/10 les décrit au §2 de la proposition.

## Les règles qui ne bougent pas

Elles sont dans `contrats-de-vue/00-regles.md` et `10-direction-artistique.md`. Les plus coûteuses
à oublier :

1. **Une donnée qui n'est pas servie ne se dessine pas.** Ce qui manque se marque
   « ⚠ pas-servi » à sa place, on ne l'invente pas — ni un chiffre, ni une date, ni un nom.
2. **Le brouillard est structurel.** Un arc adverse n'a ni type, ni composition, ni nation ; un
   relevé ne nomme jamais la nation ; une région jamais vue est *vierge*, pas neutre. Si une
   planche « a besoin » d'une donnée adverse pour être belle, la planche est fausse.
3. **Rien n'est grisé.** Une action existe ou n'est pas là ; un observateur (défait) voit les
   surfaces **sans** leurs boutons. Seule exception : « améliorer » sur un bâtiment, grisé avec
   sa raison.
4. **La carte agit, les surfaces lisent.** Ce qui se fait sur la carte ne se fait que là.
5. **Les slots de mouvement sont visibles sur chaque écran.**
6. **Tout texte vient de `src/i18n/fr.ts`.** Réutiliser les libellés existants ; un libellé neuf
   se signale comme tel sur la planche.
7. **Vocabulaire** : mouvement, passe de résolution, avant-poste désactivé/détruit, relevé,
   édition, journal d'événements, slot de mouvement, caserne, filière. **Bannis** : tick, temps
   réel, micro, base, rush, convoi, leurre, atelier.
8. **DA** : papier `--paper` sur bureau `--desk`, encre `--ink` ; un seul rouge, `--critical`,
   pour ce qui exige l'attention ; huit encres de nation désaturées ; Bodoni Moda (titres),
   Source Serif 4 (dépêches), Archivo Narrow (interface), IBM Plex Mono (**tout** chiffre et
   toute heure, `tabular-nums`). Pas d'ombre portée hors des 12 exceptions de la charte, pas de
   dégradé hors socle, pas d'arrondi, filets d'encre de 1 px.
9. **Une icône remplace le mot, jamais le nombre.** Sous 12 px, pas d'icône.

## Les chaînes à faire tenir

Toujours dessiner avec la plus longue, jamais avec « Paris » :

| Quoi | Plus longue |
|---|---|
| Région (Europe) | « Royal Borough of Windsor and Maidenhead » (39) |
| Région (monde) | « South Georgia and the South Sandwich Islands » (44) |
| Pays | « Géorgie du Sud-et-les Îles Sandwich du Sud » (42) |
| Nation | « Royaume-Uni » |
| Bâtiment | « Quartier général », « Puits de pétrole », « Station d'écoute » |
| Ligne « à faire » | « avant-poste plein — montez-le · Southern Nations, Nationalities and Peoples » (75) |
| Pseudo | « Tacoctus-le-Grand » (17) |
| Refus | « plus un emplacement libre sur vos sites — élevez le quartier général ou un avant-poste » |
| Théâtre | « Europe + Méditerranée + Moyen-Orient » |

## Les planches

### P1 · Le plateau à zones — plein et vide

La planche maîtresse. Zones (proposition §4.1) : bandeau (cartouche de nation, chantier, slots,
alertes, journal), bande de ressources avec **taux sous chaque stock** (`ratePerHour` est servi,
négatif en `--critical`), rail, carte, **échéancier** bas, **fiche de survol** bas-droite.

- **Échéancier — ce qui est servi** (dessiner seulement ceci) : arrivée de chacun de mes
  mouvements (`arrivesAt`), attente à la frontière pendant une plage de repos (`holdUntil`) ;
  pour un arc adverse relevé, l'heure estimée et la fin de la fenêtre de relevé, **et le seul
  booléen « cap sur moi »** — jamais une destination ; fin du chantier **de tête** seulement (la
  file n'est pas datée, par décision) ; avant-poste en chantier (`standsAt`) et fin de
  désactivation (des miens seulement) ; fin de présence d'une expédition de pillage ; prochaine
  édition de la presse (`press.next`) ; ma plage de repos, **quotidienne** (l'occurrence se
  calcule à l'écran). **Pas servis** : fin d'un lot de recrutement dans la vue du plateau (une
  query à part le sert, `troops.workshop`), expiration d'une caisse (secret par décision), fin
  de saison si la saison est sans horloge.
- **Alertes** — ⚖ décision 3 : **A** pastilles par famille dans le bandeau (survol = liste, clic
  = aller à la suivante) ; **B** la carte « à faire maintenant » actuelle, bas-gauche. Familles
  et libellés : `fr.ts` §nextActions.
- **Registre** — ⚖ décision 2 : **A** un registre de lecture repliable à droite (mes forces
  posées, en route, en garnison ; mes avant-postes ; mes chantiers ; chaque ligne recentre,
  aucune n'ordonne) ; **B** pas de registre.
- **Modes de carte** dans le rail, à la place des huit interrupteurs : Politique, Gisements,
  Logistique, Renseignement, Menaces, chacun avec sa touche (`1`–`5`). Dessiner la carte dans
  deux modes au moins (Politique et Renseignement — couverture de détection et angles morts).
- **Une nation sombre au rapproché** : la France contre l'Atlantique. Aujourd'hui l'encre
  `#3f5a7d` et le lavis côtier (`--sea-ink` à .35) se confondent et la côte disparaît. Proposer
  le trait de côte qui la rend — sans toucher aux huit encres de nation.
- **État vide** : le lendemain du lancement, QG posé, rien en route — l'échéancier ne montre que
  l'édition et la plage de repos ; montrer comment il se tait sans laisser un cadre vide.

### P2 · La pose guidée du QG

La première minute du jeu. Clé « quartier général » armée : la caméra est sur la France, les
**101 régions éligibles** hachurées, le curseur porte la truelle (`public/cursors/
curseur-construire.png`) et le nom de la région survolée, la carte « à faire » dit « 101 régions
éligibles » et offre la recherche de région. Pas de liste de cent noms. Une astuce de premier
geste (forme de `GestureHint`) à la place du mur de l'aide-mémoire.

Inclure une vignette des **curseurs** : où chacun des cinq s'applique (`curseur-defaut`,
`-interactif`, `-cible` — un fusil —, `-construire`, `-renseignement`) et son point chaud. Le
moteur n'en branche qu'un aujourd'hui ; la décision est de design, pas de code.

### P3 · Un bureau en volet — le Journal

⚖ décision 4, variante **A**. Volet pleine hauteur accolé au rail, ~480 px, la carte visible et
jouable à droite. En-tête unique (titre, touche `J`, fermer), la même pour tous les volets. La
une du journal telle qu'elle existe (contrat 01), resserrée à la largeur. Montrer la carte à
droite avec une cible recentrée **dans la zone visible**, pas sous le volet.

### P4 · Un bureau plein écran — l'Économie

⚖ décision 4, variante **A**. On change d'écran : la carte s'efface derrière le papier, Échap
ramène. La filière en huit colonnes (contrat 02) tient sans miettes de carte ; la colonne QG à
droite. Dessiner la variante **B** : la fenêtre flottante actuelle, pour comparer.

### P5 · Le salon sur carte

Trois colonnes au-dessus de la flottaison à 1440×900 : la carte du théâtre où l'on clique un
pays pour réserver sa nation ; la fiche de la nation choisie ; joueurs, plage de repos,
prêt / lancer, et le télégraphe à demeure.

- **Servi** : code, état, fermeture des inscriptions, horloge, théâtre (une clé :
  `europe`, `europe-med`, `world`), joueurs (pseudo, fondateur, nation, prêt, en guerre), ma
  plage de repos.
- **Pouvoir national** : un texte fixe côté client (`fr.nationPowers`). ⚠ Ses phrases parlent
  d'« acier », de « ravitaillement », de « cooldown » — à faire relire par Pierre avant de les
  mettre en vedette. **Manque national** : ⚠ pas-servi au salon (calculé en jeu depuis les
  régions du joueur).
- **La carte du théâtre** : aucune géométrie n'est servie par le salon ; le client a déjà
  `monde.json`. La dessiner comme si elle l'était.

### P6 · L'accueil — « le bureau des engagements »

Deux colonnes à partir de 1200 px : les parties à gauche, fonder et rejoindre à droite.

- **Servi par partie** : code, état, horloge, lancement, théâtre, nombre de joueurs, pseudo,
  fondateur, nation, en guerre, défait, nation du vainqueur.
- **Ce qui vous attend** (dépêches non lues, slot libre, chantier terminé) : ⚠ **pas-servi** —
  c'est la valeur de la planche, dessiner l'emplacement et le marquer. Le serveur devra l'ajouter.
- Le tampon d'état-major ne recouvre plus rien (corrigé le 08/10).

### P7 · La fin de saison

L'édition finale en une, pleine page : le vainqueur en manchette, le classement final, et la
carte au dernier jour.

- **Servi** : `season.reduction` (cible, date de conclusion, nation du vainqueur, classement :
  nation, pseudo, à moi, réduit, nombre de réduits) ; l'édition finale de la presse
  (`final: true` — rang, part de territoire, général, faits d'armes, défait ; mes registres en
  plus pour moi).
- **La carte au dernier jour** est **ma** carte relevée : rien ne se dévoile à la fin. ⚠ Une
  carte vraie de fin de partie n'est pas servie — la dessiner en variante B si elle vaut la peine
  de demander une décision.

## Le mouvement — ⚖ décision 1

Hors planches : **une planche de story-board** de quatre gestes, en trois images chacun (avant,
pendant, après), avec leur durée : le tampon « expédié » qui frappe à l'envoi d'un mouvement
(~120 ms), l'encre qui gagne une région qui change de couleur, le volet qui glisse du rail, le vol
de caméra vers une alerte. C'est sur cette planche que Pierre décide de lever ou non l'interdit
des transitions. Rien d'autre ne bouge.

## Ce qui n'est pas demandé

Pas de téléphone (la refonte mobile est faite). Pas de rejeu de bataille : le compte rendu ne sert
aujourd'hui que des totaux par camp (troupes, perdues, déroutées, détruites) — ni les salves, ni
les pertes par rôle, ni le bonus de défense ; la planche attendra que le serveur les serve.
