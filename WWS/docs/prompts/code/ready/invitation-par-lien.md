---
type: prompt
statut: validé
maj: 2026-10-02
code: [convex/seasons.ts, src/routes/connexion.tsx, src/routes/salon.tsx, src/routes/accueil.tsx]
decisions: [ADR 0022, ADR 0015, ADR 0016, plan-1b-2026-10-02]
voir: [../../../marque/marque-et-site.md]
---
# invitation-par-lien — un lien, un compte, le salon

**En bref.** Lot A du plan marque et site : lien `/rejoindre/CODE` public, query `seasons.invitation` sans session, `joinRefusalOf` partagé, formulaire de connexion extrait, enchaînement inscription, join, salon. Prêt à donner ; rien n'en est codé.

> **Lot A du plan « marque et site » (Pierre, 02/10/2026)** — voir `WWS/docs/marque/marque-et-site.md`.
> Il ne dépend pas du nom du jeu, qui est en cours de recherche : rien ici n'écrit le nom ailleurs
> que là où `fr.masthead` l'écrit déjà.

Aujourd'hui, inviter un ami coûte cinq écrans et une saisie : l'hôte copie le code dans le salon
et l'envoie à la main ; l'ami trouve le site, crée un compte sur `/connexion`, arrive à l'accueil,
tape le code, entre au salon. **Après ce lot : un lien, deux champs, le salon.**

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0022 (comptes) et l'ADR 0015 (rien
n'est grisé), `src/routes/__root.tsx` (la porte `open` et `SignedIn`), `src/routes/connexion.tsx`
(`ConnectedSignIn`, `api.auth.register` / `api.auth.login`, `keepSession`),
`src/routes/accueil.tsx` (`submitJoin`, `resume`, `keepSeat`, `useSingleFlight`),
`src/routes/salon.tsx` (`copyCode`), `convex/seasons.ts` (`join` et **l'ordre de ses refus**,
`founderOf`, `seatOf`, `seatsOf`, `freeNations`), `src/domain/off-season.ts` (`CODE_ALPHABET`,
`canJoinRegistration`), `src/data/session.ts`, `src/i18n/fr.ts` (`auth`, `home`, `lobby`),
`convex/errors.ts`, `deploiement/nginx.conf` (le repli SPA `try_files $uri /index.html` sert
déjà une adresse profonde). Ne commit pas, ne push pas. Un chantier, un commit.

## Le parcours

1. **Le salon donne un lien.** À côté de « copier le code » (qui reste), « copier le lien
   d'invitation » écrit `${window.location.origin}/rejoindre/${code}` — aucune adresse en dur.
   Même retour visuel que le code (« lien copié »).
2. **`/rejoindre/$code` est publique.** La porte de `__root.tsx` s'ouvre pour elle comme pour
   `/connexion` — une seule condition dans `open`, pas une seconde garde.
3. **La page lit l'invitation avant tout** : `seasons.invitation({ code, token? })`, une query
   **sans session obligatoire**. Elle rend :
   - `founder` (le pseudo du titulaire courant, `founderOf`), `players`, `maximum`
     (`MAX_PLAYERS`), `status`, `durationHours`, `registrationClosesAt` ;
   - `refusal: ErrorCode | null` — **jamais une exception**, un code inconnu compris
     (`UNKNOWN_GAME_CODE`), pour que la page puisse le dire ;
   - `seated: { seasonId, status, atWar } | null`, **seulement** si `token` est une session
     valide qui tient déjà une place dans cette saison.

   Elle ne rend **pas** le `seasonId` à un appelant qui n'a pas de place, ni les autres pseudos,
   ni les nations prises : le code est le seul secret du salon, la page n'en dit pas plus que ce
   qu'il faut pour décider d'entrer.
4. **Une seule règle de refus.** Extrais de `join` une fonction pure `joinRefusalOf(...)` (même
   ordre : place déjà tenue, saison close, inscriptions closes, plus de nation libre, salon
   plein), lue par `join` **et** par `invitation` — la convention du dépôt : ce que l'écran
   annonce et ce que le serveur refuse sortent de la même fonction.
5. **Sans session** : la feuille d'invitation (manchette réduite comme au salon, « *founder*
   vous invite », durée de saison, places restantes) porte le formulaire de `/connexion` —
   **extrais-le en composant partagé**, ne le recopie pas — avec la même bascule
   inscription / connexion. Un seul envoi enchaîne : `register` ou `login` → `keepSession` →
   `join` → `keepSeat` → `/salon`.
6. **Avec session** : pas de formulaire, un bouton « rejoindre la partie » → `join` → salon.
   Si `seated` existe, le bouton devient « reprendre » et suit exactement `resume` de l'accueil
   (salon si `lobby` ou pas encore en guerre, plateau sinon) — extrais-le plutôt que de le
   dupliquer.
7. **Un refus est une phrase, jamais un bouton grisé** (ADR 0015) : code inconnu, saison close,
   inscriptions closes (avec l'heure si `registrationClosesAt` la donne), plus de nation libre,
   salon plein. Chacune avec un lien vers l'accueil. Le serveur ne rend que des codes
   (`convex/errors.ts`), les phrases vivent dans `fr.ts` (ADR 0016).
8. **Le compte peut naître sans place** : si l'inscription réussit et que `join` refuse entre-temps
   (le salon s'est rempli), la session est gardée, la page dit le refus et mène à l'accueil.
   Pas de rollback de compte.

Le code de l'URL se normalise comme dans `join` (`trim().toUpperCase()`) ; un caractère hors de
`CODE_ALPHABET` donne `UNKNOWN_GAME_CODE` sans requête inutile.

## Ce que ce prompt ne fait pas

Pas de page d'accueil publique ni de film (lot C, attend le nom). **Pas d'aperçu de lien Open
Graph** : il porte le nom et l'affiche, qui vont changer. Pas de notifications (lot D). Pas
d'aperçu personnalisé par invitation (il faudrait un rendu serveur ; Nginx sert du statique).
`/` et `/accueil` ne changent pas.

## Cas d'acceptation (tests d'abord)

1. `invitation` sur un code inconnu → `refusal: 'UNKNOWN_GAME_CODE'`, pas d'exception.
2. `invitation` sans `token`, ou avec un `token` sans place → aucune clé `seasonId` dans la
   réponse ; avec un `token` placé → `seated.seasonId` exact.
3. Table de `joinRefusalOf` : salon ouvert, saison lancée dans la fenêtre d'inscription, après
   la fenêtre, saison close, salon plein, plus de nation libre, place déjà tenue — `join` et
   `invitation` donnent le même code dans chaque cas.
4. Route : `/rejoindre/K7Q2PX` s'affiche sans session ; `/accueil` renvoie toujours à
   `/connexion`.
5. `/rejoindre/k7q2px ` (minuscules, espace) rejoint la même saison que `K7Q2PX`.
6. Le salon copie `${origin}/rejoindre/${code}`.
7. Inscription réussie puis `LOBBY_FULL` → session gardée, phrase du refus, lien vers l'accueil.

`npm run verifier` vert. `CLAUDE.md` racine (section « Le compte possède ses places » : le lien
d'invitation) et `WWS/docs/marque/marque-et-site.md` (lot A → livré, avec la date).
