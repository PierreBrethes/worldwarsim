# ADR 0044 — La faim ralentit les colonnes et suspend la capture

**Statut :** acceptée (23/11/2026). Recommandation de l'audit gameplay du 23/11 (point 4),
acceptée par Pierre. **Mondiale seule** (`modeOf`). **Révise** `consommation-continue.md` D3
(la famine n'arrête que le recrutement) et la ligne « Capture » de `WWS/CONTEXT.md`.
Réutilise ADR 0018 §3 (lu au départ) et ADR 0041 §4 (au pas).

## Contexte

La famine (`economyOf(...).starving` : vivres à zéro et débit négatif) n'arrêtait que les files de
recrutement. Une armée affamée marchait et capturait comme une armée nourrie : rien ne poussait à
nourrir ses troupes avant de les lancer.

## Décision

1. **Au pas.** Une marche, une attaque ou une capture ordonnée par un joueur affamé part au
   pas : ses minutes sont multipliées par `STARVING_PACE_FACTOR` (2, `@a-mesurer`). Lu au départ,
   jamais relu en route (ADR 0018 §3) ; les retours forcés par la résolution ne sont pas touchés.
   Le pas n'agit que sur la durée : il ne saute pas la facture de carburant (à la différence du pas
   d'une tournée à sec, qui reste à part).
2. **Pas de capture ordonnée.** `captureOrderRefusalOf` refuse `CAPTURE_STARVING`, avec la même
   fonction côté rose et côté serveur (ADR 0015). `Column.starving` porte la lecture.
3. **Arrivée affamée.** Une colonne de capture partie nourrie, arrivée chez un capteur affamé,
   combat puis rentre sans capturer : dépêche `captureCancelled`, motif `starving`.
4. **Capture suspendue.** À son échéance, une capture dont le capteur a faim n'aboutit pas : elle
   gèle à 100 % (`suspended`, champ optionnel de la ligne) sans reprogrammer ; le réveil de fin de
   famine (`resumeQueues`) conclut les captures suspendues. Le contrat de vue sert `suspended`.
5. **Hors périmètre.** Largage, butin, ravitaillement, Guerre éclair, poursuite, tournées et
   rondes : inchangés. Les tournées ont leur propre pas.

## Ce qu'on abandonne

- Une famine qui ne coûte rien à l'offensive : elle la ralentit désormais, sans rien détruire
  (règle 3 du projet : rien ne meurt de faim).
- Une relecture de la famine en route : une colonne partie nourrie arrive à l'heure.
