# Classification des régions — le vrai type de terrain (proposition, 12/10/2026)

**Statut : livré, 13/10/2026.** Classificateur réglé sur les six témoins
(`scripts/region-terrain.mjs`, testé) et cuit dans **`public/region-types.json`**, asset à part
(décision de Pierre) : `regions.json` ne porte pas le type. Le premier passage a demandé trois
retouches de la règle, marquées *(phase 2)* ci-dessous. **Décor pur** — aucune règle de jeu ne lit
le type (fiche 08 figée, ADR obligatoire le jour où ce serait le cas).

**À savoir.** ERDDAP a **décimé** ETOPO (un point tous les 6′, non moyenné) : l'altitude sous-estime
les sommets (le Mont Blanc se lit 2 309 m). Les seuils ont été réglés sur ces données-là ; changer
de source de relief oblige à les régler de nouveau.

## Ce qui existe

`regionType(name)` (`src/domain/world.ts`) rend six témoins classés à la main et un hachage du nom
pour toutes les autres (4 600 régions en tout). Le type **n'est pas dans `regions.json`** : il est calculé au client,
au survol (`src/map/engine/regions.ts`, teinte et accessoires). Une région, dans l'actif, c'est
`{ id, country, n, p }` — `p` des anneaux en coordonnées du plan (Natural Earth 1, cadre 400 × 208),
arrondis au centième.

## Les trois sources

Toutes sans compte, toutes sous licence qui permet de cuire un dérivé dans un actif public.
Aucune n'a besoin d'une bibliothèque : deux se lisent en texte ou en en-tête binaire simple, la
troisième est un TIFF LZW qu'on décode à la main comme on lit déjà le shapefile du BKG.

| | Relief | Climat | Couverture du sol |
|---|---|---|---|
| Jeu | NOAA NCEI **ETOPO 2022** 60″, surface de glace | **Beck et al. 2023**, Köppen-Geiger V2, 1991–2020 | **Hansen 2000**, part de forêt agrégée à 0,25° (Wallace et al.) |
| Pas retenu | 0,1° (une valeur sur six de la grille 60″) | 0,1° | 0,25° |
| Format | ESRI ASCII Grid (texte), deux moitiés | GeoTIFF uint8, LZW, tuiles 256², 3600 × 1800 | netCDF-3 64 bits (`CDF\x02`), `band_data[lat=720][lon=1440]` en float64 |
| Poids | ≈ 32 Mo × 2 (mesuré : 17,5 Ko par ligne de 1 800 valeurs) | 186 Ko (membre du zip) — ou 130 Mo le zip entier | 8,3 Mo |
| Licence | domaine public fédéral US, « may be used and redistributed for free » ; citation demandée | **CC BY 4.0** | **CC BY 4.0** (le jeu Hansen d'origine aussi) |
| Attribution | NOAA NCEI (2022), *ETOPO 2022 Global Relief Model*, doi:10.25921/fd45-gt74 | Beck, H. E. et al., *High-resolution (1 km) Köppen-Geiger maps for 1901–2099…*, Scientific Data 10, 724 (2023) | Hansen, M. C. et al., Science 342, 850 (2013) — Hansen/UMD/Google/USGS/NASA ; agrégat : Wallace et al., doi:10.5281/zenodo.16930105 |

**Pourquoi pas les autres.** MODIS MCD12C1 demande un compte Earthdata et se lit en HDF4 ; NASA
NEO, qui en servait un CSV à 0,1°, est fermé depuis septembre 2026 ; ESA CCI Land Cover passe par
le Climate Data Store (compte) ou pèse des gigaoctets à 300 m ; la couverture arborée 2014 de
Zenodo est en CC BY-SA, qui contaminerait l'actif ; la climatologie MODIS de Zenodo (11 Mo) est en
netCDF-4/HDF5, illisible sans bibliothèque. ETOPO est servi par ERDDAP, qui sous-échantillonne au
serveur : on ne descend jamais les 450 Mo de la grille 60″.

**Pourquoi un relief à 0,1° suffit.** Le seuil se mesure à l'échelle d'une région admin-1, pas
d'une pente : une fenêtre de 3 × 3 valeurs (≈ 33 km) dit s'il y a une vallée et un sommet, et Oise
compte déjà une soixantaine de valeurs. Les valeurs sont des **échantillons** de la grille 60″,
pas des moyennes : le dénivelé s'en trouve plutôt sous-estimé, ce qui va dans le sens prudent.

## La règle

Elle se calcule en deux temps : chaque **échantillon** de la grille 0,1° reçoit des faits, puis la
**région** tranche sur leurs parts, pondérées par l'aire (`cos(lat)`). Un échantillon n'est retenu
que s'il est terre au sens de Köppen (valeur ≠ 0).

Faits d'un échantillon :

- **montagneux** si le dénivelé local (max − min d'ETOPO sur sa fenêtre 3 × 3) atteint **600 m**,
  ou **300 m** au-dessus de **1 500 m** d'altitude. L'altitude seule ne suffit jamais : la calotte
  du Groenland culmine à 3 200 m et elle est plate — elle sera toundra (EF), pas montagne.
  *(Phase 2)* **La mer compte zéro** dans la fenêtre : ETOPO est bathymétrique au large, et sans ce
  plancher chaque côte abrupte — Chili, Norvège — lirait un kilomètre de dénivelé ;
- **climat** : aride (BWh, BWk — codes 4, 5), **froid**, tropical (Af, Am, Aw — 1 à 3), ou autre.
  La steppe (BS) est « autre » : c'est une plaine sèche, pas un désert. *(Phase 2)* Le froid est
  le polaire (ET, EF — 29, 30) **et le subarctique** (Dsc, Dsd, Dwc, Dwd, Dfc, Dfd — 19, 20, 23,
  24, 27, 28) : l'intérieur de la Tchoukotka est en Dfc et sans arbres, et compté à part il
  sortait plaine (ET 30 %, « autre » 70 %) ;
- **forêt** : la part de forêt de la maille Hansen 0,25° qui le contient (0 au nord de 80° N, où
  le jeu Hansen s'arrête).

Décision de la région, dans cet ordre :

1. **montagne** si la part montagneuse atteint **0,5** — majorité absolue, parce que la montagne
   l'emporte sur le climat (le Valais a sa toundra d'altitude) ;
2. sinon le **climat dominant** (pluralité des quatre) : aride → **désert** ; froid →
   **toundra**, ou **forêt** si la forêt moyenne atteint **0,3** — la taïga *(phase 2)* ;
3. tropical → **jungle** si la forêt moyenne de la région atteint **0,4**, **plaine** sinon (la
   savane) ; autre → **forêt** si la forêt moyenne atteint 0,4, **plaine** sinon.

**Le seuil de taïga est plus bas que celui de forêt** *(phase 2)* parce que la canopée boréale
est claire : la Iakoutie, trois millions de km² de mélèzes, moyenne 0,38 dans Hansen, et elle
sortait toundra au seuil de 0,4. La toundra est l'absence d'arbres, pas leur éclaircie. Les
Territoires du Nord-Ouest (0,29) restent toundra, la Tchoukotka est à 0,06.

Une région qui ne contient aucun échantillon — **641** à 0,1° — se lit **au point** : son pôle
d'inaccessibilité (`region-index.json`), échantillonné dans chaque raster à la valeur la plus
proche, avec les mêmes seuils. Le dénivelé y garde sa fenêtre 3 × 3. *(Phase 2)* Cent quatre de
ces points tombent sur une cellule que Köppen dit en mer (îlots, Gaza, Zeeland) : le climat est
pris à la terre la plus proche, à trois cellules au plus (≈ 33 km).

Les seuils sont des constantes nommées en tête de `scripts/region-terrain.mjs` :

| Constante | Valeur |
|---|---|
| `MOUNTAIN_RELIEF_M` | 600 m |
| `HIGHLAND_ALTITUDE_M` / `HIGHLAND_RELIEF_M` | 1 500 m / 300 m |
| `MOUNTAIN_SHARE` | 0,5 |
| `FOREST_SHARE` | 0,4 |
| `TAIGA_SHARE` | 0,3 *(phase 2)* |

Aucune des quatre valeurs de départ n'a bougé : les témoins sont sortis justes sans y toucher, et
ce sont les deux classes de climat qui ont été corrigées, pas les seuils.

### Les six témoins

| Région | Id | Attendu | Ce qui le donne |
|---|---|---|---|
| Oise | `FRA-5331` | plaine | 30 à 235 m, Cfb, forêt ≈ 0,2 |
| Landes | `FRA-5313` | forêt | < 230 m, Cfb, massif landais ≈ 0,6 et plus |
| Amazonas | `BRA-592` | jungle | basses terres Af/Am, forêt ≈ 0,9 |
| Valais | `CHE-165` | montagne | Rhône à 500 m, sommets à 4 000 m sur 10 km : presque tout montagneux |
| Tamanghasset | `DZA-2189` | désert | BWh partout ; le Hoggar ne couvre qu'une dizaine de % de la wilaya |
| Chukchi | `RUS-2321` | toundra | ET dominant, forêt quasi nulle |

**Les témoins deviennent un test de l'actif, par id et non par nom** : « Amazonas » existe dans
quatre pays, et seul le brésilien est un témoin sûr. Celui du **Pérou** (`PER-584`) monte de
200 m à plus de 4 000 m — il peut sortir montagne, et ce serait juste. Ceux de Colombie et du
Venezuela devraient sortir jungle, sans être des témoins.

**Le risque était la Tchoukotka**, et il s'est réalisé par le climat, pas par le relief : 7 %
seulement de montagne, mais 70 % de Dfc. Le réglage prévu (rattacher au froid le polaire bas)
n'y aurait rien fait ; c'est le subarctique compté comme froid qui la rend toundra.

### Résultats du premier passage (13/10/2026)

Parts mesurées des témoins, pondérées par l'aire — tous justes :

| Témoin | Sort | Montagne | Aride | Froid | Tropical | Autre | Forêt |
|---|---|---|---|---|---|---|---|
| Oise | plaine | 0 % | 0 % | 0 % | 0 % | 100 % | 0,22 |
| Landes | forêt | 0 % | 0 % | 0 % | 0 % | 100 % | 0,55 |
| Amazonas (BRA) | jungle | 1 % | 0 % | 0 % | 100 % | 0 % | 0,96 |
| Valais | montagne | 100 % | 0 % | 80 % | 0 % | 20 % | 0,28 |
| Tamanghasset | désert | 4 % | 100 % | 0 % | 0 % | 0 % | 0,00 |
| Chukchi | toundra | 7 % | 0 % | 100 % | 0 % | 0 % | 0,06 |

Les homonymes : Amazonas du Pérou sort **montagne**, ceux de Colombie et du Venezuela **jungle**,
comme annoncé.

**Répartition mondiale, 4 600 régions** : plaine 2 194 · montagne 1 091 · forêt 559 · jungle 465 ·
désert 262 · toundra 29. La montagne pèse lourd par le **nombre**, pas par la surface : la
Macédoine du Nord (70 municipalités), la Slovénie (61), la Turquie (52), l'Italie (51), les
Philippines (42) et l'Azerbaïdjan (41) découpent finement des pays montagneux. La toundra est rare
pour la raison inverse : elle tient dans quelques régions immenses (Nunavut, Territoires du
Nord-Ouest, Alaska, Groenland, Tchoukotka, Iamalie, Nénétsie).

**Temps** : 1,2 s de lecture des rasters (dont 1 s pour les 64 Mo de texte d'ETOPO), 17 à 21 s de
classification (2,2 M échantillons terrestres, une recherche de région chacun), sur le Mac.

**Cas discutables relevés** (aucun n'appelle de seuil) : l'Arizona sort plaine (46 % de
montagne, la steppe domine le désert), la Haute-Bavière forêt (les Alpes n'en couvrent pas la
moitié), le Mizoram forêt et non jungle (il est en Cwa, donc tempéré au sens de Köppen), le
Yukon forêt (45 % de montagne, taïga à 0,51), le Kamtchatka et la Magadan forêt (taïga à 0,36 et
0,31), l'Alberta forêt (la prairie du sud pèse moins que la forêt boréale du nord).

## L'architecture

**Le type est cuit dans un asset à part, `public/region-types.json`** : `{ type: [ids] }`, plaines
comprises, une cinquantaine de Ko. Il est écrit par `scripts/generate-region-types.mjs`, qui relit
`public/regions.json` (contours) et `public/region-index.json` (pôles d'inaccessibilité) et les
rasters hors dépôt ; `regions.json` n'est donc ni lu ni réécrit par un second écrivain. La règle et
les lecteurs vivent à côté dans `scripts/region-terrain.mjs` (`classifyRegions`, même découpe que
`german-districts.mjs`). Le générateur est chaîné à la fin de `generate-world.mjs` quand on lui
donne `--terrain <dossier-terrain>`, ou se lance seul :

```
node scripts/generate-region-types.mjs <dossier-terrain>
```

**Les rasters vivent hors du dépôt**, passés en argument — rien à ignorer dans git, et chaque poste
les range où il veut. Le script vérifie l'empreinte SHA-256 de chacun (gravée en tête du script) :
deux postes qui cuisent avec deux sources différentes ne doivent pas se le découvrir à la revue. Un
fichier absent s'annonce par son nom et renvoie à la section « Les téléchargements » ci-dessous.

**Au client**, `loadRegions` charge `region-types.json` en parallèle de `regions.json` ; une région
absente du fichier se lit `'plain'`. `DisplayedRegion` porte `type`, et `regions.ts` le lit au
survol.

**Les trois lecteurs, sans dépendance** — écrits et testés sur des fichiers fabriqués dans le
test (`scripts/region-terrain.test.mjs`) ; le décodeur LZW maison a suffi, `geotiff` n'est pas
entré :

- **ETOPO** : en-tête de six lignes, puis des nombres séparés par des espaces, rangs du nord au
  sud. Deux fichiers, l'est (0 → 180°) et l'ouest (180 → 360°, qu'ERDDAP réécrit en −180 → 0) :
  le format ESRI refuse une longitude au-delà de 180, la requête unique est rejetée ;
- **Köppen** : un TIFF à tuiles, compression LZW (code 5) sans prédicteur — le seul morceau de
  vrai code, un décodeur LZW d'une trentaine de lignes. Le membre du zip se décompresse avec
  `node:zlib` (`inflateRawSync`) ;
- **Hansen** : l'en-tête netCDF-3 se lit en une quarantaine de lignes (dimensions, attributs,
  `begin` de chaque variable), les valeurs sont des float64 gros-boutistes ; on lit `lat` pour
  connaître le sens des rangs, NaN vaut zéro. L'attribut `GeoTransform` hérité de la source 30 m
  est faux et ne se lit pas.

Si le décodeur LZW coûtait plus que prévu, le repli est `geotiff` en dépendance de
développement (JavaScript pur, MIT) — pas avant.

**L'échantillonnage** parcourt la grille 0,1° (6,5 M points, ≈ 2,2 M terrestres), projette chaque
point par **la même projection** que les contours (`geoNaturalEarth1().fitExtent`, déjà construite
dans le script) et cherche sa région avec `regionAtPlanePoint` sur des paniers de boîtes
englobantes — la fonction et le procédé de `generate-region-grid.mjs`. Le raster de régions n'est
pas réutilisé : il est cuit **après** `regions.json`, et l'ordre de la chaîne ne bouge pas.

## Ce qui doit sortir à l'octet près

- `regions.json`, `region-index.json`, `region-grid.json`, `projection.json`, `grid.json` et
  `deposits.json` ne lisent pas le type : recuits, ils sortent identiques (`git diff --stat`) ;
- le découpage allemand ne bouge pas : la classification ne touche ni un anneau ni une ligne ;
- relancé sur les mêmes rasters, `region-types.json` ressort identique.

**Le temps de génération** : environ 20 s (1 s de lecture des rasters, 17 s de classification) ; le
générateur ne se relance qu'à la main.

## Attribution

La page `/credits` existe et crédite le BKG, NOAA, Beck et Hansen.

## Les téléchargements (faits le 13/10/2026)

Rangés hors dépôt, sous ces noms, et vérifiés par leur empreinte par
`scripts/generate-region-types.mjs` (`SOURCES`) :

| Fichier | Taille | SHA-256 |
|---|---|---|
| `etopo-east.asc` | 31 531 533 o | `11cce27e1a677dda513077a573612b60c1566bda96f9f627aea85933cfc3ef30` |
| `etopo-west.asc` | 32 104 256 o | `a6dd4ab319cb028abde4785868783a78a5dd0f34a71fce5c474da23054eee710` |
| `koppen-0p1.zipmember` | 185 868 o | `fd3d45d40a66951dab26268b945a7eff45374983a72be0e8fa12de01415ff9c2` |
| `hansen_2000_forestcover_025deg.nc` | 8 313 208 o | `e6b983efa9818b8bf1db10986a7dd07af10c64670a92559298c6342825e34434` |

La requête de plage de figshare a suffi : le zip de 130 Mo n'a pas été descendu. `node scripts/generate-region-types.mjs <dossier-terrain>` relit `public/regions.json` et les
pôles de `region-index.json` — les sources Natural Earth et VG2500 ne sont pas nécessaires — et
imprime la répartition et le temps ; les six témoins sont tenus par `src/domain/region-types.test.ts`.

Les URL :

1. **ETOPO 2022, moitié est** (≈ 32 Mo, texte) :
   `https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_60s.esriAscii?z%5B(-89.99166666666666):6:(89.99166666666667)%5D%5B(0.008333333333325754):6:(179.99166666666667)%5D`
2. **ETOPO 2022, moitié ouest** (≈ 32 Mo, texte) :
   `https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_60s.esriAscii?z%5B(-89.99166666666666):6:(89.99166666666667)%5D%5B(180.00833333333333):6:(359.99166666666667)%5D`
3. **Köppen-Geiger 1991–2020 à 0,1°**, le seul membre du zip par requête de plage
   (186 Ko) : `curl -r 122626536-122812403 https://ndownloader.figshare.com/files/61012822`
   — en-tête local de 61 octets puis flux deflate ; à défaut, le zip entier
   `koppen_geiger_tif.zip` (130 Mo), membre `1991_2020/koppen_geiger_0p1.tif`.
4. **Hansen, part de forêt 2000 à 0,25°** (8,3 Mo) :
   `https://zenodo.org/api/records/16930105/files/hansen_2000_forestcover_025deg.nc/content`

Les URL d'ETOPO et les plages du zip ont été vérifiées sur des requêtes d'une ligne et sur les
répertoires centraux, sans descendre les données.
