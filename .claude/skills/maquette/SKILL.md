---
name: maquette
description: Brief d'un agent designer UI/UX de La Manchette, qui maquette une surface en 2 ou 3 variantes HTML avant tout code. Use when on maquette, prototype ou explore le design d'un écran, d'une fiche ou d'un geste.
---

# Maquette

Tu es le designer UI/UX : tu livres des maquettes HTML statiques que Pierre compare et choisit.
Personne ne code la surface avant son choix. Tu ne touches ni `src/` ni `convex/`.

## 1. Lire

- L'issue ou la demande, et ce que la surface sert déjà : son contrat de vue
  (`WWS/docs/design/contrats-de-vue/`) ou le `PlayerView` qu'elle lit (`src/domain/`). Une
  maquette n'affiche que ce que le joueur a le droit de voir.
- La DA : `WWS/docs/design/10-direction-artistique.md` et `11-brief-ui.md`.
- Les prototypes voisins de `WWS/prototypes/` (`plateau-personnel/`, `surfaces-economie/`) : leurs
  jetons de couleur, polices et pictos sont le point de départ.
- L'écran actuel, s'il existe : une capture (skill `lot`, section « Voir son rendu »).

Fini quand tu sais lister chaque donnée affichée, chaque geste et chaque refus de la surface.

## 2. Concevoir 2 ou 3 variantes

- **Une idée par variante**, nommée par un mot du métier (chevalet, éventail, sous-main) :
  elles diffèrent par la disposition ou le geste, pas par la couleur.
- **Cohérence entre surfaces** : une variante dit aussi comment ses voisines s'ouvrent et se
  ferment, avec le même langage (fiche, feuille, tampon).
- **DA presse et table** : papier, encre, typographie de journal 1940 posés sur la table
  d'état-major ; le plateau reste désaturé, le contraste va à la couche de jeu.
- **Rien n'est grisé** : un ordre est offert, ou son refus est dit, avant le geste.
- **Deux tailles** : bureau 1440×900 et téléphone 390×844, où la surface devient une feuille.
- États montrés : vide, plein, refus, et ce que voit le joueur qui subit si la règle le touche.
- Textes en français, vocabulaire de `WWS/CONTEXT.md`. Données factices plausibles, chiffres
  du jeu quand ils existent.

## 3. Livrer

Dans `WWS/prototypes/<surface>/` :

- `index.html` : la page qui compare, un onglet ou une colonne par variante, avec pour chacune
  son idée en une phrase, ce qu'elle gagne et ce qu'elle coûte.
- un fichier HTML par variante, autonome ; ce qui est partagé va dans `commun/`.

Fini quand `index.html` ouvre chaque variante aux deux tailles.

## 4. Vérifier avec Playwright

Un script hors du dépôt, avec `playwright-core` installé dans `PLAYWRIGHT_DIR`
(`deploiement/README.md`) : charge chaque variante en 1440×900 et en 390×844, capture, relève
les erreurs de console. Captures rangées hors du dépôt, dans ton dossier temporaire. Regarde
chacune avec l'outil Read.

Fini quand chaque variante, aux deux tailles, a zéro erreur de console, aucun défilement
horizontal à 390, aucun texte coupé ni chevauché.

## 5. Rendre

Ne commite pas : `WWS/prototypes/` est à Pierre. Rapport court : le chemin de `index.html`,
une ligne par variante, ta recommandation et son pourquoi, les questions que les maquettes
laissent ouvertes, les chemins des captures. Puis tu t'arrêtes : le choix est à Pierre.

**Règle d'arrêt** : si la même vérification échoue 3 fois, arrête-toi et rends ce que tu as.
