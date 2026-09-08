# Point projet — 8 septembre 2026

Lecture du code, des ADR, de la file et des briefs. Les recommandations sont des propositions,
pas de nouvelles décisions de jeu. La file reste [RESTE-A-CODER.md](../RESTE-A-CODER.md).

## Diagnostic

WorldWarSim a le socle d'une alpha jouable entre amis : économie, projection, combat,
renseignement, conséquences territoriales et presse sont branchés. Le prochain progrès à
rechercher est une saison dont les joueurs comprennent les enjeux, les pertes et la conclusion.

**Le territoire sert déjà au classement et à la production, mais la victoire reste militaire.**
`convex/victory.ts` applique toujours la réduction de capacité. La victoire territoriale est
décidée ; sa livraison reste prévue en dernier, après la partie de contrôle à deux. Ce bilan
ne change pas cette séquence.

## État vérifié dans le code

| Ensemble | Ce qui existe |
| --- | --- |
| Saison | Accueil, salon, lancement, entrée en guerre, capitulation, observateur et clôture, y compris si le fondateur s'absente. |
| Économie | Extraction, chaînes, construction, recrutement par site, entretien, emplacements par site, production coupée et restaurée selon la couleur. |
| Projection | Garnison, visée et ordres depuis la carte ; ports côtiers, débarquement, modes terre/naval/aérien/combiné choisis par composition. |
| Combat | Résolution déterministe, interception, déroute, retour, compte rendu ; raid qui désactive un avant-poste. |
| Information | Relevés de mouvements et de régions, mémoire datée, stations et avant-postes d'écoute, relais logistiques. |
| Surfaces | Journal, abaque-catalogue, Nation, Économie, Presse toutes les trois heures, télégraphe, aide-mémoire et « à faire maintenant ». |

Preuves : `convex/movement/orders.ts` appelle `routeModeOf` ;
`src/domain/movement-orders.ts` renvoie les quatre modes. `convex/movements.test.ts` couvre
notamment départ en mer, réembarquement et traversée. Cela ne certifie pas chaque combinaison
navale/aérienne en partie. `convex/detection.test.ts` couvre détecteurs et relais ;
`convex/production.test.ts` et `convex/press.test.ts` couvrent les dernières grandes briques.

## Vérifications et limites

`npm run verifier` a réussi sur ce checkout : types, lint, format, **56 fichiers de tests /
922 tests**, build et miroir du simulateur. Aucun code de jeu modifié pendant ce bilan.

- Le miroir compare **119 valeurs**, sans dérive. Il annonce cinq groupes non vérifiés : ancien
  format skirmish, ancien plafond global, chaînes, effectifs nominaux et affectation du stockage.
- Le simulateur d'ouverture ne représente pas une guerre entre joueurs. Son README annonce
  notamment l'absence d'adversaire et d'entretien de l'armée. L'ancien simulateur de saison
  complète est archivé : ses pourcentages de victoire ne démontrent rien sur le jeu actuel.
- `a-mesurer.md` contient désormais **18 valeurs**, hors tables économiques. Tests verts ne signifie
  pas équilibre ou plaisir démontré.
- Le build signale un paquet principal de **1 050 Ko minifié / 300 Ko gzip**. À mesurer sur
  appareil cible avant d'en faire un chantier ; les fenêtres ont déjà des paquets séparés.
- Ni parcours navigateur ni backend de production inspectés ici. La restauration SQLite reste
  indiquée « jamais faite » dans la file ; ce n'est pas une vérification du VPS.
- Aucun état de référence exporté présent dans `WWS/simulation/` au moment du passage.

## Séquence proposée

| Quand | Travail | Résultat attendu |
| --- | --- | --- |
| Maintenant | Restauration d'une sauvegarde dans un environnement isolé, puis contrôle à deux des surfaces récentes. | Savoir reprendre une partie et confirmer les interactions que les tests ne voient pas. |
| Pendant ce contrôle | Exporter une vue réelle et noter compréhension, hésitations et occasions de conflit. | Une matière de design issue du jeu actuel. |
| Livré le 08/09 | Portées passives par rôle, comportement dérivé de l'ordre, réévaluation événementielle ; postures et salve abandonnées. | Contact mobile déterministe, sans interception par les forces posées. |
| Ensuite | Pillage lot 1 → objectifs neutres lot 1. | Une raison de sortir, de se rencontrer et de défendre un retour chargé. |
| En dernier selon la file | Victoire par seuil territorial tenu, valeurs confrontées au contrôle à deux. | Faire converger score, actions et fin de saison. |
| Au wipe après le contrôle | Comptes. | Retrouver ses sièges avec une identité persistante. |

Un chantier de code à la fois. Le pillage dépend des portées,
du stockage unique et de la production reliée déjà livrée ; les objectifs dépendent du pillage.
Les comptes constituent un chantier distinct, avec leur contrainte de wipe.

## Briefs à préciser avant exécution

1. **Victoire.** Le brief dit que deux parts ≥ 0,5 sont impossibles ; **50/50 est possible**.
   Il prévoit déjà `null` si plusieurs joueurs atteignent le seuil : expliciter et tester ce cas.
   Revoir les événements : lancement, entrée tardive d'une nation et élévation d'avant-poste
   peuvent modifier les parts. La presse reste figée entre éditions : préciser la relation
   entre son dernier chiffre publié et le compte à rebours public actualisé par les événements.
2. **Objectifs neutres.** Le placement exige une région neutre à moins de 1 500 km de deux QG.
   Certaines compositions géographiques n'en offrent aucune. Définir le repli et tester les
   nations éloignées avant de promettre deux objectifs à toute partie à deux. Tester aussi la
   reprise d'un dépôt partiellement vidé après disparition de sa garnison.
3. **Portées.** Livrées en rayon individuel, maximum de la pile sans addition. Vérifier en partie
   que le joueur comprend qu'une garnison voit à distance mais ne défend que son point.

## Les ajouts que je privilégierais

| Idée | Apport au joueur | Place proposée |
| --- | --- | --- |
| Rejeu court depuis le compte rendu | Comprendre les pertes et donner un moment marquant à une décision antérieure. | Après stabilisation des portées ; lire les frappes enregistrées, sans recalculer. |
| Crayon d'état-major personnel | Préparer une offensive, noter une hypothèse et s'approprier la carte. | Petit chantier de plaisir entre deux systèmes ; proposition déjà validée le 26/08. |
| Compas de mesure | Comparer des destinations avant l'engagement irréversible. | Vérifier d'abord ce que l'aperçu couvre ; une distance droite ne doit pas être annoncée comme une durée de route. |
| Objectifs neutres rares et disputés | Faire converger deux joueurs vers une récompense commune. | Déjà en file, après pillage ; résoudre le placement géographique. |
| Lecture mobile du journal, puis notifications | Retrouver la partie pendant une courte visite hors ordinateur. | Après retours d'usage ; actualiser la proposition encore attachée aux anciens jetons avec l'ADR des comptes. |

Ces pistes renforcent des choix existants avant d'ajouter nations, armes ou couches de recherche.
Le rejeu doit suivre le modèle actuel d'une passe : l'ancienne fiche UI en promet encore trois
ou quatre. Les idées de carte et de notifications ont déjà leurs propositions dans le corpus.

## Organisation documentaire

Plusieurs documents décrivent des présents différents :

- `CLAUDE.md` et `AGENTS.md` annoncent encore l'absence du naval/aérien et de l'écoute, ainsi que
  des entrées grisées désormais retirées de `SurfaceRail.tsx`.
- `WWS/README.md` et `WWS/CLAUDE.md` parlent de backend à engager et de mesures de l'ancien jeu,
  malgré des notes plus récentes qui les invalident dans les mêmes documents.
- `QUESTIONS.md` conserve des questions sur des doctrines abandonnées et des résultats anciens.
  Les séparer des décisions encore ouvertes avant d'y choisir un sujet.
- Conserver `RESTE-A-CODER.md` comme file et `ready/` / `done/` pour les briefs. La correction
  complète des documents d'entrée mérite une passe dédiée ; ce bilan ne réécrit pas leur histoire.

Règle proposée : **le code décrit le livré ; les ADR décrivent la cible ; la file décrit le
prochain travail ; les simulations disent seulement ce qu'elles mesurent**. Ce bilan est une
photographie datée, pas un document d'état permanent supplémentaire.

## Cinq questions pour la prochaine partie

1. Un invité comprend-il première construction et premier mouvement sans aide orale ?
2. Après une absence, retrouve-t-il ce qui a changé et une décision qu'il souhaite prendre ?
3. Explique-t-il ses pertes à partir du compte rendu, y compris munitions et déroute ?
4. Après un raid, comprend-il pourquoi un site est hors réseau et quand il produira à nouveau ?
5. Choisit-il d'affronter l'autre joueur ; sinon, quel gain ou quelle information lui manque ?

Noter les observations et le nombre de visites, sans transformer une seule partie en preuve
d'équilibre. Ces retours détermineront le prochain chantier de confort et le calibrage.
