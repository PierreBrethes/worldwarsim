---
type: prompt
statut: proposé
maj: 2026-10-04
code: [WWS/INDEX.md, WWS/README.md, WWS/CLAUDE.md, CLAUDE.md, WWS/docs/decisions.md, WWS/docs/skills/wws-fin-session/SKILL.md]
decisions: [menage-1c-2026-10-04]
voir: [../../coffre/organiser-le-coffre.md, outillage/22-docs-wws-a-jour.md, ../../rapports/2026-10-04-etat-outillage.md]
---

# menage-5-index-du-coffre — `WWS/` se lit en un saut depuis `INDEX.md`, et chaque note dit si elle est encore vraie

**En bref.** Termine le chantier `organiser-le-coffre` en version réduite (voie menage-1c) : l'index
porte le statut de **toutes** les notes ; l'en-tête YAML n'est posé que sur les ADR, les fiches et
les propositions ; les portes d'entrée (`WWS/README.md`, `WWS/CLAUDE.md`) cessent de tenir un état.
Remplace le temps 2 du coffre et les prompts outillage 22 et 72. **On signale, on ne corrige pas
le fond** : les corrections sont 23 et 26.

Lis `WWS/docs/prompts/coffre/organiser-le-coffre.md` (format d'en-tête, sections de l'index,
contraintes dures 1 à 5), `Claude outputs/coffre-temps-1.md` (statuts proposés § 1, lignes fausses
§ 3, doublons § 4 — **daté du 02/10** : revérifie chaque statut contre le code, le mobile, les
notifications et le renommage sont passés depuis), `ready/outillage/22-docs-wws-a-jour.md` (son
« Pourquoi »), `WWS/docs/marque/marque-et-site.md` (le modèle de note). Ne commit pas, ne push pas.
**Suppose :** menage-4 commité.

## Ce qui change

1. **`WWS/INDEX.md`** (à créer, en-tête `type: index`) : sections Jeu, Décisions, Technique, Marque
   et site, Prompts, Actifs. Une ligne par note de `WWS/` : lien relatif, une phrase, statut
   (`idée | proposé | validé | en cours | livré | abandonné | périmé`), et pour un statut `périmé`
   la note qui le remplace si elle existe. Exceptions, une ligne chacune : `prompts/code/done/`
   (le dossier), `prompts/code/ready/outillage/` (le dossier, avec le rapport du 04/10),
   `docs/technique/a-mesurer.md` (généré). Y figurent `docs/ETAT-DU-CODE.md`, `docs/decisions.md`,
   `docs/RESTE-A-CODER.md`, `QUESTIONS.md`, `CONTEXT.md`.
2. **En-tête YAML et « En bref »** (format du coffre, YAML avant le H1) sur les ADR
   (`docs/adr/*.md`, README compris), les fiches (`docs/design/*.md`) et les propositions
   (`docs/design/propositions/*.md`) — et nulle part ailleurs de neuf. Une note fausse prend
   `statut: périmé`, ou garde son statut et son « En bref » nomme les passages en retard (§ 3 du
   temps 1, revérifiés). L'ADR 0009 dit « remplacée par l'ADR 0022 ».
3. **`WWS/README.md`** : gardent leur place le pitch et « Ce que le projet n'est pas » ; « Par où
   commencer », « Arborescence », « Stack visée » et le bandeau « En retard » deviennent un renvoi à
   `INDEX.md` (doc) et à `docs/ETAT-DU-CODE.md` (code). Statut `validé`. La phrase « Saison de 48 h
   à 7 jours » est fausse (ADR 0020 §11) : remplace-la par la formule de `docs/design/01-vision-et-format.md`
   si elle y existe, sinon signale-la.
4. **`WWS/CLAUDE.md`** (chargé dès qu'un agent lit un fichier de `WWS/`) : ne garde que le stable —
   les règles, les pièges, les conventions de la doc — et renvoie pour l'état à `INDEX.md` et
   `docs/ETAT-DU-CODE.md`. Le tableau « Où en est le projet » et la « Carte des fichiers » partent.
   Statut `validé`. Pas de réécriture des règles.
5. **Renvois vers l'index** : une ligne dans `## Où lire` du `CLAUDE.md` racine ; `docs/decisions.md`
   (retire la puce « `INDEX.md` n'existe pas encore ») ; le SKILL de fin de session.
6. **Liens** : `docs/adr/0020-…md` ~31 vise `0023-geographie-serveur-raster.md` → `…-en-raster.md`.
   Puis un script (scratchpad) liste tous les liens relatifs `](….md…)` de `WWS/` hors `done/` et
   `ready/outillage/`, et vérifie que la cible existe : zéro lien cassé à la fin (sauf
   `RESTE-A-CODER.md`, que menage-6 réécrit : liste ses liens cassés au rapport).
7. **SKILL de fin de session** (`docs/skills/wws-fin-session/SKILL.md`, passe « Le coffre suit ») :
   aligné sur la version réduite — la ligne `INDEX.md` de chaque note touchée (statut, phrase) ;
   l'en-tête YAML seulement pour ADR, fiches, propositions ; le registre `decisions.md`.
8. **Fin** : `organiser-le-coffre.md` passe `statut: livré`, « En bref » : « terminé le 04/10 en
   version réduite par menage-5 (voie menage-1c) ». `git rm` de `Claude outputs/coffre-temps-1.md`
   (consommé), de `ready/outillage/22-…` et `72-…` (repris ici) ; leurs lignes dans
   `ready/outillage/README.md` et tout renvoi vivant suivent.

## Ne pas faire

Aucun fond réécrit hors des points 3 et 4 ; aucune note déplacée ; aucun en-tête sur les contrats de
vue, rapports, notes techniques, prompts ; ne touche ni `docs/technique/a-mesurer.md` (comparé octet
à octet par `scripts/a-mesurer.test.mjs`) ni `docs/prompts/code/done/`.

## Acceptation

- Un script compare `find WWS -name '*.md'` (hors `.obsidian/`, `done/`, `ready/outillage/`) aux
  liens de `INDEX.md` : aucune note absente, aucun lien mort.
- `head -1` vaut `---` sur les 25 ADR + README, les fiches et les 23 propositions ; nulle part ailleurs de neuf.
- Le script de liens du point 6 : sortie et zéro lien cassé (hors `RESTE-A-CODER.md`).
- `grep -c "INDEX.md" WWS/README.md WWS/CLAUDE.md CLAUDE.md` : au moins 1 chacun ; `wc -m CLAUDE.md` ≤ 8 100.
- `npm run verifier` vert.
- Rapport au format de la série, avec le tableau des statuts **changés** par rapport au temps 1
  (note, statut du 02/10, statut retenu, preuve). Message proposé : « docs: INDEX du coffre, en-têtes
  des ADR, fiches et propositions, portes d'entrée sans état ».
