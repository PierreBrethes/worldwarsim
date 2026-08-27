# Prompt Claude Code — l'aide-mémoire du commandement

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`. Ne commit pas, ne push pas.

## Pourquoi

Les nouveaux joueurs arrivent sur le plateau sans savoir tenir la carte. L'ordre de
mobilisation guide *quoi faire* ; personne ne dit *comment* — la souris, les couches, où
vivent les fenêtres. Décision de Pierre (26/08) : un **aide-mémoire skippable**, pas un
tutoriel — **une feuille, jamais un pas-à-pas** (pas de flèches, pas d'étapes, pas de
surbrillance guidée : la doctrine « sans tutoriel » tient, ceci est un mode d'emploi).

## La feuille

Une carte style dépêche/notice militaire 1940, posée par-dessus le plateau à la **première
entrée** d'un joueur dans une partie (drapeau `localStorage`, par joueur, pas par partie —
un vétéran ne la revoit pas sur sa deuxième saison). En-tête « AIDE-MÉMOIRE DU
COMMANDEMENT », trois colonnes :

1. **La carte et la souris** — les commandes *réelles* : lis le code de la caméra
   (`src/map/`, et `WWS/docs/prompts/code/done/controles-camera.md` pour l'intention)
   plutôt que d'inventer des bindings. Zoom, déplacement, rotation si elle existe, clic
   gauche/droit, ce qu'ouvre un clic sur une région.
2. **Lire le terrain** — les gisements (publics, la géologie de 1940), le brouillard (on
   voit ce qu'on tient et ce qu'on observe), l'avant-poste (la portée pour bâtir ailleurs).
3. **Vos bureaux** — Économie (tout ce qui se pose et coule), Troupes, Journal (tout ce qui
   s'est passé), et l'ordre de mobilisation (les poses offertes du début).

Chaque colonne : 3-5 lignes maximum, français de presse, vocabulaire imposé. Fermeture par
un bouton-tampon « COMPRIS » (le pattern du tampon POSÉE existe). Réouverture depuis la
fenêtre Réglages, ligne « Aide-mémoire du commandement ».

Aucun contenu inventé : chaque phrase décrit ce que le code fait vraiment. Ce qui n'existe
pas encore (renseignement, pillage) n'apparaît pas.

## Vérifications

`npm run verifier`. À la main : première entrée → la feuille ; « COMPRIS » → plus jamais
d'office ; Réglages → elle revient ; les commandes décrites correspondent au comportement
réel de la carte.
