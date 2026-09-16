# resolution-simultanee — les deux camps tirent en même temps (révision de l'ADR 0014)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0014 (« résolution séquentielle,
initiative à l'attaquant » — **c'est ce qui change**), l'ADR 0018 §1-§2-§4, la fiche 08 §3,
`propositions/chiffrage-combat.md` §4, **`propositions/combat-simultane-terrain-retranchement.md`
§1** (la décision), `src/domain/combat.ts` (`resolveEngagement`, `hit`, `riposteTarget`, `pick`,
`byStrikeOrder`), `convex/combat.ts`, `convex/validators.ts` (`phase: strike | riposte`, l.626),
`src/domain/journal.ts` (les comptes rendus), `src/domain/combat.test.ts`. Ne commit pas, ne
push pas. Un chantier, un commit.

> **Décision 1b du 16/09 : révision de l'ADR 0014.** Plus d'initiative : les deux camps tirent
> sur l'état d'avant la passe, les pertes s'appliquent ensemble. Tout le reste de l'ADR tient.

## La règle

Une passe = **une salve de chaque camp, calculée sur les effectifs d'avant la passe**. Chaque
tireur choisit sa cible comme aujourd'hui (`pick`, ordre canonique), la table dit s'il l'atteint
(case absente = ne tire pas), les munitions se tirent comme aujourd'hui (`draw`, `dryFactor`).
Le défenseur garde `DEFENDER_BONUS` exactement là où il est appliqué aujourd'hui (÷ pour
l'attaquant, × pour le défenseur — ne corrige pas le doublon, note-le seulement dans le code :
c'est relu avec le terrain). Les pertes sont **appliquées après** que les deux camps ont tiré ;
la déroute et la destruction se lisent alors, une fois. Le plafond « on ne perd pas plus que ce
qu'on a » reste par cible, dans l'ordre des tireurs (deux colonnes sur la même troupe : la
seconde gaspille ce qui dépasse — c'est la règle qui borne l'empilement, elle ne bouge pas).
`winnerOf` inchangé.

## Ce qui change

1. `resolveEngagement` : les deux boucles tirent depuis un **instantané** des effectifs
   (`strength` d'avant la passe pour le ratio `strength / nominal` du tireur) ; l'application
   des pertes, l'état `routed` / `destroyed` et `struckBy` se règlent après les deux boucles.
   `riposteTarget` disparaît (plus de « celui qui m'a frappé ») : le défenseur choisit avec `pick`,
   comme l'attaquant. **Un défenseur qui sera détruit dans cette passe tire quand même** — c'est
   le sens du simultané.
2. `Strike.phase` : les nouveaux comptes rendus écrivent `'strike'` pour les deux camps ; le
   littéral `'riposte'` **reste au validateur** (des engagements enregistrés le portent, aucune
   migration) et le journal continue de le lire. Un commentaire le dit legacy, comme `decoy`.
3. Le compte rendu (`journal.ts`) : s'il dit « riposte » quelque part, il dit « salve » ; le
   rejeu futur lira deux salves, pas une frappe puis une réponse.
4. ADR 0014 : bannière « Révision du 16/09/2026 — résolution simultanée (décision 1b) », le
   paragraphe « initiative à l'attaquant » réécrit, « Justification » complétée : « les
   défenseurs dépensent moins que les attaquants ; l'attaque vaut en supériorité ou en
   surprise ». Fiche 08 §3 et `chiffrage-combat.md` §4 (ligne « Interception en route inverse
   l'initiative » → sans objet) portent la même bannière. `CONTEXT.md` si « riposte » y figure.
5. `a-mesurer.md` : `DEFENDER_BONUS` reçoit son marqueur s'il ne l'a pas, mesure nommée —
   rapport pertes attaquant / défenseur par engagement sur une saison.

## Cas d'acceptation (tests d'abord — réécris `combat.test.ts` cas par cas, ne les supprime pas)

1. 50 contre 50 fantassins en plaine, munitions pleines : les deux perdent selon la table à
   effectif plein (le défenseur ×1,15) ; l'attaquant perd **plus** que le défenseur. Chiffre les
   deux et écris-les dans l'ADR.
2. Un blindé attaque un bombardier posé (case absente) : aucune salve ni d'un côté ni de
   l'autre si le bombardier ne l'atteint pas non plus ; sinon une seule salve, celle qui atteint.
3. Un défenseur amené sous le quart par la salve adverse a **tiré quand même** dans la même
   passe (sa frappe figure aux `strikes`), puis est `routed`.
4. Deux colonnes attaquantes sur une seule troupe : la seconde est plafonnée à ce qui reste
   après la première, dans l'ordre canonique — rejoue le cas d'empilement existant.
5. Munitions à sec d'un côté : `dryFactor` s'applique à ce côté seul.
6. Un engagement enregistré avec `phase: 'riposte'` se relit au journal sans erreur.
7. Les soixante-quinze couples atteignables de `DAMAGE_TABLE` rejoués (test existant) tiennent.
8. Vérifieur vert.

## Hors périmètre

Terrain, retranchement, tenaille, artillerie : Registre 28-30. Aucune valeur de la table ne
bouge.
