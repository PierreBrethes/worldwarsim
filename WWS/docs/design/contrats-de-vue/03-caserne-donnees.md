# Annexe au contrat 03 — Jeu de données réel pour la maquette

**Règle : ce fichier est la SEULE source de texte et de chiffres de la maquette.** Chaque
chaîne vient verbatim de `src/i18n/fr.ts`, chaque nombre est calculé depuis
`convex/constants.ts`. S'il manque une donnée pour remplir un cadre, la demander — ne jamais
l'écrire soi-même. (C'est la leçon de la v1 du journal : toponymes et distances inventés.)

## Scénario

> **Correctif du 01/09 (v3)** : les régions françaises du jeu sont des **départements**
> (`public/region-index.json`) — « Normandie » n'existe pas. Une région ne porte qu'une
> bâtisse : caserne (Ardennes) et baraquements (Meuse) sont deux départements distincts.

France, quartier général **niveau 1** (début de partie — le cas le plus fréquent) :
une caserne (Ardennes, niveau 1), des baraquements (Meuse, niveau 1), **ni aérodrome ni port**.
`chainSpeed(1) = 1.00` → les durées sont les durées de base.

Stocks du scénario (pour tous les « x / y » — un stock n'apparaît jamais ailleurs) :
alliage `320`, nourriture `114`. Ex. : coût d'infanterie « `18 / 320` », niveau 2 des
baraquements « `alliage 45 / 320` + `nourriture 72 / 114` ».

## Tête de vue

- En service : `3` · en file : `2` · rangée de cases : 3 pleines, 2 mi-encrées, 5 vides ·
  « `plafond 10 troupes` » (billets niveau 1 → `troopCap = 10`)
- Note italique (longue — elle doit tenir) : « `Les hommes ne sont pas une ressource : une
  troupe coûte des matières, et l'armée est bornée en nombre de troupes par les baraquements.
  La file compte dans le plafond.` »
- Ligne baraquements : « `Baraquements` · `en Meuse` · `niveau 1` » + élévation
  (coût niveau 2 : `alliage 45` + `nourriture 72`, `54 min` — `buildCost('billets', 2)`).

## En-tête de la modale (59a — plus de sections de domaine)

- « `Caserne` » · « `en Ardennes` » · « `niveau 1` » + élévation (voir ligne baraquements
  pour le modèle de ligne d'élévation ; coût caserne niveau 2 : `alliage 72` +
  `nourriture 54`, `1 h 12`).
- Les bandeaux « `bloqué : aucun aérodrome` » / « `aucun port` » **ne sont plus dans cette
  vue** (60b — le catalogue des domaines sans bâtiment vit dans l'abaque, contrat 06).
- La modale caserne ne montre que les **3 cartes terre** ; aérodrome les 3 air ; port les
  3 mer.

## Garnison du site (61 — données du scénario)

Troupes stationnées à la caserne des Ardennes, cochables :

- `infanterie` `MK1` — « `effectif 32 / 50` » (entamée) — « `ravitaillée` »
- `infanterie` `MK1` — « `effectif 50 / 50` » — « `ravitaillée` »
- `transport terrestre` `MK1` — « `effectif 24 / 24` » — « `ravitaillé` »

L'effectif est `fr.troops.strength`, **sans unité** (tranché 01/09) : l'unité vit sur la
carte de rôle, pas sur la ligne de garnison.

Deux cochées (1 infanterie + 1 VTC) : **allure « `colonne motorisée` »** (`fr.garrison.paces`
— tranché 01/09 ; « motorisé / à pied » est le mot de la visée, `fr.aim.paces`, pas celui de
la garnison ; 1 fantassin ≤ 2 sièges par VTC, `LAND_SEATS_PER_TRANSPORT`). L'infanterie
seule : « `colonne à pied` ». **Pas de compteur de
places d'emport dans une pile pure terre** : l'emport (`LIFT_CAPACITY`) ne concerne que la
traversée mer / air — cargo `6` places, transport aérien `2` — il ne se montre donc que
dans les modales de port et d'aérodrome. Hors ravitaillement (variante) : « `hors
ravitaillement — entretien ×2` ». Une troupe en mouvement n'apparaît pas dans la liste.

## Les neuf cartes de rôle (France, QG 1)

Libellés : rôle = `fr.roles[role].one`, équipement = plaque France, effectif =
`NOMINAL_STRENGTH` + `fr.strengthUnits`, coût/durée = `COST_BY_ROLE` (QG 1 : valeurs de
base), fort/faible = `fr.unitSheets`. « en service : n » = roster du scénario.

| Rôle | Équipement (FR) | Coût | Formation | Effectif | Fort contre | Faible contre | En service |
|---|---|---|---|---|---|---|---|
| `infanterie` | `soldat` (MK1) / `bazooka` (MK2) | MK1 `18` · MK2 `29` alliage | MK1 `20 min` · MK2 `32 min` | `50 soldats` / MK2 `30 soldats` | `garnisons, avant-postes` | `blindé, bombardier` | 3 |
| `blindé` | `char léger R35` / `char lourd B1 bis` | `95` · MK2 `152` | `1 h 10` · MK2 `1 h 52` | `12 chars` / MK2 `6 chars` | `infanterie, garnisons` | `bombardier, infanterie MK2` | 0 |
| `transport terrestre` | `VTC` | `40` | `45 min` | `24 camions` | — support : « `Ajoute de la capacité de pile : projette l'infanterie plus loin.` » | | 0 |
| `chasseur` | `Dewoitine D.520` | `110` | `1 h 30` | `12 appareils` | `bombardier, transport aérien` | `escorte` | 0 |
| `bombardier` | `LeO 451` | `160` | `2 h` | `9 appareils` | `blindé, avant-postes, navires` | `chasseur` | 0 |
| `transport aérien` | `D.338` | `90` | `1 h 15` | `6 appareils` | — support : « `Vitesse maximale, capacité minimale.` » | | 0 |
| `escorte` | `Le Fantasque` | `175` | `3 h` | `6 navires` | `cargo, mouvements maritimes` | `bombardier` | 0 |
| `cargo` | *(pas d'équipement FR — pas de ligne)* | `120` | `1 h 40` | `8 navires` | — support : « `Commerce avec les pays neutres et logistique lourde.` » | | 0 |
| `porte-avions` | `2 appareils` | `430` | `8 h` | `24 appareils embarqués` | — support : « `Infrastructure mobile : déplace le point de lancement aérien.` » | | 0 |

Chaînes d'accompagnement, verbatim :

- Étiquettes du registre : « `coût` », « `formation` », « `fort contre` », « `faible contre` »
- Note support : « `Ne combat pas, mais peut se faire détruire ou intercepter.` »
- Bouton : « `+ 1 troupe` »
- Sélecteur de marque : « `MK1` » / « `MK2` » ; MK2 verrouillé au QG 1, infobulle :
  « `quartier général niveau 2 requis` »
- **Tampon du blindé** (QG 1) : « `verrouillé — quartier général niveau 2 requis` »
- Air et mer : les cartes existent sous l'en-tête bloqué de leur section — la section porte le
  blocage, pas chaque carte.

## File de production (colonne latérale)

- En-tête : « `files de production` »
- Site : « `Ardennes — 2 lots en file sur 12` »
- Lot 1 : `infanterie` `MK1 — 50 soldats` · « `en chaîne` » · `12 min` restantes (pas de
  bouton annuler : « `une troupe commencée ne s'annule plus` »)
- Lot 2 : `infanterie` `MK1 — 50 soldats` · « `en attente` » · `20 min` (bouton
  « `annuler` », infobulle « `annuler et rembourser` »)
- Encart « `au réveil` » : « `Les files continuent pendant la plage de repos, comme les
  chantiers. Chaque bâtiment tient sa propre file : une seconde caserne forme en parallèle.
  Une troupe déjà commencée ne s'annule plus ; les suivantes sont remboursées
  intégralement.` »
- File vide (autre état à maquetter) : ⚠ la chaîne actuelle (« Choisissez un site et
  enfilez un rôle ») envoie vers un geste mort depuis 59a — **nouvelle clé fr au prompt
  code**, proposition : « `Aucune troupe en chaîne. Enfilez un rôle ci-dessus.` »
- Lot commencé : **pas de bouton annuler** (retiré, pas grisé) ; la phrase
  « `une troupe commencée ne s'annule plus` » s'imprime à sa place — écart assumé au code
  actuel (qui grise), à répercuter au prompt code. *(validé 01/09)*

## Fiche abaque (contrat 06) — en service par marque

Sous chaque colonne de marque de la fiche dépliée : « `en service` » + le compte
(`workshop.roster`, toutes adresses confondues, file exclue). Scénario : `infanterie` MK1
`3` ; toutes les autres lignes `0` — le zéro s'imprime, une fiche sans la ligne se lirait
comme un oubli.

## Renvoi abaque

Bouton **muet** (pictogramme seul, décision du code : un libellé le mettrait au même rang
que recruter) ; « `abaque de tir — qui bat qui` » est son **infobulle**, rien d'imprimé à
côté. Ouvre une lecture, ne commande rien. *(tranché 01/09 — le prompt v2 disait à tort
d'imprimer la phrase.)*

## Chaînes les plus longues (la maquette doit les tenir sans casser)

- Le refus de plafond (apparaît en bandeau d'erreur) : « `plafond atteint : 10 troupes, file
  comprise — bâtissez ou montez des baraquements` »
- « `Aucun bâtiment de ce type. Bâtissez un aérodrome pour former ce domaine.` »
- La note du plafond (tête de vue) et l'encart « au réveil » ci-dessus.
- Équipement le plus long : « `char lourd B1 bis` » ; rôle le plus long :
  « `transport terrestre` ».

## Interdits (rappel du contrat)

Coût en munitions (n'existe pas) · chiffres de la table de dégâts sur les cartes · stock
d'alliage isolé (uniquement collé à un coût : « `95 / 320` ») · vitesse de chaîne · toute
chaîne ou tout chiffre absent de ce fichier.
