# ADR 0018 — Anatomie de la passe de résolution, table unique, munitions au recrutement seul

**Statut :** acceptée — précise l'[ADR 0014](0014-troupes-discretes-et-combat-sequentiel.md), gravée après coup

> Cette ADR ne décide rien de nouveau. Elle grave des décisions déjà prises par le code pendant
> le traitement combat-séquentiel et jamais formalisées — le mécanisme documenté ici tourne en
> production depuis, dans `src/domain/combat.ts`, `convex/combat.ts` et `convex/movements.ts`.

## Contexte

L'[ADR 0014](0014-troupes-discretes-et-combat-sequentiel.md) gravait le principe : des troupes
discrètes, une résolution séquentielle à l'initiative de l'attaquant, un pierre-feuille-ciseaux
par table de dégâts. Elle ne descendait pas au niveau de l'implémentation. La fiche
[08 — Combat](../design/08-combat.md) pose le modèle et laisse volontairement les nombres
ailleurs (`convex/constants.ts`, vérifiés par `src/domain/combat.test.ts`).

Entre les deux, l'implémentation a dû répondre à des questions que ni l'ADR ni la fiche ne
tranchaient au niveau du mécanisme : comment une passe choisit ses cibles, ce qui se passe pour
une troupe qui tombe sous le seuil de déroute, si la cible d'un mouvement peut l'intercepter en
chemin, et — question longtemps ouverte — si les munitions se consomment au combat ou seulement
au recrutement. Ces réponses vivent dans le code depuis, sans ADR pour les justifier ni pour
empêcher qu'on les rejoue autrement par inadvertance.

## Décision

### 1. L'issue d'un engagement : le terrain nettoyé, rien d'autre

L'attaquant gagne un engagement si, à l'issue de la passe unique, plus rien ne tient debout côté
défenseur et qu'il lui reste au moins une troupe debout (`winnerOf`,
`src/domain/combat.ts:170`). Dans tout autre cas — y compris une déroute mutuelle, y compris un
attaquant qui perd tout — c'est le défenseur qui gagne.

C'est la lecture qui n'invente aucun chiffre : avec une seule passe, les deux camps repartent en
général avec des survivants, et il fallait pourtant une réponse binaire pour dire si un raid
désactive l'avant-poste qu'il visait. « Nettoyer le terrain, ou échouer » est la seule frontière
qui ne demande pas de seuil arbitraire (« 50 % de pertes », « le camp le plus fort »).

### 2. L'anatomie de la passe

Une passe de résolution (`resolveEngagement`, `src/domain/combat.ts:113`) se déroule ainsi, dans
cet ordre exact :

1. **Les troupes de l'attaquant frappent, dans l'ordre `ROLE_ORDER`** (infanterie, blindé,
   transport terrestre, chasseur, bombardier, transport aérien, escorte, cargo, porte-avions),
   puis par ancienneté de formation (`formedAt`), puis par identifiant pour départager deux
   troupes formées à la même milliseconde. C'est l'ordre canonique des rôles du domaine
   (`byStrikeOrder`) — il n'a pas de justification tactique propre, mais il doit être le même à
   chaque lecture du même engagement, sur n'importe quelle machine.
2. **Chaque tireur cible le meilleur défenseur encore debout** selon la table de dégâts — la
   plus grosse part atteignable, jamais une cible au hasard ni un ordre de saisie (`pick`).
   **Aucun écran, aucun fodder** : une troupe ne peut pas en placer une autre devant elle pour
   absorber la passe. C'est un choix assumé, pas un oubli — le plafond de troupes (10 à 30 par
   nation, ADR 0014) existe pour refuser l'essaim ; autoriser l'écran reviendrait à le lui rendre
   par la bande, une troupe jetable de plus valant alors une passe encaissée de moins.
3. **L'excès d'une frappe est perdu, jamais de débordement.** Les dégâts sont plafonnés à ce
   qu'il reste à la cible (`Math.min(target.strength, ...)`, `hit`) ; le surplus ne rejaillit pas
   sur la troupe suivante. Six colonnes blindées visant une seule cible n'en achèvent qu'une :
   les quatre frappes de trop ne servent à rien. C'est ce qui borne le mérite de l'empilement —
   accumuler des troupes sur une même cible gaspille des tirs, ça ne les multiplie pas.
4. **Une troupe tombée sous `ROUT_THRESHOLD` (0,25) de son effectif nominal rompt le contact
   immédiatement.** Elle sort de la passe en cours (elle ne peut plus être ciblée, elle ne
   riposte pas) et la résolution du mouvement (`convex/movements.ts`) lui ouvre un mouvement de
   retour créé par le système, **hors slots de mouvement** (ADR 0006) — ce n'est pas un ordre,
   c'est ce qu'une colonne qui a rompu fait mécaniquement. C'est la règle n° 3 du projet — un
   joueur écrasé reste nuisible, jamais éliminé — appliquée à l'échelle de la troupe : déroutée,
   pas détruite.
5. **Les ripostes viennent après toutes les frappes, jamais entrelacées.** Un défenseur déjà
   touché riposte avec ce qu'il lui reste ; un défenseur pas encore atteint riposte à pleine
   force. Entrelacer frappes et ripostes ferait décider deux fois le même ordre de tir — une
   fois pour qui frappe en premier, une fois pour qui riposte en premier — et rendrait l'issue
   sensible à un détail d'implémentation plutôt qu'à la composition des forces. Chaque défenseur
   encore debout riposte sur qui l'a frappé en dernier s'il peut l'atteindre, sinon sur la
   meilleure cible qu'il peut atteindre, sinon pas du tout (`riposteTarget`).

### 3. Le bonus du défenseur, les types qui combattent, l'interception au départ

**`DEFENDER_BONUS` vaut 1,15** — le deuxième des trois contre-pouvoirs exigés par l'ADR 0014
contre l'initiative de l'attaquant, appliqué à la riposte (le partage de dégâts est divisé par ce
facteur pour la frappe de l'attaquant, multiplié pour la riposte du défenseur).

**Deux types de mouvement déclenchent une passe de résolution : `attack` et `raid`**
(`convex/movements.ts:245`). Un raid gagné désactive l'avant-poste visé (jamais ne le prend,
ADR 0004) ; une attaque n'a pas cet effet secondaire, elle ne fait que combattre.

**L'interception se calcule une seule fois, au départ du mouvement**
(`src/domain/interception.ts`, `scheduleInterception`), contre tout ce qui se trouve déjà sur le
plateau à cet instant — jamais recalculée en continu. C'est le mouvement qui vient de partir qui
regarde ce qui existe, pas l'inverse : aucune force déjà en route n'est réexaminée quand une
troisième apparaît, ce qui évite de refaire la géométrie de toutes les paires à chaque nouveau
départ.

**La cible d'une colonne ne l'intercepte pas en chemin.** La garnison de l'avant-poste ou de la
région visée est explicitement exclue du calcul d'interception aller (`except: aim.outpostId`) :
sans cette exclusion, une colonne qui marche vers une garnison entrerait dans son rayon
d'interception avant d'arriver, et la même passe se rejouerait deux fois pour un seul ordre — une
fois en chemin, une fois à l'arrivée. Une passe par engagement (ADR 0014) l'interdit.

### 4. La table de chiffrage est unique

`DAMAGE_TABLE` (`convex/constants.ts`) est la seule table de dégâts du jeu.
`WWS/simulation/verif-chiffrage.mjs`, qui rejouait les soixante-quinze couples atteignables sur
une **copie** de la table, a été supprimé : deux tables finissent toujours par diverger, et le
jour où elles divergent, le garde-fou continue de passer sur des chiffres que le jeu ne joue
plus. Le même garde-fou — aucun couple ne doit être un contre absolu, hors les trois transports,
victimes par design — vit maintenant dans `src/domain/combat.test.ts`, et il rejoue les
soixante-quinze couples à travers `resolveEngagement` lui-même, pas à travers une reformulation
de la règle.

### 5. Le rayon d'interception : placeholder assumé, non simulé

**`INTERCEPTION_RADIUS_KM` vaut 200.** Ce n'est pas une valeur mesurée : c'est un
ordre de grandeur — un quart d'heure de marche au rythme mesuré — posé pour que le premier des
trois contre-pouvoirs de l'ADR 0014 existe *techniquement* avant d'être calibré. Le simulateur ne
modélise pas l'interception ; ce nombre est, textuellement, « le trou le plus béant du modèle »
(fiche 08 §11) et doit être regardé à la main dès la première saison.

### 6. Désactivation d'avant-poste : `OUTPOST_DISABLED_HOURS` et son immunité

Un raid gagné désactive l'avant-poste pour **`OUTPOST_DISABLED_HOURS` = 6 heures**, suivi d'une
fenêtre d'immunité de **`OUTPOST_IMMUNITY_HOURS` = 3 heures** pendant laquelle il ne peut pas être
redésactivé (`deactivate`, `convex/movements.ts:685`). Ni l'une ni l'autre valeur n'est dans le
design — la fiche 03 dit « temporairement » puis « une fenêtre d'immunité » et s'arrête là. Les
deux sont des placeholders dimensionnés pour qu'ensemble ils se lisent : une nuit hors service,
une demi-nuit de répit, sur une saison de 48 h. Sans l'immunité, une désactivation en relais
équivaudrait à une destruction déguisée — ce que le modèle refuse tant que le pillage n'existe pas
(ADR 0004).

### 7. Les munitions ne se consomment pas au combat

Une troupe ne débite pas de munitions pendant une passe de résolution. La seule facturation a
lieu **au recrutement** : `ammunitionLoad` (`convex/constants.ts:356`) calcule la charge initiale
d'une troupe — un round pour cinq points d'effectif, deux engagements d'avance
(`INITIAL_AMMUNITION_ENGAGEMENTS`) — et ce montant est débité une fois, à la formation de la
troupe. `DRY_AMMUNITION_FACTOR` et le champ `dryAmmunitionFactor` de `CombatRules` ont été
retirés du modèle de combat ; `resolveEngagement` ne lit ni ne débite de munitions.

C'est la décision finale sur un point qui était resté contesté dans le brief d'origine
(« munitions nationales »). Facturer les deux bouts — au recrutement et au combat — était le bug ;
une seule facturation, au recrutement, est le correctif retenu.

## Justification

**Zéro écran, zéro chiffre inventé.** Chacune des règles ci-dessus se lit sans introduire un
paramètre supplémentaire dans le modèle : la cible est toujours « la meilleure part atteignable »,
la victoire est toujours « plus rien en face », l'excès est toujours perdu plutôt que réparti
selon une formule à choisir. Le seul endroit où un chiffre est posé sans mesure, c'est là où le
design lui-même n'en fournit aucun — le rayon d'interception et les durées de désactivation — et
ces deux endroits sont marqués comme tels dans le code, pas seulement ici.

**Le déterminisme reste total.** Aucune étape ne tire un nombre aléatoire ; l'ordre de frappe,
la cible et le montant des pertes sont une fonction pure de l'état des deux camps et de la table
(ADR 0008). L'issue d'un engagement est prévisible avant de l'ordonner, ce qui reste la qualité
stratégique recherchée par l'ADR 0014.

**Une seule table, un seul garde-fou.** Le retrait de `verif-chiffrage.mjs` n'est pas un
nettoyage cosmétique : une copie de table est un mensonge en sursis, et le remplacer par un test
qui rejoue la vraie fonction de résolution est la seule version qui ne peut pas mentir.

## Conséquences

- **La fiche [08 — Combat](../design/08-combat.md) diverge maintenant du code sur un point : ses
  §5 et §7 décrivent encore des munitions qui se consomment au combat (« à sec, une troupe se bat
  à taux réduit »).** Cette ADR grave l'état final inverse. La fiche n'est pas corrigée par ce
  travail — signalé en fin de session, à trancher.
- **Le rayon d'interception reste à mesurer.** Rien dans cette ADR ne le calibre ; elle se
  contente de nommer sa nature de placeholder pour qu'il ne soit pas lu comme une valeur de
  design.
- **`src/domain/combat.test.ts` est désormais l'unique garde-fou anti-contre-absolu.** Toute
  future modification de `DAMAGE_TABLE` doit repasser ses soixante-quinze cas ; il n'y a plus de
  seconde copie à mettre à jour en parallèle.
- **L'absence d'écran/fodder est une contrainte pour toute future mécanique de formation ou de
  garde.** Une proposition qui laisserait une troupe en protéger une autre pendant une passe
  contredirait cette ADR et devrait la réviser explicitement, pas la contourner dans une fonction
  voisine.

## Ce qu'on abandonne

- **La consommation de munitions au combat**, et le modificateur « à sec » qui l'accompagnait
  dans la fiche 08 §5 et §7 — la question 18 est tranchée, une seule facturation subsiste.
- **`verif-chiffrage.mjs` et l'idée d'une seconde table de vérification.** Le garde-fou vit dans
  le domaine testé, pas dans une copie externe.
- **Tout écran ou fodder tactique.** Chaque troupe encaisse pour elle-même ; le plafond de
  troupes est le seul frein à l'empilement.
- **Le débordement des dégâts d'une cible à l'autre.** Une frappe en excès est un tir perdu, pas
  un crédit reporté.
