# La chaîne de l'alliage — première mesure des tables économiques, 14/09/2026

Première fois que des valeurs de `convex/constants.ts` sortent d'un instrument plutôt que d'un
ordre de grandeur. L'instrument est le simulateur d'ouverture (`WWS/simulation/opening/`), remis
au niveau du jeu le matin même (QG posé, file de chantier prépayée, pose due hors plafond,
`CHAINS` miroité) — sans quoi la mesure aurait porté sur un jeu qui n'existe plus.

**Ce qui a bougé**, et rien d'autre :

| constante | avant | après |
|---|---|---|
| `CHAINS.foundry.perHourPerLevel` | 4 | **8** |
| `EXTRACTION_PER_HOUR.ore` | 9 | **16** |
| `EXTRACTION_PER_HOUR.coal` | 10 | **12** |
| `STARTING_ALLOY` | 500 | **400** |

Ni le prix ni la durée de la fonderie, ni `LEVEL_COST_FACTOR`, ni le plafond de stock, ni le
pétrole ni les munitions de la dotation.

## La grille, avant et après, à la valeur nominale

`node run.mjs --grille` — campagne 168 h, sol de référence (France), 108 cases. Ci-dessous la
case nominale de chaque régime : **avant, `4/h ×1` avec un pack de 500 ; après, `8/h ×1` avec un
pack de 400**. `!` = le plafond de stock a refusé de la matière — ce n'est plus un reste, c'est
une perte.

| régime | profil | actions | vides | QG | troupes | bâtiments | file méd./max | alliage | charbon | minerai |
|---|---|---|---|---|---|---|---|---|---|---|
| **avant** 4/h ×1, 500 | assidu | 37 | 20/42 | n.3 | 12/18 | 11 | 0/5 | 84 | 1 424 | 901 |
| | occasionnel | 30 | 0/14 | n.3 | 4/18 | 11 | 0/0 | 32 | 1 587 | 1 089 |
| | absent | 25 | 0/7 | n.3 | 1/16 | 11 | 0/0 | 86 | 965 | 314 |
| **après** 8/h ×1, 400 | assidu | **54** | **12/42** | n.4 | **18/20** | 12 | 0/3 | 98 | 560 | 145 |
| | occasionnel | **43** | 0/14 | n.4 | 6/20 | 12 | 0/0 | 128 | 238 | 46 |
| | absent | **30** | 0/7 | n.4 | 1/16 | 11 | 0/0 | 137 | 185 | 397 |

L'assidu gagne 17 actions et perd 8 connexions vides ; l'occasionnel gagne 13 actions ; l'absent
5. Le QG monte d'un palier partout. Et les tas de minerai et de charbon qui dormaient — 1 400 et
900 chez l'assidu — sont retombés à 560 et 145 : le sol nourrit la fonderie au lieu de s'entasser
derrière elle.

## Les trois lectures

**La fonderie était le seul goulot, et elle l'était seule.** À 4/h le joueur assidu plafonnait à
36-37 actions et 45 % de connexions vides quoi qu'on fasse du sol ou du pack — extraction ×2 sans
toucher à la fonderie : 37 actions, exactement le même chiffre. Sur la grille entière l'alliage
restant ne dépassait jamais 273 pendant que minerai et charbon s'entassaient. Le saut n'arrive
qu'à 8/h : 37 → 52-57 actions, 20/20 troupes, 9-12 connexions vides.

**Le sol suit la fonderie dans ses proportions, pas d'un facteur commun.** Une fonderie de niveau
1 à 8/h mange 16 minerai et 8 charbon par heure. Une extraction ×1,5 uniforme (13,5 / 15) laissait
le minerai tomber à zéro pendant que le charbon gâchait plus de 2 000 unités au plafond. D'où 16
et 12 : l'appétit exact pour le fer, et l'appétit plus la marge des chantiers pour le charbon —
le charbon est dans la moitié des factures de bâtiment, le fer dans aucune.

**Le pack ne pèse plus, et ce n'est plus lui qui fixe la borne.** À 8/h ×1 l'assidu fait 51
actions à 250 comme à 300, 54 à 400, 57 à 500 : du bruit. Ce qui empêche de descendre est une
règle de design, pas une mesure — la **décision 66a du 04/09** veut que la première projection par
mer (fonderie 50 + QG niveau 2 108 + caserne 40 + port 65 + cargo 120 = **383**) tienne dans la
dotation, sans quoi une île est tarifée au-dessus de son voisin. À 300 elle casse ; à 400 elle
tient, de justesse. On ne rouvre pas 66a pour cent alliage que rien ne mesure. Le jour où la règle
deviendrait « dans la dotation *plus une journée de fonderie* », le pack pourra descendre — ce
sera une décision signalée.

## Ce que la grille dit encore

**Plus aucune perte au plafond au régime nominal.** Toute la rangée `8/h ×1` — quatre packs,
trois profils — sort sans un seul `!` sur le charbon ou le minerai. Les cases où ça déborde encore
sont celles où l'extraction dépasse l'appétit de la fonderie : `8/h ×1,5` perd 180 à 840 de
charbon et 900 à 2 000 de minerai, `8/h ×2` en perd 2 500 et 5 000. C'est l'axe qui fait son
travail — il montre ce qu'on gâcherait à sur-nourrir la chaîne.

**Le retour en arrière se lit sur la même grille.** La case `4/h ×1, 400` — l'ancien régime au
nouveau pack — rend 34 actions, 21 connexions vides, et le charbon comme le minerai butent tous
deux sur le plafond (`1600!`). C'est à quoi ressemblait la campagne avant ce chantier.

**La nourriture, elle, plafonne partout** (1 734 perdus chez l'assidu au nominal). Ce n'est pas un
défaut de la chaîne de l'alliage : ce moteur ne modélise aucun entretien, donc rien ne mange.

## Les cases non monotones

Relevées sur la grille d'avant (rapport `simulateur-au-niveau`, même jour), nommées sans être
expliquées :

- **en pack** : 6/h ×1 assidu 300→400 (33→32) · 6/h ×1,5 occasionnel 300→400 · 6/h ×1,5 absent
  250→300 · 6/h ×2 assidu 300→400 (41→36) · 6/h ×2 occasionnel 300→400 · 8/h ×1 assidu 400→500 ·
  8/h ×1 absent 250→300 et 400→500 · 8/h ×1,5 assidu 250→300 et 400→500 · 8/h ×1,5 occasionnel
  250→300 (38→34) · 8/h ×2 assidu 250→300 (48→45) · 8/h ×2 absent 400→500.
- **en fonderie** : ×1 300 assidu 4→6 (35→33) · ×1 300 absent 6→8 · ×1 400 assidu 4→6 (37→32) ·
  ×1 500 absent 6→8 (30→25) · ×2 400 assidu 4→6.
- **en extraction** : 4/h 300, 400 et 500 assidu ×1→×1,5 · 6/h 250 absent aux deux crans · 6/h 300
  absent · 6/h 400 occasionnel et absent · 6/h 500 assidu et absent (30→25) · 8/h 250 assidu
  ×1,5→×2 (52→48) et occasionnel · 8/h 300 assidu ×1,5→×2 (51→45) · 8/h 500 absent.

Le motif est celui que l'ADR 0017 signalait déjà pour l'alliage de départ : **l'ordre des clics
pèse plus que le paramètre**. Un joueur plus riche achète plus tôt la mauvaise chose et finit plus
bas. C'est un symptôme de la politique de jeu, jamais un réglage — et c'est pourquoi la décision
ci-dessus ne s'appuie sur aucune case isolée.

## Ce que la grille ne dit pas

- **Aucun combat, aucune perte.** Rien n'est jamais engagé, donc les munitions ne se dépensent
  nulle part (question 18, 25/08) et l'alliage n'a pas de puits. Les chiffres de troupes sont ce
  qu'on peut *lever*, jamais ce qu'on garde.
- **Aucun adversaire, aucun brouillard, aucun mouvement.** Un seul joueur sur son sol : rien ici
  ne dit qui gagne, et les mesures d'équilibre sont optimistes.
- **Aucun entretien.** Ni troupes ni avant-postes ne mangent, d'où la nourriture au plafond.
- **L'absent reste à une troupe, et c'est le plan, pas l'instrument.** La politique garde en
  réserve la moitié du prix du QG suivant ; passé le niveau 3 cette réserve dépasse ce que
  l'absent accumule entre deux visites, et il n'enrôle plus jamais. Rien de ce chantier ne le
  corrige : c'est une question de plan de jeu, à ouvrir dans `QUESTIONS.md` si elle mérite de
  l'être.
- **Une grille d'ouverture n'est pas une saison jouée.** L'en-tête de `convex/constants.ts`
  continue de déclarer ces tables placeholders, et il a raison.

## Traces

`node WWS/simulation/opening/run.mjs --grille` → `grille.json` (suivi) · `--sweep` →
`sweep.json` (suivi) · `--rapport` → `rapport.html` (non suivi, une vue de la dernière
exécution). `node WWS/simulation/opening/verify.mjs` : 144 valeurs comparées, aucune dérive.
