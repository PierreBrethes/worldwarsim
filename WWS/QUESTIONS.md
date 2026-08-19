# Questions ouvertes

Ce qui n'est pas tranché. Rien ne se code tant que les questions marquées 🔴 ne sont pas fermées.

## 🔴 Bloquantes

**L'avantage d'isolement géographique.** Mesuré : les États-Unis gagnent 20,8 % des saisons pour
12,5 % attendus, uniquement parce que personne ne peut les atteindre. Le curseur de compensation
aggrave le problème au lieu de le corriger — il récompense l'isolement, qui est déjà un avantage.
→ [rapport de simulation](docs/technique/rapport-simulation.md)

*Le principe dégagé le 15/08 : **l'isolement se paie en rareté.*** Richesse et accessibilité
doivent aller en sens inverse. Le Japon en est la démonstration réussie — à demi coupé du monde,
sans fer ni pétrole ni riz, il doit sortir ou mourir, et son porte-avions comme ses Rikusentai
disent déjà cela. La géographie et l'atout racontent la même chose.

*Ce qui reste ouvert, précisément.* Les États-Unis sont l'inverse exact : les plus inatteignables
**et** les mieux dotés (16 gisements, seule nation sans manque). Les deux avantages vont dans le
même sens au lieu de s'annuler. La distribution des gisements ([ADR 0015](docs/adr/0015-economie-v2-ressources-localisees.md),
révision du 15/08) **borne** l'écart à 2× mais ne le supprime pas, et elle ne peut pas : les
États-Unis de 1940 ne manquaient de rien qui figure dans les cinq ressources du jeu — leurs vraies
pénuries étaient le caoutchouc, l'étain et le chrome. Inventer un manque américain serait de la
fiction au service d'un tableau.

Donc le levier n'est pas économique. Restent trois pistes, aucune tranchée : le **coût de la
distance** (déjà le levier central mesuré, 14 min / 1 000 km), l'**obligation de bâtir et défendre
des ports** pour exister ailleurs ([ADR 0013](docs/adr/0013-batiments-de-projection-sur-regions.md)),
et une **condition de victoire** qui exige d'agir loin de chez soi. C'est au simulateur refondu de
dire laquelle mord — le rapport actuel ne vaut plus une ligne depuis les ADR 0013, 0014 et 0015.

## 🟢 Tranchées par la simulation

**Le temps de trajet : 14 min pour 1 000 km.** La question était mal posée : il n'y a pas de ratio
trajet ÷ construction. Le temps de construction ne déplace l'équilibre que de quelques points ; le
temps de trajet, lui, décide tout. En dessous de 10 min/1 000 km, la Domination remporte la moitié
des saisons.

**Les outils de soustraction sont vitaux.** Sans embargo, exposition et raid, la Domination gagne
72 % des saisons contre 33 % avec. Aucun des trois n'est retirable.

**Ce n'est pas une salle d'attente.** 1,19 décision par joueur et par heure, et le vainqueur ne
prend définitivement la tête qu'à 90 % de la saison.

## 🟠 Structurantes

**Que devient un quartier général frappé ?** Depuis la révision du 15/08 de l'[ADR 0015](docs/adr/0015-economie-v2-ressources-localisees.md),
le QG est posé au lancement sur la région de la capitale — donc son **adresse est publique dès la
première minute**, pour tout le monde. Or il porte les slots de mouvement *et* la recherche. Un raid
réussi sur une capitale ne prend pas des ressources, il prend la **capacité d'agir** : c'est
frontalement la règle n°3 (un joueur écrasé reste nuisible, jamais éliminé). Le plancher d'un slot
évite la paralysie totale, mais un joueur à un slot ne joue plus.

*Piste la plus cohérente, non tranchée* : le QG se **désactive** temporairement, il ne se détruit
pas et son niveau ne redescend jamais — même vocabulaire que les avant-postes, même raison. À
trancher avant d'écrire le raid, pas après.

**La soupape anti-élimination des bâtiments de projection.** L'ADR 0013 fait dépendre chaque
domaine d'un bâtiment : sans port, pas de départ maritime. Si perdre ses ports ferme un domaine
entier, un joueur peut se retrouver enfermé chez lui — ce qui heurte la promesse qu'aucun joueur
n'est éliminé. Pistes non tranchées : port de fortune coûteux et temporaire, embarquement depuis
un avant-poste allié, ou domaine dégradé (plus lent, plus cher) plutôt que fermé.

**Le sort des cinq bâtiments d'économie.** Grille de lecture proposée : trois familles de rôle —
**économie** (QG, industrie, conscription : produire), **projection** (port, aérodrome, caserne :
partir), **renseignement** (écoute : savoir — et maison naturelle de la future identification).
Le seul qui flotte est le **centre logistique** : « réduit le temps de trajet et fixe les slots »
chevauche la famille projection. Candidat à la dissolution — ses effets deviendraient les niveaux
des bâtiments de projection (un port niveau 2 embarque plus vite). À trancher ensemble.
→ [ADR 0013](docs/adr/0013-batiments-de-projection-sur-regions.md)

**~~Les unités doivent-elles être quelque part ?~~ Tranchée par l'ADR 0014 :** les troupes
sont discrètes et localisées. Restent à chiffrer les tables de dégâts, les effectifs nominaux,
la portée des pharmacies et le nombre de troupes par nation.
→ [ADR 0014](docs/adr/0014-troupes-discretes-et-combat-sequentiel.md)

**Le rayon d'interception.** Fixe, ou fonction de la composition de la force ? S'il est trop grand,
plus aucun convoi ne passe et la carte se fige. → [08](docs/design/08-combat.md)

**Peut-on refuser le combat ?** Une force rapide devrait pouvoir se dérober au prix d'un détour.
Sans cette issue, l'interception est une punition sans contre-jeu.

**Le secret des doctrines à 2 joueurs.**
Avec deux joueurs, la doctrine adverse se déduit immédiatement. Faut-il la révéler d'emblée en
dessous de 4 joueurs, ou accepter que le secret ne serve qu'au-delà ?

**La granularité de l'occupation.**
Binaire (occupé / libre) ou progressive (pourcentage du territoire) ? La version progressive est plus
riche mais demande un découpage interne du pays, ce que l'ADR 0004 a justement voulu éviter.

**La régénération des effectifs pendant l'occupation.**
Si elle continue, l'occupation ne pèse pas assez. Si elle s'arrête, elle devient définitive et
contredit la promesse anti-élimination. Une piste : elle continue mais les effectifs produits sont
plafonnés à un usage défensif.

**La file de recrutement contourne le plafond de stockage.** La matière d'un lot en file est
débitée à la commande et rendue entière à l'annulation : la file est un entrepôt illimité que
seul le plafond de troupes borne. Sans objet tant que rien ne se pille — l'écrêtage à la perte de
stockage (ADR 0017) aura le même angle mort si la file n'est pas comptée. À trancher avec le
pillage. → constat de `consommation-continue.md`, confirmé le 19/08.

**La reprise de la file après une famine est paresseuse.** À sec, la tête n'est plus datée ; elle
repart au premier événement qui écrit un stock, pas à l'instant analytique où la nourriture
redevient positive — `driedAfterHours` (le moment exact, calculé par `settleStocks`) existe et
permettrait de la planifier si l'écart se sent en partie. Approximation assumée le 19/08 ; la
tenir à la lettre demanderait de dater les lots comme l'industrie.

## 🟡 À trancher plus tard

**L'unité spéciale par nation.** Idée retenue mais non tranchée. Elle devrait casser une règle
plutôt qu'améliorer un rôle existant, sinon c'est un dixième rôle à équilibrer pour rien. 8 nations
= 8 systèmes de plus : à réserver à 4 ou 5 nations, et après la première saison test.

*Piste la plus avancée — les parachutistes français.* Une spécialisation de l'infanterie qui
se pose **sans rien avoir sur place** : elle casse la règle que l'ADR 0013 vient de poser
(un domaine s'ouvre par un bâtiment). L'exception porte sur ce qu'il faut à l'arrivée, jamais
sur le voyage : le largage reste un mouvement, avec son fil aérien visible, parti d'un
aérodrome — sinon il perce le brouillard et l'interception d'un coup, et toute la couche
d'information s'effondre. Le réalisme fait l'équilibrage : rayon limité depuis l'aérodrome,
infanterie légère seule, effectif modeste, aucun retour possible. Un coup de main, pas une
flotte. Reste à définir la condition de déblocage. Depuis l'ADR 0014, le cadre existe : les
spécialisations sont exclusives, par la recherche au QG — pour l'infanterie mk1,
médecin OU parachutiste.

**Le pouvoir italien n'a jamais été simulé.** *Reconnaissance aérienne* est arrivé avec la révision
1940 de la fiche 06, après la campagne de mesure. Il touche au brouillard, que le simulateur ne
modélise pas — donc il est le moins fiable des huit.

**France × Hégémonie est le couple le plus faible du jeu** (1,8 % de victoires pour 4,2 % attendus).
Le correctif post-audit — coût d'avant-poste croissant avec la distance — a sur-corrigé.

**Le Royaume-Uni est sous-représenté** (8,1 % pour 12,5 %). Sa modification de colonne est trop
étroite.

**34 % des saisons se terminent avant 48 h.** Soit la saison s'arrête quand quelqu'un gagne, soit
les seuils montent pour tenir la durée annoncée.

**Le nerf du Japon.** *Doctrine du porte-avions* annule le levier de drame n°1 (l'irréversibilité).
C'est assumé et c'est fun, mais c'est le premier candidat au nerf après la première saison test.

**Le nombre de nations.** Huit aujourd'hui. Huit est déjà beaucoup à équilibrer pour un dev solo ;
six serait plus sage pour la première saison.

**L'auto-battler à plans (option B).** Gardé en réserve : plan de bataille enregistré à l'avance,
résolution déterministe. Seule façon connue de rendre de la décision tactique sans casser
l'asynchrone. À reconsidérer si le combat automatique paraît trop passif après la première saison.

**Notifications.** Push, mail, ou rien ? En asynchrone sur sept jours, « rien » signifie que les
joueurs oublient le jeu au bout de deux jours. Mais c'est de l'infra, pas du design.
