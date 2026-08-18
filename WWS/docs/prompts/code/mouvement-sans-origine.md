# Prompt Claude Code — le mouvement perd son origine, le domaine garde sa porte

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, l'**ADR 0019** puis
l'**ADR 0013**. Ensuite `src/domain/movement-orders.ts`, `src/domain/compass-rose.ts`,
`convex/movements.ts` et `src/routes/plateau.tsx`. Ne commit pas, ne push pas.

**Premier des six prompts de l'ADR 0019.** Il débloque les cinq autres et il **retire** plus de
code qu'il n'en ajoute. Un seul sujet : ce qu'une colonne a le droit de demander.

## Ce que tu supprimes

- `Column.origin` (`movement-orders.ts:31`) et les quatre gardes qui le lisent (lignes 67, 72,
  77, 86). Plus aucune origine ne restreint un ordre.
- `Column.myBarracksRegionIds` — il n'existait que pour le repli.
- L'ordre **`recall`** : il sort de `ORDERABLE_TYPES` et de `refusalOf`, et le code de refus
  `BARRACKS_TARGET_ONLY` avec lui. Le littéral `'recall'` reste-t-il dans `convex/validators.ts`
  pour ne pas invalider des documents déjà écrits, ou fais-tu une migration ? **Dis lequel et
  pourquoi** — c'est la seule question ouverte de ce prompt.
- `src/routes/plateau.tsx:490` (`fromOutpost`) et le paramètre `origin` de
  `convex/movements.ts:408`.

Ne touche pas au type `outpost` ni au type `return` : le premier a son propre prompt (fonder sur
place), le second n'est ordonné par personne.

## Ce que tu ajoutes : les portes de domaine

L'ADR 0013 survit **au départ seulement**. Un mouvement dont au moins une troupe n'est pas
terrestre exige la bâtisse correspondante **au point de départ** :

- une troupe de domaine `sea` → un **port** sur la région du départ ;
- une troupe de domaine `air` → un **aérodrome** sur la région du départ.

`PROJECTION_BY_DOMAIN` (`src/domain/troops.ts:23`) dit **déjà** quelle bâtisse va avec quel
domaine — `land: barracks`, `air: airfield`, `sea: port`. Lis-la, n'en écris pas une seconde ; la
seule chose qui change est qu'elle cesse de ne servir qu'au recrutement pour servir aussi au
départ, et que `land` n'y répond plus rien (le mouvement terrestre ne demande pas de caserne).

Deux nouveaux codes de refus, `NO_PORT_AT_DEPARTURE` et `NO_AIRFIELD_AT_DEPARTURE`, traduits dans
`src/i18n/fr.ts` comme les autres. Le refus doit dire **où** il manque quelque chose, pas
seulement quoi — le joueur est en train de viser, il ne regarde pas son point de départ.

`landOnly` disparaît sous sa forme actuelle : la règle n'est plus « tel ordre exige du terrestre »
mais « le domaine décide de la porte de départ et du terrain admissible ». Restructure-la dans ce
sens plutôt que de garder l'ancienne à côté.

## Ce que tu vérifies avant de finir

`refusalOf` reste la **seule** table de ce qui est légal — la rose des vents et les mutations la
lisent toutes les deux, l'ADR 0015 veut un panneau contextuel et jamais un refus après coup.
Après ce prompt, la rose ne devrait plus jamais être vide sur une cible ordinaire : si tu trouves
un chemin qui la vide encore, **dis-le au lieu de le rustiner**.

## Critères d'acceptation

- `movement-orders.test.ts` et `compass-rose.test.ts` sont réécrits : les cas d'origine
  disparaissent, deux cas de porte de domaine apparaissent (départ sans port, départ avec port).
- Une colonne terrestre posée n'importe où peut demander `attack` sur n'importe quelle cible non
  mienne — c'est le cas de non-régression du chantier.
- Aucun texte affiché hors de `src/i18n/fr.ts` (ADR 0016) ; le serveur ne renvoie que des codes.
- Aucun terme banni (`tick`, `temps réel`, `micro`, `base`, `rush`).
- `npm run build` et `npm run test` passent.

## Ce que tu ne fais pas

Tu ne touches ni au schéma Convex, ni à `stationedAt`, ni à `MovementAim` — trois prompts s'en
chargent. Tu ne rouvres pas l'ADR 0019 : si l'écriture te fait penser qu'il se contredit, arrête-toi
et dis-le.
