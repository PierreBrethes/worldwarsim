# Prompt Claude Code — les munitions ne se paient qu'une fois : au tir

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`. Ne commit pas, ne push pas.

## Pourquoi

Question 18 du 18/08, tranchée le 25/08 (option a) : les munitions sont facturées **deux
fois** — le combat tire sur le stock national à chaque frappe, ET le recrutement débite un
`ammunitionLoad` qui ne va nulle part. Maintenant que les munitions sont le goulot mesuré du
skirmish (simulation du 25/08) et que le kit de départ en porte (`startingAmmunition`), cette
double facture fausse toute mesure. Décision : **une seule facturation — le combat paie au
tir, le recrutement cesse de débiter.** Effet attendu et assumé : l'infanterie retombe à ses
18 d'alliage réels.

## Le travail

- `convex/troops.ts` (et `recruitmentCost`) : le recrutement ne débite plus la composante
  munitions. Fais l'inventaire de ce que devient `ammunitionLoad` — la donnée « ne va nulle
  part » aujourd'hui : si rien d'autre ne la lit (écran de coût, transport, combat), elle
  disparaît du spec et du schéma plutôt que de rester en champ mort ; si quelque chose la lit,
  dis-le dans ton rapport au lieu de la supprimer.
- Le combat ne change pas : il paie déjà au tir sur le stock national — vérifie-le d'un test
  si aucun ne le grave déjà.
- Écrans : toute ligne de coût de recrutement qui affichait des munitions cesse de le faire ;
  aucun libellé ne doit annoncer un débit qui n'existe plus.
- Simulateur : `army.mjs` chiffre le prix réel d'une troupe — mets son miroir à jour
  (`constants.mjs`), `verify.mjs` doit rester exit 0. Si le moteur modélisait les « munitions
  embarquées », aligne-le ou ajoute la ligne à l'encadré « retard connu » du README, selon la
  taille du geste (la refonte du simulateur est reportée, décision 3b — pas de chantier
  lourd ici).
- `WWS/docs/design/02-economie.md` et toute fiche qui décrit le double paiement : corrige la
  phrase, avec la date.

## Vérifications

Tests : recruter ne touche pas le stock de munitions ; combattre le débite ; le prix affiché
= le prix débité. `npm run verifier` complet, `verify.mjs` exit 0.
