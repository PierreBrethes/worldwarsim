# Prompt Claude Code — la carte que le joueur a relevée, et qui se périme

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`,
`WWS/docs/adr/0020-domination-par-couleur.md` (§4 et §5),
`WWS/docs/adr/0005-brouillard-par-defaut.md`,
`WWS/docs/technique/brouillard-et-fanout.md`, et `convex/schema.ts` (table `sightings`).
Ne commit pas, ne push pas. Un seul commit, préparé mais pas créé.

⚠️ **Vient après `couleur-des-regions.md`**, qui pose la vérité du contrôle et le rendu. Ce prompt
n'ajoute que la connaissance et sa péremption ; il ne change ni la forme de l'API ni le rendu de
base.

## Pourquoi

Aujourd'hui, après le prompt précédent, `control.held` rend la vérité entière : tout le monde voit
tout. C'était une étape, pas la règle.

La règle (ADR 0020 §5) : **un joueur voit son dernier relevé, pas la vérité.** S'il a vu une région
tenue par l'URSS, qu'elle est prise par les États-Unis pendant son absence, il continue de la voir
soviétique jusqu'à ce qu'il y retourne. C'est la carte d'état-major de 1940 — on ne savait pas
qu'une région avait changé de mains sans y envoyer quelqu'un — et c'est ce que l'ADR 0005 exigeait
déjà sans que ce soit codé : « un arc détecté puis perdu de vue doit rester affiché comme
**dernière position connue**, pas disparaître ».

## Ce qui change

**Trois états d'une région, pour un joueur donné.**

1. **Vierge** — jamais observée. Aucune couleur. Ce n'est pas « neutre » : c'est *inconnu*.
2. **Relevée** — observée à une date, avec le propriétaire vu ce jour-là. Peut être fausse.
3. **À jour** — actuellement couverte par une de ses portées, ou sur son propre territoire.

Le territoire d'un joueur est toujours à jour ; il n'a pas besoin de s'observer lui-même.

**Le relevé se dénormalise par observateur, comme `sightings`.** Une table
`regionSightings(playerId, regionId, ownerId | null, seenAt)`, une ligne par couple observateur ×
région, écrasée à chaque nouvelle observation.

**Ne fais pas une query qui filtre la vérité** : elle dépendrait de la table des avant-postes et se
recalculerait pour tous les joueurs à chaque fondation — le piège décrit mot pour mot dans
`brouillard-et-fanout.md`. Chaque joueur lit **ses propres lignes**, et rien d'autre.

**Quand on écrit.** Réutilise les détecteurs existants (`94b0899` : troupes posées à
`SCOUT_RADIUS_KM`, avant-postes, territoire, station d'écoute à `LISTENING_STATION_RADIUS_KM`).
Les points d'échantillonnage sont les **événements**, jamais une boucle : pose d'une troupe,
fondation d'un avant-poste, départ et arrivée d'un mouvement, et les étapes du trajet déjà
calculées par `convex/routes.ts`. Il n'existe aucune horloge périodique dans ce jeu — une *passe de
résolution* est la résolution d'un engagement (ADR 0018), pas un battement — donc n'en invente pas
une ici.

Borne les écritures : une observation n'écrit que les régions dont le relevé **change** (même
propriétaire et relevé récent ⇒ on ne réécrit pas la ligne). Sinon un mouvement long à travers un
continent écrit des centaines de lignes pour rien.

**Ce que rend `control.held`** : pour le joueur qui appelle, ses régions à jour et ses régions
relevées avec `seenAt` et le propriétaire vu. Jamais la vérité sur une région qu'il n'observe pas.
Les régions vierges ne sont pas renvoyées.

**Rendu — l'ancienneté se voit en permanence, jamais au survol seul.** Une région à jour est
franche ; un relevé ancien est **délavé**, et d'autant plus qu'il est vieux. Le survol donne la
date en clair (`src/i18n/fr.ts`, formulée en presse 1940 — « relevé du 12 août », pas « il y a
17 h »). Sans ce signal permanent, un joueur qui décide sur une information périmée lira un bug
plutôt qu'une règle, et il aura raison de se plaindre.

**Le score reste public** (ADR 0020 §4) : la part de carte de chacun s'affiche nominativement, même
si la carte, elle, est trouée. On sait qui mène, jamais où il tient. Ne dérive **jamais** le score
affiché du relevé du joueur — ce serait un second chiffre, faux, à côté du vrai.

## Ce que ce prompt ne fait pas

Les portées de détection et les postures (ADR 0021) : il se branche sur les détecteurs qui existent
déjà. Ni la production reliée, ni la décoloration à la désactivation, ni le pillage.

## Vérifications

`npm run verifier`. Tests : une région jamais vue n'est pas renvoyée · une région vue puis quittée
garde son ancien propriétaire alors que la vérité a changé · elle se corrige au retour d'une troupe
· le territoire du joueur est toujours à jour · un second passage sans changement n'écrit aucune
ligne · un joueur ne lit jamais les lignes d'un autre.

À la main, à deux joueurs : A relève une région tenue par B → A s'en va → B la perd au profit de C
→ A voit toujours B, délavé, daté → A y renvoie une troupe → la couleur passe à C.

**Mesure à rapporter dans le commit** : le nombre de lignes écrites par un mouvement traversant un
continent, et la taille de `regionSightings` après une heure de partie à quatre joueurs.
