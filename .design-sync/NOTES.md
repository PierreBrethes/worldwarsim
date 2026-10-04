# Notes de synchronisation — La Manchette

- Le dépôt est une **application** (SPA Vite), pas une bibliothèque : pas d'entrée `dist/` de lib. Le
  convertisseur tourne en mode « entrée synthétisée » depuis `.design-sync/ds-src/` (`srcDir`), dont
  chaque fichier ré-exporte un composant réel de `src/` via l'alias `@/`. Ajouter un composant =
  un fichier là + une ligne `componentSrcMap` (sinon ts-morph ne le découvre pas à travers `@/`).
- `package-build.mjs` exige `--entry` pour trouver la racine du paquet (`./dist/index.js` n'existe pas,
  c'est voulu) et `--node-modules ./node_modules`.
- **Fork `overrides/bundle.mjs`** (déclaré dans `libOverrides`) : ajoute le loader `.webp` (sprites,
  2,7 Mo inlinés) et les imports Vite `?raw` (`ussr.svg?raw`, sinon le drapeau URSS est cassé).
  Le fork importe `../../.ds-sync/lib/common.mjs` ; recréer le lien : `ln -sfn ../.ds-sync/node_modules .design-sync/node_modules`.
- **CSS** : `.design-sync/ds.css` = `@import` Google Fonts (copié de `index.html`) + le CSS compilé de
  `dist/assets/index-*.css`. **À régénérer après chaque `vite build`** (le hash change) et mettre à jour
  `cssEntry` dans la config.
- **Exclus** : `Pictogram` / `IndicatorGlyph` (chargent `/pictograms/*.png`, non livrés), et tout ce qui lit
  Convex, le routeur, `PlayerView` ou three.js (`ResourceBand`, `NationBanner`, la carte, les fenêtres).
- `.d.ts` écrits à la main dans `dtsPropsFor` (le mode synthétisé ne donne que `[key: string]: unknown`) :
  à tenir en phase avec les props réelles.
- `[TOKENS_MISSING]` (37 variables `--cds-*`, `--anchor-width`…) : bruit du CSS Tailwind compilé de l'app,
  aucun composant synchronisé n'en dépend.

## Re-sync risks
- `dtsPropsFor` et `ds-src/` dérivent silencieusement si les signatures de `src/` bougent.
- `ds.css` est un instantané du build : un CSS périmé donne des aperçus périmés sans erreur.
- Polices chargées à l'exécution depuis Google Fonts (`[FONT_REMOTE]`), non embarquées.
- Les aperçus des planches (`UnitSprite`…) dépendent des manifestes de sprites ; une nation sans planche
  affiche le cadre pointillé (voulu).
- Rendu vérifié sous Chromium seul (Playwright), jamais dans claude.ai/design lui-même.
