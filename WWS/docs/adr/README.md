# Décisions d'architecture (ADR)

Une ADR grave **pourquoi** une décision a été prise, pas seulement laquelle. C'est ce qui empêche de
refaire trois fois le même débat, et ce qui permet de revenir sur un choix en connaissance de cause
quand le contexte change.

Format : Contexte → Décision → Conséquences → Ce qu'on abandonne.

| # | Décision | Statut |
|---|---|---|
| [0001](0001-saison-longue-asynchrone.md) | Saison longue asynchrone plutôt que parties de 30 min | acceptée |
| [0002](0002-plan-incline-plutot-que-globe.md) | Plan incliné à faux horizon plutôt que globe | acceptée |
| [0003](0003-courbure-cpu.md) | Courbure appliquée CPU et non dans le vertex shader | acceptée |
| [0004](0004-avant-postes-plutot-que-conquete.md) | Avant-postes ponctuels plutôt que conquête de provinces | acceptée |
| [0005](0005-brouillard-par-defaut.md) | Brouillard de guerre par défaut | acceptée, révisée par 0020, précisée par 0021, révisée le 10/09 (rumeur de butin, 84a) |
| [0006](0006-slots-de-mouvement.md) | Slots de mouvement comme régulateur central | acceptée |
| [0007](0007-epoque-1940.md) | Époque 1940 plutôt que matériel moderne | acceptée |
| [0008](0008-combat-par-interception.md) | Combat par interception et rejeu, pas de tour par tour | acceptée, révisée par 0021 |
| [0009](0009-pseudo-et-code-plutot-que-comptes.md) | Pseudo et code de partie plutôt que comptes | révisée par 0022 |
| [0010](0010-convex-auto-heberge-sur-vps.md) | Convex auto-hébergé sur VPS plutôt que Convex cloud | acceptée |
| [0011](0011-premiere-tranche-du-schema-de-jeu.md) | Première tranche du schéma de jeu écrite avant la fermeture du 🔴 | révisée par 0014 et 0015 |
| [0012](0012-trajets-multimodaux-sur-grille.md) | Trajets multimodaux sur grille raster, calculés dans le domaine | acceptée |
| [0013](0013-batiments-de-projection-sur-regions.md) | Bâtiments de projection posés sur des régions | acceptée, portée révisée par 0015, amendée par 0019 |
| [0014](0014-troupes-discretes-et-combat-sequentiel.md) | Troupes discrètes et combat séquentiel à l'initiative de l'attaquant | acceptée, précisée par 0018 |
| [0015](0015-economie-v2-ressources-localisees.md) | Économie v2 : ressources localisées et filières courtes | acceptée |
| [0016](0016-code-anglais-jeu-francais.md) | Code en anglais, jeu en français via une table de traduction unique | acceptée |
| [0017](0017-format-de-saison-et-socle-place.md) | Format de saison, socle placé, et ce que borne un plafond de stockage | acceptée |
| [0018](0018-anatomie-de-la-passe-de-resolution.md) | Anatomie de la passe de résolution, table unique, munitions au tir seul | acceptée, §3 amendé par 0019, §7 renversée le 25/08, §3 et §5 révisés par 0021 |
| [0019](0019-mouvement-libre-et-troupes-posees.md) | Mouvement libre, troupes posées, et l'avant-poste qui ravitaille | acceptée |
| [0020](0020-domination-par-couleur.md) | Domination par couleur : le territoire devient le score | acceptée |
| [0021](0021-portee-de-detection-et-postures.md) | Portées passives et comportement dérivé de l'ordre | acceptée, révisée le 08/09 |
| [0022](0022-comptes-pseudo-et-mot-de-passe.md) | Comptes pseudo et mot de passe, sans e-mail | acceptée — révise 0009 |
