# Prompt Claude Code — personne ne se téléporte

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'**ADR 0019 §3** (précisions ratifiées,
amendées le 19/08) et l'**ADR 0018 §1** (le terrain nettoyé). Ensuite `convex/movements.ts`
(`sendHome`, `refluxHome`, `homeOf`, `nearestAnchor`). Ne commit pas, ne push pas.
**Petit prompt, un seul sujet** — il ferme les deux téléportations que ton propre rapport a
nommées hors périmètre.

## La règle, qui n'est pas nouvelle

« Le temps de trajet est réel » est le levier central mesuré du jeu, et l'amendement du 19/08 dit
déjà : *elle ne se téléporte jamais — le temps de trajet est réel aussi pour les vaincus*. Il vaut
pour les vainqueurs. **Aucune troupe ne change de lieu sans mouvement, jamais** — la seule
écriture directe de `stationedAt` qui reste légale est l'arrivée d'un mouvement, la fondation sur
place, et le repli anti-mort (sans route et sans nation).

Aujourd'hui deux chemins la violent, tous deux parce que `sendHome` ne lit que les
adresses-bâtiment et `refluxHome` que les adresses-point — **l'adresse-avant-poste tombe entre les
deux**, et le vainqueur venu d'un point n'a aucune branche :

1. une colonne **partie d'un avant-poste**, mise en déroute en chemin, se retrouve instantanément
   dans sa garnison ;
2. les **vainqueurs** d'une attaque partie d'un campement retrouvent leur point de départ d'un
   coup — les vaincus marchent, les vainqueurs apparaissent.

## Ce que tu codes

Le retour se règle sur **deux questions orthogonales**, à écrire telles quelles en commentaire :

- **Où ?** Un **vainqueur** rentre à son adresse de départ, quelle qu'en soit la forme — bâtiment,
  avant-poste, point : `stationedAt` survit au départ, c'est sa raison d'être. Un **vaincu** dont
  l'adresse n'est pas un bâtiment reflue vers `nearestAnchor` (décision du 19/08 — un bâtiment
  reste son propre ancrage, rien ne change pour lui).
- **Comment ?** Toujours un `return` réel : créé par la résolution, aucun slot, aucune porte,
  n'engage jamais, se pose là où il arrive.

Concrètement : `sendHome` apprend les deux formes d'adresse manquantes (avant-poste → trajet vers
son point, garnison à l'arrivée ; point → trajet vers le point, posé à l'arrivée), et
`refluxHome` accepte l'adresse-avant-poste chez les vaincus. Si la fusion des deux fonctions rend
les quatre branches plus lisibles qu'une paire disjointe, fais-la — mais garde l'impossibilité
structurelle d'envoyer une troupe deux fois, qui était la vertu de la paire.

Cas déjà chez eux, qui ne bougent pas : la garnison en déroute **sur son propre avant-poste**
reste, la troupe de région reste, le posé vaincu **sur son campement** reflue (fait de la veille).

## Critères d'acceptation

- Un test : colonne partie d'un avant-poste, en déroute en chemin → `return` réel vers
  `nearestAnchor`, jamais d'écriture directe de la garnison.
- Un test : attaque victorieuse partie d'un campement → les survivants **marchent** vers leur
  point de départ ; le test échoue si `stationedAt` retrouve le point sans mouvement.
- Un test : attaque victorieuse partie d'un avant-poste → les survivants rentrent en garnison par
  un `return` réel.
- Cherche toute écriture de `stationedAt` hors arrivée, fondation et repli anti-mort — s'il en
  reste une, dis-la au lieu de la rustiner.
- Aucun texte hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et `npm run test`
  passent.

## Ce que tu ne fais pas

Tu ne changes ni la destination des vaincus à adresse-bâtiment, ni le coin du `return` qui
n'engage jamais, ni l'entretien, ni le repérage.
