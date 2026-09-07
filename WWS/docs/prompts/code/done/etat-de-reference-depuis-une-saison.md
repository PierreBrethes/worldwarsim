# etat-de-reference-depuis-une-saison — l'état de référence sort d'une vraie partie

Lis `CLAUDE.md`, `WWS/simulation/README.md`, `WWS/simulation/etat-reference.mjs`,
`WWS/simulation/ETAT-REFERENCE.md`, `convex/view.ts` (`playerView`), `convex/dev.ts`. Ne commit
pas, ne push pas. Un chantier, un commit.

## Pourquoi

`ETAT-REFERENCE.md` est généré par l'ancien simulateur : il parle de doctrines, d'acier,
d'effectifs, de slots 3/3 — un jeu mort depuis le 15/08. Il trompe les annexes design et le
prochain lecteur. Décision de Pierre (06/09, 5a) : **l'état de référence est désormais exporté
d'une saison réellement jouée**, jamais simulé.

## Ce qui change

1. `convex/dev.ts` : une `internalQuery` `dev.snapshot({ token })` qui rend exactement ce que
   `playerView` sert à ce jeton (réutilise la fonction, pas une copie) + `control.held`. Rien
   d'autre — c'est la vue d'un joueur, brouillard appliqué, comme aujourd'hui.
2. `scripts/exporter-etat-reference.mjs` : `npx convex run dev:snapshot '{"token":"…"}'` →
   `WWS/simulation/etat-reference.json` (brut) et régénère `ETAT-REFERENCE.md` par un rendu
   **depuis le JSON servi** : nation, heure de saison, ressources et débits, bâtiments par site
   avec niveau et file, troupes par adresse, mouvements, relevés, dépêches non lues, `press` si
   présent. Chaque section titre le champ de `playerView` dont elle sort. Ce qui n'est pas servi
   n'apparaît pas — c'est la règle des contrats de vue (00-regles.md).
3. `etat-reference.mjs` (ancien générateur), `sim.mjs`, `run.mjs`, `resultats.json`,
   `derniere-sortie.txt`, `world.json` : déplacés dans `WWS/docs/_to_delete/simulation-v1/` avec
   une ligne dans `WWS/simulation/README.md` qui dit pourquoi (mesures d'avant les ADR 0013-0015,
   ne valent plus une ligne — `rapport-simulation.md` le dit déjà). `opening/` reste : c'est le
   simulateur vivant.
4. Pierre exporte depuis sa saison de test du 04/09 (Japon) ; le prompt fournit le script, pas le
   fichier.

## Cas d'acceptation

1. Le rendu Markdown ne contient aucune chaîne absente du JSON (test : chaque libellé de valeur
   est retrouvé dans le JSON ou dans `fr.ts`).
2. `dev.snapshot` avec un jeton inconnu → erreur, pas de vue vide.
3. `npm run verifier` vert — `verify.mjs` ne lit rien de ce qui bouge.
