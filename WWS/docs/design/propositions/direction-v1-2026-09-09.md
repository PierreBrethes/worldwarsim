# Direction V1 — discussion du 09/09/2026

Cette note conserve les arbitrages de Pierre après l'audit du projet. Elle distingue
les principes acceptés des pistes et de leur réalisation. Elle ne marque aucun
développement comme livré et ne remplace pas les contrats des chantiers en cours.
Pour ces sujets, les arbitrages ci-dessous priment sur les propositions antérieures
non réalisées. Les autres règles existantes restent en place.

> **Arbitrage du 10/09/2026 (décisions 86a, 87a).** Trois lignes de ce tableau rouvraient des
> décisions closes sans le dire ; Pierre les classe **pistes, pas décisions** : « sept jours avec
> une échéance effective » (l'accueil fonde sans horloge depuis le 31/08, `FOUNDED_CLOCK = null`,
> ADR 0017 révisée — l'horloge reste optionnelle), « nucléaire comme mécanique » (ADR 0007 tient,
> 1945 borne haute — la question 81 du Bulletin reste ouverte, réponse « Millennium » en
> attente), « les joueurs plus présents obtiennent une information plus fraîche en déplaçant leurs
> agents » (pilier 1 : la présence n'est pas un axe de compétence — les agents restent au Registre
> des idées et devront dire comment ils ne récompensent pas la connexion). La fenêtre d'inscription
> de deux heures est **gardée en `@a-mesurer`** (86a) : à rouvrir si un retardataire se présente
> pendant la partie de contrôle — `rejoindre-en-guerre` (24/08) l'admettait toute la saison.

## Décisions retenues

| Sujet | Direction retenue | Détail encore ouvert |
| --- | --- | --- |
| Public | Jeu entre amis, parties sur invitation. Le grand public reste une possibilité, pas un objectif imposé de V1. | Gestion pratique des invitations et inscriptions. |
| Comptes | Pseudo et mot de passe, sans fournisseur de connexion externe ; retrouver ses parties sur plusieurs appareils. | Récupération, sessions et reprise des places actuellement liées aux jetons. |
| Hébergement | Conserver le VPS existant. | Fiabilisation de la livraison et de la restauration. |
| Participants | Nombre adaptable, notamment deux, cinq ou six joueurs. Le code accepte déjà deux à huit. | Adaptation des objectifs et des départs, sans plafond fixé à quatre. |
| Durée | Sept jours comme point de départ, avec une échéance effective. | Équilibrage de la durée ; aucun changement des formats existants dans le premier lot. |
| Carte | Conserver le monde, son rendu de plateau dans un espace 3D et ses mouvements de caméra. | Répartir les enjeux selon les participants ; le rapprochement des objectifs est une proposition, pas une règle détaillée validée. |
| Victoire et offensives | Principes acceptés : objectifs stratégiques, prendre position, perturber la production, rapporter des ressources. | Formule de victoire, score, durée de tenue et départage. Aucun ancien brief de victoire ne devient automatiquement exécutable. |
| Blessés | Principe d'une récupération progressive dans un site approprié, contre temps et ressources. | Conditions, dépenses et cadence. |
| Économie | Examiner l'utilité réelle de chaque ressource et simplifier les filières inutiles. | Aucune ressource supprimée par cette discussion. |
| Présence et espionnage | Une économie qui permet de jouer avec peu de connexions ; les joueurs plus présents peuvent obtenir une information plus fraîche en déplaçant leurs agents. | Agents actifs à concevoir : la détection passive existe, les agents déplaçables ne sont pas jouables. Deux ou trois visites constituent une cible de confort, pas une limite imposée. |
| Apprentissage et rapports | Tutoriel jouable court et résultats compréhensibles retenus dans le principe. | Présentation ; le rejeu animé n'est pas un préalable au premier lot. |
| Notifications | Facultatives, avec choix des catégories d'événements. | Canaux et réglages précis. |
| Arrivées tardives | Nouveaux participants acceptés pendant les deux premières heures après le lancement, puis inscriptions closes. Les participants déjà inscrits peuvent revenir jouer. | Deux heures est une valeur provisoire, pas un équilibrage validé. |
| Fin de campagne | Clôture automatique, résultat explicite, archive et possibilité de revanche. | Critères précis et présentation. |
| Mobile | Objectif de jeu complet sur téléphone, paysage privilégié, carte dégagée et interface escamotable. | Gestes tactiles, panneaux et lisibilité à concevoir et tester ; aucune obligation de verrouiller l'orientation. |

## Pistes, sans engagement de réalisation immédiate

- Renouveler les décisions vers les quatrième et cinquième jours.
- Nucléaire comme mécanique de jeu : investissement coûteux qui détruit et contamine
  des zones, transformant l'espace jouable. Pierre identifie le risque d'avantage
  cumulatif ; équilibrage et présence en V1 restent à décider plus tard.
- Dessiner et effacer sur la carte ; effets en 3D, atmosphère et phénomènes visuels.
  Leur éventuel effet sur les règles n'est pas défini.
- Panneau latéral unique sur mobile, écrans de lecture temporaires, commandes
  tactiles explicites et confirmation distincte des gestes de navigation :
  propositions d'interface, pas surfaces livrées.

## Premier lot autorisé : fenêtre d'inscription de deux heures

Pierre a demandé de commencer les premiers développements avec le lot pilote
proposé pendant cette discussion, éventuellement dans une nouvelle tâche pour
préserver le contexte. La règle des deux heures est acceptée ; pas de nouvelle
demande de validation pour la même décision.

Résultat attendu : avant le lancement, l'inscription reste possible ; après le
lancement, aucune nouvelle place ne peut être créée à partir de l'échéance de deux
heures. Le serveur fait autorité, même si le formulaire est resté ouvert.

Interprétation d'implémentation : la fermeture concerne les nouvelles places.
Une place déjà obtenue conserve son accès, y compris la possibilité de terminer
le choix de nation et d'entrer en guerre. Cela évite de confondre fermeture des
inscriptions et interdiction de reconnexion. Ne pas expulser rétroactivement les
participants de saisons existantes.

Le lot comprend la règle commune, le refus serveur traduit, une indication simple
dans le parcours existant et les tests des limites temporelles. Il n'ajoute ni
compte, ni refonte mobile, ni victoire, ni clôture automatique de campagne, ni
mécanique de pillage. L'absence de nouvelle inscription ne demande pas de tâche
serveur périodique : l'échéance se contrôle à la demande.

Repères à relire dans leur état actuel : `convex/seasons.ts` (`join`, `enterWar`,
`lobby`), `convex/errors.ts`, `src/domain/off-season.ts`,
`convex/off-season.test.ts`, `src/routes/accueil.tsx`, `src/routes/salon.tsx`,
`src/i18n/fr.ts`. Lire `11-brief-ui.md` avant de modifier une surface.

## Méthode d'exécution acceptée

- Lots courts, brief ciblé et contexte neuf ; décisions et résultats conservés
  dans les documents du projet.
- Pilotage et diagnostic difficile avec Astra ; exécutant plus léger pour les
  tâches balisées, choisi selon les capacités disponibles. Pas de bénéfice de coût
  annoncé avant mesure.
- Un seul agent modifie le code à la fois dans le dossier habituel. Pas de worktree,
  de commit, de push ou de déploiement dans cette autorisation.
- Tests adaptés au lot, correction bornée, revue supplémentaire lorsque le risque
  le justifie. Après deux reprises infructueuses, diagnostic ou redécoupage.
- Autonomie sur les détails d'implémentation ; question seulement pour une décision
  nouvelle qui change le résultat attendu.
- Bilan court : résultat, fichiers, contrôles effectivement passés, limites et
  prochain lot. Ne pas lancer tous les chantiers V1 à partir de cette note.

## Coordination au moment de la passation

La tâche « Suite du pillage S6a » travaille encore dans le même dossier. Elle a des
modifications non commitées dans le serveur, le calcul des routes, le schéma et la
documentation de sa file. La nouvelle tâche peut préparer son lot en lecture seule,
mais doit attendre la fin de ce travail avant d'écrire du code. Ne pas interrompre
ce chantier, ni effacer, réinitialiser ou absorber ses changements.

La file opérationnelle reste `WWS/docs/RESTE-A-CODER.md`. Son état et les changements
locaux doivent être relus avant toute écriture. La vérification de l'audit initial
avait réussi avec 1 000 tests ; elle ne prouve pas l'état après les travaux suivants.
