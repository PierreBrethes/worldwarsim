# Prompt Claude Code — viser un point, à toutes les échelles

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'**ADR 0019** et l'**ADR 0012**. Ensuite
`src/domain/movement-orders.ts`, `src/routes/-plateau/MovementPreview.tsx`,
`src/routes/plateau.tsx` et `src/map/engine/`. Ne commit pas, ne push pas.

**Deuxième prompt de l'ADR 0019.** Il suppose passés `mouvement-sans-origine.md` **et**
`la-porte-se-lit-sur-la-route.md`. Il **absorbe et
remplace** `WWS/docs/prompts/code/visee-au-dezoom.md`, qui décrivait le même défaut sous un angle
plus étroit.

## Le défaut

`MovementAim` n'accepte que deux formes (`movement-orders.ts:10-12`) : une région, ou un
avant-poste. Deux conséquences :

- une destination est toujours **le centre d'une région**, jamais l'endroit que le joueur a
  désigné, ce que l'ADR 0019 supprime ;
- les régions ne s'affichent qu'en dessous de 65 unités de caméra, donc **dézoomé, le clic droit
  est mort pour n'importe quelle colonne** — la visée ne trouve qu'un pays et retourne `null`.

## Ce que tu codes

`MovementAim` gagne une troisième forme : `{ kind: 'point'; lon: number; lat: number }`.

Les deux formes existantes **restent**. Elles ne sont pas un doublon : cliquer le jalon d'un
avant-poste est la façon dont un raid désigne sa cible, et cliquer une région est la façon dont on
désigne une bâtisse. Le point est ce qui répond partout ailleurs — donc à toutes les échelles, y
compris au-delà du seuil de 65 unités, puisqu'un point n'a pas besoin qu'une région soit dessinée
pour exister.

Le résultat direct : **l'état « je suis en visée et rien ne répond » disparaît.** C'est le critère
qui compte.

Côté trajet, rien de neuf : la grille de routage travaille déjà en raster (ADR 0012) et l'aperçu
d'arc trace déjà la route réelle. Un point est une entrée plus naturelle qu'un centroïde — vérifie
que rien en aval ne réclame un `regionId` pour calculer une route, et si c'est le cas, dis où.

## La rose ne s'ouvre plus jamais vide

`mouvement-sans-origine.md` l'a signalé sans le rustiner, et c'est ici que ça se répare :
`compassOf` renvoie encore `null` quand aucun type n'est légal (`compass-rose.ts:186`). Une
colonne dont la porte de domaine est fermée n'a aucun type légal, donc aucune rose, donc **le même
silence que celui qui a ouvert ce chantier, déplacé d'un cran**.

Sur une cible où rien n'est légal, la rose s'affiche en **état de refus** : pas de branches, un
motif, lu dans `refusalOf` — les codes existent tous et `src/i18n/fr.ts` les traduit déjà. Quand
plusieurs types sont refusés pour des motifs différents, il en faut **un seul** à l'écran : choisis
une règle de priorité, écris-la en commentaire, et justifie-la par ce qu'elle apprend au joueur.
Mon avis : le motif le plus spécifique à la colonne plutôt qu'à la cible, parce qu'il est celui
que le joueur ne peut pas deviner en regardant la carte.

L'ADR 0015 interdit d'**offrir un choix mort**, pas d'**expliquer une absence**. Ne relitige pas
cette lecture ; si tu la crois fausse, arrête-toi et dis-le.

## Ce que tu instruis avant de coder

Que se passe-t-il quand le point visé tombe **sur** quelque chose — un avant-poste, une région
portant une bâtisse ? Deux lectures :

1. la visée le résout et renvoie la forme précise (`outpost` / `region`), le point n'est qu'une
   entrée ;
2. le point reste un point, et c'est la passe de résolution qui découvre ce qui s'y trouve à
   l'arrivée.

Ma préférence est **2**, parce qu'elle est la seule compatible avec le brouillard : résoudre à la
visée dirait au joueur qu'il y a un avant-poste là où il croyait viser du vide. Instruis-la,
tranche, et écris le pourquoi en commentaire.

## Critères d'acceptation

- Depuis un plateau dézoomé, préparer un mouvement puis viser aboutit à une rose des vents —
  jamais à un silence.
- Un mouvement envoyé vers un point arrive **à ce point**, pas au centre de la région qui le
  contient. Un test le vérifie sur un point volontairement éloigné du centroïde.
- La caméra ne se déplace pas toute seule pendant la visée.
- Une colonne navale posée sur un sol sans port produit une rose **en refus**, jamais `null`.
- Aucun texte affiché hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et
  `npm run test` passent.

## Ce que tu ne fais pas

Tu ne touches pas à `stationedAt` (prompt 3), tu ne fais pas du pays une cible légale, et tu
n'ajoutes aucune règle de refus — le prompt 1 a fixé la table.
