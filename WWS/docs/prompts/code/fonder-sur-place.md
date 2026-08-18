# Prompt Claude Code — fonder un avant-poste devient une action sur place

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'**ADR 0019** et l'**ADR 0004**. Ensuite
`convex/movements.ts`, `convex/schema.ts` (le champ `specialization` de `movements`),
`src/domain/movement-orders.ts` et `WWS/docs/design/03-carte-et-avant-postes.md`.
Ne commit pas, ne push pas. **Petit prompt, un seul sujet.**

## Le défaut

`outpost` est un **type de mouvement** : le joueur choisit la spécialisation au départ, à des
heures de marche du terrain qu'il va découvrir. Le commentaire du schéma l'assume — « c'est là que
le joueur se tient quand il décide » — mais cette phrase n'était vraie que parce qu'une colonne
partait forcément d'un bâtiment. Depuis l'ADR 0019, une colonne peut se tenir *sur place*, et
décider en voyant où elle est.

## Ce que tu codes

- Le type de mouvement `outpost` **disparaît** de `ORDERABLE_TYPES` et de `refusalOf`. Ses règles
  (infanterie seule, jamais sur une région déjà mienne) ne se perdent pas : elles migrent telles
  quelles vers la mutation ci-dessous.
- Une mutation **`foundOutpostHere`** : une colonne posée, entièrement composée d'infanterie,
  fonde un avant-poste à l'endroit exact où elle se tient, et en devient la garnison — c'est
  déjà ce que faisait l'arrivée d'un mouvement `outpost`, moins le voyage.
- `specialization` quitte la table `movements` pour cette mutation. Un champ de moins, porté par
  toutes les autres formes de mouvement sans être lu.
- Les refus existants sont réutilisés (`INFANTRY_ONLY`, `FRIENDLY_TARGET`) plutôt que redéclarés.

## Ce que ça rend gratuit, et qu'il faut noter

Le joueur voit le terrain avant de choisir la spécialisation. C'est un gain de design que
personne n'a demandé et qu'il faut écrire en commentaire, sinon quelqu'un rétablira le choix au
départ en croyant simplifier.

## Critères d'acceptation

- Un test : une colonne d'infanterie posée fonde ; une colonne contenant autre chose est refusée
  par `INFANTRY_ONLY` ; une colonne posée sur une région portant déjà une de mes bâtisses est
  refusée par `FRIENDLY_TARGET`.
- La colonne fondatrice devient la garnison de l'avant-poste — l'invariant de `garnison-adresse.md`
  tient toujours après la mutation.
- Plus aucune référence à un mouvement de type `outpost` dans le code de départ.
- Aucun texte affiché hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et
  `npm run test` passent.

## Ce que tu ne fais pas

Tu ne changes ni le rayon (`OUTPOST_REACH_KM`), ni la règle qu'un avant-poste ne change jamais de
propriétaire (ADR 0004), ni la liste des spécialisations.
