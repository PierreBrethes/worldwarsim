# Prompt Claude Code — la fenêtre Industrie

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'[ADR 0015](../../adr/0015-economie-v2-ressources-localisees.md)
et la proposition [clic-batiment-et-surfaces.md](../../design/propositions/clic-batiment-et-surfaces.md).
Ne commit pas, ne push pas.

## Pourquoi

Les trois chaînes de conversion sont codées et **invisibles**. Un joueur ne peut pas répondre à
*« pourquoi mon alliage ne monte plus ? »* — la réponse est « ta fonderie manque de charbon », et
rien à l'écran ne le dit. La fiche Nation montre des **stocks**, jamais des **flux**.

Dix bâtiments sur quinze n'ont aujourd'hui aucune surface où aller : les quatre exploitations, les
trois conversions, les deux stockages et la station d'écoute.

**Cette passe est en lecture seule.** L'amélioration arrive au prompt suivant
(`ameliorer-sur-la-ligne.md`), le clic sur la carte au troisième. Ne les anticipe pas.

## La surface

Une quatrième fenêtre, `industry`, dans `WINDOWS` de `src/routes/plateau.tsx` et dans le rail
(`src/shell/SurfaceRail.tsx`), à côté de Troupes, Production et Nation. Il te faut un pictogramme
`industry` dans `IndicatorGlyph.tsx` — même gabarit que les autres : `viewBox 0 0 20 20`,
`stroke="currentColor"`, `strokeWidth 1.4`, aucun remplissage.

Trois sections.

### 1 — Les chaînes

Une ligne par conversion de `CHAINS` (`convex/constants.ts`), **même si le bâtiment n'est pas
construit** : une chaîne absente est une information, pas un vide. Chaque ligne porte les entrées,
la sortie, le débit par heure, et **son état**.

**L'état est le cœur de ce prompt, et il n'existe pas encore.** `settleStocks`
(`src/domain/economy.ts`) calcule les conversions mais ne dit jamais *pourquoi* une conversion a
produit moins que son débit nominal. Or le code contient déjà les deux causes, lignes 104-115 :

```
const room = cap[output] - settled[output];        // ← sortie au plafond
const affordable = inputs.reduce(min, perHour * elapsed);  // ← entrée manquante
const made = min(room, affordable);
```

Trois états, et ils se distinguent sans nouvelle donnée :

| état | condition | ce que le joueur doit comprendre |
|---|---|---|
| **tourne** | `made` vaut le débit nominal | rien à faire |
| **à sec** | `affordable` a mordu — une entrée manque | *quelle* entrée, nommément |
| **débordée** | `room` a mordu — la sortie est au plafond | agrandis ton stockage ou dépense |

**Ne duplique pas la boucle de `settleStocks` pour recalculer ça.** Fais-la retourner, en plus des
stocks, un rapport par conversion — ou expose une fonction sœur dans le même module qui partage le
calcul. Deux boucles qui font le même arbitrage sont deux chances de diverger, et c'est exactement
le défaut que ce projet corrige ailleurs (voir le commentaire de `cappedByHq` dans
`convex/buildings.ts` sur la règle qui vivait à deux endroits).

« à sec » doit **nommer la ressource qui manque**, pas dire « entrées insuffisantes ». C'est toute
la valeur de l'écran.

### 2 — Les gisements exploités

Une ligne par bâtiment d'exploitation debout : région, gisement, niveau, débit par heure. La donnée
existe dans `extractionRates` (`convex/resources.ts`) mais **agrégée par ressource** — il te faut le
détail par site. `regionFacts(building.regionId).deposit` et `exploits(key, deposit)` portent déjà
la règle ; ne la réécris pas.

Affiche aussi **les bâtiments d'exploitation qui ne produisent rien** — une mine sur une région sans
gisement, si le placement l'autorise. Un bâtiment muet est le genre d'erreur qu'un joueur doit voir.

### 3 — Les réserves

Une ligne par ressource : stock, plafond, et **la distance au plafond**. Un joueur au plafond
gaspille sa production en continu et rien ne le lui dit aujourd'hui. Les plafonds viennent de
`storageCaps`, l'entrepôt et le dépôt couvrent chacun leur moitié (`STORED_BY`).

La station d'écoute va ici aussi, dans une sous-section « autres » avec son effet chiffré. C'est un
provisoire assumé : elle migrera vers la fenêtre Espionnage quand celle-ci existera. Un jalon inerte
au milieu de quatorze cliquables serait pire.

## Ce que le serveur doit servir en plus

`PlayerView.me` porte déjà `resources` (stock, débit, plafond) et `buildings` (clé, région, niveau).
Il manque **l'état des chaînes** et **le débit par site d'exploitation**. Ajoute-les à `view.ts`.

Rien de tout ça ne concerne les bâtiments adverses : ils ne transitent jamais par `PlayerView`
(ADR 0005). Si tu dois écrire un `if` sur la nationalité, la donnée n'aurait pas dû arriver.

## Critères d'acceptation

- Une fonderie sans charbon affiche **« à sec — charbon »**, en nommant la ressource.
- Une conversion dont la sortie est au plafond affiche « débordée », pas « à sec ».
- Une chaîne dont le bâtiment n'est pas construit apparaît, éteinte.
- L'état des chaînes est calculé **une seule fois**, partagé avec `settleStocks`, jamais recalculé
  en parallèle. Un test le prouve : changer le débit d'une chaîne change les deux.
- Une mine posée sur une région sans gisement apparaît avec un débit nul, pas absente.
- Aucune chaîne française en dur hors de `src/i18n/fr.ts`.
- `npm run build` et `npm run test` passent ; aucun terme banni.

## Ce que tu ne fais pas

Pas de bouton, pas d'amélioration, pas de construction, pas de clic depuis la carte. Tu ne touches
ni au bandeau, ni à la fiche Nation — le recouvrement entre les deux se tranchera **en les voyant**,
pas maintenant. Tu ne changes aucune valeur de `constants.ts`.
