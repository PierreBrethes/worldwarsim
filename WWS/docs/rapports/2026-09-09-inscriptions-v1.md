# Inscriptions V1 — 9 septembre 2026

## Résultat

Une place peut être créée avant le lancement, puis pendant les deux premières heures de
campagne. À `now >= launchedAt + 7_200_000`, `seasons.join` refuse la demande avec
`REGISTRATION_CLOSED`, avant toute création de joueur ou dotation. La durée est centralisée
dans `REGISTRATION_WINDOW_HOURS = 2`, provisoire et marquée `@a-mesurer`.

Une place déjà créée conserve son accès par jeton. Même après la clôture des inscriptions,
son joueur peut reprendre le salon, choisir sa nation et sa plage de repos, puis entrer en
guerre. La dotation reste unique. Une saison conclue continue de refuser toute nouvelle
inscription et toute entrée en guerre.

Le salon reçoit une date de clôture absolue calculée par le serveur. L'accueil explique la
fenêtre ; le salon affiche l'échéance et précise que les inscrits gardent leur place. Les
libellés et l'erreur passent par la table française. Aucune horloge du client ne décide du
droit à créer une place.

## Fichiers du lot

- `src/domain/off-season.ts` : durée, échéance et règle pure commune.
- `src/domain/off-season.test.ts` : contrat de durée et bornes.
- `convex/seasons.ts` : refus serveur dans `join`, échéance servie par `lobby`.
- `convex/errors.ts` : code `REGISTRATION_CLOSED`.
- `convex/off-season.test.ts` : vérification des accès, refus et dotations.
- `src/i18n/fr.ts`, `src/routes/accueil.tsx`, `src/routes/salon.tsx` : information du joueur.

Les modifications du pillage présentes dans les fichiers partagés ont été conservées.
Ce lot ne change ni le schéma, ni l'identité, ni la règle de dotation.

## Vérifications réellement exécutées

Le 9 septembre, après la fin de S6b-2 :

- `npm test -- src/domain/off-season.test.ts convex/off-season.test.ts` : **43 tests réussis**.
- `npm run build` : **réussi**, comprenant génération des routes et vérification TypeScript.
- ESLint sur les huit fichiers du lot : **réussi**.
- Prettier en lecture sur ces mêmes fichiers : **réussi**.
- `git diff --check` : **réussi**.

Les tests couvrent le salon ancien mais non lancé, les instants −1 ms, 0 et +1 ms autour de
l'échéance, une demande préparée avant mais reçue après, l'absence d'écriture lors du refus,
la reprise d'une place sans nation, la préparation et l'entrée tardives, l'absence de double
dotation, les participants historiques sans date d'entrée et les saisons conclues. Le test
pur attend explicitement 7 200 000 ms, indépendamment de la constante de production.

Le premier passage avait rencontré le fixture de purge qui ne peuplait pas `lootRecoveries`.
L'auteur de S6b-2 a raccordé ses nouvelles tables ; le dernier passage ci-dessus est vert.
Le build conserve un avertissement de taille de bundle supérieur à 500 kB.

## Limites et suite

Les contrôles sont locaux : aucun essai sur le VPS ni parcours manuel dans un navigateur.
Aucune simulation d'équilibrage et aucune mesure de coût des modèles n'ont été effectuées.
Aucun commit, push, déploiement ou effacement de données n'a été exécuté par cette tâche.

Le lot suivant autorisé est C1, limité aux règles d'identifiants et au hachage ; les comptes
utilisables, les sessions et leur interface restent des lots ultérieurs.
