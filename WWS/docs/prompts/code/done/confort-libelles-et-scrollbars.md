# Prompt Claude Code — confort : les libellés disent leur phrase, les scrollbars s'habillent

Lis `CLAUDE.md`, `CONVENTIONS.md`. Ne commit pas, ne push pas. Deux passes purement front,
aucune règle de jeu.

## 1 — Tout chiffre porte son nom complet au premier regard

Le constat de Pierre : « fer — 2 tenus » ne se comprend pas à la première partie. La règle à
appliquer partout dans `src/i18n/fr.ts` et les surfaces qui composent leurs propres libellés :
**un chiffre seul ne suffit jamais, la ligne dit sa phrase entière** — « 2 gisements sur
votre territoire », « 3 poses offertes restantes », « demande un quartier général niveau 3 ».
Fais l'inventaire des libellés elliptiques (les écrans d'économie et de construction d'abord,
le reste ensuite) et allonge-les en français de presse — sobre, sans jargon, sans emoji. Le
vocabulaire imposé de `WWS/CONTEXT.md` reste la loi. Si un libellé long casse une mise en
page, c'est la mise en page qui s'adapte (troncature avec titre au survol en dernier
recours), pas la phrase qui s'ampute.

## 2 — Les scrollbars

Partout où une surface scrolle (fenêtres, panneaux, listes, la feuille Newspaper), la
scrollbar prend le style du journal : fine (8-10 px), pouce encre (`--ink`) sur gouttière
papier assombri, coins carrés — pas d'arrondi moderne. `::-webkit-scrollbar*` pour
Chrome/Edge/Safari + `scrollbar-width: thin` et `scrollbar-color` pour Firefox, défini une
fois dans `src/styles/index.css` sur les conteneurs scrollables (une classe ou un sélecteur
global raisonnable), pas copié-collé par fenêtre.

## Vérifications

`npm run verifier`, puis contrôle visuel : fenêtre Économie/Industrie, panneau de
construction, journal, accueil — libellés lisibles par un joueur qui découvre, scrollbars
cohérentes dans Chrome et Firefox.
