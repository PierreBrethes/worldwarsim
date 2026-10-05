---
type: prompt
statut: proposé
maj: 2026-10-05
code: [src/domain/next-actions.ts, src/domain/next-actions.test.ts, src/routes/-plateau/NextActions.tsx, src/routes/plateau.tsx, src/shell/FootBar.tsx, src/shell/FootBar.test.tsx, src/i18n/fr.ts]
decisions: [Pierre 05/10 — 1a, 2a, 3 (ligne des slots retirée)]
voir: []
---
# a-faire-par-sorte — « à faire maintenant » : une ligne par sorte d'attente, pas une par lieu

**En bref.** Retour de Pierre (05/10) : au bureau, la carte « à faire maintenant » de sa partie
compte 16 lignes pour 7 sortes d'attente — six « troupes sans ordre », une par lieu (« Canada »
quatre fois), six « hors ravitaillement » sur les mêmes piles, deux bâtiments sans recrutement,
un avant-poste, les slots. Elle couvre la moitié gauche du plateau. Décisions : **une ligne par
sorte** dont le clic parcourt les occurrences (1a), sans ordre et hors ravitaillement **restent
deux sortes** (2a), la ligne des **slots libres disparaît** — le bandeau les montre déjà (3).

Lis `CLAUDE.md`, `CONVENTIONS.md`, `src/domain/next-actions.ts` et son test,
`src/routes/-plateau/NextActions.tsx`, l'appel `nextActions('card' | 'sheet')` dans
`src/routes/plateau.tsx`, `src/shell/FootBar.tsx`. Ne commit pas, ne push pas. Tidy first.
Indépendant de `mobile-6` et `mobile-7`.

## La règle

**Une ligne par sorte d'attente (`NextActionKind`), jamais deux.** Ce qui ne change pas : l'ordre
des sortes, la fondation et son dépli, « vide, la carte n'existe pas », aucune case à cocher,
rien qui se range.

- **Une seule occurrence** : la ligne est celle d'aujourd'hui, le lieu en toutes lettres
  (« 2 troupes sans ordre — Canada », « Caserne sans recrutement — Kentucky »).
- **Plusieurs occurrences** : le libellé donne le total sans lieu (« 7 troupes sans ordre »,
  « 2 bâtiments sans recrutement », « 2 avant-postes pleins à monter ») et la destination porte
  le rang : `carte 1 / 6 ›`. **Chaque clic mène à l'occurrence suivante** — même geste
  qu'aujourd'hui (recentrer, ou recentrer et ouvrir la modale du site, ou le panneau du point) —
  et revient à la première après la dernière.
- Les sortes concernées : `troopWithoutOrder` et `unsupplied` (une occurrence = une adresse,
  comme `byStation` le fait déjà ; le libellé compte les **troupes**, le rang compte les
  **adresses**), `idleBarracks` (rebaptise-la si le nom ment : ports et aérodromes y sont),
  `raiseOutpost`, et `unlinkedSites`, qui menait déjà au premier et parcourt désormais les sites
  coupés. `foundation` et `idleSite` sont uniques par nature.
- **`freeSlot` disparaît** : la sorte, son libellé `fr.nextActions.freeSlot`, ses tests. Le
  compte de slots se lit au bandeau (« slots de mouvement 0 / 5 »).

## Où vit quoi

- **Le domaine décrit, le composant parcourt.** `nextActionsOf` rend une ligne par sorte avec la
  liste ordonnée de ses cibles (un `NextActionTarget` par occurrence, le premier en tête) ; le
  rang courant est un état d'interface, pas une donnée de la vue.
- **Le rang survit à la fermeture de la feuille** sur téléphone : la feuille « à faire » se
  referme au clic (`useSheetClose`) et se démonte, et le clic suivant doit mener à la deuxième
  pile, pas revenir à la première. Garde le rang au-dessus de la feuille (plateau ou un petit
  store local au module), indexé par l'`id` de la ligne. Il retombe à la première occurrence
  quand la liste des cibles change (une pile part, une autre arrive) — compare les identités,
  pas la longueur.
- **Les comptes suivent sans rien recalculer** : l'en-tête « N en attente » et le chiffre de
  l'entrée « à faire » du pied (`FootBar`, `nextActionsOf(view).length`) comptent désormais des
  sortes. Dans la partie de Pierre : 16 → 4. Vérifie que la doc de `FootBar` le dit encore juste.

## Preuve attendue

- `next-actions.test.ts` : une ligne par sorte quelle que soit la dispersion ; le libellé
  singulier à une occurrence, le total à plusieurs ; l'ordre des cibles stable d'un rendu à
  l'autre ; plus aucune `freeSlot`.
- Un test de composant : trois clics sur une ligne de trois occurrences mènent aux trois cibles
  puis reviennent à la première ; le rang survit au démontage de la feuille.
- `npm run verifier` vert.
- Rapport : le nombre de lignes avant / après sur un état comparable à celui de Pierre (sept
  piles posées sur six points, dont six hors ravitaillement, deux bâtiments de projection au
  repos, un avant-poste plein).
