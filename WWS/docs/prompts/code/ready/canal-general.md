# Prompt Claude Code — le télégraphe (canal général, lot des petits sûrs 2/5)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`. Ne commit pas, ne push pas.

## La décision (Pierre, 29/08)

Un chat en jeu, **un seul canal général par partie**. Son nom : **le télégraphe** — pas
« chat », et pas « dépêches » (le mot appartient au journal, ne crée pas de collision de
vocabulaire ; ajoute « télégraphe » à `CONTEXT.md`). Le but avoué : que les joueurs s'écrivent
et se trollent — c'est le carburant social de l'adversité.

## Serveur

Table `messages` : `seasonId` (index `bySeason` — leçon du cloisonnement du 26/08), `playerId`,
`text`, horodatage. Mutation `post` (joueur de la saison, saison `launched` ou `lobby` — on se
chambre aussi en attendant le lancement ; refusée sur `concluded`), texte borné (300 caractères,
`@a-mesurer` non — c'est une règle d'UI, pas un réglage de jeu), et un garde anti-rafale simple
(pas plus d'un message par seconde par joueur, refus lisible). Query paginée ou bornée aux N
derniers (200 suffisent — le télégraphe est un fil, pas une archive). La table entre dans
`GAME_TABLES` : elle meurt au wipe comme le reste.

## Front

Fenêtre « Télégraphe » : entrée dans le rail, même famille que Journal. Fil vertical, chaque
message : pseudo à l'encre nationale de l'émetteur, texte en corps de journal, heure discrète.
Champ d'envoi en bas, Entrée envoie. Style presse — pas de bulles de messagerie : des lignes
composées, un filet léger entre messages.

**Le son** : à l'arrivée d'un message des autres (jamais les siens), un tic-tac
mécanographique bref — synthétisé en Web Audio (deux clics amortis suffisent, pas d'asset
audio), volume faible. Réglages : une ligne « Son du télégraphe » pour le couper ; muet
d'office quand l'onglet est caché (`document.hidden`). Respecter `prefers-reduced-motion` ne
suffit pas pour le son : c'est un réglage à part.

Badge de non-lu sur l'entrée du rail (compte depuis la dernière fermeture — même mécanique
d'horodatage que `journalReadAt`, champ distinct).

## Ce que tu ne fais pas

Pas de canaux privés, pas de mentions, pas d'émojis custom, pas de modération (on joue entre
amis). Le texte est du texte : aucune interprétation HTML/markdown (React échappe, n'ajoute
rien qui contourne).

## Vérifications

`npm run verifier`. Tests : post refusé hors saison/sur concluded, borne de longueur,
anti-rafale, cloisonnement à deux saisons (le télégraphe de A invisible de B). À la main :
deux onglets/joueurs, envoi, son à l'arrivée chez l'autre seulement, badge non-lu, coupure du
son dans Réglages. **Relancer `npx convex dev`** (schéma).
