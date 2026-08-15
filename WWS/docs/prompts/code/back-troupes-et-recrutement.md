# Prompt Claude Code — back : troupes discrètes et recrutement (ADR 0014)

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, l'[ADR 0014](../../adr/0014-troupes-discretes-et-combat-sequentiel.md),
l'[ADR 0016](../../adr/0016-code-anglais-jeu-francais.md), les fiches
[08 — Combat](../../design/08-combat.md) et [09 — Unités](../../design/09-unites.md), puis
[chiffrage-combat.md](../../design/propositions/chiffrage-combat.md) qui porte les nombres.
Ne commit pas, ne push pas.

**Prérequis : `back-ressources-et-batiments.md` est passé.** Les huit ressources et les quinze
bâtiments localisés existent. Sans eux, arrête-toi.

**Identifiants en anglais, libellés en français** (ADR 0016).

## Contexte

L'ADR 0011 avait gravé des unités **sans position ni identité** — un effectif national, une ligne
par couple rôle/palier. L'ADR 0014 l'a révisée : les troupes deviennent discrètes, uniques, et
leurs points de vie sont leur **effectif lisible**. La table `units` et la file `recruitments`
sont à refondre.

**Repère d'abord l'existant** et liste-le-moi : `convex/schema.ts`, `units.ts`, `units.test.ts`,
`constants.ts`, `validators.ts`, puis `src/domain/troops.ts`, `player-view.ts`, et la surface 4.6
(`src/routes/-plateau/ProductionWindow.tsx`).

## Implémentation

1. **Troupes.** Remplace `units` par `troops` : une ligne **par troupe** — `playerId`, `role`,
   `tier`, `nominalStrength`, `currentStrength`, `specialization` (union discriminée par rôle,
   `null` tant que la recherche n'existe pas), `stationedAt` (le bâtiment de projection où elle
   stationne). Pas de position libre : une troupe est rattachée, les mouvements viendront la
   déplacer plus tard.

   Les effectifs nominaux par rôle sont chiffrés dans `chiffrage-combat.md` — **reprends-les tels
   quels**, ne les réinvente pas. Le porte-avions se compte en appareils embarqués, pas en coques.

2. **Plafond d'hommes.** La somme des `nominalStrength` d'un joueur est bornée par ses `billets`.
   Le nombre de troupes est borné séparément (constante, ordre 10 à 30). Deux plafonds distincts,
   deux erreurs typées distinctes — on doit savoir lequel a mordu.

3. **Recrutement.** `recruitments` gagne le bâtiment producteur : une file séquentielle **par
   bâtiment de projection**. La `barracks` forme le terrestre, l'`airfield` l'aérien, le `port` le
   maritime — aligne-toi sur `DOMAIN_BY_ROLE` de `src/domain/troops.ts`, ne redéclare pas la table.

   **La datation paresseuse reste la règle, par file** : seule la tête d'une file porte
   `finishesAt` ; les suivants n'ont pas commencé et ne sont datés nulle part. C'est ce qui rend un
   lot en attente annulable sans redater quoi que ce soit. Annulation remboursée intégralement
   pour un lot non commencé, jamais pour un lot commencé.

4. **Un lot achevé devient une troupe** rattachée au bâtiment producteur. Un lot = une troupe
   entière, avec son effectif nominal — pas un compteur qu'on incrémente.

5. **Coûts.** Dans `constants.ts` : coût d'une troupe en matières — `alloy` surtout, `ammunition`
   pour l'emport initial. Plus d'acier, plus d'effectifs : ces ressources n'existent plus. Ajoute
   l'entretien en `food` par troupe, **proportionnel à l'effectif nominal et non courant** (sinon
   perdre des hommes devient une économie), et la consommation d'`oil` des rôles motorisés —
   constante posée, réellement consommée plus tard par les mouvements.

6. **Domaine et vue.** Adapte `src/domain/troops.ts` et `player-view.ts` : la vue liste des
   troupes avec leur effectif lisible et leur rattachement. Aucune troupe adverse ne transite.
   Libellés dans `fr.ts`.

7. **Surface 4.6.** Adapte au minimum pour que la production compile et fonctionne — choix du
   bâtiment producteur, une file par bâtiment. **La refonte visuelle attendra un brief.**

8. **Tests.** Une `barracks` forme une troupe ; deux lots en file, seul le premier porte
   `finishesAt` ; annuler le second rembourse intégralement ; dépasser le plafond d'hommes est
   refusé ; dépasser le nombre de troupes est refusé, avec une erreur différente.

## Critères d'acceptation

- Deux lots en file dans une `barracks` : seul le premier porte `finishesAt` ; le premier achevé
  apparaît comme troupe rattachée à cette `barracks`, à son effectif nominal.
- Créer une troupe au-delà du plafond d'hommes des `billets` est refusé ; au-delà du nombre de
  troupes, refusé avec une autre erreur.
- Un `port` ne forme aucun rôle terrestre, et réciproquement.
- Aucune chaîne française en dur hors de `src/i18n/fr.ts`.
- `npm run build` et `npm run test` passent ; aucun terme banni nulle part.

## Ce que tu ne fais pas

Pas de combat, pas de soin, pas de mouvements de troupes, pas de spécialisations actives, pas de
troupes signature nationales, pas de refonte visuelle. Les valeurs du chiffrage ne se modifient
pas : si l'une te paraît fausse, **signale-la et arrête-toi** — c'est une décision de design.
