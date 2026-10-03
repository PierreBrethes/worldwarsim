---
type: marque
statut: en cours
maj: 2026-10-03
code: [src/styles/tokens.css, src/styles/index.css, src/shell/Masthead.tsx, src/shell/Stamp.tsx, src/shell/Newspaper.tsx, src/shell/TelegraphThread.tsx, src/routes/-plateau/Window.tsx, src/routes/-plateau/PressWindow.tsx, src/map/engine/palette.ts, src/domain/nations.ts]
decisions: [charte-1a-2026-10-03, charte-1b-2026-10-03]
voir: [marque-et-site.md, actifs.md, ../design/10-direction-artistique.md, ../design/11-brief-ui.md]
---

# Charte — le relevé du design system

**En bref.** La charte du jeu est relevée dans un design system consultable sur claude.ai :
« La Manchette — charte » (https://claude.ai/artifact/UFAnpUE435rS5bseQpn3cQ, privé, à
partager depuis la page). Couleurs (62, dont les encres de nation et de carte), typographie
(quatre faces, 14 styles), espacements, plans, huit composants en rendu statique, l'icône, les
ressources et les unités françaises. **Le dépôt fait foi** : la charte en est une copie, à
refaire quand `tokens.css` ou les composants de `src/shell/` changent. Rien du code n'a été
modifié. Le relevé a produit la liste d'écarts ci-dessous ; une passe de nettoyage se décide
dessus (charte-1a-2026-10-03). Le nettoyage sans changement de rendu est lancé le 03/10
(charte-1b-2026-10-03 : [nettoyer-les-couleurs](../prompts/code/ready/nettoyer-les-couleurs.md)).

## Écarts relevés (03/10/2026, `src/` hors tests et commentaires)

### Couleurs écrites en dur
- ✅ **Résolu le 03/10/2026** (charte-1b). **151 fois l'encre `--ink` en `rgba(42, 33, 24, α)`, 26 opacités différentes, 28 fichiers.**
  Les plus fréquentes : 0,35 (24), 0,22 (18), 0,16 (12), 0,30 (12), 0,40 (12), 0,07 (10). Deux
  seulement ont un nom (`--rule-medium` 0,32, `--rule-light` 0,18). Cinq ou six crans couvriraient
  presque tout.
- ✅ **Résolu hors exceptions** (03/10/2026) : sept hexadécimaux égaux à une variable restaient dans
  `labels.css` et `compass-rose.css`, ils sont rattachés ; le reste du relevé vit dans le moteur de
  carte, les encres de nation et les planches, exceptions voulues. Le test
  `src/styles/colors.test.ts` garde. (Le relevé annonçait 25 hexadécimaux « remplaçables » : il
  comptait à tort le moteur de carte et les encres de nation, qui ne peuvent pas lire le CSS.)
- ⏳ Reste, décisions de Pierre à part : regrouper les 26 opacités sur une échelle ; les autres
  `rgba()` (le noir des ombres, le blanc des reflets). Le bureau `rgba(23, 18, 8, α)` est rattaché
  à `--map-desk`.
- Les plus chargés : `EconomyWindow.tsx` 23, `SiteModal.tsx` 22, `palette.ts` 21 (attendu),
  `GunneryWindow.tsx` 20, `Newspaper.tsx` 16, `salon.tsx` 16.

### Deux valeurs pour une même chose
- ⏳ Deux bureaux : `--desk` `#0f0a04` et `PALETTE.desk` `#171208` (moteur de carte, fiche 11).
  **Nommé, pas unifié** le 03/10/2026 : `--map-desk` dans `tokens.css`, et le test tient les deux
  d'accord. Les unifier changerait le rendu.
- ✅ Résolu le 03/10/2026 : `.eyebrow` n'existe plus qu'une fois (index.css, 9 px, `--track-label`
  0,18em). Relevé d'origine : défini dans tokens.css (10 px, 0,2em) puis redéfini dans index.css
  (9 px, 0,18em), qui gagne.
- ✅ Résolus le 03/10/2026 : la trame en double (`.paper`, `.paper-grain`), le grain en double
  (`.grain`), `--font-text` désormais aussi dans tokens.css.

### Déclaré mais pas employé
- ✅ Supprimés le 03/10/2026 : `--sp-1` à `--sp-10` et les `--size-*` sauf `--size-eyebrow-sm`
  (aucun emploi dans `src/`, aucune règle qui les cite ; seule la copie `WWS/maquettes/tokens.css`
  les garde encore). Les 29 tailles de police en dur restent.
- 19 interlettrages en dur pour 3 variables `--track-*`.

### Lisibilité (petit texte sous 4,5:1)
- `--ink-note` sur papier 3,7:1 ; `--ink-faint` 2,9:1 ; `--critical` 4,4:1 (3,2:1 sur `--desk`) ;
  `--routine` 3,8:1 ; `--notable-paper` 4,2:1.

### Documentation du coffre périmée (corrigée le 03/10/2026 dans les fiches 10 et 11)
- `10-direction-artistique.md` : « Typographie : rien n'est choisi », trois ressources (huit
  aujourd'hui), chemin `src/emblemes/urss.svg` (aujourd'hui `src/emblems/ussr.svg`).
- `11-brief-ui.md` : bureau `#171208`, typographie « à définir ».
- « Aucune ombre portée » : 12 exceptions (feuilles et fenêtres posées sur le bureau).

## Refaire le relevé

Mêmes sources (voir `code:` ci-dessus), même méthode : comptage par script sur `src/` hors tests
et commentaires, valeurs recopiées telles quelles, composants recopiés en HTML statique.
