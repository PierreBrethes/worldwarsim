# pillage-et-butin — piller, porter, rentrer

**Clarifié le 09/09/2026 ; non livré.** L'ancien « lot 1 » fonctionnel se découpe en S4-S9
dans la [file centrale](../../../RESTE-A-CODER.md#petits-lots-stockage-et-pillage--0909).
Exécuter un seul petit lot demandé, directement dans le dépôt, sans worktree, commit ni
push ; s'arrêter ensuite. Les arbitrages ci-dessous restent à décider : `ready/` ne les
rend pas implicitement validés.

## Sources et acquis

Lire les instructions du dépôt, `CONVENTIONS.md`, `WWS/CONTEXT.md`, la
[proposition](../../../design/propositions/pillage-et-butin.md), les ADR
[0017 §3](../../../adr/0017-format-de-saison-et-socle-place.md),
[0019](../../../adr/0019-mouvement-libre-et-troupes-posees.md),
[0020 §6-7](../../../adr/0020-domination-par-couleur.md),
[0021 révisée le 08/09](../../../adr/0021-portee-de-detection-et-postures.md) et la
[vision V1](../../../design/propositions/vision-v1-expeditions.md).

**Déjà livrés : stock national, production reliée, raids, combat, retours et portées
passives.** Ne pas les recréer. S2-S3 fusionnent les deux stockages avant le pillage.
La proposition ancienne conserve son historique ; ses mentions de destruction, visibilité
liée à la grosseur de la colonne et alternative de stockage ne remplacent pas les règles
ci-dessous. La sortie b (entrepôt unique) est retenue.

## Règles retenues pour ce périmètre

- L'ordre `plunder` exige de l'infanterie ; les autres rôles peuvent escorter. Sa cible
  porteuse de butin est l'entrepôt adverse **déjà relevé** (`depot` historique inclus).
  Ni QG, projection, cantonnement, station ou avant-poste.
- Aller, vaincre la défense présente, tenir une présence, repartir chargé. Réutiliser la
  passe existante ; pas de combat fictif sur cible vide. Le bâtiment est **désactivé**,
  jamais détruit ou capturé ; son avant-poste n'est pas désactivé par cet ordre.
- **Le butin provient uniquement de ressources qui existent réellement.** Une mine ou une
  usine ne crée aucun butin en heures de rendement : elle se **sabote** dans le lot distinct
  S5c pour interrompre temporairement sa production, même si elle est alors à l'arrêt.
  Aucun stock local par bâtiment n'est ajouté.
- **Entrepôt, décision explicite de Pierre le 09/09 : tout le surplus au-dessus de
  `BASE_CAP` est prélevable, avec la capacité de transport de la colonne comme plafond.**
  La réserve de base est protégée. **La capacité est répartie automatiquement au prorata
  des surplus positifs pillables, sans sélection manuelle.** Prélever avant réduction du
  plafond et écrêtage. La désactivation de l'entrepôt et l'écrêtage qui suit restent la
  règle héritée du brief antérieur ; la décision nouvelle ne les a pas supprimés.
- **Ressources engagées, décision D5 acceptée par Pierre le 09/09 pour la V1 : le pillage
  touche seulement le stock disponible et préserve les ressources déjà engagées dans les
  recrutements, ainsi que leur remboursement à l'annulation selon les règles existantes.**
  Une file annulable permet donc de mettre des ressources à l'abri : c'est une limite
  assumée de cette V1, pas un contournement à corriger dans ce chantier.
- Points de départ non équilibrés de l'ancien brief : `PLUNDER_HOURS_PRESENT = 2` et
  `PLUNDER_DISABLED_HOURS = 12`. **D2, validée par Pierre le 09/09 :** la capacité nominale
  de butin vaut 40 pour l'infanterie, 120 pour le transport terrestre, 80 pour le transport
  aérien et 240 pour le cargo ; blindé, chasseur, bombardier, escorteur et porte-avions valent
  zéro. La table exhaustive `CARRY_CAPACITY_BY_ROLE` reste `@a-mesurer` en partie.
- **Capacité effective validée par Pierre le 09/09 : chaque troupe contribue selon
  `strength / nominalStrength`.** Une troupe à moitié d'effectif fournit la moitié de sa
  capacité nominale de butin ; la capacité du groupe est la somme de ces contributions.
  Ce ratio ne réduit pas en plus `LIFT_CAPACITY`, qui concerne le transport de troupes et
  reste une mécanique distincte.
- Le retour est créé par la résolution. **Livraison validée par Pierre le 09/09 : le
  butin est crédité dès le franchissement de la bordure d'une région tenue par le porteur,
  sans devoir atteindre son pôle/centre ni sa capitale.** Cette règle vaut pour le retour
  du pilleur comme pour celui du récupérateur de butin.
  **Révision explicite de Pierre le 09/09 : si l'intercepteur
  détruit la colonne chargée, il peut voler son butin**, dans la limite de sa capacité
  de transport. Le butin doit encore voyager jusqu'à son territoire : aucun crédit
  direct à un stock distant. Cela remplace l'ancienne perte sans reprise sur destruction,
  et appartient à cette V1, indépendamment de la capture de bâtiments.
- **Pertes sans défaite, D2 validée par Pierre le 09/09 : la colonne conserve seulement le
  butin transportable par les survivants ; l'excédent est perdu.** Chaque ressource baisse
  au prorata de la charge transportée. L'ordre stable des huit ressources attribue à la
  dernière ressource positive le seul résidu flottant encore disponible : aucun arrondi ne
  peut créer de butin ni dépasser une quantité source.
- **Aucun sélecteur ou champ de posture, aucun coefficient de discrétion.** Marcher et
  rentrer observent sans engager ; une force attaquée riposte. Pendant la présence,
  la force posée défend sa position sans intercepter à distance. **Pierre valide le 09/09
  que l'expédition de pillage attaque uniquement sa cible, n'engage pas spontanément les
  colonnes croisées et riposte si elle est attaquée.**
- Un arc adverse ne révèle ni ordre, ni composition, ni charge. La portée dépend des rôles,
  jamais du butin. Capture de bâtiments, QG, objectifs neutres, nouvel ordre
  d'interception et salve d'allonge restent hors chantier.

## Contrats d'intégration inspectés

**Cibles (S5a).** `MovementAim.building` vise aujourd'hui un bâtiment à soi ;
`regionSightings` conserve tenant/date, pas les installations. Ajouter un relevé minimal
de bâtiments par observateur, écrit aux événements et lu par son index. Une région
anciennement relevée ne révèle pas un bâtiment apparu depuis. Pas de filtre de la vérité
adverse dans `PlayerView`, pas de stock ou garnison cachée dans la vue ou l'aperçu.
Revalider une cible périmée à l'arrivée sans en faire une sonde à distance.

**Présence et désactivation (S5b).** Réutiliser `defenceOf` / `resolveContact`. La présence
a un état durable et une échéance ; elle garde les troupes indisponibles pour un second
ordre. Ne pas imposer `troops` / `stationedAt` inchangés avant vérification. Tout ajout
sur document existant est optionnel avec défaut, ou accompagné d'un backfill.

À l'échéance, dans une transaction : relire saison/cible/survivants ; régler les stocks à
l'ancien état ; calculer le butin réel, débiter la victime ; désactiver l'entrepôt ; recalculer
les plafonds et appeler `clipToStorage` ; créer le retour chargé. Les extracteurs et chaînes
relèvent du sabotage S5c, sans butin. Restaurer l'entrepôt à `disabledUntil` même si le job
est en retard. Préserver repos, capitulation et clôture existants ;
`seasonStillPlays` garde les jobs. « Désactivé » et « hors réseau » restent deux causes.

**Sabotage (S5c).** Une expédition distincte vise une mine ou une usine déjà relevée et
interrompt temporairement sa production, même si le site est momentanément à l'arrêt.
Elle ne prélève ni ne crée aucune ressource, ne touche pas les stocks et ne produit aucun
retour chargé. Réutiliser la défense, la présence, la désactivation et la restauration de
S5b ; la durée reste celle retenue pour la désactivation, sans en inventer une autre ici.

**Retour (S6a).** `movements.loot` optionnel, absent = aucune charge. Un seul mouvement porte
la charge ; chaque transition consomme l'état précédent une seule fois. Couvrir les
effacements, combats successifs et jobs périmés. `walkHome` ramène actuellement à une
adresse/ancre, pas à une frontière : adapter ce retour à la livraison au franchissement
de la bordure d'une région tenue par le porteur, selon la décision ci-dessus.
Régler le stock avant crédit et distinguer pris, livré et perdu au plafond. Selon l'ADR
0017, une entrée ne rogne pas le stock préexistant au-dessus du plafond : ne pas appliquer
naïvement `clipToCapacity(stock + loot, cap)`.

**Récupération par l'intercepteur (S6b).** Étendre la résolution du contact existant :
consommer la charge de la colonne détruite une seule fois et transférer seulement la part
transportable à la force victorieuse. Compter sa charge déjà portée dans la capacité
disponible. La nouvelle charge reste exposée à une interception suivante, puis se livre
par le même cycle que S6a. Prévoir son retour effectif : ne pas rattacher simplement la
charge à un mouvement d'attaque dont l'arrivée actuelle l'effacerait. Aucun nouveau choix
de posture ni ordre d'interception. La déroute sans destruction, plusieurs bénéficiaires
et l'excédent attendent D6. Ces cas bloquent l'ouverture publique, pas la clarification.

**Ouverture et surfaces (S7-S8).** S5-S6 restent internes et testés par fixtures : ordre
public refusé côté serveur. S7 raccorde la rose sous la même fermeture ; S8 ouvre l'ordre
et la rose ensemble après validation ciblée du cycle et des dépêches. Cacher un bouton
seul ne sécurise pas une mutation. Aucun système générique de fonctionnalités à créer.
Lire `WWS/docs/design/11-brief-ui.md` avant S7 : rose sur cible connue, refus partagés,
aperçu serveur de présence/retour/capacité, prévisions identifiées comme estimations.
La capacité de mission est celle des troupes choisies dans `GarrisonStack` pour former le
groupe envoyé, pas celle de toute la garnison du site. Afficher le cumul effectif de la
sélection ; pour une force chargée à soi, afficher les quantités par ressource et le
chargement total. Il n'existe ni stock de garnison ni « coût » monétaire du butin à inventer.
Rien de nouveau dans « à faire maintenant ».

**Abaque et composition (S4b).** Dans la fiche dépliée de `GunneryWindow`, conserver la
portée de détection déjà servie par `detectionRangeOf([role])`, puis ajouter la capacité
nominale de butin du rôle et sa vitesse telle que les règles actuelles la déterminent.
La vitesse dépend du milieu et de la composition (`routeModeOf`, `motorized`, `landCostOf`,
`COST_BY_MEDIUM`) : afficher ces règles/valeurs réellement employées, sans créer une vitesse
autonome par véhicule ni recopier les portées. Dans `GarrisonStack`, montrer la capacité
effective du seul groupe sélectionné, calculée par la même fonction pure que S4.

Prévoir dès S5b-S6 les faits durables nécessaires au journal, même si leur rendu attend S8 :
victime `sitePlundered` (désactivation et perte de stockage), pilleur `lootTaken`
(dont « rien à prendre »), `lootDelivered` (livré et excédent perdu), `lootLost`.
S6b conserve aussi le fait de récupération pour une dépêche au nouveau porteur, avec
quantité réellement emportée ; S8 la branche sans annoncer une livraison anticipée.
Ni double dépêche ni fait réservé à un autre observateur. Textes via `src/i18n/fr.ts`.

## Décisions nécessaires — recommandations non validées

- **D3 — Présence, avant S5b.** Le comportement en route est validé ci-dessus. Restent les
   recommandations : encore de l'infanterie à la prise, sinon retour vide ; refuser un
   site encore désactivé et revalider à l'arrivée/prise, y compris deux expéditions
   concurrentes. Pas d'immunité supplémentaire proposée.
- **D4 — Changement de contrôle et absence de route, avant S6a.** La livraison à la bordure
   est validée ci-dessus ; la recommandation de rejoindre un pôle de région est retirée.
   Le comportement si le contrôle territorial change pendant le retour ou si aucune route
   n'est possible reste **non tranché**, pour le pilleur comme pour le récupérateur de butin.
- **D6 — Limites de la récupération, avant S6b.** La récupération après destruction est
   validée, pas le sort du butin en cas de simple déroute, de plusieurs bénéficiaires ou
   de capacité insuffisante. Recommandation : déroute sans destruction → perte sans
   transfert ; plusieurs bénéficiaires → partage au prorata des capacités disponibles ;
   excédent non transportable → perdu. À valider avant d'implémenter ces branches.

## Acceptation et arrêt

Les suites ciblées sont dans la file. Cas indispensables : infanterie absente/escortée ;
cible inconnue/QG/entrepôt legacy ; surplus réels répartis au prorata sans toucher
`BASE_CAP` ; mine/usine sabotée sans aucun butin, y compris à l'arrêt ; prélèvement avant
écrêtage ; ressources engagées dans les recrutements protégées et remboursement
préservé après pillage ; présence interrompue/double échéance ; livraison unique dès le franchissement
de la bordure tenue, sans atteindre le centre, pour le pilleur et le récupérateur ; pertes
partielles avec capacité au ratio d'effectif et répartition selon D2 ; contrôle changé/route impossible selon D4 ; destruction puis transfert borné, porteur déjà chargé,
nouvelle interception et livraison par le vainqueur sans double crédit ; déroute, plusieurs
bénéficiaires et excédent selon D6 ; saison conclue sans effet ; même forme adverse pour une
colonne vide ou chargée.

Les changements de règle sont documentés **dans leur lot**, dans les ADR concernés et les
entrées concernées des instructions/glossaire/fiches. L'ajout des constantes s'accompagne de
`scripts/generate-a-mesurer.mjs`. S9 porte `npm run verifier` et la synthèse finale ;
aucun lot précédent ne marque tout le pillage livré ni ne lance le chantier suivant.
