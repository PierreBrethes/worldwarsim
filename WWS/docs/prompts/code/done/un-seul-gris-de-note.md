---
type: prompt
statut: livré
maj: 2026-10-03
code: [src/styles/tokens.css, src/shell/AccountForm.tsx, src/shell/TelegraphThread.tsx, src/shell/DestroyButton.tsx, src/shell/Masthead.tsx, src/shell/FilmTrailer.tsx, src/routes/accueil.tsx, src/routes/salon.tsx, src/routes/connexion.tsx, src/routes/rejoindre.$code.tsx, src/routes/-plateau/GunneryWindow.tsx, src/routes/-plateau/JournalWindow.tsx, src/routes/-plateau/BriefingSheet.tsx]
decisions: [charte-2b-2026-10-03]
voir: [../../../marque/charte.md]
---

# un-seul-gris-de-note — le petit texte devient lisible

**En bref.** Deux gris servent au petit texte sur papier et passent sous le seuil de lisibilité
de 4,5:1 : `--ink-note` (3,7:1 : ligne de date, liens discrets) et `--ink-faint` (2,9:1 : notes de
formulaire, heures du télégraphe, textes d'exemple des champs). Remontés chacun au seuil, ils
deviennent identiques ; on les fond en **un seul gris de note**, `--ink-note: #6b5b3b` (4,7:1 sur
`--paper`). Sous l'encre il reste deux niveaux nets : `--ink-soft` (5,5:1) et `--ink-note`.

> Décision de Pierre du 03/10/2026 : charte-2b-2026-10-03, sur la planche
> `Claude outputs/marque/planche-contraste.png` (colonne de droite). Regarde-la avant de coder.

Lis `CLAUDE.md`, `CONVENTIONS.md`, `src/styles/tokens.css`, `src/styles/colors.test.ts`.
Ne commit pas, ne push pas. Un chantier, un commit.

## Le changement

1. `tokens.css` : `--ink-note: #6b5b3b`, avec un commentaire qui donne le contraste (4,7:1 sur
   `--paper`) et la raison (le petit texte doit se lire ; deux gris au seuil se confondaient).
2. Les 28 emplois de `--ink-faint` passent à `--ink-note`, `placeholder:` compris. Puis
   `--ink-faint` disparaît de `tokens.css`.
3. **Vérifie le fond de chaque emploi.** Le nouveau gris est fait pour le papier (`--paper`,
   `--paper-pile`) : sur le bureau sombre il tomberait vers 3:1. Si un emploi de `--ink-faint` ou
   de `--ink-note` est posé sur un fond sombre, ne le change pas en aveugle : passe-le à
   `--paper-dim` (5,1:1 sur `--desk`) et dis lequel dans ton rapport.
4. Garde-fou : `colors.test.ts` échoue si `--ink-faint` reparaît, et vérifie que `--ink-note` tient
   au moins 4,5:1 sur `--paper` (calcul de luminance relative WCAG dans le test, pas de dépendance).

## Ne pas faire

Ne touche ni `--ink-soft`, ni `--critical`, ni `--routine`, ni les tailles de police. Rien d'autre
ne change de couleur.

## Acceptation

- `npm run verifier` vert.
- Captures avant/après, 1440 × 900, dans `Claude outputs/marque/captures-gris-de-note/` :
  `/connexion` (note du formulaire, lien, ligne de date), `/accueil`, `/salon` (télégraphe et ses
  heures), le journal et l'abaque du plateau, l'aide-mémoire. Ici le rendu **doit** changer, et
  seulement sur ces textes.
- `WWS/docs/marque/charte.md` (section Lisibilité) à jour.
