---
type: index
statut: en cours
maj: 2026-10-14
code: []
decisions: []
voir: [adr/README.md, ../QUESTIONS.md, RESTE-A-CODER.md, ../INDEX.md]
---

# Registre des décisions

**En bref.** Une ligne par décision. L'identifiant porte sa date, parce que les codes courts (`1a`, `3a`, `4a`…) se réemploient d'une session à l'autre. Le registre ne tranche rien : il pointe vers la source qui fait autorité (ADR, proposition, contrat de vue, prompt livré, rapport). Une date marquée « inférée » est déduite d'un encadrement par des numéros voisins ; « ? » veut dire qu'aucune date n'est écrite dans `WWS/`.

## Lire un identifiant

- Forme `<code>-<AAAA-MM-JJ>` : `85a-2026-09-10`, `1b-2026-09-13`. Le code est celui que les documents citent (« décision 72a », « 1b du 13/09 »), la date est celle de la décision, pas de la livraison.
- Deux numérotations coexistent. La **série globale** monte avec le temps du 16/08 au 11/09 (12a… 91a). Les **numérotations de session** repartent à `1a` : on en trouve dès le 25/08, puis le 06/09, le 13/09, le 15/09 et le 16/09 ; seule la date distingue deux `1a`.
- Préfixes de série : `D1`… (listes de décisions d'un brief), `registre-N` (items du Registre de [RESTE-A-CODER](RESTE-A-CODER.md)), `marque-` et `plan-` (note [marque-et-site](marque/marque-et-site.md)), `menage-` (ménage du dépôt, 04/10).
- `pierre-AAAA-MM-JJ-mot-clé` : décision datée et nommée, sans numéro.
- `ADR NNNN` : l'ADR entière ; une révision datée s'écrit `ADR NNNN rév. AAAA-MM-JJ`.

## La série numérotée (16/08 → 11/09)

Triée par numéro. Les lettres (a, b, c) sont l'option retenue à la question portant ce numéro. Les numéros 89 et 90 sont des questions dont la réponse porte un code de session.

| N° | Identifiant | Date | Décision | État | Source |
|---|---|---|---|---|---|
| 6 | `6c-?` | ? | Le blindé n'arrive qu'au QG 3, avec son contre (l'infanterie MK2) : l'arme et son contre ensemble. | en vigueur | [plan-progression-v1](design/propositions/plan-progression-v1.md), [catalogue-par-palier](prompts/code/done/catalogue-par-palier.md) |
| 9 | `9a-?` | ? (avant le 19/08) | La position des gisements est publique côté client (`public/deposits.json`). | en vigueur ; reprise par `65a-2026-09-01` | [avant-poste-et-portee](prompts/code/done/avant-poste-et-portee.md) |
| 12 | `12a-2026-08-18` | 2026-08-18 | Validation du flux de mouvement en carte, avec la règle « aucune troupe posée librement, l'adresse d'une troupe est son bâtiment ». | flux validé ; règle d'adresse annulée par ADR 0019 | [flux-mouvement-en-carte](design/propositions/flux-mouvement-en-carte.md), [mouvement-libre-et-troupes-posees](design/propositions/mouvement-libre-et-troupes-posees.md) |
| 13 | `13a-2026-08-18` | 2026-08-18 | La fenêtre Troupes disparaît ; la carte devient la surface d'action. | en vigueur | [flux-mouvement-en-carte](design/propositions/flux-mouvement-en-carte.md), [widget-troupes-et-visee](prompts/code/done/widget-troupes-et-visee.md) |
| 16 | `16a-2026-08-18` | 2026-08-18 | Première écriture de l'anatomie de la passe de résolution (initiative à l'attaquant, déterministe, sans aléa), avec 17a. | initiative révisée par `1b-2026-09-16` | [combat-sequentiel](prompts/code/done/combat-sequentiel.md), [ADR 0018](adr/0018-anatomie-de-la-passe-de-resolution.md) |
| 17 | `17a-2026-08-18` | 2026-08-18 | Idem 16a (les deux décisions sont citées ensemble, sans séparation du contenu). | idem 16a | [combat-sequentiel](prompts/code/done/combat-sequentiel.md) |
| 18 | `18a-2026-08-25` | 2026-08-25 | Les munitions se facturent au tir, plus au recrutement (question 18, option a). | en vigueur | [ADR 0018](adr/0018-anatomie-de-la-passe-de-resolution.md), [munitions-une-seule-facture](prompts/code/done/munitions-une-seule-facture.md) |
| 40 | `40a-2026-08-31` | 2026-08-31 (inférée) | Capitulation : le titre de fondateur passe au plus ancien belligérant non défait (avec 46). | en vigueur | [fondateur-absent](prompts/code/done/fondateur-absent.md), [capitulation-et-observateur](prompts/code/done/capitulation-et-observateur.md) |
| 43 | `43-2026-08-31` | 2026-08-31 | Presse : édition toutes les 2 h, territoire exact, industrie et militaire en tranches pour les autres. | révisée par `80-2026-09-06` | [page-de-presse-et-scores](design/propositions/page-de-presse-et-scores.md), [classement-bareme](design/propositions/classement-bareme.md) |
| 44 | `44a-2026-08-31` | 2026-08-31 | La recherche débloque, ne bonifie jamais ; à graver dans une future ADR recherche. | en vigueur, ADR non écrite | [recherche-par-deblocage](design/propositions/recherche-par-deblocage.md) |
| 46 | `46-2026-08-31` | 2026-08-31 (inférée) | Capitulation : un joueur dépose les armes et observe (avec 40a). | en vigueur | [fondateur-absent](prompts/code/done/fondateur-absent.md), [capitulation-et-observateur](prompts/code/done/capitulation-et-observateur.md) |
| 47 | `47a-2026-08-31` | 2026-08-31 | L'observateur défait garde sa propre vue ; ses boutons d'action sont retirés, pas grisés. | en vigueur | [capitulation-et-observateur](prompts/code/done/capitulation-et-observateur.md), [00-regles](design/contrats-de-vue/00-regles.md) |
| 49 | `49a-2026-08-31` | 2026-08-31 | Le rayon d'un avant-poste suit son niveau : 120 / 180 / 240 km. | en vigueur | [rayon-au-niveau-encres-et-tenant](prompts/code/done/rayon-au-niveau-encres-et-tenant.md), [ADR 0020](adr/0020-domination-par-couleur.md) |
| 50 | `50a-2026-08-31` | 2026-08-31 | Les encres de la carte s'affirment (lavis plus franc). | en vigueur | [rayon-au-niveau-encres-et-tenant](prompts/code/done/rayon-au-niveau-encres-et-tenant.md) |
| 51 | `51-?` | ? | Un test d'invariant lit les constantes : la première projection tient dans `STARTING_ALLOY` (« le jour où l'on touche constants »). | en vigueur pour le lot 2 ; « invariants CI restants » au Registre | [retours-japon-lot-2](prompts/code/done/retours-japon-lot-2.md), [RESTE-A-CODER](RESTE-A-CODER.md) |
| 53 | `53a-?` | ? | Les cas d'acceptation s'écrivent en tests avant le code. | en vigueur | [comptes](prompts/code/done/comptes.md), [fondateur-absent](prompts/code/done/fondateur-absent.md) |
| 54 | `54a-2026-09-01` | 2026-09-01 (inférée) | Rose des vents sur bâtiment avec la branche « Améliorer » ; seule branche grisée du jeu (le stock manque), exception à « rien de grisé ». | en vigueur | [04-rose-batiment](design/contrats-de-vue/04-rose-batiment.md) |
| 55 | `55b-2026-09-01` | 2026-09-01 (inférée) | Le mot « atelier » est rejeté (vocabulaire : caserne, filière). | en vigueur | [03-caserne](design/contrats-de-vue/03-caserne.md), [00-regles](design/contrats-de-vue/00-regles.md) |
| 56 | `56a-2026-09-01` | 2026-09-01 | La rose sur bâtiment s'ouvre au clic droit. | en vigueur | [04-rose-batiment](design/contrats-de-vue/04-rose-batiment.md) |
| 57 | `57a-2026-09-01` | 2026-09-01 | L'élévation reste aussi dans Économie et Caserne (doublon assumé). | en vigueur | [04-rose-batiment](design/contrats-de-vue/04-rose-batiment.md), [02-economie](design/contrats-de-vue/02-economie.md) |
| 59 | `59a-2026-09-01` | 2026-09-01 | La modale par bâtiment remplace l'onglet « prod. » général. | en vigueur | [03-caserne](design/contrats-de-vue/03-caserne.md) |
| 60 | `60b-2026-09-01` | 2026-09-01 | Le catalogue des unités sans bâtiment vit dans l'abaque de tir ; rien de caché ne se débloque. | en vigueur (extension catalogue livrée) | [03-caserne](design/contrats-de-vue/03-caserne.md), [06-abaque-catalogue](design/contrats-de-vue/06-abaque-catalogue.md) |
| 61 | `61a-2026-09-01` | 2026-09-01 | La modale de site absorbe la garnison ; le mât n'a plus qu'une destination. | en vigueur | [03-caserne](design/contrats-de-vue/03-caserne.md) |
| 63 | `63a-2026-09-01` | 2026-09-01 (inférée) | Bunker / DCA seulement si le premier test montre l'attaque trop payante. | non codée (item 18 du Registre) | [RESTE-A-CODER](RESTE-A-CODER.md), [frappe-de-batiment](design/propositions/frappe-de-batiment.md) |
| 64 | `64b-2026-09-01` | 2026-09-01 | Entrer dans un bâtiment se dit : branche explicite de la rose (« rejoindre la garnison »). | en vigueur | [entrer-en-garnison](prompts/code/done/entrer-en-garnison.md), [04-rose-batiment](design/contrats-de-vue/04-rose-batiment.md) |
| 65 | `65a-2026-09-01` | 2026-09-01 | Gisement et côte sont publics : la géologie est un fait de la carte. | en vigueur | [05-carte-selection](design/contrats-de-vue/05-carte-selection.md) |
| 66 | `66a-2026-09-04` | 2026-09-04 | Port et aérodrome descendent au QG niveau 2 (`UNLOCKED_AT`). | en vigueur | [plan-progression-v1](design/propositions/plan-progression-v1.md), [ADR 0015](adr/0015-economie-v2-ressources-localisees.md), [retours-japon-lot-2](prompts/code/done/retours-japon-lot-2.md) |
| 67 | `67b-2026-09-04` | 2026-09-04 | Second verrou local : chaque rôle se forme à un niveau de site. | en vigueur | [ADR 0015](adr/0015-economie-v2-ressources-localisees.md), [03-caserne](design/contrats-de-vue/03-caserne.md) |
| 68 | `68a-2026-09-04` | 2026-09-04 | Pictogramme muet devant chaque donnée de la fiche de l'abaque, valeur au survol. | en vigueur | [06-abaque-catalogue](design/contrats-de-vue/06-abaque-catalogue.md), [retours-japon-lot-3](prompts/code/done/retours-japon-lot-3.md) |
| 69 | `69a-2026-09-04` | 2026-09-04 (inférée) | Libellé de la branche : « entrer en garnison ». | en vigueur | [entrer-en-garnison](prompts/code/done/entrer-en-garnison.md) |
| 70 | `70b-2026-09-04` | 2026-09-04 (inférée) | Table « qui entre où » (`NOT_A_GARRISON_FOR`). | en vigueur | [entrer-en-garnison](prompts/code/done/entrer-en-garnison.md) |
| 71 | `71b-2026-09-04` | 2026-09-04 | Le port, et lui seul, se pose à un point de côte choisi par le joueur. | en vigueur | [ADR 0013](adr/0013-batiments-de-projection-sur-regions.md), [port-sur-la-cote](prompts/code/done/port-sur-la-cote.md) |
| 72 | `72a-2026-09-04` | 2026-09-04 | Les navires ne roulent pas : une colonne embarquée ne vise qu'une côte ou un port. | révisée par `pierre-2026-09-18-cargo-en-mer` | [ADR 0019](adr/0019-mouvement-libre-et-troupes-posees.md), [ADR 0012](adr/0012-trajets-multimodaux-sur-grille.md), [debarquement-sur-la-cote](prompts/code/done/debarquement-sur-la-cote.md) |
| 73 | `73a-2026-09-04` | 2026-09-04 | Le geste de pose d'un port part de la rose de la région. | en vigueur | [ADR 0013](adr/0013-batiments-de-projection-sur-regions.md), [port-sur-la-cote](prompts/code/done/port-sur-la-cote.md) |
| 75 | `75-2026-09-06` | 2026-09-06 | Comptes pseudo et mot de passe, sans e-mail (avec 77a ; la répartition entre les deux numéros n'est pas écrite). | en vigueur | [ADR 0022](adr/0022-comptes-pseudo-et-mot-de-passe.md) |
| 77 | `77a-2026-09-06` | 2026-09-06 | Idem 75. | en vigueur | [ADR 0022](adr/0022-comptes-pseudo-et-mot-de-passe.md) |
| 78 | `78a-2026-09-06` | 2026-09-06 | Les bâtiments ont une intégrité : une frappe aérienne la réduit, à zéro le bâtiment est désactivé, jamais détruit. | proposée, non codée (après le pillage) | [frappe-de-batiment](design/propositions/frappe-de-batiment.md) |
| 79 | `79a-2026-09-06` | 2026-09-06 | Le classement est ordonné par territoire ; spec du barème. | révisée par `80-2026-09-06` (général) | [classement-bareme](design/propositions/classement-bareme.md), [07-presse](design/contrats-de-vue/07-presse.md) |
| 80 | `80-2026-09-06` | 2026-09-06 | Presse : score général exact, édition toutes les 3 h ; révise la 43. | en vigueur | [classement-bareme](design/propositions/classement-bareme.md), [07-presse](design/contrats-de-vue/07-presse.md) |
| 84 | `84a-2026-09-10` | 2026-09-10 | La rumeur de butin est la première fuite publique assumée ; la caisse de butin est gardée pour la partie de contrôle. | en vigueur (à éprouver) | [ADR 0005](adr/0005-brouillard-par-defaut.md), [s8-ouverture-du-pillage](prompts/code/done/s8-ouverture-du-pillage.md) |
| 85 | `85a-2026-09-10` | 2026-09-10 | Wipe des comptes : `players.token` disparaît, aucune reprise ni migration (wipe effectif le 11/09). | en vigueur | [comptes-c3-places-et-connexion](prompts/code/done/comptes-c3-places-et-connexion.md) |
| 86 | `86a-2026-09-10` | 2026-09-10 | La fenêtre d'inscription de deux heures est gardée en `@a-mesurer`. | en vigueur | [direction-v1-2026-09-09](design/propositions/direction-v1-2026-09-09.md) |
| 87 | `87a-2026-09-10` | 2026-09-10 | Trois lignes de la direction V1 sont classées pistes, pas décisions (échéance, nucléaire, agents). | en vigueur | [direction-v1-2026-09-09](design/propositions/direction-v1-2026-09-09.md) |
| 89 | → `1b-2026-09-13` | question du 11/09 | Choix de l'emplacement du QG : tranchée par 1b du 13/09. | tranchée | [partie-de-controle](rapports/2026-09-11-partie-de-controle.md), [qg-pose-par-le-joueur](prompts/code/done/qg-pose-par-le-joueur.md) |
| 90 | → `ADR 0024` | question du 11/09 | Ce qu'une pile posée révèle d'une autre : traité par l'ADR 0024 §1 (le lien n'est pas écrit). | tranchée (lien inféré) | [partie-de-controle](rapports/2026-09-11-partie-de-controle.md), [ADR 0024](adr/0024-engagement-intentionnel-et-forces-posees-visibles.md) |
| 91 | `91a-2026-09-11` | 2026-09-11 | Quel bouton fait quoi est une préférence de joueur : trois rôles sur trois boutons, deux presets. | en vigueur | [partie-de-controle](rapports/2026-09-11-partie-de-controle.md), [commandes-de-la-souris](prompts/code/done/commandes-de-la-souris.md) |

Numéros sans trace dans WWS/ : 1-4, 7, 8, 10, 11, 15, 19, 20, 22-38, 41, 42, 45, 48, 52, 58, 62, 74, 76, 82, 83, 88. Numéros cités mais jamais tranchés : 5 et 6 (a, b), 14 (« encore ouverte », [widget-troupes-et-visee](prompts/code/done/widget-troupes-et-visee.md)), 39 (destruction du QG, « non tranchée », [RESTE-A-CODER](RESTE-A-CODER.md)), 81 (« reste ouverte », [direction-v1-2026-09-09](design/propositions/direction-v1-2026-09-09.md)). Le numéro 21 est cité par le code (`src/domain/movement-orders.ts`) alors qu'aucun document de `WWS/` ne le porte.

## Les décisions de session (depuis le 25/08)

Triée par date puis par code. Ces codes repartent à `1a` à chaque session ; l'ID est inséparable de sa date.

| Identifiant | Date | Décision | État | Source |
|---|---|---|---|---|
| `1b-2026-08-25` | 2026-08-25 | Un retardataire peut rejoindre une saison lancée à toute heure (choix de test). | en vigueur, à mesurer | [12-hors-saison](design/12-hors-saison.md), [rejoindre-en-guerre](prompts/code/done/rejoindre-en-guerre.md) |
| `2a-2026-08-25` | 2026-08-25 | Écoute et relais : on les code, on ne les cache pas. | en vigueur | [ecoute-et-relais](prompts/code/done/ecoute-et-relais.md) |
| `3b-2026-08-25` | 2026-08-25 | La refonte du simulateur est reportée (rattrapée en partie le 14/09). | reportée | [munitions-une-seule-facture](prompts/code/done/munitions-une-seule-facture.md), [simulation/opening](../simulation/opening/README.md) |
| `1a-2026-09-06` | 2026-09-06 | Un fondateur absent ne gèle plus la saison : le doyen clôt après `FOUNDER_ABSENCE_HOURS`. | en vigueur | [fondateur-absent](prompts/code/done/fondateur-absent.md) |
| `5a-2026-09-06` | 2026-09-06 | L'état de référence s'exporte d'une saison réellement jouée, jamais simulée. | en vigueur | [etat-de-reference-depuis-une-saison](prompts/code/done/etat-de-reference-depuis-une-saison.md) |
| `1a-2026-09-13` | 2026-09-13 | Attaqué, un camp se bat toujours (ADR 0024 §3) ; le même code est aussi cité pour la durée de vie `LAST_KNOWN_HOURS` de la dernière position connue. | en vigueur | [ADR 0024](adr/0024-engagement-intentionnel-et-forces-posees-visibles.md), [engagement-intentionnel](prompts/code/done/engagement-intentionnel.md) |
| `1b-2026-09-13` | 2026-09-13 | Le joueur pose son QG où il veut sur son sol, première dette du socle (question 89). | en vigueur | [qg-pose-par-le-joueur](prompts/code/done/qg-pose-par-le-joueur.md), [ADR 0015](adr/0015-economie-v2-ressources-localisees.md), [ADR 0017](adr/0017-format-de-saison-et-socle-place.md) |
| `3a-?` | ? (cité le 13/09) | Les forces posées ne se voient pas de loin (« règle 2 » de la fiche 04). | renversée par ADR 0024 §1 | [releve-tronque](prompts/code/done/releve-tronque.md), [04-information](design/04-information.md) |
| `4a-2026-09-13` | 2026-09-13 | Un relevé sert le tronçon vu, le cap à la sortie et un horaire estimé, jamais la destination. | en vigueur | [releve-tronque](prompts/code/done/releve-tronque.md), [brouillard-et-fanout](technique/brouillard-et-fanout.md) |
| `1a-2026-09-15` | 2026-09-15 | Retours Discord : on garde le coût d'entretien des relais (ligne 2) ; l'élévation d'un avant-poste passe par le panneau de garnison (ligne 10). | en vigueur | [retours-discord](rapports/2026-09-15-retours-discord.md), [elever-un-avant-poste](prompts/code/done/elever-un-avant-poste.md) |
| `2a-2026-09-15` | 2026-09-15 | Élévation par la file de chantier prépayée (ligne 10) ; fenêtres sur mobile en lecture seule (ligne 5), aussitôt révisées par la décision du même jour (fenêtres plein écran). | file prépayée en vigueur ; mobile révisée | [retours-discord](rapports/2026-09-15-retours-discord.md), [fenetres-sur-mobile](prompts/code/done/fenetres-sur-mobile.md) |
| `3a-2026-09-15` | 2026-09-15 | Pas d'élévation sous désactivation ; zone désactivée hachurée ; bots et niveaux d'IA notés au Registre (lignes 6-8). | en vigueur | [retours-discord](rapports/2026-09-15-retours-discord.md), [zone-hors-service-hachuree](prompts/code/done/zone-hors-service-hachuree.md) |
| `5a-2026-09-15` | 2026-09-15 | Démolir un bâtiment : aucun remboursement. | en vigueur | [demolir-un-batiment](prompts/code/done/demolir-un-batiment.md) |
| `6a-2026-09-15` | 2026-09-15 | Démolir : la dette de socle ne revient pas ; seul le QG ne se rase pas. | en vigueur | [demolir-un-batiment](prompts/code/done/demolir-un-batiment.md) |
| `7a-2026-09-15` | 2026-09-15 | Fonder coûte alliage et durée, un avant-poste debout ne s'entretient plus ; mesure attendue au jour 7. | en vigueur | [fondation-en-chantier](prompts/code/done/fondation-en-chantier.md), [ADR 0020](adr/0020-domination-par-couleur.md) |
| `1a-2026-09-16` | 2026-09-16 | Détruire un avant-poste emporte les bâtiments qu'il ancre. | en vigueur | [rose-sur-les-avant-postes](prompts/code/done/rose-sur-les-avant-postes.md) |
| `1b-2026-09-16` | 2026-09-16 | Résolution simultanée : les deux camps tirent sur l'état d'avant la passe (révise l'ADR 0014). | révisée le 14/10 (initiative ; la simultanée devient le choc) | [combat-simultane-terrain-retranchement](design/propositions/combat-simultane-terrain-retranchement.md), [resolution-simultanee](prompts/code/done/resolution-simultanee.md) |
| `3a-2026-09-16` | 2026-09-16 | QUESTIONS.md réécrit : on n'y garde que le non tranché ; deux cercles autour de la pile (avec 4a). | en vigueur | [QUESTIONS](../QUESTIONS.md), [deux-cercles-autour-de-la-pile](prompts/code/done/deux-cercles-autour-de-la-pile.md) |
| `4a-2026-09-16` | 2026-09-16 | `ARRIVAL_RADIUS_KM` devient la portée de contact : cercle plein, détection tiretée. | en vigueur | [combat-simultane-terrain-retranchement](design/propositions/combat-simultane-terrain-retranchement.md), [deux-cercles-autour-de-la-pile](prompts/code/done/deux-cercles-autour-de-la-pile.md) |

Les codes `1a` (terrain) et `2a` (retranchement) du 16/09 et le `2a` du 17/09 sont inscrits plus bas sous leur numéro de Registre.

## Les séries à préfixe

| Identifiant | Date | Décision | État | Source |
|---|---|---|---|---|
| `D1-2026-08-16` | 2026-08-16 | L'entretien des troupes est un forfait, identique pour tous les rôles. | en vigueur | [consommation-continue](prompts/code/done/consommation-continue.md) |
| `D2-2026-08-16` | 2026-08-16 | Le pétrole n'est pas dans l'entretien : il se brûle en se déplaçant. | en vigueur | [consommation-continue](prompts/code/done/consommation-continue.md) |
| `D3-2026-08-16` | 2026-08-16 | À sec de nourriture, rien ne meurt : la file de recrutement s'arrête. | en vigueur | [consommation-continue](prompts/code/done/consommation-continue.md) |
| `D1-2026-09-09` | 2026-09-09 | Pillage : D1 retirée (les mines et usines se sabotent sans créer de butin). | retirée | [RESTE-A-CODER](RESTE-A-CODER.md), [pillage-et-butin](design/propositions/pillage-et-butin.md) |
| `D2-2026-09-09` | 2026-09-09 | Pillage : capacités nominales par rôle, charge réduite au prorata. | en vigueur | [RESTE-A-CODER](RESTE-A-CODER.md), [pillage-s2-s8](rapports/2026-09-09-pillage-s2-s8.md) |
| `D3-2026-09-09` | 2026-09-09 | Pillage : une expédition victorieuse tient le site 2 h (S5b), reste indisponible. | en vigueur | [pillage-s2-s8](rapports/2026-09-09-pillage-s2-s8.md), [ADR 0019](adr/0019-mouvement-libre-et-troupes-posees.md) |
| `D4-2026-09-09` | 2026-09-09 | Pillage : le crédit se fait au franchissement d'une région tenue ; cas sans route. | en vigueur | [RESTE-A-CODER](RESTE-A-CODER.md), [pillage-s2-s8](rapports/2026-09-09-pillage-s2-s8.md) |
| `D5-2026-09-09` | 2026-09-09 | Pillage V1 : seul le stock disponible est pillable ; les ressources engagées sont protégées. | en vigueur | [RESTE-A-CODER](RESTE-A-CODER.md), [QUESTIONS](../QUESTIONS.md) |
| `D6-2026-09-09` | 2026-09-09 | Pillage : récupération du butin d'une colonne détruite, bornée par la capacité, retour obligatoire. | en vigueur | [RESTE-A-CODER](RESTE-A-CODER.md), [pillage-s2-s8](rapports/2026-09-09-pillage-s2-s8.md) |
| `registre-27-2026-09-16` | 2026-09-16 | Rose sur un avant-poste à soi : élever, relais, écoute, détruire sans pile ; « entrer en garnison » avec une pile. | en vigueur | [RESTE-A-CODER](RESTE-A-CODER.md), [rose-sur-les-avant-postes](prompts/code/done/rose-sur-les-avant-postes.md) |
| `registre-28-2026-09-16` | 2026-09-16 | Artillerie : « plus tard », dixième rôle à portée minimale et maximale. | non décidée | [RESTE-A-CODER](RESTE-A-CODER.md), [combat-simultane-terrain-retranchement](design/propositions/combat-simultane-terrain-retranchement.md) |
| `registre-29-2026-09-16` | 2026-09-16 | Terrain (code 1a) : d'abord cuire un terrain réel, puis un ADR ; ne se règle pas avant. | en attente | [RESTE-A-CODER](RESTE-A-CODER.md), [combat-simultane-terrain-retranchement](design/propositions/combat-simultane-terrain-retranchement.md) |
| `registre-30-2026-09-16` | 2026-09-16 | Retranchement (code 2a) : bonus du défenseur plafonné à 5-10 %. | en attente | [RESTE-A-CODER](RESTE-A-CODER.md), [combat-simultane-terrain-retranchement](design/propositions/combat-simultane-terrain-retranchement.md) |
| `registre-31-2026-09-17` | 2026-09-17 | Découper les régions géantes à la cuisson, au prochain wipe (code 2a). | en attente | [RESTE-A-CODER](RESTE-A-CODER.md), [ADR 0020](adr/0020-domination-par-couleur.md) |
| `marque-1c-2026-10-02` | 2026-10-02 | Entre amis maintenant, public plus tard : ni juridique ni référencement avant l'ouverture. | en vigueur | [marque-et-site](marque/marque-et-site.md) |
| `marque-2b-2026-10-02` | 2026-10-02 | Chercher un nom maintenant. | en vigueur | [marque-et-site](marque/marque-et-site.md) |
| `marque-3a-2026-10-02` | 2026-10-02 | Le temps de jeu par jour se mesure à la prochaine vraie partie. | en vigueur | [marque-et-site](marque/marque-et-site.md) |
| `plan-1b-2026-10-02` | 2026-10-02 | Le parcours d'invitation (lot A) part tout de suite. | en vigueur | [marque-et-site](marque/marque-et-site.md) |
| `plan-2a-2026-10-02` | 2026-10-02 | Le nom sera français (ADR 0016). | en vigueur | [marque-et-site](marque/marque-et-site.md) |
| `plan-3b-2026-10-02` | 2026-10-02 | Deux films : 30 s avec son, boucle muette de 8 s. | en vigueur | [marque-et-site](marque/marque-et-site.md) |
| `plan-4b-2026-10-02` | 2026-10-02 | Les vidéos vivent dans un dossier média du VPS, hors du dépôt. | en vigueur | [marque-et-site](marque/marque-et-site.md) |
| `menage-1c-2026-10-04` | 2026-10-04 | Le ménage de la doc suit une seule voie, fusionnée : les prompts `menage-2` à `menage-6` remplacent les prompts outillage 21, 22, 24, 25, 27 à 33 et 72 et le temps 2 du coffre (24, 25 et 30 réutilisés, recalés) ; 23 et 26, corrections de fond, restent ; en-têtes YAML limités aux ADR, fiches et propositions, le statut des autres notes vit dans `WWS/INDEX.md`. | en vigueur | [état de la série outillage](rapports/2026-10-04-etat-outillage.md) |
| `menage-2a-2026-10-04` | 2026-10-04 | Les binaires lourds (captures, vieux film, bruts de sprites) sortent de `HEAD` ; l'historique git n'est pas réécrit. | en vigueur | [menage-1-binaires-hors-du-depot](prompts/code/ready/menage-1-binaires-hors-du-depot.md) |
| `menage-3a-2026-10-04` | 2026-10-04 | Le Project claude.ai ne garde que `FORMAT-REPONSE.md` ; handoffs, audits, état et teaser en sont retirés (copie dans `Claude outputs/project-claude-ai/`). | en vigueur | [LISEZ-MOI](../../Claude%20outputs/project-claude-ai/LISEZ-MOI.md) |

`S2` à `S9` et leurs sous-lots (`S5b`, `S6a-2b.1`…) sont les lots d'exécution du pillage dans [RESTE-A-CODER](RESTE-A-CODER.md) : des tâches, pas des décisions. La seule qui a un effet de règle, `S5b`, est la révision `ADR 0019 rév. S5b 2026-09-09` plus bas.

## Décisions datées sans numéro

| Identifiant | Date | Décision | État | Source |
|---|---|---|---|---|
| `pierre-2026-08-29-leurre-retire` | 2026-08-29 | Le leurre est retiré du jeu ; une pile vide redevient un refus franc. | en vigueur | [04-information](design/04-information.md), [retirer-le-leurre](prompts/code/done/retirer-le-leurre.md) |
| `pierre-2026-08-29-presse-score` | 2026-08-29 | Pour soi un score détaillé, pour les autres un score général. | révisée par `43-2026-08-31` puis `80-2026-09-06` | [page-de-presse-et-scores](design/propositions/page-de-presse-et-scores.md) |
| `pierre-2026-08-30-clic-droit-agit` | 2026-08-30 | La carte au clic droit agit, la popin lit ; le clic gauche sur une troupe ouvre cartouche et rose. | en vigueur | [popin-lit-carte-agit](prompts/code/done/popin-lit-carte-agit.md), [00-regles](design/contrats-de-vue/00-regles.md) |
| `pierre-2026-08-30-couche-permanente` | 2026-08-30 | Ce qui a une position ne vit pas dans un panneau : carte « à faire maintenant ». | en vigueur | [a-faire-maintenant](prompts/code/done/a-faire-maintenant.md) |
| `pierre-2026-08-31-voir-le-pays-retire` | 2026-08-31 | « Voir le pays » est retiré ; la rose ne s'ouvre que là où un ordre existe. | en vigueur | [ADR 0024](adr/0024-engagement-intentionnel-et-forces-posees-visibles.md) (indirect) |
| `pierre-2026-08-31-capitulation` | 2026-08-31 | Un joueur peut déclarer sa défaite et observer ; transfert du commandement. | en vigueur | [capitulation-et-observateur](prompts/code/done/capitulation-et-observateur.md) |
| `pierre-2026-09-08-pas-de-worktree` | 2026-09-08 | Pas de worktree séparé sauf demande explicite de Pierre. | en vigueur | `CLAUDE.md` racine, « Instructions » |
| `pierre-2026-10-17-code-fait-foi` | 2026-10-17 | Le code et ses tests font foi sur ce que le jeu fait ; les ADR gardent le pourquoi, les fiches l'intention et se figent une fois codées ; `CLAUDE.md` racine redevient une carte, son récit est figé à part. | en vigueur | `CLAUDE.md` racine, « Sources de vérité » ; [récit figé](technique/recit-du-code-2026-10-17.md) |
| `pierre-2026-09-09-stockage-unique` | 2026-09-09 | L'entrepôt est le seul stockage national ; `depot` n'est plus qu'une clé historique. | en vigueur | [ADR 0017](adr/0017-format-de-saison-et-socle-place.md), [ADR 0015](adr/0015-economie-v2-ressources-localisees.md) |
| `pierre-2026-09-09-pillage-v1` | 2026-09-09 | Pillage V1 : surplus de l'entrepôt au-dessus de `BASE_CAP`, capacité effective par troupe, pillage dirigé avec riposte. | en vigueur | [pillage-et-butin](design/propositions/pillage-et-butin.md) |
| `pierre-2026-09-15-canal-gue` | 2026-09-15 | Un canal est de l'eau et un gué (type de cellule `CANAL`). | en vigueur | [canaux-franchissables](prompts/code/done/canaux-franchissables.md) |
| `pierre-2026-09-15-portes-sans-poche` | 2026-09-15 | Aucune porte maritime ne découpe une poche de terre. | en vigueur | [portes-sans-poche](prompts/code/done/portes-sans-poche.md) |
| `pierre-2026-09-17-disque` | 2026-09-17 | Une région est tenue dès qu'une de ses cellules entre dans le disque (révise ADR 0020 §1). | en vigueur | [tenir-ce-que-le-cercle-touche](prompts/code/done/tenir-ce-que-le-cercle-touche.md), [ADR 0020](adr/0020-domination-par-couleur.md) |
| `pierre-2026-09-17-objectifs-neutres` | 2026-09-17 | Objectifs neutres : palette d'archétypes, garnisons par paliers, siège irrégulier. | en vigueur (lot 1) | [objectifs-neutres](design/propositions/objectifs-neutres.md), [ADR 0024](adr/0024-engagement-intentionnel-et-forces-posees-visibles.md) |
| `pierre-2026-09-18-cargo-en-mer` | 2026-09-18 | Un cargo peut rester en mer avec des unités dedans (révise `72a-2026-09-04`). | en vigueur | [rester-en-mer](prompts/code/done/rester-en-mer.md), [ADR 0019](adr/0019-mouvement-libre-et-troupes-posees.md) |
| `pierre-2026-10-14-deux-modes` | 2026-10-14 | Deux modes sur un même support : Blitz (1-2 h, à la Advance Wars) et Mondiale (7 jours) ; capture à l'infanterie, combat à l'initiative, six ressources, points stratégiques. | Blitz codée, Mondiale non codée | [gameplay-deux-modes](design/propositions/gameplay-deux-modes-2026-10-14.md) |
| `pierre-2026-10-17-vision` | 2026-10-17 | La Mondiale est le jeu, la Blitz l'atelier des pièces ; boussole réécrite ; plus de plafonds de troupes ni d'emplacements, l'économie seul frein ; durée de saison au salon ; pas de prod avant le domaine. | décidé, non codé | [ADR 0027](adr/0027-la-mondiale-au-centre.md) |
| `pierre-2026-10-20-points-moderent` | 2026-10-20 | Un point stratégique donne un avantage mesuré (−20 % de plein à Singapour, 1 cran de plein par 12 h à Bakou, un mouvement maritime hors slot à Halifax), jamais une règle annulée ; additif, sans boule de neige. | en vigueur | [ADR 0032](adr/0032-les-points-moderent.md) |

## Les ADR et leurs révisions

Les dates des ADR 0001 à 0018 ne sont pas écrites dans les fichiers : la date retenue est celle du premier commit git, marquée « (git) ». L'état est celui du fichier ; le [README des ADR](adr/README.md) en diffère pour plusieurs lignes.

| ADR | Date | Titre | État |
|---|---|---|---|
| [ADR 0001](adr/0001-saison-longue-asynchrone.md) | 2026-08-11 (git) | Saison longue asynchrone plutôt que parties de 30 minutes | acceptée |
| [ADR 0002](adr/0002-plan-incline-plutot-que-globe.md) | 2026-08-11 (git) | Plan incliné à faux horizon plutôt que globe | acceptée |
| [ADR 0003](adr/0003-courbure-cpu.md) | 2026-08-11 (git) | Courbure appliquée CPU et non dans le vertex shader | acceptée |
| [ADR 0004](adr/0004-avant-postes-plutot-que-conquete.md) | 2026-08-11 (git) | Avant-postes ponctuels plutôt que conquête de provinces | acceptée |
| [ADR 0005](adr/0005-brouillard-par-defaut.md) | 2026-08-11 (git) | Brouillard de guerre par défaut | acceptée, révisée trois fois |
| [ADR 0006](adr/0006-slots-de-mouvement.md) | 2026-08-11 (git) | Slots de mouvement comme régulateur central | acceptée |
| [ADR 0007](adr/0007-epoque-1940.md) | 2026-08-11 (git) | Époque 1940 | acceptée |
| [ADR 0008](adr/0008-combat-par-interception.md) | 2026-08-11 (git) | Combat par interception et rejeu | acceptée, précisée par 0014, révisée par 0021 et 0024 |
| [ADR 0009](adr/0009-pseudo-et-code-plutot-que-comptes.md) | 2026-08-12 (git) | Pseudo et code de partie plutôt que comptes | « acceptée » dans le fichier ; révisée par 0022 |
| [ADR 0010](adr/0010-convex-auto-heberge-sur-vps.md) | 2026-08-12 (git) | Convex auto-hébergé sur VPS | acceptée |
| [ADR 0011](adr/0011-premiere-tranche-du-schema-de-jeu.md) | 2026-08-12 (git) | Première tranche du schéma de jeu avant la fermeture du 🔴 | acceptée, révisée par 0014 |
| [ADR 0012](adr/0012-trajets-multimodaux-sur-grille.md) | 2026-08-12 (git) | Trajets multimodaux sur grille raster | acceptée, révisée 04/09 et 18/09 |
| [ADR 0013](adr/0013-batiments-de-projection-sur-regions.md) | 2026-08-14 (git) | Bâtiments de projection posés sur des régions | acceptée, révisée 04/09 |
| [ADR 0014](adr/0014-troupes-discretes-et-combat-sequentiel.md) | 2026-08-14 (git) | Troupes discrètes et combat simultané | acceptée, précisée par 0018, révisée 16/09 |
| [ADR 0015](adr/0015-economie-v2-ressources-localisees.md) | 2026-08-15 (git) | Économie v2 : ressources localisées et filières courtes | acceptée, révisée six fois |
| [ADR 0016](adr/0016-code-anglais-jeu-francais.md) | 2026-08-15 (git) | Code en anglais, jeu en français | acceptée |
| [ADR 0017](adr/0017-format-de-saison-et-socle-place.md) | 2026-08-17 (git) | Format de saison, socle placé, plafond de stockage | acceptée, révisée sept fois |
| [ADR 0018](adr/0018-anatomie-de-la-passe-de-resolution.md) | 2026-08-18 (git) | Anatomie de la passe de résolution, table unique, munitions au tir seul | acceptée, §3, §5, §7 et §2.5 révisés |
| [ADR 0019](adr/0019-mouvement-libre-et-troupes-posees.md) | 2026-08-18 | Mouvement libre, troupes posées, avant-poste qui ravitaille | acceptée, §2, §3, §5, §6 révisés |
| [ADR 0020](adr/0020-domination-par-couleur.md) | 2026-08-31 | Domination par couleur : le territoire devient le score | acceptée, révisée cinq fois |
| [ADR 0021](adr/0021-portee-de-detection-et-postures.md) | 2026-08-31 | Portées passives et comportement dérivé de l'ordre | acceptée, révisée 08/09 ; §2 et §3 révisés 13/09 |
| [ADR 0022](adr/0022-comptes-pseudo-et-mot-de-passe.md) | 2026-09-06 | Comptes pseudo et mot de passe, sans e-mail | acceptée, révisée 12/09 |
| [ADR 0023](adr/0023-geographie-serveur-en-raster.md) | 2026-09-12 | La géographie du serveur est un raster à la maille de la grille | acceptée, complétée 13/09 |
| [ADR 0024](adr/0024-engagement-intentionnel-et-forces-posees-visibles.md) | 2026-09-13 | L'engagement est intentionnel, une force posée se voit dans la portée | acceptée, §4 précisé 17/09 |

### Révisions datées

| Identifiant | Date | Contenu | Source |
|---|---|---|---|
| `ADR 0005 rév. 2026-08-31` | 2026-08-31 | Le secret change d'objet : la couleur des territoires est connue et se périme. | [ADR 0005](adr/0005-brouillard-par-defaut.md) |
| `ADR 0005 rév. 2026-09-08` | 2026-09-08 | Détection événementielle précisée par l'ADR 0021. | [ADR 0005](adr/0005-brouillard-par-defaut.md) |
| `ADR 0005 rév. 2026-09-10` | 2026-09-10 | Rumeur de butin et caisse : première fuite publique assumée (84a). | [ADR 0005](adr/0005-brouillard-par-defaut.md) |
| `ADR 0008 rév. 2026-08-14` | 2026-08-14 | Précision : le combat reste automatique, avec interception et rejeu. | [ADR 0008](adr/0008-combat-par-interception.md) |
| `ADR 0008 rév. 2026-09-08` | 2026-09-08 | Contact par réévaluation événementielle, plus de rayon fixe. | [ADR 0008](adr/0008-combat-par-interception.md) |
| `ADR 0008 rév. 2026-09-13` | 2026-09-13 | Le contact n'est plus automatique : rien ne se bat sans ordre. | [ADR 0008](adr/0008-combat-par-interception.md) |
| `ADR 0011 rév. 2026-08-14` | 2026-08-14 | Les troupes deviennent discrètes et localisées (ADR 0014). | [ADR 0011](adr/0011-premiere-tranche-du-schema-de-jeu.md) |
| `ADR 0012 rév. 2026-09-04` | 2026-09-04 | Une route combinée finit à la côte (72a). | [ADR 0012](adr/0012-trajets-multimodaux-sur-grille.md) |
| `ADR 0012 rév. 2026-09-18` | 2026-09-18 | Une route combinée peut finir en mer. | [ADR 0012](adr/0012-trajets-multimodaux-sur-grille.md) |
| `ADR 0013 rév. 2026-09-04` | 2026-09-04 | Le port a un point, les autres bâtiments un centroïde (71b, 73a). | [ADR 0013](adr/0013-batiments-de-projection-sur-regions.md) |
| `ADR 0014 rév. 2026-09-16` | 2026-09-16 | Résolution simultanée (1b). | [ADR 0014](adr/0014-troupes-discretes-et-combat-sequentiel.md) |
| `ADR 0015 rév. 2026-08-15` | 2026-08-15 | Critère de distribution renforcé, correction, deux règles d'implémentation. | [ADR 0015](adr/0015-economie-v2-ressources-localisees.md) |
| `ADR 0015 rév. 2026-08-24` | 2026-08-24 | Règle du grisé : l'écran de construction est contextuel. | [ADR 0015](adr/0015-economie-v2-ressources-localisees.md) |
| `ADR 0015 rév. 2026-08-25` | 2026-08-25 | File de chantier prépayée. | [ADR 0015](adr/0015-economie-v2-ressources-localisees.md) |
| `ADR 0015 rév. 2026-09-04` | 2026-09-04 | Second verrou local : niveau du site (67b, 66a). | [ADR 0015](adr/0015-economie-v2-ressources-localisees.md) |
| `ADR 0015 rév. 2026-09-09` | 2026-09-09 | Stockage unique. | [ADR 0015](adr/0015-economie-v2-ressources-localisees.md) |
| `ADR 0015 rév. 2026-09-13` | 2026-09-13 | Le joueur pose son QG (1b). | [ADR 0015](adr/0015-economie-v2-ressources-localisees.md) |
| `ADR 0017 rév. 2026-08-18` | 2026-08-18 | Le plafond de bâtisses appartient au format. | [ADR 0017](adr/0017-format-de-saison-et-socle-place.md) |
| `ADR 0017 rév. 2026-08-25` | 2026-08-25 | Le socle se lit sur les gisements du pays. | [ADR 0017](adr/0017-format-de-saison-et-socle-place.md) |
| `ADR 0017 rév. 2026-08-27` | 2026-08-27 | Le format se choisit, l'horloge devient optionnelle. | [ADR 0017](adr/0017-format-de-saison-et-socle-place.md) |
| `ADR 0017 rév. 2026-08-31` | 2026-08-31 | Le format de saison est retiré, seule l'horloge survit. | [ADR 0017](adr/0017-format-de-saison-et-socle-place.md) |
| `ADR 0017 rév. 2026-09-09` | 2026-09-09 | Stockage unique et désactivation d'un entrepôt. | [ADR 0017](adr/0017-format-de-saison-et-socle-place.md) |
| `ADR 0017 rév. 2026-09-13` | 2026-09-13 | Le QG entre dans le socle (1b). | [ADR 0017](adr/0017-format-de-saison-et-socle-place.md) |
| `ADR 0017 rév. 2026-09-14` | 2026-09-14 | Alliage de campagne de 500 à 400. | [ADR 0017](adr/0017-format-de-saison-et-socle-place.md) |
| `ADR 0018 rév. 2026-08-25` | 2026-08-25 | §7 renversée : munitions facturées au tir (18a). | [ADR 0018](adr/0018-anatomie-de-la-passe-de-resolution.md) |
| `ADR 0018 rév. 2026-09-08` | 2026-09-08 | §3 et §5 révisés par l'ADR 0021. | [ADR 0018](adr/0018-anatomie-de-la-passe-de-resolution.md) |
| `ADR 0018 rév. 2026-09-16` | 2026-09-16 | §2.5 et §3 révisés par la résolution simultanée. | [ADR 0018](adr/0018-anatomie-de-la-passe-de-resolution.md) |
| `ADR 0019 rév. 2026-08-18` | 2026-08-18 | Amendé le 18/08 ; trois précisions ratifiées le soir (la première amendée le 19/08). | [ADR 0019](adr/0019-mouvement-libre-et-troupes-posees.md) |
| `ADR 0019 rév. 2026-08-27` | 2026-08-27 | La porte navale se lit à l'embarquement, jamais depuis l'eau. | [ADR 0019](adr/0019-mouvement-libre-et-troupes-posees.md) |
| `ADR 0019 rév. 2026-09-04` | 2026-09-04 | Les navires ne roulent pas (72a). | [ADR 0019](adr/0019-mouvement-libre-et-troupes-posees.md) |
| `ADR 0019 rév. 2026-09-08` | 2026-09-08 | §5 et détection révisés par l'ADR 0021. | [ADR 0019](adr/0019-mouvement-libre-et-troupes-posees.md) |
| `ADR 0019 rév. S5b 2026-09-09` | 2026-09-09 | Pillage : présence durable de 2 h au point du site (D3). | [ADR 0019](adr/0019-mouvement-libre-et-troupes-posees.md) |
| `ADR 0019 rév. 2026-09-09` | 2026-09-09 | « À flot » se lit sur la grille de routage. | [ADR 0019](adr/0019-mouvement-libre-et-troupes-posees.md) |
| `ADR 0019 rév. 2026-09-13` | 2026-09-13 | §3 et §6 révisés par l'ADR 0024. | [ADR 0019](adr/0019-mouvement-libre-et-troupes-posees.md) |
| `ADR 0019 rév. 2026-09-18` | 2026-09-18 | Rester en mer. | [ADR 0019](adr/0019-mouvement-libre-et-troupes-posees.md) |
| `ADR 0020 rév. 2026-08-31` | 2026-08-31 | Le rayon d'un avant-poste suit son niveau ; §10 et §11 ajoutés le soir. | [ADR 0020](adr/0020-domination-par-couleur.md) |
| `ADR 0020 rév. 2026-09-04` | 2026-09-04 | Un avant-poste tient la région où il se tient (absorbée le 17/09). | [ADR 0020](adr/0020-domination-par-couleur.md) |
| `ADR 0020 rév. 2026-09-15a` | 2026-09-15 | Précision : un avant-poste se monte (§10). | [ADR 0020](adr/0020-domination-par-couleur.md) |
| `ADR 0020 rév. 2026-09-15b` | 2026-09-15 | Fonder se paie et prend du temps, tenir ne coûte plus rien (7a). | [ADR 0020](adr/0020-domination-par-couleur.md) |
| `ADR 0020 rév. 2026-09-17` | 2026-09-17 | Tenu par le disque, plus par le pôle. | [ADR 0020](adr/0020-domination-par-couleur.md) |
| `ADR 0021 rév. 2026-09-08` | 2026-09-08 | Révision de la détection. | [ADR 0021](adr/0021-portee-de-detection-et-postures.md) |
| `ADR 0021 rév. 2026-09-13` | 2026-09-13 | §2 et §3 révisés par l'ADR 0024. | [ADR 0021](adr/0021-portee-de-detection-et-postures.md) |
| `ADR 0022 rév. 2026-09-12` | 2026-09-12 | La porte (`accounts.me`) ne lit pas les places. | [ADR 0022](adr/0022-comptes-pseudo-et-mot-de-passe.md) |
| `ADR 0023 rév. 2026-09-13` | 2026-09-13 | L'ancrage : la direction région vers cellules est totale. | [ADR 0023](adr/0023-geographie-serveur-en-raster.md) |
| `ADR 0024 rév. 2026-09-17` | 2026-09-17 | §4 : l'objectif neutre est l'exception nommée du relevé préalable. | [ADR 0024](adr/0024-engagement-intentionnel-et-forces-posees-visibles.md) |

## Sans source propre dans WWS/

- **12a cité pour autre chose que sa source.** Le [CLAUDE.md racine](../../CLAUDE.md) cite « décisions 12a et 13a » pour « le mouvement s'ordonne depuis la carte ». Dans [flux-mouvement-en-carte](design/propositions/flux-mouvement-en-carte.md), 12a est la règle « aucune troupe posée librement », annulée par l'ADR 0019 ; [00-regles](design/contrats-de-vue/00-regles.md) date 12a et 13a du 30/08, alors que le flux dit 18/08.
- **Collisions de codes.** `1a` désigne cinq décisions différentes (06/09, 13/09 — deux sens —, 15/09 — deux sens —, 16/09), `3a` trois (15/09, 16/09, et un `3a-?` non daté), `4a` deux (13/09 et 16/09), `1b` trois (25/08, 13/09, 16/09). Seule la date distingue ces codes.
- **« Voir le pays » retiré (31/08).** Aucun document de décision : seulement l'ADR 0024 §3 (« règle du 31/08 ») et le commit `c09f73f` du 31/08. Le prompt du 30/08 le liste encore.
- **Pas de worktree (08/09).** Gravée dans `CLAUDE.md` racine, « Instructions » ; l'origine est dans la mémoire utilisateur, hors du dépôt.
- **Stockage unique (09/09).** Pas de document de décision : seulement les bannières des ADR 0015 et 0017 ; le prompt [stockage-unique](prompts/code/done/stockage-unique.md) décrit l'exécution.
- **75 et 77a.** Cités une seule fois, dans l'[ADR 0022](adr/0022-comptes-pseudo-et-mot-de-passe.md) ; ce que chacun tranche n'est pas écrit.
- **Démantèlement d'un avant-poste (« décision du 16/09 »).** Sans document propre : il recoupe `registre-27-2026-09-16` et `1a-2026-09-16`.
- **Question 21.** Citée trois fois par `src/domain/movement-orders.ts` comme autorité, introuvable dans WWS/ ; l'ADR 0019 a remplacé la première version qui s'y référait.
- **Dates manquantes.** `6c`, `9a`, `51`, `53a` et le `3a` cité le 13/09 : aucune date écrite. `40a`, `46`, `54a`, `55b`, `63a`, `69a`, `70b` : dates déduites par encadrement avec leurs voisins.
- **Écarts ADR / README.** ADR 0009 « acceptée » dans le fichier mais révisée par 0022 ; l'[index des ADR](adr/README.md) omet des révisions des ADR 0008, 0012, 0013, 0014, 0015, 0017, 0019, 0020 et 0024, et son titre de l'ADR 0014 dit « séquentiel » quand le fichier dit « simultané ».
- **Index de la note.** La clé `voir` pointe vers `../INDEX.md`, qui n'existe pas encore.
