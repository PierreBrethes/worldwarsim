# Prompt Claude Code — gardes de saison et slots honnêtes

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, puis `convex/movements.ts`,
`convex/troops.ts`, `convex/constructions.ts`, `convex/view.ts` et `convex/constants.ts` autour de
`MOVEMENTS_IN_FLIGHT`. ADR 0006 et 0015 (les slots). Ne commit pas, ne push pas. **Backend seul,
deux sujets courts, avant le premier skirmish.**

## Pourquoi

Deux mensonges silencieux, trouvés à l'audit du 25/08 :

1. **Les jobs planifiés ignorent le statut de la saison.** `claimVictory` sort si la saison n'est
   pas `launched`, mais `movements.arrive`, `movements.intercept`, `troops.deliver` et
   `constructions.finish` ne regardent jamais `season.status` : après une conclusion (ou un
   `destroy` qui laisserait un job orphelin), combats, livraisons et chantiers continuent d'écrire.
   Un skirmish conclu qui se bat encore fausserait toutes les mesures d'après-test.
2. **L'UI promet ce que le serveur refuse.** `view.ts` sert `slots.total = 1 + hqLevel` (c'est la
   règle : ADR 0006, réindexée par 0015), mais `march` refuse au-delà de la constante
   `MOVEMENTS_IN_FLIGHT = 1`. Un joueur QG 2 voit deux slots et n'en a qu'un. La constante était
   un échafaudage ; la règle est écrite, le serveur doit la suivre.

## Ce que tu codes

1. **Une garde partagée**, une seule fonction (`seasonStillPlays(ctx, seasonId)` ou l'équivalent
   dans le module qui possède déjà `playerByToken`), appelée en tête de chaque job planifié :
   `arrive`, `intercept`, `deliver`, `finish`, `resumeQueues`. Si la saison n'est plus `launched`,
   le job **rend sans écrire** — il ne lève pas (un job qui lève n'est pas réessayé par Convex et
   resterait dans le dashboard comme une erreur qui n'en est pas une). Le mouvement/lot/chantier
   reste tel quel : la saison est finie, personne ne le relira ; `destroy` purge tout.
2. **Le plafond de mouvements suit le QG.** Supprime `MOVEMENTS_IN_FLIGHT` ; `march` (et toute
   autre porte qui compte les mouvements en vol) lit le même `1 + hqLevel` que `view.ts`, par une
   fonction unique dans `src/domain/` (pas deux calculs). Les `return` ne comptent pas, comme
   aujourd'hui. Le refus `MOVEMENT_IN_FLIGHT` dit son remède avec les vrais chiffres, comme le
   plafond de bâtiments le fait déjà (« un QG niveau 3 le porte à 4 »).

## Critères d'acceptation

- Test Convex : une saison `concluded` avec un mouvement en vol ; `finishAllScheduledFunctions` ne
  produit aucun engagement, aucune livraison, aucun chantier fini, aucune mutation de stock.
- Test Convex : QG niveau 2 → deux mouvements acceptés, le troisième refusé avec le remède ; QG
  niveau 1 → un seul. Les `return` n'occupent pas de slot.
- `view.slots.total` et le refus de `march` sortent de la même fonction ; grep `MOVEMENTS_IN_FLIGHT`
  vide (y compris `WWS/simulation/`, note la divergence dans son README si le miroir la lit).
- Aucun terme banni. `npm run build`, `npm run test` passent.

## Ce que tu ne fais pas

Pas de fin de saison à l'heure (prompt à part, après le test). Pas de rattrapage des mouvements
fantômes (idem). Tu ne touches ni à la table `seasons` ni au front.
