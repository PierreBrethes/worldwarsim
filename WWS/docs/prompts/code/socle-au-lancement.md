# Prompt Claude Code — le socle au lancement et la ligne de départ par format

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, les ADR `0001` et `0015`, puis
`WWS/simulation/opening/README.md` — l'instrument qui a produit tous les chiffres ci-dessous.
Ne commit pas, ne push pas.

## Contexte — ce qui a été mesuré

`WWS/simulation/opening/` a mesuré l'ouverture telle qu'elle est codée aujourd'hui. Trois
constats, tous reproductibles par `node run.mjs` :

**Sur les treize bâtiments abordables au lancement, un seul ne tue pas la saison.** L'alliage est
la monnaie universelle, sa seule source est la fonderie, et le socle minimal — mine de charbon,
mine de minerai, fonderie — coûte 110 d'alliage quand le kit en donne 100. La seule ouverture
survivante est mine de charbon → fonderie → mine de minerai, dans cet ordre exact, et elle
termine à zéro. **Une ferme à 20 d'alliage suffit à perdre la saison**, sans que rien à l'écran
ne le dise.

**Une saison de 48 h offre 8 actions au joueur.** Sur douze connexions d'un joueur assidu,
quatre n'ont strictement rien à proposer. Ce n'est pas un défaut de rythme, c'est un défaut de
ligne de départ.

**Le plafond de bâtiments n'y est pour rien.** Le faire passer de 8 à 12 au QG 2 ne change
aucune mesure. N'y touche pas dans ce prompt.

## Ce que tu codes

### 1. Un format de saison, avec sa ligne de départ

Deux formats. **Ils partagent une seule économie** — mêmes taux d'extraction, mêmes chaînes,
mêmes coûts. Ce qui change est *où l'on entre dans la courbe*, jamais sa pente : multiplier le
temps ne compresse pas le sommeil, et la fenêtre de repos de sept heures (fiche 07) deviendrait
absurde.

| | `skirmish` (48 h) | `campaign` (7 j) |
|---|---|---|
| QG au lancement | 2 | 1 |
| `MAX_HQ_LEVEL` | 3 | 5 |
| socle | mine charbon, mine minerai, fonderie, entrepôt, ferme, **arsenal** | mine charbon, mine minerai, fonderie |
| alliage de départ | **1000** | à mesurer, ne le devine pas |

Le format vit dans `convex/constants.ts` sous forme d'une table par clé de format, lue par
`seasons`. Aucune autre valeur numérique ne se dédouble : si tu te retrouves à écrire un
deuxième taux d'extraction, tu as pris le mauvais chemin — reviens et signale-le.

**Le 1000 d'alliage est mesuré, pas choisi** : à 800 le joueur obtient 14 actions, à 980 il en
obtient 28, à 1300 toujours 29. Le palier est réel. **Signale-le comme fragile** : entre 820 et
940 la courbe est non monotone parce que l'ordre des clics compte plus que les paramètres. C'est
un symptôme, pas un réglage — voir « ce que ce prompt laisse ouvert ».

### 2. Le socle est *placé* par le joueur, pas offert

Le joueur choisit ses régions — c'est le seul geste de l'ouverture qui a du sens, et il en aura
davantage quand les bâtiments se pilleront. Ce qu'on lui retire, c'est le prix et l'attente de
ce qui n'est pas une décision.

La forme la plus petite qui tienne : tant qu'une clé du socle du format n'est pas encore posée,
`constructions.start` la **facture zéro et la termine immédiatement**. Tout le reste des règles
de pose continue de s'appliquer sans exception — gisement requis, une bâtisse par région, pays
d'origine, `placementRefusal` inchangé. Aucune pose automatique : une saison lancée dont le socle
n'est pas posé est un état normal, et l'écran doit pouvoir le dire.

Le QG reste planté au niveau du format dès le lancement (ADR 0015), il n'entre pas dans ce
mécanisme.

### 3. Ce que tu ne fais pas

- **Pas de rail scripté** ni de tutoriel qui impose l'ordre. Le socle placé rend déjà tout
  premier coup non fatal — mesuré : 0 coup fatal sur les quinze bâtiments, contre 12 aujourd'hui.
- **Pas de récompense d'étape.** Elles récompensent la fréquence de connexion, ce que la fenêtre
  de repos essaie de contenir, et sous leur forme habituelle elles violent la règle « un bonus
  casse une règle, jamais un pourcentage ».
- **Pas de chantiers en parallèle.** Sans effet tant que l'alliage est le goulot, et il l'est
  partout : à la fin de chaque saison simulée l'alliage est à 20-40 et *toutes les autres
  ressources sont à leur plafond*.
- **Ne touche pas** à `EXTRACTION_PER_HOUR`, `CHAINS`, `LEVEL_COST_FACTOR`, `BUILDING_CAP_*`,
  ni au catalogue de bâtiments. Un seul sujet par prompt.

## Ce que ce prompt laisse ouvert — signale, ne tranche pas

Trois choses sont mesurées et demandent une décision de design, pas de code. Si l'une te semble
bloquante pour ce que tu codes, **arrête-toi et dis-le** :

- **L'arsenal dans le socle est ce qui allume la boucle de recrutement**, et c'est aussi ce qui
  fait pencher la balance : chaque bâtiment ajouté au socle *retire une action* de la saison.
  Avec l'arsenal *et* la caserne au socle, un joueur assidu passe à huit connexions vides sur
  douze. Le socle protège du blocage en dépensant les choses à faire.
- **Les munitions sont une taxe sur l'infanterie et sur rien d'autre.** La charge est dérivée de
  l'effectif, donc elle vaut 20 pour une infanterie (53 % de son prix réel) et 4 pour une escorte
  (2 %). Une infanterie revient à 38 d'alliage pour 50 points d'effectif — 0,8 par point — contre
  29,8 pour une escorte. Un facteur 37 entre les deux extrêmes.
- **`TROOP_CAP_TARGET = 24` n'existe pas en 48 h.** Le format met sur pied 5 à 8 troupes ; passer
  la cible de 24 à 12 ne change strictement aucune mesure. Ce qui borne l'armée courte, c'est le
  débit de l'arsenal — 3 munitions par heure et par niveau — pas le plafond.

## Critères d'acceptation

- Les tests existants passent, et `convex/economy.test.ts` gagne le cas qui compte : **une saison
  lancée en `skirmish` porte son socle debout, et aucune première pose légale ne rend le socle
  inatteignable.**
- Une saison lancée sans que le socle soit posé est un état valide et lisible ; la poser ne
  débite rien et n'ouvre aucun chantier.
- `node WWS/simulation/opening/run.mjs`, après mise à jour de `constants.mjs` sur les nouvelles
  valeurs, doit donner pour le joueur assidu en 48 h : **au plus une connexion vide sur douze**,
  et **au moins 25 actions** sur la saison. C'est le garde-fou : s'il ne mord pas, la ligne de
  départ n'a pas bougé.
- `WWS/simulation/opening/constants.mjs` est resynchronisé dans le même passage — il est un
  miroir, et un miroir en retard fait mentir l'instrument.
- Aucun terme banni (`tick`, `temps réel`, `micro`, `base`, `rush`).

## Après ce prompt

Le catalogue de bâtiments qui s'ouvre par palier de QG — exploitation et transformation au QG 1,
projection au QG 2, renseignement au-dessus. C'est une bonne idée en soi et cohérente avec « le
QG est l'unique étranglement », mais elle ne règle plus rien d'urgent une fois le socle posé :
elle attendra son propre prompt, et l'entrepôt devra y rester accessible au QG 1.
