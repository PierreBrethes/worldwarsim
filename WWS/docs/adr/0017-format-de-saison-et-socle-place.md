# ADR 0017 — Format de saison, socle placé, et ce que borne un plafond de stockage

**Statut :** acceptée — **révisée le 18/08/2026 par l'[ADR 0019](0019-mouvement-libre-et-troupes-posees.md)**

> ⚠️ **Révision (27/08/2026) : le format se choisit, l'horloge devient optionnelle.**
> La durée n'est plus la clé du format. `formatOf(durationHours)` a disparu au profit de
> `formatOfSeason(season)` (`convex/constants.ts`), porte unique qui lit le champ
> `seasons.format` — `v.optional`, avec repli sur la dérivation par la durée pour les lignes
> écrites avant ce jour, le temps d'un wipe. `SeasonFormatSpec.durationHours` est devenu
> `defaultDurationHours` : c'est ce que l'accueil **propose**, plus ce qui définit le format.
> `seasons.create` prend désormais `format` (obligatoire) et `durationHours` valant 48, 168 ou
> **`null`** — sans horloge. Aucune combinaison n'est interdite : une campagne en 48 h est un
> mauvais choix, pas un choix illégal.
>
> Le pourquoi est l'alpha entre amis : une partie doit pouvoir n'avoir **aucune** horloge et se
> conclure à la main. La fin à l'heure n'existe de toute façon pas (audit du 25/08) — cette
> révision ne la crée pas, elle rend le fait honnête. Sa contrepartie est `seasons.conclude` :
> réservée au fondateur, sur une saison lancée seulement, `winnerId` nul (personne n'a gagné),
> une dépêche `seasonClosed` par belligérant, et la même sortie que la victoire de test
> (`concludeSeason`). Aucun écran n'affiche de compte à rebours sur une saison sans horloge —
> ni « ∞ », ni « 0 j ».
>
> **L'[ADR 0001](0001-saison-longue-asynchrone.md) n'est pas rouverte** : la saison reste longue,
> asynchrone et jetable. Seule la main qui la clôt change.

> ⚠️ **Révision (25/08/2026) : le socle se lit sur les gisements du pays, plus sur le format.**
> La ligne « socle » de la table ci-dessous décrit l'ancien modèle. Depuis le 25/08, la
> fondation due d'un joueur est **calculée depuis les gisements de son territoire national** —
> un extracteur par ressource sèche présente (mine pour le fer, mine pour le charbon, ferme,
> filature) et un puits *seulement si* le pays a du pétrole (États-Unis, URSS). Fonderie,
> entrepôt et arsenal sortent du socle : ils se paient. `SEASON_FORMATS[].foundation` a disparu
> au profit de `FOUNDATION_EXTRACTORS` + `foundationOwed(nation, standing)`
> (`convex/constants.ts`, `convex/regions.ts`). Le mécanisme « une clé debout consomme une
> dette » et la pose gratuite et immédiate restent tels quels. Mesuré le même jour : l'arsenal
> n'étant plus offert, les munitions s'épuisaient tôt en skirmish — **constat périmé le soir
> même** par la question 18, qui a sorti les munitions du recrutement pour les facturer au tir
> ([ADR 0018](0018-anatomie-de-la-passe-de-resolution.md) §7). Le recrutement n'en consomme
> plus, la simulation d'ouverture n'en consomme donc plus du tout, et le goulot est désormais un
> fait de combat que cet instrument ne mesure pas.

> ⚠️ **Révision (18/08/2026) : le plafond de bâtisses appartient désormais au format.**
> `BUILDING_CAP_BASE` et `BUILDING_CAP_PER_HQ_LEVEL` n'existent plus ; `buildingCap(format,
> hqLevel)` lit `SeasonFormatSpec`. En `skirmish` : 5 + 3 par palier, soit onze au lancement et
> quatorze au maximum — **quatre puis sept emplacements libres** après le socle, contre zéro puis
> un. La campagne ne bouge pas (3 + 2). Et `UNLOCKED_AT` se reprojette sur la course du format
> (`unlockLevel`) : en escarmouche, qui n'a qu'un palier, tout le catalogue s'ouvre au lancement —
> port et aérodrome compris.
>
> **Toutes les mesures d'ouverture citées plus bas datent d'avant ce changement.** Le sweep
> relancé sur le miroir corrigé donne, pour l'escarmouche assidue, **41 actions, 11 bâtiments et
> aucune connexion vide**, là où cette ADR mesurait 30 actions et une connexion vide sur douze.
> Le calibrage de `startingAlloy` à 1000 découlait de cette courbe et **n'a pas été refait** : les
> nombres du § « Deux formats, une seule économie » décrivent une pente qui n'existe plus. Les
> lire comme de l'histoire, jamais comme une consigne.

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
| durée proposée | 48 h | 168 h |
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
- ~~**En `skirmish`, le plafond de bâtiments vaut 7 au QG 2**~~ — **caduc depuis le 18/08/2026.**
  Le constat était juste et le rendez-vous qu'il fixait — « ça tient parce que le recrutement
  occupe le trou, pas parce que la construction respire ; **à surveiller quand les mouvements
  existeront** » — est arrivé exactement comme prévu. Les mouvements ont fait apparaître qu'un
  port et une caserne ne tenaient pas dans un seul emplacement libre, et le plafond est passé
  dans le format (voir la révision en tête). Le garde-fou, lui, ne bouge pas : le plafond de
  **chaque** format doit rester strictement sous le nombre de régions de la plus petite nation
  jouable — seize Länder allemands — sans quoi le découpage de Natural Earth équilibrerait la
  saison. `convex/economy.test.ts` le vérifie par format et non plus sur une constante globale.
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
