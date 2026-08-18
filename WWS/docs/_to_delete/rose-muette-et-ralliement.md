# Prompt Claude Code — la rose muette et le mot « rappel »

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, l'**ADR 0019**
(`WWS/docs/adr/0019-lavant-poste-ouvre-le-terrain-il-ne-projette-pas.md`) et la note
`WWS/docs/design/propositions/projection-depuis-un-avant-poste.md`. Puis
`src/domain/movement-orders.ts`, `src/domain/compass-rose.ts` et `src/i18n/fr.ts`.
Ne commit pas, ne push pas.

**Un seul sujet : ce que voit un joueur dont la colonne ne peut rien demander ici.** Trois gestes,
tous sur ce sujet. Tu ne touches à aucune règle : `refusalOf` sort de ce prompt inchangé, et
l'ADR 0019 vient de le graver.

## Le défaut

`compassOf` renvoie `null` dès que la liste des types légaux est vide (`compass-rose.ts:186`).
Une garnison d'avant-poste visant autre chose qu'une de ses casernes n'obtient donc **rien** : ni
rose des vents, ni message, ni curseur qui refuse. Le joueur lit une panne de clic droit là où il
y a une règle — c'est le rapport qui a déclenché ce travail.

L'ADR 0015 interdit d'**offrir un choix mort**. Il n'interdit pas d'**expliquer une absence** :
les deux ne sont pas la même chose, et c'est la lecture que l'ADR 0019 retient. Ne la relitige
pas ; si l'écriture te fait penser qu'elle est fausse, arrête-toi et dis-le.

## Ce que tu codes

### 1. La rose s'ouvre quand même, et dit pourquoi

Sur une cible où aucun type n'est légal, la rose des vents s'affiche en **état de refus** : pas de
branches, un motif. Le motif se lit dans `refusalOf` — les codes existent tous
(`BARRACKS_TARGET_ONLY`, `FRIENDLY_TARGET`, `NOT_ORDERABLE`, `OUTPOST_TARGET_ONLY`,
`REGION_TARGET_ONLY`, `INFANTRY_ONLY`, `LAND_MOVEMENT_ONLY`, `EMPTY_MOVEMENT`) et `fr.ts:283-291`
les traduit déjà.

Quand plusieurs types sont refusés pour des motifs différents, il en faut **un seul** à l'écran.
Choisis une règle de priorité, écris-la en commentaire, et justifie-la par ce qu'elle apprend au
joueur — pas par l'ordre de la table. Mon avis : le motif le plus **spécifique à la colonne**
plutôt qu'à la cible, parce qu'il est celui que le joueur ne peut pas deviner en regardant la
carte. À toi de trancher et de le dire.

### 2. Le mot « rappel » ment

`recall` est servi par « rappel de garnison » (`fr.ts:95`). Le mot raconte un retour au pays ;
la règle dit « rejoindre **une** de mes casernes, y compris celle que je viens de bâtir à
400 km ». Le refus, lui, dit la vérité (`fr.ts:289`).

Change **uniquement `src/i18n/fr.ts`**. Le type `recall` reste `recall` dans le code et dans la
table `movements` : ADR 0016, le code est en anglais et le joueur ne le voit pas — une migration
de schéma pour un libellé serait un coût sans contrepartie. Dis-le en commentaire à côté du
`case 'recall'` de `refusalOf`, pour que le prochain ne prenne pas l'écart pour un oubli.

Mot proposé : **ralliement** (« un ralliement marche sur une de vos casernes, et sur rien
d'autre »). Si tu trouves mieux, propose — mais le mot retenu doit entrer dans le glossaire de
`WWS/CONTEXT.md` dans le même passage.

### 3. Les casernes se montrent

Quand une colonne dont l'origine est un avant-poste est armée et que la carte passe en visée, les
régions portant une caserne du joueur se **surlignent**. Réutilise la surbrillance de région
existante (`src/map/engine/terrain.ts`), jamais un style neuf.

Aucune fuite de brouillard : ce sont les bâtisses du joueur, il les connaît. Ne surligne rien pour
une colonne d'origine `'building'` — ses cibles légales sont le monde entier moins ses propres
régions, un surlignage n'apprendrait rien.

## Critères d'acceptation

- Un cas de test dans `movement-orders.test.ts` ou son voisin : une colonne d'origine `'outpost'`
  visant une région sans caserne produit `BARRACKS_TARGET_ONLY`, et la rose s'ouvre en refus avec
  ce motif — pas `null`.
- La règle de priorité entre motifs est testée, pas seulement commentée.
- Aucun appel à `refusalOf` dupliqué : la rose lit la même fonction que les mutations, l'ADR 0015
  vaut aussi pour un refus.
- Aucun texte affiché hors de `src/i18n/fr.ts` (ADR 0016). Le serveur continue de ne renvoyer que
  des codes.
- Aucun terme banni (`tick`, `temps réel`, `micro`, `base`, `rush`).
- `npm run build` et `npm run test` passent.

## Ce que tu ne fais pas

Tu ne touches pas à `refusalOf` ni à `ORDERABLE_TYPES` : la règle est gravée par l'ADR 0019 et ce
prompt ne la rouvre pas. Tu ne touches pas au schéma Convex. Tu ne corriges pas la visée au
dézoom — c'est un défaut distinct, il a son prompt.
