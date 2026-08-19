# Prompt Claude Code — le mouvement terrestre, l'avant-poste et la portée

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, `WWS/CONTEXT.md`, les ADR `0004` (avant-postes),
`0006` (slots de mouvement), `0012` (trajets multimodaux sur grille), `0013` (bâtiments de
projection), `0015` (économie v2), `0017` (format et socle), la fiche `03`, et
`WWS/docs/design/propositions/plan-progression-v1.md` — c'est l'étape 2 de sa route de dev.
Ne commit pas, ne push pas.

## Repère l'existant d'abord — et arrête-toi si le sol manque

Avant d'écrire une ligne, liste-moi ce qui existe réellement : les types `MovementType` et
`ArcView` de `src/domain/`, ce que `convex/schema.ts` porte (y a-t-il une table de mouvements ?),
et surtout **l'état de la grille de trajets de l'ADR 0012 côté serveur**. Le prototype
`carte-3d.html` sait tracer des arcs ; la question est ce que le back sait *calculer*.

**Si la grille multimodale n'est pas utilisable côté serveur, arrête-toi là et dis ce qui
manque.** L'ADR 0012 est verrouillée : un trajet se calcule sur la grille, pas à vol d'oiseau.
Improviser une distance grand-cercle « en attendant » créerait un deuxième système de trajets
qu'il faudrait ensuite déloger — c'est exactement le genre de dette que ce dépôt refuse.

## Ce que tu codes — la boucle d'expansion, minimale

Le deuxième acte du jeu : **voir le gisement → marcher → poser l'avant-poste → construire
dessus.** Quatre morceaux, dans cet ordre, chacun testable seul.

### 1. Le mouvement terrestre

Un mouvement part d'un bâtiment de projection de son domaine (ADR 0013) — pour la terre, la
caserne. Type `outpost` d'abord : il emporte de l'infanterie, sa destination est un point, son
arrivée fonde l'avant-poste. Durée lue sur la grille (ADR 0012). Les slots de mouvement
(ADR 0006) s'appliquent s'ils existent ; s'ils n'existent pas, **un seul mouvement en vol par
joueur** en attendant — une contrainte simple qui ne préjuge pas du système à venir, dis-le en
commentaire.

La fenêtre de repos (fiche 07) interdit les **arrivées** chez un joueur au repos — vérifie
comment elle est portée avant de la brancher, et si elle n'est portée nulle part, signale-le
plutôt que de l'inventer.

### 2. L'avant-poste

Un **point** `{lon, lat, propriétaire, niveau, spécialisation}`, jamais un polygone (fiche 03).
Deux spécialisations au lancement : **relais** et **écoute** — des coquilles s'il le faut (leurs
effets attendent leurs systèmes), mais le champ existe et se choisit à la fondation,
irréversible.

**La spécialisation « Extraction » disparaît de la fiche 03** (décision du 18/08) : l'avant-poste
ne remplace aucun bâtiment de base. L'extraction à l'étranger, ce sont les vrais bâtiments de
l'économie v2, posés via la portée ci-dessous. Mets la fiche 03 à jour dans le même passage, et
ajoute-y une note : le score d'Hégémonie (« avant-poste-heures d'extraction ») devra se recompter
en *bâtiment-heures à l'étranger* — *signale* cet amendement, ne l'implémente pas, les doctrines
ne sont pas codées.

D'autres spécialisations viendront (une pharmacie de campagne a été évoquée) : le type doit les
accueillir sans migration, c'est tout ce qu'on leur doit aujourd'hui.

**Pas de raid dans ce prompt.** Désactivation, destruction, immunité : tout ça exige le combat
(étape 3). L'avant-poste de cette étape se fonde et sert ; il ne se conteste pas encore.

### 3. La portée

Un avant-poste **débloque la construction dans les régions autour de lui** — c'est la demande de
design, et sa traduction technique est contrainte : la portée se mesure **en kilomètres, jamais
en nombre de régions**. « Les régions dont le point de pose est à moins de `OUTPOST_REACH_KM`
de l'avant-poste. » La règle générale de l'ADR 0015 l'exige — aucune quantité ne se compte en
régions — et la carte le punit sinon : 232 districts au Royaume-Uni contre 16 Länder en
Allemagne, un rayon compté en régions ferait de Natural Earth l'équilibreur du jeu. L'*effet*
reste « quelques régions autour » ; leur *nombre* variera selon le pays, et c'est la géographie
qui parle, pas un bug.

`constructions.start` remplace son refus `REGION_NOT_HOME` par : pays d'origine, **ou** région
à portée d'un avant-poste du joueur. Toutes les autres règles tiennent — gisement requis, une
bâtisse par région, plafond porté par le QG, chantier unique. Un puits en Arabie est un bâtiment
comme les autres : compté, plafonné, et pillable le jour où le pillage existe.

### 4. La mèche de pétrole

`STARTING_STOCK` gagne du pétrole, au niveau du **format** : `skirmish` 60, `campaign` 40 —
placeholders, comme tout `constants.ts`. Le sens est dans le commentaire : c'est la **réserve
qui permet le premier voyage vers le pétrole**, et sa finitude est le moteur des nations qui
n'en ont pas (le script de gisements le dit déjà du Japon). Quand `consommation-continue.md`
fera boire les motorisés, cette réserve deviendra une mèche datée ; elle devra alors être
dimensionnée en voyages, pas en litres — laisse cette note à côté du nombre.

**Pas de table par nation.** Un seul nombre par format : l'asymétrie vient de la carte — les
nations à pétrole se refont, les autres vivent sur la réserve. Une table de huit valeurs à la
main serait huit nombres de plus à équilibrer pour un effet que la géographie donne gratuitement.

## Ce que tu ne fais pas

La visibilité des gisements sur la carte (9a) est **déjà acquise techniquement** —
`public/deposits.json` est un fichier client ; les pictogrammes sur la carte sont un prompt UI
séparé. Pas de raid, pas d'interception, pas de consommation de pétrole en route, pas de
mouvement naval ni aérien, pas de rendement décroissant par pays hôte (il attend qu'il y ait
plus d'un extracteur à l'étranger par joueur pour se mesurer). Tu ne touches pas aux doctrines.

Si un de ces morceaux te semble impossible sans en ouvrir un autre, **arrête-toi et dis-le**.

## Critères d'acceptation

- Les tests existants passent. Nouveaux cas : un mouvement `outpost` part d'une caserne, arrive,
  fonde ; une construction sur région étrangère à portée est acceptée, hors portée refusée avec
  un code d'erreur qui **nomme la portée** (« aucun avant-poste à moins de X km »), jamais un
  refus muet.
- La fiche 03 ne mentionne plus la spécialisation Extraction, et porte la note d'amendement
  Hégémonie.
- `node WWS/simulation/opening/verify.mjs` sort en code 0 — le miroir suit `STARTING_STOCK` et
  toute constante nouvelle (`OUTPOST_REACH_KM`).
- Le garde-fou de `run.mjs` tient toujours en skirmish.
- Aucun terme banni (`tick`, `temps réel`, `micro`, `base`, `rush`). Un avant-poste est
  *désactivé* ou *détruit*, jamais pris — même si ni l'un ni l'autre n'est codé ici, aucun nom
  de champ ne doit préparer une « capture ».
