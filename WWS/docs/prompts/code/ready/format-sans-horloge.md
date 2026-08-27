# Prompt Claude Code — le format se choisit, l'horloge devient optionnelle

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, `WWS/docs/adr/0017-format-de-saison-et-socle-place.md`.
Ne commit pas, ne push pas.

## Pourquoi

Aujourd'hui **la durée est la clé du format** : `formatOf(durationHours)` (`convex/constants.ts`)
dérive tout `SEASON_FORMATS` de 48 ou 168, et `seasons.create` n'accepte que ces deux littéraux.
Décision de Pierre (27/08) : pendant l'alpha entre amis, une partie doit pouvoir **ne pas avoir
d'horloge** — on la conclut à la main. Le format (ce qu'on reçoit au lancement, les plafonds,
la projection du catalogue) reste, il se choisit explicitement. La fin à l'heure n'existe de
toute façon pas encore (audit du 25/08) : ce prompt ne la crée pas, il rend le fait honnête.

## Ce qui change

**Schéma** (`convex/schema.ts`). `seasons.format: 'skirmish' | 'campaign'` (`v.optional` — les
saisons existantes n'en portent pas, cf. le commentaire de `winnerId` : même tolérance, même
wipe à venir). `durationHours: number | null`, `null` = sans horloge. Retire le validateur
`SEASON_DURATION_HOURS` s'il ne sert plus qu'à ça.

**Une seule porte pour lire le format** : `formatOfSeason(season)` remplace `formatOf(duration)`
partout (`view.ts`, `constructions.ts`, `troops.ts`, `movement/orders.ts`, `seasons.ts`). Elle lit
`season.format`, et retombe sur la dérivation par durée pour une ligne d'avant ce prompt.
`SeasonFormatSpec.durationHours` devient `defaultDurationHours` : c'est ce que propose l'accueil,
plus ce qui définit le format.

**`seasons.create`** : `format` obligatoire, `durationHours: v.union(v.literal(48), v.literal(168),
v.null())`. Pas de combinaison interdite — une campagne à 48 h est bête, pas illégale.

**`seasons.conclude`** (nouvelle mutation) : réservée au créateur (`creator: true`), saison
`launched` seulement, `status: 'concluded'`, `winnerId: null`, `concludedAt: now`. Passe par la
même sortie que `victory.ts:137` — factorise si les deux écrivent les trois mêmes champs.
Une dépêche journal « la saison est close par son fondateur » (ajoute la sorte à `NOTICE`).

**Front.**
- `accueil.tsx` : deux choix distincts — *format* (Escarmouche / Campagne, mots déjà dans
  `WWS/CONTEXT.md`, pas « Blitz ») puis *horloge* (48 h / 7 jours / **sans horloge**), l'horloge
  préremplie par le format. `fr.lobby.paces` se scinde en `formats` et `clocks`.
- `salon.tsx`, `accueil.tsx` (`remaining`, `pace`), `SurfaceRail.tsx` (`minutesLeft`),
  `JournalWindow.tsx` (jours) : un `durationHours` nul n'affiche **aucun** compte à rebours —
  pas « ∞ », pas « 0 j ». Le rail le dit en un mot (« sans horloge »).
- `SettingsWindow.tsx` : bouton-tampon « CLORE LA SAISON », visible du seul fondateur, avec
  confirmation (pattern de `leaveNote`). Après : le plateau reste lisible (`seasons.ts:74`).

## Docs

Note de révision datée (27/08) en tête de l'ADR 0017 : le format ne se déduit plus de la durée ;
l'horloge est optionnelle pendant l'alpha ; ADR 0001 non rouverte (la saison reste longue,
asynchrone, jetable — seule la clôture change de main). Une ligne dans `CONTEXT.md` si le
vocabulaire « sans horloge » y entre.

## Vérifications

`npm run verifier`. Tests : `formatOfSeason` sur une ligne sans `format` ; `conclude` refusée à
un non-fondateur et sur un lobby ; les jobs planifiés restent muets après `conclude`
(`off-season.test.ts`). À la main : fonder une escarmouche sans horloge → aucun compte à rebours
nulle part → clore → journal → plateau encore lisible, ordres refusés.
