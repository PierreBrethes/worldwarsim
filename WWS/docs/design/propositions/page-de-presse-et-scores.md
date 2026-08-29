# La page de presse — scores et classement (proposition, 29/08/2026)

**Décision de Pierre (29/08)** : pour soi, un score détaillé par catégorie ; pour les autres,
**un seul score général**, qui donne l'ordre de grandeur, jamais le détail.

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
