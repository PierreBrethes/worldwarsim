# La page de presse — scores et classement (proposition, 29/08/2026)

**Décision de Pierre (29/08)** : pour soi, un score détaillé par catégorie ; pour les autres,
**un seul score général**, qui donne l'ordre de grandeur, jamais le détail.

> **Note du 31/08/2026 — tranché par Pierre, la proposition tient et s'ajuste.** La cadence de
> publication est fixée : **une édition toutes les 2 heures** (job planifié serveur, fréquence
> paramétrable) — jamais en direct, comme le §1 l'exigeait. S'y ajoute une quatrième catégorie,
> née de l'ADR 0020 : le **territoire** (part de carte), qui est *public, exact et permanent pour
> tous* (ADR 0020 §4) — c'est le seul chiffre hors tranche, parce que c'est le but du jeu, et la
> carte n'en révèle pas le détail (le relevé se périme, §5). Industrie et puissance militaire
> restent en tranches pour les autres ; les faits d'armes restent publics et exacts. **La victoire
> ne change pas de nature** : elle reste territoriale (seuil tenu) — le classement raconte, il ne
> couronne pas. La fenêtre : une liste ordonnée, le premier en haut, habillage presse.

## Le principe

Un classement ne perce pas le brouillard (ADR 0005) : il le résume. Trois catégories calculées
par joueur — *industrie* (bâtiments debout, paliers de QG), *puissance militaire* (troupes sur
pied, pondérées par rôle), *faits d'armes* (engagements livrés, compteur cumulatif qui ne sert
à rien d'autre qu'à raconter) — mais **publiées à deux précisions** :

- **Soi** : les trois scores exacts, détaillés, dans la fenêtre Nation.
- **Les autres** : un score général unique (somme pondérée), affiché **en tranche** — l'ordre
  de grandeur, pas la valeur. Habillage presse : « estimations de nos correspondants ».

## Ce qui reste à trancher au design fin

1. **La cadence de publication.** Jamais en direct : un score qui bouge à la seconde est un
   canal d'information — on verrait un lot de troupes livré à la minute près en regardant le
   chiffre sauter. Publication **à l'édition** (une ou deux fois par jour de jeu, à heure
   fixe), comme un journal qui paraît. La tranche amortit le reste.
2. **La largeur des tranches** — assez large pour que l'écoute et le leurre gardent leur
   valeur (savoir *où* est la force reste cher même quand on sait *combien* à peu près).
   `@a-mesurer` au premier réglage.
3. **Les faits d'armes** : public et exact (nombre d'engagements, jamais composition ni lieu) —
   c'est de l'activité, pas du renseignement.

## Garde-fous

- Le score général des autres ne se décompose jamais, même par recoupement d'écran.
- Un joueur *réduit* (victoire) l'est déjà publiquement — le classement n'ajoute rien là.
- Le classement **montre** l'adversité, il ne la crée pas : le moteur est ailleurs
  ([[objectifs-neutres]], puis pillage/QG 4). Ne pas livrer la vitrine seule en croyant
  résoudre le manque d'adversité.
