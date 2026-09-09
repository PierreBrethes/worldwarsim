# pillage-et-butin — piller, porter, rentrer

**Clarifié le 09/09/2026 ; S7c-2 livré, pillage non jouable.** L'ancien « lot 1 » fonctionnel se découpe en S4-S9
dans la [file centrale](../../../RESTE-A-CODER.md#petits-lots-stockage-et-pillage--0909).
Exécuter un seul petit lot demandé, directement dans le dépôt, sans worktree, commit ni
push ; s'arrêter ensuite. Les arbitrages ci-dessous restent à décider : `ready/` ne les
rend pas implicitement validés.

S4 à S7c-2 sont terminés localement le 09/09 ; S8 est le prochain lot.

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

**D3 validée oralement par Pierre le 09/09 et livrée avec S5b.** La prise exige encore de
l'infanterie survivante après toute la présence ; sinon les survivants repartent sans charge. Un
site déjà désactivé est refusé, puis identité, saison, propriétaire, activité et survivants sont
revalidés à l'arrivée et à la prise. Deux présences concurrentes attendent chacune leur échéance :
la première prise valide désactive le site, la suivante repart vide, sans second prélèvement ni
prolongation cumulée. La première arrivée ne dispense jamais des 2 h de présence. Les 2 h de
présence et 12 h de désactivation restent des points de départ `@a-mesurer`, sans preuve
d'équilibrage.

**Sabotage (S5c, livré en interne le 09/09).** Une expédition distincte vise une mine ou une usine déjà relevée et
interrompt temporairement sa production, même si le site est momentanément à l'arrêt.
Elle ne prélève ni ne crée aucune ressource, ne touche pas les stocks et ne produit aucun
retour chargé. Réutiliser la défense, la présence, la désactivation et la restauration de
S5b ; la durée reste celle retenue pour la désactivation, sans en inventer une autre ici.

**Retour (S6a).** `movements.loot` optionnel, absent = aucune charge ; `stationedLoot` porte
depuis S6a-1 la charge d'une force posée. Une seule forme porte la charge à un instant donné ;
chaque transition consomme l'état précédent une seule fois. Couvrir les
effacements, combats successifs et jobs périmés. `walkHome` ramène actuellement à une
adresse/ancre, pas à une frontière : adapter ce retour à la livraison au franchissement
de la bordure d'une région tenue par le porteur, selon la décision ci-dessus.
Régler le stock avant crédit et distinguer pris, livré et perdu au plafond. Selon l'ADR
0017, une entrée ne rogne pas le stock préexistant au-dessus du plafond : ne pas appliquer
naïvement `clipToCapacity(stock + loot, cap)`.
Depuis S6a-3, une passe borne la charge à la capacité effective après dégâts et répartit la part
transportable entre les trajectoires des survivants ; `lost` et `delivered` s'accumulent sans
qu'un callback déjà consommé puisse les compter deux fois.
Depuis S6a-4, un départ accepté reprend atomiquement la part de `stationedLoot` portée par sa
sélection. Plusieurs provenances restent distinctes dans `movements.lootLoads?`, sans total stocké
en double ; un lecteur central tolère encore `loot` et `plunderReportId` historiques. Toute arrivée
ordinaire repose la charge sans la créditer.

**Récupération par l'intercepteur (S6b-1 livré).** La résolution consomme une fois la charge
pré-perte seulement quand tous ses porteurs sont détruits, puis transfère la part transportable
aux groupes debout du vainqueur après leurs propres pertes et leur charge existante. La charge
récupérée porte un `recoveryId`, suit mouvements, stationnement, reprise et livraison S6a et ne
crédite jamais le stock au combat. Le rapport de pillage initial inscrit l'interception en perte ;
les livraisons et interceptions suivantes alimentent le fait `lootRecoveries`, sans attribuer au
récupérateur le bâtiment pillé à l'origine. Depuis S6b-2, le reliquat quitte atomiquement ce fait
pour une unique `lootCrates` privée au point exact : quantité courante unique, échéance fixe de 2 h
depuis la destruction, prélèvement interne partiel sans report et expiration idempotente. Aucun
nouveau choix de posture ni ordre d'interception. La détection, la collecte physique et la priorité
stable entre collecteurs restent dans les lots suivants de D6.

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

**Abaque et composition (S4b, terminé localement le 09/09).** Dans la fiche dépliée de `GunneryWindow`, conserver la
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

## Décisions D4 et D6 acquises — 09/09

- **D4 — contrôle et route.** Un retour engagé continue vers la région choisie au départ. Si
  elle n'est plus tenue à l'arrivée, les survivants s'y posent, sans détour, et la charge est
  perdue : cette fin est la précision d'implémentation minimale annoncée. Si la zone est déjà
  perdue avant que le retour ne soit enclenché, Pierre valide explicitement la même fin sur
  place, sans départ. Si aucune route n'existe, la force reste au point de prise **avec** sa
  charge. La livraison exige toujours une région tenue au franchissement.
- **D6 — pertes et récupération.** Une déroute n'est pas une destruction : les survivants
  gardent la part que leur capacité effective porte, le surplus suivant la réduction
  proportionnelle D2. Après destruction, le premier récupérateur selon l'arrivée serveur prend
  dans sa capacité libre ; égalité départagée par ancienneté d'ordre puis clé stable. Aucun
  partage au prorata entre récupérateurs. Le reliquat devient une caisse réelle au point de
  destruction, collectable jusqu'à son échéance initiale.

## Caisses et signalement mondial retenus pour essai

Une caisse dure 2 h. Après 10 min, tous reçoivent une rumeur sans combattants ni minuteur précis :
un cercle de rayon 200 km dont le centre, tiré une fois uniformément dans le disque autour de la
caisse, reste identique pour tous. La caisse appartient toujours au cercle ; géométrie et
enroulement sont ceux de la carte. Le clic vise le centre et cadre le cercle, jamais le point réel.
La position et le contenu exacts ne sortent dans `PlayerView` qu'après détection par une portée
existante. Une collecte ne retire pas immédiatement la rumeur mondiale : son terme public suit
l'échéance prévue, afin de ne pas signaler à distance la présence du récupérateur. Le délai fixe
masque l'instant immédiat, pas toute déduction sur l'heure passée.

S6a-2 est scindé : **S6a-2a** grave la région automatique connue avant le retour et traite sa
perte avant départ ; **S6a-2b.1** ajoute la géométrie admin-1 et le calcul pur du premier
franchissement ; **S6a-2b.2** choisit le retour atteignable par une recherche multi-objectif,
tronque le trajet, puis crédite ou perd à l'arrivée. Le plan de S6a-2b.2 est désormais canonique :
la région d'origine de S6a-2a n'est plus une seconde destination concurrente. **S6a-4** raccorde
désormais explicitement une charge déjà posée au prochain mouvement de ses porteurs.
Une proximité au point de région ne remplace jamais sa frontière. Le découpage exécutable S6a-1
à S8 est tenu dans `RESTE-A-CODER.md`. Aucun lot n'ouvre le geste avant le raccordement coordonné
final.

## Lot livré — S6b-3a, relevé privé aux événements présents

À partir de la seule vérité `lootCrates`, un fan-out privé par observateur révèle le
point et le contenu exacts uniquement lorsqu'un détecteur existant couvre réellement la caisse.
Il réutilise les portées de rôle, avant-poste d'écoute et station d'écoute déjà définies, sans
nouvelle portée, ni bonus lié à la quantité, ni posture. Les relevés doivent être dénormalisés et
lus par index d'observateur : aucune query de vue ne filtre la table vraie des caisses. Création,
déplacement/pose ou disparition d'un détecteur, prélèvement et expiration réévaluent la couverture
présente. Une collecte partielle ne met à jour que les observateurs encore à portée ; les autres
gardent leur dernier relevé marqué périmé. À leur retour, ils apprennent le contenu courant ou
l'absence. `expiresAt` n'est pas copié. `PlayerView`, rumeur mondiale, journal, carte et collecte
restent fermés.

## Lot livré — S6b-3b, fenêtres mobiles futures

Pour chaque caisse existante et chaque mouvement qui porte un rôle détecteur, le serveur calcule sur sa route
la prochaine entrée dans le rayon puis la sortie, sans traiter le territoire comme détecteur.
Les rendez-vous annulables sont séparés du dernier relevé et ne révèlent rien avant leur réveil.
Une modification géométrique de caisse, route ou composition recalcule les prédictions ; un simple
prélèvement partiel actualise uniquement la couverture présente. Le callback vérifie son identité,
la saison active, la caisse, le mouvement, ses troupes, leur portée et `positionAt(now)` : ancien,
annulé, dupliqué ou tardif, il ne reconstruit jamais une observation passée. La synchronisation
globale conserve `current:true` si un autre détecteur couvre encore la caisse. Aucun polling,
`PlayerView`, rumeur mondiale, journal, carte ou ramassage n'est branché.

## Lot livré — S6c-1, retour chargé commun et livraison

Le choix d'une région tenue atteignable, sa frontière d'entrée et la création du retour estampillé
vivent dans `movement/cargo-return.ts`, commun au pillage et aux récupérations de combat. Une
charge sans destination préexistante part vers cette frontière ; déjà dans une région tenue, elle
est créditée au point réel sans trajet nul. Sans route, troupes et fragments restent au point du
combat. Le contrôle est toujours relu à l'arrivée par `completeLootDelivery`, qui crédite seulement
la place disponible, inscrit le surplus en perte et cumule chaque provenance une fois. Un défenseur
posé qui récupère une charge emprunte le même chemin. Aucun ramassage, fait de collecte, vue ou
geste public n'est encore branché.

## Lot livré — S6c-2, mission de ramassage

La mission interne vise exclusivement le point du relevé privé `lootCrateSightings` possédé par le
joueur, même si ce relevé n'est plus courant ; elle ne lit jamais `lootCrates` au départ. Marche,
groupe, adresse, slot, route et capacité libre après charge existante passent par les règles
communes, et un refus annule la transaction. L'arrivée relit caisse et troupes, puis règle les
missions dues par `(arrivesAt, orderedAt, id)`, sans partage au prorata. Chaque prélèvement crée un
fait `lootCollections` du nouveau porteur ; `collectionId` suit le chargement, ses divisions, ses
pertes, ses récupérations et sa livraison sans attribuer celle-ci au `lootRecoveries` source. La
caisse garde son échéance. Le correctif S6c-2b indexe les mouvements par
`(lootCollection.crateId, arrivesAt)` : l'expiration appelle directement le même arbitre pour les
arrivées strictement antérieures, puis supprime le reliquat une fois, sans boucle de réveil. Une
mission retenue par la plage de repos est reportée après l'échéance et ne maintient pas la caisse ;
une arrivée égale à l'échéance ne prélève rien. Les sondes temporaires de priorité, expiration,
repos, invalidation et idempotence ont été exécutées puis supprimées. Vide, disparue ou expirée,
la caisse ne révèle rien à distance et la colonne rentre avec sa charge antérieure. Aucun
`PlayerView`, rumeur, journal, carte ou geste public n'est branché.

## Lot livré — S7a, signalement mondial différé

La première caisse matérielle d'un engagement crée un fait `lootRumors` unique ; les autres
reliquats du même engagement réemploient exactement son cercle. Le centre est échantillonné une
fois côté serveur dans le disque géodésique de 200 km qui contient le point, sans graine ni
translation réversible stockée. Publication et fin sont deux rendez-vous identifiés/versionnés,
datés depuis `appearedAt` à +10 min et +2 h. Ils relisent fait, version, date et saison ; doublon,
ancien travail, réveil après le terme, saison conclue ou purge restent inertes. La disparition ou
le prélèvement d'une caisse ne modifient jamais la rumeur. `lootRumors.list`, authentifiée par le
jeton de partie, lit seulement les faits de la saison et sert id, date publiée, centre, rayon et
état public ; aucun lecteur ne joint la caisse vraie, sa quantité, sa récupération ou ses
combattants. Délai et rayon sont `@a-mesurer`. Les sondes temporaires ont été supprimées. Aucun
journal, carte, `PlayerView` ou geste public n'est branché.

## Lot livré — S7b, journal mondial et carte

Le journal consomme exclusivement `lootRumors.list` dans sa section française « événements
mondiaux ». Chaque entrée donne la date publiée et l'état public, jamais un compte à rebours,
contenu, combattant, propriétaire ou provenance. Sa sélection transmet seulement centre, rayon et
état à la carte. Le moteur impératif centre la caméra sur ce centre public et cadre le cercle avec
une marge ; il rend une brume sans marqueur exact, avec un périmètre continu pour un signalement
actif et discontinu, plus pâle, après sa fin. À l'antiméridien, les points gardent la projection
canonique des deux bords sans tracer de bande au travers du monde ; la caméra recule assez pour
montrer les deux moitiés. Choisir l'entrée ferme le journal pour rendre le plateau ; la zone reste
pendant les gestes de mouvement et se retire en resélectionnant la même entrée. La sonde UI
temporaire a été supprimée. Aucun lecteur privé, ramassage, dépêche S7c ou geste S8 n'est ouvert.

## Lot livré — S7c-1, données privées, aperçus et dépêches

La vue sert la charge exacte des mouvements propres et regroupe une charge stationnée une seule
fois par ensemble de porteurs connectés. Elle sert aussi le dernier relevé de caisse depuis le seul
index de l'observateur, sans lecture de la caisse vraie ni échéance. Les deux aperçus serveur
calculent route, arrivée, coût et capacité libre après charge existante ; le pillage ne lit aucun
stock adverse et le ramassage estime uniquement depuis le relevé possédé, même périmé. Les faits
durables déposent chez le seul joueur concerné les dépêches de prise, sabotage, perte,
récupération, ramassage et livraison, sans identité adverse ni provenance tierce. Le journal sait
les rendre en français. Aucun marqueur, cartouche, bouton ou ordre public n'est ajouté.

## Lot livré — S7c-2, lecture privée en interface

Afficher la charge des mouvements et groupes posés, puis les caisses effectivement relevées, dans
les cartouches dédiés. Consommer uniquement `PlayerView` et les contrats d'aperçu déjà servis ; ne
faire aucune jointure cliente vers les tables privées. Ne pas ouvrir les ordres de pillage ou de
ramassage : l'ouverture coordonnée du serveur et de la rose reste S8.

Les seuls mouvements propres affichent charge, capacité et mission lorsque ces lignes sont utiles.
Les charges posées restent groupées une fois par ensemble de porteurs dans les garnisons et le
cartouche de troupe. Les seuls relevés privés `present` plantent un marqueur ; `current: false`
le rend pointillé et délavé. Le cartouche en lecture donne ressources, date et âge du relevé, sans
propriétaire, provenance ni échéance. Des repères superposés se parcourent par clics successifs ;
un relevé d'absence nettoie le repère et sa sélection. Aucun geste d'ordre n'est ouvert.

## Prochain lot exact — S8, ouverture coordonnée

Ouvrir ensemble l'ordre public côté serveur, les aperçus déjà servis et les entrées d'interface de
pillage et de ramassage. Aucun de ces trois éléments ne doit devenir jouable isolément.

## Acceptation et arrêt

Les suites ciblées sont dans la file. Cas indispensables : infanterie absente/escortée ;
cible inconnue/QG/entrepôt legacy ; surplus réels répartis au prorata sans toucher
`BASE_CAP` ; mine/usine sabotée sans aucun butin, y compris à l'arrêt ; prélèvement avant
écrêtage ; ressources engagées dans les recrutements protégées et remboursement
préservé après pillage ; présence interrompue/double échéance ; livraison unique dès le franchissement
de la bordure tenue, sans atteindre le centre, pour le pilleur et le récupérateur ; pertes
partielles avec capacité au ratio d'effectif et répartition selon D2 ; contrôle changé/route impossible selon D4 ; destruction puis transfert borné, porteur déjà chargé,
nouvelle interception et livraison par le vainqueur sans double crédit ; déroute, plusieurs
bénéficiaires, priorité stable et caisse du reliquat selon D6 ; saison conclue sans effet ; même forme adverse pour une
colonne vide ou chargée.

Les changements de règle sont documentés **dans leur lot**, dans les ADR concernés et les
entrées concernées des instructions/glossaire/fiches. L'ajout des constantes s'accompagne de
`scripts/generate-a-mesurer.mjs`. S9 porte `npm run verifier` et la synthèse finale ;
aucun lot précédent ne marque tout le pillage livré ni ne lance le chantier suivant.
