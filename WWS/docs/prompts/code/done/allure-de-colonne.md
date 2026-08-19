# Prompt Claude Code — l'allure de colonne : l'infanterie embarquée roule

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, la note
`WWS/docs/design/propositions/transport-terrestre-et-allure.md` (validée le 19/08), l'**ADR 0012**
(coûts par milieu) et l'**ADR 0017** (le miroir du simulateur suit, sous peine de mentir). Ensuite
`src/domain/routing.ts` (`COST_BY_MEDIUM`, `computeRoute`), `src/domain/movement-orders.ts`
(`routeModeOf`, `LIFT_CAPACITY`, `LIFT_COST`), `convex/routes.ts` et
`WWS/simulation/opening/constants.mjs` + `verify.mjs`.
Ne commit pas, ne push pas. **C'est le premier prompt qui touche au levier central mesuré
(14 min / 1 000 km) — la précision compte plus que la vitesse d'exécution.**

## La règle (note validée)

**Une colonne terrestre dont l'infanterie tient dans ses transports va plus vite. C'est le seul
effet du transport terrestre.**

- `LIFT_CAPACITY.landTransport = 2` — deux places. Point de départ assumé, non mesuré, avec le
  raisonnement en commentaire : à 2, motoriser huit infanteries coûte quatre camions (un
  investissement) ; à 4, la motorisation serait presque gratuite et l'allure à pied disparaîtrait.
- **Motorisé se lit sur la composition** : le blindé et les transports roulent par nature ; seule
  l'infanterie a besoin d'une place. Une colonne est motorisée si la somme des places
  d'infanterie (`LIFT_COST.infantry` chacune) tient dans la somme des capacités de ses transports
  terrestres. Une infanterie de trop met **toute la colonne au pas** — l'allure est celle de la
  colonne entière, comme la route est celle de la pile.
- **Le coût terrestre motorisé vaut ×1,15** contre ×1,6 à pied et ×1,0 en mer. Assumé, non
  mesuré : plus vite que la marche, un peu plus lent que la mer — l'autoroute maritime reste
  l'autoroute.

## Ce que ça touche, et qu'il faut regarder en face

Le coût par milieu pèse les arêtes de Dijkstra : changer le coût terrestre d'une colonne change
**sa route**, pas seulement sa durée. Cas concret à tester : Marne → Riyad coûte 110,9 par la
terre et 88,0 par la Méditerranée pour une colonne à pied — motorisée, la terre tombe vers
110,9 × (1,15/1,6) ≈ 79,7 et **bat la mer**. Une colonne motorisée avec cargo préférera le trek ;
c'est cohérent (elle n'a plus la pénalité de marche ni le transbordement) et c'est un **changement
de comportement à écrire dans le rapport**, pas un effet de bord à découvrir.

Implémentation : le facteur terrestre devient un paramètre du calcul de route (un
`landCostFactor`, ou un mode `landMotorized` — choisis et dis pourquoi), décidé par la composition
au même endroit que `routeModeOf`. **Une seule vérité** : la rose, l'aperçu et la mutation doivent
lire la même composition et arriver à la même allure — si l'aperçu montrait une durée à pied pour
une colonne motorisée, on recréerait le mensonge d'affichage qu'on vient de payer trois prompts.

## Le miroir

`WWS/simulation/opening/constants.mjs` reçoit les deux valeurs nouvelles et `verify.mjs` les
compare — c'est le garde-fou de l'ADR 0017, il a déjà attrapé une dérive une fois. Si le
simulateur ne modélise pas encore les trajets, dis-le et déclare les valeurs « non vérifiables
comme avant » plutôt que de les omettre.

## L'écran

L'aperçu de visée dit l'allure à côté du milieu : « par terre, motorisé » / « par terre, à pied ».
Le compteur de places de `la-pile-dit-ses-places.md` couvre déjà le reste — si ce prompt-là n'est
pas passé, dis-le et n'en fais pas la moitié ici.

## Critères d'acceptation

- Deux infanteries + un transport terrestre : durée terrestre × (1,15/1,6) par rapport à la même
  route à pied. Trois infanteries + un transport : à pied, durée inchangée.
- Le cas Marne → Riyad motorisé : la route retenue change de milieu, et le rapport le dit avec
  les deux coûts.
- La rose, l'aperçu et la mutation donnent la même durée pour la même pile — un test le vérifie
  sur une colonne motorisée.
- Le miroir passe `node verify.mjs`. Aucun texte hors de `src/i18n/fr.ts`. Aucun terme banni.
  `npm run build` et `npm run test` passent.

## Ce que tu ne fais pas

Tu ne donnes au transport terrestre aucun autre effet — la note écarte l'attrition, l'entretien
et la protection, avec leurs raisons. Tu ne touches ni à `COST_BY_MEDIUM.sea`, ni à
`TRANSFER_COST`, ni aux capacités mer/air. Tu ne stockes aucune relation « à bord de ».
