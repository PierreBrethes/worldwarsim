# Prompts Claude Design des modèles 3D

Un prompt autonome par modèle, à coller tel quel dans une conversation Claude Design. Il dit le
repère (1 unité = 1 m, y en haut, avant vers +z, gauche = +x), les mesures à l'échelle de l'homme,
chaque pièce mobile avec son pivot, les repères `fx_*`, les matériaux, le budget et la liste de
contrôle. Écrits le 24/10/2026 d'après `../prompt-claude-design.md`.

## Le parcours d'un modèle

1. Ouvrir une conversation Claude Design, coller le prompt. Pour une figurine, remplir la ligne
   « Nation de cette conversation » ; une conversation par rôle et par nation.
2. Joindre la planche : `src/emblems/buildings/<clé>.webp` (le centre de recherche :
   `researchCenter.svg`), `src/emblems/units/<nation>/<rôle>.webp`. Rien à joindre pour la
   piste, le môle et la manche à air.
3. Exporter le GLB depuis la page, puis, si la texture n'est pas déjà en WebP, hors du dépôt :
   `npx @gltf-transform/cli webp in.glb out.glb --quality 90` (ni meshopt ni quantification).
4. Vérifier avec la commande de la ligne (depuis la racine du dépôt). Code de sortie 1 au moindre
   ÉCHEC ; « à voir » se juge à l'œil.
5. Déposer : `src/emblems/buildings/<clé>.glb`, `src/emblems/figurines/<nation>/<rôle>.glb` ;
   les kits de terrain dans `src/emblems/kits/` (dossier à créer avec le lot qui les branche).

`node WWS/prototypes/glb/prompts/verifier-glb.mjs --coherence` vérifie que chaque nom attendu par
le script figure dans son prompt (à relancer après toute retouche d'un prompt ou du script).

## Dans l'ordre de génération

D'abord ce que demandent les animations du socle (caserne, aérodrome, port, camion), puis le
reste dans l'ordre des lots qui s'en servent.

| # | Modèle | Prompt | Vérifier |
|---|---|---|---|
| 1 | Caserne | [barracks.md](barracks.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs barracks.glb barracks` |
| 2 | Hangar d'aérodrome | [airfield.md](airfield.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs airfield.glb airfield` |
| 3 | Piste (kit : bout, seuil, tronçon) | [piste.md](piste.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs piste.glb piste` |
| 4 | Môle (kit : tronçon, musoir) | [mole.md](mole.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs mole.glb mole` |
| 5 | Chantier naval | [port.md](port.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs port.glb port` |
| 6 | Camion (×8 nations) | [landTransport.md](landTransport.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs landTransport.glb landTransport --nation <nation>` |
| 7 | Manche à air | [manche.md](manche.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs manche.glb manche` |
| 8 | Chasseur (×8) | [fighter.md](fighter.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs fighter.glb fighter --nation <nation>` |
| 9 | Bombardier (×8) | [bomber.md](bomber.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs bomber.glb bomber --nation <nation>` |
| 10 | Avion de transport (×8) | [airTransport.md](airTransport.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs airTransport.glb airTransport --nation <nation>` |
| 11 | Cargo (×8) | [cargo.md](cargo.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs cargo.glb cargo --nation <nation>` |
| 12 | Escorte (×8) | [escort.md](escort.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs escort.glb escort --nation <nation>` |
| 13 | Porte-avions (×8) | [carrier.md](carrier.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs carrier.glb carrier --nation <nation>` |
| 14 | Entrepôt | [warehouse.md](warehouse.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs warehouse.glb warehouse` |
| 15 | Fantassin (×8) | [infantry-1.md](infantry-1.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs infantry-1.glb infantry-1 --nation <nation>` |
| 16 | Fantassin d'appui (×8) | [infantry-2.md](infantry-2.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs infantry-2.glb infantry-2 --nation <nation>` |
| 17 | Char léger (×8) | [armor-1.md](armor-1.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs armor-1.glb armor-1 --nation <nation>` |
| 18 | Char moyen ou lourd (×8) | [armor-2.md](armor-2.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs armor-2.glb armor-2 --nation <nation>` |
| 19 | Artillerie (×8) | [artillery.md](artillery.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs artillery.glb artillery --nation <nation>` |
| 20 | Quartier général | [hq.md](hq.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs hq.glb hq` |
| 21 | Arsenal | [arsenal.md](arsenal.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs arsenal.glb arsenal` |
| 22 | Ferme | [farm.md](farm.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs farm.glb farm` |
| 23 | Mine de fer | [mine.md](mine.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs mine.glb mine` |
| 24 | Mine de charbon | [coalMine.md](coalMine.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs coalMine.glb coalMine` |
| 25 | Puits de pétrole | [oilWell.md](oilWell.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs oilWell.glb oilWell` |
| 26 | Centre de recherche | [researchCenter.md](researchCenter.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs researchCenter.glb researchCenter` |
| 27 | Station d'écoute | [listening.md](listening.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs listening.glb listening` |
| 28 | Ville (Blitz) | [city.md](city.md) | `node WWS/prototypes/glb/prompts/verifier-glb.mjs city.glb city` |

Treize bâtiments, douze rôles de figurines (96 conversations) et trois kits de terrain. Le dépôt
historique (`depot`) prend le modèle de l'entrepôt.

## Ce que le script vérifie

Les noms attendus ; les anciens noms retirés ; les repères `fx_*` vides et uniques ; le pivot de
chaque pièce mobile, lu sur la boîte de sa propre géométrie (au gond, au moyeu, au pied, aux
tourillons…) ; la mesure en mètres (sur `murs` pour la caserne et l'entrepôt, sur `hull` pour un
char, par nation pour les figurines) ; rien sous y = 0 hors exception (coque sous sa flottaison,
avant-cale, parements du môle) ; les triangles ; les matériaux `vitres`, `feux`, `phares` ; une
seule texture de 1 024 px au plus, en WebP ; ni meshopt, ni quantification, ni lumière, ni caméra.

## Conventions communes aux prompts

- Bâtiments et terrain nomment en français (`porte_gauche`, `hampe`, `molette_1`), figurines en
  anglais (`gear_left`, `tailgate`, `hatch`). `fond_sombre` et les repères de la fiche
  (`fx_poussiere`, `fx_sillage`, `fx_parachute`, `fx_amarre_*`) gardent leur nom partout.
- Les cheminées gardent `fx_smoke` (que `maquettes.ts` lit déjà) plutôt que `fx_cheminee`.
- Les chenilles gardent `tracks_left` / `tracks_right` et les roues de camion `roue_left_N` :
  les noms des modèles actuels.
- Chaque bâtiment porte une hampe de 8 à 12 m et un drapeau neutre de 3 × 2 m que le jeu peint.

## Décisions de Pierre (25/10)

- Train d'atterrissage en anglais (`gear_left`, `gear_right`, `tailwheel`), et non les noms de #269.
- Les prompts suivent le modèle et la planche (URSS : canon USV de 76 mm ; Italie : 75/27) ; les
  étiquettes de `src/emblems/units/equipment.ts` se corrigent quand les GLB sont branchés.
- La jonque chinoise à sa taille réelle, ≈ 55 m.
- La grue du port à flèche relevable de 45 m.
- L'avion de transport n'emporte que l'infanterie (#284) : porte latérale et trappe, sans rampe.

## Hors de ces prompts

- **La caisse et la bâche** : la matrice des interactions les range au moteur (éléments
  réutilisables) ; le camion a seulement sa bâche optionnelle `tarp`.
- **Les objectifs neutres** (`src/emblems/objectives/`) et **l'avant-poste** (dessiné par le
  moteur) : hors des deux manifestes, pas de prompt.
