# stockage-unique — fusionner dépôt et entrepôt, conserver le stock national

**S2 implémenté et vérifié localement le 09/09/2026 ; S3 reste à faire.** Exécuter uniquement le petit lot demandé
dans la [file centrale](../../../RESTE-A-CODER.md#petits-lots-stockage-et-pillage--0909) :
serveur/compatibilité (S2), puis interface/simulateur (S3). Travailler dans le dépôt
sauvegardé, sans worktree, sans commit ni push. S'arrêter à la fin du lot.

## Sources et état vérifié

Lire `AGENTS.md`, `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, les
[ADR 0015](../../../adr/0015-economie-v2-ressources-localisees.md) et
[0017 §3](../../../adr/0017-format-de-saison-et-socle-place.md), ainsi que la
[sortie b retenue le 31/08](../../../design/propositions/pillage-et-butin.md).

Le stock national existe : table `resources`, `convex/resources.ts`, calcul pur dans
`src/domain/economy.ts`. **Ne créer ni stock par bâtiment, ni table de stockage, ni
capacité portée par le QG.** `storageCaps` répartit encore les huit ressources entre
`warehouse` et `depot` via `STORED_BY`. `clipToCapacity` et sa porte serveur
`clipToStorage` existent ; le pillage ajoutera leur appel à la perte effective de capacité.

## Règle retenue

Un seul bâtiment proposé : `warehouse` (« entrepôt »). Chaque niveau relève le plafond des
**huit ressources** de `STORAGE_CAP_PER_LEVEL`, en plus de `BASE_CAP`. Coût, durée,
placement et élévation de l'entrepôt existant sont conservés. Les stocks restent nationaux.

`depot` devient une clé de compatibilité, jamais un nouveau choix de construction. Les
documents existants restent lisibles et comptent comme des entrepôts de même niveau pour
les huit plafonds. Cette fusion ne baisse aucun plafond et ne déclenche aucun écrêtage.

## S2 — serveur et compatibilité

- Adapter `storageCaps`, la règle partagée de placement et les nouvelles commandes :
  `warehouse` seul est proposé et accepté. Un appel direct avec `depot` est refusé par
  un code d'erreur du projet ; retirer un bouton ne suffit pas.
- Garder le littéral historique dans les validateurs. Ne pas supprimer aveuglément
  `BUILDING_SPEC.depot`, les types ou les lecteurs : l'annulation et la fin de chantier
  recalculent les remboursements avec `buildCost(entry.building, level)` ; le classement
  relit aussi les coûts historiques. Préserver les montants déjà payés.
- Couvrir bâtiments **et chantiers en cours/en file**, leur fin, annulation et élévation.
  Les nouvelles écritures de bâtiment issues d'un ancien chantier utilisent `warehouse` ;
  les documents historiques peuvent conserver `depot` jusqu'au wipe. Conserver identité,
  niveau, emplacement et rattachement des bâtiments existants.
- Centraliser la compatibilité, sans réécriture massive ni wipe. Les lecteurs nécessaires
  au client restent valides entre S2 et S3 ; avancer dans S2 toute adaptation minimale de
  contrat nécessaire aux types. Retirer les derniers alias après leurs consommateurs.

Fichiers inspectés : `src/domain/{ids,economy,construction}.ts`,
`convex/{validators,constants,buildings,constructions,resources,view}.ts` ; contrôler les
lecteurs de prix `src/domain/standings.ts` et `convex/press.ts` sans refondre le classement.

Acceptation et tests ciblés : `src/domain/{economy,construction}.test.ts`,
`convex/economy.test.ts` ; fixtures de dépôt posé et de chantier legacy. Vérifier les huit
plafonds, leur addition par niveau, le refus d'une nouvelle pose `depot`, la fin et le
remboursement exact d'un ancien chantier, l'élévation et la vue d'un ancien bâtiment.
L'accumulation, le remboursement et `clipToCapacity` gardent la distinction de l'ADR 0017
entre plafond d'entrée et écrêtage ponctuel. Les tests ordinaires qui construisaient un
dépôt passent à l'entrepôt ; conserver les fixtures `depot` dédiées à la compatibilité.

### État après S2 — 09/09

`canonicalBuildingKey` centralise l'alias et `BUILDABLE_BUILDINGS` exclut le dépôt de
l'offre et de son catalogue de référence. `BUILDINGS`, les validateurs, les tarifs et
le catalogue servi conservent encore la clé pour leurs consommateurs historiques.
La vue des bâtiments et des chantiers sert `warehouse`. Une élévation ancienne continue
à son tarif de dépôt ; un appel `depot` ne peut qu'élever un stockage déjà posé.
Les fins d'anciens chantiers créent `warehouse` avec le champ optionnel
`buildings.costKey: 'depot'` ; `buildingCostKey` préserve ainsi remboursement, durée,
élévations et valeur d'industrie, sans modifier le barème pur de `standings.ts`.

S3 doit également reprendre `src/domain/resource-band.ts` et son test : `STORED_BY`
reste un regroupement d'affichage temporaire, sans rôle dans les plafonds serveur.
Aucune validation visuelle ni mise à jour du simulateur n'est annoncée par S2.

## S3 — interface et simulateur

Une seule entrée de stockage dans la rose, la construction et l'Économie ; description
des huit ressources dans `fr.ts`. Un dépôt ancien se lit « entrepôt », avec le sprite de l'entrepôt ;
aucune clé manquante dans une ancienne dépêche ou une file de construction. Retirer le
sprite et les libellés distincts du dépôt seulement après suppression de leurs usages.

Fichiers inspectés : `src/routes/plateau.tsx`,
`src/routes/-plateau/{ConstructionPanel,EconomyWindow}.tsx`,
`src/domain/{construction,compass-rose}.ts`, `src/emblems/buildings/manifest.ts`,
`src/i18n/fr.ts`, `WWS/simulation/opening/{constants,engine,verify}.mjs`.
Le simulateur calcule aussi les plafonds dans `engine.mjs` : modifier les constantes seules
ne suffit pas. `verify.mjs` déclare actuellement `STORED_BY` non vérifié ; son état vert ne
prouve donc pas à lui seul que les huit affectations de stockage sont correctes.

Acceptation : plus de dépôt proposé ; ancien dépôt visible et utilisable comme entrepôt ;
aucune section vide. Tests ciblés `src/domain/{construction,compass-rose}.test.ts`, tests
économie impactés, vérification des huit plafonds dans le miroir et
`node WWS/simulation/opening/verify.mjs`. Contrôle visuel avec une vraie partie si un jeton
est disponible ; sinon signaler la limite sans réintroduire de fixture démo.

## Documentation et arrêt

Dans le lot qui change la règle, ajouter la note datée à
`WWS/docs/design/02-economie.md` et aux ADR concernés, et actualiser les entrées concernées
de `AGENTS.md`, `CLAUDE.md`, `WWS/CONTEXT.md`. S2 note la compatibilité et la transition ;
S3 constate la fusion complète. Pas de réécriture historique sans rapport avec ce chantier.

Aucune constante d'équilibrage nouvelle : `a-mesurer.md` ne doit pas gagner de valeur.
Chaque lot consigne ses tests et son état dans la file ; la validation globale
`npm run verifier` appartient à S9. **Ne pas marquer le stockage livré après S2 seul
et ne pas lancer le pillage automatiquement après S3.**
