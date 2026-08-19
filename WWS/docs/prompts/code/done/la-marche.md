# Prompt Claude Code — la marche, et ce qu'on croise en chemin

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'**ADR 0019** (dont le §3 vient d'être
amendé), l'**ADR 0018 §3** (l'interception au départ), l'**ADR 0014** (initiative de l'attaquant)
et l'**ADR 0006** (slots). Ensuite `src/domain/movement-orders.ts`, `src/domain/interception.ts`,
`convex/movements.ts` (`defenceOf`, `resolveContact`, `sendHome`) et `convex/constants.ts`.
Ne commit pas, ne push pas.

## Pourquoi ce prompt existe

Après cinq passes, les seuls ordres qu'un joueur peut donner sont `attack` et `raid`. Le seul
mouvement possible est hostile, et une arrivée renvoie les survivants par `sendHome`. **Rien ne
pose délibérément une colonne quelque part.**

Donc `foundOutpostHere` n'est atteignable qu'accidentellement, `stationedAt` accepte un point que
rien ne produit, et l'ADR 0019 promet en §1 qu'« une troupe se déplace d'où elle est vers où le
joueur veut » et en §3 qu'« une troupe peut rester sur la carte » sans qu'aucun ordre ne réalise
ni l'un ni l'autre. Il manque le mouvement le plus banal : **aller là, et y rester**.

## 1. Le type `march`

Un mouvement ordinaire à tous égards : il coûte **un slot** (ADR 0006 — sans quoi il contourne le
régulateur central), il est **irréversible** une fois parti, il emprunte la même route et les
mêmes portes de domaine que les autres. Il entre dans `ORDERABLE_TYPES` et dans `refusalOf`.

Sa seule cible est un **point**. Il ne refuse aucune destination pour cause d'appartenance : on
marche sur son propre sol comme sur celui d'un autre — c'est ce qui le distingue d'`attack`, qui
refuse `FRIENDLY_TARGET`.

À l'arrivée, et à défaut de contact (voir §2), la colonne **se pose** : `stationedAt` reçoit le
point. Elle ne rentre pas, elle ne se décroche pas.

Le mot français est **marche**. Attention à `march()`, qui est déjà le nom de la mutation
générique d'envoi — choisis un nom de mutation qui ne collisionne pas et dis lequel.

## 2. Ce qu'on croise : le contact court

**Une force posée n'ordonne jamais rien, mais elle défend le sol où elle se tient.** C'est
l'amendement du §3 de l'ADR 0019, et il tient en deux règles.

- **À l'arrivée.** `defenceOf` répond déjà par ce qui se tient à moins de `ARRIVAL_RADIUS_KM`
  (25 km). Une marche qui arrive sur un adversaire déclenche donc une passe de résolution —
  mais **l'initiative va au posé**, pas à l'arrivant. Il tient le terrain, l'autre est surpris.
  C'est la différence de nature entre une attaque, qui cherche le combat et en garde l'initiative
  (ADR 0014), et une marche, qui le subit.
- **En chemin.** Un mouvement dont la route passe à moins de `ARRIVAL_RADIUS_KM` d'une force
  posée adverse la croise, et la même passe se déclenche, initiative au posé.

**`ARRIVAL_RADIUS_KM` et pas `INTERCEPTION_RADIUS_KM`.** 200 km ferait de trois pions un barrage
continental ; 25 km sur une carte mondiale est une aiguille — ce n'est pas un blocus, c'est une
rencontre. L'interception longue portée reste ce qu'elle est : un fait **entre mouvements**
(ADR 0018 §3). Écris les deux natures côte à côte en commentaire, elles se ressembleront trop pour
qui les relira.

Le calcul se fait **au départ du mouvement**, une seule fois, comme l'interception — même
géométrie, même moment, aucun recalcul continu. Une force posée après un départ ne croise pas ce
mouvement-là.

Une passe par engagement (ADR 0014) : si plusieurs contacts sont possibles, le premier sur la
route répond, et lui seul.

## 3. Les forces posées adverses restent invisibles

`convex/view.ts:306` le dit déjà d'un avant-poste : *« An opponent's outpost is exactly the kind
of thing the fog exists to hide »*. Une troupe posée suit la même règle — **aucune détection à
distance**, ni par le rayon d'un territoire, ni par celui d'une autre force posée. Ce qui se voit
de loin, c'est ce qui **bouge**.

Vérifie que la vue ne fuit rien : après ce prompt, il existe des troupes adverses posées sur la
carte, et c'est le premier objet mobile que le brouillard doit cacher. Un test qui monte deux
joueurs et lit la vue de l'un serait le bon endroit.

## 4. La visée dit ce qu'on ne sait pas

Sans cela, la carte devient un champ de mines et une saison de 48 h se perd en dormant. Quand la
visée porte sur un point qui n'est **ni sur le sol du joueur, ni dans le rayon d'un de ses
avant-postes**, la bannière de visée le signale : *sol non reconnu*.

**Ce libellé ne promet rien et ne doit rien promettre.** Il ne dit pas qu'il y a un adversaire, et
surtout il ne dit pas qu'un sol reconnu serait sûr — les forces posées sont invisibles partout, y
compris chez soi. Il dit exactement une chose : *rien de à moi ne regarde ce sol*. Formule-le pour
que ce soit indiscutable ; un joueur qui croirait avoir reçu une garantie serait plus mal loti que
s'il n'avait rien lu.

C'est de l'information sur son propre niveau d'information, donc aucune fuite de brouillard.
`reperage-des-troupes-posees.md` enrichira la définition de « reconnu » avec `SCOUT_RADIUS_KM` ;
laisse la porte ouverte, ne la referme pas sur les deux sources d'aujourd'hui.

## Critères d'acceptation

- Un test : une marche vers un point vide y pose la colonne — `stationedAt` est le point, aucun
  retour, aucun engagement.
- Un test : une marche arrivant à moins de 25 km d'une force adverse posée déclenche une passe où
  **le posé frappe le premier** ; à plus de 25 km, rien.
- Un test : une marche dont la route passe près d'une force posée adverse la croise, et une force
  posée **après** le départ ne la croise pas.
- Un test de brouillard : la vue d'un joueur ne contient aucune troupe posée adverse.
- Une marche consomme un slot et se refuse quand il n'en reste aucun.
- Aucun texte affiché hors de `src/i18n/fr.ts`. Aucun terme banni (`tick`, `temps réel`, `micro`,
  `base`, `rush`). `npm run build` et `npm run test` passent.

## Ce que tu ne fais pas

Tu ne touches pas à `INTERCEPTION_RADIUS_KM` ni à l'interception entre mouvements. Tu ne codes ni
l'entretien par ancrage ni le repérage — deux prompts les portent et ils lisent ce que celui-ci
produit. Tu n'ajoutes aucune façon de voir une force posée adverse.
