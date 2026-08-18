# Prompt Claude Code — ce qu'une troupe posée voit passer

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'**ADR 0019 §5**, l'**ADR 0005**,
l'**ADR 0018 §3** et `WWS/docs/design/04-information.md`. Ensuite `src/domain/interception.ts`
(`scheduleInterception`) et le chemin de révélation du brouillard.
Ne commit pas, ne push pas. **Dernier des six prompts de l'ADR 0019, et le seul qui ajoute un
système** — ne le prends pas avant que les cinq autres soient passés.

## Ce que tu codes

Une troupe posée révèle à son propriétaire les mouvements adverses qui passent dans
`SCOUT_RADIUS_KM`. Elle devient la **quatrième** source de détection, après le territoire, la
station d'écoute et l'avant-poste d'écoute (fiche 04).

`SCOUT_RADIUS_KM = 60`, dans `convex/constants.ts`. Le commentaire doit porter deux choses :

- **pourquoi 60** — le réalisme d'une infanterie, et franchement moins que
  `INTERCEPTION_RADIUS_KM` (200) et `OUTPOST_REACH_KM` (400). Une sentinelle qui verrait aussi loin
  qu'on intercepte rendrait la station d'écoute et l'agent dormant décoratifs, et six couples
  nation × doctrine adossés à Influence tomberaient avec eux ;
- **qu'elle est destinée à devenir une statistique de rôle** — un appareil de reconnaissance ne
  voit pas ce que voit un fantassin. Elle reste **une constante unique** tant que rien ne lit une
  seconde valeur : poser une table de neuf nombres avant d'avoir un second consommateur est la
  faute que D1 de `consommation-continue.md` a déjà écartée une fois.

## Ce que la troupe révèle, et ce qu'elle ne révèle pas

Un fil, un cap, un horaire estimé, un domaine. **Jamais le type, jamais la composition** — c'est
exactement ce que la fiche 04 accorde à un mouvement détecté non identifié, et c'est la condition
d'existence du leurre. Une troupe posée ne perce rien : l'identification reste l'affaire des
bâtiments et des placements qui la portent.

Le relevé se range dans l'encre du renseignement, ou dans l'encre critique si le cap croise le
territoire du joueur — la fiche 04 a déjà les trois familles, tu n'en ajoutes aucune.

## Le point structurant : quand le calcul a lieu

**Au départ du mouvement adverse, une seule fois, jamais recalculé.** C'est déjà la règle de
l'interception (ADR 0018 §3) et la même intersection segment/cercle que la révélation du
brouillard (ADR 0008) — tu réutilises la géométrie existante, tu n'en écris pas une nouvelle.

Conséquence : **une troupe posée après le départ d'un mouvement ne le verra jamais.** Ce n'est pas
un défaut, c'est le design — on se poste en prévision de ce qui passera, jamais pour rattraper ce
qui passe. Le renseignement est un pari, pas une réaction. **L'écran doit le dire**, sinon ce sera
lu comme un bug le premier jour ; trouve la formulation la plus courte qui le fasse comprendre
sans un paragraphe d'aide.

## Critères d'acceptation

- Un test : un mouvement adverse dont la route passe à moins de `SCOUT_RADIUS_KM` d'une troupe
  posée apparaît dans la vue de son propriétaire, sans type ni composition. À plus de
  `SCOUT_RADIUS_KM`, rien.
- Un test qui grave la règle temporelle : une troupe posée **après** le départ d'un mouvement ne
  le voit pas.
- Une troupe **en mouvement** ne repère rien — seule une troupe posée le fait.
- Le fan-out serveur ne se dégrade pas : vérifie contre `WWS/docs/technique/brouillard-et-fanout.md`
  et dis ce que ça coûte, chiffres à l'appui.
- Aucun texte affiché hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et
  `npm run test` passent.

## Ce que tu ne fais pas

Tu ne touches pas à l'agent dormant, à la sonde ni au leurre. Tu n'ajoutes aucune capacité
d'identification. Tu ne recalcules aucune détection en continu.
