# entrer-en-garnison — une colonne rejoint la garnison d'un bâtiment ami (64b · 69a · 70b)

Lis `CLAUDE.md` et `CONVENTIONS.md` à la racine, puis `WWS/CONTEXT.md`. Ne commit pas, ne push
pas. Suppose les lots `retours-japon-1..3` livrés.

## Le constat

Partie de test du 04/09 : une infanterie ne peut pas entrer dans un port. `MOVEMENT_TARGET` ne
connaît que `region`, `outpost`, `point` et `home` ; une troupe n'entre dans un bâtiment qu'en y
naissant (`troops.ts`) ou par `recallAt`, qui n'accroche qu'une caserne au retour dans une
région. Le cargo japonais ne charge donc jamais son infanterie : `march` exige
`sameStation(troop.stationedAt, departure.stationId)`, et rien ne peut poser une infanterie *au*
port. Décision 64b (01/09) : entrer dans un bâtiment se dit — une branche explicite de la rose
en visée, jamais un accident d'arrivée. Libellé tranché : **« entrer en garnison »** (69a).

## La règle (70b) — qui entre où

- **L'infanterie entre dans tout bâtiment du joueur** (QG, caserne, mine, port, aérodrome…) —
  c'est la règle « seule l'infanterie pille, capture, fonde », étendue.
- Les autres rôles n'entrent que dans **leur domaine** : blindé et transport terrestre → caserne
  et QG ; escorte, cargo, porte-avions → port ; chasseur, bombardier, transport aérien →
  aérodrome. Une colonne mixte n'entre que si **chaque** rôle a le droit d'entrer.
- Les avant-postes ne changent pas : la cible `outpost` fait déjà la garnison (ADR 0019 §3).
- La règle est une table nommée dans `src/domain` (`GARRISON_KEYS_BY_ROLE` ou approchant),
  **lue** par le refus client et le refus serveur — jamais deux tables.

## 1. Serveur

- `MOVEMENT_TARGET` gagne `{ kind: 'building', buildingId: v.id('buildings') }`. `aimOf`
  résout le bâtiment : point = son ancre, hôte = le pays de sa région, nom = le nom servi du
  bâtiment. Le bâtiment doit être **au joueur** (`OWN_BUILDING_ONLY` ou le code de refus
  existant qui dit ça le mieux) et debout.
- Type d'ordre : étends `recall` si sa sémantique tient (il existe pour ça — « rappel de
  garnison ») plutôt que de créer un type ; si tu crées `garrison`, dis pourquoi dans le
  rapport. `refusalOf` applique la table 70b (`NOT_A_GARRISON_FOR`, avec le rôle et le bâtiment
  dans les données d'erreur).
- Arrivée (`arrival.ts`) : bâtiment debout et toujours au joueur → `stationedAt = building._id`
  pour chaque troupe ; rasé ou perdu entre-temps → la colonne se tient sur le point atteint
  (règle 3, ADR 0019 §1) et le journal le dit avec la dépêche existante la plus proche.
- La marche est une marche : détection, interception, passes de résolution — rien de spécial.
  La porte de départ ne change pas (ADR 0019 §2) ; l'arrivée *au* port est ce qui permet le
  départ *du* port au mouvement suivant.

## 2. Client

- `aimingCompass` (compass-rose.ts) accepte une cible `building` à moi : l'éventail porte la
  branche **« entrer en garnison »** (nouvelle clé `fr.compass.garrison`, pictogramme de
  l'éventail de visée dans la famille existante — propose-le, un seul) avec au survol la
  destination nommée, la durée du trajet et l'allure, comme les autres marches. Un rôle interdit
  → la rose s'ouvre en motif avec `fr.compass.refused` et la phrase de `NOT_A_GARRISON_FOR`
  (« un blindé n'entre pas dans une mine ») — jamais un grisé.
- Le picking du clic droit en visée sur un mât de bâtiment du joueur produit la cible ; hors
  visée, la rose sur bâtiment (54a/56a) ne change pas.
- La modale de site et le panneau de garnison lisent déjà `stationedAt` : aucune donnée
  nouvelle à servir, vérifie seulement que la troupe arrivée y apparaît cochable.
- Le journal : une dépêche d'arrivée dit « … est entrée en garnison à Port · Tokyo » —
  réutilise la dépêche d'arrivée existante avec l'adresse nommée (`station-name.ts`) si elle
  suffit, sinon une clé nouvelle, une seule.

## Cas d'acceptation

1. Étant donné une infanterie posée à 30 km de mon port, en visée, clic droit sur le mât du port
   → « entrer en garnison » ; à la passe de résolution la troupe est `stationedAt` = le port, la
   modale du port la montre cochable.
2. Étant donné cette infanterie au port et un cargo formé au port, composer cargo + infanterie
   depuis la modale et viser un point outre-mer → `march` accepte (plus de
   `TROOP_NOT_AT_ORIGIN`) — **c'est le cas qui a déclenché le chantier**.
3. Étant donné un blindé en visée sur ma mine → rose en motif, phrase « un blindé n'entre pas
   dans une mine » ; sur ma caserne → branche offerte.
4. Étant donné un cargo en visée sur ma caserne → refus ; sur mon port → branche offerte.
5. Étant donné le port rasé pendant la marche → la colonne se tient sur le point, dépêche au
   journal, aucune troupe accrochée à un bâtiment absent.
6. Un bâtiment adverse ou neutre ne propose jamais la branche (la visée sur lui garde son
   comportement actuel).
7. Observateur : rien de nouveau ne s'ouvre.

`npm run verifier` vert. Un commit, message qui décrit le chantier entier.
