# 22-docs-wws-a-jour — `WWS/CLAUDE.md` ne porte plus que le stable et renvoie à la racine pour l'état ; `WWS/README.md` et `architecture.md` ne disent plus que rien n'est engagé

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `WWS/CLAUDE.md` (entier), `WWS/README.md` (~3-6, ~17-19, ~40-55),
`WWS/docs/technique/architecture.md` (entier), `WWS/QUESTIONS.md` (~1-17 : décision 3a, rapport
« périmé »), `WWS/docs/adr/README.md`, `WWS/simulation/README.md`, `WWS/docs/design/06-nations.md` (~3-4).

## Pourquoi

`WWS/CLAUDE.md`, figé au 06/09 (aa2ae63), se charge dès qu'un agent lit un fichier sous `WWS/`, donc
à chaque prompt de cette série. Il affirme « naval, aérien, agent, pillage : rien » (~36) : le
pillage se joue depuis le 10/09 et `routeModeOf` route en `naval`, `air`, `combined`
(`convex/movements.ts` ~449). « Production … annulation remboursée » (~33) : la fenêtre est morte le
01/09 (cc18236), seul un lot non commencé est remboursé (`cancel`, `convex/troops.ts` ~190).
« Cinq nations à générer » (~34) : les huit de `NATIONS` sont dans `SPRITES_BY_NATION` (fd65d52).
« 11 fiches » (~26, ~110) pour douze, « 8 décisions » (~111) pour vingt-quatre ADR. « Le schéma de
jeu … ne s'écrit qu'après … le dernier 🔴 » (~39-43) et « Ensuite seulement : le schéma » (~175),
quand `QUESTIONS.md` ~4-5 (3a, 16/09) dit qu'un 🔴 ne bloque que ce qu'il nomme. « Ce que la
simulation a prouvé » (~87-98) : `QUESTIONS.md` ~11 déclare ce rapport périmé. `unites`/`recrutements`
(~45, ~80) sont les noms de l'ADR 0011 (le schéma a `troops`/`recruitments`) ; la ligne 0008 (~79)
ignore l'ADR 0024. `WWS/README.md` ~6 et ~55, `architecture.md` ~3 (« Rien n'est engagé côté
backend ») et ~11-12 (« react-three-fiber » ; le moteur est impératif) disent le même passé, relevé
dès le 08/09 (`WWS/docs/technique/point-projet-2026-09-08.md` ~101).

## Ce qui change

1. `WWS/CLAUDE.md`, sections dans cet ordre :
   - Introduction (~3-4) : ce qui ne bouge pas (projet, règles, verrous, conventions, pièges) et où
     lire le reste ; l'état du code vit dans le CLAUDE.md racine (lien `../CLAUDE.md`).
   - `## Le projet` : tel quel, sauf ~17 « backend Convex visé » → « backend Convex auto-hébergé sur
     un VPS personnel (ADR 0010) ». `## Les trois règles qui gouvernent tout` : inchangée.
   - `## Décisions verrouillées — ne pas relitiger sans lire l'ADR` : le tableau (~70-80) cède la
     place à deux phrases qui renvoient à l'index (lien `docs/adr/README.md` : statut et révisions ;
     lire la dernière avant de relitiger). « Deux idées gardées en réserve » : l'option B du combat,
     et la troupe signature de la fiche 06 (15/08, non codée) au lieu de l'unité spéciale par nation.
   - `## Carte des fichiers` : une ligne par entrée présente (`ls WWS WWS/docs`), **aucun décompte** ;
     `docs/design/` nomme 11 = brief UI, `contrats-de-vue/`, `propositions/`, `recherches/` ;
     `docs/adr/` son index ; `docs/RESTE-A-CODER.md` la file ; `simulation/` l'instrument d'ouverture
     et l'état de référence. Pas de `docs/_to_delete/` (29).
   - `## Conventions` : inchangée, phrase du vocabulaire (~121-123) comprise (40 en fait un renvoi).
   - `## Pièges connus` : inchangée, sauf « cinq mécaniques ont besoin d'une exécution datée »
     (~143-144), sans nombre : arrivée d'un mouvement, fin d'un chantier, édition de la presse
     (`ctx.scheduler.runAt` et `runAfter` dans `convex/` ; la presse passe par `runAfter`).
   - `## Où lire l'état` remplace « Où en est le projet » et l'encadré « Entorse assumée » (~22-50),
     « Ce que la simulation a prouvé », « Décalages connus » et « Prochaine étape » : quatre renvois
     d'une ligne, sans résumé — CLAUDE.md racine (le code), `QUESTIONS.md` (le non-tranché, dont le
     🔴), `docs/RESTE-A-CODER.md` (la file), `simulation/README.md` (ce qui mesure encore ; le rapport
     d'août est périmé).
2. `WWS/README.md` : ~6 devient un renvoi d'une ligne (le jeu tourne sur Convex en saisons réelles ;
   l'état au CLAUDE.md racine, la file, le non-tranché) ; ~19, le lien du rapport dit « (août,
   périmé) » ; ~47, `simulation/` comme la carte ci-dessus ; `## Stack visée` (~52-55) devient
   `## Stack` : React + three.js (moteur impératif), Convex auto-hébergé sur VPS (ADR 0010), en service.
3. `architecture.md` : ~3-5 remplacé par un bandeau « ⚠️ **Périmé (JJ/MM/AAAA, date du jour) :
   écrit le 11/08, avant la première ligne de serveur.** », puis : backend en service (ADR 0010,
   0011), architecture réelle au CLAUDE.md racine (§ Architecture) et dans les ADR 0012 et 0023 ;
   restent justes l'accumulation paresseuse, « un job planifié par événement » et les trois points
   chauds ; la liste des mécaniques datées et l'ordre de construction sont du passé. Tableau ~11-12 :
   « three.js, moteur impératif sans react-three-fiber » (une frontière, `src/map/WorldMap.tsx`) et
   « React + Vite + TanStack Router ».

## Ce que ce prompt ne fait pas

Ni le CLAUDE.md racine (21, 24 à 26), ni l'index des ADR, la fiche 11, `CONTEXT.md`, la fiche 08 ou
le rapport de simulation (23), ni le vocabulaire (40), ni `RESTE-A-CODER.md` (23, 30). L'ADR 0011
(~11, ~53) cite la règle à sa date : elle reste. Aucun renvoi vers `WWS/docs/ETAT-DU-CODE.md` (24, 25).

## Cas d'acceptation (tests d'abord)

Doc seule : chaque cas est une commande, lancée d'abord **avant** toute édition (chiffre de départ).

1. `git grep -nE "pillage : rien|annulation remboursée|cinq nations à générer|8 décisions|11 fiches|Ensuite seulement|pas écrit, délibérément|Rien n'est engagé côté backend|react-three-fiber\)|R3F s'y intègre|Ce que la simulation a prouvé|Convex visé|Où en est le projet|unites|recrutements|ne s'écrit qu'après" -- WWS/CLAUDE.md WWS/README.md WWS/docs/technique/architecture.md` : 18 lignes avant, aucune après.
2. `grep -nE "\b[0-9]+ (fiches|décisions|ADR|nations)\b" WWS/CLAUDE.md` : rien (3 lignes avant).
3. `grep '^## ' WWS/CLAUDE.md`, dans l'ordre : Le projet, Les trois règles…, Décisions verrouillées…, Carte des fichiers, Conventions, Pièges connus, Où lire l'état.
4. `git diff WWS/CLAUDE.md | grep -E '^[-+].*(Sont bannis|Les bonus cassent une règle|Toute proposition se teste)'` : rien.
5. Liens relatifs : `for f in WWS/CLAUDE.md WWS/README.md WWS/docs/technique/architecture.md; do d=$(dirname "$f"); grep -oE '\]\([^)#]+' "$f" | sed 's/^](//' | grep -v '^http' | while read -r p; do [ -e "$d/$p" ] || echo "$f → $p"; done; done` : rien.
6. `git diff --stat` ne nomme que ces trois fichiers.

## Vérifications

Les cas 1 à 6. Pas de `npm run verifier` : `.prettierignore` exclut `WWS` et `*.md`, nul test ne les lit.

## Rapport attendu

Format commun (README de la série), plus : `wc -l WWS/CLAUDE.md` avant et après ; la nouvelle ligne
de la phrase du vocabulaire (40 la cherche à ~121-123) ; les phrases réécrites des « Pièges connus »
et de « Deux idées gardées en réserve », mot pour mot ; toute autre affirmation périmée croisée dans
ces trois fichiers (« saison de 48 h à 7 jours » contre l'horloge optionnelle de l'ADR 0017 ; le
« pouvoir qui casse une règle » de `WWS/README.md` ~4, aucun atout codé), laissée, avec sa preuve.
