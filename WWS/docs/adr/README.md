# Décisions d'architecture (ADR)

Une ADR grave **pourquoi** une décision a été prise, pas seulement laquelle. C'est ce qui empêche de
refaire trois fois le même débat, et ce qui permet de revenir sur un choix en connaissance de cause
quand le contexte change.

Format : Contexte → Décision → Conséquences → Ce qu'on abandonne.

| # | Décision | Statut |
|---|---|---|
| [0001](0001-saison-longue-asynchrone.md) | Saison longue asynchrone plutôt que parties de 30 min | acceptée, révisée par 0027 (deux modes, durée réglée au salon) |
| [0002](0002-plan-incline-plutot-que-globe.md) | Plan incliné à faux horizon plutôt que globe | acceptée |
| [0003](0003-courbure-cpu.md) | Courbure appliquée CPU et non dans le vertex shader | acceptée |
| [0004](0004-avant-postes-plutot-que-conquete.md) | Avant-postes ponctuels plutôt que conquête de provinces | acceptée |
| [0005](0005-brouillard-par-defaut.md) | Brouillard de guerre par défaut | acceptée, révisée par 0020, précisée par 0021, révisée le 10/09 (rumeur de butin, 84a) |
| [0006](0006-slots-de-mouvement.md) | Slots de mouvement comme régulateur central | acceptée, source des slots révisée par 0030 |
| [0007](0007-epoque-1940.md) | Époque 1940 plutôt que matériel moderne | acceptée |
| [0008](0008-combat-par-interception.md) | Combat par interception et rejeu, pas de tour par tour | acceptée, révisée par 0021 |
| [0009](0009-pseudo-et-code-plutot-que-comptes.md) | Pseudo et code de partie plutôt que comptes | révisée par 0022 |
| [0010](0010-convex-auto-heberge-sur-vps.md) | Convex auto-hébergé sur VPS plutôt que Convex cloud | acceptée |
| [0011](0011-premiere-tranche-du-schema-de-jeu.md) | Première tranche du schéma de jeu écrite avant la fermeture du 🔴 | révisée par 0014 et 0015 |
| [0012](0012-trajets-multimodaux-sur-grille.md) | Trajets multimodaux sur grille raster, calculés dans le domaine | acceptée |
| [0013](0013-batiments-de-projection-sur-regions.md) | Bâtiments de projection posés sur des régions | acceptée, portée révisée par 0015, amendée par 0019 ; révisée par 0029 (position exacte) |
| [0014](0014-troupes-discretes-et-combat-sequentiel.md) | Troupes discrètes et combat séquentiel à l'initiative de l'attaquant | acceptée, précisée par 0018 |
| [0015](0015-economie-v2-ressources-localisees.md) | Économie v2 : ressources localisées et filières courtes | acceptée, révisée par 0028 (Mondiale : cinq ressources, recherche) et 0029 (placement libre) |
| [0016](0016-code-anglais-jeu-francais.md) | Code en anglais, jeu en français via une table de traduction unique | acceptée |
| [0017](0017-format-de-saison-et-socle-place.md) | Format de saison, socle placé, et ce que borne un plafond de stockage | acceptée |
| [0018](0018-anatomie-de-la-passe-de-resolution.md) | Anatomie de la passe de résolution, table unique, munitions au tir seul | acceptée, §3 amendé par 0019, §7 renversée le 25/08, §3 et §5 révisés par 0021 |
| [0019](0019-mouvement-libre-et-troupes-posees.md) | Mouvement libre, troupes posées, et l'avant-poste qui ravitaille | acceptée, §3 et §6 révisés par 0024, §2 révisé par 0025 |
| [0020](0020-domination-par-couleur.md) | Domination par couleur : le territoire devient le score | acceptée, §10 et §11 révisés par 0027, rendu (§1, §5) révisé par 0033 |
| [0021](0021-portee-de-detection-et-postures.md) | Portées passives et comportement dérivé de l'ordre | acceptée, révisée le 08/09, §2 et §3 révisés par 0024, source des slots révisée par 0030 |
| [0022](0022-comptes-pseudo-et-mot-de-passe.md) | Comptes pseudo et mot de passe, sans e-mail | acceptée — révise 0009, révisée le 12/09 |
| [0023](0023-geographie-serveur-en-raster.md) | La géographie du serveur est un raster à la maille de la grille | acceptée — précise 0012 |
| [0024](0024-engagement-intentionnel-et-forces-posees-visibles.md) | L'engagement est intentionnel, et une force posée se voit dans la portée | acceptée — révise 0008, 0019 §3/§6, 0021 §2/§3 |
| [0025](0025-capacite-encombrement-et-embarquement-de-proximite.md) | Capacité, encombrement, et l'embarquement de proximité | acceptée — révise 0019 §2, fiche 09, décision 70b ; précisée par 0028 (jetons à bord) |
| [0026](0026-la-carte-en-figurines.md) | La carte en figurines | acceptée — révise la décision du 30/08 (cartouche, visée) et la fiche 10 (unités) ; révisée par 0028 (escouade regroupée) |
| [0027](0027-la-mondiale-au-centre.md) | La Mondiale au centre, et l'économie comme seul frein | acceptée — remplace la fiche 01, révise 0001, 0020 §10/§11 |
| [0028](0028-l-economie-de-la-mondiale.md) | L'économie de la Mondiale : cinq ressources, la logistique par les pièces | acceptée — révise 0015, 0026 (16/10), 66a, R1/R5 du 14/10, le relais ; précise 0025 |
| [0029](0029-placement-libre-et-gisements-ponctuels.md) | Le placement libre des bâtiments, et les gisements ponctuels | acceptée — révise 0013, 0015 (une bâtisse et un gisement par région) |
| [0030](0030-le-qg-batit-la-recherche-transmet.md) | Le QG bâtit, la recherche transmet | acceptée — révise 0028 §5 (slots du QG), décision 44a ; §2 révisé par 0031 ; §3 : le QG forme l'infanterie en Blitz seulement |
| [0031](0031-les-niveaux-accelerent.md) | Les niveaux accélèrent, la recherche ouvre des files | acceptée — précise la règle 1, révise 0028 §5 et 0030 §2 |
| [0032](0032-les-points-moderent.md) | Les points modèrent | acceptée — précise la règle 1 (points stratégiques), révise les règles de Singapour, Bakou et Halifax |
| [0033](0033-la-carte-sans-aplat.md) | La carte sans aplat : des contours en tirets par nation | acceptée — révise le rendu de 0020 (§1 aplat, §5 délavé) ; §2 amendé (#217) |
| [0034](0034-un-seul-socle-geographique.md) | Un seul socle géographique : une topologie à arcs partagés, deux niveaux de détail | acceptée — le moteur et le serveur s'y branchent aux lots 2 à 5 de #209 |
| [0035](0035-une-echelle-commune-des-pieces.md) | Une échelle commune des pièces : taille réelle × 1 600, l'homme ×2,5, la mer à demi | acceptée (23/10) — précise 0026 ; figurine plancher entre le rapproché et l'épingle |
| [0036](0036-une-copie-articulee-le-temps-d-une-sequence.md) | Une copie articulée, le temps d'une séquence | proposée (26/10) — précise 0035 §8 et « Carte à la demande » ; l'ombre des boucles attend Pierre |
| [0038](0038-le-batiment-est-un-diorama-sur-son-socle.md) | Le bâtiment est un diorama sur son socle | acceptée (01/11) — précise 0035 §8 (socle et cour sans mètres réels) et le rendu de 0026 |
