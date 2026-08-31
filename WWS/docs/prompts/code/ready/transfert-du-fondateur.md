# Prompt Claude Code — le fondateur parti, la saison reste clôturable

Lis `CLAUDE.md`, `CONVENTIONS.md`, `convex/seasons.ts` (`conclude`, `leave`), `convex/schema.ts`
(`players.creator`). Ne commit pas, ne push pas. **Petit prompt, un seul sujet.** Un seul commit,
préparé mais pas créé.

## Pourquoi

Sans horloge, `seasons.conclude` est la seule fin de partie, et elle est réservée au fondateur
(`creator: true`). S'il quitte la saison, plus personne ne peut la clore — trou repéré le 30/08,
devenu bloquant le 31/08 quand l'horloge et les modes alternatifs ont disparu. Décision de Pierre
(31/08) : **le titre de fondateur se transfère au plus ancien joueur présent.**

## Ce qui change

- Au départ d'un joueur `creator: true` (le chemin qui retire un joueur de la saison — repère-le,
  ne le devine pas), le titre passe au joueur restant **le plus ancien dans la saison** (ordre
  d'arrivée ; à défaut d'un champ dédié, `_creationTime` de la ligne `players` fait foi).
  S'il ne reste personne, rien à transférer.
- Un seul `creator: true` par saison à tout instant — écris l'invariant en test.
- Une dépêche journal quand le titre change de mains, sobre et datée (« X prend la direction de
  la partie ») : les autres joueurs doivent savoir qui peut clore.
- Le salon et l'accueil affichent le fondateur courant là où ils l'affichent déjà — aucune
  surface nouvelle.

## Ce que ce prompt ne fait pas

Aucun changement à `conclude` elle-même, ni à la victoire, ni au hors-saison.

## Vérifications

`npm run verifier`. Tests : le fondateur part → le plus ancien restant devient fondateur → il peut
clore, un autre non · le dernier joueur part → pas d'erreur · l'invariant « un seul creator ».
