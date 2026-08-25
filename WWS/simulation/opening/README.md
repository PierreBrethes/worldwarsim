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
plafond de troupes qui compte la file, et **une infanterie au QG dès la première minute** (la
dotation du 25/08).

Le **socle** n'est plus une liste de format : depuis le 25/08 il se lit sur les gisements du
pays, et l'instrument mesure sur un sol de référence nommé — `REFERENCE_GROUND` dans
`scenarios.mjs`, la **France** : fer, charbon, blé, tissu, pas de pétrole. C'est la forme
commune de la carte (six nations sur huit n'ont pas de pétrole). Un sol qui doit un cinquième
extracteur — États-Unis, URSS — ouvre une pose de plus et un emplacement de moins.

Tout cela est **copié** de `convex/constants.ts`, `convex/constructions.ts`, `convex/troops.ts`,
`convex/resources.ts` et `src/domain/economy.ts` (état du 17/08/2026). Quand ces fichiers
bougent, `constants.mjs` bouge avec eux, sinon l'instrument ment.

> ⚠️ **Retards connus (25/08/2026)**, décision 3b : la mise à jour du moteur est reportée, pas
> oubliée. Deux règles du jeu que `engine.mjs` ne dit plus :
>
> - **la file de chantier prépayée** — le jeu autorise une file illimitée payée à la mise en
>   file ; le moteur refuse toujours `CONSTRUCTION_IN_PROGRESS`. La métrique « actions par
>   connexion » est donc un **plancher** : un joueur qui pourrait enfiler trois chantiers d'une
>   visite n'en pose qu'un ;
> - **la pose due hors plafond** — une clé du socle n'est plus refusée par le plafond de
>   bâtiments (`buildRefusal` rend encore `BUILDING_CAP_REACHED` avant `owesFirstPlacement`).
>   Sans effet sur le sol de référence, qui doit quatre extracteurs ; un sol à cinq — États-Unis,
>   URSS — serait mesuré une pose trop court en `campaign` ;
> - **les munitions ne se dépensent plus nulle part** (question 18, tranchée le 25/08). Le
>   recrutement a cessé de les débiter et c'est la passe de résolution qui les paie — or ce
>   moteur ne modélise aucun combat. L'arsenal produit donc dans un stock que rien ne vide :
>   `ammoTarget` reste une commande unique au lieu d'un réapprovisionnement, l'alliage qu'elle
>   n'engloutit plus part en troupes, et `INSUFFICIENT_ammunition` a disparu de la colonne « ce
>   qui bloque ». **Les munitions ne sont plus mesurables ici du tout** : le goulot qu'elles
>   forment est un fait de combat, et c'est au simulateur refondu (`refonte-simulateur.md`) de
>   le dire.
>
> À rattraper avant de relire les chiffres comme un équilibrage.

## Ce qu'il ne modélise pas

Les mouvements, le combat, les avant-postes, le brouillard — et le **leurre non modélisé** :
il coûte un slot et un forfait d'alliage (`DECOY_COST`, `@a-mesurer`), or ce moteur ne compte
ni slot ni mouvement, donc l'arbitrage « feinter se paie en attaques qu'on ne lancera pas » ne
se mesure nulle part ici. Le **plafond de mouvements en vol**
a quitté le miroir le 25/08 : ce n'est plus la constante `MOVEMENTS_IN_FLIGHT` mais
`movementSlots(hqLevel)` — `1 + hqLevel`, dans `src/domain/movement-orders.ts`. `verify.mjs` lit
des scalaires comme du texte et ne sait pas surveiller la dérive d'une formule ; comme aucun
scénario ne lisait ce nombre, rien n'est perdu à la mesure, mais la règle n'est **plus miroitée**
et il faut la relire à la main si un jour le moteur simule un mouvement. Les **pertes** sont un bouton
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
  Tant que `public/deposits.json` n'est pas lu, c'est une hypothèse favorable — et c'est aussi
  pourquoi le sol de référence est écrit à la main plutôt que déduit d'une nation.
- L'entretien de l'armée n'est pas modélisé : l'infanterie de départ prend une place sous
  `troopCap`, elle ne mange rien ici.
- Le plan de jeu est écrit à la main. C'est une *intention*, pas un ordre : la politique saute
  ce qui est refusé. Deux plans sont fournis (`economy`, `army`) précisément pour qu'on voie
  combien le résultat en dépend.
- Aucun terme banni (`tick`, `temps réel`, `micro`, `base`, `rush`).

Le code est en anglais (ADR 0016), la sortie en français. Les fichiers voisins
(`sim.mjs`, `run.mjs`) portent des noms français d'avant cette ADR ; la
refonte devrait les renommer.
