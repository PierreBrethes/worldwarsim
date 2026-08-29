# Prompt Claude Code — le tampon d'état et la manchette (lot des petits sûrs, 1/5)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`. Ne commit pas, ne push pas.

## 1. Le composant tampon

Un composant `Stamp` (src/shell/ ou à côté des composants du plateau, selon la maison) :
cadre au trait 1,5 px, casse haute, léger crènelage (`letter-spacing` large), **rotation
subtile fixe** (±1°, déterministe — dérivée du texte, pas aléatoire au rendu), deux encres :
`--ink` par défaut, `--critical` pour ce qui exige l'attention. Style hérité des
boutons-tampons existants (POSÉE, COMPRIS) mais en **état**, non cliquable.

**Règle d'usage, à écrire dans le commentaire du composant** : un tampon = un acte ou un état
administratif constaté, jamais une simple étiquette ; deux tampons par surface au plus ;
l'encre rouge réservée.

Premiers usages, et pas plus :
- **Journal** : la sorte de chaque dépêche tamponnée dans la marge — les sortes d'alarme
  (attaque subie, avant-poste désactivé/détruit, tir à sec, relevé) en rouge, le reste à
  l'encre. Petit corps, la manchette de la dépêche reste la vedette.
- **Avant-poste** : DÉSACTIVÉ / DÉTRUIT sur son panneau.
- **Force repérée sans composition** : NON IDENTIFIÉ.
- **Saison conclue** : SAISON CLOSE en tête du journal.

## 2. La manchette (variante B, choisie par Pierre le 29/08)

Le logo du site est un composant CSS, pas une image : « WW » en Oswald (ou la condensée déjà
chargée par le front — n'ajoute PAS de nouvelle fonte sans vérifier ce qui est là) sur pavé
rouge `--critical`, **tourné de −2°** (le même geste que le tampon), suivi de « SIM » en
didone/serif grasse à l'encre ; filet double au-dessus, filet simple + ligne de date
(« LE MONDE EN JEU — ÉDITION DE GUERRE ») dessous. À poser sur l'accueil (`accueil.tsx`) en
tête, et en version réduite (le seul pavé « WW » + « SIM ») là où l'interface a un en-tête.
Favicon : SVG statique dans `public/` — pavé rouge, « WW » clair, coins droits — déclaré dans
`index.html`.

## Vérifications

`npm run verifier`. À la main : journal → tampons de marge, deux max par dépêche, rouge
seulement sur les alarmes ; un avant-poste désactivé → DÉSACTIVÉ ; accueil → manchette ;
onglet navigateur → favicon. Contraste vérifié sur `--paper` (le pavé rouge doit rester
lisible).
