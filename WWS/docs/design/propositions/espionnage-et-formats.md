# Proposition — Espions à paliers, et un seul jeu à deux vitesses

**Statut : proposition.** Rien ici n'est acté. Deux sujets liés : un système d'espionnage
incarné pour les saisons longues, et la question des formats de partie — posée en
**révision assumée de l'ADR 0001**, jamais en glissement silencieux. Session du 14/08/2026.

## 1. Les espions

Chaque nation dispose d'un petit corps d'**agents nommés** (1 à 5) — dossier, nom,
visage. Ce sont les seuls personnages persistants du jeu : ils gagnent de l'expérience,
se font capturer, s'échangent. C'est voulu — l'échange de prisonniers entre amis
(« rends-moi Duval ») est une machine à histoires.

### L'implantation : du temps risqué, pas des jets de dés

On envoie un agent sur une région adverse. L'implantation **prend du temps** — fonction
de la distance à sa frontière la plus proche ou à sa station d'écoute la plus proche —
et pendant ce temps s'ouvrent des **fenêtres de découverte** périodiques, dont la
fréquence dépend de l'écoute adverse. Pas de pourcentage sec : en asynchrone, un échec
aléatoire après six heures d'attente est une punition sans histoire ; une progression
visible sous menace périodique est une tension.

### Trois paliers, risque croissant

| Palier | Ce que l'agent apprend | Note |
|---|---|---|
| 1 — implanté | la région est vide, ou porte un bâtiment, ou des troupes | |
| 2 — infiltré | le **type** du bâtiment | |
| 3 — en place | selon le bâtiment : **QG** → vole de la recherche (rattrapage si la cible a l'avance technologique) · **production / stockage** → détourne des ressources · **bâtiment militaire** → vision sur les unités rattachées | le palier 3 militaire **est** la mécanique d'« identification » actée dans la fiche 04 : c'est comme ça qu'on perce un mouvement |

Chaque palier rallonge l'exposition. Monter coûte du temps ; rester en place aussi.

### Capture, échange, mémoire

Un agent découvert est **exécuté** ou **emprisonné** — monnaie d'échange si l'adversaire
détient aussi les vôtres. L'expérience rend les agents précieux : capturer plutôt
qu'exécuter devient rationnel. Un agent découvert dans un pays **ne peut plus jamais y
retourner** : son visage est connu.

### Le geste du défenseur

L'espionnage subi serait une loterie. La **station d'écoute** gagne un rôle actif : la
**battue** de contre-espionnage — coûteuse, ciblée sur ses propres régions, elle force
tout agent implanté à un test immédiat. Le défenseur choisit quand ratisser.

### Articulation avec la fiche 04 et la doctrine Influence

Les agents **remplacent** la sonde et l'agent dormant (ils font mieux, incarné).
Le **sabotage reste l'exclusivité d'Influence** — c'est sa prise sur la partie, la
raison d'être de la doctrine (fiche 04) — et Influence gagne des bonus d'espionnage
(implantation plus rapide, expérience accélérée). Le leurre est inchangé : identifier
un leurre gaspille l'effort de renseignement, c'est son rôle.

## 2. Un seul jeu, deux vitesses

La tentation : un format Blitz (< 1 jour, reconnaissance par les troupes, intense) et un
format long (7 jours, espions). Le danger : **deux jeux** — double équilibrage, double
simulation, double interface, pour un développeur solo. Et l'ADR 0001 a précisément
rejeté la partie courte nerveuse.

La proposition : **les mécaniques ne changent jamais, seules les constantes changent.**
Les paliers d'espionnage se comptent en heures. Dans une saison d'un jour, aucun agent
ne dépasse le palier 1 — naturellement, les troupes redeviennent les seuls yeux, et la
saison est tendue. Dans une saison de sept jours, l'espionnage déploie ses trois paliers
et devient une occupation de fond — potentiellement la moitié du jeu vécu. Le format est
un curseur (durées, seuils), comme le temps de trajet. Jamais un embranchement de règles.

Si la saison courte exige un jour de vraies règles dédiées, ce sera une révision de
l'ADR 0001, discutée comme telle.

## Questions ouvertes

- Combien d'agents au départ, et comment en gagner (casernements ? QG ? événement) ?
- Le détournement de ressources (palier 3) : flux continu ou coup unique ?
- La battue : son coût, sa fréquence maximale, ce qu'elle révèle en cas d'échec.
- L'expérience : accélère la montée en palier, ou seulement la survie ?
- Ce que voit l'adversaire d'une exécution ou d'un échange (public ? dépêche ?).
