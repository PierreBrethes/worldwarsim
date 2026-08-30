# Prompt Claude Code — les avis d'information

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`. Ne commit pas, ne push pas.

## Pourquoi

`src/shell/notifications.tsx` n'existe que pour les erreurs : bordure `--critical`, fermeture à
la main, un seul appelant (`__root.tsx`). Décision de Pierre (27/08) : un **avis** court pour les
seules actions dont l'effet se produit **hors du champ où l'on a cliqué**. Le cas fondateur : clic
droit sur la carte → bâtir (`plateau.tsx`, `place`) — la file, elle, vit dans Économie. Rien ne
dit au joueur que ça a pris.

**Pas un toast par action.** Une action dont le résultat est visible sous la souris (pose sur la
carte, tampon POSÉE, envoi d'un mouvement qui se dessine) n'en a pas. Si tu hésites, n'en mets
pas — la liste des appelants doit tenir en une main.

## Ce qui change

- `notify(message, tone: 'error' | 'info' = 'error')`. Un avis `info` s'efface seul après
  ~4 s, s'empile sous les erreurs, bordure `--ink` atténuée, kicker « AVIS » (ajoute à
  `fr.notifications`). Les erreurs ne changent pas. Le dédoublonnage reste — deux poses
  identiques en 4 s donnent un seul avis, c'est acceptable.
- Appelants, dans cet ordre, et pas plus : (1) pose depuis le menu contextuel carte — « *Fonderie*
  ajoutée à la file — voir Économie », le message nomme le bâtiment et le bureau ;
  (2) `UpgradeControl` si le palier du QG se lance depuis un endroit où la file n'est pas
  visible — vérifie avant, sinon rien.
- Français de presse, vocabulaire imposé, message d'une ligne, aucune icône.

## Vérifications

`npm run verifier`. À la main : clic droit → bâtir → avis 4 s → disparaît ; une erreur pendant
l'avis → les deux visibles, l'erreur reste ; `prefers-reduced-motion` respecté si une animation
d'entrée est ajoutée.
