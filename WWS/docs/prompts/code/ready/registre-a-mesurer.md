# Prompt Claude Code — le registre des constantes à mesurer

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, puis `convex/constants.ts` en entier et
`WWS/docs/adr/0018-anatomie-de-la-passe-de-resolution.md` §5 — c'est lui qui a inventé la
catégorie que ce prompt outille. Ne commit pas, ne push pas. **Petit prompt, un seul sujet.**

## Pourquoi

Le projet a une catégorie de constantes bien à lui : les **placeholders assumés** — des valeurs
choisies pour que la règle existe et se mesure, jamais pour équilibrer quoi que ce soit.
`INTERCEPTION_RADIUS_KM` l'a inauguré (ADR 0018 §5, « le trou le plus béant du modèle »), et le
chantier de l'ADR 0019 en a semé une dizaine d'un coup : `ARRIVAL_RADIUS_KM`, `SCOUT_RADIUS_KM`,
`UPKEEP_UNSUPPLIED_MULTIPLIER`, `LIFT_CAPACITY`, `LIFT_COST`…

Chacune porte son commentaire, mais **aucune liste n'existe** — et c'est le simulateur refondu
(`QUESTIONS.md`, 🔴) qui en aura besoin : sa feuille de mesure, c'est exactement cette liste. Une
liste à la main dériverait à la première constante ajoutée, comme les fiches ont dérivé. Elle sera
donc **générée**.

## Ce que tu codes

1. **Le marqueur.** Une ligne `@a-mesurer <raison courte>` dans le commentaire de chaque constante
   assumée. Tu poses le marqueur sur celles qui existent — cherche les commentaires qui disent
   « assumé », « placeholder », « non mesuré », « not measured », « arbitrary », et juge sur
   pièce : une constante *mesurée* (les 14 min/1 000 km, le kit à 1000 — même si sa mesure est
   périmée, elle a un instrument) n'en reçoit pas ; une constante *décidée* (une règle, pas un
   réglage — `TROOP_CAP_TARGET` par exemple) non plus. En cas de doute, marque et dis-le dans le
   rapport : retirer un marqueur est trivial, retrouver une constante oubliée ne l'est pas.
2. **Le script.** `scripts/generate-a-mesurer.mjs`, sur le modèle des générateurs existants :
   il balaie `convex/` et `src/domain/`, extrait chaque marqueur avec le nom de la constante, sa
   valeur actuelle, le fichier:ligne et la raison, et écrit
   `WWS/docs/technique/a-mesurer.md` — un tableau, une ligne d'en-tête qui dit que le fichier est
   généré et par quoi, et la date **du contenu source, pas de la génération** (le hash court git
   de HEAD fait l'affaire ; pas d'horloge, le fichier doit être identique à source identique).
3. **Le garde-fou.** Le script sort en erreur si un marqueur est illisible (pas de raison, pas de
   constante nommable sur la ligne suivante). Un test l'appelle et compare sa sortie au fichier
   commité — même mécanique que les autres actifs générés : si quelqu'un édite le tableau à la
   main ou pose une constante marquée sans régénérer, le test casse.

## Ce que le registre n'est pas

Pas une liste de dettes ni de TODO — il y a `QUESTIONS.md` pour les questions et les prompts pour
le travail. Une entrée du registre est une **valeur en attente de son instrument**, rien d'autre.
Quand le simulateur mesure une constante, on retire le marqueur et la ligne disparaît à la
régénération — le registre a vocation à se vider, et sa taille est en soi une mesure de la dette
de calibrage.

## Critères d'acceptation

- `node scripts/generate-a-mesurer.mjs` produit `WWS/docs/technique/a-mesurer.md` ; le rapport
  liste les constantes marquées et celles écartées avec la raison de chaque écart.
- Le test de fraîcheur casse si le fichier ne correspond plus aux marqueurs — vérifie-le en
  éditant le fichier à la main, puis restaure.
- Le script sort en erreur sur un marqueur sans raison — vérifie-le aussi, puis restaure.
- Aucun terme banni. `npm run build` et `npm run test` passent.

## Ce que tu ne fais pas

Tu ne changes la valeur d'aucune constante. Tu ne marques rien dans `WWS/simulation/` — le miroir
suit `convex/constants.ts`, il n'a pas d'opinion. Tu ne touches pas à `QUESTIONS.md`.
