# Prompt Claude Code — l'ADR du format de saison, du socle placé et du sens du plafond

Lis `WWS/docs/adr/README.md` pour la convention de rédaction, puis les ADR `0001`
(saison longue asynchrone) et `0015` (économie v2) — les deux que celle-ci prolonge sans les
relitiger. Lis aussi `WWS/docs/prompts/code/socle-au-lancement.md`, qui est le prompt dont ce
travail est la trace, et `WWS/simulation/opening/README.md` pour l'instrument qui a mesuré.
Ne commit pas, ne push pas.

Tu écris **`WWS/docs/adr/0017-format-de-saison-et-socle-place.md`**. Tu ne modifies aucun code.

## Ce que l'ADR grave

Trois décisions, déjà codées, jusqu'ici sans trace écrite. La troisième a été prise en passant
pendant l'implémentation et c'est précisément pour ça qu'elle doit être gravée.

### 1. Deux formats, une seule économie

`skirmish` (48 h) et `campaign` (7 j) partagent taux d'extraction, chaînes, coûts et durées.
Ce qui change est **où l'on entre dans la courbe** : niveau du QG au lancement, plafond de QG,
socle, alliage de départ.

L'alternative écartée — multiplier le temps pour compresser une saison longue en 48 h — est
refusée parce que **le sommeil ne se compresse pas**. À 3,5×, une nuit de huit heures coûterait
vingt-huit heures de jeu, et la fenêtre de repos de sept heures par vingt-quatre (fiche 07)
deviendrait un objet sans signification. Écris-le : c'est le raisonnement qui empêchera de
réessayer.

### 2. Le socle est placé, pas offert

Le joueur choisit les régions de son socle ; il n'en paie ni le prix ni l'attente. Toutes les
autres règles de pose continuent de s'appliquer — gisement requis, une bâtisse par région, pays
d'origine, plafond de bâtiments, chantier unique. Aucune pose automatique : une saison lancée
dont le socle n'est pas posé est un état normal, et l'écran le dit.

Le pourquoi, mesuré, et il doit figurer dans l'ADR :

- Avant le socle, **sur les treize bâtiments abordables au lancement, un seul ne tuait pas la
  saison**. Une ferme à 20 d'alliage suffisait, sans que rien à l'écran ne le dise.
- Une saison de 48 h offrait **8 actions** à un joueur assidu, dont **4 connexions sur 12
  strictement vides**. Après : 30 actions, 1 connexion vide.
- Les alternatives écartées : le rail scripté (il supprime la seule décision de l'ouverture et
  ne protège que le début, alors que le budget d'emplacements serre toute la saison), les
  récompenses d'étape (elles récompensent la fréquence de connexion, ce que la fenêtre de repos
  contient, et sous leur forme habituelle violent « un bonus casse une règle, jamais un
  pourcentage »), les chantiers en parallèle (sans effet tant que l'alliage est le goulot — et à
  la fin de chaque saison mesurée l'alliage est à 20-40 pendant que **toutes les autres
  ressources sont à leur plafond**).

### 3. Le plafond de stockage borne l'entrée, jamais ce qui est détenu

Un plafond limite ce qui **entre** dans les réserves. Il ne rogne pas un stock déjà là.

**Et perdre une capacité de stockage écrête le surplus à cet instant** : quand un entrepôt ou un
dépôt tombe, ce qui dépasse le nouveau plafond est perdu, une fois, au moment de la perte. C'est
un événement, pas une règle continue.

Cette moitié-là est la décision de Pierre et elle n'est **pas encore codée** — dis-le
explicitement dans la section des conséquences, avec un renvoi au prompt qui la portera. Sans
elle, piller un entrepôt ne coûterait rien à sa victime, alors que la fiche 02 en fait une cible.

Le pourquoi : le kit de départ du format court vaut 1000 d'alliage pour un `BASE_CAP` de 400.
L'entrepôt qui portait le plafond à 1000 était **donné** dans les mesures d'origine ; placé par
le joueur, il arrive trop tard, et 600 d'alliage s'évaporaient au premier règlement sans un mot
à l'écran. L'alternative — ramener le kit à 400 — était recevable et disait quelque chose : que
le problème serait le prix des choses et non la taille du portefeuille. Elle a été écartée pour
garder la mesure ; **note-la comme telle**, pas comme une fausse piste.

## Conséquences à écrire

- Le « palier réel à 980 d'alliage » relevé pendant la calibration **était un artefact du
  plafond**. La vraie marche est à 1300, où c'est le plafond de troupes qui répond.
- En `skirmish`, le plafond de bâtiments vaut 7 au QG 2 — exactement le QG plus le socle. Le
  joueur n'a **aucun emplacement libre avant le QG 3**. Mesuré : ça tient (30 actions, 1
  connexion vide) parce que le recrutement occupe le trou, pas parce que la construction
  respire. À surveiller quand les mouvements existeront.
- Le MK2 était ouvert dès le lancement en `skirmish` (`TIER_2_HQ_LEVEL = 2`, départ au QG 2).
  Décision prise : le seuil devient **relatif au QG de lancement du format**, donc 3 en
  `skirmish`. Ce n'est pas codé — même traitement que le point 3, un renvoi et pas un silence.
- `WWS/simulation/opening/constants.mjs` est un miroir de `convex/constants.ts` : toute
  modification des valeurs gravées ici l'oblige à suivre, sous peine de faire mentir l'instrument.

## Critères d'acceptation

- L'ADR suit la forme des voisines : contexte, décision, conséquences, alternatives écartées.
- Chaque nombre cité est rattaché à sa source — `SEASON_FORMATS`, `BASE_CAP`,
  `WWS/simulation/opening/`. Aucun chiffre orphelin.
- Les deux décisions **non codées** (l'écrêtage à la perte de stockage, le seuil MK2 relatif)
  sont nommées comme telles.
- `WWS/docs/adr/README.md` gagne sa ligne.
- Aucun terme banni (`tick`, `temps réel`, `micro`, `base`, `rush`).

## Ce que tu ne fais pas

Tu ne touches à aucun fichier de `convex/`, `src/` ni `WWS/simulation/`. Tu ne rouvres ni
l'ADR 0001 ni l'ADR 0015 : le quartier général reste l'unique étranglement, aucune quantité ne
se compte en régions. Si l'écriture te fait penser que l'une des deux est contredite par ce qui
est codé, **arrête-toi et dis-le** — c'est une décision de design, pas de rédaction.
