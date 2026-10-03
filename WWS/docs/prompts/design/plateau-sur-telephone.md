---
type: prompt
statut: validé
maj: 2026-10-03
code: []
decisions: [mobile-1c-2026-10-03, mobile-geste-2026-10-03]
voir: [../../rapports/2026-10-03-releve-mobile.md, ../code/ready/mobile-1-socle-tactile.md, ../../design/11-brief-ui.md, page-d-accueil.md]
---
# Prompt Claude design — le plateau sur téléphone

**En bref.** La refonte mobile complète (mobile-1c du 03/10/2026) commence par les maquettes. Le
socle tactile (`mobile-1-socle-tactile`) est codé en parallèle et ne dessine rien : la grammaire
du doigt est fixée, tout le reste se décide ici. Une deuxième passe ajoutera les écrans que le
relevé n'a pas atteints (panneaux construction et sol, aperçu d'un mouvement, site), capturés par
le socle.

À coller dans Claude design. Téléverse avec le prompt tout le dossier
`Claude outputs/marque/plateau-mobile-entrees/` : la charte (texte, deux planches, image de la
boucle) et onze captures du jeu actuel sur iPhone 13.

---

## Le prompt

Redessine **le plateau de La Manchette pour un téléphone** (390 × 844, mode portrait), dans la
charte jointe (`la-manchette-charte.md` et ses planches) : journal de 1940 posé sur une table de
cartes, papier tramé, encre, filets, coins carrés, aucune ombre sauf une feuille posée.

**Le jeu en deux phrases.** Une saison de sept jours entre 2 et 8 amis, chacun une nation de 1940
sur une carte du monde réel en 3D. On y passe quelques minutes plusieurs fois par jour : lire ce
qui s'est passé (dépêches, presse), donner des ordres (fonder un avant-poste, bâtir, recruter,
envoyer des forces), puis la carte exécute les mouvements et les passes de résolution pendant
qu'on vit sa vie.

**Les captures jointes montrent l'interface actuelle**, pensée pour un écran large et tassée sur
un téléphone : bandeau des ressources en haut, rail de pictogrammes en bas (six entrées, et huit
bascules de calques cachées hors de l'écran), fenêtres en feuilles plein écran, panneau de
garnison, carte « à faire maintenant », rose des vents. Le relevé a mesuré : la carte réduite à
40 % de l'écran quand deux panneaux s'empilent, des cibles de 17 à 34 px, le bouton Réglages coupé
par le bord, des pastilles qui passent par-dessus les cartes.

**La grammaire du doigt est fixée, ne la change pas :** un toucher net agit (ouvre la rose des
vents de ce qu'on touche, avec sa fiche de lecture) ; un doigt qui glisse déplace la carte ;
deux doigts pincent pour zoomer et tournent pour orienter.

**Ce qui doit tenir sur le téléphone :**
- **Le bandeau des huit ressources** (ravitaillement, textile, charbon, pétrole, minerai, alliage,
  munitions, pansements) : stock et tendance lisibles d'un coup d'œil, détail au toucher.
- **Les entrées** : journal (dépêches), télégraphe (messages entre joueurs), presse (classement),
  nation, économie, abaque de tir (portées et capacités des troupes), réglages. Plus les **huit
  calques** de la carte : bâtiments, gisements, avant-postes, chantiers, forces, mouvements,
  « cap sur moi », renseignement.
- **La rose des vents** au doigt : autour de ce qu'on a touché, ses branches (fonder, marcher,
  attaquer, piller, bâtir, élever, entrer en garnison…) en médaillons d'au moins 44 px, libellés
  lisibles, jamais coupée par le bord de l'écran ; la fiche de lecture de l'objet touché à côté.
- **Le panneau de garnison** (les troupes d'un point, à cocher pour préparer un mouvement), puis
  **la visée** : choisir la destination d'un toucher sur la carte.
- **« À faire maintenant »** : trois ou quatre suggestions d'action, repliable.
- **Les fenêtres** (presse, journal, économie, télégraphe clavier ouvert).
- **L'arrivée depuis une notification** « Vous êtes attaqué » : on ouvre le plateau sur
  l'attaque, et on doit pouvoir réagir en deux ou trois touchers.

**Règles de composition :**
- Au repos, la carte occupe au moins 70 % de l'écran.
- Une seule surface ouverte à la fois ; une feuille basse a trois hauteurs (aperçu, moitié, plein
  écran) et se ferme d'un geste vers le bas ou d'un bouton.
- Tout ce qu'on touche souvent est dans la moitié basse, à portée du pouce.
- Cibles d'au moins 44 px ; respect de l'encoche et de la barre d'accueil de l'iPhone.
- Les encres de nation, les mouvements et les alertes rouges restent ce qui ressort : l'interface
  reste désaturée.
- Vocabulaire : mouvement, passe de résolution, avant-poste désactivé ou détruit, relevé,
  dépêche, télégraphe. Jamais « temps réel », « tick », « micro », « base », « rush », « convoi »,
  « unité sélectionnée », « tour de combat ».

**À livrer :** deux pistes d'organisation, nommées, chacune avec ces planches en 390 × 844 :
1. le plateau au repos ;
2. une troupe touchée : rose des vents + fiche ;
3. le panneau de garnison, puis la visée d'un mouvement ;
4. les entrées et les calques ouverts ;
5. une fenêtre (presse) et le télégraphe clavier ouvert ;
6. l'arrivée depuis la notification « Vous êtes attaqué ».

Pistes possibles, à toi d'en proposer de meilleures : **A**, une barre du bas à quatre ou cinq
entrées et une entrée « plus » ; **B**, un seul bouton « journal » qui ouvre un sommaire de
journal, la carte libre de tout le reste. Termine par une ligne par piste : ce qu'elle fait bien,
ce qu'elle fait mal.
