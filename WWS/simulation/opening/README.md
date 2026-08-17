# Simulateur d'ouverture — les deux formats de saison

Un instrument de mesure, pas un prototype. Il répond à **une** question : *combien de décisions
un joueur peut-il prendre, et à quels moments, pendant l'ouverture d'une saison ?* Les deux
formats de `SEASON_FORMATS` sont couverts : `skirmish` (48 h) et `campaign` (7 j).

```
node run.mjs             # les deux formats, trois profils de connexion, le journal des connexions
node run.mjs --sweep     # balayage de l'alliage de départ, format par format
node run.mjs --json o.json
node army.mjs            # le prix réel d'une troupe, et ce qui borne l'armée d'une saison
node verify.mjs          # le miroir dit-il encore ce que dit le jeu ?
```

`verify.mjs` lit `convex/constants.ts` **comme du texte** et compare valeur par valeur. Il
n'évalue pas de TypeScript et ne le fera pas — il partagerait alors les bugs qu'il doit
attraper. Ce qu'il ne sait pas lire, il le dit **non vérifié**, jamais réussi : un succès
silencieux sur une table non lue est exactement le défaut contre lequel il existe. Il sort en
code 1 dès qu'une valeur dérive.

Node nu, aucune dépendance, déterministe : deux exécutions à graine égale sont identiques.

## Ce qu'il modélise

Les huit ressources, l'extraction par gisement, les trois chaînes (dont l'arsenal **commandé**,
qui ne tourne que sur lot), les plafonds de stock, le plafond de bâtiments porté par le QG,
`cappedByHq`, un seul chantier à la fois, le recrutement avec sa file par site de projection, le
plafond de troupes qui compte la file, et les munitions embarquées.

Tout cela est **copié** de `convex/constants.ts`, `convex/constructions.ts`, `convex/troops.ts`,
`convex/resources.ts` et `src/domain/economy.ts` (état du 17/08/2026). Quand ces fichiers
bougent, `constants.mjs` bouge avec eux, sinon l'instrument ment.

## Ce qu'il ne modélise pas

Les mouvements, le combat, les avant-postes, le brouillard. Les **pertes** sont un bouton
(`lossesPerDay`), pas une bataille : elles tiennent la place de ce que les boucles de combat
prendront à l'armée, pour que le puits d'alliage et l'action « reconstruire » existent avant le
code du combat. Les chiffres qu'elles produisent sont une *forme*, jamais un équilibrage.

C'est le complément de `refonte-simulateur.md`, pas son remplaçant : celui-là mesurera la
saison entière et le combat, celui-ci mesure la première journée devant l'écran.

## Les deux idées de fond

**Une politique, pas une file.** `policy.mjs` porte une règle relue jusqu'à épuisement à chaque
connexion — monter le QG *seulement* quand il bloque, poser le premier bâtiment légal de la
liste d'envies, commander des munitions sous un seuil, recruter au-dessus d'une réserve
d'alliage. Une file écrite d'avance mesure l'entêtement du joueur autant que l'économie, et ça
se voit : les balayages deviennent non monotones.

**Une session est un instant.** Le joueur arrive, prend toutes les actions qu'il peut, repart.
Ce que compte l'instrument, c'est **le nombre d'actions par connexion** — pas le pourcentage du
temps où un chantier tourne, qui mesure la machine et pas le joueur. Trois profils : assidu
(six visites par jour), occasionnel (deux), absent (une). La fenêtre de repos de sept heures est
découpée dans les heures de connexion, jamais simulée comme un état.

## Les métriques

| | |
|---|---|
| **actions** | total sur la saison, et médiane par connexion |
| **connexions vides** | connexions où *aucune* action n'était possible — le vrai défaut |
| **plus long trou** | plus longue plage sans chantier ni file |
| **paliers de QG** | quand le catalogue s'ouvre |
| **troupes / plafond** | si l'armée bute sur `troopCap` ou sur l'alliage |
| **restes** | ce qui dort en fin de saison : nomme la ressource qui n'était pas le goulot |

## Limites assumées

- Un seul joueur, pas d'adversaire : rien ici ne dit qui gagne.
- Les gisements sont supposés disponibles (une région libre porte toujours le bon gisement).
  Tant que `public/deposits.json` n'est pas lu, c'est une hypothèse favorable.
- Le plan de jeu est écrit à la main. C'est une *intention*, pas un ordre : la politique saute
  ce qui est refusé. Deux plans sont fournis (`economy`, `army`) précisément pour qu'on voie
  combien le résultat en dépend.
- Aucun terme banni (`tick`, `temps réel`, `micro`, `base`, `rush`).

Le code est en anglais (ADR 0016), la sortie en français. Les fichiers voisins
(`sim.mjs`, `run.mjs`) portent des noms français d'avant cette ADR ; la
refonte devrait les renommer.
