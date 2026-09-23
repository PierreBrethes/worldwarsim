# 30-reste-a-coder-en-file — RESTE-A-CODER.md redevient une file : une ligne par item, des numéros qui ne bougent plus, aucun récit, aucun statut faux

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 27, 29.

**À lire :** `WWS/docs/RESTE-A-CODER.md` en entier ; `WWS/QUESTIONS.md` ~22 et ~120-128 (Registres 24,
28, 31, « D5 acquise ») ; l'en-tête de `WWS/docs/rapports/2026-09-09-pillage-s2-s8.md` et
`WWS/docs/rapports/2026-09-15-retours-discord.md` ; l'en-tête et ~87 de
`WWS/docs/design/propositions/vision-v1-expeditions.md` ; `WWS/docs/HANDOFF.md` (29).

## Pourquoi

28 159 caractères (~8 k tokens) qui mêlent la file, l'historique des lots S1-S9 (~32-108), un retour
de partie et un correctif local du 08/09 (~110-141), les retours Discord (~287-308) et des statuts
faux : « Non commité » (~299) pour l'élévation d'avant-poste que 6a3bb8c a commitée le 16/09 ; C3
qui « attend le wipe » (~147-151, ~170) quand la bascule est livrée et le wipe fait le 11/09
(1adb0f3) ; « prêt » devant des prompts livrés (~255, ~265, ~268) ; les items 9 et 10 « terminés
localement » quand 739a2eb les a passés en done/ le 10/09 (« 22 / 29 », ~262, est corrigé par 23).
Les numéros servent pourtant d'ancres : « Registre 27 » dans `convex/outposts.ts` ~137,
`convex/dismantle.test.ts` ~135, `src/domain/compass-rose.ts` ~994 et son test ~170,
`src/i18n/fr.ts` ~2195 ; 24, 28 et 31 dans QUESTIONS.md ; 29 et « 29-30 » dans les ADR 0014 ~92 et
0018 ~90 et `convex/constants.ts` ~602. Élaguer sans règle les tuerait sans bruit. Et une liste
numérotée markdown se renumérote au rendu : « 28. 29. 31. 30. » s'affiche 28, 29, 30, 31.

## Ce qui change

1. **En-tête**, dix lignes au plus : « Tenu par Cowork » conservé ; la règle — un item est une puce
   `- **N.** titre — statut — renvoi` (du gras, pas une liste numérotée : le numéro survit au rendu) ;
   « Registre N » désigne l'item N ; un numéro ne se renumérote ni ne se réemploie (1 à 5 compris) ;
   un item livré passe dans « Livré » en `- ~~**N.** titre~~ — livré <hash>` ; « Prochain numéro
   libre : N » ; la file ne raconte rien. Des renvois d'une ligne : `WWS/QUESTIONS.md`,
   `WWS/docs/technique/a-mesurer.md` (les valeurs `@a-mesurer`), la direction V1 (sa proposition ; un
   point V1 ne devient un item qu'avec un brief à rédiger), `WWS/docs/technique/point-projet-2026-09-08.md`.
   Le fichier entier tient en 90 lignes et 12 000 caractères.
2. **Statuts**, liste fermée : « à rédiger », « prêt » (prompt dans ready/), « plus tard » (prompt
   dans plus-tard/), « ADR à écrire », « attend une décision » (avec son renvoi QUESTIONS),
   « évoqué », « à Pierre » (hors code). **Renvoi** : le prompt par son chemin sous `prompts/code/`,
   l'ADR et son §, ou la proposition.
3. **Sections**, dans cet ordre : « Bloquant pour la partie de contrôle », « La file » (dans l'ordre
   où ça se donne), « ADR à écrire avant le code », « Évoqué, au Registre — pas tranché », « Livré »
   (par numéro croissant). Dans une section, l'ordre actuel.
4. **Numéros** : 6 à 31, 11bis et ceux que 29 a ajoutés gardent le leur ; les « 1. 2. 3. » de
   « Bloquant » sont une liste locale, pas des numéros. Un item ouvert sans numéro (restauration SQLite,
   contrôle à l'œil, frappe de bâtiment 78a, test e2e de fumée, relais de niveau 1…) prend, dans l'ordre
   du fichier, le numéro qui suit le plus grand (jamais 1 à 5). Un item livré sans numéro n'en
   prend pas : il disparaît, done/ et git log le gardent. Doublons : « Rose des vents sur les
   avant-postes » (~266) est l'item 27 ; le nom 1940 de la frappe terminale (~315) rejoint l'item 19.
5. **Livrés** : chaque item numéroté livré porte le hash de
   `git log --diff-filter=AR -- 'WWS/docs/prompts/code/done/<slug>.md'` quand il a un prompt (6 →
   1069f99, 9 et 10 → 739a2eb, 27 → 2e2da13), sinon celui que `git log -S '<identifiant>'` désigne ;
   « hash introuvable » plutôt qu'un hash deviné. Chaque « livré » se vérifie contre done/ et le code,
   pas contre le texte actuel ; un statut incertain devient « attend une décision » et va au rapport.
6. **Récits** — S1-S9 et les décisions D1-D6 (~32-108), le retour de partie et le correctif du 08/09
   (~110-141), « Livrés et commités les 04-06/09 » (~153-156), les retours Discord (~287-308),
   « Questions ouvertes » (~310-320). Pour chaque paragraphe, `git grep -F` d'une phrase
   caractéristique : déjà dans rapports/, une proposition ou un ADR, il est supprimé ; sinon il est
   déplacé **tel quel** dans `WWS/docs/rapports/AAAA-MM-JJ-<sujet>.md`, daté du jour du récit — D1-D6
   à la suite de `2026-09-09-pillage-s2-s8.md`, dont l'en-tête annonce déjà cette sortie. Une question
   encore ouverte va dans QUESTIONS.md. « D5 acquise » (QUESTIONS.md ~120) doit toujours se résoudre.
7. `WWS/docs/HANDOFF.md` : ses renvois vers un item sans numéro prennent le numéro attribué.

## Ce que ce prompt ne fait pas

- Aucune décision de jeu, aucune priorité nouvelle, aucun relitige d'ADR.
- Aucun contrôle automatique des statuts ni des « Registre N » : c'est le doc-lint (31 à 33).
- Aucun code, aucun fichier de done/ ; un rapport existant est complété à la suite, jamais réécrit.

## Cas d'acceptation

1. `for n in $(git grep -h -o -E 'Registre [0-9]+(-[0-9]+)?' -- ':!WWS/docs/prompts/code/done/' | grep -o -E '[0-9]+' | sort -un); do grep -q -E "^- (~~)?\*\*$n\.\*\*" WWS/docs/RESTE-A-CODER.md || echo "Registre $n introuvable"; done`
   ne rend rien ; « 28-30 du Registre » (`git grep -n 'du Registre'`) se vérifie à la main.
2. `grep -o -E '^- (~~)?\*\*[0-9]+(bis)?\.' WWS/docs/RESTE-A-CODER.md | grep -o -E '[0-9]+(bis)?' | sort | uniq -d`
   ne rend rien, et la liste contient 6 à 31 et 11bis.
3. `awk '/^## /{s=1; next} s && NF && !/^- (~~)?\*\*[0-9]+(bis)?\.\*\*/' WWS/docs/RESTE-A-CODER.md`
   ne rend rien : sous l'en-tête, une ligne par item.
4. `grep -n -E 'Non commité|22 / 29|attend le wipe' WWS/docs/RESTE-A-CODER.md` ne rend rien ; chaque
   `prompts/code/…` cité existe sous `WWS/docs/` ; `wc -l` ≤ 90 et `wc -m` ≤ 12 000.
5. Chaque lien markdown relatif du fichier, et de chaque rapport créé ou complété, résout depuis
   son dossier ; `grep -nw D5 WWS/docs/rapports/*.md` rend le paragraphe « D5 est acceptée pour la V1 ».
6. `git status --short` : rien de neuf hors RESTE-A-CODER.md, rapports/, `WWS/docs/HANDOFF.md`, QUESTIONS.md.

## Vérifications

Doc seule : les cas 1 à 6, sans `npm run verifier`.

## Rapport attendu

Format commun (README de la série), plus : le tableau ancien → nouveau (numéro, titre, statut avant,
statut après, preuve) ; le sort de chaque récit (supprimé : où il existait ; déplacé : vers quel rapport) ;
les numéros attribués ; la taille avant (28 159 caractères) et après ; les « attend une décision ».
