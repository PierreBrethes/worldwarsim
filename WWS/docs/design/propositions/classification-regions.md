# Classification des régions — le vrai type de terrain (proposition, 12/10/2026)

**Statut : proposition, phase 1.** Sources choisies, règle écrite, architecture posée. Aucun
raster téléchargé, aucun script écrit : les trois téléchargements de la fin attendent l'accord de
Pierre. **Décor pur** — aucune règle de jeu ne lit le type (fiche 08 figée, ADR obligatoire le
jour où ce serait le cas).

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
  du Groenland culmine à 3 200 m et elle est plate — elle sera toundra (EF), pas montagne ;
- **climat** : aride (BWh, BWk — codes 4, 5), polaire (ET, EF — 29, 30), tropical (Af, Am, Aw —
  1 à 3), ou autre. La steppe (BS) est « autre » : c'est une plaine sèche, pas un désert ;
- **forêt** : la part de forêt de la maille Hansen 0,25° qui le contient (0 au nord de 80° N, où
  le jeu Hansen s'arrête).

Décision de la région, dans cet ordre :

1. **montagne** si la part montagneuse atteint **0,5** — majorité absolue, parce que la montagne
   l'emporte sur le climat (le Valais a sa toundra d'altitude) ;
2. sinon le **climat dominant** (pluralité des quatre) : aride → **désert**, polaire →
   **toundra** ;
3. tropical → **jungle** si la forêt moyenne de la région atteint **0,4**, **plaine** sinon (la
   savane) ; autre → **forêt** si la forêt moyenne atteint 0,4, **plaine** sinon.

Une région qui ne contient aucun échantillon — près d'un millier sont plus petites qu'une cellule
de 28 km (ADR 0023) — se lit **au point** : son pôle d'inaccessibilité, déprojeté, échantillonné
dans chaque raster à la valeur la plus proche, avec les mêmes seuils. Le dénivelé y garde sa
fenêtre 3 × 3.

Les quatre seuils (600 m, 300 m au-dessus de 1 500 m, 0,5, 0,4) sont des constantes nommées en
tête du script, et le premier passage imprime les parts mesurées des six témoins : c'est sur elles
qu'on règle, pas à l'œil.

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

**Le risque est la Tchoukotka.** Ses hautes terres (Anadyr, monts de Tchoukotka, 1 000 à 1 800 m)
peuvent approcher la moitié de la surface au seuil de 600 m, et ses vallées intérieures sont en
Dfc, pas en ET. Si le premier passage la donne montagne ou plaine, le réglage prévu est de
**rattacher au froid l'échantillon polaire de moins de 1 000 m** (un relief polaire bas reste de la
toundra) plutôt que de relever le seuil de montagne pour tout le monde.

## L'architecture

**Le type est cuit par `generate-regions.mjs`, et par lui seul.** Une fonction
`classifyRegions(regions, terrainDir)` vit à côté, dans `scripts/region-terrain.mjs` — même
découpe que `german-districts.mjs` —, et s'appelle juste avant l'écriture, **après** le découpage
allemand, sur la liste finale. Elle ajoute à chaque région un champ **`t`, dernier de l'objet**,
qui porte le littéral de `RegionType` (`"plain"`, `"forest"`…) : pas de table de codes à une
lettre, et 78 Ko de plus sur 2,6 Mo. Un seul écrivain pour l'actif : un second script qui
relirait et réécrirait `regions.json` serait une retouche, même automatisée.

Le générateur prend un troisième argument, le dossier des rasters :

```
node scripts/generate-regions.mjs <ne_10m_admin_1.geojson> <VG2500_RBZ.shp> <dossier-terrain>
```

**Les rasters vivent hors du dépôt**, passés en argument comme les deux sources actuelles — rien
à ignorer dans git, et chaque poste les range où il veut. Le script vérifie l'empreinte SHA-256 de
chacun (relevée au premier téléchargement et gravée en tête du script) : deux postes qui cuisent
avec deux sources différentes ne doivent pas se le découvrir à la revue.

**Les trois lecteurs, sans dépendance :**

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

**Au client**, `fetchRegions` lit `t` et `regionType(name)` disparaît avec ses témoins et son
hachage : `DisplayedRegion` porte `type`, et `regions.ts` le lit au survol.

## Ce qui doit sortir à l'octet près

- `regions.json` **privé de `t`** est identique au fichier de `main` : la vérification se fait en
  sérialisant `{ lines, regions }` sans le champ et en comparant les octets — c'est le contrôle de
  la PR, pas un test permanent ;
- `region-index.json`, `region-grid.json`, `projection.json`, `grid.json` et `deposits.json` ne
  lisent pas `t` : recuits, ils doivent sortir identiques, ce que `git diff --stat` dit ;
- le découpage allemand ne bouge pas : la classification ne touche ni un anneau ni une ligne.

**Le temps de génération** : la cuisson complète du raster de régions (1,33 M cellules, deux
recherches par cellule) prend quinze secondes ; l'échantillonnage en fait 2,2 M avec une seule
recherche, et la lecture des 64 Mo de texte d'ETOPO en ajoute quelques-unes. Ordre attendu : vingt
à quarante secondes de plus sur `generate-regions.mjs`, qu'on ne relance qu'à la main.

## Attribution

Le jeu n'a **toujours pas de page de crédits**, et la dette s'alourdit : BKG (déjà due), Beck et
al. et Hansen (CC BY 4.0, attribution obligatoire), NOAA NCEI (demandée). Les trois s'écrivent en
tête du script le jour où il existe ; la page de crédits reste un lot à part.

## Les téléchargements à autoriser

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
