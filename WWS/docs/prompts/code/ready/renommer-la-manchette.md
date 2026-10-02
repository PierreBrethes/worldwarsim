---
type: prompt
statut: validé
maj: 2026-10-02
code: [src/shell/Masthead.tsx, src/i18n/fr.ts, index.html, public/favicon.svg, src/shell/NationBanner.tsx, src/routes/salon.tsx, src/routes/rejoindre.$code.tsx, src/routes/accueil.tsx, src/routes/connexion.tsx]
decisions: [marque-nom-2026-10-02, marque-logo-2026-10-02]
voir: [../../../marque/marque-et-site.md]
---

# renommer-la-manchette — le jeu s'appelle La Manchette

**En bref.** Le nom affiché passe de WorldWarSim à **La Manchette**, et le logo du pavé « WW » +
« SIM » devient un titre de quotidien : « la » en italique, MANCHETTE en didone, un filet rouge
dessous. Le nom de code `worldwarsim` ne bouge pas.

> Décisions de Pierre du 02/10/2026 : `marque-nom-2026-10-02` (le nom) et
> `marque-logo-2026-10-02` (variante B de `Claude outputs/marque/planche-manchette.png` —
> regarde-la avant de coder). Contexte : `WWS/docs/marque/marque-et-site.md`.

Lis `CLAUDE.md`, `CONVENTIONS.md`, l'ADR 0016 (tout texte affiché passe par `fr.ts`),
`src/shell/Masthead.tsx` (`Wordmark`, `Masthead`) et ses cinq appelants — `NationBanner.tsx`
(15 px, sur le bureau sombre), `salon.tsx` et `rejoindre.$code.tsx` (17 px, sur papier),
`accueil.tsx` et `connexion.tsx` (la manchette complète, 54 px) —, `fr.masthead`, `index.html`,
`public/favicon.svg`, `src/styles/tokens.css`. Ne commit pas, ne push pas. Un chantier, un commit.

## Le dessin (une seule fonction de la taille `size`)

- **L'article** « la » : Bodoni Moda italique, graisse 500, taille `max(9, 0.5 × size)` px, posé sur
  la ligne de base du mot. Sous 9 px il devient illisible : le plancher compte plus que la
  proportion à 15 px.
- **Le mot** « Manchette », affiché en capitales (`text-transform`, le texte de `fr.ts` reste en
  casse normale), Bodoni Moda 800, `size` px, interlettrage `.01em`, interligne `.98`. Écart
  article–mot : `0.12 × size`.
- **Le filet** sous le groupe article + mot, sur toute sa largeur : hauteur `max(2, 0.09 × size)` px,
  écart `0.06 × size`, rotation `-0.6deg`, couleur `var(--critical)`. C'est ce qu'on appelle une
  manchette dans un journal : le titre et sa bande.
- **Les encres.** L'article et le mot prennent l'encre du support (`currentColor` — papier sur le
  bureau du bandeau de nation, encre sur la feuille). Le filet reste `--critical` partout : c'est
  désormais le seul aplat rouge de la charte, comme l'était le pavé.
- Le pavé « WW », sa rotation de −2° et le commentaire du « geste du tampon » partent. Récris le
  commentaire de `Wordmark` : il dit *pourquoi* ce dessin (un titre de quotidien, la manchette au
  sens propre), pas *quoi*.
- `role="img"` et `aria-label` restent, sur `fr.masthead.title`.

## Les textes et les fichiers

- `fr.masthead` : `{ article: 'la', word: 'Manchette', title: 'La Manchette', dateline: … }`. La
  ligne de date ne change pas. **`block` et `tail` disparaissent** — aucune clé morte.
- `index.html` : `<title>La Manchette</title>`.
- `public/favicon.svg` : remplace-le **tel quel** par `Claude outputs/marque/favicon-manchette.svg`
  (le M est le contour réel du glyphe Bodoni Moda, wght 800, opsz 6, cuit en chemin — ne le
  redessine pas, ne le remplace pas par un `<text>`).
- `CLAUDE.md` racine : le titre devient « La Manchette — codebase (nom de code worldwarsim) », et
  une phrase dit que le nom affiché vit dans `fr.masthead` et nulle part ailleurs.
- `WWS/CONTEXT.md` : une entrée **La Manchette** — le nom du jeu depuis le 02/10/2026 ;
  `worldwarsim` reste le nom de code (dépôt, paquet, Convex, domaine, clés de stockage).

## Ce que ce prompt ne fait pas

**Ne renomme rien d'autre** : ni le dépôt, ni `package.json`, ni le projet Convex, ni le domaine
`wws.pierrebrethes.cloud`, ni les clés `localStorage` (`wws-…` — les renommer déconnecterait tout
le monde). Pas d'aperçu de lien Open Graph, pas de page d'accueil publique, pas de film : c'est le
lot C, qui suit ce prompt.

## Cas d'acceptation

1. Aucune occurrence de `WorldWarSim` dans `src/`, `index.html` et `public/` (un test d'invariant
   par grep, à côté de ceux qui existent).
2. `fr.masthead.block` et `fr.masthead.tail` n'existent plus ; aucune clé `fr` morte.
3. `public/favicon.svg` est identique octet pour octet à `Claude outputs/marque/favicon-manchette.svg`.
4. Le logo se lit aux trois tailles réelles : 15 px sur le bureau sombre (article ≥ 9 px, mot en
   papier, filet rouge), 17 px sur papier, 54 px dans la manchette de l'accueil et de la connexion.
   Si la pile locale tourne, une capture de chacun des cinq écrans dans
   `Claude outputs/marque/captures-renommage/` ; sinon, dis-le.
5. `npm run verifier` vert.

Mets à jour `WWS/docs/marque/marque-et-site.md` (renommage livré, avec la date).
