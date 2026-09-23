# 23-docs-design-a-jour — l'index des ADR, le glossaire, la fiche combat, la fiche 11, les contrats de vue et le rapport de simulation disent les révisions en vigueur

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `WWS/docs/adr/README.md`, le **Statut** et les bannières des ADR du cas 2, ADR 0017 ~13
(modèle de bandeau), ADR 0024 §3 (~48-64) et Conséquences (~112-118) ; sous `WWS/docs/design/` :
`README.md` (~5-23), `08-combat.md`, `11-brief-ui.md` (§4.3 ~126, §4.5 ~153, §4.6 ~168), les contrats
de vue 02, 03, 05, 06, 07, `propositions/flux-mouvement-en-carte.md` ~13-19 ; `WWS/CONTEXT.md` ~40-50 ;
`WWS/docs/technique/rapport-simulation.md` ~1-10 ; `WWS/QUESTIONS.md` ~9-17 ; `WWS/docs/RESTE-A-CODER.md` ~258-264 ; `src/domain/interception.ts`.

## Pourquoi

Les ADR portent leurs révisions ; ce qui les cite ne les a pas suivies.
- L'index (e008b32, 14/09) titre 0014 « combat séquentiel à l'initiative de l'attaquant » (~24) ; le
  H1 dit « combat simultané » (16/09). Onze lignes taisent la révision datée la plus récente de leur
  ADR (cas 2, motif du rapport de 31) : 0008 (13/09), 0011 (14/08), 0012 (18/09), 0013 (04/09), 0014
  (16/09), 0015 (13/09), 0017 (14/09), 0018 (16/09), 0019 (18/09), 0020 (17/09), 0021 (13/09).
- `CONTEXT.md` ~46 : l'Interception, « combat déclenché en route », retirée par l'ADR 0024 §3. Fiche
  08 : « se déclenche par interception » (~12), le contact mobile (§2), l'interception qui « inverse
  l'initiative » et « 72 % » périmés (`QUESTIONS.md` ~11) au §5 — tous deux retouchés le 18/09.
- `RESTE-A-CODER.md` ~262 : « 22 / 29 » ; l'ADR 0014 ~64 et `convex/movements.test.ts` ~1017 disent
  25 / 29. Fiche 11 et rapport de simulation : aucun bandeau. Contrats : « ⚠ pas-codé » sur du livré.

## Ce qui change

1. **Index.** Ligne 0014 : titre = le H1. Statut des onze lignes : ajouter la révision la plus récente
   dans la forme en usage (« révisée le JJ/MM (objet court) », « §N révisé par NNNN (JJ/MM) »), sans
   rien retirer ; 0008 gagne « révisée par 0024 (13/09) ».
2. **`CONTEXT.md` ~46** : « **Retirée** par l'ADR 0024 §3 (13/09/2026) : aucune passe de résolution
   ne se déclenche en route, une colonne va où on l'envoie. Le mot reste réservé à l'intention
   « intercepter » de la direction V1, dont la géométrie est gardée dans le domaine
   (`firstMobileEncounter`, `src/domain/interception.ts`). » Rien d'autre dans ce fichier.
3. **`08-combat.md`, réécrite en place** (c'est court : pas de bandeau) : ~12-14, le combat se
   déclenche **par un ordre** (ADR 0008 **et** 0024) ; §2 « Le déclenchement : un ordre », dix lignes
   au plus, sans « convoi » : une passe n'a lieu que si un ordre la vise, attaqué un camp se bat
   toujours, `ARRIVAL_RADIUS_KM` est l'allonge de l'attaque, la détection sert au relevé (ADR 0021,
   0024 §1) ; §5 sans « Interception en route », « Terrain » et « Tenaille » marqués non codés,
   ~117-120 : plus d'initiative, `DEFENDER_BONUS` seul avantage de la défense (§3, 25 / 29), sans
   « 72 % » ; ~124, le terrain attend un ADR sur `RegionType`, pas « l'ADR 0017 » — la phrase
   ~122-123 qui cite `CLAUDE.md` pour cet interdit reste (24 et 25 s'y appuient). Statut ~3 et ligne
   08 de `design/README.md` : « à jour ADR 0014 (16/09) et ADR 0024 §3 ».
4. **`11-brief-ui.md`** : sous §4.3, §4.5, §4.6, un bandeau `> ⚠️ **Périmée (JJ/MM/AAAA).**` qui nomme
   le remplaçant — §4.3 : le flux de mouvement en carte ; §4.5 : les fenêtres Nation
   (`src/routes/-plateau/NationWindow.tsx`) et Économie (contrat 02), selon l'ADR 0015 ; §4.6 : la
   modale de site et l'abaque-catalogue (contrats 03 et 06). En tête, la ligne « ⚠️ en retard sur … »
   de `design/README.md` ~8, qui renvoie aux bandeaux ; la ligne 11 de son tableau aussi. **Le code
   contredit le cahier** : le flux remplace l'envoi (§4.3, sa « maquette 4.3 » ~19), pas la nation :
   `propositions/flux-mouvement-en-carte.md` ~13 « remplace la §4.5 » → « §4.3 » (CLAUDE.md : 26).
5. **`rapport-simulation.md`**, sous le titre, sur le modèle de l'ADR 0017 ~13 : « ⚠️ **Mesures
   périmées (JJ/MM/AAAA).** » Le simulateur v1, retiré le 06/09, mesurait doctrines, acier et slots
   3/3, avant les ADR 0013, 0014, 0015 et 0020 : 72 %, 33 %, 20,8 % ne valent plus. Seul survit
   « 14 min pour 1 000 km » (`MINUTES_PER_1000_KM_ON_LAND`, `convex/constants.ts` ~808). Corps intact.
6. **`RESTE-A-CODER.md` ~262** : « 22 / 29 » → « 25 / 29 ».
7. **Contrats de vue** (statuts suspects du rapport de 31, que 32 renvoie ici) : un « ⚠ pas-codé »
   que le code dément devient « codé » et sa preuve — `07-presse.md` ~7 (`convex/press.ts`),
   `06-abaque-catalogue.md` ~6 (`roster`, `convex/troops.ts` ~94), `02-economie.md` ~102 (production
   reliée, 07/09), `05-carte-selection.md` ~42 (gisements publics, bad0e28, à confirmer) ; ~112 garde
   « ⚠ pas-codé » (la destruction) mais perd « attend le pillage », livré le 10/09.

## Ce que ce prompt ne fait pas

Aucune décision relitigée, aucun ADR modifié ni renommé (`…-combat-sequentiel.md` garde son nom : des
dizaines de liens le visent). Ni les quatre écarts cosmétiques de titre (0001, 0007, 0008, 0021), ni
le reste de RESTE-A-CODER (30), ni l'outil (31), ni `WWS/CLAUDE.md` (22), ni la racine (21, 24 à 26).

## Cas d'acceptation (tests d'abord)

Doc seule : chaque cas est une commande, lancée d'abord **avant** toute édition (chiffre de départ).

1. `grep '^| \[0014\]' WWS/docs/adr/README.md` contient « combat simultané » et « 16/09 ».
2. `for f in WWS/docs/adr/0*.md; do n=$(basename "$f" | cut -c1-4); d=$(perl -Mutf8 -CSD -ne 'while (/[Rr]évis\p{L}* (?:du |le |\()?(\d{2})\/(\d{2})/g) { print "$2$1 $1/$2\n" }' "$f" | sort | tail -1 | cut -d' ' -f2); [ -n "$d" ] && ! grep "^| \[$n\]" WWS/docs/adr/README.md | grep -q "$d" && echo "$n : $d"; done; true`
   rend les onze lignes du Pourquoi avant, aucune après.
3. `git grep -nE "déclenche par \*\*interception|Interception en route|initiative est volontairement|72 %|avant l'\*\*ADR 0017" -- WWS/docs/design/08-combat.md` : cinq lignes avant, aucune après.
4. `grep -n "Interception" WWS/CONTEXT.md` : une ligne, qui cite « ADR 0024 §3 ».
5. `grep -c "⚠️" WWS/docs/design/11-brief-ui.md` : 0 avant, 4 après ; `grep -n "4\.5"` sur `flux-mouvement-en-carte.md` : rien après.
6. `sed -n 1,8p` de `rapport-simulation.md` montre le bandeau ; `RESTE-A-CODER.md` : `grep -c "22 / 29"` → 0, `grep -c "25 / 29"` → 1.
7. `git diff --stat` : les fichiers nommés dans « Ce qui change » (dont la proposition du point 4 et
   les contrats levés au point 7) et `WWS/docs/design/README.md`, rien d'autre.
8. `grep -rn "pas-cod" WWS/docs/design/contrats-de-vue | grep -v 00-regles` : cinq avant ; après, la
   ligne ~112 de `05-carte-selection.md` et ce que le code ne dément pas, justifié au rapport.

## Vérifications

Les cas 1 à 8. Pas de `npm run verifier` : `.prettierignore` exclut `WWS` et `*.md`, nul test ne les lit.

## Rapport attendu

Format commun (README de la série), plus : les onze cellules Statut, avant → après ; le nouveau §2 de
la fiche 08 ; chaque « ⚠ pas-codé » levé et sa preuve ; le retard croisé sans correction (08 §6-7, 11 §4.2).
