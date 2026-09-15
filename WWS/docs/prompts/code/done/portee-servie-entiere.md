# portee-servie-entiere — la vue sert tout le cercle d'un avant-poste, pas seulement sa région

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0020 §1 (dont la précision du 04/09)
et §10. Ne commit pas, ne push pas. Suppose `engagement-intentionnel` (ADR 0024) livré.
Un chantier, un commit.

## Le constat (partie en cours, retour Discord de Lazoreq, 15/09 — `rapports/2026-09-15-retours-discord.md` #1)

« Je ne peux rien créer sur les cases rouges à part celle où il y a le relais logistique. »
L'icône pour bâtir n'apparaît pas sur les régions adjacentes que son avant-poste colore.

Cause, datée et commentée : `convex/view.ts:113-121`. `carrying` — les régions servies dans
`me.regions` — ne contient que le sol national, les régions portant un bâtiment et **la région
même** de chaque avant-poste (`regionOfOutpost`), avec ce commentaire : « le reste de sa portée
attend la passe qui servira son cercle entier ». C'est cette passe.

Côté couleur, `heldOver` (`convex/holding.ts`) → `heldRegions` tient bien le cercle entier :
le joueur voit tenu ce que la vue ne lui offre pas. Côté client, `siteOf`
(`src/domain/construction.ts:310`) répond `null` pour une région absente de `me.regions`, ce
que le panneau lit comme « rien ne se bâtit ici ».

## La règle (aucune révision)

ADR 0020 §1 : *là où je peux bâtir est là où je tiens*. Le serveur refuse déjà juste
(`OUT_OF_OUTPOST_REACH` lit le même rayon que la couleur) ; seule la **vue** est en retard.

## Serveur — `convex/view.ts`

- Ajouter à `carrying` **toutes les régions dont le point tombe dans le rayon d'un avant-poste
  du joueur**, avant-postes hors service compris (ils ancrent encore, §10). Réutiliser
  `coveredRegions(allRegions(), observers)` (`src/domain/control.ts:198`) avec un observateur
  par avant-poste `{ point, radiusKm: outpostReachKm(level), regionId: regionOfOutpost(outpost) }`
  — même lecture que `standingObserversOf` (`convex/surveys.ts:60-66`). Ne pas réécrire une
  boucle de distance.
- Le filtre par bande de latitude de `coveredRegions` borne le coût sur les 4 589 régions.
  Mesurer une fois `playerView` avant/après avec trois avant-postes (le rapport du 11/09 #1
  a déjà vu cette query dépasser 1 s) ; si le surcoût dépasse ~10 ms, le dire dans le compte
  rendu et proposer un champ `outposts.coveredRegionIds` écrit à la fondation et à la montée de
  niveau — **ne pas le faire sans ce chiffre**.
- `site: siteRef(sites.siteAt(facts.id))` et `held` continuent de répondre région par région ;
  rien d'autre ne change. Une région dans mon rayon mais tenue par un autre (son point plus
  proche) reste servie avec un site : on peut y bâtir, ça ne produit pas (§6) — comportement
  existant, à ne pas « corriger ».
- Retirer le commentaire « attend la passe » et dire ce que `carrying` contient désormais.

## Client

- Aucun changement attendu : l'icône de construction suit `siteOf`, qui suit `me.regions`.
  Vérifier que le panneau de site et « à faire maintenant » lisent bien les nouvelles régions
  sans décalage (`slotsOn` : le budget de l'avant-poste se partage entre toutes ses régions).

## Cas d'acceptation

1. Un avant-poste de niveau 1 posé à 30 km de la frontière de trois régions voisines : les
   quatre régions (la sienne + trois) sont dans `me.regions` avec `site: { outpostId }`, et la
   carte montre l'icône de construction sur chacune.
2. Le budget reste celui du point : niveau 1 = **un** emplacement. Poser sur la deuxième région
   refuse par manque d'emplacement, pas par `OUT_OF_OUTPOST_REACH`. Test explicite — c'est la
   réponse au retour « injouable » (#2 du rapport), et elle est voulue.
3. Un avant-poste hors service sert encore ses régions (ancrage §10).
4. Une région hors rayon, même adjacente et colorée par un autre joueur, n'est pas servie.
5. `playerView` : temps mesuré avant/après, chiffré dans le compte rendu.
6. Vérifieur vert, tests de `view.ts` et `construction.ts` mis à jour.
