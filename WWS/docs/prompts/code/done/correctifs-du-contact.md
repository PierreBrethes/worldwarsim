# Prompt Claude Code — quatre correctifs du contact, bien délimités

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'**ADR 0014** (une passe par engagement) et
l'**ADR 0018 §3**. Ensuite `convex/routes.ts` (`hostAtPoint`, `countryAt`),
`scripts/generate-region-index.mjs`, `src/domain/interception.ts` et `convex/movements.ts`
(`forceOf`, `sameStation`, `scheduleInterception`). Ne commit pas, ne push pas.

Ces quatre défauts viennent de ton propre rapport critique après la marche — ils sont validés,
prends-les tels quels. Aucun ne demande de décision de design ; les deux qui en demandaient
(déroute d'un campement, victoire défensive) sont tranchés à part et ne sont **pas** dans ce
prompt.

## 1. `hostAtPoint` lit le polygone, plus jamais la région la plus proche

Ton test frontalier le condamne : cinq points sur six faux près d'une frontière (Menton → MCO,
Aix-la-Chapelle → BEL, Saint-Louis → CHE). Et il décide trois choses : le marqueur « sol non
reconnu » (qui ment à un Français visant près de Monaco), le `hostCountry` d'un avant-poste, la
fenêtre de repos d'une arrivée.

Le correctif que tu as toi-même identifié : `world.json` porte `a` (l'ADM0) depuis
`nommer-les-pays` — `countryAt` rend le code au lieu du nom, et `hostAtPoint` devient exact par
point-dans-polygone, sans plus jamais chercher la région la plus proche. `nearestRegion` perd son
seul appelant hors placement : vérifie s'il en reste un vrai avant de le garder.

Reprends tes six points frontaliers comme cas de test — c'est la bonne méthode, grave-la.

## 2. Le garde-fou du pont Natural Earth → ISO

`NATURAL_EARTH_CODE` est indexé par nom anglais. Si `world-atlas` renomme une entrée, les cinq
sans code ISO échouent bruyamment, mais les quatre codées autrement (`SDS`, `SAH`, `PSX`, `ALD`)
retombent **silencieusement** sur l'ISO — et le pont pointe vers un code qu'aucune région ne
porte. Ta ligne manquante : à la génération, tout code présent dans `world.json` doit exister
dans les codes de `region-index.json`, sinon erreur. Un défaut de données se répare une fois à la
génération, jamais en partie.

## 3. La référence `posted:` cesse d'être une comparaison flottante

`posted:<playerId>@<lon>,<lat>` sérialisée à la main et relue par égalité flottante exacte : si la
comparaison rate, le contact est planifié, `forceOf` ne trouve personne, et **rien ne se passe,
sans un mot** — un échec silencieux au cœur d'une règle de combat, ton propre diagnostic.

Remplace l'égalité par ce que le domaine sait déjà faire : `forceOf` relit **par distance** — les
troupes du joueur posées à moins d'un epsilon du point du contact (un `POSTED_MATCH_KM` de
l'ordre du kilomètre, commenté comme tolérance technique et non comme rayon de jeu — il ne va
**pas** dans le registre `@a-mesurer`, ce n'est pas un réglage). Si tu peux supprimer la
sérialisation `posted:` au profit du point stocké tel quel dans le document du contact, fais-le :
une chaîne reparsée à la main est une seconde vérité de plus.

Un test : le contact retrouve sa force après un aller-retour Convex du point (écriture, lecture,
resolution) — c'est exactement le chemin où l'égalité exacte casserait.

## 4. Une passe par ordre : l'arrivée éteint l'interception à destination

Une marche — désormais l'ordre banal — vers un point proche d'un avant-poste ennemi garnisonné
déclenche **deux** passes : l'interception longue (200 km) en chemin, puis le contact d'arrivée.
L'ADR 0014 dit une passe par engagement. Tu excluais déjà du balayage les campements à moins de
`ARRIVAL_RADIUS_KM` de la destination ; étends la même exclusion aux **garnisons** dans le même
rayon — c'est l'arrivée qui répond pour tout ce qui se tient là où l'on va, une seule fois. Le
`except` existant sur l'avant-poste ciblé devient un cas particulier de cette règle : fusionne-les
au lieu d'empiler deux exclusions.

L'interception longue reste intacte partout ailleurs — le filet en travers d'une route ne bouge
pas, on ne retire que le doublon à destination. Le test existant qui « contournait le cas en
plantant l'avant-poste loin » se retourne : il devient le test du correctif.

## Critères d'acceptation

- Les six points frontaliers rendent le bon pays ; la génération échoue sur un code de
  `world.json` inconnu de `region-index.json` (vérifié en cassant, puis restauré).
- Le contact `posted:` survit à l'aller-retour Convex ; plus aucune égalité flottante exacte dans
  le chemin du combat.
- Une marche vers un point à 20 km d'un avant-poste garnisonné produit **une** passe.
- Aucun texte affiché hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et
  `npm run test` passent.

## Ce que tu ne fais pas

Tu ne touches ni à la déroute des campements ni à `claimVictory` — tranchés à part. Tu ne changes
pas `INTERCEPTION_RADIUS_KM`. Tu ne déplaces pas le marqueur « sol non reconnu » : sa surface
(carte de visée vs bannière) est un choix d'interface que Pierre validera en regardant l'écran.
