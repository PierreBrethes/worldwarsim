# Prompt Claude Code — les deux décisions que l'ADR 0017 laisse en dette

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, l'ADR `0017`
(format de saison et socle placé) — c'est elle qui nomme ces deux dettes — puis
`WWS/simulation/opening/README.md`. Ne commit pas, ne push pas.

Deux sujets, petits, indépendants l'un de l'autre. Ils vont ensemble parce qu'ils sont les deux
seules décisions que l'ADR 0017 déclare prises et non codées.

## 1. Perdre une capacité de stockage écrête le surplus

**La règle.** Un plafond borne ce qui entre, jamais ce qui est détenu — c'est déjà codé. Ce qui
manque est l'autre moitié : **quand la capacité de stockage baisse, ce qui dépasse le nouveau
plafond est perdu, une fois, à cet instant.** Un événement, pas une règle continue.

**Lis ça avant d'écrire une ligne : cette règle n'a aujourd'hui aucun déclencheur.** Rien ne
détruit un entrepôt, rien ne le démonte, aucun niveau ne redescend. Tu écris donc une règle dont
le seul appelant viendra avec le pillage. C'est délibéré et c'est la raison d'être du prompt :
la décision est prise, elle doit exister sous forme de règle nommée et testée **avant** que le
pillage arrive, sinon elle sera réinventée en vitesse au milieu d'un autre sujet — exactement
comme le sens du plafond l'a été.

**La forme.** Une fonction pure dans `src/domain/economy.ts`, à côté de `settleStocks`, qui prend
des stocks et un plafond et rend les stocks écrêtés plus ce qui a été perdu — le *combien perdu*
est ce que le journal du joueur devra dire. Puis un point d'entrée unique côté Convex, appelé
là où l'ensemble des bâtiments de stockage se réduit. **Un seul appelant possible, pas deux** :
deux copies de la règle sont deux chances de la faire diverger, et ce dépôt s'est déjà fait
prendre là-dessus.

Documente en commentaire, à l'endroit de la fonction, que l'appelant réel arrive avec le
pillage, et depuis quelle décision (ADR 0017). Un mort-né non expliqué se fait supprimer au
premier ménage.

**Ce que ça débloque, et qu'il faut nommer sans le traiter ici :** l'ADR 0015 laisse ouverte
la question de la file de recrutement qui contourne le plafond — les matières d'un lot en file
sont hors plafond et récupérables par annulation. Avec le plafond qui ne rogne plus, ce
dépassement est devenu permanent. **Signale-le, ne le traite pas** : c'est le sujet du prompt
sur le pillage.

## 2. Le palier 2 devient relatif au QG de lancement du format

**Le défaut.** `TIER_2_HQ_LEVEL = 2` et `skirmish` démarre au QG 2 : le MK2 est ouvert à la
première minute d'une saison courte. Le palier n'existe pas dans ce format.

**La décision.** Le seuil se compte **au-dessus du QG de lancement du format**, pas dans
l'absolu. En `skirmish` (lancement au QG 2) il vaut 3 ; en `campaign` (lancement au QG 1) il
vaut 2 et rien ne bouge. Une seule constante — le nombre de niveaux au-dessus du lancement —
dérivée en un seuil par format, jamais deux seuils écrits à la main.

`view` doit servir le seuil effectif du format, pas la constante : l'écran qui grise une case
et le serveur qui la refuse doivent lire le même nombre, une seule fois.

**Ce que tu ne fais pas** : tu ne touches ni à `TIER_2_FACTOR`, ni aux coûts, ni aux effectifs
nominaux. Le chiffrage penche déjà contre le MK2 — une infanterie MK2 coûte 29 d'alliage plus
12 munitions pour 30 points d'effectif, soit 1,37 par point contre 0,80 pour la MK1 — mais c'est
une question de design, elle n'est pas tranchée, et elle n'est pas la tienne. Signale-la en fin
de rapport.

## Critères d'acceptation

- Les tests existants passent. `convex/economy.test.ts` gagne le cas de l'écrêtage : des stocks
  au-dessus du plafond, une capacité qui tombe, le surplus perdu **une fois** et pas au
  règlement suivant.
- Un test montre qu'un règlement ordinaire, lui, **ne rogne rien** — c'est la moitié déjà codée,
  et les deux règles doivent être tenues ensemble ou elles divergeront.
- Le seuil MK2 vaut 3 en `skirmish`, 2 en `campaign`, et c'est asserté plutôt que commenté.
- `node WWS/simulation/opening/verify.mjs` sort en code 0 : le miroir suit toute constante que tu
  déplaces. S'il dérive, resynchronise `constants.mjs` dans le même passage.
- `node WWS/simulation/opening/run.mjs` tient toujours son garde-fou en `skirmish` pour le joueur
  assidu : au moins 25 actions, au plus une connexion vide sur douze.
- Aucun terme banni (`tick`, `temps réel`, `micro`, `base`, `rush`).

## Ce que tu ne fais pas

Tu n'écris pas le pillage. Tu ne touches pas au plafond de bâtiments — il appartient à
l'ADR 0015 et une décision est en attente à son sujet. Tu ne modifies aucune valeur du chiffrage
de combat. Si l'un de ces deux sujets te paraît impossible à coder proprement sans en ouvrir un
troisième, **arrête-toi et dis-le**.
