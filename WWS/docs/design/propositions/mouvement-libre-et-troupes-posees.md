# Mouvement libre et troupes posées

**Statut : proposition, trois décisions prises le 18/08/2026, le reste ouvert.** Cette note
remplace `projection-depuis-un-avant-poste.md`, qui instruisait une règle que le mouvement libre
supprime.

## 1. Ce qui est décidé

1. **Une troupe se déplace d'où elle est vers où le joueur veut**, sans condition d'origine. Un
   mouvement en cours reste **irréversible** — c'est la thèse du jeu, elle ne bouge pas.
2. **Une troupe peut rester sur la carte**, hors de tout bâtiment, à ses risques et périls.
3. **La destination est un point**, pas le centre d'une région.
4. **Un mini-repérage** : une troupe posée voit ce qui passe près d'elle.

Et les trois arbitrages du 18/08 :

- **Port et aérodrome restent des portes.** Le mouvement terrestre part de n'importe où ;
  embarquer exige un port au départ, décoller un aérodrome. L'ADR 0013 survit là où il paie.
- **Le péril est le ravitaillement**, pas l'attrition.
- **Une troupe posée ne s'engage jamais d'elle-même.** Elle est une cible, jamais un attaquant :
  la passe de résolution (ADR 0018) reste intacte.

## 2. La conséquence qui vaut la session : l'avant-poste devient un point de ravitaillement

Le péril choisi ne fonctionne pas tel que le modèle est écrit, et le correctif est meilleur que
la règle qu'il corrige.

`consommation-continue.md` pose deux décisions du 16/08 qu'on ne rediscute pas : **D1**,
l'entretien est *un forfait par troupe, identique pour tous les rôles* — une constante,
`FOOD_UPKEEP_PER_TROOP_PER_HOUR`, et rien d'autre ; **D3**, à sec de nourriture *rien ne meurt*,
la file de recrutement s'arrête, au nom de la règle anti-élimination.

Conséquence mécanique : **une troupe en Sibérie coûte exactement ce que coûte une troupe restée
chez soi, et ne mourra jamais.** « À ses risques et périls » ne désigne aujourd'hui aucun risque
et aucun péril. Semer vingt sentinelles serait gratuit, et le repérage deviendrait un radar
permanent qui vide l'ADR 0005 de son contenu.

Le correctif tient en une ligne de règle : **l'entretien est multiplié selon l'ancrage de la
troupe.**

| Où se tient la troupe | Entretien |
|---|---|
| Sur son territoire national | ×1 |
| Dans le rayon d'un de ses avant-postes (`OUTPOST_REACH_KM`) | ×1 |
| Partout ailleurs | ×N, N à mesurer |

Il respecte D1 — une constante et un multiplicateur, jamais une table de neuf nombres — et il
respecte D3 : rien ne meurt, la file de recrutement s'arrête, la punition reste visible,
immédiate et réversible.

**Ce que ça donne au design, gratuitement :**

- **L'avant-poste cesse d'être un objet purement économique.** Il ne projette pas la force
  (l'ADR 0013 tient), il la **nourrit**. C'est un rôle militaire qui ne demande aucune exception.
- **Le raid gagne enfin un sens militaire.** Jusqu'ici on désactivait un avant-poste pour couper
  une exploitation. Désormais on le désactive aussi pour **affamer l'armée qui campe autour**.
  Le vocabulaire (garnison, contesté, désactivé) cesse de promettre plus que la règle ne tient.
- **La distance redevient un coût continu**, et pas seulement un temps de trajet payé une fois.
  C'est le levier central mesuré par la simulation (14 min / 1 000 km), prolongé dans la durée.
- **Le 🔴 y trouve une prise.** L'avantage d'isolement des États-Unis tient à ce qu'agir loin
  coûte cher une fois. Un entretien majoré rend l'occupation lointaine coûteuse *en continu* —
  ce qui frappe l'isolé qui sort comme le voisin qui reste, mais donne au simulateur refondu un
  troisième levier à mesurer, à côté du coût de la distance et des portes de domaine.

**Ce qu'il faut trancher** : la valeur de N, et si le rayon d'un avant-poste **adverse ou allié**
nourrit aussi. Mon avis : non — sinon camper chez l'ennemi devient confortable.

## 3. Le repérage : deux pièges

### a. Il déprécie l'agent dormant

La fiche 04 donne à l'agent dormant « posé dans un pays neutre, révèle en continu les arcs
proches », au prix d'un ravitaillement **et d'un slot**. Une infanterie posée ferait la même chose
pour moins cher, et six couples nation × doctrine reposent sur Influence.

Il faut donc que les deux ne fassent pas le même travail :

| | Troupe posée | Agent dormant |
|---|---|---|
| Portée | courte | longue |
| Identification | jamais | possible |
| Est une cible | oui | non |
| Coûte un slot de mouvement | non | oui |
| Compte dans le plafond de troupes | oui | non |

La troupe voit **court, et ne perce rien** : un fil, un cap, un domaine — exactement ce que la
fiche 04 accorde déjà à un mouvement détecté non identifié. L'agent garde la portée, la
discrétion et l'identification. Aucun des deux ne remplace l'autre.

### b. On ne se poste pas pour voir ce qui vole déjà

L'ADR 0018 §3 est explicite : **l'interception se calcule une seule fois, au départ du mouvement**,
contre ce qui se trouve déjà sur le plateau — jamais recalculée. L'ADR 0008 ajoute que la
révélation par brouillard est *la même intersection segment/cercle, calculée au même moment*.

Donc une troupe posée après le départ d'un mouvement **ne le verra jamais**. C'est structurel, ce
n'est pas un défaut, et c'est même un bon design : **le renseignement est un pari, pas une
réaction.** On se poste en prévision de ce qui passera, jamais pour rattraper ce qui passe. Il
faut l'écrire, sinon ça se lira comme un bug le premier jour.

Bonne nouvelle collatérale : le mouvement vers un point arbitraire n'ajoute **aucune géométrie
nouvelle**. Tout est déjà en segments et en cercles, et la grille de routage (ADR 0012) travaille
déjà en raster, pas en centroïdes de régions.

## 4. Ce qui tombe

- **La décision 12a** — « aucune troupe posée librement sur la carte, l'adresse d'une troupe est
  son bâtiment » (`flux-mouvement-en-carte.md`, § Interdits). C'est l'inverse exact de ce qui est
  décidé.
- **`Column.origin`** et tout ce qui en dépend : il n'y a plus d'origine privilégiée.
- **L'ordre `recall`** : sans origine contrainte, rentrer est un mouvement comme un autre.
- **Le type de mouvement `outpost`** : fonder devient une action **sur place**, faite par une
  colonne déjà arrivée. Une branche de moins dans la rose des vents.
- **L'ADR 0019 première version** (« l'avant-poste ouvre le terrain, il ne projette pas ») :
  jamais accepté, remplacé.
- **Le prompt `rose-muette-et-ralliement.md`** : il n'y a plus de rose muette si tout est légal
  partout, et plus de mot « rappel » à corriger.
- **Le regroupement du widget de troupes par bâtiment** : une troupe n'a plus de bâtiment pour
  adresse. Regroupement par proximité, ou liste plate — à maquetter.

## 5. Ce qui s'amende

- **ADR 0013** — les bâtiments de projection ne conditionnent plus le *départ*, seulement le
  **changement de domaine** : port pour embarquer, aérodrome pour décoller. La caserne redevient
  ce qu'elle est déjà par ailleurs, un bâtiment de recrutement.
- **ADR 0018 §3** — « la cible d'une colonne ne l'intercepte pas en chemin » (`except:
  aim.outpostId`) devient inutile : plus rien de stationnaire n'intercepte, l'exception disparaît
  au lieu de s'étendre. La règle se **simplifie**.
- **Fiche 03** — l'avant-poste gagne un rôle de ravitaillement, à côté du rayon de construction.
- **Fiche 04** — les troupes posées deviennent une quatrième source de détection, après le
  territoire, la station d'écoute et l'avant-poste d'écoute.

## 6. Ce qui ne bouge pas

L'irréversibilité d'un mouvement en vol. Les slots (ADR 0006). Le brouillard (ADR 0005). Le
combat déterministe et le rejeu (ADR 0008, 0014, 0018). L'avant-poste qui se désactive et ne se
prend jamais (ADR 0004). Les bâtiments posés sur des régions (ADR 0015) — **les points sont pour
ce qui bouge et ce qui se conteste, les régions pour ce qui produit.**

## 7. Ce qui reste ouvert

- **La valeur du multiplicateur d'entretien**, et s'il vaut aussi hors du rayon d'un avant-poste
  allié. À mesurer au simulateur refondu.
- **Le rayon de repérage d'une troupe posée.** Il doit être franchement plus court que celui de la
  station d'écoute, sans quoi §3.a se rouvre.
- **Peut-on se poser en territoire adverse ?** Mon avis : oui, et rien ne l'interdit
  spécialement — mais l'entretien majoré s'y applique et le territoire adverse a son propre rayon
  de détection (fiche 04). Camper chez l'ennemi, c'est être vu et coûter cher. La règle se défend
  toute seule ; il faut juste vérifier qu'elle mord.
- **Le plafond de troupes devient le seul frein à la dispersion.** 24 troupes, dont chaque
  sentinelle est une troupe qui ne combat pas : l'arbitrage est bon, il n'est pas mesuré.
- **L'unité japonaise redirigeable en vol.** Mise de côté, mais elle casse l'irréversibilité, qui
  est la thèse du jeu et le levier de drame n°1. Quand elle reviendra, ce sera un ADR, pas un
  bonus de fiche nation.
- **Que devient une troupe posée quand la saison se conclut ?** Sans objet aujourd'hui, à ne pas
  oublier.

## 8. Découpage proposé, dans l'ordre

Aucun de ces prompts ne doit partir avant que l'ADR 0019 réécrit soit accepté.

1. **Le domaine et l'origine** — supprimer `Column.origin`, `recall` et le type `outpost` ;
   `refusalOf` ne garde que les portes de domaine (port, aérodrome) et les règles de cible.
   C'est le prompt qui débloque tout le reste et il enlève plus de code qu'il n'en ajoute.
2. **La visée sur un point** — `MovementAim` gagne une forme `point`. Absorbe
   `visee-au-dezoom.md`, qui reste valide et se renforce : un point se vise à toutes les échelles.
3. **L'adresse d'une troupe** — `stationedAt` devient soit un bâtiment, soit un point. Le widget
   de troupes et le panneau de garnison suivent.
4. **Fonder sur place** — l'avant-poste devient une action d'une colonne arrivée, plus un type de
   mouvement.
5. **L'entretien par ancrage** — le multiplicateur, en prolongement direct de
   `consommation-continue.md`, qu'il faut lire d'abord.
6. **Le repérage** — le rayon de détection d'une troupe posée, calculé au départ des mouvements
   adverses comme l'interception. Dernier, parce que c'est le seul qui ajoute un système.
