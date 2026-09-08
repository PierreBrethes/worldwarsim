# Reste à coder — ce qui est acté ou évoqué, dans l'ordre où ça se donne

Tenu par Cowork, 06/09/2026 (mise à jour du 04/09). Un chantier code à la fois. « Acté » = décision numérotée ou ADR ;
« évoqué » = proposition ou Registre, pas encore tranché. La source reste les ADR et les
propositions ; ce fichier est la file.

Relecture code du 08/09 : [bilan daté, vérifications et recommandations](technique/point-projet-2026-09-08.md).
L'ordre de livraison ci-dessous reste inchangé ; le bilan relève notamment les cas à préciser
dans les briefs de victoire et d'objectifs neutres avant de les exécuter.

## Retour de partie du 08/09 — donner une raison de s'affronter

Pierre a déjà testé : combattre fonctionne, mais les occasions et les gains manquent.
**Principes approuvés** : pillage avec butin à ramener ; dépôts neutres gardés ; positions
stratégiques à tenir pour leurs ressources ; victoire territoriale au seuil tenu ; journal
qui rend les conséquences d'une expédition lisibles. Les contrats de guerre entre joueurs
restent une piste intéressante, sans règle arrêtée.

**Ajout demandé : des objectifs publics qui se déplacent sur terre ou en mer**, par exemple
un cargo chargé reliant le Cap-Vert à l'Australie, que chacun peut aller intercepter. Une
variante comporte une garnison PNJ à détruire pour récupérer la récompense. Le principe est
validé ; [la proposition détaillée](design/propositions/objectifs-mobiles.md) sépare le
périmètre proposé des arbitrages encore ouverts. Elle complète le lot 11 sans transformer
son brief actuel en promesse de mouvements PNJ déjà prêts à coder.

**Correctif local du 08/09** : destination terrestre/navale vérifiée sur la même grille au
front et au serveur, aperçu soumis aux refus d'ordre, regroupement des piles à leur adresse
exacte. Une troupe sélectionnée peut rejoindre un transport ami posé par clic droit →
« entrer en garnison », selon les places disponibles ; le transport doit attendre à cette
position. Test d'intégration sur Sakhaline : débarquer, séparer, regrouper, repartir vers le
Japon. `npm run verifier` réussi : 936 tests, types, lint, format, build et miroir sans dérive
sur les 119 valeurs comparées. Aucun déploiement ni réparation des positions déjà stockées ;
le geste complet au navigateur reste à contrôler.

## Bloquant pour la partie de contrôle à deux

1. **Test de restauration SQLite** — jamais fait, le plus vieux point ouvert.
2. Contrôle à l'œil : garnison / journal / port (04/09), presse et fondateur absent (06/09).
3. Le moment du **wipe** pour les comptes (ADR 0022) : après la partie à deux (reco), pas pendant.

Livrés et commités les 04-06/09 : entrer-en-garnison · journal-corps-de-texte ·
port-sur-la-cote · debarquement-sur-la-cote · avant-poste-tient-sa-region · fondateur-absent
(`aba2f89`) · classement-et-page-de-presse (`74cfa5a`). La victoire territoriale reste **mise de
côté** (1a du 06/09) ; le 🔴 « fondateur parti » de `QUESTIONS.md` est fermé.

## Prêts ou en attente d'une décision

- ~~etat-de-reference-depuis-une-saison~~ — **livré le 06/09** (`aa2ae63`) : `dev.snapshot`, script
  d'export, ancien simulateur dans `_to_delete/simulation-v1/`. **Reste à Pierre : l'export de la
  saison Japon** (`node scripts/exporter-etat-reference.mjs --token=…`, le jeton est le
  `wws-token` du navigateur) — sans lui, `WWS/simulation/` n'a plus d'état de référence du tout.
- **comptes** — ADR 0022 **acceptée** (06/09) ; prompt *prêt* (`ready/comptes.md`) ; **à donner
  au moment du wipe, après la partie à deux**, jamais pendant. Borne le pseudo (3-16).
- **Frappe de bâtiment** (78a) — proposition `frappe-de-batiment.md` ; **après le pillage** (8).
- **Test e2e de fumée** (Playwright, backend Convex en service CI) — prompt sur demande.
- Ménage : `_wws_snapshot.tgz` tracké à la racine, à sortir du dépôt lors d'une passe dédiée.
  `.claude/settings.local.json` n'est pas suivi selon `git ls-files` au contrôle du 08/09 ;
  vérifier son exclusion effective avant tout futur ajout.

## Acté, rédigé le 06/09 au soir — dans l'ordre où ça se donne (`ready/`)

6. ~~production-reliee~~ — **livré le 07/09** (ADR 0020 §6 **et §7**, `convex/holding.ts` pour la
   lecture unique de la couleur, `convex/production.ts` pour le règlement à l'événement). Emporte
   le titre « mon territoire » (13) et la **décoloration au raid**, jusqu'ici jamais codée : la
   couleur, le classement, le relevé et la production sortent désormais d'une seule fonction, et
   un avant-poste hors service ne tient plus rien. ⚠ Deux conséquences à regarder au premier
   skirmish : le classement d'un joueur raidé baisse pendant la fenêtre (c'est §7, mais c'est
   nouveau au front), et la fin d'une désactivation est le premier événement du jeu que
   **personne n'ordonne** — un travail planifié à `disabledUntil`, dont le règlement est daté à
   cette seconde-là même s'il se réveille en retard.
7. **portees-et-postures** (ADR 0021 §1-4, §6) — *prêt* — ⚠ retire l'interception par les
   garnisons posées (§3) ; le sélecteur de posture peut appeler un contrat de vue.
8. **salve-d-allonge** (ADR 0021 §5) — *prêt* — après 7.
9. **stockage-unique** (sortie b du 31/08) — *prêt* — petit, avant le pillage.
10. **pillage-et-butin** lot 1 — *prêt* — après 6, 7, 9. Lot 2 (capture, QG) plus tard.
11. **objectifs-neutres** lot 1 — *prêt* — après 10 (réutilise `loot` et le retour).
12. **fin-de-saison-au-seuil-tenu** — *prêt* — ⚠ 74a le mettait de côté ; à donner en dernier,
    après la partie de contrôle à deux (elle fixe `DOMINATION_SHARE` et `DOMINATION_HELD_HOURS`).
13. ~~Titre « mon territoire »~~ — livré dans 6.
14. ~~Fondateur parti~~ — livré (`surrender` + `fondateur-absent`).

## Acté sur le principe, ADR à écrire avant le code

15. **Recherche** (44a : débloque, ne bonifie jamais) — où vivra le MK2 ; contrainte : le contre
    précède toujours l'arme (invariant du lot 2 à étendre). Variantes : médecin, parachutiste,
    bombardier lourd, porte-avions japonais…
16. **Destruction du QG** (39) — recherche de palier 4+, révise « jamais éliminé ».
17. **Invariants CI restants** (51) — glisser dans chaque prompt qui touche `constants.ts`.

## Évoqué, au Registre — pas tranché

18. Bunker / DCA (63a — seulement si le premier test montre l'attaque trop payante).
19. Frappe terminale (hors périmètre avant la campagne ; nom 1940 à trouver).
20. Notifications push et alarmes (proposition).
21. Espionnage (proposition, formats).
22. Consommation continue — le motorisé qui boit (rend la réserve de pétrole datée).
23. Charbon de la première projection : 122 pour 20 de dotation + 10/h — mesuré par le lot 2,
    à lire dans son rapport avant de toucher quoi que ce soit.

## Questions ouvertes qui bloqueront un prompt

- ~~Barème chiffré de l'édition~~ — livré avec la presse : `src/domain/standings.ts`,
  `convex/press.ts`, proposition `classement-bareme.md`. Son calibrage en partie reste distinct
  de son implémentation.
- Nom 1940 de la frappe terminale (19).
- Valeurs `@a-mesurer` : portées par rôle, posture discrète, heures de butin, capacité de
  chargement, présence du pillage, entretien d'avant-poste, barème du classement — à regarder à
  la main au premier test, aucune ne se simule.
