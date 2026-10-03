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
- **151 fois l'encre `--ink` en `rgba(42, 33, 24, α)`, 26 opacités différentes, 28 fichiers.**
  Les plus fréquentes : 0,35 (24), 0,22 (18), 0,16 (12), 0,30 (12), 0,40 (12), 0,07 (10). Deux
  seulement ont un nom (`--rule-medium` 0,32, `--rule-light` 0,18). Cinq ou six crans couvriraient
  presque tout.
- 82 hexadécimaux en dur, 64 valeurs ; 25 identiques à une variable existante (`--critical` ×5,
  `--notable` ×4, `--routine` ×4, `--sea-ink` ×3…).
- 59 autres `rgba()` : surtout le noir des ombres et le bureau `rgba(23, 18, 8, α)`.
- Les plus chargés : `EconomyWindow.tsx` 23, `SiteModal.tsx` 22, `palette.ts` 21 (attendu),
  `GunneryWindow.tsx` 20, `Newspaper.tsx` 16, `salon.tsx` 16.

### Deux valeurs pour une même chose
- Deux bureaux : `--desk` `#0f0a04` et `PALETTE.desk` `#171208` (moteur de carte, fiche 11).
- `.eyebrow` défini dans tokens.css (10 px, 0,2em) puis redéfini dans index.css (9 px, 0,18em),
  qui gagne : `--size-eyebrow` et `--track-eyebrow` ne disent pas l'écran.
- La trame en double (`.paper`, `.paper-grain`), le grain en double (`.grain` deux fois).
- `--font-text` n'existe que dans le `@theme` d'index.css.

### Déclaré mais pas employé
- `--sp-1` à `--sp-10` : 0 emploi.
- `--size-*` : 2 emplois, pour 29 tailles de police en dur (de 7 à 52 px).
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
