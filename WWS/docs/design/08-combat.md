# 08 — Combat

**Statut : modèle figé, taux non simulés.** Réécrite le 15/08/2026 depuis l'[ADR 0014](../adr/0014-troupes-discretes-et-combat-sequentiel.md).
La version précédente — piles fusionnables, matrice 9×9, résolution simultanée à quatre passes —
n'existe plus.

**Les nombres ne sont pas ici.** Ils vivent dans
[propositions/chiffrage-combat.md](propositions/chiffrage-combat.md), vérifiés par
`src/domain/combat.test.ts`, et vivent dans `convex/constants.ts`. Cette fiche décrit le
modèle et les intentions ; dupliquer les tables ici garantirait qu'elles divergent.

Le combat se déclenche par **interception**, se résout **automatiquement et de façon
déterministe**, et se regarde ensuite en **rejeu**. Il n'y a aucune couche tactique interactive.
Cf. [ADR 0008](../adr/0008-combat-par-interception.md).

---

## 1. Des troupes discrètes

Une nation aligne un nombre borné de troupes uniques — ordre de grandeur 10 à 30, plafonné par les
casernements. **Une troupe ne fusionne jamais avec une autre.**

**Ses points de vie sont son effectif nominal, lisible** : 50 soldats, 12 chars légers, 6 chars
lourds, 12 appareils. Les dégâts se lisent en hommes et en machines perdus, jamais en pourcentage.
C'est la qualité recherchée : « 50 soldats contre 50 soldats, j'en perds 16, il en perd 22 » se
comprend sans manuel.

**Le porte-avions ne se compte pas en coques.** Un navire à 1 point de vie meurt d'un coup et ne se
lit pas. Ses points de vie sont son **groupe aérien embarqué** — ce qui est aussi exactement sa
valeur de jeu. « Il a perdu huit appareils » se comprend ; « il est à 60 % de coque » ne veut rien
dire.

**Les transports sont des troupes.** Un transport a une capacité d'emport typée — un porte-avions
emporte tant d'infanteries, tant de véhicules, tant d'avions. C'est la seule forme de regroupement
qui subsiste. En mer on voit le navire, pas la cargaison : un transport vide est indiscernable d'un
plein, et le leurre y gagne — **réel depuis le 18/09**, où un transport a enfin une raison de
mouiller quelque part, et où ce qu'il porte coule avec lui (§11).

## 2. Le déclenchement : le contact mobile

Toute troupe porte une **portée de détection par rôle** ; une pile prend le maximum. Une passe à
distance ne s'ouvre qu'entre deux mouvements présents dans le même milieu, lorsqu'au moins l'un
porte un ordre `attack` ou `raid` et détecte l'autre. `march` et `return` observent sans engager.
Une force stationnée détecte ce qui passe mais ne combat qu'à l'arrivée sur son point.

C'est ce qui donne son sens au positionnement : blocus d'un détroit, escorte d'un convoi, embuscade
sur une route connue. Et ça rend le renseignement directement monnayable — savoir *où* passe une
force permet de se placer sur sa route.

**Le calcul est écrit** : même géométrie temporelle que les fenêtres de révélation du brouillard,
réévaluée aux événements qui changent le plateau. Les segments et leurs coûts donnent la position
et le milieu à chaque instant ; les rendez-vous périmés sont annulés et le callback relit l'état.

Les portées sont chiffrées comme placeholders `@a-mesurer`. Voir §12.

## 3. La résolution : une passe, deux salves simultanées

> **Révision du 16/09/2026 — résolution simultanée (décision 1b, [ADR 0014](../adr/0014-troupes-discretes-et-combat-sequentiel.md)).**
> L'initiative à l'attaquant est abandonnée. Le reste du §3 tient tel quel.

> **Révision du 14/10/2026 — l'initiative revient (ADR 0014, B16).** L'attaquant frappe, les
> pertes s'appliquent, puis le défenseur **riposte avec ce qui lui reste** ; détruit par la
> frappe, il ne riposte pas. On ne paie en munitions que ce qu'on tire. Le bonus devient une
> **protection** (C1) : une garnison de bâtiment, d'objectif ou d'avant-poste debout et en service
> encaisse ×0,7 des coups (`GARRISON_DAMAGE_TAKEN`) et riposte sans multiplicateur. Cinquante
> contre cinquante : 25 / 13 en terrain libre, 18 / 16 en garnison. La salve simultanée décrite ci-dessous ne survit que comme **choc** (B17).
> Le char léger répond au lourd à .13 (C2). Les deux paragraphes suivants sont historiques.

**Un engagement = une passe de résolution**, et une passe = **une salve de chaque camp, tirée sur
l'état d'avant la passe**. Chacun vise la meilleure cible que la table lui donne, et seulement
s'il **peut** l'atteindre — un canon antichar ne tire pas sur un bombardier. Les pertes
s'appliquent ensemble : **un défenseur que la salve adverse détruit a tiré quand même**. Personne
ne frappe le premier. Fin.

**À forces égales, l'attaquant paie.** Le défenseur porte `DEFENDER_BONUS` et l'attaquant ne porte
rien : cinquante fantassins contre cinquante, en plaine, le défenseur perd 25 et l'attaquant 29.
L'attaque ne vaut qu'en supériorité ou en surprise.

Une seule passe est un choix fort, et il est mesuré : avec les mêmes valeurs, trois passes
transforment quatorze couples de rôles sur soixante-quinze en annihilations totales. Si le rejeu
paraît vide avec un seul échange, la réponse est de découper visuellement la passe, pas d'en
ajouter.

**Déterministe, sans aléa.** Dans un jeu asynchrone, le hasard ne se subit pas : on ne peut pas y
réagir.

**Déroute plutôt que mort.** Une troupe tombée sous un quart de son effectif nominal rompt le
contact et se replie vers son rattachement. Elle est hors de combat, pas détruite. C'est la règle
n°3 du projet — un joueur écrasé reste nuisible, jamais éliminé — appliquée au niveau de la troupe.

## 4. La table de dégâts

Ligne = attaquant, colonne = défenseur. La valeur est la **part de l'effectif nominal du défenseur
détruite par une passe d'un attaquant à pleine force**, avant modificateurs.

**Soixante-quinze couples sont atteignables sur cent vingt et un.** L'objection « c'est trop de
paramètres » tombe grâce à la structure par domaines : les cases vides ne se règlent pas, les trois
transports sont des victimes partout, et il reste une trentaine de valeurs qui portent réellement
la décision.

**L'asymétrie est le sujet.** Chasseur → bombardier vaut beaucoup ; bombardier → chasseur vaut
presque rien. La même paire donne un massacre ou une déroute selon qui attaque. On ne choisit pas
« la bonne unité », on choisit **qui on veut être en position d'attaquer**.

**Le porte-avions a délibérément une ligne médiocre.** Sa force est la portée — il déplace le point
de lancement aérien. Lui donner en plus de bons chiffres supprimerait toute raison de construire
autre chose.

**Le brouillard est ce qui rend la table intéressante.** En information parfaite, on voit la
composition adverse et on la contre exactement : le pierre-feuille-ciseaux devient un calcul. Dans
le brouillard, on compose **contre un inconnu** — et l'espionnage devient rentable, puisqu'il
transforme un pari en certitude.

## 5. Les modificateurs

Ils s'appliquent **avant** la table, pour rester lisibles.

| Modificateur | Qui en profite |
|---|---|
| **Bonus du défenseur** | défenseur — deuxième contre-pouvoir de l'ADR 0014 |
| **Terrain de la région défendue** | défenseur — défendre en montagne doit compter |
| **Tenaille** : deux mouvements convergents | attaquant |
| **Interception en route** | inverse l'initiative |

**L'avantage d'initiative est volontairement mince** — de l'ordre de 1,4 contre 1 en plaine, et il
s'inverse en montagne. L'ADR 0014 craignait « un festival d'agression » ; la mesure existante dit
que la Domination gagne 72 % des saisons sans outils de soustraction. Une attaque frontale sans
tenaille, sans supériorité aérienne et sans avantage de terrain doit être un mauvais calcul.

**Le terrain n'existe pas encore.** `RegionType` est aujourd'hui un factice — six régions témoins
classées à la main, hachage du nom pour les autres — et `CLAUDE.md` interdit qu'une règle de jeu le
lise sans ADR. Rien de ce qui touche au terrain ne peut être codé avant l'**ADR 0017** et la passe
de classification réelle dans `scripts/generate-regions.mjs`.

## 6. Le cap d'arrivée

L'orientation n'a de sens que si l'on peut manœuvrer, ce qui n'est pas le cas ici. Mais au niveau
stratégique elle en a un, naturel et **gratuit** : la direction depuis laquelle la force arrive. Le
cap de chaque mouvement est déjà calculé par la carte.

Attaquer par la mer ou par voie terrestre ; converger à deux depuis deux directions opposées, ce
qui donne le bonus de tenaille ; arriver dans le dos d'une force engagée ailleurs. Un modificateur
lisible qui récompense la planification sans demander une seule interaction pendant la bataille.

## 7. Soins, munitions, entretien

**Les blessures se soignent.** Une troupe entamée se reconstitue en consommant des **bandages**, en
se repliant vers une **pharmacie** — amélioration d'avant-poste — ou chez elle. La pharmacie est
plus chère et plus rapide, et surtout plus proche : le choix est distance contre ressource. Le soin
crée des mouvements de retour, et la carte vit dans les deux sens.

**Les munitions se facturent une seule fois, et c'est au tir** (question 18, tranchée le 25/08 —
elle renverse la version du 18/08, qui facturait au recrutement). Former une troupe ne coûte pas
une munition ; la faire combattre en coûte **une par tranche de 5 points d'effectif engagé et par
passe**, prélevée sur le stock national. Une infanterie MK1 à pleine force dépense donc 10 par
engagement. Facturer les deux bouts était l'ambiguïté du brief d'origine ; ce qui la tranche est
d'avoir choisi **le bout qui se répète** — une troupe n'est pas chère à lever, elle est chère à
faire durer, et c'est ce qui fait des munitions un goulot de guerre plutôt qu'une taxe de
production.

**Un camp à sec ne cesse pas de combattre, il devient mauvais.** Quand le stock national ne
couvre pas la passe, le camp entier frappe à **×0,60** et dépense le peu qu'il lui reste. La
sécheresse est une propriété du camp, jamais d'une troupe : le stock est national, et distribuer
les derniers obus à une compagnie plutôt qu'à sa voisine demanderait une règle d'ordre que
personne n'a écrite. Les munitions restent une ressource comme les autres, produite par l'arsenal
et plafonnée par le dépôt.

**L'entretien en nourriture se paie sur l'effectif *nominal*, pas courant.** Une troupe entamée
coûte autant qu'une troupe pleine — sinon perdre des hommes devient une économie.

## 8. Les nations modifient une ligne ou une colonne

Jamais la table entière. Allemagne sur la ligne blindé, Royaume-Uni sur la colonne chasseur en
défense, Japon sur la ligne porte-avions, URSS sur la colonne infanterie en défense, États-Unis sur
la ligne bombardier.

France, Italie et Chine ne touchent pas la table : leur asymétrie passe par l'atout structurel, la
troupe signature et la géographie ([06 — Nations](06-nations.md)). Si chaque nation avait sa propre
table, on passerait d'une trentaine de valeurs à deux cent quarante.

## 9. Garde-fous

**La table ne doit pas décider seule.** Sans coût différencié, temps de production et plafond
d'hommes, tout le monde converge vers la même armée optimale et le pierre-feuille-ciseaux ne sert
plus à rien.

**Aucune unité ne doit être un contre absolu.** `src/domain/combat.test.ts` rejoue les soixante-quinze
couples et échoue sur toute destruction quasi totale sans retour de salve — hors les trois
transports, qui sont des victimes par design.

## 10. Le rejeu

Quand un combat se résout, on peut **plonger sur le point de contact** : zoom serré, silhouettes
1940 placées, déroulé de la passe.

C'est un **rejeu**, pas une partie. On obtient le spectacle et la lisibilité d'une bataille
tactique sans aucun problème de synchronicité. Le joueur absent au moment du combat le regarde en
se reconnectant, exactement dans le même état que celui qui était en ligne.

## 11. Une passe en mer noie ce qu'aucune coque ne porte plus

**Codé le 18/09/2026** (règle 4 de « rester en mer », [ADR 0019](../adr/0019-mouvement-libre-et-troupes-posees.md)
§2). C'était la question ouverte que le §1 posait depuis l'ADR 0014 — *un convoi accroché en mer
est une coque avec une cargaison d'infanterie ; les passagers coulent-ils, débarquent-ils entamés,
n'entrent-ils jamais en portée ?* La réponse est **ils coulent**, et elle ne touche pas la passe :

- Le tir ne connaît toujours pas la cargaison. La coque n'est pas un bouclier (§9), les passagers
  ne sont pas des cibles, et rien de ceci ne change une salve.
- La noyade se lit **après** la passe, sur l'état d'après : une troupe terrestre que la capacité
  d'emport des coques **debout** ne couvre plus est détruite — pas déroutée, il n'y a rien où se
  replier. Une coque déroutée emporte ses passagers dans son repli, à sa capacité ; l'excédent
  coule.
- Le compte de la passe le dit tel quel : le noyé y est `destroyed`, parce qu'il l'est. Une
  dépêche `drownedAtSea` en donne la cause chez son seul propriétaire, en hommes et en machines —
  c'est la seule perte du jeu qu'aucun tir n'explique.

Le siège est celui du panneau de garnison et non une seconde arithmétique de places : **la place
qu'on voit au départ est la place qui sauve à l'arrivée**.

## 12. Ce qui reste ouvert

- **Les neuf portées de détection.** Elles existent par rôle et le simulateur ne les modélise pas :
  il faudra les calibrer à la main en première saison.
- **La supériorité aérienne.** Dans le chiffrage actuel, l'aviation ne se contre que par
  l'aviation : le sol ne lui oppose qu'une valeur symbolique portée par l'infanterie MK2. C'est le
  point le plus fragile du modèle, et la première chose à mesurer.
- **L'option B**, l'auto-battler à plans, reste en réserve : plan de bataille enregistré à
  l'avance, résolution déterministe. Seule façon connue de rendre de la décision tactique sans
  casser l'asynchrone. À reconsidérer si le combat automatique paraît trop passif après la première
  saison.
