# État de partie de référence

Vue du joueur **France**, saison en cours, **brouillard appliqué**. Généré par `etat-reference.mjs`
à partir d'une saison réellement simulée : ressources, débits, coûts, armées et progressions sont
cohérents entre eux. Le JSON exploitable est [`etat-reference.json`](etat-reference.json).

**Saison 1 · 22 h écoulées sur 48 · 6 joueurs · Europe + Méditerranée + Moyen-Orient**

---

## Le joueur

**France** — doctrine *hegemonie*, **28 %** de progression (révélée).  
Pouvoir : *Projection outre-mer — avant-postes à n’importe quelle distance, coût croissant*  
Plage de repos déclarée : **12h00 – 19h00**

| Ressource | Stock | Débit | Note |
|---|---|---|---|
| Ravitaillement | 686 | +686/h | |
| Acier | 3408 | +270/h | avant-postes d'extraction uniquement |
| Effectifs | 5 / 185 | +19/h | ni achetables ni convertibles |

**Slots de mouvement : 3 / 3** — saturés.

### Bâtiments

| Bâtiment | Niveau | Coût du suivant | Durée | |
|---|---|---|---|---|
| Quartier général | 3 | 5932 | 70 min |  |
| Complexe industriel | 2 | 2358 | 39 min |  |
| Centre logistique | 2 | 2205 | 39 min |  |
| Conscription | 2 | 1977 | 39 min |  |
| Station d’écoute | 1 | 936 | 22 min |  |

### Armée

| Rôle | Présente | En transit |
|---|---|---|
| Chasseur | 2 | 0 |
| Infanterie | 8 | 0 |

### Avant-postes

| | Pays hôte | Spécialisation | Rendement | Garnison | Immunité |
|---|---|---|---|---|---|
| AP-01 | Hungary | Extraction | ×1 | 20 | 26 min |
| AP-02 | Ireland | Extraction | ×1 | 20 | — |
| AP-03 | Panama | Extraction | ×1 | 10 | — |

---

## Mouvements

### Les miens — tout est visible

| | Type | Destination | Distance | Arrivée dans | Pile |
|---|---|---|---|---|---|
| MVT-001 | Fondation d’avant-poste | Chad | 3659 km | 00h08 | — |
| MVT-002 | Fondation d’avant-poste | Lesotho | 8923 km | 01h16 | — |
| MVT-003 | Fondation d’avant-poste | Canada | 7046 km | 00h52 | — |

### Les adverses — ni type ni composition, jamais

| | État | Nation suspectée | Cap | Arrivée estimée |
|---|---|---|---|---|
| ARC-001 | `adverse-derniere-position-connue` | — | 142° | — |
| ARC-002 | `adverse-derniere-position-connue` | — | 149° | — |

> **2 mouvements adverses visibles sur 7** — soit 29 % de couverture.
> C'est l'état normal du jeu, pas un cas limite : on ne voit presque rien, et c'est pour ça qu'on paie.


---

## Journal d'événements

| Quand | Gravité | Événement |
|---|---|---|
| −12 min | critique | Avant-poste d’extraction désactivé par raid — Algérie |
| −48 min | critique | Embargo subi — production militaire plafonnée |
| −1h20 | notable | Combat résolu à Tunisie — victoire, 4 blindés perdus |
| −2h05 | notable | Mouvement immobilisé à la frontière — plage de repos de l’URSS |
| −3h40 | routine | Chantier terminé — Centre logistique niveau 3 |
| −4h15 | routine | Agent dormant en place — Turquie |

---

## Adversaires

| Nation | Encre | Barre | Progression | Doctrine | Plage de repos |
|---|---|---|---|---|---|
| Italie | `#a86c4a` | `anonyme` | 12 % | — (sous 25 %) | 04h00 – 11h00 |
| Chine | `#b07434` | `attribuee` | 26 % | hegemonie | 03h00 – 10h00 |
| URSS | `#9d4638` | `attribuee` | 29 % | influence | 03h00 – 10h00 |
| Japon | `#a44a5e` | `anonyme` | 19 % | — (sous 25 %) | 18h00 – 01h00 |
| États-Unis | `#4a7060` | `attribuee` | 57 % | influence | 10h00 – 17h00 |

> Les États-Unis mènent à 57 %. C'est cohérent avec le rapport de simulation : leur isolement
> géographique les rend intouchables. C'est le déséquilibre connu du jeu, pas un hasard de tirage.


---

## Catalogue de production

| Rôle | Domaine | Acier | Effectifs | Palier 2 | Fort contre | Vulnérable à |
|---|---|---|---|---|---|---|
| Infanterie | Terre | 18 | 6 | oui | Transport terrestre, Infanterie | Blindé, Bombardier |
| Blindé | Terre | 95 | 3 | oui | Transport terrestre, Infanterie | Bombardier, Blindé |
| Transport terrestre | Terre | 40 | 2 | — | Transport terrestre, Infanterie | Blindé, Bombardier |
| Chasseur | Air | 110 | 2 | — | Transport aérien, Bombardier | Porte-avions, Chasseur |
| Bombardier | Air | 160 | 3 | — | Porte-avions, Blindé | Chasseur, Porte-avions |
| Transport aérien | Air | 90 | 2 | — |  | Chasseur, Porte-avions |
| Escorte | Mer | 175 | 5 | — | Cargo, Porte-avions | Bombardier, Escorte |
| Cargo | Mer | 120 | 3 | — | Cargo, Escorte | Escorte, Bombardier |
| Porte-avions | Mer | 430 | 9 | oui | Chasseur, Transport aérien | Bombardier, Escorte |

> Deux listes courtes par rôle. **Ne jamais montrer la matrice 9×9 au joueur.**


---

## Rejeu de bataille — BAT-003

**Tunisie** · France attaque Italie  
Cap d'arrivée : 148° — *depuis le nord-ouest, par la mer* · bonus défenseur ×1.15

| Passe | Pertes attaquant | Pertes défenseur |
|---|---|---|
| 1 | 3 Blindé | 11 Infanterie, 1 Chasseur |
| 2 | 1 Blindé, 2 Chasseur | 13 Infanterie, 2 Escorte |
| 3 | — | 9 Infanterie, 3 Escorte, 3 Chasseur |

**Victoire de l’attaquant — 82 % de la garnison détruite**


---

## Ce qui est synthétisé

Le simulateur ne modélise ni le brouillard, ni le rejeu, ni l'espionnage. Sont donc **fabriqués**,
de façon cohérente avec les règles mais non simulés : le journal d'événements, le rejeu de bataille,
le bloc espionnage, et les relations avec les pays neutres. Tout le reste vient de la partie.