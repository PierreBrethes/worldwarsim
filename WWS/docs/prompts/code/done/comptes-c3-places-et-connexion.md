# comptes-c3-places-et-connexion — le compte possède ses places, le jeu s'ouvre par une session

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md` (Compte, Session), **l'ADR 0022**, le brief
d'origine `done/comptes.md` (ses points 3, 5, 6 sont ce lot), `done/comptes-c1-identifiants.md`,
`done/comptes-c2-serveur.md` et le rapport `rapports/2026-09-09-comptes-c2.md`. Puis le code :
`convex/seasons.ts` (`playerByToken` — **l'unique résolveur**, importé par tous les modules de
jeu —, `create`, `join`, `previews`, `lobby`), `convex/accounts.ts` (`me`, `logout`),
`convex/auth.ts`, `convex/players.ts` (`touch`), `convex/dev.ts` (`snapshot`), `convex/schema.ts`
(`players.token`, `byToken`, `accounts`, `sessions`), `src/data/token.ts` (`readToken`,
`readTokens`, `keepToken`, `forgetToken`, `useToken`, `useTokens`), `src/routes/__root.tsx`,
`accueil.tsx`, `salon.tsx`, `-plateau/SettingsWindow.tsx`, `src/i18n/fr.ts` (`fr.home.*`,
`nicknameNote`). Lire `WWS/docs/design/11-brief-ui.md` avant la page de connexion. Ne commit pas,
ne push pas. Un chantier, un commit.

**⚠ Wipe requis, et décidé (85a, 10/09)** : `players.token` disparaît et `players.accountId`
devient obligatoire — aucune reprise des places existantes, aucune migration. Ce prompt se donne
**après la partie de contrôle à deux**, au moment du wipe ; jamais pendant une saison.

## La règle (ADR 0022, inchangée)

Un compte possède ses `players` ; le code de partie reste l'invitation ; le jeton de partie
devient un jeton de session. Un compte a **au plus une place par saison**.

## Ce qui change

1. **Schéma.** `players.accountId: v.id('accounts')` obligatoire, index `byAccountSeason`
   (`accountId`, `seasonId`) ; `players.token` et l'index `byToken` **disparaissent**.
   `players.nickname` reste : copie du pseudo du compte au `join` / `create`, figée pour la saison.
   `accounts` et `sessions` restent hors `GAME_TABLES` (test de partition intact).
2. **Un seul résolveur.** `playerByToken(ctx, token)` devient `playerOf(ctx, token, seasonId)` :
   session par `sessions.byToken` (`UNKNOWN_SESSION`) → compte → la place du compte dans cette
   saison (`NO_SEAT`) → la saison (`SEASON_GONE`, inchangé). Même fichier, même forme de retour
   `{ player, season }` — **tous les appelants** (mouvements, troupes, constructions, industrie,
   vue, contrôle, presse, télégraphe, pillage, rumeurs, `dev.snapshot`) passent de `{ token }` à
   `{ token, seasonId: v.id('seasons') }`. `UNKNOWN_TOKEN` meurt.
3. **Fonder et rejoindre.** `seasons.create({ durationHours, compensation })` et
   `seasons.join({ code })` prennent la session (`token`) et **plus de `nickname`** — il vient du
   compte. Réponses : `{ code, seasonId }` et `{ seasonId }`. Une seconde place du même compte
   dans la même saison → `SEAT_TAKEN`. La fenêtre d'inscription (`REGISTRATION_CLOSED`, +2 h) et
   les refus existants ne bougent pas ; `seasons.previews({ tokens })` meurt.
4. **La liste des parties vient du compte.** `accounts.me({ token })` rend
   `{ nickname, seats }` — `seats` = les aperçus existants (`previewOf`) de chaque place du
   compte, dans l'ordre d'entrée. Une saison détruite disparaît silencieusement, comme avant.
5. **Client.** `src/data/session.ts` remplace `token.ts` : un seul jeton `wws-session` en
   `localStorage`, plus la place active `wws-season` (`seasonId`). `useToken()` → `useSession()`,
   `useTokens()` meurt. Page **`/connexion`** : pseudo + mot de passe, bascule « créer un compte »,
   erreurs en clair sous le champ (`fr.errors.NICKNAME_*`, `PASSWORD_*`, `BAD_CREDENTIALS`),
   **rien de grisé**. `__root.tsx` renvoie à `/connexion` sans session valide (`accounts.me`
   nul) ; l'accueil garde ses deux gestes (fonder / rejoindre par code) et liste `seats` ;
   « se déconnecter » dans Réglages (`accounts.logout` puis oubli local, retour à `/connexion`).
   `nicknameNote` (« pas de compte — le pseudo suffit ») meurt. Clés nouvelles sous `fr.auth.*`.
6. **Présence.** `players.touch({ token, seasonId })` — `lastSeenAt` reste sur `players`
   (fondateur-absent : la présence *dans cette saison*). `sessions.lastSeenAt` n'est pas servi ;
   le mettre à jour au `touch` est permis, rien ne le lit.
7. **Déploiement — le wipe.** `deploiement/README.md` : la procédure exacte, dans cet ordre :
   `npx convex run dev:reset` **sur l'ancien déploiement** (les fonctions déployées le portent),
   puis `convex deploy` — la validation du schéma refuserait des `players` sans `accountId`.
   Les comptes créés avant le wipe survivent (hors `GAME_TABLES`). Retirer la phrase de C2 « ne
   demande aucun wipe » : C3 en demande un.

## Ce que ce prompt ne fait pas

Pas d'e-mail, pas de reset en libre-service, pas d'expiration de session, pas de limitation de
débit (assumé, `risques.md`). Pas de notifications. Pas de migration des anciennes places.
Aucun changement au hachage (C1) ni aux actions `auth.*` (C2) — si `'use node'` pose problème
sur le VPS au déploiement, c'est un chantier à part, à dire, pas à contourner ici.

## Cas d'acceptation (tests d'abord — 53a)

1. Un compte `join` deux fois la même saison → `SEAT_TAKEN` ; deux saisons → deux places, et
   `accounts.me` les liste avec leur aperçu.
2. Toute mutation de jeu avec un jeton de session inconnu → `UNKNOWN_SESSION` ; session valide
   sans place dans la saison → `NO_SEAT` ; place dans une autre saison → `NO_SEAT` aussi.
3. `playerView` ne sert jamais `passwordHash`, `salt`, `accountId` ni un jeton (test sur la forme).
4. `join` après `launchedAt + 2 h` → `REGISTRATION_CLOSED` inchangé ; une place obtenue avant
   reste jouable depuis **une seconde session du même compte** (login sur un autre appareil).
5. `seasons.destroy` puis `dev.reset` laissent `accounts` et `sessions` intacts (le test C2
   tient) ; le test de partition tient.
6. Les suites existantes (mouvements, presse, classement, fondateur-absent, capitulation,
   pillage, télégraphe, hors-saison) repassent avec `playerOf` — **un seul helper de fixture**
   (compte + session + place) réutilisé par toutes, pas un jeton bricolé par test.
7. Client : sans session, `/plateau` et `/accueil` renvoient à `/connexion` ; après `register`,
   l'accueil s'ouvre avec zéro place ; après « se déconnecter », `wws-session` n'existe plus et
   `/connexion` s'affiche ; l'observateur défait garde sa lecture.
8. `dev.snapshot({ token, seasonId })` exporte la même vue qu'avant ; le script
   `scripts/exporter-etat-reference.mjs` prend les deux arguments.

`npm run verifier` vert. `CLAUDE.md` (« les données viennent du backend par le jeton de partie »
→ par la session et la place), `WWS/CONTEXT.md` (Compte, Session — la règle, pas l'état des
lots), `deploiement/README.md` (le wipe, l'ordre), `RESTE-A-CODER.md`, `risques.md` (la ligne C2
reste). Passent dans `done/` : cette fiche, `ready/comptes-c1-identifiants.md` (livré le 09/09),
`ready/comptes-c3-frontiere.md` (le cadrage Codex, remplacé par ce brief) et `ready/comptes.md`
(le brief monolithique d'origine, réalisé en trois lots).
