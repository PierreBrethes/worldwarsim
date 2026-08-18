# Projection depuis un avant-poste — la question 21 rouverte

**Statut : proposition, non tranchée.** Instruite le 18/08/2026 à partir du symptôme signalé en
partie : une garnison d'avant-poste sélectionnée ne répond à aucun clic droit, sans un mot à
l'écran.

## 1. Le constat matériel

### La question 21 n'existe nulle part

`grep -rn "question 21" WWS/` ne renvoie **rien**. Elle est pourtant citée trois fois dans
`src/domain/movement-orders.ts` (lignes 19-22, 83) comme l'autorité qui fonde la règle la plus
restrictive du module. La décision a été prise en conversation, gravée dans le code, et n'a
jamais atteint `QUESTIONS.md` ni un ADR.

C'est le défaut le plus grave de ce dossier, avant toute considération de jeu : une règle qui
ferme trois ordres sur quatre s'appuie sur une référence introuvable. Personne — ni Pierre dans
six semaines, ni un agent qui relit — ne peut savoir *pourquoi* elle existe.

### Ce qui est réellement codé

`Column.origin` vaut `'building'` ou `'outpost'` (`movement-orders.ts:31`).

| Ordre | `origin: 'building'` | `origin: 'outpost'` |
|---|---|---|
| `outpost` (fonder) | légal, infanterie seule, cible étrangère | `NOT_ORDERABLE` |
| `attack` | légal, cible non mienne, terrestre | `NOT_ORDERABLE` |
| `raid` | légal, cible = avant-poste adverse | `NOT_ORDERABLE` |
| `recall` | `NOT_ORDERABLE` | légal, cible = **une région portant une de mes casernes** |

Le `return` reste hors de cette table : personne ne l'ordonne, la passe de résolution le crée
seule.

### Le silence n'est pas la règle

`compassOf` renvoie `null` dès que la liste des types légaux est vide
(`src/domain/compass-rose.ts:186`). Zéro type → aucune rose des vents, aucun message, rien.
L'ADR 0015 interdit le grisé ; personne n'a écrit la branche « aucun ordre possible sur cette
cible ». Le joueur lit une panne là où il y a une règle.

Second silence, indépendant de l'avant-poste et plus fréquent : `MovementAim` n'accepte que
`region` et `outpost` (`movement-orders.ts:10-12`). Dézoomé au-delà de 65 unités, les régions
admin-1 ne sont pas affichées, la visée ne trouve qu'un pays, et le clic droit ne donne rien
**pour n'importe quelle colonne**. C'est un défaut distinct, à traiter à part.

## 2. Ce que j'ai cru, et ce qui est vrai

**Ma première lecture était trop dure.** J'ai conclu que l'avant-poste était un cul-de-sac : une
colonne qui a marché quatorze heures pour le fonder devrait refaire quatorze heures en sens
inverse avant de servir à nouveau. C'est faux, et la relecture de `convex/constructions.ts:55-75`
le montre.

Rien ne restreint **quelle** bâtisse se pose dans le rayon d'un avant-poste. Le commentaire est
explicite : *« Nothing else moves. A well in Arabia is a building like any other. »* Une
**caserne** en Arabie est donc légale, à 400 km au plus de l'avant-poste
(`OUTPOST_REACH_KM = 400`).

Et une caserne avancée entre dans `myBarracksRegionIds`. Donc le `recall` de la garnison vers
elle est légal aujourd'hui, sans une ligne à changer. Depuis cette caserne, `origin` redevient
`'building'` et les trois ordres offensifs rouvrent.

> **Le chemin de projection existe déjà, en deux temps :**
> avant-poste → caserne bâtie dans son rayon → la garnison rallie la caserne → elle repart.

C'est même élégant : aucune exception à l'ADR 0013 (un domaine s'ouvre par un bâtiment de
projection), aucune règle nouvelle, et l'avant-poste garde exactement le rôle que la fiche 03 lui
donne — *il ouvre le terrain, il ne produit rien*. Il n'a jamais été censé lancer une colonne.

**La règle est donc bonne. Ce qui est cassé est autour d'elle.**

## 3. Ce qui reste réellement cassé

### a. Personne ne peut deviner le chemin

Rien à l'écran, rien dans le vocabulaire, rien dans un texte ne dit à un joueur que la clé du jeu
lointain est *bâtir une caserne à l'étranger*. C'est la pièce maîtresse du milieu de saison et
elle est entièrement implicite.

### b. Le mot « rappel » ment

`recall` est servi en français par « rappel de garnison » (`src/i18n/fr.ts:95`), et le refus par
« un rappel marche sur une caserne, et sur rien d'autre » (ligne 289). Le refus dit la vérité ;
le nom dit le contraire. « Rappel » raconte un retour au bercail, alors que la règle est
« rejoindre n'importe laquelle de mes casernes, y compris celle que je viens de bâtir à 400 km
de là ». Le joueur qui lit « rappel » ne cherchera jamais l'ordre de débarquement vers sa caserne
avancée.

Proposition : **ralliement**, et le refus devient « un ralliement marche sur une de vos casernes,
et sur rien d'autre ». Le mot n'est pas dans le glossaire imposé — il faut l'y ajouter ou en
choisir un autre, mais pas garder celui-là.

### c. Le coût de la garnison est muet, et il est lourd

`TROOP_CAP_BASE = 8`. Un avant-poste fondé par deux infanteries gèle **un quart de l'armée de
début de saison** dans un rôle qui ne peut rien faire d'autre que rallier. Au plafond visé
(`TROOP_CAP_TARGET = 24`), c'est 8 %. L'arbitrage est bon ; il n'est écrit nulle part.

### d. En escarmouche, le chemin est théorique

`buildingCap(hqLevel) = 3 + 2 × hqLevel`.

| | QG au lancement | QG max | Emplacements au max | Socle + QG | Libres sur la saison |
|---|---|---|---|---|---|
| `skirmish` (48 h) | 2 | 3 | 9 | 7 | **2** |
| `campaign` (7 j) | 1 | 5 | 13 | 4 | **9** |

En escarmouche, la caserne **domestique** n'est pas dans le socle
(`foundation: mine, mine, foundry, warehouse, farm, arsenal`) : elle prend le premier des deux
emplacements libres. La caserne avancée prendrait **le dernier de la saison**, contre les billets
(plafond de troupes), le dépôt, l'écoute, le port et l'aérodrome. Elle est possible et ne sera
jamais choisie.

Donc : **la règle tient en campagne et ne tient pas en escarmouche.** Ce n'est pas la règle qui
la casse, c'est le budget d'emplacements. Deux lectures possibles, à trancher :

- l'escarmouche est assumée comme un jeu domestique — 48 h ne suffisent pas à s'installer
  ailleurs, et c'est ce qui distingue les deux formats ;
- ou c'est un appauvrissement subi, et l'escarmouche a besoin d'une soupape (socle incluant la
  caserne, ou plafond de bâtiments plus haut au QG 3).

Je penche pour la première, mais elle doit être **écrite**, sinon elle sera relue comme un
oubli — exactement ce qui vient de se passer avec la question 21.

### e. Le raid a une cible économique, pas militaire

Conséquence à assumer : tant qu'aucune caserne avancée n'existe, un avant-poste ne menace
personne. On le raide pour couper une pompe à ressources, jamais pour désarmer une menace. C'est
défendable — c'est le modèle colonial — mais tout le vocabulaire autour (garnison, contesté,
désactivé) promet un objet militaire. L'écart entre la promesse et la règle est réel, et il se
referme le jour où quelqu'un pose une caserne dans le rayon.

## 4. Options

| | Contenu | Coût | Verdict |
|---|---|---|---|
| **A** | Statu quo, plus les correctifs de lisibilité (§5) | faible | **recommandée** |
| **B** | `attack` et `raid` légaux depuis `origin: 'outpost'` | moyen | à écarter |
| **C** | B, plus `outpost` légal depuis un avant-poste | fort | à écarter |
| **D** | Statu quo, plus une soupape d'escarmouche | moyen | à instruire séparément |

**Pourquoi écarter B.** Elle supprime le seul coût qui rend la projection lointaine chère — la
caserne avancée, son emplacement, son prix, sa vulnérabilité — et elle crée une exception à
l'ADR 0013 (un domaine s'ouvre par un bâtiment) pour un gain que le chemin existant offre déjà.
Elle rendrait aussi la fondation d'avant-postes en chaîne presque gratuite si C suivait.

**Pourquoi B est quand même tentante.** Elle sert le 🔴 bloquant : l'avantage d'isolement des
États-Unis tient à ce que venir de loin coûte un aller-retour complet. Un tremplin militaire
réduirait ce coût. Mais il le réduirait **pour tout le monde, y compris pour l'isolé qui sort**,
donc l'effet net sur l'asymétrie n'est pas mesuré et ne peut pas l'être avant le simulateur
refondu. Ce n'est pas un argument suffisant pour ouvrir une exception.

## 5. Ce qu'il faut faire, dans l'ordre

1. **Graver la question 21 dans un ADR.** Une règle qui ferme trois ordres sur quatre sans trace
   écrite est le vrai défaut. Projet joint.
2. **Boucher le silence.** La rose des vents s'ouvre sur une cible refusée et affiche le motif,
   qu'elle lit dans `refusalOf` — les codes existent déjà (`BARRACKS_TARGET_ONLY`,
   `FRIENDLY_TARGET`, `NOT_ORDERABLE`). L'ADR 0015 interdit d'**offrir un choix mort**, pas
   d'**expliquer une absence** : aucune tension.
3. **Montrer les cibles légales.** Quand une colonne de garnison est armée, surligner les régions
   portant une de mes casernes. Aucune fuite de brouillard — ce sont mes propres bâtisses.
4. **Renommer `recall`.** Le mot doit dire « rejoindre une caserne », pas « rentrer ».
5. **Corriger la visée au dézoom** (`aim()` sur `kind: 'country'`). Défaut distinct, sans doute
   le plus coûteux au quotidien.
6. **Trancher l'escarmouche** (§3.d) — après les cinq précédents, et de préférence après une
   passe du simulateur refondu.

## 6. Ce qui n'est pas tranché ici

- Le format d'escarmouche accepte-t-il d'être un jeu domestique ? (§3.d)
- Le mot qui remplace « rappel » — « ralliement » est une proposition, pas une décision.
- Le rendement décroissant par pays hôte porte sur les bâtiments à l'étranger (fiche 03) : une
  caserne avancée y compte-t-elle, ou seulement les extracteurs ? La question devient réelle le
  jour où quelqu'un en pose une.
