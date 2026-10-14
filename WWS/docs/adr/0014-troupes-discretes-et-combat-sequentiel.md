# ADR 0014 — Troupes discrètes et combat à l'initiative

**Statut :** acceptée — précisée par l'[ADR 0018](0018-anatomie-de-la-passe-de-resolution.md)
— révisée le 16/09/2026 (résolution simultanée, décision 1b) — **révisée le 14/10/2026 :
retour de l'initiative, bonus de bâtiment (B16, B17)**

> **Révision du 14/10/2026 — l'initiative revient (grilling des deux modes, B16 et B17).**
> L'attaquant frappe avec ses PV actuels ; les pertes s'appliquent ; le défenseur **riposte avec
> ce qui lui reste**, s'il lui reste quelque chose et si la table le laisse toucher. Un défenseur
> détruit par la frappe ne riposte pas ; la déroute se lit une fois, après la riposte. Le bonus
> de défense devient un **bonus de bâtiment** (`GARRISON_BONUS`, ×1,15) : seule une garnison de
> bâtiment, d'avant-poste ou d'objectif riposte à ce facteur. La passe simultanée survit comme
> **choc** (`mode: 'shock'`), réservé à deux unités qui s'attaquent l'une l'autre — la Blitz,
> lot 5 ; le serveur ne l'ordonne nulle part encore. Cas de référence : cinquante fantassins
> contre cinquante en terrain libre, le défenseur perd 25 et l'attaquant 13 ; en garnison, 25
> et 14. Seul coup gratuit mesuré : le char lourd sur le char léger (3 / 12 restants, riposte
> nulle). Source : `../design/propositions/gameplay-deux-modes-2026-10-14.md`.

> **Révision du 16/09/2026 — résolution simultanée (décision 1b).** L'initiative à l'attaquant
> est abandonnée : les deux camps tirent sur l'état d'avant la passe et les pertes s'appliquent
> ensemble. Tout le reste de l'ADR tient — troupes discrètes, transports-troupes, une seule
> passe, table de dégâts par couple, déroute sous le quart, soin et spécialisations. Source :
> `../design/propositions/combat-simultane-terrain-retranchement.md` §1.

## Contexte

L'ADR 0011 avait gravé des unités **sans position ni identité** — un effectif national,
des piles agrégées dans les mouvements. C'était assumé comme provisoire, et l'interface
construite depuis l'a contredit pièce par pièce : sprites de troupes sur la carte, jalon
qui montre le véhicule du segment, vision d'espion « sur les unités rattachées à un
bâtiment », rose des vents sur « une force ». Tout présupposait des troupes visibles,
identifiables, quelque part. Restait ouverte la question « les unités doivent-elles être
quelque part ? » (QUESTIONS.md), et une résolution de combat simultanée à quatre passes,
correcte en simulation mais difficile à lire et à mettre en scène dans le rejeu.

## Décision

Le modèle Advance Wars, adapté à l'asynchrone.

**Des troupes discrètes.** Une nation aligne un nombre borné de troupes uniques
(ordre de grandeur 10–30, à calibrer). Une troupe ne fusionne jamais avec une autre.
Ses points de vie sont son **effectif nominal, lisible** : 50 soldats, 10 chars légers,
5 chars lourds. Les dégâts se lisent en hommes et en machines perdus.

**Les transports sont des troupes.** Un transport a une capacité d'emport typée
(exemple : porte-avions — 5 infanteries / 3 véhicules / 2 avions). C'est la seule forme
de regroupement. En mer, on voit le navire, pas la cargaison — le leurre y gagne :
un transport vide est indiscernable d'un plein.

**Résolution simultanée, en une passe** (révisé le 16/09/2026). Les deux camps tirent
**sur l'état d'avant la passe** — chacun avec l'effectif qu'il y amène, chacun sur la
meilleure cible que la table lui donne, et seulement s'il **peut** l'atteindre (un canon
antichar ne tire pas sur un bombardier). Les pertes s'appliquent ensemble ; la déroute et
la destruction ne se lisent qu'une fois la passe finie, donc **un défenseur que la salve
adverse détruit a tiré quand même**. Personne ne frappe le premier. Le
pierre-feuille-ciseaux demeure : des tables de dégâts par couple de rôles remplacent
la matrice 9×9. L'issue d'un engagement est **prédictible avant de le lancer** —
c'est la qualité stratégique recherchée.

**Les blessures se soignent.** Une troupe entamée se reconstitue en consommant des
**bandages**, en se repliant vers une **pharmacie** — amélioration d'avant-poste — ou
chez soi. Le soin crée des mouvements de retour : la carte vit dans les deux sens.

**Les spécialisations sont exclusives.** Par la recherche (au QG), une troupe peut se
spécialiser — pour l'infanterie mk1 : **médecin OU parachutiste**, jamais les deux.
Les autres rôles recevront les leurs.

## Justification

**La lisibilité prédictive.** « 50 soldats contre 50 soldats : il en perd 25, j'en perds
29 » se comprend sans manuel. Le rejeu de bataille (fiche 4.7) devient une évidence à
mettre en scène — deux salves, pas une frappe puis une réponse.

**Les défenseurs dépensent moins que les attaquants** (révision du 16/09/2026). À forces
égales l'attaquant perd davantage : le défenseur porte `DEFENDER_BONUS` et l'attaquant ne
porte rien. Le cas de référence le chiffre — 50 fantassins MK1 contre 50, en plaine,
munitions pleines : **le défenseur perd 25, l'attaquant 29** (`src/domain/combat.test.ts`).
L'attaque ne vaut donc qu'en **supériorité ou en surprise**, et c'est le jeu plus prudent
qu'on veut. Mesure attendue : rapport pertes attaquant / défenseur par engagement sur une
saison (`technique/a-mesurer.md`).

**L'interface existait déjà.** Le design rejoint ce que l'UI-sonde avait construit —
c'est le sens même de la méthode du projet.

**La question des piles se ferme d'elle-même.** Des troupes uniques sont localisées.

**Les bandages gagnent leur consommation**, et l'économie v2 son débouché militaire.

## Conséquences

**L'ADR 0011 est révisée.** Les tables `unites` (une ligne par couple rôle/palier) et
`recrutements` sont à refondre : une ligne par **troupe**, avec identité, effectif
courant, position ou rattachement. La datation paresseuse de la file reste valable.

**L'ADR 0008 est précisée, pas contredite.** Le combat reste automatique, résolu sans
le joueur, et rejouable. Seule la formule interne change : une passe, deux salves, au
lieu de quatre passes et d'une matrice 9×9.

> Le nom de fichier dit encore « combat séquentiel » : il est l'adresse de l'ADR dans une
> vingtaine de renvois, et le renommer vaudrait moins que le lien qu'il casserait.

**Les trois contre-pouvoirs exigés contre l'initiative n'ont plus d'initiative à
contrer** (révision du 16/09/2026) : l'interception en route a disparu avec l'ADR 0024 §3,
le bonus du défenseur reste et devient **le seul avantage de la défense**, le terrain des
régions attend ses données (Registre 29). Le festival d'agression que cette ADR craignait
est écarté par la simultanéité elle-même : attaquer à forces égales coûte plus cher que
tenir.

**Le budget de décisions se densifie, et c'est assumé.** Ordonner 10–30 troupes fait
monter le rythme mesuré (1,2 décision/heure). Les slots de mouvement (ADR 0006) restent
le régulateur : on ne déplace jamais tout à la fois.

**À refondre :** le simulateur (résolution et politiques), les fiches 08 et 09, le
schéma de jeu. Les taux (tables de dégâts, effectifs nominaux, coûts de soin) sont à
chiffrer puis à mesurer.

## Ce qu'on abandonne

- L'effectif national sans position (ADR 0011 première forme).
- Les piles fusionnables et leur composition libre.
- La résolution à quatre passes et la matrice 9×9 telle quelle — c'est le *nombre* de passes
  qui était abandonné, et la révision du 16/09 ne le rouvre pas : une passe, deux salves.
- **L'initiative à l'attaquant** (révision du 16/09/2026) et la phase de riposte qui allait
  avec ; `Strike.phase` garde `'riposte'` en legacy pour les engagements déjà enregistrés.
- La question ouverte « pile nationale ou piles localisées » — tranchée de fait.
