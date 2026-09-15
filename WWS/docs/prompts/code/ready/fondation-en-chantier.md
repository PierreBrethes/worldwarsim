# fondation-en-chantier — un avant-poste s'achète et se bâtit, il ne s'entretient plus

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0020 §1, §5-7 et **§10 en entier**,
l'ADR 0024 §1, `convex/movements.ts` (`foundOutpostHere`), `convex/upkeep.ts`,
`convex/production.ts` (en-tête). Ne commit pas, ne push pas. Suppose `elever-un-avant-poste`
livré (clé de coût `outpost`, séquence régler / écrire / rapporter). Un chantier, un commit.

> **Décision 7a du 15/09 (rapport Discord, ligne 10)** : Pierre révise l'ADR 0020 §10 en
> connaissance de cause, avec une condition — **la première saison compte les avant-postes
> par joueur au jour 7**. `a-mesurer.md` est généré depuis les marqueurs `@a-mesurer` — ne pas
> l'éditer : le marqueur de `buildCost('outpost', …)` porte la mesure attendue (« avant-postes
> debout par joueur au jour 7 ») et la ligne apparaîtra à la régénération. La mesure elle-même
> va dans `rapports/` de la prochaine partie de contrôle.

## La décision (Pierre, 15/09) — et ce qu'elle révise

Trois choses, une seule règle : **fonder un avant-poste coûte des ressources comme n'importe
quel bâtiment, prend du temps comme un chantier, et un avant-poste debout ne consomme rien.**

C'est une **révision de l'ADR 0020 §10**, qui disait l'inverse et pourquoi : « le frein
d'expansion est l'entretien, pas un plafond — un coût de fondation croissant punirait une
fois, à l'achat, puis serait oublié ; l'entretien pèse tant que l'empire existe ». Pierre
retire l'entretien (`OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL`, placeholder jamais mesuré) après
le retour de la partie du 15/09 : un frein invisible qui vide le stock de vivres sans que le
joueur sache pourquoi n'est pas un frein, c'est une fuite. Le frein devient **le prix, par
niveau** — fondation puis élévations — et le trajet de la colonne qui fonde. Grave la
révision dans l'ADR 0020 sous « Révision du 15/09 », avec cette raison et la réserve : si la
première saison mesurée montre un joueur qui sème des points sans limite, le frein à
remettre est un **prix croissant avec le nombre de points debout**, pas l'entretien.

## La règle

- **Fonder se paie** : `buildCost('outpost', 1)` en alliage (et ce que la table dit), débité
  du stock national à l'ordre, `@a-mesurer`, calé sur un bâtiment de projection niveau 1.
  Refus `INSUFFICIENT_RESOURCES` avec la phrase (rien de grisé, la rose lit la même fonction
  que le serveur). L'aperçu de fondation annonce prix et durée avant de confirmer.
- **Fonder prend du temps** : l'avant-poste est **en chantier** jusqu'à
  `standsAt = ordre + buildMinutes('outpost', 1)`. En chantier : ne tient rien, n'atteint
  rien, ne détecte rien, n'offre aucun emplacement, ne relaie pas (`route-timing.ts`). Sa
  garnison y est stationnée ; le mât porte le cachet « en chantier » et l'heure. Ce que ça
  achète : une fenêtre où le camp est posé et visible (ADR 0024 §1) et où le point n'existe
  pas encore — un voisin peut réagir. Sans elle, la fondation était le seul geste sans
  contre-coup possible.
- **Le lever à `standsAt` est un événement de couleur** : régler les stocks à l'ancienne
  couleur, écrire, rapporter (`settleBeforeChange` / `reportChange`), relever le sol
  (`fileSurvey`), dépêche `outpostStands`. Rendez-vous programmé à l'ordre, réglé à `standsAt`
  exactement même s'il se réveille en retard — même motif que la fin d'une désactivation.
- **Le chantier meurt** si la garnison le quitte entière ou est détruite avant `standsAt` :
  point supprimé, **rien n'est remboursé** (5a par cohérence : ce qui est dépensé l'est),
  dépêche `foundationLost`. Une partie de la pile qui reste garde le chantier vivant.
- **Plus d'entretien d'avant-poste** : `OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL` et sa lecture dans
  `upkeep.ts` disparaissent ; l'entretien des **troupes** (`FOOD_UPKEEP_PER_TROOP_PER_HOUR`,
  `UPKEEP_UNSUPPLIED_MULTIPLIER`) ne bouge pas. Tout ce qui l'affichait — colonne QG, fiche
  `?`, aide-mémoire, `RESTE-A-CODER.md` « valeurs @a-mesurer » — se met à jour. Le miroir de
  simulation aussi, ou le dire.

## Ce qu'il faut

- `outposts.standsAt?: v.number()` — `v.optional`, un point d'avant le champ est debout
  (`?? foundedAt`). Une fonction pure `isStanding(outpost, now)` lue par **tout** ce qui lit
  un avant-poste : `holding.ts` (`reading`), `sites.ts` (`reachOf`), `surveys.ts`
  (`standingObserversOf`), `view.ts` (`carrying`), `route-timing.ts`. Un chantier a la même
  signature qu'un point désactivé pour la couleur — **sans** l'immunité : on peut l'attaquer.
- `foundOutpostHere` : refus de prix, débit, insertion avec `standsAt`, plus de
  `settleBeforeChange` à l'ordre (rien ne change de couleur), `ctx.scheduler.runAt` du lever.
- Le lever : mutation interne idempotente (point disparu ou déjà debout → rien).
- Départ / destruction de la garnison : `movements` (départ) et `combat` (résolution) tuent
  un chantier vidé.
- Vue et carte : `me.outposts[].standsAt`, marqueur en chantier, panneau de garnison avec la
  ligne et l'heure. « À faire maintenant » ne dit rien — attendre n'est pas un problème.
- ADR 0020 §10 : le paragraphe de révision ; `CLAUDE.md` : la phrase « le frein d'expansion
  n'est plus un plafond mais l'entretien » devient fausse, la corriger.

## Cas d'acceptation

1. Stock insuffisant : la rose dit le prix manquant, la mutation refuse, rien n'est inséré.
2. Fondation ordonnée : débit exact, point en chantier — aucune région tenue, aucune couleur,
   aucun relevé, `OUT_OF_OUTPOST_REACH` sur sa propre région, aucun effet de relais.
3. À `standsAt` : tenu, coloré, relevé, emplacements — les stocks d'un voisin coupé par la
   nouvelle couleur sont réglés à l'heure du lever, pas de l'ordre.
4. Garnison partie entière avant `standsAt` : point supprimé, aucun remboursement, dépêche.
   Partie à moitié : chantier vivant. Détruite au combat : point supprimé.
5. Un point d'avant le champ est debout.
6. Un avant-poste debout de niveau 3 pendant 10 h : stock de vivres et de charbon inchangés
   par lui — plus aucune ligne d'entretien d'avant-poste nulle part (test sur `upkeep`).
7. Le camp en chantier est relevé par une portée adverse comme toute force posée
   (ADR 0024 §1) — aucun cas spécial.
8. Vérifieur vert ; miroir branché ou déclaré non concerné.
