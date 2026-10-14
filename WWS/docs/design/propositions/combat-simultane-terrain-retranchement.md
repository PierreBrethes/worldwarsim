# Le combat après le 16/09 — simultané, contact, terrain, retranchement (décisions, 16/09/2026)

> **Révision du 14/10/2026 : l'initiative revient (ADR 0014, B16/B17) ; la passe simultanée ne survit que comme choc (`mode: 'shock'`) — ce qui suit décrit la règle du 16/09.**

**Statut : décisions de Pierre du 16/09/2026**, prises en session Cowork à partir d'une idée de
« portée d'attaque » à la Advance Wars. Ce doc dit ce qui est tranché, ce qui existait déjà sous
un autre nom, et ce qui attend. Il est la source de la révision de l'ADR 0014 et des entrées
28-30 du Registre (`RESTE-A-CODER.md`).

## 1. La résolution devient simultanée (1b — révise l'ADR 0014)

L'ADR 0014 donnait l'initiative à l'attaquant : il frappe, le défenseur riposte avec ses
survivants. **Décision : les deux camps tirent en même temps, sur l'état d'avant la passe**, les
pertes s'appliquent ensemble. Ce qui tient : une seule passe, déterministe, la table de dégâts par
couple de rôles avec ses cases vides (« ne peut pas atteindre » — un blindé ne touche toujours pas
un bombardier, dans un sens comme dans l'autre), le défenseur à `DEFENDER_BONUS`, la déroute
sous `ROUT_THRESHOLD`, les munitions tirées. Ce qui disparaît : la phase « riposte » et
l'avantage de tirer le premier (mesuré à 1,4 : 1 en plaine par `chiffrage-combat.md` §4).

Conséquence assumée : à forces égales, l'attaquant perd (le défenseur a ×1,15, lui rien).
L'attaque ne vaut qu'en supériorité ou en surprise — « les défenseurs dépensent moins que les
attaquants ». C'est un jeu plus prudent ; mesure : rapport pertes attaquant / défenseur par
engagement sur une saison. Prompt : `prompts/code/ready/resolution-simultanee.md`.

## 2. La portée de contact existe déjà (4a)

« Portée d'attaque = corps à corps, ~20 km » : c'est `ARRIVAL_RADIUS_KM = 25` (`@a-mesurer`). Une
attaque est un mouvement qui *arrive* sur un objet relevé (ADR 0024) ; le contact, c'est
l'arrivée. **Une seule constante**, renommée *portée de contact* dans les docs, pas dans le code.
La portée de détection reste celle de l'ADR 0021 §1 (`DETECTION_RANGE_KM`, par rôle, meilleure
de la pile) — « détecter n'est pas combattre » tient. Les deux se dessinent autour de la pile
sélectionnée, **une encre, deux traits** : plein pour le contact, tireté pour la détection —
l'ambre du plateau, jamais le rouge ni le bleu, qui sont des encres de sol (`reach.ts`). Prompt :
`prompts/code/ready/deux-cercles-autour-de-la-pile.md`.

## 3. Le terrain attend ses données (1a — Registre 29)

Le type de terrain affiché au survol est un **hash du nom de la région** (`world.ts:130`) ; aucune
règle ne peut le lire (`CLAUDE.md`). Les valeurs sont écrites (`chiffrage-combat.md` §4 :
désert ×0,95 → montagne ×1,20, pour le défenseur). Ordre : (1) **cuire un terrain réel** — un
script lit une source publique (relief ou couvert végétal) et écrit un type par cellule de
`grid.json` ou par région de `region-index.json`, au même titre que terre/mer/canal ; (2) une ADR
qui autorise une règle à le lire ; (3) le modificateur, pour le sol seulement. Après le gameplay,
pas avant.

## 4. Le retranchement (2a — Registre 30)

Une force posée depuis longtemps, ou en garnison d'un point ou d'un bâtiment à soi, tient mieux
qu'une colonne arrêtée hier soir. **Bonus de position, plafonné à 5-10 % au plus**, lisible : la
fiche de la troupe sélectionnée affiche le bonus en cours et le temps posé. À chiffrer avec le
terrain (les deux se cumulent sur le défenseur, le plafond cumulé est à fixer). Non tranché : la
durée pour atteindre le plafond, si la garnison d'un point vaut le plafond d'emblée.

## 5. L'artillerie, plus tard (Registre 28)

Pas de dixième rôle pour l'instant. Quand il viendra : tir sur un objet **relevé** (ADR 0024)
dans une portée de tir **minimale et maximale**, sans riposte de la cible, la pièce **aveugle
seule** (détection courte, un observateur la sert) et **ne ripostant jamais** au contact ; sa salve
la relève chez la cible (contre-batterie). La salve d'allonge reste abandonnée : ce n'est pas
elle.

## Ce qui reste ouvert

- L'aperçu d'avant bataille ne pourra jamais donner un chiffre : le relevé ne sert pas la
  composition adverse (ADR 0024 §1). Une fourchette sur *ses* pertes, au mieux.
- Attaquant contre attaquant : impossible aujourd'hui (une attaque vise un camp) ; naît avec
  « intercepter » (vision V1, point 2).
