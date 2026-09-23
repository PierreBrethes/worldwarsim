# Simulateur d'ouverture — les deux formats de saison

Un instrument de mesure, pas un prototype. Il répond à **une** question : *combien de décisions
un joueur peut-il prendre, et à quels moments, pendant l'ouverture d'une saison ?* Les deux
formats de `SEASON_FORMATS` sont couverts : `skirmish` (48 h) et `campaign` (7 j).

```
node run.mjs             # les deux formats, trois profils de connexion, le journal des connexions
node run.mjs --sweep     # balayage de l'alliage de départ, format par format
node run.mjs --grille    # campagne : courbe × dotation × instruction × plafond, trois profils → grille.json
node run.mjs --rapport   # rapport.html à côté — frises, courbes, restes ; s'ouvre en file://
node run.mjs --json o.json
node army.mjs            # le prix réel d'une troupe, et ce qui borne l'armée d'une saison
node verify.mjs          # le miroir dit-il encore ce que dit le jeu ?
```

`--grille` croise quatre leviers sur la seule saison que le jeu ait (`campaign`, ADR 0020 §11).
Sa sortie est suivie (`grille.json`), comme `sweep.json`. `rapport.html` ne l'est pas : c'est une
**vue** de la dernière exécution et de la dernière grille, un seul fichier sans dépendance ni
requête, et une vue n'a pas à dériver de ce qu'elle montre.

**Les quatre axes, et pourquoi ceux-là.**

| axe | valeurs | la question |
|---|---|---|
| courbe de rendement par niveau | `linear`, `compounded` | monter ou s'étaler |
| dotation de départ | 400, 800, 1200 d'alliage | ce que le joueur tient en s'asseyant |
| durée d'instruction | ×1, ×0,5 | le temps borne-t-il l'armée, ou l'alliage |
| `TROOP_CAP_TARGET` | 24, 48 | où s'arrête l'armée d'une saison |

L'ancien balayage — fonderie × extraction × pack — mesurait des **débits**. Il ne pouvait pas
poser « monter ou s'étaler », parce qu'un débit linéaire rend les deux équivalents *par
construction* : deux fonderies de niveau 1 valent exactement une de niveau 2. La courbe
`compounded` est la proposition inverse, `production(n) = 2·base·(1 + Σ 1,3ᵏ, k=1..n−1)`,
appliquée aux chaînes, à l'extraction et aux plafonds de stock — et elle se lit **site par site**,
jamais sur un total de niveaux, sinon la question s'annule avant d'être posée.

**Rien de tout cela n'est une constante du jeu.** Les courbes vivent dans `curves.mjs`, qui n'est
pas un miroir et le dit ; les trois autres axes sont des `tuning`, que le moteur lit et que
`convex/constants.ts` ignore. `verify.mjs` n'a donc jamais à décider si une dérive est un bug ou
une proposition.

**Les sorties de la grille**, par ligne : heure du premier cargo, troupes à 24 h / 48 h / 96 h,
connexions vides, alliage **entré dans le monde** et **écrêté** au jour 7, et le couple
bâtiments / niveau moyen qui porte « monter ou s'étaler ». Puis les **cinq combinaisons** qui
minimisent les connexions vides de l'occasionnel sans plafonner l'assidu avant le jour 6.

Trois précautions de lecture, chacune payée par une mesure fausse évitée :

- **L'alliage produit n'est pas l'alliage restant.** Un stock final ne distingue pas une saison
  qui n'a rien fabriqué d'une saison qui a tout dépensé ; `produced` et `capped` le font.
- **Toucher le plafond de troupes n'est pas être plafonné.** Un joueur qui sature une heure puis
  pose un cantonnement a été prévenu, pas arrêté : la grille lit la saturation qui ne lâche plus
  jusqu'au bout (`troopCapSaturatedFrom`), et la première touche vit à côté sans commander rien.
- **Une borne hors de la saison rend `—`, jamais le dernier chiffre connu** : sur 48 h, un plateau
  et une absence se liraient sinon pareil à 96 h.

**La mer est un objectif du profil, pas une case du mélange** (`firstCargo`). Sans elle, aucune
saison mesurée ne voyait d'eau : le port est en queue des deux listes d'envies et la règle prend
la *première* entrée légale et payable — une élévation de fonderie gagne toujours. L'heure du
premier cargo aurait alors daté l'ordre de la liste. Le profil bâtit donc le port dès qu'il est
légal, puis commande **une** coque ; ensuite la liste reprend la main, et le mélange n'est pas
touché.

`verify.mjs` lit `convex/constants.ts` **comme du texte** et compare valeur par valeur. Il
n'évalue pas de TypeScript et ne le fera pas — il partagerait alors les bugs qu'il doit
attraper. Ce qu'il ne sait pas lire, il le dit **non vérifié**, jamais réussi : un succès
silencieux sur une table non lue est exactement le défaut contre lequel il existe. Il sort en
code 1 dès qu'une valeur dérive.

Node nu, aucune dépendance, déterministe : deux exécutions à graine égale sont identiques.

## Ce qu'il modélise

Les huit ressources, l'extraction par gisement, les trois chaînes (dont l'arsenal **commandé**,
qui ne tourne que sur lot), les plafonds de stock, le plafond de bâtiments porté par le QG,
`cappedByHq`, le recrutement avec sa file par site de projection, et le plafond de troupes qui
compte la file.

**Le quartier général se pose** (décision 1b du 13/09) : il n'est plus planté au lancement, il
est la **première dette du socle** — `{ key: 'hq', deposit: null }`, gratuite, immédiate, au
niveau `HQ_LEVEL_AT_LAUNCH` — et **la compagnie d'infanterie naît avec lui**. Une saison
s'ouvre donc sur un sol nu. Tant qu'il est dû, rien d'autre ne se pose : `HQ_FIRST` dans la
colonne « ce qui bloque ». Sur le sol de référence le socle compte donc **cinq** placements
gratuits, pas quatre.

**La file de chantier est illimitée et prépayée**, comme `convex/constructions.ts` la tient : on
paie à la mise en file, un seul chantier tourne (la tête), une entrée par région debout *ou* en
file, et le plafond de bâtiments se lit sur debout + file. La politique enfile à chaque
connexion tant qu'une clé est légale et payable, sans limite artificielle : la **profondeur de
file à l'arrivée** (médiane et maximum) dit si le joueur commande sa saison d'un clic.

**Une clé due n'est jamais refusée par le plafond** : `owesFirstPlacement` se lit avant
`BUILDING_CAP_REACHED`, comme le jeu. Sans effet sur la France, qui doit quatre extracteurs ;
mesurable sur `REFERENCE_GROUND_OIL` (les États-Unis, cinq extracteurs), que `run.mjs` sort en
une ligne pour le joueur assidu.

Le **socle** n'est plus une liste de format : depuis le 25/08 il se lit sur les gisements du
pays, et l'instrument mesure sur un sol de référence nommé — `REFERENCE_GROUND` dans
`scenarios.mjs`, la **France** : fer, charbon, blé, tissu, pas de pétrole. C'est la forme
commune de la carte (six nations sur huit n'ont pas de pétrole). Un sol qui doit un cinquième
extracteur — États-Unis, URSS — ouvre une pose de plus et un emplacement de moins.

Tout cela est **copié** de `convex/constants.ts`, `convex/constructions.ts`, `convex/troops.ts`,
`convex/resources.ts` et `src/domain/economy.ts` (état du 17/08/2026). Quand ces fichiers
bougent, `constants.mjs` bouge avec eux, sinon l'instrument ment.

> ⚠️ **Retard connu (25/08/2026)**, décision 3b. La file prépayée et la pose due hors plafond
> ont été rattrapées le 14/09 ; il reste une règle du jeu que `engine.mjs` ne dit pas :
>
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

Les mouvements, le combat, les avant-postes, le brouillard. La ligne du **leurre** a quitté
cette liste le 29/08/2026, avec le leurre lui-même — il n'y a plus rien à ne pas modéliser
(note de révision en tête de `WWS/docs/design/04-information.md`). Le **plafond de mouvements
en vol**
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
| **file à l'arrivée** | profondeur de la file de chantier au *départ* de chaque connexion, médiane et maximum : ce que le joueur trouve en s'asseyant, pas ce qu'il laisse |
| **paliers de QG** | quand le catalogue s'ouvre |
| **troupes / plafond** | si l'armée bute sur `troopCap` ou sur l'alliage |
| **restes** | ce qui dort en fin de saison : nomme la ressource qui n'était pas le goulot |
| **premier cargo** | quand la saison s'ouvre sur l'eau, ou `—` si elle ne s'y ouvre pas |
| **troupes à 24 / 48 / 96 h** | la forme de la montée en puissance, pas son total |
| **alliage produit / écrêté** | ce qui est entré dans le monde, et ce que le plafond a refusé |
| **bâtiments / niveau moyen** | monter ou s'étaler, en deux nombres qu'on ne lit pas séparément |

## Limites assumées

- Un seul joueur, pas d'adversaire : rien ici ne dit qui gagne.
- Les gisements sont supposés disponibles (une région libre porte toujours le bon gisement).
  Tant que `public/deposits.json` n'est pas lu, c'est une hypothèse favorable — et c'est aussi
  pourquoi le sol de référence est écrit à la main plutôt que déduit d'une nation.
- L'entretien de l'armée n'est pas modélisé : la compagnie née avec le QG prend une place sous
  `troopCap`, elle ne mange rien ici.
- Le plan de jeu est écrit à la main. C'est une *intention*, pas un ordre : la politique saute
  ce qui est refusé. Deux plans sont fournis (`economy`, `army`) précisément pour qu'on voie
  combien le résultat en dépend.
- Aucun terme banni (`tick`, `temps réel`, `micro`, `base`, `rush`).

Le code est en anglais (ADR 0016), la sortie en français. Les fichiers voisins
(`sim.mjs`, `run.mjs`) portent des noms français d'avant cette ADR ; la
refonte devrait les renommer.
