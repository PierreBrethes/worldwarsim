# Reste à coder — ce qui est acté ou évoqué, dans l'ordre où ça se donne

Tenu par Cowork ; clarification stockage/pillage du 09/09/2026. Un chantier code à la fois. « Acté » = décision numérotée ou ADR ;
« évoqué » = proposition ou Registre, pas encore tranché. La source reste les ADR et les
propositions ; ce fichier est la file.

Relecture code du 08/09 : [bilan daté, vérifications et recommandations](technique/point-projet-2026-09-08.md).
Le bilan relève notamment les cas à préciser dans les briefs de victoire et d'objectifs neutres
avant de les exécuter. La file historique ci-dessous est complétée par la direction V1 du 08/09.

## Direction V1 retenue le 08/09

Pierre accueille favorablement **les points 1 à 8** de la proposition de version plus complète :
[vision V1 — expéditions et positions à défendre](design/propositions/vision-v1-expeditions.md).
Cette validation porte sur la direction ; les règles détaillées et leur chiffrage restent à
formaliser dans les briefs concernés. Aucun de ces ajouts n'est marqué livré par cette note.

Elle ajoute notamment les intentions « intercepter » et « escorter », la préparation sur carte,
le compte rendu d'expédition avec rejeu, la **récupération passive dans un site adapté**, et la
révision de **« à faire maintenant »** pour ne plus traiter toute attente comme un problème.
La récupération révise le principe actuel « une troupe entamée reste entamée » ; elle demandera
sa règle économique. La victoire territoriale est confirmée comme cible V1.

Séquence proposée : portées passives et rencontres → stockage unique et pillage avec dépêches →
premiers objectifs neutres → objectifs mobiles et ordre d'interception. Les outils de préparation,
la lecture des positions et le rejeu accompagnent ces lots ; récupération et victoire complètent
la version. Le détail des dépendances et des points ouverts figure dans la proposition.

Le point 9 (mobile, notifications, diplomatie) n'est pas inclus dans cette nouvelle validation ;
les décisions antérieures sur ces sujets restent conservées dans leurs propres propositions.

## Petits lots stockage et pillage — 09/09

Cette séquence détaille les entrées historiques **9 et 10**, sans les renuméroter. Les
portées passives sont livrées ; viennent stockage, pillage complet avec dépêches, puis
objectifs neutres et victoire territoriale selon leurs propres prérequis. Les autres
points de la vision V1 restent dans la file ; la salve d'allonge reste hors de ce chantier.

**S1-S5c terminés localement le 09/09. S6a attend D4. Aucun pillage jouable livré.**
Exécuter une tâche à la fois dans le projet sauvegardé, sans worktree, commit ni push.
Pas d'enchaînement automatique. Chaque clôture donne fichiers modifiés, tests réellement
passés, limites et prochain lot dans un bref compte rendu réutilisable.

Contrats : [stockage](prompts/code/ready/stockage-unique.md) et
[pillage](prompts/code/ready/pillage-et-butin.md). Les décisions encore ouvertes sont listées
dans le brief pillage : **D4** changement de contrôle territorial/absence de route et
**D6** limites de la récupération après interception. Leurs recommandations restent
**non validées** et ne bloquent pas S3. Les identifiants D sont conservés pour les références.
**D5 est acceptée pour la V1** : seul le stock disponible est pillable ; les ressources
engagées dans les recrutements et leur remboursement sont protégés. La mise à l'abri dans
une file annulable est une limite assumée.
Le butin vient uniquement de ressources existantes : l'entrepôt prélève les surplus positifs
au-dessus de `BASE_CAP`, répartis automatiquement au prorata dans la capacité disponible.
Les mines et usines se sabotent sans créer de butin ; D1 est donc retirée. La livraison dès
le franchissement de la bordure d'une région tenue par le porteur est
également acquise, pour le pilleur comme pour le récupérateur, sans atteindre centre ou
capitale ; seuls le changement de contrôle et l'absence de route restent ouverts dans D4.
Pierre a validé le 09/09 le prélèvement de tout le surplus de l'entrepôt au-dessus de
`BASE_CAP`, borné par la capacité de transport ; la réserve de base est protégée du
prélèvement. Il a aussi validé la perte du butin excédant ce que les survivants peuvent
transporter après des pertes sans défaite. D2 fixe les capacités nominales par rôle à
40/0/120/0/0/80/0/240/0 dans l'ordre de `UnitRole`, et réduit chaque ressource au prorata
de la charge transportée, sans création par résidu flottant.
Il valide aussi le pillage dirigé uniquement vers sa cible, sans engagement spontané en
route, avec riposte ; et la récupération du butin d'une colonne détruite par l'intercepteur,
bornée par sa capacité, avec retour obligatoire avant crédit. Cette récupération fait
partie de S6b et n'attend pas la capture de bâtiments.
La capacité effective suit l'effectif de chaque troupe (`strength / nominalStrength`) puis
s'additionne sur le groupe sélectionné pour la mission. Cette capacité de ressources est
distincte de `LIFT_CAPACITY`, qui transporte des troupes.

| Lot et dépendances | Périmètre fermé ; fichiers repérés | Acceptation et vérification ciblée |
| --- | --- | --- |
| **S1 — clarification** ; terminé | Les deux briefs et cette file, rien de plus. | Contradictions résolues séparées des décisions manquantes ; liens et diff documentaires vérifiés. Aucun test de jeu annoncé. |
| **S2 — stockage serveur** ; terminé localement (09/09) | Après S1. `src/domain/{ids,economy,construction}.ts`, `convex/{validators,constants,buildings,constructions,resources,view}.ts` ; lecteurs de prix dans `standings.ts`/`press.ts`. Compatibilité des bâtiments et chantiers `depot`. | Huit plafonds relevés, nouvelle pose `depot` refusée, ancien dépôt/chantier lisible, fin/élévation et remboursement préservés. `src/domain/{economy,construction}.test.ts`, `convex/economy.test.ts`. |
| **S3 — stockage interface et simulateur** ; terminé localement (09/09) | Après S2. `src/routes/plateau.tsx`, `-plateau/{ConstructionPanel,EconomyWindow}.tsx`, `src/domain/{construction,compass-rose}.ts`, manifeste des bâtiments, `fr.ts`, `WWS/simulation/opening/{constants,engine,verify}.mjs`. | Une entrée entrepôt, ancien dépôt rendu correctement, huit plafonds identiques dans le simulateur. Tests construction/rose ; `node WWS/simulation/opening/verify.mjs` et vérification de l'affectation des huit ressources. Contrôle visuel si partie accessible. |
| **S4 — calcul pur du butin et capacité** ; terminé localement (09/09) | Après S3 et **D2**. Nouveau `src/domain/loot.ts` et son test ; `convex/constants.ts`, `scripts/generate-a-mesurer.mjs`. Aucun ordre ni mutation de stock. | Surplus réels bornés par la capacité, répartition automatique au prorata, contribution par troupe au ratio `strength / nominalStrength`, réserve de base protégée ; aucun rendement industriel créé ni effet sur `LIFT_CAPACITY`. Tests purs `loot.test.ts`, `scripts/a-mesurer.test.mjs`. |
| **S4b — abaque et capacité du groupe** ; terminé localement (09/09) | Après S4. `GunneryWindow.tsx`, `GarrisonStack.tsx`, domaine pur de capacité, règles de mouvement existantes, `fr.ts`. Affichage seulement. | Fiche troupe : portée existante, capacité nominale, vitesse/milieux issus du moteur ; sélection : somme effective du groupe choisi, pas de toute la garnison. Tests ciblés domaine/composants ; aucune duplication de portée ou vitesse. |
| **S5a — cibles autorisées et relevés** ; terminé localement (09/09) | Après S4b. `convex/{schema,validators,surveys,view}.ts`, `convex/movement/orders.ts`, `src/domain/{movement-orders,player-view}.ts`. Relevé minimal d'installations par observateur ; aucun pillage public. | Bâtiment inconnu, autre saison, ami ou non pillable refusé ; relevé ancien sans inventaire ne révèle rien. Tests `convex/{control,detection,view-budget}.test.ts`, `src/domain/movement-orders.test.ts`, nouveaux cas ciblés dans `convex/plunder.test.ts`. |
| **S5b — combat, présence et désactivation de l'entrepôt** ; terminé localement (09/09) | Après S5a et **D3**, désormais acquise ; D5 est acquise. `convex/movements.ts`, `convex/movement/{arrival,forces,detection}.ts`, `convex/{combat,resources,production,schema}.ts` ; module local de pillage. Cycle interne jusqu'à la prise ; faits durables pour S8. | Défense existante, présence indisponible, prise unique, stocks réglés avant coupure, prélèvement avant écrêtage, restauration datée, jobs périmés/clôture sans effet. `convex/plunder.test.ts`, `production.test.ts`, cas combat/mouvements concernés. |
| **S5c — sabotage de production** ; terminé localement (09/09) | Après S5b. Réutiliser défense, présence, désactivation et restauration pour mines et usines ; aucun butin, stock local ou rendement créé. | Site actif ou momentanément arrêté interrompu pour la durée retenue ; stocks inchangés hors règlement normal à la coupure, aucun retour chargé. Contrôles ciblés existants seulement ; les cas dédiés seront ajoutés après selon la consigne du lot. |
| **S6a — retour chargé** | Après S5c et **D4**. `convex/movement/arrival.ts`, `convex/{movements,resources,schema,holding,routes}.ts`, domaine `loot.ts`. Livraison, interception, perte et destination ; faits durables pour S8. | Crédit unique, pertes partielles, destination perdue/impossible, ancien mouvement sans charge, stock déjà excédentaire préservé. `convex/plunder.test.ts`, `movements.test.ts`, `detection.test.ts`, tests purs touchés. |
| **S6b — récupération après interception** | Après S6a et **D6**. `convex/movements.ts`, `convex/movement/arrival.ts`, `convex/combat.ts`, domaine `loot.ts`, schéma si nécessaire. Transfert de la charge après destruction, puis retour du nouveau porteur ; faits pour S8. | Charge précédente consommée une fois, transport borné en tenant compte de la charge existante, aucun crédit distant ; nouvelle interception et livraison unique. Déroute, plusieurs bénéficiaires et excédent selon D6. Tests `convex/plunder.test.ts`, `movements.test.ts` et `src/domain/loot.test.ts`. |
| **S7 — interface et aperçu** | Après S6b. Lire fiche 11. `src/routes/plateau.tsx`, `-plateau/{MovementPreview,TroopBadge,GarrisonStack}.tsx`, `src/domain/{movement-orders,compass-rose,player-view}.ts`, `convex/{movements,view}.ts`, adaptateur `src/data/loadGame.ts`, `fr.ts`. Raccordement sous fermeture serveur. | Rose conforme aux refus, durée/retour servis, estimation sans fuite ; force à soi chargée : quantités par ressource et total, sans valeur monétaire inventée. Tests domaine et cas aperçu/vue de `convex/plunder.test.ts` ; contrôle visuel avec vrai jeton ou limite explicitée. |
| **S8 — dépêches et ouverture** | Après S7. `convex/{journal,schema}.ts`, producteurs de faits S5b/S5c/S6, `src/domain/{journal,player-view}.ts`, `fr.ts`, `JournalWindow.tsx` si nécessaire ; retirer la fermeture coordonnée serveur/rose. | Pillage, sabotage, récupération, livraison, perte et désactivation/écrêtage visibles au bon joueur, sans doublon. `convex/notices.test.ts`, `src/domain/journal.test.ts` et scénario complet public dans `convex/plunder.test.ts`. |
| **S9 — validation et synthèse** | Après S8. Corriger seulement les régressions du chantier ; vérifier cohérence des ADR, fiches, glossaire, instructions, `a-mesurer.md` et file. | `npm run verifier` complet, contrôle de l'expédition à deux si partie accessible ; rapport des limites et mesures restant à faire. Marquer livré seulement après preuve, puis s'arrêter avant objectifs neutres. |

**Bilan S2 (09/09)** : huit plafonds communs, alias centralisé, nouvelle pose `depot`
refusée, vue `warehouse`, bâtiments et chantiers historiques préservés. Le champ optionnel
`buildings.costKey: 'depot'` conserve le tarif des anciens chantiers qui finissent sous
`warehouse`, y compris aux élévations suivantes et au classement. Pas de migration massive.
Les fixtures ordinaires utilisent l'entrepôt ; sept cas Convex dédiés couvrent le legacy.
Tests ciblés économie/construction/presse/classement/rose : **211 réussis** ; suite complète :
**949 tests réussis, 56 fichiers**. Types, lint et format vérifiés. Aucun commit, push,
déploiement ou contrôle visuel. Le miroir n'a pas été utilisé comme preuve du stockage.
**Bilan S3 (09/09)** : une seule entrée entrepôt dans la construction, la rose et Économie ;
les huit réserves forment un groupe de bandeau et nomment toutes l'entrepôt. Une clé `depot`
historique reprend le libellé et le sprite de l'entrepôt ; son asset distinct et `STORED_BY`
ont été retirés sans toucher aux données ni tarifs legacy. Le moteur du simulateur additionne
les niveaux `warehouse` et `depot` puis relève les huit plafonds ; `verify.mjs` exerce les
seize couples bâtiment-ressource au lieu de laisser l'affectation non vérifiée. Tests ciblés
construction/rose/bandeau/manifeste et contrôles du miroir passés ; types, lint et format
vérifiés. Aucun commit, push, déploiement ou contrôle visuel faute de partie authentifiée.
La validation globale `npm run verifier` reste au lot S9. Arrêt après S3.

**Bilan S4 (09/09)** : `loot.ts` calcule la capacité effective du seul groupe fourni,
prélève les surplus positifs au-dessus de `BASE_CAP` au prorata et réduit une charge devenue
trop lourde selon le même ordre déterministe, sans création par arrondi. La table exhaustive
des neuf rôles est distincte de `LIFT_CAPACITY` et inscrite au registre `@a-mesurer`.
Aucun ordre, stock, schéma ou écran n'est raccordé ; le pillage reste non jouable. Tests purs,
types, lint et format vérifiés dans le lot. Aucun commit, push ni déploiement. Arrêt après S4 ;
S4b (abaque et capacité du groupe) est terminé localement ; S5a est le prochain lot.

**Bilan S4b (09/09)** : la fiche dépliée de l'abaque conserve la portée issue de
`detectionRangeOf`, ajoute la capacité nominale de butin et lit milieu, allure et indices dans
`routeModeOf`, `motorized`, `landCostOf` et `COST_BY_MEDIUM`. La garnison réutilise
`carryCapacityOf` sur les seules troupes cochées, sans toucher aux places de `LIFT_CAPACITY`.
Tests ciblés domaine et rendus statiques des deux composants passés, ainsi que types, lint,
format et contrôle du diff. Aucun ordre, mutation, schéma, commit, push ou déploiement ; le
pillage reste non jouable. Arrêt après S4b ; S5a (cibles autorisées et relevés) est terminé.

**Bilan S5a (09/09)** : `regionSightings` garde un instantané optionnel et indexé des
installations adverses réellement observées. Les anciens relevés sans inventaire ne révèlent
rien ; `warehouse` et `depot` historique convergent vers la même cible. Une porte interne refuse
uniformément les identifiants inconnus, d'une autre saison, amis ou non pillables, et une seconde
porte revalide la vérité à l'arrivée sans la servir. `PlayerView` n'expose que l'identité, la clé
canonique et la région relevées — jamais stock, garnison ou vérité adverse recalculée. Le type
`plunder` reste absent des ordres publics et de la rose.

**Bilan S5b (09/09)** : D3 est acquise : l'expédition victorieuse tient 2 h, reste indisponible
à un second ordre et doit encore porter de l'infanterie à la prise ; sinon elle repart vide. Le
site, revalidé à l'arrivée puis à la prise, doit encore appartenir à l'adversaire et être actif.
Deux présences concurrentes ne cumulent rien : la première prise valide désactive l'entrepôt pour
12 h, la seconde repart vide. La transaction règle les stocks, prélève le seul surplus disponible
au-dessus de `BASE_CAP`, désactive, puis réduit les plafonds et écrête ; les recrutements déjà
payés et leurs remboursements restent hors du stock pillable. `warehouse` et `depot` historique
suivent la même règle. La charge et un rapport durable unique passent au retour interne ; la
livraison et D4 restent S6a. Les 2 h / 12 h sont des points de départ `@a-mesurer`, pas un
équilibrage. Le pillage reste fermé côté serveur et absent de l'interface.

**Bilan S5c (09/09)** : les sept extracteurs et chaînes déjà relevés passent par la même
validation opaque, la même défense et les mêmes 2 h de présence que l'entrepôt. À la prise, le
règlement normal s'arrête à l'instant de coupure, puis le site est désactivé 12 h et restauré à
l'échéance existante. Le rapport durable enregistre des quantités prises et perdues nulles ; le
retour ordinaire ne porte ni `loot` ni lien de livraison. Aucun débit, écrêtage, stock local,
rendement créé, vue ou ordre public n'est ajouté. Types et 99 tests existants ciblés passés ; pas
de nouveaux tests dans ce lot selon la consigne, pas de vérificateur global. S6a attend D4.

S5 est scindé car les relevés actuels ne donnent pas encore de cibles bâtiment adverses.
S5b s'arrête avec des fixtures internes ; **aucun ordre public de pillage n'est accepté
avant S8**, même par appel direct. S6a-S6b ferment le cycle de retour et de récupération avant S7 ; S8 branche les
dépêches avant d'ouvrir le geste. Pas de nouvelle infrastructure générique d'activation.

Les chemins abrégés de la table sont relatifs aux dossiers indiqués ; les nouveaux fichiers
sont explicitement signalés. Chaque lot de code ajoute les tests de son comportement,
vérifie les types si un contrat change et documente immédiatement sa règle dans les sources
concernées. Une adaptation minimale de contrat peut avancer d'un lot pour garder les
consommateurs valides ; aucune refonte annexe. S9 consolide, il ne reporte pas la documentation
des décisions. Depuis S3, le miroir vérifie le stockage sur les huit ressources, pour
`warehouse` comme pour `depot` historique. Les constantes restent provisoires jusqu'au test de partie.

## Retour de partie du 08/09 — donner une raison de s'affronter

**Correction de Pierre sur les postures (08/09, après `b35af57`)** : aucun choix de posture
à ajouter au joueur. Le comportement doit découler de l'action donnée et du déplacement.
Le sélecteur prévu dans l'ancien brief et l'ADR 0021 §4 a été retiré de leur révision.
La précision acceptée et transmise à la tâche dédiée conserve
la portée P en stationnement, retient la meilleure portée d'une pile sans addition et donne
sa propre portée à la station d'écoute. Aucun bonus générique de bâtiment ni coefficient de
discrétion à introduire. Marcher ou rentrer ne provoque pas de chasse automatique ; une force
attaquée riposte. Le nouvel ordre « intercepter » appartient au lot d'actions de carte suivant.

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
- **Frappe de bâtiment** (78a) — proposition `frappe-de-batiment.md` ; **après le pillage** (10).
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
7. ~~portees-et-postures~~ — **livré le 08/09 sous la forme révisée « portées passives »** :
   portée par rôle, maximum de pile, observation posée et mobile, contact mobile seulement pour
   `attack` / `raid`, réévaluation événementielle et annulation des prédictions périmées. Aucune
   posture ni salve d'allonge.
8. **salve-d-allonge** — **hors du lot portées passives**. La livraison l'a archivée comme
   abandonnée dans `done/` et dans l'ADR 0021, mais Pierre n'a pas décidé cet abandon dans cette
   conversation. Ce classement documentaire reste à corriger ou à arbitrer avant ce futur lot.
9. **stockage-unique** (sortie b du 31/08) — *S2-S3 terminés localement le 09/09* —
   fusion complète ; voir les bilans et les petits lots ci-dessus.
10. **pillage-et-butin**, premier périmètre — *S4-S9 définis, arbitrages requis* — après 6, 7, 9.
    Capture de bâtiments et QG restent des chantiers ultérieurs ; récupération du butin
    par l’intercepteur incluse dans S6b.
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
- Valeurs `@a-mesurer` : portées par rôle, heures de butin, capacité de
  chargement, présence du pillage, entretien d'avant-poste, barème du classement — à regarder à
  la main au premier test, aucune ne se simule.
