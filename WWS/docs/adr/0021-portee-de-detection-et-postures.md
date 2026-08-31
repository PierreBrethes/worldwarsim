# ADR 0021 — Portée de détection, posture de mouvement, salve d'allonge

**Statut :** acceptée (31/08/2026) — **révise l'[ADR 0008](0008-combat-par-interception.md)** et
les **§3 et §5 de l'[ADR 0018](0018-anatomie-de-la-passe-de-resolution.md)** ; le calcul de la
passe lui-même (ADR 0014, ADR 0018 §1-2-4) n'est pas rouvert

## Contexte

Le contact reposait sur `INTERCEPTION_RADIUS_KM = 200`, décrit dans sa propre ADR comme un
placeholder « non mesuré », « le trou le plus béant du modèle » (fiche 08 §11). Autour de lui,
trois rayons cohabitent sans règle commune : `SCOUT_RADIUS_KM` (60) pour ce qu'une troupe posée
relève, `LISTENING_STATION_RADIUS_KM` (120) pour une station qui n'a aucun effet, et le rayon
d'interception lui-même.

Pire, l'interception se calcule **une seule fois, au départ du mouvement** (ADR 0018 §3). Trois
conséquences vécues : la tenaille de la fiche 08 §5 est vendue comme payante alors qu'elle est
structurellement indétectable ; une colonne qui rentre chargée ne peut pas être reprise ; et rien
de ce qui arrive après le départ n'existe pour un mouvement déjà en route.

L'[ADR 0020](0020-domination-par-couleur.md) déplace le secret de *où es-tu* vers *ce qui bouge*.
Il faut donc une règle unique, visible sur la carte, qui dise qui voit quoi et où le contact se
produit.

## Décision

### 1. Une seule notion : la portée

Chaque troupe porte une **portée de détection**. Chaque bâtiment de détection posé au sol en porte
une aussi. Les trois rayons existants deviennent trois valeurs de la même règle, plus trois règles
différentes.

Un joueur voit ce qui entre dans une de ses portées. C'est le brouillard, énoncé une fois.

### 2. Le contact se produit au croisement des portées, et il se réévalue

Deux forces adverses dont les portées se croisent entrent en contact. Le calcul n'est plus fait
une fois au départ : il est **réévalué en route**, notamment **au retour**.

`INTERCEPTION_RADIUS_KM` disparaît. La tenaille redevient possible — deux mouvements convergents
peuvent réellement se rejoindre sur un troisième, ce que la fiche 08 §5 promettait et que le
calcul unique interdisait. Et une colonne qui rentre chargée de butin peut être reprise : sans
cette réévaluation, le butin arrive toujours à bon port et le pillage n'a pas d'adversaire.

L'exclusion de la cible du calcul aller (ADR 0018 §3, `except: aim.outpostId`) reste : une passe
par engagement, jamais deux pour un seul ordre.

### 3. Le contact n'est pas le combat — la posture décide

**Seule une force en posture offensive engage.** Une garnison défend sa région ; elle ne mord pas
ce qui passe à côté d'elle.

Sans cette règle, croiser une portée déclencherait un combat qu'on n'a jamais voulu, et il
deviendrait impossible de contourner, de se dérober ou de laisser passer. En asynchrone, où l'on
ne réagit pas à ce qui se produit pendant qu'on dort, un combat non refusable est une frustration
pure — et la question « peut-on refuser le combat ? » se refermerait par la mauvaise réponse.

### 4. Trois postures, chacune se paie

Une posture se choisit **par mouvement**.

| Posture | Détection | Au contact |
|---|---|---|
| **offensive** | portée pleine | engage toute force adverse à portée, garde l'initiative |
| **défensive** | portée pleine | n'engage pas, riposte normalement |
| **discrète** | portée réduite **dans les deux sens** | n'engage pas, **perd l'initiative si elle est surprise** |

Le triangle est fermé : voir loin ou être vu peu, jamais les deux. La discrétion est le prix de
l'aveuglement, et elle se paie une seconde fois le jour où l'on se fait surprendre.

C'est aussi ce qui donne son arbitrage au retour d'un pillage : rentrer discrètement pour ne pas
être repéré, en acceptant d'être surpris chargé.

**La posture a un défaut porté par l'ordre** — offensive sur une attaque ou un raid, discrète sur
un retour — et se change d'un geste. Elle ne doit pas devenir une étape de plus : lancer un
mouvement coûte déjà sept gestes (audit du 25/08 §3).

### 5. L'allonge donne une salve, jamais la victoire

Au contact, le camp dont la portée est la plus longue tire **une salve gratuite** avant que la
passe de résolution normale commence. Le camp surpris ne l'obtient pas, même s'il porte plus loin.

Une salve, pas la décision : si tirer en premier gagnait le combat, la portée deviendrait la seule
statistique du jeu et plus personne n'achèterait autre chose. Le contre-pouvoir existe déjà —
`DEFENDER_BONUS` (1,15) — et l'ADR 0014 en exigeait trois ; celui-ci en remplace un placeholder par
une règle lisible.

**Le calcul de la passe est inchangé.** `resolveEngagement` (ADR 0018 §1-2-4) n'est pas rouvert :
ordre des rôles, meilleure cible atteignable, excès perdu, déroute à 0,25, ripostes après toutes
les frappes, table unique, munitions au tir. La salve d'allonge s'ajoute **en tête**, elle ne
remplace rien. Les soixante-quinze couples de `src/domain/combat.test.ts` doivent repasser tels
quels.

### 6. La station d'écoute retrouve son effet, elle ne se retire pas

La recommandation du 30/08 — retirer la station d'écoute et le relais, jugés « nuls » — **est
caduque**. Une station d'écoute est exactement ce que cette ADR décrit : une portée de détection
posée au sol, sans capacité de blocage. C'est aussi le poste frontière de l'ADR 0020 §8.

Le code est déjà en place (`94b0899` : `LISTENING_STATION_RADIUS_KM`, `detector` dans `sightings`,
quatre détecteurs). Il n'y a rien à retirer ; il y a à brancher.

## Conséquences

- **L'ADR 0008 est révisée** : le contact ne se calcule plus à un rayon fixe unique, et il se
  réévalue. Le déterminisme et l'absence d'aléa restent entiers — la géométrie est une fonction
  pure de l'état du plateau.
- **L'ADR 0018 §3 et §5 sont révisées** ; §1, §2, §4, §6, §7 tiennent.
- **La fiche 08 §5 se referme** : la tenaille cesse d'être une promesse invérifiable.
- **Le relevé de `sightings` change de nature.** « Une troupe posée après un départ ne verra jamais
  ce mouvement » (ADR 0019 §5) était une conséquence du calcul unique. Avec la réévaluation, cette
  phrase — imprimée en permanence dans l'interface — devient fausse et doit disparaître.
- **Coût de calcul** : croisements de cercles entre forces en route, à chaque réévaluation. À 2-8
  joueurs avec les slots de mouvement de l'ADR 0006, la charge reste triviale ; c'est le fan-out
  vers `PlayerView` qu'il faut surveiller, pas la géométrie.
- **La posture n'est pas optionnelle.** Sans elle, la décision 2 rend tout combat inévitable.
  Livrer 2 sans 4 serait pire que ne rien livrer.
- **Les portées doivent être lisibles sur la carte**, sinon la règle redevient invisible et le
  joueur subit des contacts qu'il ne pouvait pas prévoir.

## Ce qu'on abandonne

- **`INTERCEPTION_RADIUS_KM` et le calcul unique au départ.**
- **L'idée qu'un rayon de détection, un rayon d'interception et un rayon de relevé sont trois
  choses différentes.**
- **Le retrait de la station d'écoute**, décidé le 30/08 et annulé ici.
- **Le combat comme conséquence automatique de la proximité** — il faut une intention.

## Questions ouvertes

- Les valeurs de portée par rôle : aucune n'est mesurée. `SCOUT_RADIUS_KM` (60) et
  `LISTENING_STATION_RADIUS_KM` (120) survivent comme points de départ, pas comme vérités.
- La réduction de portée en posture discrète : facteur unique ou par rôle.
- Faut-il un coût à changer de posture en route, ou est-ce interdit une fois parti ? Non tranché —
  la seconde réponse est plus simple et plus asynchrone.
