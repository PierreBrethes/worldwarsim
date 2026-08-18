# Prompt Claude Code — une troupe peut avoir la carte pour adresse

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'**ADR 0019**, puis
`WWS/docs/prompts/code/garnison-adresse.md` — celui qui a posé l'invariant que ce prompt étend
sans le casser. Ensuite `convex/schema.ts` (le commentaire de `troops`), `src/domain/troops.ts`,
`src/domain/player-view.ts`, `convex/troops.ts`, `convex/view.ts`, `convex/combat.ts` et
`src/routes/-plateau/TroopsWidget.tsx`. Ne commit pas, ne push pas.

**Troisième prompt de l'ADR 0019.** Il suppose les deux premiers passés.

## Ce que tu codes

`stationedAt` accepte une **troisième forme** : un point.

```
stationedAt: v.union(v.id('buildings'), v.id('outposts'), v.object({ lon, lat }), v.null())
```

Le champ reste **unique**, exactement pour la raison que le commentaire du schéma donne déjà :
deux champs laisseraient une troupe pendre à une caserne *et* à un point à la fois, et rien dans
le schéma ne pourrait dire que c'est faux. L'invariant ne bouge pas — une troupe a **exactement
un** rattachement, ou elle est en mouvement, jamais les deux, jamais aucun.

`byStation` est un index sur `stationedAt` : un `v.object` ne s'indexe pas comme un id. Dis ce que
tu fais — index secondaire sur une paire de nombres, table de positions à part, ou lecture par
joueur — et **pourquoi**, en pesant le coût de la question à laquelle il répond (« qui défend cet
endroit »).

## Le point qui demande une décision : que veut dire `null` ?

Le schéma dit aujourd'hui que **`null` veut dire « à domicile »**, et que c'est la réponse donnée
à une troupe dont le bâtiment a disparu — elle rentre, elle ne meurt pas (règle n°3). Avec un
point comme adresse possible, `null` devient ambigu : est-ce « chez moi, sans bâtiment » ou « nulle
part » ?

Tranche, et écris-le dans le commentaire du schéma. Ma préférence : `null` disparaît au profit
d'un point explicite sur le territoire national, pour que « nulle part » n'existe plus du tout.
Instruis le coût de la migration avant de t'y engager — si elle est lourde, garde `null` et donne
lui une définition écrite plutôt qu'une ambiguïté.

## Ce qui suit

- `TroopSituation` (`src/domain/troops.ts`) sert une situation *posée*, avec son point et le pays
  qui le contient. L'écran peut dire « en campagne — Arabie saoudite » comme il dit déjà
  « garnison — Arabie saoudite ».
- `TroopsWidget.tsx` perd son regroupement par bâtiment : une troupe n'a plus toujours de bâtiment.
  Regroupe par proximité ou sers une liste plate — le plafond est vingt-quatre, rien ne déborde.
  Choisis le plus simple qui reste lisible ; la maquette repassera derrière.
- `convex/combat.ts` : une troupe posée est **une cible, jamais un attaquant** (ADR 0019 §3). Elle
  se défend quand un mouvement vient la chercher, et ne déclenche jamais rien d'elle-même.

## Critères d'acceptation

- Un test : une troupe posée sur un point est lisible dans l'inventaire, comptée dans le plafond,
  et trouvable par la requête qui demande « qui se tient ici ».
- Aucune troupe hors mouvement ne se retrouve sans adresse. Si un chemin le produit encore,
  **dis-le au lieu de le rustiner** — c'est la consigne que `garnison-adresse.md` avait déjà posée.
- Aucun texte affiché hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et
  `npm run test` passent.

## Ce que tu ne fais pas

Tu ne codes ni l'entretien par ancrage, ni le repérage : deux prompts s'en chargent et ils lisent
ce que celui-ci pose.
