# Prompt Claude Code — l'intégration du temps dans `settleStocks`

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md` et l'[ADR 0015](../../adr/0015-economie-v2-ressources-localisees.md).
Ne commit pas, ne push pas.

**Prérequis : `fenetre-industrie.md` est passé.** `settleStocks` y a gagné son rapport d'état par
chaîne ; ce prompt le conserve intégralement. Sinon, arrête-toi.

## Le défaut

`settleStocks` (`src/domain/economy.ts`) traite un intervalle long **comme un pas unique** : il
accumule tout d'abord — en écrêtant chaque ressource à son plafond — puis convertit une fois.

Conséquence mesurée, sur une configuration réelle (mine niveau 2, fonderie niveau 2, sans entrepôt) :

| Absence | une lecture | lectures horaires | perdu |
|---|---|---|---|
| 22 h | 176 | 176 | 0 % |
| 36 h | 200 | 288 | **31 %** |
| 72 h et au-delà | 200 | 400 | **50 %** |

**Ce n'est pas le plafond qui fait son travail.** Une mine sort 18 minerais par heure, la fonderie
en mange 16 : le bac reste plein à 400 et **la fonderie doit tourner indéfiniment**. Le calcul
actuel considère qu'elle reçoit 400 minerais en tout, en fait 200 d'alliage, et s'arrête.

> **Un plafond borne l'accumulation, jamais le débit.**

Le seuil est à 22 heures — le temps qu'un bac se remplisse. Au-delà, la production est perdue en
silence. L'ADR 0001 grave une saison longue **asynchrone** et la fiche 07 offre une fenêtre de repos
précisément pour qu'un joueur puisse s'absenter : le moteur punit aujourd'hui ce que le design
encourage.

**Et l'entrepôt masque le défaut.** À entrepôt niveau 2 la perte tombe à zéro, parce que le bac ne
sature plus jamais. Le joueur qui perd la moitié de sa production est donc **celui qui n'a pas
encore d'entrepôt** — le début de partie — et rien ne le lui dit.

## Le principe de la correction

> **Une conversion est bornée par ce qui lui est *passé entre les mains*, pas par ce qui *tient
> dans le bac*.**

Aujourd'hui `affordable` lit `settled[key]`, déjà écrêté au plafond. Il doit lire le **débit
cumulé** : le stock de départ plus tout ce qui a été extrait ou produit pendant l'intervalle,
**sans écrêtage**. Le stock stocké reste plafonné — c'est deux quantités différentes, et
aujourd'hui elles sont confondues.

Le surplus réellement perdu le reste : une mine dont le bac déborde gaspille son excédent. Mais la
fonderie voisine prélève sa part **avant** le débordement, ce qui est le comportement physique
attendu.

Vérification arithmétique, cas des 72 heures : les minerais passés valent `0 + 18 × 72 = 1296`,
donc `1296 / 2 = 648` de conversion possible ; le débit nominal borne à `8 × 72 = 576` ; la place
dans le bac d'alliage borne à `400`. Résultat **400**, exactement ce que donne le calcul par
tranches horaires. Le correctif est **en temps constant** — pas de boucle sur les heures écoulées.

## Ce à quoi tu dois faire attention

**La cascade.** L'alliage est produit par la fonderie **et** consommé par l'arsenal. `CHAINS` est
déjà ordonné pour ça, et le commentaire porte la raison. Le débit cumulé d'alliage vu par l'arsenal
doit inclure ce que la fonderie vient de produire dans le même intervalle — c'est le comportement
actuel, ne le perds pas.

**Le rapport d'état par chaîne doit rester juste.** Il distingue « à sec » (une entrée manque) de
« débordée » (la sortie est pleine). Avec le débit cumulé, une chaîne bornée par le débit nominal
n'est **ni** l'une **ni** l'autre : elle tourne. Une chaîne aujourd'hui rapportée « à sec »
uniquement parce que son entrée était écrêtée doit maintenant rapporter « tourne ». **Un test doit
graver ce changement**, sinon la fenêtre Industrie mentira dans l'autre sens.

**La projection à une heure**, introduite par le prompt Industrie pour éviter qu'une fenêtre de
zéro minute rapporte « tout tourne », reste valable et ne doit pas être défaite.

**Ne remplace pas le calcul par une boucle sur les tranches.** Une lecture après une semaine
d'absence itérerait des milliers de fois, à chaque requête, pour chaque joueur. Le correctif est
analytique.

## Une contrainte pour la suite, à respecter sans la coder

Le prompt suivant (`consommation-continue.md`) ajoutera un **drain** : l'entretien des troupes fera
*baisser* la nourriture. Ce sera le premier chemin décroissant du moteur, et il posera la question
symétrique : **à quel instant un stock s'est-il vidé ?** — pas seulement « vaut-il zéro ».

Tu ne codes aucun drain ici. Mais **structure `settleStocks` pour qu'un taux net négatif puisse
s'ajouter sans réécrire l'intégration une deuxième fois**, et dis en commentaire où il se
branchera. C'est la même racine que le défaut corrigé ici : un long intervalle traité comme un pas
unique.

## Critères d'acceptation

- Une absence de 72 h avec mine niveau 2 et fonderie niveau 2 produit **400** d'alliage, pas 200 —
  la même valeur que soixante-douze lectures horaires successives.
- **Un test compare les deux chemins** : une lecture unique sur `N` heures et `N` lectures d'une
  heure donnent le même résultat, à l'arrondi près, pour au moins 4 h, 24 h, 72 h et 168 h.
- Une ressource dont le bac déborde perd bien son excédent : le stock final ne dépasse jamais son
  plafond.
- Un joueur sans entrepôt et un joueur avec entrepôt niveau 2 obtiennent la **même production**
  après 72 h d'absence ; seul leur stock final diffère.
- La cascade tient : l'arsenal consomme l'alliage produit par la fonderie dans le même intervalle.
- Le rapport d'état par chaîne reste juste, et le passage de « à sec » à « tourne » pour une entrée
  autrefois écrêtée est couvert par un test.
- Aucune boucle dont le nombre d'itérations dépend du temps écoulé.
- `npm run build` et `npm run test` passent ; aucun terme banni.

## Ce que tu ne fais pas

Tu ne touches à aucune valeur de `constants.ts` — ni plafond, ni débit, ni taux d'extraction. Le
correctif est dans le calcul, pas dans l'équilibrage : si un nombre te paraît devoir changer une
fois le moteur juste, **signale-le, c'est une décision de design**. Tu n'ajoutes aucun drain, aucune
consommation continue, aucune interface. Tu ne touches pas à la fenêtre Industrie au-delà de ce que
le changement de calcul impose.
