# C2 — comptes et sessions serveur

**État : livré localement et revu le 09/09/2026 après S6c-1.**
Le [rapport C2](../../../rapports/2026-09-09-comptes-c2.md) porte les preuves finales.

**But :** inscription, connexion, déconnexion, lecture du compte courant et récupération
admin, sans rattacher les places ni activer une interface. Spécification : ADR 0022,
direction-v1-2026-09-09.md et frontière C1/C2/C3 de comptes-c1-identifiants.md.

**Architecture :** `convex/auth.ts` contient les actions Node d'inscription/connexion et
l'action interne de récupération. `convex/accounts.ts` contient les lectures et mutations
transactionnelles ; `convex/passwords.ts` et `src/domain/account.ts` restent les règles C1.
TypeScript strict, Convex, Vitest ; aucune dépendance supplémentaire.

## Contraintes

- Dossier sauvegardé, un seul auteur ; aucun worktree, commit, push, déploiement ou effacement.
- Préserver toutes les modifications existantes, notamment S6c-1.
- Seulement deux nouvelles tables : `accounts` et `sessions`. Aucun changement de `players`.
- Les comptes et sessions survivent à la suppression d'une saison et à la purge de jeu.
- Toute erreur applicative passe par `fail`, aucun secret dans les vues ni les traces.
- C3 reste fermé : pas de siège servi, pas de session branchée sur les mutations de jeu.

## Contrat

`auth.register({nickname,password})` et `auth.login({nickname,password})` sont des actions
publiques et rendent seulement `{token}`. Les règles C1 s'appliquent aux entrées. L'inscription
conserve le pseudo normalisé et contrôle la clé unique dans la transaction qui insère compte
et session. Un index n'est pas une contrainte d'unicité à lui seul.

La connexion rend `BAD_CREDENTIALS` pour pseudo inconnu, mot de passe erroné ou saisie invalide.
Pour une saisie valide mais un compte inconnu, effectuer un travail PBKDF2 équivalent avant
le refus, sans prétendre garantir un temps réseau constant.

`accounts.me({token})` est une query : `{nickname}` ou `null` pour session inconnue/orpheline.
`accounts.logout({token})` est une mutation idempotente, limitée à cette session.
Chaque jeton contient 32 octets aléatoires en base64url sans remplissage. Plusieurs sessions
coexistent sans expiration. `createdAt` et `lastSeenAt` sont initialisés à la création ;
`me` ne simule pas une présence. Le branchement de présence appartient à C3.

`auth.resetPassword({nickname,password})` est une action exclusivement interne. Elle applique
C1, puis une mutation interne remplace le digest et révoque toutes les sessions atomiquement.
Compte absent : `ACCOUNT_NOT_FOUND`. Elle ne crée ni compte ni nouvelle session.

Pour toute connexion, la mutation de création de session relit le compte et compare les trois
champs du digest au snapshot vérifié par l'action. Si un reset est intervenu, elle refuse
`BAD_CREDENTIALS`. Un reset postérieur supprime la session créée. Les transactions de création
contrôlent aussi l'absence de collision de jeton sans écraser une session existante.

## Exécution et preuves

- [x] Tests d'abord dans `convex/auth.test.ts` : normalisation/borne C1, unicité atomique et
      concurrente, retours sans secrets, connexion correcte et refus identiques, sessions
      indépendantes, déconnexion répétée, compte inconnu/orphelin.
- [x] Ajouter les tables/index dans `convex/schema.ts`, les codes dans `convex/errors.ts`,
      les actions et transactions. Références API mises à jour localement et types validés.
      La commande `npx convex codegen --typecheck disable` a échoué faute de backend local ;
      les deux références ont été ajoutées mécaniquement. Aucun codegen réussi ni déploiement.
- [x] Tests de récupération : invalidation de toutes les sessions, nouveau mot de passe
      accepté/ancien refusé, reset inconnu sans création ; forcer les deux ordres de course
      via les transactions internes avec snapshot antérieur au reset.
- [x] Adapter `convex/season-partition.test.ts` pour classer explicitement chaque table entre
      jeu et identité ; la fixture exhaustive de purge dans `convex/off-season.test.ts`
      peuple les tables de jeu. Un test C2 crée réellement compte/session et vérifie leur
      conservation et `me` après `seasons.destroy` puis `dev.reset` dans le banc local.
- [x] Tests ciblés C1/C2, partition et hors-saison ; types, lint et format des fichiers touchés.
- [x] Revue indépendante du contrat et des frontières d'authentification. Deux corrections
      infructueuses déclenchent diagnostic/redécoupage.
- [x] `npm run verifier` sur état stable ; rapport `WWS/docs/rapports/2026-09-09-comptes-c2.md`,
      guide de récupération dans `deploiement/README.md`, état de la file et frontière C3.

## Choix de runtime

Le hachage reste hors des mutations pour isoler son coût des transactions susceptibles d'être
rejouées. Les [runtimes Convex](https://docs.convex.dev/functions/runtimes) permettent aux
actions Node d'appeler des mutations internes. L'image officielle référencée par le compose
[embarque Node](https://github.com/get-convex/convex-backend/blob/main/self-hosted/docker-build/Dockerfile.backend#L108-L116).
Sources relues le 09/09/2026. Le module C1 a été exécuté directement sous Node v24.14.1 :
hachage puis deux vérifications en 174 ms, acceptation correcte et refus erroné confirmés.
Ce contrôle local ne valide ni l'image ni les performances du VPS. Aucun déploiement de sonde.

## C3, frontière préparée

Rattachement des places au compte, identité des mutations, liste des parties, parcours de
connexion et présence restent à livrer. Avant activation, décider explicitement du devenir
des anciennes places : ni attribution par simple pseudo ni suppression implicite. Préserver
la fenêtre d'inscription de deux heures et le brouillard propre au joueur. Pas de limitation
de débit dans C2 conformément au brief accepté ; ce risque reste à consigner avant exposition.
