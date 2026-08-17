# Prompt Claude Code — le catalogue par palier de QG

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, les ADR `0015` et `0017`,
puis `WWS/docs/design/propositions/plan-progression-v1.md` — ce prompt est son étape 1, il en
code le squelette et rien d'autre. Ne commit pas, ne push pas.

## Ce que tu codes

### 1. La table du catalogue

Dans `convex/constants.ts`, une table complète clé → niveau de QG requis, sur le modèle de
`WINDOW_OF_BUILDING` : un `Record<BuildingKey, number>` **exhaustif**, retirer une clé casse la
compilation. Les valeurs sortent du plan de progression :

| Niveau | Clés |
|---|---|
| 1 | `hq`, `farm`, `mill`, `mine`, `oilWell`, `foundry`, `quartermaster`, `warehouse`, `depot` |
| 2 | `barracks`, `billets`, `arsenal`, `listening` |
| 3 | `airfield`, `port` |

**L'entrepôt et le dépôt restent au niveau 1 — ce n'est pas négociable dans ce prompt.** C'est
le stockage qui protège le joueur absent ; le monter punirait exactement celui qui ne peut rien
y faire (plan V1, § QG 1).

### 2. Le refus qui nomme son seuil

`placementRefusal` (`src/domain/economy.ts`) gagne un refus `BUILDING_LOCKED` quand le QG n'a
pas le niveau de la clé. Il vit dans le domaine pur comme les autres — le serveur refuse avec,
l'écran de construction n'offre que ce qui est accepté (ADR 0015 : contextuel, jamais grisé).
Le détail du refus **nomme le niveau requis** : « demande un QG de niveau 3 », jamais un refus
muet.

Ordre des refus : le verrou de palier se place *après* le plafond de bâtiments et *avant* le
gisement — du plus général au plus local, comme le commentaire de la fonction l'explique déjà.

### 3. Le blindé rejoint le seuil du palier 2

Le plan veut l'arme et son contre ensemble (question 6, option c) : le blindé n'est plus
recrutable au lancement d'un skirmish, il s'ouvre **au même seuil que le MK2** —
`tier2HqLevel(format)`, déjà dérivé par format. Ne crée pas de deuxième table pour ça : le rôle
`armor` lit le seuil existant, un seul nombre bouge les deux, et c'est le sens de la décision.
`troops.workshop` et `troops.recruit` le refusent avec un code qui nomme le seuil ; `view` sert
ce qu'il faut pour que l'écran dise la même chose.

Les autres rôles ne bougent pas : les rôles aériens et navals sont déjà portés par leurs
bâtiments de projection, que la table du § 1 verrouille au niveau 3.

### 4. Les interactions à ne pas casser

- Le **socle** du skirmish contient l'arsenal (niveau 2) et le format lance au QG 2 : légal.
  Celui de la campagne ne contient que du niveau 1 : légal. Un test l'asserte pour les deux
  formats — le socle d'un format ne doit jamais contenir une clé au-dessus de son QG de
  lancement, sinon la saison naît avec une dette impayable.
- `foundationOwed` et la pose gratuite passent **après** le verrou de palier comme après toutes
  les autres règles : le socle achète le prix et l'attente, jamais un passe-droit de catalogue.

## Critères d'acceptation

- Les tests existants passent. Nouveaux cas : une clé de niveau 3 refusée au QG 2 avec le seuil
  nommé ; la même acceptée au QG 3 ; le blindé refusé au lancement d'un skirmish, accepté au
  QG 3 ; l'infanterie MK1 acceptée partout dès qu'une caserne existe ; l'assertion sur les
  socles des deux formats.
- `node WWS/simulation/opening/verify.mjs` sort en code 0 — ajoute la table au miroir **et au
  contrôle** (`flatTable` sait la lire), pas seulement au miroir.
- `node WWS/simulation/opening/run.mjs` : garde-fou tenu en skirmish. Les plans du simulateur
  contiennent aérodrome et port en fin de liste — la politique saute ce qui est refusé, les
  mesures ne devraient presque pas bouger ; si elles bougent beaucoup, dis-le, c'est une
  information.
- Aucun terme banni.

## Ce que tu ne fais pas

Rien du QG 4 (pillage, embargo, exposition — leurs systèmes n'existent pas) ni du QG 5 (son
réglage attend le simulateur). Pas de « prérequis de chaîne » entre bâtiments — le palier de QG
est le seul verrou, c'est l'ADR 0015 (le QG unique étranglement) qui le veut. Si le verrou de
palier te semble entrer en conflit avec la portée des avant-postes (prompt
`avant-poste-et-portee.md`, peut-être déjà passé), les deux règles s'empilent — un puits en
Arabie demande *et* la portée *et* le QG du puits — et un test le montre.
