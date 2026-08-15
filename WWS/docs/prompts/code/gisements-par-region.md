# Prompt Claude Code — gisements par région (économie v2, ADR 0015)

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, puis `WWS/CONTEXT.md` pour le
vocabulaire imposé, `WWS/docs/adr/0015-economie-v2-ressources-localisees.md` et
`WWS/docs/adr/0016-code-anglais-jeu-francais.md`, avant d'écrire quoi que ce soit.
Ne commit pas, ne push pas.

**Ce prompt passe avant la refonte du schéma** (`schema-economie-et-troupes.md`) :
le schéma a besoin des identifiants de région que ce travail introduit.

**Identifiants en anglais, libellés en français** (ADR 0016). Toute clé introduite ici est
un identifiant anglais ; tout texte que le joueur pourrait lire passe par `src/i18n/fr.ts`.

**Prérequis matériel.** Régénérer `regions.json` demande le geojson admin-1 de Natural
Earth 10m (`ne_10m_admin_1_states_provinces.geojson`, dossier `geojson/` de
github.com/nvkelso/natural-earth-vector), qui n'est pas dans le dépôt et se passe en
argument au script. **Vérifie qu'il est là avant de commencer** ; s'il manque, dis-le et
arrête-toi — ne fabrique pas de données de substitution.

## Contexte

L'économie v2 place des gisements — nourriture, tissus, charbon, pétrole, minerais —
sur des régions admin-1. Or `regions.json` ne porte aujourd'hui que des **noms** (`n`), et
les noms admin-1 se répètent d'un pays à l'autre (« Distrito Federal » existe au Mexique,
au Brésil, au Venezuela…). Il faut d'abord un identifiant stable, puis une distribution
**réaliste corrigée** : le monde réel d'abord, une passe manuelle ensuite pour que chaque
nation jouable ait un manque volontaire mais jamais deux.

Les fichiers cuits ne se retouchent **jamais à la main** — règle du dépôt.

## Étape 0 — rangement, dans un commit séparé

La passe d'anglicisation (ADR 0016) a laissé `scripts/` et `public/` en français, alors que
tout `src/` et `convex/` y sont passés. Comme ce travail touche déjà ces fichiers, commence
par les renommer, **dans un commit de rangement distinct** (CONVENTIONS §4 — ranger et
changer le comportement ne se mélangent pas) :

| avant | après |
|---|---|
| `scripts/generer-monde.mjs` | `scripts/generate-world.mjs` |
| `scripts/generer-regions.mjs` | `scripts/generate-regions.mjs` |
| `public/monde.json` | `public/world.json` |
| `public/curseurs/` | `public/cursors/` |
| `public/pictos/` | `public/pictograms/` |

`public/regions.json` garde son nom. Mets à jour tous les lecteurs — `src/map/`, les
styles de curseurs, les masques de pictogrammes — et vérifie que `npm run build` passe
avant de passer à la suite. Si un renommage casse quelque chose que tu ne sais pas réparer
en deux lignes, **arrête-toi et signale-le** plutôt que de le contourner.

## Implémentation

1. **Identifiant stable dans `regions.json`.** Étends `scripts/generate-regions.mjs` pour
   émettre, par région : `id` (le `adm1_code` Natural Earth ; c'est le seul champ unique du
   jeu 10m — repli sur `iso_3166_2`, puis sur la paire `adm0_a3` + nom si absent, en
   signalant les replis en console) et `country` (`adm0_a3`). Adapte les lecteurs de
   `regions.json`
   (survol, accessoires de terrain) sans changer leur comportement.

2. **`scripts/generate-deposits.mjs`**, hors ligne, déterministe (graine fixée en constante
   — pas de `Math.random()` sans graine), sortie `public/deposits.json` : un objet **creux**
   `id de région → clé de gisement` parmi `food | textile | coal | oil | ore`. Une région
   sans gisement n'y figure pas. Une région a **au plus un** gisement.

   Ajoute le type `DepositKey` à `src/domain/ids.ts`, à côté de `ResourceKey` — c'est là que
   vit le vocabulaire d'identifiants du jeu — et les libellés français correspondants dans
   `src/i18n/fr.ts` (« nourriture », « tissus », « charbon », « pétrole », « minerais »).

3. **Amorce réelle, en deux régimes.**
   - **`coal`, `oil`, `ore` : uniquement par table curatée** — un champ pétrolifère ne se
     devine pas à la latitude. Écris dans le script une table des grands gisements
     historiques vers 1940, identifiés par `adm1_code` (aide-toi des noms pour la
     constituer, mais la clé stockée est le code). Ordres de grandeur : charbon — Ruhr,
     Silésie, Donbass, Appalaches, Pas-de-Calais, Midlands, Shanxi, Kyūshū ; pétrole —
     Texas, Oklahoma, Californie, Bakou, Ploiești, Moyen-Orient, Indes néerlandaises,
     Venezuela ; minerais — Lorraine, Kiruna, Oural, Grands Lacs, Mandchourie,
     Australie-Occidentale. Complète aux ordres de 15–25 régions par ressource sur le monde
     entier, pas plus.
   - **`food` et `textile` : procéduraux plafonnés.** Bandes de latitude tempérées et
     grandes plaines pour la nourriture ; coton et soie (sud des États-Unis, Égypte, Inde,
     vallée du Yangzi, Japon) plus quelques zones lainières pour les tissus. Plafonne :
     jamais plus d'un quart des régions d'un pays porteur, avec un espacement minimal — un
     gisement doit se mériter, pas tapisser.

4. **Passe de correction par nation jouable.** Une table `CORRECTIONS` explicite (ajouts et
   retraits par `adm1_code`, chacun commenté d'un *pourquoi*) garantit la règle de l'ADR
   0015 : chaque nation jouable (les huit de `NATIONS` dans `src/domain/ids.ts`) a, sur son
   territoire, au moins un gisement de **quatre des cinq** ressources de carte. Le manque
   restant est le manque *volontaire* — pour `france`, le pétrole : c'est l'exemple
   canonique, ne le « corrige » pas.

5. **Audit imprimé, garde-fou exécutable.** Le script termine en imprimant, par nation
   jouable, le compte de gisements par ressource à domicile, et **échoue** (code de sortie
   non nul) si une nation a deux ressources absentes ou si un identifiant de la table
   curatée ou des corrections ne correspond à aucune région.

## Critères d'acceptation

- Le commit de rangement est séparé, et `npm run build` passe après lui seul.
- `regions.json` régénéré porte un `id` unique pour toutes les régions (zéro doublon,
  vérifié par le script).
- `deposits.json` est creux, une ressource au plus par région, généré deux fois de suite à
  l'identique.
- L'audit affiche 8 nations × 5 ressources ; aucune nation n'a deux zéros ; `france` a zéro
  pétrole.
- Aucune règle du client ne lit `RegionType` pour décider d'un gisement à l'exécution :
  tout se joue hors ligne, dans le script.
- Aucune chaîne française en dur hors de `src/i18n/fr.ts`.
- Aucun terme banni dans le code ni les commentaires.

## Ce que tu ne fais pas

Tu n'affiches pas les gisements sur la carte (rendu, étiquettes, survol enrichi : surface à
part). Tu ne touches pas au schéma Convex ni aux constantes d'équilibrage — c'est le prompt
suivant. Tu ne chiffres pas les débits d'exploitation.
