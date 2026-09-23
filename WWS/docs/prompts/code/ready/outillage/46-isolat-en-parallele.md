# 46-isolat-en-parallele — `mesure-isolat.mjs` pèse les 44 modules de `convex/` par paquets parallèles, avec les mêmes pesées, en ~4 s au lieu de ~23

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `scripts/mesure-isolat.mjs` en entier : `collecter` ~90-96, `sonderImport` ~129-142,
`phaseImports` ~144-190 (boucle séquentielle ~168-181), la table des étapes de `principal` ~226-251
(seules durées affichées : colonne `temps`, mesurée ~233-235, imprimée ~272), le `finally` ~310-311,
l'aiguillage enfant ~315-316 ; `WWS/docs/adr/0023-geographie-serveur-en-raster.md` ~121-126.

## Pourquoi

Le script, étape du vérifieur, prend 22,8 et 23,3 s réelles pour 6,2 et 6,8 s de CPU (deux passes
à la rédaction ; l'audit avait 22,6 et 23,3). La phase des imports lance un `node` enfant par
module de `convex/` (44 aujourd'hui), l'un après l'autre (~169). Chaque enfant appelle
`collecter()` deux fois (~136, ~140), soit 3 × (`gc()` + 60 ms) : 44 × 360 ms = 15,8 s de sommeil.
Or chaque enfant pèse **son propre** tas (`heapUsed` après moins avant) : rien n'oblige à les
attendre un par un.

Prototype à la rédaction, sur une copie hors du dépôt (Mac, `availableParallelism()` = 8) :

- pool de 8, pause inchangée : 4,35 à 4,45 s. L'écart par module à la moyenne séquentielle reste
  ≤ 0,33 % sur trois passes ; entre deux passes séquentielles, il est de 0,15 % ;
- pause à 0 ms : jusqu'à 6,8 % d'écart (`convex/surveys.ts` 6,17 Mio contre 5,78). La pause sert
  donc : `gc()` libère, puis la mémoire se rend dans des tâches (finaliseurs) qui passent par la
  boucle d'événements ;
- pause à 10 ms : ≤ 0,40 % sur deux passes, 1,55 s.

## Ce qui change

1. `phaseImports` : la boucle ~169-181 devient un pool local de taille `availableParallelism()`,
   importé de `node:os` avec `tmpdir` (~27). Une file partagée des `[rang, module]`, et `taille`
   ouvriers qui la vident, chacun avec le même `execFile` qu'aujourd'hui. Aucune dépendance. Le tri
   de ~182 reste après coup : la sortie ne dépend pas de l'ordre d'achèvement.
2. Un enfant en échec : attendre d'abord tous les ouvriers, car aucun enfant ne doit lire un
   atelier que le `finally` a supprimé. Échouer ensuite en nommant le ou les modules, avec la fin
   de leur stderr. Le code de sortie reste non nul, comme aujourd'hui.
3. Les durées restent fidèles. La seule colonne de temps (étapes, ~233-235) se mesure dans le
   parent **avant** la phase des imports, et elle y reste : aucun enfant ne tourne pendant qu'elle
   se mesure.
4. La pause devient un paramètre de `collecter`. Le parent garde 60 ms : il lit aussi
   `arrayBuffers`, que ce prompt ne mesure pas, et ses six appels coûtent ~1 s. L'enfant peut
   descendre à 10 ms, jamais en dessous, et seulement si cinq passes à 10 ms restent à ±1 % de la
   médiane séquentielle pour chacun des 44 modules ; sinon il garde 60 ms. Le commentaire de
   `collecter` (~90) donne le pourquoi mesuré : sans pause, jusqu'à 6,8 %.
5. Le commentaire de `sonderImport` (~129-134) gagne une phrase : les enfants tournent par paquets,
   chacun pèse son propre tas, et la pesée ne dépend pas des voisins.

## Ce que ce prompt ne fait pas

- `BUDGET_MIO`, l'espion, les étapes et le texte d'une passe réussie ne changent pas (47 lit sa
  ligne finale).
- Aucune option nouvelle au script : la comparaison des 44 pesées se fait sur des copies hors du
  dépôt. Le vérifieur n'est pas touché (13, 47).
- Pas de test vitest : importer le script le lance (~315-316), et sa sortie est elle-même le
  contrôle. L'acceptation se fait par passes comparées.

## Cas d'acceptation (tests d'abord)

`T=$(mktemp -d)`. Copies dans `T`, jamais dans le dépôt : `seq.mjs`, prise **avant** toute
modification, et `par.mjs`, la nouvelle version. Dans chacune, `racine` (~35) est écrite en dur
vers le dépôt, et une ligne après le tri (~182) écrit les pesées (`{ module: octets }`) dans le
fichier que nomme la variable `DUMP`. Sous WSL, sans `/usr/bin/time`, le `time` du shell.

1. Avant : trois passes `DUMP=$T/seq-N.json /usr/bin/time -p node --expose-gc $T/seq.mjs`, codes 0,
   durées notées : ce sont les durées « avant » du rapport.
2. Après : trois passes de `par.mjs` (`DUMP=$T/par-N.json`), codes 0. Un petit script de
   comparaison, dans `T`, vérifie que pour chacun des 44 modules la médiane parallèle est à ±5 % de
   la médiane séquentielle.
3. Même verdict : `node --expose-gc scripts/mesure-isolat.mjs` sort 0, imprime « 44 modules de
   convex/ sous le budget de 10 Mio à l'import » et la table des cinq étapes ; ses cinq plus lourds
   sont ceux du cas 1, à une permutation près entre deux modules à moins de 0,5 % l'un de l'autre
   (`objectives` et `plunder` sont à 0,33 %).
4. Si la pause de l'enfant descend : cinq passes de plus à 10 ms, chaque module à ±1 % de la
   médiane séquentielle.
5. Échec : `echec.mjs`, copie de `par.mjs` dont `sonderImport` lève une erreur pour `sonde-0.js`,
   sort non nul, nomme le module de rang 0, et aucun autre enfant n'imprime d'`ENOENT`.
6. Après : trois passes du script du dépôt (`/usr/bin/time -p`), à comparer au cas 1.
7. `git status --short` ne montre que `scripts/mesure-isolat.mjs`.

## Vérifications

- Les passes des cas 1 à 6, et `npm run verifier` vert.

## Rapport attendu

Format commun (README de la série), plus : les durées avant et après (réel et user, trois passes
chacune) ; `availableParallelism()` de la machine ; le pire écart par module et le module qui le
porte ; la pause retenue pour l'enfant, avec les chiffres qui la justifient. La durée en CI se
lira au prochain journal : le runner n'a pas été mesuré.
