# Prompt Claude Code — la déroute rentre, la passe du posé compte, l'exclusion se dérive

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'**ADR 0019 §3** (qui vient d'être complété
par ces trois décisions), l'**ADR 0018 §1** (le terrain nettoyé) et l'**ADR 0014**. Ensuite
`convex/movements.ts` (`sendHome`, `standAt`, `resolveContact`, `scheduleInterception`) et
`convex/victory.ts`. Ne commit pas, ne push pas.

Trois décisions tranchées le 18/08, issues de tes propres rapports. Applique-les, ne les
rediscute pas.

## 1. Un campement en déroute rentre au pays

`sendHome` ignore aujourd'hui toute troupe dont l'adresse est un point : après une arrivée
contestée, le vainqueur se pose et le vaincu **reste où il est** — deux forces ennemies à dix
kilomètres l'une de l'autre, définitivement, sans jamais se réengager.

La règle : **toute déroute rentre**, quelle que soit l'adresse du vaincu. L'ADR 0018 §1 dit « le
terrain nettoyé » ; un campement mis en déroute produit le même `return` que n'importe quelle
force — créé par la résolution, jamais ordonné, aucun slot, aucune porte de domaine (personne ne
l'a ordonné, il ne paie rien — même règle que `sendHome` applique déjà). Destination : le sol
national, comme pour une troupe dont le bâtiment a disparu — c'est la définition écrite de
l'adresse `null`, ne l'invente pas une seconde fois.

Un test : arrivée contestée, le posé perd — il est en `return` vers chez lui, le marcheur se pose.
Et le miroir : le posé gagne — le marcheur en déroute rentre, le posé n'a pas bougé.

## 2. La passe du posé compte pour la victoire — ratifié

`resolveContact` crédite l'attaquant, et dans un contact de campement l'attaquant est le posé. Un
joueur peut donc avancer sa condition de victoire sans avoir rien ordonné pendant la passe. **Ce
n'est pas un bug, c'est le paiement du pari** : poser le campement était l'ordre — il a coûté un
slot, une troupe sur vingt-quatre, et bientôt un entretien majoré. Un investissement qui ne paie
pas quand son pari réussit n'en est pas un.

Rien à coder : c'est le comportement actuel. Ce que tu fais : l'écrire là où on le cherchera — un
commentaire sur l'appel à `claimVictory` dans le chemin du contact, qui cite l'ADR 0019 §3, pour
que le prochain lecteur trouve une décision et non une surprise. Un test le grave : une passe
gagnée par un posé qui n'a rien ordonné avance sa victoire.

## 3. L'arrivée n'éteint l'interception que pour ce à quoi elle répondra

Ton « coin rare assumé » ne l'est plus : un raid visant l'avant-poste A fait perdre à la garnison
de l'avant-poste B, posé à 20 km de A, **l'intégralité de son filet d'interception** — alors que
l'arrivée ne répondra que pour A. Une garnison qui regarde passer l'ennemi sous ses murs contredit
« elle défend le sol où elle se tient », gravé la veille.

La règle qui remplace le rayon aveugle : **l'exclusion d'interception est exactement l'ensemble
des défenseurs que l'arrivée résoudra** — dérivée de la même logique que `defenceOf`, jamais une
seconde table :

- cible **point** → les forces à moins de `ARRIVAL_RADIUS_KM` du point (campements, garnisons,
  troupes de bâtiments dont la région répond par son point) ;
- cible **avant-poste** → la garnison de cet avant-poste, et elle seule ;
- cible **région** → ce que `defenceOf` y lit, et rien d'autre.

Si tu peux faire calculer l'ensemble par `defenceOf` lui-même (ou par une fonction que les deux
appellent), fais-le — deux copies de « qui répond ici » divergeraient, c'est le motif de tout ce
chantier. Le test du coin : raid sur A, garnison sur B à 20 km — **la garnison de B intercepte**,
et le raid sur A produit toujours une seule passe.

## Critères d'acceptation

- Les deux tests de déroute (§1), le test de ratification (§2), le test du coin (§3).
- Aucun `return` ne consomme de slot ni ne demande de porte.
- Plus aucune troupe posée ne survit à sa déroute sur place — si un chemin le produit encore,
  dis-le au lieu de le rustiner.
- Aucun texte affiché hors de `src/i18n/fr.ts`. Aucun terme banni. `npm run build` et
  `npm run test` passent.

## Ce que tu ne fais pas

Tu ne changes ni `INTERCEPTION_RADIUS_KM`, ni `ARRIVAL_RADIUS_KM`, ni la table de dégâts, ni
l'initiative du posé. Tu ne touches pas à l'entretien ni au repérage — leurs prompts suivent.
