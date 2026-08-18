# Plan de progression V1 — une question nouvelle à chaque palier de QG

> ⚠️ **Mesures périmées (18/08/2026).** Le plafond de bâtisses est passé dans le format
> (ADR 0019, révision de l'ADR 0017) : l'escarmouche assidue sort désormais à **41 actions,
> 11 bâtiments, aucune connexion vide**. Tous les chiffres d'ouverture de cette note datent
> d'avant, et le calibrage de `startingAlloy` qui en découlait n'a pas été refait.

**Statut : proposition V1, à développer puis tester en conditions réelles.** Deux ou trois points
sensibles sont assumés et nommés en fin de document — le but est un premier tour de saison entre
amis, pas un équilibrage final. Chiffres : `WWS/simulation/opening/` (état du 17/08). Ce plan ne
relitige aucune ADR ; là où il tranche une question ouverte, il le dit.

## Le principe

**Un palier de QG = une question nouvelle posée au joueur, et une cible nouvelle offerte à ses
adversaires.** Pas « plus de la même chose en plus grand » : chaque montée du QG doit changer la
nature de la partie, pas son volume. C'est la leçon des jeux à paliers qui marchent — dans Clash
of Clans, les niveaux d'hôtel de ville qui comptent sont ceux qui changent la *façon* de jouer,
et il n'y en a que quatre ou cinq sur seize. Nous avons exactement cinq niveaux : **aucun n'a le
droit d'être creux.**

Et la leçon des jeux asynchrones réussis (Subterfuge : aucune action ne doit exiger une réponse
en moins de 8-10 heures) : un palier n'est jamais une urgence. Il s'ouvre quand le joueur le paie,
ses fruits se cueillent à la connexion suivante. La fenêtre de repos reste intouchable.

## La frise

```
skirmish (48 h)            ├────── QG 2 ──────┼────────── QG 3 ──────────┤
                           lancement          ~h 24-33                   wipe
                           LA TERRE           LES ARMES COMBINÉES

campaign (7 j)   ├─ QG 1 ─┼───── QG 2 ─────┼────── QG 3 ──────┼──── QG 4 ────┼─ (QG 5) ─┤
                 lancement ~h 16            ~h 44-58           ~h 83-120     ~h 140+, un choix
                 LA TERRE  L'ARMÉE          LA PROJECTION      LA GUERRE ÉCO  LA CONCLUSION
                 NOURRICIÈRE
```

Le skirmish est la **fin de la campagne jouée seule** : il entre dans la même courbe au QG 2 et
s'arrête au QG 3. Une seule économie, deux portes d'entrée (ADR 0017).

## Palier par palier

### QG 1 — L'âge du sol *(campagne seulement)*

| | |
|---|---|
| **Catalogue** | exploitation (ferme, filature, mine, puits), transformation (fonderie, intendance), stockage (entrepôt, dépôt) |
| **La question** | *où* poser son économie — quels gisements, quelles régions, près ou loin de quoi |
| **La cible offerte** | rien encore : personne ne peut atteindre personne |
| **Le ressenti** | on lit sa carte, on place son socle (gratuit, ADR 0017), on prend deux ou trois décisions d'extraction, on ferme l'onglet |
| **Timing mesuré** | QG 2 à h16 (assidu) / h21 (occasionnel) — bon |

L'entrepôt **reste au QG 1** : c'est lui qui protège le joueur absent (le défaut d'absence mord
sur qui n'a pas d'entrepôt), le mettre plus haut punirait exactement celui qui ne peut rien y
faire.

### QG 2 — L'âge de l'armée · *entrée du skirmish*

| | |
|---|---|
| **Catalogue** | caserne, baraquements, arsenal, **station d'écoute** — la guerre terrestre complète, infanterie MK1 et transport |
| **La question** | combien d'armée, nourrie comment — et *que sait-on des autres ?* |
| **La cible offerte** | les stocks : l'entrepôt se vole, le dépôt saute (fiche 02) |
| **Le ressenti** | premier arbitrage économie/armée, premier lot d'arsenal, premières troupes — et le premier coup d'œil dans le brouillard |
| **Timing mesuré** | skirmish : 30 actions, 1 connexion vide sur 12 — tenu |

La station d'écoute au QG 2 et pas plus haut : en asynchrone, **l'information est le jeu du
temps d'attente** (c'est toute la leçon de Subterfuge — la profondeur vient de ce qu'on apprend
et négocie pendant que les mouvements voyagent). La donner tôt, c'est donner tôt une raison de se
connecter qui n'est pas une file de production.

### QG 3 — L'âge de la projection · *fin du skirmish*

| | |
|---|---|
| **Catalogue** | aérodrome, port, **avant-postes** — et **le blindé + tout le palier MK2 ensemble** |
| **La question** | projeter *où*, par quel milieu — et contre qui s'équiper |
| **La cible offerte** | les lignes : les mouvements s'interceptent, les avant-postes se raident |
| **Le ressenti** | la carte s'ouvre ; en skirmish c'est l'apogée (h24-33, mi-saison), en campagne c'est le début du monde extérieur |
| **Timing mesuré** | skirmish h33 (cible : h24-28, à resserrer) · campagne h44-58 — bon |

**L'arme et son contre arrivent ensemble.** Le blindé quitte le QG 2 pour le QG 3, où le MK2
l'attend (la table de dégâts fait de l'infanterie MK2 le contre du blindé : .65/.45 contre
.15/.05 pour la MK1). Ça tranche la question 6 en (c) : jamais 33 heures de blindé sans réponse.
Le QG 2 est l'âge de l'infanterie ; le QG 3, celui des armes combinées.

### QG 4 — L'âge de la guerre économique *(campagne)*

| | |
|---|---|
| **Catalogue** | rien de neuf à construire — **ce qui s'ouvre, ce sont les outils de soustraction** : pillage actif des stocks, embargo (Hégémonie), exposition (Influence) — fiche 05 |
| **La question** | qui affaiblir, et par quoi : son armée, son pétrole, sa doctrine |
| **La cible offerte** | soi-même : à ce stade les barres de doctrine approchent des 25 %, les masques tombent |
| **Le ressenti** | le milieu de partie cesse d'être un plateau — c'est le trou mesuré de la campagne (19 connexions vides sur 42, 33 h sans rien), et c'est précisément ici que le jeu doit devenir *social* |
| **Timing mesuré** | h83-120 selon le profil — la fourchette est le trou à combler |

C'est le palier le plus important du plan et le moins codé. Le milieu de campagne ne peut pas
être rempli par de la construction (l'alliage est le goulot partout) : il se remplit par **ce
qu'on fait aux autres**. Un palier sans nouveau bâtiment est un choix assumé — Clash of Clans
fait pareil sur la moitié de ses niveaux ; ce qui compte est que la *question* change.

### QG 5 — L'âge des conclusions *(campagne, un choix — jamais un dû)*

| | |
|---|---|
| **Catalogue** | porte-avions (le seul rôle à 430 d'alliage), niveaux 5 partout |
| **La question** | conclure — convertir son avance en victoire de doctrine avant le wipe |
| **La cible offerte** | tout ce qu'on a d'immobile : l'hégémon concentré est le festin de Domination |
| **Le ressenti** | le QG 5 n'est pas un palier qu'on atteint, c'est un pari qu'on paie |
| **Timing mesuré** | **inatteignable aujourd'hui, même pour un rusheur pur** — voir points sensibles |

Position assumée : le QG 5 doit être atteignable par un joueur qui **sacrifie son armée** pour
lui (~h130-150), jamais par tout le monde par défaut. Un dernier palier garanti est un compte à
rebours ; un dernier palier optionnel est une décision.

## Ce que les mesures fondent

- Skirmish, joueur assidu : 30 actions, 1 connexion vide sur 12, QG 3 à h33. **L'ouverture tient.**
- Campagne : QG 2 h16, QG 3 h44-58, QG 4 h83-120 — les quatre premiers paliers tombent naturellement
  un par « journée de jeu », sans réglage.
- **Le QG 5 ne tombe jamais**, pour une raison précise et double : (1) même un rusheur pur qui ne
  recrute rien finit la saison au QG 4 avec 332 d'alliage sur les 630 requis ; (2) sa facture de
  charbon — 420 — **dépasse le plafond de base de 400** : sans entrepôt de niveau 2, le QG 5 est
  arithmétiquement impossible, et rien ne le dit.
- Le trou de milieu de campagne est réel : 19 connexions vides sur 42, 33 h sans rien. Le QG 4
  est la réponse du plan.
- L'air et la mer coûtent 20 à 35 % du budget d'une saison courte : **en skirmish ils sont un
  pari, pas un dû** — l'écrire à l'écran plutôt que le laisser découvrir à la 30ᵉ heure.

## Points sensibles assumés (V1 — à tester, pas à résoudre d'abord)

1. **Le QG 5 demande un réglage dédié.** Cible d'acceptation : un rusheur l'atteint vers h130-150,
   un joueur équilibré ne l'atteint pas. Leviers, au choix du simulateur : facteur de coût propre
   au QG (1,8 → 1,6 sur le seul QG), ou fonderie à 6/h par niveau. Et **décider si « le QG 5
   exige un entrepôt » est une règle qu'on affiche ou un accident qu'on corrige**.
2. **Le QG 4 n'existe que si le pillage et les outils de doctrine existent.** C'est le plus gros
   chantier de la route de dev — tant qu'il n'est pas là, la campagne garde son trou. Le test en
   conditions réelles peut commencer en skirmish sans lui.
3. **Blindé au QG 3** : c'est une réponse provisoire à la question 6 (option c). Si le QG 2 paraît
   trop nu en test — infanterie et transport seulement — le repli est de rendre au QG 2 le blindé
   *et* le MK2 ensemble, jamais l'un sans l'autre.
4. **L'écart d'assiduité** (occasionnel : 794 d'alliage dormant, 0 troupe) n'est pas traité par ce
   plan — question 5 toujours ouverte. Le test réel dira si c'est théorique ou mortel.

## La route de dev vers le test réel

Dans l'ordre, chaque étape testable seule :

1. **Catalogue par palier** — une table `UNLOCKED_AT` clé → niveau de QG, un refus de plus dans
   `placementRefusal`, l'écran qui l'affiche. Petit. Débloque : le test du skirmish complet.
2. **Mouvement terrestre + avant-poste minimal** — poser, marcher, raider (désactiver). Sans
   interception d'abord. Débloque : la carte comme espace, le QG 3.
3. **Combat séquentiel** — la table de `chiffrage-combat.md`, littéralement (le prompt
   `refonte-simulateur.md` la voulait déjà telle quelle). Débloque : les pertes réelles, la
   reconstruction, l'attrition mesurée au lieu du bouton.
4. **Pillage des stocks** — l'écrêtage attend déjà son appelant (`clipToStorage`, ADR 0017).
   Débloque : le QG 4 et la moitié du triangle des doctrines.
5. **Victoire de test** : pour le premier tour réel, une seule condition — Domination simplifiée
   (réduire la capacité militaire de ⌈(n−1)/2⌉ joueurs). **Échafaudage de test, pas une décision
   de design** : le triangle complet de la fiche 05 reste la cible, il arrive avec l'étape 4.

Premier test réel possible **après l'étape 3** : un skirmish à 2-4 joueurs, guerre terrestre,
victoire Domination simplifiée. C'est là que ce plan reçoit son premier retour.
