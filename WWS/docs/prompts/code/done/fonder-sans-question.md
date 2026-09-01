# Prompt Claude Code — fonder ne pose plus aucune question

Lis `CLAUDE.md`, `CONVENTIONS.md`, `src/routes/accueil.tsx` (le bloc « fonder une saison »),
`convex/seasons.ts` (`create`). Ne commit pas, ne push pas. **Petit prompt, un seul sujet.**
Un seul commit, préparé mais pas créé.

## Pourquoi

Décision de Pierre (31/08 au soir) : pendant l'alpha, fonder une saison ne demande **rien** —
ni horloge, ni théâtre. Le seul geste est le bouton « fonder — obtenir un code ».

⚠️ **C'est un retrait d'écran, jamais de mécanique.** L'horloge optionnelle (ADR 0017, révision
du 27/08) et les théâtres restent entiers côté serveur et au schéma : `seasons.create` garde ses
arguments, une saison à 48 h reste fondable par l'API, et l'écran les re-proposera un jour sans
rien re-coder. Ne supprime aucun validateur, aucune constante, aucune clé `fr` que le serveur ou
le salon lit encore.

## Ce qui change

- `accueil.tsx` : le sélecteur d'horloge et le sélecteur de région disparaissent de l'écran.
  Fonder appelle `seasons.create` avec **`durationHours: null`** (sans horloge, close à la main)
  et le **théâtre Europe** (2-3 joueurs) — deux défauts écrits en constantes locales commentées
  en tête du composant, pour que le jour où on les rouvre soit une ligne à lire, pas une fouille.
- Le sous-titre de la carte dit ce qui est décidé à la place du joueur, en un souffle :
  « Sans horloge — la partie se clôt à la main. Théâtre : Europe. » Un joueur qui fonde doit
  savoir ce qu'il obtient sans qu'on le lui ait demandé.
- Les clés `fr.home.clocks` / libellés de région ne sont retirées **que** si plus rien ne les
  lit (le salon, le rail et la fenêtre de réglages affichent peut-être l'horloge d'une saison
  existante — vérifie avant de supprimer).

## Vérifications

`npm run verifier`. À la main : l'accueil ne montre que le bouton et sa phrase → fonder → le rail
dit « sans horloge » → le salon fonctionne → une saison existante à 7 jours affiche toujours son
compte à rebours.
