# Prompt Claude Code — les emplacements suivent le niveau du site

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`,
`WWS/docs/adr/0020-domination-par-couleur.md` (§10),
`WWS/docs/adr/0015-economie-v2-ressources-localisees.md`,
`WWS/docs/prompts/code/done/entretien-par-ancrage.md`, puis `convex/constructions.ts`,
`convex/regions.ts` (`foundationOwed`) et `src/domain/economy.ts` (`settleStocks`).
Ne commit pas, ne push pas. Un seul commit, préparé mais pas créé.

## Pourquoi

Le plafond global `buildingCap(hqLevel)` refuse sans raison lisible : au lancement il est
entièrement consommé par la fondation nationale (zéro placement libre, et d'autant moins que la
nation est riche — l'inverse des garde-fous de l'ADR 0015), et il punit l'expansion que l'ADR 0020
demande. Décision (31/08, ADR 0020 §10) : les emplacements sont portés par **chaque site**, la
fondation est hors compte, et le frein d'expansion devient l'**entretien** d'avant-poste.

Si le correctif provisoire `BUILDING_CAP_BASE = 5` a été appliqué entre-temps, ce prompt le
remplace entièrement.

## La règle

- **Sol national** : `2 × niveau de QG` emplacements. Les extracteurs de la fondation
  (`foundationOwed`) ne comptent pas — pour chaque clé due par la nation, le premier exemplaire
  posé sur le sol national est hors compte.
- **Avant-poste** : `outposts.level` emplacements (le champ existe au schéma).
- Le QG lui-même ne consomme pas d'emplacement. Un bâtiment par région : la règle existante ne
  bouge pas. Les paliers de types (`UNLOCKED_AT`) ne bougent pas.

## Ce qui change

**Rattachement d'un bâtiment à son site.** Ajoute au schéma `buildings.outpostId:
v.optional(v.union(v.id('outposts'), v.null()))` — `null` (ou absent, pour les lignes d'avant ce
prompt) = sol national. Écrit **à la pose**, jamais recalculé : un bâtiment posé à l'étranger
s'ancre à l'avant-poste **du propriétaire le plus proche dont le rayon couvre la région** ; s'il
n'y en a qu'un, c'est lui. Les lignes existantes sans champ se relisent par la géographie une fois
(sol national si `regionId` est chez soi) — même tolérance de migration que `seasons.format`.

**`convex/constructions.ts`** : le contrôle `cap` (~ligne 285) devient par site — l'erreur dit
quel site est plein, jamais un total global. `buildingCap` et ses constantes disparaissent de
`convex/constants.ts`.

**Avant-poste détruit** : ses bâtiments restent debout (la démolition n'existe pas) mais son
ancre est morte — on ne peut plus rien y poser. Ne les re-rattache à rien.
**Avant-poste désactivé** : rien ne change pour les emplacements (le gel de production viendra
avec la production reliée, ADR 0020 §6 — pas ici).

**Entretien d'avant-poste** (`src/domain/economy.ts`, même passage que l'entretien des troupes) :
chaque avant-poste débite le stock national par heure, croissant avec son niveau.
`OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL = { food: 2, coal: 1 }` dans `convex/constants.ts` —
**placeholder assumé, jamais mesuré**, même statut et même style de commentaire que
`UPKEEP_UNSUPPLIED_MULTIPLIER`. À sec, rien ne meurt (contrat D3 de `consommation-continue.md`) :
le stock plonge, c'est tout.

**`view.ts` / `serverView.ts` / front** : `me.buildingCap` global disparaît. La vue expose par
site : emplacements pris / total. `EconomyWindow` et l'écran de pose disent « un emplacement libre
sur ce site », plus jamais un total national. Le libellé du refus (`src/i18n/fr.ts`) suit.
`BuildHold: 'buildingCap'` (`src/domain/construction.ts`) se renomme en `'siteSlots'` ou
équivalent anglais lisible.

⚠️ **« slot » reste réservé aux mouvements** (ADR 0006). En français, écris *emplacement* pour les
bâtiments, partout — aucun libellé joueur ne dit « slot » pour un site.

**Tests** : `economy.test.ts` — l'assertion « le plafond reste sous les 16 Länder allemands »
change de nature : vérifie à la place qu'au lancement (QG 1, fondation posée) le sol national
offre **exactement 2 emplacements libres, quelle que soit la dotation en gisements de la nation** —
c'est le point que l'ancien modèle ratait. Ajoute : fondation hors compte · avant-poste niveau 1 =
1 emplacement, niveau 3 = 3 · pose refusée sur un site plein mais acceptée sur un autre ·
l'entretien débite par niveau · un avant-poste détruit n'accepte plus de pose.

## Docs

`WWS/docs/QUESTIONS.md` : Q4 se referme, renvoi à l'ADR 0020 §10. Registre `@a-mesurer` régénéré
(les valeurs d'entretien y entrent, `buildingCap` en sort).

## Vérifications

`npm run verifier`. À la main : fonder une partie → poser la fondation → il reste 2 emplacements
libres chez soi → monter le QG → 4 → fonder un avant-poste → 1 emplacement là-bas → l'améliorer →
2 → le stock de nourriture baisse plus vite qu'avant la fondation de l'avant-poste.
