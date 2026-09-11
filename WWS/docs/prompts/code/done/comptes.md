# comptes — un pseudo, un mot de passe, rien d'autre (ADR 0022)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, **l'ADR 0022** (acceptée le 06/09 — elle
révise l'ADR 0009), `convex/seasons.ts` (`playerByToken`, `create`, `join`, `previews`),
`convex/players.ts`, `convex/schema.ts` (`players.token`, `byToken`), `src/data/token.ts`
(`readToken`, `readTokens`, `keepToken` — 11 appelants), `src/routes/accueil.tsx`,
`src/routes/salon.tsx`, `src/routes/__root.tsx`, `src/i18n/fr.ts` (`fr.home.*`,
`nicknameNote` : « pas de compte — le pseudo suffit, il meurt avec la saison » — cette phrase
meurt). Ne commit pas, ne push pas. Un chantier, un commit. **⚠ Wipe requis** : ce prompt
change l'identité des `players` ; il se donne **au moment du wipe**, après la partie de
contrôle à deux, jamais pendant (ADR 0001, leçon du 27/08 sans exception possible ici).

## La règle (ADR 0022)

Un compte = **un pseudo unique + un mot de passe**. Pas d'e-mail, pas de lien de réinitialisation,
pas d'envoi. Mot de passe perdu → remis à zéro par l'admin (`npx convex run`). Un compte
**possède** ses `players` ; le **code de partie reste l'invitation**. Le jeton de partie devient
un **jeton de session**.

## Ce qui change

1. **Schéma** — `accounts { nickname, nicknameKey (minuscules, sans accents — la clé d'unicité),
   passwordHash, salt, iterations, createdAt }`, index `byNicknameKey` unique ; `sessions
   { accountId, token, createdAt, lastSeenAt }`, index `byToken`, `byAccount` ;
   `players.accountId` (obligatoire — c'est le wipe), `players.token` **disparaît**,
   `players.nickname` reste (copie au `join`, figée pour la saison : un pseudo changé plus tard ne
   réécrit pas l'histoire d'une saison). **Bornes** : pseudo 3-16 caractères (`NICKNAME_MIN/MAX`,
   `src/domain/account.ts`, lu par le champ et par le serveur — une seule règle), mot de passe
   8-72 octets. Ni `accounts` ni `sessions` ne sont dans `GAME_TABLES` : le wipe efface les
   saisons, jamais les gens.
2. **Hachage** — `convex/auth.ts` : PBKDF2-SHA-256 via `crypto.subtle`, 600 000 itérations
   (`PBKDF2_ITERATIONS`, gravé par ligne pour pouvoir monter plus tard sans casser les anciens),
   sel 16 octets, comparaison en temps constant. Jeton de session : 32 octets aléatoires en
   base64url. **Aucune dépendance**, pas de Convex Auth (ADR 0022 : sa brique mot de passe veut un
   e-mail).
3. **Mutations** — `auth.register({ nickname, password })` → `{ token }` (refus `NICKNAME_TAKEN`,
   `NICKNAME_INVALID`, `PASSWORD_TOO_SHORT`) ; `auth.login({ nickname, password })` → `{ token }`
   (une seule erreur `BAD_CREDENTIALS`, jamais « pseudo inconnu » — pas d'énumération) ;
   `auth.logout({ token })` ; `auth.me({ token })` → `{ nickname, seats: previews }`. **Toute
   mutation existante** qui prenait `token` (le jeton de partie) prend désormais **`token` (session)
   + `seasonId`** là où un siège doit être désigné — `playerByToken` devient
   `playerOf(ctx, sessionToken, seasonId)` : la session → le compte → le `players` de ce compte
   dans cette saison. `create` et `join` prennent la session, plus de `nickname` en argument (il
   vient du compte). Un compte a **au plus un siège par saison** (`SEAT_TAKEN`).
4. **Admin** — `internalMutation auth.resetPassword({ nickname, password })` pour
   `npx convex run` — la seule porte de réinitialisation, documentée dans `deploiement/README.md`.
5. **Client** — `src/data/session.ts` remplace `token.ts` : un seul jeton, `wws-session`, en
   `localStorage` ; `readTokens` / la liste des parties disparaissent — l'accueil liste les sièges
   du compte (`auth.me`). Page de **connexion** avant l'accueil (pseudo + mot de passe, bascule
   « créer un compte », erreurs en clair sous le champ, jamais grisé) ; l'accueil garde ses deux
   gestes (fonder / rejoindre par code) ; « déconnexion » dans Réglages. `usePresence`
   (fondateur-absent) touche la session **et** le siège. Clés `fr.auth.*` ; `nicknameNote` meurt.
6. **`fondateur-absent`** : `lastSeenAt` reste sur `players` (c'est la présence *dans cette
   saison* qui compte) — `sessions.lastSeenAt` est une autre chose, non servie.

## Ce que ce prompt ne fait pas

Pas d'e-mail, pas de reset en libre-service, pas d'expiration de session, pas de limitation de
débit sur `login` (entre amis ; à noter dans `risques.md` comme assumé). Pas de notifications
(prompt suivant, qui s'accrochera à `accounts`). Pas de migration : wipe.

## Cas d'acceptation (tests d'abord — 53a)

1. `register` deux fois « Pierre » puis « pierre » → `NICKNAME_TAKEN` la seconde fois ; « Pi » →
   `NICKNAME_INVALID` ; 17 caractères → `NICKNAME_INVALID`.
2. `login` mauvais mot de passe et pseudo inconnu → la **même** erreur `BAD_CREDENTIALS`.
3. Deux `login` → deux sessions valides ; `logout` d'une n'invalide pas l'autre.
4. Un compte `join` deux fois la même saison → `SEAT_TAKEN` ; deux saisons → deux sièges,
   `auth.me` les liste.
5. Toute mutation de jeu avec un jeton de session inconnu → `UNKNOWN_SESSION` ; avec une session
   valide mais sans siège dans la saison → `NO_SEAT`.
6. `playerView` ne sert jamais `passwordHash`, `salt`, ni le jeton (test sur la forme).
7. Le hachage d'un même mot de passe avec deux sels diffère ; `login` accepte après un
   `resetPassword` admin ; un mot de passe de 73 octets est refusé, 72 accepté.
8. `destroy` d'une saison ne touche ni `accounts` ni `sessions`.
9. `press`, `standings`, `fondateur-absent`, `surrender` : leurs tests repassent avec `playerOf`.

`npm run verifier` vert. `CLAUDE.md` (le paragraphe « les données viennent du backend par le
jeton de partie » est à réécrire), `deploiement/README.md` (reset admin, et **le wipe à faire au
déploiement** — `convex deploy` refusera le schéma sur les données existantes, c'est voulu),
`WWS/CONTEXT.md` (compte, session), `RESTE-A-CODER.md`, `risques.md` (une ligne).
