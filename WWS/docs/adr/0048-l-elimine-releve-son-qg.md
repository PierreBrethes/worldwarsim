# ADR 0048 — L'éliminé de la Mondiale relève son QG

**Statut :** acceptée (28/11/2026). Pierre a décidé le principe (« plus d'élimination sèche en
Mondiale »), puis validé les trois options (a) de l'enquête du 28/11 (« ok »). Les trois
recommandations de l'orchestrateur ci-dessous (§2 la recherche, §4 le QG capturé tenu et la région libre) tiennent par défaut : Pierre peut
encore les changer. **Mondiale seule** (`modeOf`) : la Blitz garde l'élimination par le QG et le
verdict `hqTaken`. Cap #668 (lot 3), issue #735 ; tranches #736, #737, #744, #738, #739, #740,
#741.

**Révise** l'ADR 0030 §3 (« Sa chute élimine »), l'ADR 0027 §1 (la boussole : l'éliminé reste
nuisible par la parole) et, dans l'ADR 0047, « Ce qu'on abandonne » (la France libre écartée).
**Supplante** les repères M2a, M16 et M17 de la fiche
`design/propositions/gameplay-deux-modes-2026-10-14.md` et la ligne Brazzaville de sa table des
atouts (fiche figée : on ne la resynchronise pas, cet ADR dit qu'ils sont dépassés). **Prend pour
modèle** le gel du QG désactivé (ADR 0046 §8).

## Contexte

Aujourd'hui la chute du QG de départ élimine : à la capture, `falls = isBuilding(site) &&
site.homeOf === loser._id` (`convex/captures.ts`), puis `leaveTheWar` (`convex/players.ts`) pose
`defeated` et `eliminatedAt`, remet le reste aux irréguliers (`toIrregulars`), et peut conclure la
saison par le verdict `hqTaken`. Quatre textes l'écrivent : ADR 0030 §3, ADR 0027 §1, ADR 0047
(la France libre écartée *parce qu'*elle donnait une seconde vie) et les repères M2a, M16, M17 de
la fiche.

Pierre n'en veut plus en Mondiale : une saison de sept jours où l'on est sorti le deuxième jour,
et où l'on observe cinq jours, est la pire expérience du jeu. Le joueur garde ses troupes et ses
avant-postes ; il relève son QG sur son sol, après 12 h.

Retirer seulement l'élimination ne suffit pas, et la relève n'est **pas** déjà offerte, contrairement
à ce qu'on a cru. À la chute, `releaseBuilding` écrit `settledFoundation` : la dette du QG de
départ est acquittée, `owedFreely` (`convex/constructions.ts`) rend `false`, et une relève
passerait par la file payée, au prix d'un QG neuf. Et la pose ordinaire accepte aussi la portée
d'un avant-poste, donc un sol qui n'est pas national. Il faut une règle de relève, écrite.

## Décision

### 1. Le QG tombe, le joueur reste

En Mondiale, la chute du QG de départ **n'élimine plus**. Ce qui tombe est ce que la chute fait
déjà au QG et au stock : le QG passe au capteur (`capturedAt`, niveau diminué d'un, plancher 1),
et le stock au-dessus du seuil (`BASE_CAP`) passe au capteur (`seizeAboveTheSeal`). Ce qui ne
tombe plus : les bâtiments, avant-postes, troupes, colonnes et chantiers **restent** au joueur
(plus de `toIrregulars`, plus de siège irrégulier à la chute). Les captures en cours et les
sièges gardent leur cours ; le joueur garde ses points stratégiques et sa course aux Sept ; son
sol national reste le sien (ADR 0020). Il ne finit plus la saison par `hqTaken` : la fin par le
QG est propre à la Blitz.

La **capitulation** est inchangée : même sortie qu'aujourd'hui, qui garde son sol.

### 2. La vacance : 12 h gelées, sans QG

De la chute à la relève, le joueur est **sans QG**. Le modèle est le QG désactivé (ADR 0046 §8) :
la production et le stock continuent, mais ce qui passe par le QG attend.

- Aucune pose, aucune élévation ne part sans QG (`HQ_FIRST`) ; le chantier en cours se gèle
  (`frozenMs`, sur le patron de la frappe) et reprend à la relève ; les lots de troupes de même.
- **Recherche** (recommandation retenue par défaut) : la carte commencée **finit**, aucune
  nouvelle ne démarre sans QG.
- Une tournée basée au QG perd sa base : elle bascule sur l'entrepôt, sinon elle attend. Les
  troupes postées au QG sont déjà au sol (`groundGarrison`) : rien à déplacer.
- Un joueur sans QG se **voit** : la dépêche de chute le dit à lui et, comme l'élimination
  aujourd'hui, à qui connaît le QG ; la vue sert la date de chute (`players.hqFellAt`, optionnel)
  et le décompte de la relève.

### 3. La relève : gratuite après 12 h, niveau 1, sans troupes offertes

Douze heures après la chute (`hqFellAt` + 12 h), le joueur **relève son QG** :

- **Gratuite** : ni acier ni charbon. **Niveau 1** (`HQ_LEVEL_AT_LAUNCH`). **Sans troupes
  offertes** : `garrisonTheGift` (l'infanterie et le camion du premier QG) ne tourne pas.
- **Posée à l'instant**, sans file : une branche « relève » explicite dans `start`
  (`convex/constructions.ts`), gardée par la fonction pure de #736. `owedFreely` reste intact : le
  premier QG se pose comme avant, la relève est un autre chemin et ne passe par aucune dette
  fictive.
- **Le préavis** : l'échéance (`runAt(hqFellAt + 12 h)`) relit sa règle (invariant « Échéance »)
  et prévient le joueur ; la règle de refus se lit à l'écran comme au serveur, avec la date de
  disponibilité (ADR 0015 : rien n'est grisé, le refus est dit).
- **À la relève**, `hqFellAt` est effacé, les files gelées reprennent (`resume`), la caméra suit
  (`followCenter`).

### 4. Où : toute région libre de son pays

Le QG se relève dans **toute région libre de son pays** (`homeCountryOf(nation)`), par la pose
ordinaire, hors portée d'avant-poste. **Libre** = région dont la **couleur retenue**
(`heldRegions`, `players.linkage`) **n'est pas tenue par un autre pays**. Un sol national
entièrement tenu par d'autres est un **refus dit** (code d'erreur nommé, texte dans `fr.ts`).
Le joueur n'a donc pas à reprendre son ancien QG pour continuer ; il peut le faire, mais ce n'est
plus une condition.

- **Un QG capturé, tenu par le capteur, n'empêche pas la relève** (recommandation retenue par
  défaut) : l'ancien QG reste au capteur, définitivement tant qu'il le tient. Le refus
  `HQ_ALREADY_BUILT` ne compte que les QG propres (`capturedAt === undefined`).
- Aucune distance minimale à l'ancien QG : « N km au moins » ajoutait un chiffre sans règle qui le
  porte.

### 5. Les chutes se répètent, sans limite

Chaque chute est la même : le stock au-dessus du seuil passe au capteur, la vacance dure 12 h,
la relève ramène au niveau 1. Aucun compteur, aucune « seconde vie unique ». `hqFellAt` est
écrasé à la chute suivante.

### 6. Le bug latent : reprendre l'ancien QG puis le reperdre

`falls` doit exiger `capturedAt === undefined`. Sans cela, qui reprend son ancien QG (`homeOf`
toujours à son nom) puis le reperd ferait tomber un joueur dont le QG relevé est debout. Corrigé
à #736, avec le test du QG relevé qui retombe.

### 7. Ce que la règle laisse tel quel, et ce qu'elle cite

- **`levelOf`** (`convex/buildingReads.ts`) compte le QG captif (`hqLevel > 0` sans QG propre) :
  un capteur porte donc le niveau de l'ancien QG qu'il tient. On le laisse ; le niveau d'un QG
  capturé est déjà celui de la ligne « niveau -1, plancher 1 ».
- **Le QG qu'on ne rase pas** (`src/domain/construction.ts`, `demolitionRefusalOf` : « sa destruction
  serait une révision de "jamais éliminé" ») : le QG reste non rasable, mais la raison s'inverse.
  Sans élimination, le commentaire n'a plus son motif : on le relit à #741, et si l'on garde la
  règle, c'est que raser son QG pour le relever ailleurs, gratis, serait un déplacement du QG à
  coût nul (à trancher alors, pas ici).
- **ADR 0004** : « politique anti-élimination » n'est qu'une mention (la nation d'origine ne
  s'annexe pas) ; aucune règle d'élimination à réviser.
- **ADR 0013** : la soupape anti-élimination des ports (un joueur enfermé chez lui sans port) **reste
  ouverte** ; la relève du QG n'y répond pas, elle ne rend aucun port.
- **ADR 0047** (France libre) : voir « Ce qu'on abandonne ».
- **Brazzaville** (fiche, table des atouts : « votre QG pris, il se relève ici au niveau 1, une
  fois par saison ») : la relève générale la supplante. Ce n'était pas un atout codé (la France
  est sans atout, ADR 0047 §1) ; la ligne disparaît de la fiche à sa lecture, et un atout
  français futur ne portera plus la relève.
- **M2a** (« QG capturé = éliminé ») : supplantée en Mondiale, vraie en Blitz. **M16** (le reste
  devient siège irrégulier, capturable et pillable par tous) : supplanté, le joueur garde son
  reste ; le siège irrégulier ne naît plus d'une chute en Mondiale. **M17** (« L'éliminé
  observe ») : ne concerne plus qu'un joueur qui capitule, ou la Blitz.
- **ADR 0027 §1** : l'éliminé « nuisible par la parole » est un joueur qui capitule ; en Mondiale,
  celui qui perd son QG joue encore. Le « mouvement de résistance viendra peut-être » est
  accompli par la relève.
- **Code à corriger** : le commentaire de `convex/captures.ts` (« Un QG de départ tombé élimine
  son joueur »), repris à #737 ; le tampon client `fr.stamps.hqFallen` existe déjà, on le réutilise
  avant de nommer la dépêche.

## Conséquences

- Huit tranches, dans l'ordre : l'ADR (#735) ; la règle pure de relève et le correctif de `falls`
  (#736) ; la chute sans élimination (#737) ; le gel sans QG (#744) ; la relève au serveur (#738) ;
  le client (#739) ; les bots (#740) ; le nettoyage (#741).
- **Schéma** : `players.hqFellAt` en `v.optional`, lu avec un défaut. `eliminatedAt` reste pour la
  Blitz et la capitulation.
- **Tests** : ceux de `convex/captures.test.ts`, `heaps.test.ts`, `view-linkage.test.ts` et
  `dev.test.ts` qui supposent l'élimination en Mondiale sont réécrits ; l'élimination Blitz garde
  les siens.
- **Bots** : un bot pose son QG à la capitale seulement, et l'espacement refuse tant que l'ancien
  QG est là : sans règle neuve, il ne se relèverait jamais (#740).
- **Édition finale** : le verdict `hqTaken` n'est plus prononcé en Mondiale ; ce que la une
  raconte d'un QG tombé se tranche à #739.

## Ce qu'on abandonne

- **L'élimination sèche en Mondiale** : le QG pris ne sort plus un joueur d'une saison de sept
  jours. On perd la netteté d'une fin, et le sens de « se gagne par les QG » (ADR 0047) : il se
  gagne maintenant par les QG *et* le sol.
- **Le risque d'agonie** (relevé par le coordinateur, retenu) : les chutes sont sans limite, donc
  un joueur dominé peut tomber, relever, retomber douze heures plus tard, jusqu'à la fin de la
  saison, sans jamais compter. Le garde-fou est dans la règle (chaque chute coûte le stock au-dessus
  du seuil, gèle 12 h, ramène au niveau 1), pas dans un nombre. **À mesurer** par une série de bots
  après le code (#740) : durée moyenne d'une agonie, part des joueurs tombés plus de trois fois,
  effet sur la durée des saisons. Si elle montre une agonie, la réponse sera une règle (une relève
  de plus en plus tardive, ou la deuxième chute qui élimine), jamais un chiffre posé à l'œil.
- **La France libre, écartée par l'ADR 0047 pour la seconde vie** : la raison tombe en partie,
  puisque *tout* joueur a désormais une seconde vie. Elle reste écartée, mais pour un autre
  motif : un atout qui ne casse plus rien, la relève étant générale.
- **L'éliminé qui observe** (M17) en Mondiale, et le siège irrégulier à la chute (M16).
- **Une relève payée comme un QG neuf** (60 acier, 40 charbon) : elle punissait un joueur déjà
  dépouillé de son stock. **Une relève à N km de l'ancien QG**, **sous un avant-poste** :
  un chiffre sans règle, ou un sol qui n'est pas national.
