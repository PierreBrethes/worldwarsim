# Proposition — Chiffrage du combat

> **Révision du 16/09/2026 — résolution simultanée (décision 1b, [ADR 0014](../../adr/0014-troupes-discretes-et-combat-sequentiel.md)).**
> Les deux camps tirent sur l'état d'avant la passe : le §3 et le §4 ci-dessous portent la
> révision. **Aucune valeur de la table ne bouge** — seul l'ordre des tirs a changé.

**Statut : proposition chiffrée, non gravée.** Ce document donne les premiers nombres du
modèle de l'[ADR 0014](../../adr/0014-troupes-discretes-et-combat-sequentiel.md) — effectifs
nominaux, table de dégâts, modificateurs, soins, munitions. Ils sont *lisibles* et *cohérents*,
pas *équilibrés* : c'est le simulateur refondu qui tranchera. Session du 14/08/2026.

Tout ce qui suit est vérifié par `src/domain/combat.test.ts`, qui rejoue les 75 couples
atteignables **contre la résolution réelle** et échoue sur un contre absolu ou un retour de salve
nul non voulu. Le garde-fou tournait auparavant dans `WWS/simulation/verif-chiffrage.mjs`, sur une
copie de la table ; la copie a été retirée le jour où les valeurs sont entrées dans
`convex/constants.ts` — deux tables, c'est une table qui dérive.

## 1. Les effectifs nominaux

Les points de vie d'une troupe **sont** son effectif, en unités qui se racontent. Une troupe
neuve part à son nominal ; les dégâts se lisent en hommes et en machines perdus.

| Rôle | Effectif nominal | Ce qu'on voit à l'écran |
|---|---|---|
| Infanterie MK1 | **50 soldats** | « 50 soldats » |
| Infanterie MK2 (antichar) | **30 soldats** | équipe lourde, moins nombreuse |
| Blindé MK1 (léger) | **12 chars** | une compagnie |
| Blindé MK2 (lourd) | **6 chars** | perdre un char se sent |
| Transport terrestre | **24 camions** | une colonne |
| Chasseur | **12 appareils** | une escadrille |
| Bombardier | **9 appareils** | un groupe |
| Transport aérien | **6 appareils** | |
| Escorte | **6 navires** | une division |
| Cargo | **8 navires** | un convoi |
| Porte-avions | **24 appareils embarqués** | le navire coule quand son groupe est détruit |

**Le porte-avions ne compte pas en coques.** Un porte-avions à 1 point de vie meurt d'un coup et
ne se lit pas. Ses points de vie sont son **groupe aérien** — ce qui est aussi exactement sa
valeur de jeu (fiche 09 : il déplace le point de lancement aérien). « Il a perdu 8 appareils » se
comprend ; « il est à 60 % de coque » ne veut rien dire.

Nombre de troupes par nation : **8 au départ, plafond 24**, relevé de **2 par niveau cumulé de
Baraquements** — le pas se dérive de la cible et du nombre de niveaux qui la saturent (8), il ne
s'écrit pas. Le plafond lit la **somme des niveaux de toutes les instances**, et comme aucun
bâtiment ne peut atteindre le niveau du QG, **un seul Baraquements plafonne à 16** : atteindre 24
coûte au minimum deux emplacements. On reste dans la fourchette 10–30 de l'ADR 0014, et les slots
de mouvement (ADR 0006) restent le régulateur — on ne déplace jamais tout à la fois.

Le porte-avions n'a **qu'un seul palier** : le tableau ci-dessus ne donne pas d'effectif nominal
pour un MK2, et sa force est la portée, pas la puissance (fiche 08).

## 2. La table de dégâts

Valeur = **part de l'effectif nominal du défenseur détruite par une passe d'un attaquant à
pleine force**, avant modificateurs. `·` = ne peut pas atteindre. Ligne = attaquant.

| Att \ Déf | Inf1 | Inf2 | Bli1 | Bli2 | TrT | Cha | Bom | TrA | Esc | Car | PAv |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Infanterie MK1** | .50 | .55 | .15 | .05 | .70 | · | · | · | · | · | · |
| **Infanterie MK2** | .35 | .40 | **.65** | **.45** | .60 | .06 | .10 | .12 | · | · | · |
| **Blindé MK1** | .70 | .65 | .50 | .25 | .85 | · | · | · | · | · | · |
| **Blindé MK2** | .75 | .70 | .75 | .50 | .90 | · | · | · | · | · | · |
| **Transport terrestre** | .10 | .10 | .05 | .02 | .15 | · | · | · | · | · | · |
| **Chasseur** | .25 | .25 | .10 | .05 | .45 | .50 | **.75** | .85 | .10 | .25 | .12 |
| **Bombardier** | .45 | .45 | .60 | .55 | .60 | **.08** | .20 | .25 | .55 | .60 | .65 |
| **Transport aérien** | · | · | · | · | · | · | · | · | · | · | · |
| **Escorte** | .10 | .10 | .05 | .02 | .12 | .15 | .15 | .18 | .50 | **.70** | .45 |
| **Cargo** | · | · | · | · | · | · | · | · | .05 | .10 | .05 |
| **Porte-avions** | .15 | .15 | .08 | .04 | .25 | .40 | .35 | .45 | .30 | .40 | .30 |

**75 couples atteignables sur 121** — 46 cases vides. L'objection « 121 paramètres » tombe :
les trois transports sont des victimes partout, et une trentaine de valeurs portent réellement
la décision.

L'asymétrie reste le sujet : chasseur → bombardier vaut .75, bombardier → chasseur vaut .08.
La même paire donne un massacre ou une déroute selon qui attaque.

**Trois écarts assumés par rapport à la fiche 08 :**

- L'infanterie MK2 gagne une **valeur antiaérienne symbolique** (.06 à .12). Sans elle, une
  force aérienne pure ne subit strictement rien de la part du sol, et le premier joueur qui
  comprend ça gagne la saison. Ce n'est pas assez pour contrer l'aviation — c'est assez pour
  qu'elle paie.
- **L'aviation ne se contre que par l'aviation.** Un bombardier détruit 3 chars lourds sur 6 et
  ne perd rien. Le contre est le chasseur (.75), pas la DCA. C'est un choix de lisibilité, et
  historiquement pas absurde ; c'est aussi le point le plus fragile de ce chiffrage.
- Le porte-avions garde une ligne **médiocre partout** (fiche 08, intention conservée) : sa force
  est la portée, pas la puissance.

## 3. Une seule passe

**Un engagement = une passe de résolution**, et une passe = **une salve de chaque camp, tirée sur
l'état d'avant la passe** (révision du 16/09/2026). Chacun tire s'il peut atteindre l'autre ; les
pertes s'appliquent ensemble. Fin.

L'ADR 0014 abandonne explicitement la résolution à plusieurs passes ; on n'en réintroduit pas
par la bande. À trois passes, ces mêmes chiffres transforment quatorze couples sur soixante-quinze
en annihilations totales — mesuré, pas supposé.

```
pertes_défenseur = round( D[att][def] × (effectif_att / nominal_att)
                          × (tenaille / (bonus_défenseur × terrain)) × nominal_def )
pertes_attaquant = round( D[def][att] × (effectif_def / nominal_def)
                          × (bonus_défenseur × terrain) × nominal_att )
```

Les deux lignes lisent le **même** état : `effectif_def` est celui d'avant la passe, plus celui
des survivants. C'est tout le changement du 16/09.

**Déroute plutôt que mort.** Une troupe tombée sous **25 %** de son nominal rompt le contact et
se replie vers son rattachement. Elle est hors de combat, pas détruite — règle n°3 du projet.

## 4. Les modificateurs

| Modificateur | Valeur | Qui en profite |
|---|---|---|
| Bonus du défenseur | **×1.15** | défenseur (curseur existant, conservé) |
| Terrain — plaine / désert | ×1.00 / ×0.95 | défenseur |
| Terrain — toundra / forêt | ×1.05 / ×1.10 | défenseur |
| Terrain — jungle / montagne | ×1.15 / ×1.20 | défenseur |
| Tenaille (deux mouvements convergents) | **×1.20** | attaquant |
| Munitions à sec | ×0.60 | pénalise celui qui n'en a plus |
| ~~Interception en route~~ | ~~inverse l'initiative~~ | **sans objet** (16/09) : il n'y a plus d'initiative, et l'interception en route a disparu avec l'[ADR 0024](../../adr/0024-engagement-intentionnel-et-forces-posees-visibles.md) §3 |

Résultat sur le cas de référence — 50 soldats contre 50 soldats, **résolution simultanée** :

| Situation | Le défenseur perd | L'attaquant perd |
|---|---|---|
| en plaine | 25 | 29 |

La ligne de plaine est celle que le code joue et que `combat.test.ts` vérifie ; forêt, montagne et
tenaille restent à chiffrer avec le terrain et le retranchement (Registre 29-30), et les chiffres
de la version séquentielle ne s'y transposent pas.

**L'attaquant paie, et c'est le but** — 25 contre 29 en plaine, soit ×1,16, parce que
`DEFENDER_BONUS` s'applique **une seule fois**, sur la salve du défenseur : l'écart joué est celui
que la constante annonce, et non plus le ×1,32 du doublon corrigé le 16/09. L'ADR 0014
craignait « un festival d'agression » ; la mesure existante dit que la Domination gagne 72 % des
saisons sans outils de soustraction. Une attaque frontale sans supériorité et sans surprise doit
être un mauvais calcul. C'est le cas.

## 5. Munitions, soins, entretien

- **Munitions** : 1 munition par tranche de 5 points d'effectif engagés, par passe. Une infanterie
  MK1 à pleine force dépense 10 munitions par engagement. À sec, elle se bat à ×0.60 — elle ne
  cesse pas de combattre, elle devient mauvaise.
- **Soins** : reconstituer 1 point d'effectif coûte **1 bandage chez soi**, **1,5 en pharmacie**
  (amélioration d'avant-poste). Le rythme est de 4 points par heure chez soi, 6 en pharmacie.
  La pharmacie est plus chère et plus rapide, et surtout plus proche : le choix est distance
  contre ressource, et il crée les mouvements de retour que l'ADR 0014 réclame.
- **Entretien** : un **forfait par troupe et par heure, identique pour tous les rôles**
  (`FOOD_UPKEEP_PER_TROOP_PER_HOUR`). La proportionnalité à l'effectif nominal est abandonnée
  (décision D1 du 16/08, `consommation-continue.md`) : `nominalStrength` n'est pas dans la même
  unité selon le rôle — 50 soldats, 12 chars, 24 appareils embarqués — donc nourrir un
  porte-avions « proportionnellement à 24 » le rendrait deux fois moins cher qu'une infanterie
  à 50 alors qu'il porte trois mille hommes. L'intention d'origine survit gratuitement : un
  forfait ne lit aucun effectif, donc une troupe entamée coûte autant qu'une troupe pleine et
  perdre des hommes n'est jamais une économie.

  Le forfait est **multiplié par l'ancrage** (ADR 0019 §4) : ×1 sur son sol national ou dans le
  rayon d'un de ses propres avant-postes debout, `UPKEEP_UNSUPPLIED_MULTIPLIER` partout
  ailleurs. À sec, rien ne meurt : le stock plancher à zéro et les files de recrutement
  s'arrêtent (D3).

## 6. Les nations ne touchent qu'une ligne ou une colonne

Principe de la fiche 08 conservé, valeurs reportées sur les nouveaux rôles :

| Nation | Modification |
|---|---|
| Allemagne | ligne **Blindé** ×1.25 |
| Royaume-Uni | colonne **Chasseur** en défense ×1.30 |
| Japon | ligne **Porte-avions** ×1.30 |
| URSS | colonne **Infanterie** en défense ×1.30 |
| États-Unis | ligne **Bombardier** ×1.25 |

France, Italie et Chine ne touchent pas la table : leur asymétrie passe par l'atout structurel et
la troupe signature (voir la maquette *Unités et atouts par nation*). C'est délibéré — si chaque
nation avait sa matrice, on passerait de trente valeurs à deux cent quarante.

## 7. Le blocage : le terrain n'existe pas

L'ADR 0014 impose le terrain comme l'un des trois contre-pouvoirs obligatoires. Or :

1. `CLAUDE.md` interdit qu'une règle de jeu lise `RegionType` sans ADR — la fiche 08 est figée
   « ni grille, ni terrain » ;
2. `RegionType` est aujourd'hui un **factice** : six régions témoins classées à la main, hachage
   du nom pour toutes les autres. Un modificateur de combat lirait du bruit.

**Rien de ce qui touche au terrain ne peut être codé avant l'ADR 0017** — le numéro 0016 est pris
par l'anglicisation du code — et la passe de classification réelle dans
`scripts/generate-regions.mjs` (ETOPO pour le relief, Köppen-Geiger pour l'aride et le polaire,
landcover pour forêt contre plaine) — celle-là même que le prompt `gisements-par-region.md` touche
déjà. Les deux se font ensemble ou pas du tout.

## 8. Questions ouvertes

- **Le rayon d'interception** (🟠 de QUESTIONS.md) reste non chiffré. Il conditionne tout : trop
  large, plus rien ne passe et la carte se fige.
- **Peut-on refuser le combat ?** Non tranché, et l'initiative à l'attaquant rend la question plus
  urgente qu'avant.
- **La supériorité aérienne** est le risque principal de ce chiffrage. À surveiller en priorité
  dans la première campagne de simulation.
- **Le nombre de passes** : une seule est un choix fort. Si le rejeu cinématique (fiche 4.7) paraît
  vide avec un seul échange, la réponse est de découper visuellement la passe, pas d'en ajouter.
