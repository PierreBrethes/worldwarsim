---
type: prompt
statut: abandonné
maj: 2026-10-04
code: []
decisions: [mobile-piste-a-2026-10-03, mobile-regles-2026-10-03, carte-lisible-2026-10-03, 4a-2026-09-13]
voir: [plateau-sur-telephone-2.md, ../../../../src/domain/push.ts]
---
# Prompt Claude design — le plateau sur téléphone, troisième passe

**Abandonné le 04/10/2026** : les deux reprises se codent directement (lots M3 et M4), sans maquette de plus.

**En bref.** La passe 2 (planches 2a et 2b, `Claude outputs/marque/plateau-mobile/passe-2-*.png`)
valide la barre, le bandeau, « plus », les calques, la rose, la garnison et la visée. Deux reprises :
l'écran d'attaque suppose une alerte avant l'arrivée qui n'existe pas dans le jeu (la notification
part **après** la passe de résolution, `src/domain/push.ts` ; et un relevé ne donne jamais la
destination, décision 4a du 13/09 — la faute vient de mon prompt de la passe 2) ; la carte lisible
a été dessinée avec des étiquettes à la place des vraies troupes.

À coller dans le même projet Claude design. Téléverse le dossier
`Claude outputs/marque/plateau-mobile/passe-3-entrees/` (la fenêtre journal actuelle et cinq
planches de troupes).

---

## Le prompt

La passe 2 est retenue pour la barre, le bandeau replié, « plus » en étage, les calques, « à
faire », la rose, la garnison et la visée. Deux planches sont à reprendre.

**1. L'arrivée depuis la notification d'attaque (remplace A9, A10, A11).** Je me suis trompé dans
la passe précédente : le jeu ne prévient pas avant une attaque. La notification part **après** la
passe de résolution : « une de vos forces a été attaquée ». Et un relevé ne donne jamais la
destination d'une force adverse, seulement le tronçon vu, son cap et un horaire estimé. Donc :
- Toucher la notification ouvre le plateau sur le lieu du combat, avec **la dépêche du combat** en
  feuille basse, sur le modèle de la dépêche du journal actuel (capture jointe) : ce qui s'est
  passé, les pertes de chaque côté, l'état de la garnison ensuite, et « avant-poste désactivé »
  s'il l'a été (tampon rouge).
- L'assaillant n'est nommé (nation, nombre de troupes) que s'il a été relevé ; sinon « une force
  non relevée ». Pas d'heure d'arrivée, pas de « marche sur ».
- Actions : « ouvrir la garnison de Lyon » (le panneau de garnison du point), « voir le journal »,
  « plus tard » ; et, seulement si l'assaillant a été relevé, « voir l'assaillant », qui centre la
  carte sur sa dernière position connue (en gris de routine).
Dessine les deux versions (assaillant relevé, non relevé), puis la garnison ouverte depuis la
dépêche.

**2. La carte lisible avec les vraies troupes (remplace C1 à C4).** Les troupes sont des planches
illustrées (jointes : char, infanterie, chasseur, escorteur, bombardier), pas des étiquettes
« INF / CHR ». Redessine les quatre vues avec ces planches, en gardant tes règles : la troupe
touchée ou cochée grossit de 30 % et se cerne d'encre ; un drapeau à l'arrivée de chacun de mes
mouvements ; un seul cartouche par pile ; les cartouches trop proches se regroupent en « 2 piles
· 3 », et toucher un regroupement rapproche la caméra jusqu'à ce que les piles se séparent (bonne
idée, garde-la). Sur ordinateur, **garde le rail et le bandeau actuels** (capture de la passe
précédente) : seule la carte change.

Mêmes règles : charte jointe, cibles de 44 px, vocabulaire imposé, aucune règle inventée. Termine
par ce que tu as dû supposer.
