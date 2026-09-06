# La frappe de bâtiment — intégrité, désactivation, réparation (proposition, 06/09/2026)

**Décision de Pierre (06/09, 78a)** : les bâtiments ont une **intégrité** ; une frappe aérienne
en retire, à zéro le bâtiment est **désactivé**, jamais détruit ; il se répare seul. Cette
proposition fixe la règle assez pour un prompt. Elle se code **après le pillage** (file
`RESTE-A-CODER.md`) : l'attaque au sol doit exister avant l'attaque aérienne, sinon le bombardier
est la seule arme à gain.

## Le constat

`DAMAGE_TABLE` est troupe contre troupe : un bombardier (160 alliage) ne peut être envoyé que sur
des troupes, il n'a **rien à frapper au sol**. Le rôle existe dans l'abaque sans avoir de raison
d'être acheté.

## La règle

1. **Intégrité** — `buildings.integrity`, 0 à `INTEGRITY_MAX = 100`, à 100 à la construction.
   Un avant-poste n'en a pas (il a déjà sa désactivation par le raid, ADR 0019/0020 §7).
2. **L'ordre « frapper »** — un mouvement de type `strike`, **bombardiers seuls** (les chasseurs
   ne frappent rien au sol, ils escortent — ADR 0021), cible `building` (existe depuis 64b) d'un
   bâtiment **adverse connu** (relevé — jamais un bâtiment qu'on n'a pas vu, ADR 0005). Le
   mouvement part d'un aérodrome, va, frappe, **rentre** (même grammaire que le raid :
   `return` créé par la résolution). Interceptable en route comme tout mouvement.
3. **La passe de frappe** — dégâts = `DAMAGE_TABLE[bomber][building]` : **une colonne
   `building` ajoutée à la table**, pas une seconde table ; échelonnée par `strength /
   nominalStrength` comme `hit()`. La garnison du bâtiment **tire d'abord** (riposte des troupes
   présentes contre les bombardiers, table existante `[x][bomber]`) — c'est la DCA du pauvre en
   attendant 63a, et la raison d'avoir une garnison. Munitions facturées à la passe, comme tout
   engagement.
4. **À zéro : désactivé** — `disabledUntil`, comme l'avant-poste. Un bâtiment désactivé ne
   produit pas, n'embarque pas, ne forme pas ; ses emplacements restent ; sa garnison reste
   (règle 3). **Le QG se désactive aussi** — il perd sa capacité d'ordonner des mouvements le
   temps de la réparation, jamais son niveau (piste de `QUESTIONS.md` « QG frappé », cohérente
   avec 39 : la destruction reste derrière une recherche).
5. **Réparation** — seule, linéaire : `REPAIR_PER_HOUR = 10` (`@a-mesurer`, donc 10 h de 0 à
   100) ; réactivation quand l'intégrité repasse `REACTIVATION_AT = 50`. Pas d'ordre de
   réparation, pas de coût : ce serait un micro.
6. **Lecture** — la modale de site et la fenêtre du bâtiment montrent l'intégrité (jauge encre,
   pas de chiffre P1) ; la carte montre le désactivé comme l'avant-poste (ADR 0020 §7) ; une
   dépêche `buildingStruck` (critique si désactivé) pour la victime, `strikeDelivered` pour
   l'attaquant, avec pertes des bombardiers.

## Ce que ça casse, assumé

- « Rien ne se détruit » tient. « Un joueur écrasé reste nuisible » tient : sa garnison riposte,
  ses troupes existent.
- Le bombardier devient le seul rôle qui touche l'économie adverse sans y poser le pied — c'est
  sa raison d'être ; le contre est la garnison, puis la DCA (63a) si le test montre l'air trop
  payant.

## À trancher avant le prompt

1. Valeurs `@a-mesurer` : `DAMAGE_TABLE[bomber][building]`, `REPAIR_PER_HOUR`, `REACTIVATION_AT`.
2. Le porte-avions : ses bombardiers frappent-ils depuis la mer (aérodrome flottant) ? Cohérent
   avec la fiche 06 (Japon) — à écrire dans le prompt ou à réserver.
