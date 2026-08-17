# ADR 0017 — Format de saison, socle placé, et ce que borne un plafond de stockage

**Statut :** acceptée

Prolonge [0001](0001-saison-longue-asynchrone.md) (saison longue asynchrone) et
[0015](0015-economie-v2-ressources-localisees.md) (économie v2) sans les rouvrir : le quartier
général reste l'unique étranglement, et aucune quantité ne se compte en régions.

## Contexte

`WWS/simulation/opening/` a mesuré l'ouverture telle qu'elle était codée — les huit ressources,
l'extraction par gisement, les trois chaînes, les plafonds, le chantier unique, le recrutement,
tout copié de `convex/constants.ts` et de `src/domain/economy.ts`. Trois constats, tous
reproductibles par `node run.mjs`.

**Sur les treize bâtiments abordables au lancement, un seul ne tuait pas la saison.** L'alliage
est la monnaie universelle, sa seule source est la fonderie, et le socle minimal — mine de
charbon, mine de minerai, fonderie — coûtait 110 d'alliage (`BUILDING_SPEC` : 30 + 30 + 50)
quand le kit en donnait 100 (l'ancien `STARTING_STOCK`). La seule ouverture survivante était
mine de charbon → fonderie → mine de minerai, dans cet ordre exact, et elle terminait à zéro.
Une ferme à 20 d'alliage suffisait à perdre la saison, **sans que rien à l'écran ne le dise**.

**Une saison de 48 h offrait 8 actions à un joueur assidu**, dont 4 connexions sur 12
strictement vides. Ce n'est pas un défaut de rythme : c'est un défaut de ligne de départ. Le
plafond de bâtiments n'y était pour rien — le faire passer de 8 à 12 au QG 2 ne changeait
aucune mesure.

Un troisième problème est apparu pendant l'implémentation, et il n'était pas prévu : le kit
mesuré vaut 1000 d'alliage pour un `BASE_CAP` de 400. Dans les mesures d'origine, l'entrepôt
qui porte le plafond à 1000 (`STORAGE_CAP_PER_LEVEL`) était **donné**. Placé par le joueur, il
arrive plusieurs heures trop tard, et 600 d'alliage s'évaporaient au premier règlement — encore
une fois sans un mot à l'écran, exactement le défaut que le socle existe pour tuer.

## Décision

### 1. Deux formats, une seule économie

`skirmish` (48 h) et `campaign` (7 j) partagent taux d'extraction, chaînes, coûts et durées. Ce
qui change est **où l'on entre dans la courbe**, jamais sa pente : niveau du QG au lancement,
plafond de QG, socle dû, alliage de départ. Tout ce qui diffère vit dans la table unique
`SEASON_FORMATS` de `convex/constants.ts`, lue par `seasons` et servie aux écrans par
`view.playerView` ; un deuxième taux d'extraction ou un deuxième coût apparaissant sous une clé
de format serait le doublon que la table existe pour interdire.

| | `skirmish` | `campaign` |
|---|---|---|
| durée | 48 h | 168 h |
| QG au lancement | 2 | 1 |
| plafond de QG | 3 | 5 |
| socle | mine, mine, fonderie, entrepôt, ferme, arsenal | mine, mine, fonderie |
| alliage de départ | 1000 | 500 |

**L'alternative écartée est de multiplier le temps** — compresser une saison longue en 48 h en
accélérant tout. Elle est refusée parce que **le sommeil ne se compresse pas**. À 3,5×, une nuit
de huit heures coûterait vingt-huit heures de jeu, et la fenêtre de repos de sept heures par
vingt-quatre (fiche 07) deviendrait un objet sans signification. C'est le raisonnement à relire
avant de réessayer.

Les deux valeurs d'alliage sont **mesurées, pas choisies** (`node run.mjs --sweep`, joueur
assidu, plan économie) : en `skirmish`, 800 donne 24 actions, 1000 en donne 30, 1300 en donne 34
et 1800 en donne 34 aussi — au-delà de 1300 c'est le plafond de troupes qui répond, pas le
portefeuille. Le 500 de `campaign` est lu sur ses propres 48 premières heures, au point où les
connexions vides cessent de tomber, et il est **fragile, sciemment** : sur la saison entière le
balayage n'est pas monotone (35 actions à 420, 28 à 800), parce que là l'ordre des clics pèse
plus que le paramètre. C'est un symptôme, jamais un réglage — le paramètre est gravé dans
`SEASON_FORMATS`, la non-monotonie reste à expliquer par la politique de jeu, pas par la table.

### 2. Le socle est placé, pas offert

Le joueur choisit les régions de son socle ; il n'en paie ni le prix ni l'attente. Tant qu'une
clé du socle du format n'est pas posée, `constructions.start` la facture zéro et la termine
immédiatement — **toutes les autres règles de pose continuent de s'appliquer sans exception** :
gisement requis, une bâtisse par région, pays d'origine, plafond de bâtiments porté par le QG,
chantier unique. Aucune pose automatique : une saison lancée dont le socle n'est pas posé est un
état normal, et l'écran le dit (`fr.construction.foundationNotice`, en tête du panneau de
placement). Le QG, lui, reste planté au niveau du format dès le lancement (ADR 0015) : il
n'entre pas dans ce mécanisme.

Le pourquoi est mesuré : après le socle, le joueur assidu en 48 h prend **30 actions pour 1
connexion vide sur 12**, contre 8 actions pour 4 connexions vides avant. Et sur les quinze
bâtiments, **aucun premier coup n'est fatal** — contre douze qui l'étaient.

Trois alternatives sont écartées :

- **Le rail scripté.** Il supprime la seule décision de l'ouverture — le choix des régions — et
  ne protège que le début, alors que le budget d'emplacements serre toute la saison. Le socle
  placé rend déjà tout premier coup non fatal, sans imposer d'ordre.
- **Les récompenses d'étape.** Elles récompensent la fréquence de connexion, ce que la fenêtre
  de repos contient, et sous leur forme habituelle elles violent « un bonus casse une règle,
  jamais un pourcentage ».
- **Les chantiers en parallèle.** Sans effet tant que l'alliage est le goulot, et il l'est
  partout : dans les mesures d'origine, chaque saison simulée finissait avec 20 à 40 d'alliage
  pendant que **toutes les autres ressources étaient à leur plafond**. Après le socle, le
  constat tient toujours là où le joueur joue jusqu'au bout — 18 d'alliage en `skirmish`, 91 en
  `campaign` avec nourriture, charbon et minerai à 400.

### 3. Le plafond de stockage borne ce qui entre, jamais ce qui est détenu

Un plafond limite ce qui **entre** dans les réserves ; il ne rogne pas un stock déjà là. Dans
`settleStocks` (`src/domain/economy.ts`), la barre est `max(plafond, stock d'ouverture)` : rien
ne peut *monter* au-dessus du plafond, et un stock qui commence au-dessus y reste jusqu'à ce
qu'il soit dépensé. Il repasse sous le plafond de lui-même, puisque chaque fenêtre s'ouvre sur
ce que la précédente a laissé. Le remboursement d'un lot annulé (`resources.credit`) ne rogne
plus non plus : il rend ce qu'un débit a pris, il ne peut hisser personne au-dessus d'où il
était.

**Et perdre une capacité de stockage écrête le surplus à cet instant.** Quand un entrepôt ou un
dépôt tombe, ce qui dépasse le nouveau plafond est perdu, une fois, au moment de la perte.
C'est un **événement**, pas une règle continue. Cette moitié-là **n'est pas codée** — voir les
conséquences.

L'alternative recevable était de **ramener le kit à 400**, la valeur de `BASE_CAP`. Elle disait
quelque chose de juste : que le problème est le prix des choses, pas la taille du portefeuille.
Elle est écartée pour garder la mesure — 400 d'alliage ramène la ligne de départ sous le palier
mesuré, et l'ouverture reprend ses connexions vides. Ce n'est pas une fausse piste, c'est un
arbitrage entre deux lectures du même chiffre.

## Conséquences

- **Le « palier réel à 980 d'alliage » relevé pendant la calibration était un artefact du
  plafond** : au-delà, le surplus disparaissait au premier règlement, donc la courbe plafonnait.
  Une fois le plafond corrigé, la vraie marche est à 1300, où c'est le plafond de troupes qui
  répond, pas le portefeuille.
- **En `skirmish`, le plafond de bâtiments vaut 7 au QG 2** (`buildingCap` : 3 + 2 × 2) —
  exactement le QG plus les six clés du socle. Le joueur n'a donc **aucun emplacement libre
  avant le QG 3**. Mesuré : ça tient (30 actions, 1 connexion vide) parce que le recrutement
  occupe le trou, pas parce que la construction respire. À surveiller quand les mouvements
  existeront. Le test `leaves every format room for its foundation, its headquarters and one
  free choice` (`convex/economy.test.ts`) grave la marge au plafond de QG du format.
- **L'écrêtage à la perte de stockage** — sans lui, piller un entrepôt ne coûterait rien à sa
  victime, alors que la fiche 02 en fait une cible. Écrit depuis, sur le prompt
  `WWS/docs/prompts/code/ecretage-et-palier.md` : `clipToCapacity` dans `src/domain/economy.ts`,
  porte unique `resources.clipToStorage` côté Convex. **Aucun appelant aujourd'hui, délibérément**
  — rien ne détruit ni ne démonte un bâtiment ; le vrai appelant vient avec le pillage, et la
  règle existe avant lui pour ne pas être réinventée en vitesse au milieu d'un autre sujet,
  comme le sens du plafond l'a été. Corollaire ouvert et non tranché : un plafond qui ne rogne
  plus rend **permanent** le dépassement que la file de recrutement permet déjà — les matières
  d'un lot en file sont hors plafond et reviennent entières à l'annulation. C'est le sujet du
  pillage, pas celui-ci.
- **Le seuil MK2 est relatif au QG de lancement du format**, donc 3 en `skirmish` et 2 en
  `campaign`. Écrit dans le même passage : une seule constante,
  `TIER_2_LEVELS_ABOVE_LAUNCH = 1`, dérivée par `tier2HqLevel(format)` ; `view` et `workshop`
  servent le seuil effectif, l'écran ne lit plus la constante. L'ancien `TIER_2_HQ_LEVEL = 2`
  ouvrait le MK2 à la première minute d'une saison courte, ce que personne n'avait décidé.
- **`WWS/simulation/opening/constants.mjs` est un miroir de `convex/constants.ts`.** Toute
  valeur gravée ici qui bouge l'oblige à suivre dans le même passage, sous peine de faire mentir
  l'instrument — le garde-fou de `run.mjs` (48 h, joueur assidu : au moins 25 actions, au plus
  une connexion vide sur douze) ne vaut que si le miroir est à l'heure. `node verify.mjs` compare
  les deux fichiers valeur par valeur et sort en erreur à la première dérive ; ce qu'il ne sait
  pas lire, il le déclare non vérifié plutôt que réussi.

## Ce qu'on abandonne

**Une seule ligne de départ pour toutes les saisons.** Il faut désormais se demander, pour
chaque règle d'ouverture, de quel format on parle — et se retenir de répondre en dédoublant un
chiffre d'économie. La discipline tient à une seule chose : `SEASON_FORMATS` contient l'entrée
dans la courbe, jamais sa pente.

**La lecture simple « un plafond borne un stock ».** Elle devient « un plafond borne une
entrée, et une perte de capacité écrête une fois » — deux règles au lieu d'une, dont la seconde
attend son premier appelant. C'est le prix de ne pas confisquer silencieusement ce qu'un joueur
a déjà payé.

**Le socle comme dépense.** Six bâtiments offerts en `skirmish`, ce sont six décisions d'achat
retirées de la saison : le socle protège du blocage en dépensant des choses à faire. Chaque clé
qu'on lui ajoutera retirera une action de plus — avec l'arsenal *et* la caserne au socle, le
joueur assidu retombe à huit connexions vides sur douze. La table n'est donc pas un endroit où
l'on ajoute par confort.
