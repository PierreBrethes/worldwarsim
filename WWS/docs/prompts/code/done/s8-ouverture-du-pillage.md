# s8-ouverture-du-pillage — le dépôt ne compile pas, et le pillage n'a pas de porte

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, **`WWS/docs/prompts/code/ready/pillage-et-butin.md`
§ « Prochain lot exact — S8 »** et la ligne S8 de `WWS/docs/RESTE-A-CODER.md`, l'ADR 0005 (révision
du 10/09, décision 84a), l'ADR 0015 (rien de grisé, la rose et le serveur sortent de la même
fonction). Puis le code : `src/domain/compass-rose.ts`, `src/domain/compass-rose.test.ts`
(§ « offers plunder or sabotage… » et « offers collection… » — **les tests sont déjà écrits, ils
sont la spec**), `src/domain/movement-orders.ts` (`plunderOrderRefusalOf`,
`lootCollectionOrderRefusalOf`, `isPlunderTarget`), `convex/movements.ts` (`plunder`,
`collectLoot`, `previewPlunder`, `previewLootCollection` — le serveur est ouvert), `convex/movement/orders.ts`
(`surveyedPlunderAim`), `src/domain/player-view.ts` (`surveyedInstallations`, `lootSightings`),
`src/map/CompassRose.tsx` (`PICTOGRAM_PATHS`), `src/routes/plateau.tsx` (la cible `loot` existe
déjà, ligne ~810 ; `compassOf` ligne ~574), `src/i18n/fr.ts` (`fr.compass`, `fr.loot`). Ne commit
pas, ne push pas. Un chantier, un commit.

## Constat

Le commit `d379260` (« last update », 10/09 0 h) a figé S8 **à mi-course** :
`npm run types` s'arrête sur `src/domain/compass-rose.ts:162` — `| 'doorway';` puis
`| 'crate' | 'sabotage';` : deux pictogrammes ajoutés après le point-virgule qui fermait l'union.
Derrière la syntaxe : les deux imports de `movement-orders` sont inutilisés, la cible `installation`
des tests n'existe pas dans `CompassTarget`, `PICTOGRAM_PATHS` n'a ni `crate` ni `sabotage`,
`surveyedInstallations` n'est rendu **nulle part** (aucun marqueur, donc aucun clic droit possible),
`fr.compass` n'a ni « piller », ni « saboter », ni « ramasser ». Côté serveur, tout est là.

## Ce qui change — dans cet ordre

1. **Vert d'abord.** L'union `CompassPictogram` se referme après `'sabotage'`. `npm run types`
   passe, puis `npm run lint` dit ce qui reste (les imports morts, l'exhaustivité de
   `PICTOGRAM_PATHS`). Ne rien commenter, ne rien `// @ts-expect-error`.
2. **La cible `installation`.** `CompassTarget` gagne `{ kind: 'installation', id, key, regionId,
   name }` — `name` = `fr.buildings[key]`. `compassOf` y rend **une seule branche** `plunder` :
   libellé « piller » sur `warehouse` (et `depot` historique — même cible, `isPlunderTarget`),
   « saboter » sur les sept producteurs ; refus par `plunderOrderRefusalOf` (infanterie requise,
   cible amie, non pillable) — **la même fonction que le serveur**, rien de grisé : sans branche, la
   rose s'ouvre en motif avec la phrase du refus (`fr.errors.INFANTRY_REQUIRED`,
   `WAREHOUSE_TARGET_ONLY`), grammaire de `fr.compass.refused`. Le survol donne durée estimée et
   capacité de la pile (`previewPlunder`), jamais un stock adverse.
3. **La branche `collect`.** Sur la cible `loot` déjà existante : libellé « ramasser »,
   `sightingId`, sixième argument `freeCapacity` de `compassOf` (capacité libre de la pile après sa
   charge existante, `carryCapacityOf`) ; à zéro, pas de branche et le refus « aucune capacité libre
   pour ramener ce butin » (nouvelle clé `fr.compass`, texte exact du test). Aperçu par
   `previewLootCollection` — depuis le relevé possédé, même périmé.
4. **Deux pictogrammes** dans `PICTOGRAM_PATHS` : `crate` (la caisse cerclée — « ramasser ») et
   `sabotage` (la pince coupante ou la torche — « piller / saboter », un seul dessin pour les deux
   libellés : c'est le même ordre). Famille de trait de `cabin` / `doorway`, lisibles à quinze
   pixels, muets.
5. **Le marqueur d'installation relevée.** `surveyedInstallations` se dessine sur la carte au même
   seuil que les bâtiments à soi : le sprite du bâtiment (`src/emblems/buildings/manifest`) au
   centroïde de sa région (le point exact d'un port adverse n'est pas servi — centroïde aussi,
   assumé), dans le délavé des relevés (`surveyWash`, la région porte déjà la date). Clic droit →
   cible `installation`. Clic gauche → rien de nouveau (la lecture de terre existante suffit :
   « la popin lit, la carte agit »). Un observateur défait ne voit pas de rose (déjà le cas par
   `compassOf`).
6. **Envoi.** L'action `plunder` part par `movements.plunder({ buildingId })`, `collect` par
   `movements.collectLoot({ sightingId })` — mêmes confirmation « envoyer — irréversible » et
   aperçu d'arc que les autres ordres (`MovementPreview.tsx`). Le retour est créé par le serveur,
   personne ne l'ordonne.
7. **Retirer la fermeture coordonnée** : s'il reste un garde « S8 non livré » côté serveur ou dans
   `fr.ts`, il part ; les dépêches S7c-1 (prise, sabotage, ramassage, livraison, perte) doivent
   maintenant tomber chez le bon joueur sur un vrai ordre.

## Ce que ce prompt ne fait pas

Aucun changement aux règles serveur du pillage (S4 → S7c-2), aux caisses ni à la rumeur — ADR 0005
révisée, jugées à la partie à deux. Pas d'objectifs neutres. Si le marqueur d'installation
demande un contrat de vue (fiche 05) plus qu'un sprite délavé, le dire et livrer 1-4 et 6-7 sans lui —
**ne pas inventer un panneau**.

## Cas d'acceptation (les deux tests de `compass-rose.test.ts` d'abord, puis)

1. `npm run types` et `npm run lint` verts sur `d379260` corrigé, avant toute autre ligne.
2. Étant donné une infanterie armée et un entrepôt adverse relevé : clic droit sur son marqueur →
   rose à une branche « piller » ; l'aperçu donne la durée ; envoyer crée un mouvement `plunder`
   `outbound` (`convex/plunder.test.ts` : scénario complet public — ordre, arrivée, présence,
   prise, retour, livraison, dépêches chez le seul pilleur).
3. Même cible avec une pile **sans infanterie** → rose en motif, `INFANTRY_REQUIRED` en clair ;
   sur un bâtiment à soi → pas de cible `installation` (c'est la rose sur bâtiment, 54a) ; sur un
   QG adverse → `WAREHOUSE_TARGET_ONLY`.
4. Une caisse relevée (`present`) avec capacité libre → « ramasser » ; à capacité nulle → motif et
   la phrase exacte du test ; un relevé d'absence n'a plus de marqueur (S7c-2 intact).
5. Un mouvement `plunder` en route se lit dans le cartouche avec `fr.loot.arc.plunderOutbound` ;
   l'adversaire ne voit qu'un arc de domaine, sans mission ni charge (test sur la forme d'`ArcView`).
6. Observateur défait : aucune rose sur une installation ni sur une caisse.
7. `npm run verifier` vert — c'est aussi **le S9 du brief** : marquer S8 et S9 livrés dans
   `RESTE-A-CODER.md`, passer `pillage-et-butin.md` et `stockage-unique.md` dans `done/`,
   `CLAUDE.md` § « Ce qui existe » dit que le pillage se joue (ordre, présence, butin, caisse,
   rumeur, ramassage) et ce qui reste `@a-mesurer`.

Un commit, message en français qui décrit le chantier entier — pas « last update ».
