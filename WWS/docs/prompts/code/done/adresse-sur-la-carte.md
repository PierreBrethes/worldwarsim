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

## Le verrou que ce prompt lève : qui défend un point

`defenceOf` (`convex/movements.ts:833`) renvoie `null` pour une cible `point`, et le commentaire
dit pourquoi : trouver qui défend une coordonnée demanderait de savoir **quelle région la
contient**, or le serveur ne détient aucun polygone — `region-index.json` donne un point par
région, qui nomme un lieu et ne contient rien. Prendre la région la plus proche résoudrait un
engagement contre la mauvaise garnison, ce qui est pire que de n'en résoudre aucun.

Conséquence vivante aujourd'hui : `aim()` propose la **région d'abord** quand une région est
dessinée sous le clic, donc au zoom où le joueur joue vraiment, une attaque part encore sur le
centroïde. L'ADR 0019 §1 dit le contraire, et le code le sait — c'est écrit dans son commentaire.

**Ce prompt le lève, et pas en cherchant des polygones.** Une fois qu'une troupe a un point pour
adresse, « qui défend ici » cesse d'être une question de contenance pour devenir une question de
**distance** — exactement ce que le même commentaire reconnaît déjà pour l'interception : *« that
contact is a distance, not a containment, and it works already »*.

- `defenceOf` répond à une cible `point` : ce qui se tient à moins de `ARRIVAL_RADIUS_KM` du point
  d'arrivée — troupes posées, garnisons d'avant-postes, et troupes rattachées à un bâtiment dont
  la région répond par son propre point.
- `ARRIVAL_RADIUS_KM` est **court** : on n'arrive pas à deux cents kilomètres de sa cible.
  Propose 25 et dis en commentaire que c'est un point de départ assumé, non mesuré — même statut
  que `INTERCEPTION_RADIUS_KM` (ADR 0018 §5), et surtout pas la même valeur.
- **Une passe par engagement** (ADR 0014) : si plusieurs adversaires répondent dans le rayon,
  celui qui a le plus de troupes répond, comme `defenceOf` le fait déjà quand plusieurs nations
  tiennent du sol dans une même région.
- `aim()` cesse alors de proposer la région d'abord. Retire la branche et le commentaire qui
  l'explique : le point redevient la destination, comme l'ADR 0019 §1 le dit.

## Un détail à balayer au passage

`fr.errors.NOT_ENOUGH_LIFT` écrit « 1 places à embarquer ». Faute d'accord préexistante, désormais
affichée dans la rose des vents. Corrige-la.

## Critères d'acceptation

- Un test : une troupe posée sur un point est lisible dans l'inventaire, comptée dans le plafond,
  et trouvable par la requête qui demande « qui se tient ici ».
- Un test : une attaque visée sur un point tombant loin du centroïde de sa région trouve les
  défenseurs qui s'y tiennent — et une attaque visée à plus de `ARRIVAL_RADIUS_KM` d'eux n'en
  trouve aucun.
- `aim()` ne propose plus de région : viser un point donne un point, à toutes les échelles.
- Aucune troupe hors mouvement ne se retrouve sans adresse. Si un chemin le produit encore,
  **dis-le au lieu de le rustiner** — c'est la consigne que `garnison-adresse.md` avait déjà posée.
- Aucun texte affiché hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et
  `npm run test` passent.

## Ce que tu ne fais pas

Tu ne codes ni l'entretien par ancrage, ni le repérage : deux prompts s'en chargent et ils lisent
ce que celui-ci pose.
