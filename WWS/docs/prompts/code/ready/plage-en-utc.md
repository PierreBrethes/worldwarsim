# plage-en-utc — la plage de repos se déclare en heure locale et se juge en UTC

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/docs/design/07-friction-sociale.md` (§ Plage de repos),
`src/domain/rest-window.ts` (`minutesSinceMidnight`, `windowExit`, `formatWindow`),
`src/domain/rest-window.test.ts`, `convex/constants.ts` (`DEFAULT_REST_START_MINUTES`,
`restWindowFrom`), `convex/players.ts` (`setRestWindow`), `src/routes/salon.tsx`
(`RestWindowForm`, `asHtmlTime`, `asMinutes`, `endOf`), `src/data/serverView.ts` (les deux
`formatWindow`, lignes ~58 et ~159), `convex/movements.test.ts` (« the rest window holds an
arrival at the border », `vi.setSystemTime`). Ne commit pas, ne push pas. Un chantier, un commit.
Suppose `arrivee-retenue` passé.

## Ce qui se passe en prod

`windowExit` lit `new Date(instant).getHours()`. Dans le navigateur c'est l'heure de Paris ;
dans l'isolat Convex, `Date` est en UTC. Le joueur déclare « 23h00 » au salon (minutes depuis
minuit **local**), le serveur compare à des minutes **UTC** : la plage mord deux heures plus
tard que déclaré, l'été. Le vérifieur ne le voit pas — vitest tourne en Node avec le fuseau du
Mac, cohérent des deux côtés — et `movements.test.ts` pose ses dates en heure locale.

## La règle

**La plage est stockée et jugée en minutes UTC ; elle se déclare et s'affiche en heure locale
du joueur.** Un entier, pas de table, pas de champ de fuseau. Une saison de sept jours peut
chevaucher le passage à l'heure d'hiver : la plage glisse alors d'une heure à l'écran, une fois
par an — assumé, pas corrigé.

## Ce qui change

1. **Le domaine juge en UTC.** `minutesSinceMidnight` passe à `getUTCHours` / `getUTCMinutes`.
   Deux fonctions pures à côté, testées : `toUtcMinutes(localMinutes, offsetMinutes)` et
   `toLocalMinutes(utcMinutes, offsetMinutes)`, modulo 1440, où `offsetMinutes` est
   `-new Date().getTimezoneOffset()` fourni par l'appelant — le domaine ne lit jamais l'horloge.
   Les tests de `rest-window.test.ts` posent leurs instants avec `Date.UTC` et deviennent
   indépendants du fuseau de la machine ; ajoute le cas du passage par minuit dans les deux sens
   de conversion (Paris 00h30 → UTC 22h30 la veille).
2. **Le salon convertit.** `RestWindowForm` affiche `toLocalMinutes(declared.startMinutes, …)`
   et envoie `toUtcMinutes(asMinutes(start), …)` à `setRestWindow`. La phrase « libre à … »
   (`fr.lobby.restUntil`) reste calculée en local, à partir de la valeur saisie. Le serveur ne
   change pas : il reçoit un entier UTC et le valide comme avant.
3. **L'affichage convertit.** Les deux `formatWindow` de `serverView.ts` (la mienne, celle d'un
   adversaire) reçoivent des minutes converties en local. `formatWindow` lui-même ne bouge pas.
4. **La valeur par défaut est en UTC.** `DEFAULT_REST_START_MINUTES` devient `21 * 60` avec un
   commentaire qui dit pourquoi (23h00 à Paris l'été, 22h00 l'hiver — la valeur d'avant, dans
   le fuseau où le serveur la lit). `salon.tsx` a une copie de `REST_WINDOW_MINUTES` et
   `endOf` : garde-les, ils sont locaux et ne changent pas.
5. **Les tests Convex posent leurs dates en UTC.** Dans `movements.test.ts`,
   `vi.setSystemTime(new Date(2026, 7, 17, 23, 0, 0))` devient `new Date(Date.UTC(…))`, et la
   lecture `exit.getHours()` devient `getUTCHours()`. Même passe sur tout autre test qui lit
   une plage (`grep -n "restWindow\|windowExit" convex/*.test.ts`).

## Pas de migration

Les lignes `players.restWindow` déjà écrites gardent leur entier. Le serveur les lisait déjà
comme de l'UTC sans le dire — son comportement sur la saison en cours ne change pas d'une
minute ; seul l'affichage devient honnête (un « 23h00 » déclaré l'été s'affichera « 01h00 »,
ce qui est l'heure à laquelle la plage mordait réellement). Rien à backfiller, rien à dire aux
joueurs de la saison `898YQ3` autre que ça.

## Ce que ce prompt ne fait pas

Pas de fuseau stocké par joueur, pas de choix de fuseau à l'écran, pas de changement à la durée
fixe de la plage (fiche 07, `REST_WINDOW_MINUTES`) ni à son gel en guerre (`REST_WINDOW_FROZEN`).

## Rapport attendu

Les tests touchés ; la preuve que `windowExit` donne le même instant sous `TZ=UTC` et sous
`TZ=Europe/Paris` (lance `TZ=UTC npx vitest run src/domain/rest-window.test.ts` en plus du
vérifieur) ; le `verifier` vert.
