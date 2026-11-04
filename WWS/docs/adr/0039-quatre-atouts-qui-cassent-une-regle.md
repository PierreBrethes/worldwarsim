# ADR 0039 — Quatre atouts nationaux, qui cassent chacun une règle

**Statut :** acceptée (04/11/2026). Tranchée par Pierre en trois manches de grilling (Q1 à Q15,
« Oui, les quatre », « Oui, les dix », « Oui, écris l'ADR »), après une enquête qui a relu la
fiche 06 contre le code (#444, commentaire « Enquête (04/11) »). **Mondiale seule** : la Blitz
garde des nations égales. Rien n'est codé au 04/11 ; les lots suivent l'issue du socle puis une
issue par atout, au jalon V1.

**Remplace** les atouts de la [fiche 06](../design/06-nations.md) pour la V1 (la fiche reste
figée). **Précise** la règle 1 de `WWS/CLAUDE.md` (un atout casse une règle). **Ouvre** une
seconde brèche au brouillard sur la nation, à côté de celle de Lisbonne (P11).

## Contexte

Le pitch d'origine est « chaque pays a son identité réelle », et aucun atout n'est codé : aucune
règle du jeu ne lit la nation (`nation ===` ne paraît que dans le salon, `convex/players.ts` et
`convex/seasons.ts`, et dans le rapport, `convex/seasonReport.ts`). Les nations ne diffèrent que
par leur géographie et leurs gisements. La saison test entre amis s'est jouée ainsi, sans atout
(ADR 0027 §4), et s'est bien passée.

La fiche 06 (15/08) décrit huit atouts écrits contre des règles qui ont bougé :

- **Chine** : le plafond d'hommes qu'elle cassait a disparu avec les plafonds (ADR 0027 §5) ;
  reste une borne serveur invisible, qui n'est pas une règle.
- **Italie** : le départ maritime par un port est déjà levé pour tous, un avant-poste côtier est
  une côte d'où l'on part (`convex/movement/orders.ts`, ADR 0028 §4).
- **France** : un rayon plus large est un nombre ; il bonifie (règle 1).
- **Royaume-Uni** : entendre toute coque en mer demanderait une nouvelle sorte de relevé, sans
  segment, en plein invariant « Brouillard » ; le plus cher des huit.
- **Allemagne** : le cooldown de slot n'existe plus ; un mouvement tient son slot tout le trajet
  (`claimSlot`, `convex/movement/orders.ts`).
- **États-Unis**, **Japon**, **URSS** : leurs règles cassées existent toujours — l'étanchéité des
  dépôts (`deliverRefusalOf`, `src/domain/logistics.ts`), l'irréversibilité de l'engagement
  (ADR 0019 §1, `TROOP_NOT_AT_ORIGIN`), l'immobilité des bâtiments (ADR 0029 ; raser ne rend rien).

## Décision

### 1. Quatre atouts, quatre règles cassées

| Nation | Atout | Règle cassée |
|---|---|---|
| États-Unis | **Prêt-bail** | l'étanchéité des dépôts |
| Japon | **Doctrine du porte-avions** | l'irréversibilité d'un mouvement |
| URSS | **Évacuation industrielle** | « raser ne rend rien » |
| Allemagne | **Guerre éclair** | « un mouvement, une destination » |

France, Royaume-Uni, Italie et Chine jouent sans atout en V1. Le salon et la fiche de nation
n'affichent pour elles aucune ligne d'atout, pas même « à venir ».

### 2. Un atout est une règle permanente

Ni compteur ni recharge. Son frein est dans la règle même : un convoi qui s'intercepte, une coque
exigée, la mi-parcours, une victoire exigée. Si une saison montre un abus, on resserre la règle,
jamais un chiffre. Le rapport de saison compte l'usage de chaque atout (ADR 0027 §7) ; le Japon,
le plus fort des quatre, est le premier candidat à être resserré.

L'atout de chaque nation est **public** : chacun le lit au salon et sur la fiche de nation. Son
**usage** suit le brouillard comme tout mouvement.

### 3. Prêt-bail (États-Unis)

Un transport américain livre au dépôt d'un **avant-poste étranger qu'il a relevé**, allié ou
ennemi, sans accord du receveur : munitions, pétrole et charbon, ce que tient un dépôt. Une
livraison à la fois ; une tournée ne s'arrête pas à un dépôt étranger. Un dépôt plein refuse
comme aujourd'hui (`DEPOT_FULL`). Le convoi se relève et s'intercepte comme tout ravitaillement.

Le receveur reçoit une dépêche qui **nomme la nation qui livre** et ce qu'elle a livré. C'est la
seconde brèche au brouillard sur la nation, après le teneur de Lisbonne (P11) : bornée au dépôt
du receveur, voulue, parce que la diplomatie se joue à la parole et qu'on doit savoir à qui l'on
doit. L'Américain n'apprend rien de plus que ce qu'il a déjà relevé.

### 4. Doctrine du porte-avions (Japon)

Un mouvement japonais **en mer** change de destination **une fois**, **avant la mi-parcours**
(la moitié de sa durée). Jamais à terre. La nouvelle destination est tout ce qu'un ordre neuf
pourrait viser depuis la position du moment, refusé par la même fonction que l'ordre neuf ; le
plein se relit pour la nouvelle route par la même fonction qu'un départ, la part non courue de
l'ancienne comptant comme payée. Le mouvement garde son slot.

**Le coude se voit** : qui guette voit la flotte repartir de sa position, comme un départ. La
mutation réévalue la détection elle-même (invariant « Brouillard »).

### 5. Évacuation industrielle (URSS)

Un bâtiment soviétique que son propriétaire rase laisse son niveau **en réserve**, une réserve par
type de bâtiment, au plus haut niveau rasé. La prochaine pose du même type la consomme : elle
coûte le prix et la durée d'un niveau 1, et sort du chantier au niveau gardé.

Raser est refusé pendant une capture en cours sur ce point, sinon raser annulerait la prise. Le QG
ne se rase toujours pas (`HQ_NEVER_DEMOLISHED`).

### 6. Guerre éclair (Allemagne)

Une attaque allemande **à terre** porte **deux cibles**, choisies avec l'ordre parmi ce qu'une
attaque peut viser. Personne d'autre ne connaît la seconde : un relevé ne donne jamais la
destination (4a du 13/09).

La seconde jambe ne part qu'après une **victoire** à la première : l'attaquant tient le terrain,
le cas du tampon « terrain tenu ». Sur un match nul ou une défaite, elle tombe. À son échéance,
elle relit le plein, les coups et la cible (invariant « Échéance ») ; si l'un manque, la colonne
reste sur place et le dit.

### 7. Le socle commun

Une seule table dit l'atout d'une nation, dans `src/domain/`, servie publique par la vue et lue
par le salon. Chaque refus d'atout sort de la même fonction pure à l'écran et au serveur
(« Une règle, une fonction ») ; rien n'est grisé, un refus se dit.

## Conséquences

- Une issue pour le socle (la table, la vue, le salon, la fiche de nation), puis une issue par
  atout, au jalon V1.
- Le Japon et la Guerre éclair touchent la passe et la détection : leur lot vérifie la limite
  d'une seconde au banc.
- L'Évacuation industrielle ajoute à `players` une réserve `v.optional`, lue avec un défaut
  (invariant « Schéma Convex »).
- Le rapport de saison suit l'usage de chaque atout, avec l'isolement des États-Unis (le 🔴 de
  `WWS/QUESTIONS.md`), qu'un Prêt-bail interceptable expose davantage.

## Ce qu'on abandonne

- Les huit atouts de la fiche 06 d'un coup, et ceux dont la règle a disparu ou ne fait que
  bonifier (Chine, Italie, France) ; le Royaume-Uni, faute d'un relevé sans segment.
- Les troupes signature en V1 : un dixième rôle coûte figurines, GLB et équilibrage.
- Les pouvoirs à compteur : un atout ne se recharge pas, il se resserre.
- Le consentement du receveur au Prêt-bail.
- Les atouts en Blitz.

## Options écartées

- **Chine, levée en masse** (l'infanterie se forme à tout avant-poste sur sol chinois) au lieu de
  l'Allemagne : demande des files de recrutement sur les avant-postes (`recruitments` indexé sur
  le bâtiment seul), chantier qu'on partagera un jour avec l'Italie.
- **Allemagne, une attaque hors slots** sur le modèle de Halifax : c'est un slot de plus, une
  bonification.
- **France, l'avant-poste qui tient toute sa région** : casse « il mesure un point », mais touche
  `heldRegions` et aggrave le poids des régions géantes.
