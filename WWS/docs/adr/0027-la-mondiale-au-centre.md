# ADR 0027 — La Mondiale au centre, et l'économie comme seul frein

**Statut :** acceptée (17/10/2026, grilling « vision » avec Pierre) — **remplace la
[fiche 01](../design/01-vision-et-format.md)** ; **révise l'[ADR 0001](0001-saison-longue-asynchrone.md)**
(format), **l'[ADR 0020](0020-domination-par-couleur.md) §10** (emplacements) et **§11** (format
de saison), le plafond de troupes (`TROOP_CAP_*`) et le Registre 24-26 (bots). Les règles propres
à chaque mode restent celles de
[gameplay deux modes](../design/propositions/gameplay-deux-modes-2026-10-14.md) (14/10) ; rien de
ce qui suit n'est codé au 17/10.

> **Précisée le 18/10/2026, au codage du socle** (point 3 de la file, décisions de Pierre) :
> - **les Sept de la saison test** sont le premier vivier (P11) moins Bakou, Dakar et Singapour :
>   ils sont sept, donc tous posés à chaque saison, sans les contraintes de tirage du 14/10.
>   Rangoun et Hong Kong comptent pour la victoire ; leur règle attend sa feature (« règle à
>   venir ») ;
> - *(19/10)* **Bakou, Dakar et Singapour entrent au vivier** (dix lieux) : sept sont tirés par la
>   graine de la saison, sous contraintes de diversité, et la course reste à quatre sur sept ;
> - **les pouvoirs quotidiens** se rechargent par jour de saison (Istanbul) et par édition
>   (Tanger), comptés depuis le lancement, et non à l'édition de 9 h ;
> - **le compte à rebours des 24 h** court tant que le meneur tient quatre points, et repart à zéro
>   s'il passe sous quatre.

## Contexte

La fiche 01 décrivait un seul jeu de 7 jours, « pas Advance Wars ». Le 14/10, le jeu s'est scindé
en Blitz et Mondiale, et la Blitz a été construite d'abord. Elle a montré ce qui amuse : **manipuler
des pièces de jeu de société**, avec des animations fluides et un geste juste. Il restait à dire
lequel des deux modes est le jeu, ce que vise le projet, et ce qui freine un joueur. Les plafonds
de troupes et d'emplacements, eux, frustrent à l'usage.

## Décision

### 1. La boussole

> **Un jeu de plateau qu'on manipule à la main, à l'échelle de la planète : on ne voit que ce
> qu'on a payé pour voir, et ce qu'on engage ne revient pas vite.**

Elle remplace la phrase directrice de la fiche 01. Les trois règles de design restent
(`WWS/CLAUDE.md`), et la troisième se précise : l'éliminé de Mondiale reste nuisible **par la
parole** (télégraphe, ce qu'il a vu). Un mouvement de résistance viendra peut-être plus tard.

### 2. La Mondiale est le jeu, la Blitz est l'atelier des pièces

- **La Mondiale** est le vrai mode : de la macro façon Ogame ou Travian, sur un support visuel bien
  plus riche. Une visite type tient en cinq temps : lire la presse, regarder la table, jouer 1 à 3
  coups de pièces, prendre **une** décision d'économie, passer au télégraphe.
- **La Blitz** a servi à mettre au point la manipulation. Elle est mise de côté : correctifs
  seulement. Ce qui touche aux pièces profite aux deux modes. Un bot Blitz viendra plus tard, une
  vraie IA peut-être ensuite ; aucun bot en Mondiale.
- **Mêmes pièces, mêmes gestes** dans les deux modes. Les escouades n'existent qu'en Mondiale.
- **Le tutoriel** fait manipuler les fonctions principales. Ce n'est pas une partie complète.

### 3. L'ambition : entre amis, puis public, puis commercial

Le jeu se construit pour un inconnu, mais il se joue d'abord entre amis. **L'argent est hors sujet
pour l'instant.** Si un jour il y en a, ce sont des cosmétiques, jamais un avantage ni une
accélération. Le jeu est en français ; l'anglais viendra par un `en.ts` typé sur `fr`.

### 4. La saison

- **Sa durée est un réglage du salon.** L'horloge sert de filet ; la victoire (4 points stratégiques
  sur 7 tenus **24 h**, fixe quelle que soit la durée) arrive normalement avant.
- **Personne n'entre après le départ.** La fenêtre d'entrée tardive disparaît.
- **À l'étape publique**, un salon s'affiche dans des « petites annonces ». Son départ s'adapte aux
  inscriptions : minimum atteint, il est fixé à une heure ronde au moins 24 h plus tard ; salon
  plein, il est avancé à une heure ronde au moins 1 h plus tard.
- **La diplomatie reste déclarative** : jamais d'alliance formelle, ni de victoire commune.
- **La saison test** se joue à huit nations, sans atout national.

### 5. L'économie est le seul frein

Le plafond de troupes et les emplacements par site disparaissent. Ce qui freine, ce sont les
coûts, l'entretien et la logistique, plus une borne serveur invisible. Les cas qui pourraient
casser le jeu sont nommés pour être surveillés pendant la saison test :

| Cas | Parade attendue |
|---|---|
| Boule de neige du plus riche | l'entretien croît avec l'armée ; la victoire se joue loin de chez soi |
| Tortue chez soi | elle ne gagne rien : il faut tenir des points ailleurs |
| Tapis d'avant-postes | entretien par avant-poste ; ils se capturent |
| Escouade monstre | artillerie ; elle consomme plus et dépend du ravitaillement |
| Des centaines de pièces | borne serveur invisible, pièces regroupées à l'écran |

Ses principes sont acquis ; leur forme se décidera dans un chantier dédié.
- **Aucune ressource n'est un simple ingrédient.** Chacune a un usage direct, et sa pénurie casse
  une règle. Le constat de départ : charbon et minerai ne servent qu'à l'alliage, et tissus,
  bandages et vivres ne servent presque pas.
- **Des coûts mêlés** : chaque chose coûte au moins deux ressources, et aucune ne dort.
- **La recherche débloque**, des unités comme des ressources ; elle ne bonifie jamais (44a).
- **La logistique passe par les pièces.** Les troupes partent avec leurs munitions. Des transports
  ravitaillent un avant-poste, avec les gestes de l'embarquement (ADR 0025), et les troupes y
  viennent se servir.
- **Le dilemme d'une visite** : investir (élever, avec un rendement qui s'accumule), armer, ou
  projeter.
- **Un plateau personnel** porte les stocks en jetons, et bâtir revient à poser une tuile sur la
  carte.

La liste de cinq ressources (vivres, acier, charbon, pétrole, munitions) est une piste, pas une
décision.

### 6. La forme

- La presse habille ce qui est hors du plateau ; la table est le plateau.
- **Une guerre de pays, sans idéologie** : ni symbole de régime, ni crimes, ni camps. Les drapeaux
  sont ceux d'aujourd'hui (`Flag.tsx`). D'éventuels personnages sont une question ouverte.
- Le plancher de performance est un téléphone de milieu de gamme de 2021, à 30 images par seconde
  sur une table chargée. L'ordinateur reçoit des effets en plus, qui restent du décor et ne portent
  jamais une information absente du téléphone.
- Les sons de la table sont communs aux deux modes (`src/map/table-sound.ts`).

### 7. L'infra et la mesure

- **Il n'y a pas de prod** tant que le domaine « lamanchette » n'est pas acheté. `wws.pierrebrethes.cloud`
  est une pré-prod, et ses données ne comptent pas. Une seule discipline : pendant la saison test,
  aucune migration qui force un wipe.
- **On mesure** avec le journal d'événements et un script de rapport en fin de saison, pas avec un
  simulateur. Le script suit les cinq cas du §5, l'isolement des États-Unis (le 🔴 de
  `QUESTIONS.md`) et les élévations face aux fondations.

## Conséquences

- La file mène à une **saison test Mondiale v2 entre amis** (`RESTE-A-CODER.md`, en tête).
- Avant de coder l'économie, il faut une proposition « Mondiale : économie, logistique, escouades »
  ancrée dans le code, puis son grilling. Les points stratégiques qui touchent à l'économie
  (Bakou, Narvik, Dakar, Singapour) s'y relisent.
- Retirer `TROOP_CAP_*` et `SITE_SLOTS_FULL` est un lot de code. Les refus `TROOP_CAP_REACHED` et
  `SITE_SLOTS_FULL` tombent avec eux.

## Ce qu'on abandonne

- La phrase directrice et le format de la fiche 01 : 48 h de test, compensation géographique,
  « pas Advance Wars ».
- Les plafonds affichés de troupes et d'emplacements, et avec eux la peur du joueur qui empile.
- La refonte du simulateur comme instrument d'équilibrage, et les bots de remplacement en Mondiale.
- La durée fixe de 7 jours, et l'entrée en cours de saison.
