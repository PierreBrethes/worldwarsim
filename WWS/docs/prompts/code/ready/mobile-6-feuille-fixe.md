---
type: prompt
statut: proposé
maj: 2026-10-05
code: [src/shell/Masthead.tsx, src/shell/EntrySheet.tsx, src/shell/Newspaper.tsx, src/routes/accueil.tsx, src/routes/-index/FrontPage.tsx]
decisions: []
voir: [done/mobile-5-refonte.md]
---
# mobile-6-feuille-fixe — la manchette tient dans la feuille, la feuille ne glisse plus de côté

**En bref.** Retour de Pierre (iPhone 13 Pro, webapp installée, 05/10) : sur l'accueil la
manchette « la MANCHETTE » déborde la feuille à droite et à gauche, et la page entière se décale
au doigt vers la gauche. Les deux symptômes ont très probablement une seule cause.

Lis `CLAUDE.md`, `CONVENTIONS.md`, le commentaire « Ce que `zoom` multiplie » dans
`src/styles/index.css`, `fittedWordmark` (`src/shell/EntrySheet.tsx`), `Wordmark`/`Masthead`
(`src/shell/Masthead.tsx`), `Newspaper` (`src/shell/Newspaper.tsx`) et `CodeField`
(`src/routes/-index/FrontPage.tsx`, le précédent). Ne commit pas, ne push pas. Tidy first.

## Le diagnostic à confirmer

`fittedWordmark` calcule la taille en `cqi` sous une surface `.hud` (`zoom: --hud-scale`, 1,2
par défaut). Le commentaire d'`index.css` le dit déjà : **WebKit lit `cqi` sur la taille d'écran
puis le zoome encore** — l'enseigne sort donc ≈ 1,2 × trop large sur Safari iOS. Mesuré sur la
capture : 910 px d'enseigne pour 752 px de colonne, rapport 1,21. La webapp installée a son
propre `localStorage`, donc sa propre échelle (défaut 120 %) — c'est probablement pourquoi Pierre
ne le voit qu'en webapp. Le débordement rend la feuille plus large que l'écran, et le défileur
de `Newspaper` (`overflow-auto`) offre alors un défilement horizontal : c'est le « décalage ».

Confirme par la mesure avant de corriger (Playwright **WebKit** si installé, 390 × 844,
`--hud-scale` à 1,2 puis 1,5 ; Chromium en témoin). Si la cause est autre, arrête-toi et rapporte.

## Ce qu'il faut

1. **L'enseigne à la largeur de la feuille sur les deux moteurs.** Corrige `fittedWordmark` (ou
   ce qui la porte) pour que la taille rendue soit la même sur Chromium et WebKit, en suivant le
   procédé de `CodeField` (un conteneur qui défait le zoom pour que `cqi` et la longueur
   s'écrivent dans la même unité) ou mieux si tu en trouves un. Le plafond `max` reste ce qu'il
   dit au bureau. Toutes les feuilles qui l'appellent : la une, `/connexion`, `/rejoindre/CODE`,
   l'accueil.
2. **La feuille ne défile que verticalement**, quoi qu'il déborde un jour : le défileur de
   `Newspaper` passe en `overflow-y: auto` et `overflow-x: clip` (ou `hidden` si `clip` pose
   problème avec le `m-auto`). Le pincement d'accessibilité reste permis — pas de
   `user-scalable=no`, pas de `touch-action` qui l'interdise.
3. Vérifie les piles de papier décoratives (`-right-[11px]`, `-left-[9px]`) : elles ne doivent
   pas créer de largeur défilable à 320 px.

## Preuve attendue

- Un test (ou une vérification Playwright consignée) : sur l'accueil, la connexion, le salon et
  l'invitation, à 320, 375 et 390 px de large, `scrollWidth <= clientWidth` du défileur, et le
  bord droit de l'enseigne ≤ bord droit de la feuille, sur WebKit **et** Chromium, à 120 % et
  150 %.
- `npm run verifier` vert.
- Rapport : la cause confirmée (ou infirmée), la taille de l'enseigne avant/après sur les deux
  moteurs.
