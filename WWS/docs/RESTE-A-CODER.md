# Reste à coder — ce qui est acté ou évoqué, dans l'ordre où ça se donne

Tenu par Cowork ; clarification stockage/pillage du 09/09/2026. Un chantier code à la fois. « Acté » = décision numérotée ou ADR ;
« évoqué » = proposition ou Registre, pas encore tranché. La source reste les ADR et les
propositions ; ce fichier est la file.

Relecture code du 08/09 : [bilan daté, vérifications et recommandations](technique/point-projet-2026-09-08.md).
Le bilan relève notamment les cas à préciser dans les briefs de victoire et d'objectifs neutres
avant de les exécuter. La file historique ci-dessous est complétée par la direction V1 du 08/09.

## La file au 17/10 — vers la saison test Mondiale v2

Le cap est l'[ADR 0027](adr/0027-la-mondiale-au-centre.md). Tout ce qui suit cette section date
d'avant le 14/10 : à relire contre le code avant d'en reprendre un item.

1. ~~**Proposition « Mondiale : économie, logistique, escouades »**~~ : faite et grillée le 18/10
   ([proposition](design/propositions/mondiale-economie-logistique-escouades.md),
   [ADR 0028](adr/0028-l-economie-de-la-mondiale.md)). Ses lots forment le point 4.
2. ~~**Retirer les plafonds**~~ : faite le 18/10. Plafond de troupes et casernements remplacés par
   la borne invisible `MONDIALE_TROOP_BOUND` (150, `@a-mesurer`) ; emplacements par site retirés.
3. ~~**Le socle Mondiale du 14/10**~~ : fait le 18/10. Vitesses ×12 (`MONDIALE_PACE`), durée
   réglée au salon (3 à 14 jours), plus d'entrée après le départ, QG capturé en 12 ou 24 h =
   éliminé (le reste au siège irrégulier), les Sept posés à chaque saison et leurs règles —
   Halifax, Narvik, Lisbonne, Istanbul, Tanger ; Rangoun et Hong Kong comptent, « règle à
   venir » —, victoire 4 sur 7 tenus 24 h, écrasement, horloge en filet. La domination de test
   par réduction est retirée.
4. **L'économie de la Mondiale** ([ADR 0028](adr/0028-l-economie-de-la-mondiale.md),
   [ADR 0029](adr/0029-placement-libre-et-gisements-ponctuels.md)), en dix features vues du joueur.
   Chacune se livre de bout en bout, back et front, avec ses visuels, son scénario de démo, et le
   code qu'elle rend mort ; « se voit » liste ce qu'il faut dessiner ou animer.
   1. ~~**Cinq ressources**~~ : faite le 18/10. Vivres, acier, charbon, pétrole, munitions ; la mine
      sur du fer rend l'acier (8 par heure, le débit de l'ancienne fonderie), l'arsenal fait une
      munition d'un charbon et d'un acier ; filature, fonderie et intendance retirées. Gisements
      régénérés sur quatre types, trois sur quatre chez soi : Norilsk et Vorkouta sortent, Nagasaki
      entre au Japon, pour tenir la bande. « Sur 12 » retiré de la fiche de caserne. Le schéma
      change : `npx convex run dev:reset` avant de pousser.
   2. **Ce que ça coûte** : barèmes mêlés par famille, entretien par paliers, entretien
      d'avant-poste, écoute au charbon. *Se voit* : prix à deux ressources, palier d'entretien lisible.
   3. **Coups et plein** : en crans portés par la troupe, repris à l'ancre (10 par cran), départ
      refusé sans plein, à sec ni attaque ni riposte. *Se voit* : cartouche et jerrican sous la
      figurine, dans la fiche au survol, l'abaque et la formation ; refus dits.
   4. **Prototype du plateau personnel** (`WWS/prototypes/plateau-personnel/`) : fait le 18/10,
      trois versions ; il sert de référence aux features 5 à 8.
   5. **Placement libre et gisements ponctuels** (ADR 0029) : un point par bâtiment, espacement,
      gisements cuits en points, `placementRefusal` refaite. *Se voit* : tuile fantôme à l'endroit
      visé, gisements sur la carte, refus d'espacement.
   6. **Le plateau personnel** : nombres et barres par ressource, récolte animée, tuiles, réserve
      de pièces ; remplace la fenêtre Économie. *Se voit* : barres, pastilles qui volent, tuile qui
      se pose.
   7. **Livrer et tournées** : dépôt d'avant-poste, charge unique, charger au QG, à l'entrepôt, au
      port ou à l'aérodrome, aller-retour, tournée en boucle depuis le point de chargement qui saute
      un dépôt plein et garde son slot, interception, caisse ; ce que le niveau d'un point rend.
      *Se voit* : barre de charge par couleur, boucle tracée à l'encre, transport qui attend,
      navire qui accoste le long du quai.
   8. **Larguer** : sur un point ou une escouade isolée. *Se voit* : avion qui décolle de la piste
      et y atterrit, paquet sous parachute.
   9. **La recherche** : l'arbre de l'[artefact](https://claude.ai/artifact/MUm2rQF8mY82rLtdz3VTpx),
      verrous de niveau et `chainSpeed` retirés, invariant du contre. *Se voit* : cartes de
      recherche, pose sur le QG, carte qui avance.
   10. **Artillerie et grosses escouades** : salve bornée, dessin regroupé au-delà de douze, borne
       serveur. *Se voit* : salve sur plusieurs troupes, fanion qui porte le compte.

   Bakou, Dakar et Singapour (point 3) attendent les features 3 et 7 ; Rangoun (« aucun envoi
   vers lui ») attend la feature 7, Hong Kong (« l'événement de la une ») les événements de la
   une, et le vivier s'élargit avec eux pour que le tirage du 14/10 tienne ses contraintes.
5. **Le tutoriel de manipulation** (ADR 0027 §2).
6. ~~**Le script de rapport de saison** sur le journal d'événements (ADR 0027 §7)~~ : fait le 18/10,
   `npm run rapport [-- --saison=CODE]` (`scripts/rapport-de-saison.mjs`, calcul dans
   `src/domain/season-report.ts`). Séries dans le temps : boule de neige (éditions) et avant-postes
   (journal) ; tortue, escouade et charge n'existent qu'à l'instant de la lecture : relancer chaque jour.
7. **La saison test entre amis** — aucune migration qui force un wipe pendant qu'elle tourne.

Plus tard : petites annonces et départ adaptatif (étape publique), bot Blitz, anglais.

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

**S1-S9 terminés localement le 10/09. Le pillage se joue** — ordre public, aperçu, rose, mât
relevé, ramassage et dépêches. Le prochain lot est hors de cette séquence : objectifs neutres.
Exécuter une tâche à la fois dans le projet sauvegardé, sans worktree, commit ni push.
Pas d'enchaînement automatique. Chaque clôture donne fichiers modifiés, tests réellement
passés, limites et prochain lot dans un bref compte rendu réutilisable.

Contrats : [stockage](prompts/code/ready/stockage-unique.md) et
[pillage](prompts/code/ready/pillage-et-butin.md). Les décisions encore ouvertes sont listées
dans le brief pillage. **D4 et D6 sont acquises le 09/09** : elles sont détaillées dans le
découpage ci-dessous. Les identifiants D sont conservés pour les références.
**D5 est acceptée pour la V1** : seul le stock disponible est pillable ; les ressources
engagées dans les recrutements et leur remboursement sont protégés. La mise à l'abri dans
une file annulable est une limite assumée.
Le butin vient uniquement de ressources existantes : l'entrepôt prélève les surplus positifs
au-dessus de `BASE_CAP`, répartis automatiquement au prorata dans la capacité disponible.
Les mines et usines se sabotent sans créer de butin ; D1 est donc retirée. La livraison dès
le franchissement de la bordure d'une région tenue par le porteur est
également acquise, pour le pilleur comme pour le récupérateur, sans atteindre centre ou
capitale ; le changement de contrôle et l'absence de route suivent désormais D4 ci-dessous.
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
| **S6a — retour chargé** ; terminé localement (09/09) | Après S5c et **D4 acquise**. Découpé en S6a-1 à S6a-3 ci-dessous. | Charge durable, crédit unique à la première entrée tenue, cas sans route et destination perdue. |
| **S6b — récupération après interception** ; terminé localement (09/09) | Après S6a et **D6 acquise**. Découpé en S6b-1 à S6b-3 ci-dessous. | Charge consommée une fois, capacité libre, priorité stable, caisse du reliquat. |
| **S7 — interface et aperçu** ; terminé localement (09/09) | Après S6b. Lire fiche 11. `src/routes/plateau.tsx`, `-plateau/{MovementPreview,TroopBadge,GarrisonStack}.tsx`, `src/domain/{movement-orders,compass-rose,player-view}.ts`, `convex/{movements,view}.ts`, adaptateur `src/data/loadGame.ts`, `fr.ts`. Raccordement sous fermeture serveur. | Rose conforme aux refus, durée/retour servis, estimation sans fuite ; force à soi chargée : quantités par ressource et total, sans valeur monétaire inventée. Tests domaine et cas aperçu/vue de `convex/plunder.test.ts` ; contrôle visuel avec vrai jeton ou limite explicitée. |
| **S8 — dépêches et ouverture** ; terminé localement (10/09) | Après S7. `convex/{journal,schema}.ts`, producteurs de faits S5b/S5c/S6, `src/domain/{journal,player-view}.ts`, `fr.ts`, `JournalWindow.tsx` si nécessaire ; retirer la fermeture coordonnée serveur/rose. | Pillage, sabotage, récupération, livraison, perte et désactivation/écrêtage visibles au bon joueur, sans doublon. `convex/notices.test.ts`, `src/domain/journal.test.ts` et scénario complet public dans `convex/plunder.test.ts`. |
| **S9 — validation et synthèse** ; terminé localement (10/09) | Après S8. Corriger seulement les régressions du chantier ; vérifier cohérence des ADR, fiches, glossaire, instructions, `a-mesurer.md` et file. | `npm run verifier` complet, contrôle de l'expédition à deux si partie accessible ; rapport des limites et mesures restant à faire. Marquer livré seulement après preuve, puis s'arrêter avant objectifs neutres. |

Le détail de ce que chaque lot a livré — les bilans S2 à S9, rédigés à leur clôture — est sorti
de cette file : [`rapports/2026-09-09-pillage-s2-s8.md`](rapports/2026-09-09-pillage-s2-s8.md).
La table ci-dessus garde une ligne par lot, son état et sa preuve.

**Limite S9 assumée** : le contrôle de l'expédition à deux joueurs sur une partie réelle n'a pas
été fait — la preuve tient au scénario public complet de `convex/plunder.test.ts` et au miroir
local. `PLUNDER_HOURS_PRESENT` et `PLUNDER_DISABLED_HOURS` restent `@a-mesurer`.

La séquence a été tenue dans cet ordre et pour cette raison : S5 scindé parce que les relevés ne
donnaient pas encore de cibles bâtiment adverses ; S5b arrêté sur des fixtures internes, sans
qu'aucun ordre public soit accepté même par appel direct ; S6a-S6b fermant le cycle de retour et
de récupération avant S7 ; S8 branchant les dépêches avant d'ouvrir le geste. Aucune
infrastructure générique d'activation n'a été ajoutée.

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
3. ~~La bascule **C3 des comptes**~~ — **codée le 11/09**, et elle **demande un wipe** : à
   passer au déploiement, dans l'ordre de `deploiement/README.md` (`dev:reset` sur l'ancien
   déploiement, puis `convex deploy`). Tant qu'elle n'est pas déployée, la saison prod du 04/09
   tient ; une fois déployée, elle est perdue. Décider **avant** si la partie de contrôle se
   joue sur l'ancienne ou sur une saison neuve.

Livrés et commités les 04-06/09 : entrer-en-garnison · journal-corps-de-texte ·
port-sur-la-cote · debarquement-sur-la-cote · avant-poste-tient-sa-region · fondateur-absent
(`aba2f89`) · classement-et-page-de-presse (`74cfa5a`). La victoire territoriale reste **mise de
côté** (1a du 06/09) ; le 🔴 « fondateur parti » de `QUESTIONS.md` est fermé.

## Prêts ou en attente d'une décision

- ~~etat-de-reference-depuis-une-saison~~ — **livré le 06/09** (`aa2ae63`) : `dev.snapshot`, script
  d'export, ancien simulateur dans `_to_delete/simulation-v1/`. **Reste à Pierre : l'export de la
  saison Japon** (`node scripts/exporter-etat-reference.mjs --token=… --saison=…`, les deux se
  prennent dans le `localStorage` du navigateur : `wws-session` et `wws-season`) — sans lui, `WWS/simulation/` n'a plus d'état de référence du tout.
- **comptes** — C1 et **C2 serveur livrés localement le 09/09** : inscription, connexion,
  sessions indépendantes, lecture du compte, déconnexion et récupération admin interne.
  Comptes et sessions survivent aux purges de jeu. Voir le
  [rapport C2](rapports/2026-09-09-comptes-c2.md). **C3 est codé le 11/09** : `players.accountId`
  obligatoire, `playerOf(token, seasonId)` en porte unique, `accounts.me` (le pseudo seul depuis
  la révision du 12/09 ; les places sont dans `accounts.seats`),
  page `/connexion`, déconnexion aux Réglages et à l'accueil. Il attend le wipe pour être
  déployé — les quatre fiches de comptes sont passées dans `done/`.
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
11. ~~objectifs-neutres~~ **lot 1 — livré le 17/09** : palette d'archétypes
    (`OBJECTIVE_ARCHETYPES`), répartition par joueur (deux prises proches, un dur par paire de
    voisins), siège **irrégulier** qui tient les garnisons locales, table `objectives`, prise au
    combat et retour chargé par la mécanique du pillage, marqueur public et cartouche, rose
    « attaquer » sans relevé (exception nommée en tête de l'ADR 0024 §4). ⚠ Trois points à
    regarder au premier skirmish : **`OBJECTIVE_NEAR_KM` est passé de 1 000 à 1 500** — mesuré le
    17/09 sur les huit capitales, à mille kilomètres de route Washington n'atteint aucun sol sans
    siège et Tokyo n'en atteint qu'un ; **le dépôt ne part qu'en dégageant le terrain** (ADR 0014,
    `winnerOf` : une passe, et rien debout en face), donc trois compagnies contre deux ne
    suffisent pas, il faut une supériorité ; et la **munition de la garnison**
    (`OBJECTIVE_AMMUNITION_PER_TROOP`) est une réserve de saison posée au doigt. Lot 2 — la
    capture au seuil tenu — non fait, comme prévu.
11bis. **objectifs-neutres lot 2** (capture au seuil tenu) — *à rédiger* — après 11 et la
    décision sur le seuil tenu (12).
12. **fin-de-saison-au-seuil-tenu** — *prêt, **remis à plus tard** (Pierre, 16/09 : « quand on
    aura mieux établi le gameplay »)*. ⚠ Avant de le donner : trancher le **sol national dans
    la part du théâtre** (`QUESTIONS.md` 🟠) — Royaume-Uni 232 régions contre Allemagne 16, le
    Britannique tient 93 % à deux dès la première minute. Bannière du 16/09 en tête du prompt.
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
24. **Bots qui jouent** (Discord, Taco, 15/09) — même chantier que la refonte du simulateur
    (un client qui pose des mutations), pas un ajout. Seul usage vital : remplir un siège vide
    quand un joueur lâche en cours de saison.
25. **Observateur omniscient** pour Pierre (Discord, 15/09) — outil de mesure et de débogage
    en prod ; ne vaut que si 24 existe.
26. **Niveaux d'IA** (Discord, 15/09) — prématuré tant qu'aucun bot ne tient sept jours.
27. **Rose des vents sur les avant-postes** (demande de Pierre, 16/09). Constat : le clic droit
    sur un avant-poste sans pile armée est **inerte** — `compass-rose.ts`, `build()`,
    `case 'outpost'` rend `actions: []`, donc `compassOf` répond `null`. Seul le mât d'un
    bâtiment a sa plate (54a, 56a, raser). Sur un point à soi, les branches candidates :
    « élever » (aujourd'hui seulement par le panneau de garnison, `constructions.raiseOutpost`),
    « spécialiser » (relais, `movements.ts:226`), « entrer en garnison » (64b, même règle que le
    mât), et **« abandonner » — non tranché** : la démolition (5a, 6a) ne couvre que les
    bâtiments, et un point qui tombe emporte sa couleur (ADR 0020 §7). Sur un point adverse : la
    plate reste celle de la visée (`aim`). **Tranché le 16/09** : élever + relais + écoute +
    détruire sans pile ; « entrer en garnison » seul avec une pile. Prompt
    `prompts/code/ready/rose-sur-les-avant-postes.md`, **prêt** (1a du 16/09 : les bâtiments
    ancrés au point tombent avec lui).

## Acté le 16/09 — le combat (proposition `combat-simultane-terrain-retranchement.md`)

- **Résolution simultanée** (décision 1b, révise l'ADR 0014 ; **révisée le 14/10 : l'initiative revient, la simultanée ne survit que comme choc**) : **livrée le 16/09** — une salve par
  camp sur l'état d'avant la passe, `riposteTarget` supprimé, `Strike.phase` toujours `'strike'`
  (le littéral `'riposte'` reste au validateur, legacy). Cas de référence : 22 / 29 en plaine.
  Prompt `prompts/code/ready/resolution-simultanee.md`.
- **Deux cercles autour de la pile** (4a, 3a : contact plein, détection tiretée, ambre) : prompt
  `prompts/code/ready/deux-cercles-autour-de-la-pile.md`, prêt, rendu seul.
- **Rose des vents sur les avant-postes** (27, 1a) : livré (`2e2da13`), poignée corrigée le 16/09.
- **Tenir ce que le cercle touche** (17/09, révision ADR 0020 §1) : prompt
  `prompts/code/ready/tenir-ce-que-le-cercle-touche.md`, prêt. Mesure : régions tenues par joueur et
  par continent avant/après.

28. **Artillerie** (16/09, « plus tard ») — dixième rôle : tir sur un relevé dans une portée
    **minimale et maximale**, sans riposte de la cible, aveugle seule (un observateur la sert),
    ne riposte jamais au contact, sa salve la relève chez la cible. Pas la salve d'allonge.
29. **Terrain** (16/09, 1a) — d'abord **cuire un terrain réel** (le type au survol est un hash
    du nom, `world.ts:130`) : script depuis relief ou couvert végétal → type par cellule ou par
    région ; puis l'ADR qui autorise une règle à le lire ; puis le modificateur du chiffrage §4
    (sol seulement). Après le gameplay.
31. **Découper les régions géantes à la cuisson** (17/09, 2a) — Ontario, Québec, les oblasts
    sibériens, les États américains, Amazonas : espacement de pôles cible ~80 km, pièces en
    « secteurs » droits sur la carte, id d'origine gardé par la pièce qui porte le gisement.
    Chaîne complète à recuire (`generate-regions` → `region-index` → `world` → `region-grid` →
    `deposits`). **Au prochain wipe** : des ids stockés changent.
30. **Retranchement** (16/09, 2a) — bonus de position du défenseur, plafonné à **5-10 % au
    plus**, affiché sur la fiche de la troupe sélectionnée avec le temps posé ; à chiffrer avec
    le terrain (plafond cumulé à fixer).

## Acté le 03/10 — le mobile entier, et la une à l'entrée

- **Refonte mobile complète** (mobile-1c-2026-10-03) : révise la décision du 15/09 ci-dessous
  (« la carte reste telle qu'elle est ; ce qui demande un clic droit ne marche pas ») et lève
  l'exclusion du point 9 de la vision V1. Raison : avec les notifications, une dépêche
  « attaque » ouvre le plateau sur le téléphone, et on doit pouvoir y répondre. Constat :
  [relevé mobile](rapports/2026-10-03-releve-mobile.md).
- **Grammaire du doigt** (mobile-geste-2026-10-03, proposée par Cowork, à confirmer par Pierre) :
  toucher net = agir (rose + fiche), un doigt = déplacer, deux doigts = zoomer et orienter ;
  décidée par `pointerType`, indépendante du réglage de la souris.
- Séquence : M1 [socle tactile](prompts/code/done/mobile-1-socle-tactile.md) (code) et
  [maquettes du plateau sur téléphone](prompts/design/plateau-sur-telephone.md) (Claude design)
  en parallèle ; puis les lots d'intégration d'après la piste retenue ; le relevé relancé sert de
  contrôle à chaque lot.
- **Piste A « le pied de page »** retenue (mobile-piste-a-2026-10-03), maquettes dans
  `Claude outputs/marque/plateau-mobile/`, avec : cinq entrées au pied (à faire, journal,
  télégraphe, presse, plus) ; **« plus » ajoute un étage à la barre** (nation, économie, abaque,
  réglages, calques) au lieu d'une feuille ; **bandeau des ressources repliable** (cible 44 px).
- **Fidélité aux règles** (mobile-regles-2026-10-03) : une maquette n'invente aucune règle. L'écran
  « vous êtes attaqué » ne propose pas de renfort calculé ; il ne nomme l'assaillant que s'il est
  relevé ; « préparer un mouvement » ouvre la visée ordinaire.
- **La carte lisible** (carte-lisible-2026-10-03), sur ordinateur **et** téléphone : la troupe
  touchée ou cochée grossit, un drapeau planté à l'arrivée de chaque mouvement à soi, un seul
  cartouche par pile. Lot à part, après le cadre mobile.
- **`hud-fit` faux sur les navigateurs actuels** (hud-fit-2026-10-04) : `zoom` ne multiplie plus les
  pourcentages ; corrigé sous 768 px par `mobile-2-cadre`, sur ordinateur par
  [echelle-d-interface](prompts/code/done/echelle-d-interface.md), captures avant/après.
- **La une à l'entrée** (accueil-2a-2026-10-03) : maquette 2a « la une sur le bureau », sans
  inscription publique (marque-1c tient) ; avance la page d'accueil que plan-5c reportait.
  [Prompt](prompts/code/done/page-d-accueil-la-une.md).

## Acté le 15/09 — retours Discord

- **Fenêtres exploitables sur mobile, carte inchangée** (*révisée le 03/10 par mobile-1c, ci-dessus*) (décision du 15/09, qui révise la 2a
  du même jour) : sous 768 px, les huit fenêtres en feuilles plein écran une à la fois, les
  panneaux en feuille basse, cibles tactiles, clavier virtuel ; la carte et les ordres ne
  bougent pas. Le point 9 de la vision V1 reste exclu. Prompt
  `prompts/code/ready/fenetres-sur-mobile.md`, après `correctifs-ui-discord`.
- ~~Élévation d'un avant-poste~~ — **livré le 15/09** : l'ADR 0020 §10 porte sa « Précision du
  15/09 ». `constructions.raiseOutpost` met l'élévation dans la file prépayée (clé de coût
  `outpost`, `constructions.outpostId`), la règle est pure et lue par les deux bouts
  (`outpostRaiseHold`), la fin est le **quatrième événement de couleur** (régler, patcher,
  rapporter) et relève le sol neuf du cercle. Porte : le panneau de garnison du point, où les
  trois refus « avant-poste plein » mènent maintenant. Non commité.
- **Fondation en chantier, plus d'entretien** (révision ADR 0020 §10, décision 7a du 15/09) : fonder coûte alliage + durée, un point debout ne consomme rien ; prompt
  `fondation-en-chantier.md`, après l'élévation.
- **Zone hors service hachurée** (UX) : rendu seul, §7 intact ; prompt
  `zone-hors-service-hachuree.md`.
- **Démolition volontaire** (demande du soir) : rose « raser » + confirmation, QG exclu ;
  prompt `demolir-un-batiment.md` (5a, 6a : ni remboursement ni retour de dette).
- **Un relais de niveau 1 = un emplacement** (décision 1a) : la règle de l'ADR 0020 §10 tient,
  la plainte « Allemagne injouable » attend une mesure. Rapport
  `rapports/2026-09-15-retours-discord.md`.

## Questions ouvertes qui bloqueront un prompt

- ~~Barème chiffré de l'édition~~ — livré avec la presse : `src/domain/standings.ts`,
  `convex/press.ts`, proposition `classement-bareme.md`. Son calibrage en partie reste distinct
  de son implémentation.
- Nom 1940 de la frappe terminale (19).
- Valeurs `@a-mesurer` : portées par rôle, heures de butin, capacité de
  chargement, présence du pillage, **prix et durée d'un avant-poste** (`OUTPOST_RAISE_SPEC`, à
  la fondation comme à l'élévation — l'entretien d'avant-poste est retiré depuis le 15/09),
  barème du classement — à regarder à la main au premier test, aucune ne se simule. Celle de
  l'avant-poste a sa mesure nommée : avant-postes debout par joueur au jour 7 (décision 7a).
