# 08 — Combat

**Statut : figé.** Ce n'est plus la question bloquante — la simulation d'équilibrage peut démarrer.

Le combat se déclenche par **interception**, se résout **automatiquement et de façon
déterministe**, et se regarde ensuite en **rejeu cinématique**. Il n'y a aucune couche tactique
interactive. Cf. [ADR 0008](../adr/0008-combat-par-interception.md).

---

## 1. Le déclenchement : la zone d'interception

Toute force — en transit ou stationnée sur un avant-poste — porte un **rayon d'interception**.
Si un mouvement adverse traverse ce rayon, le combat se résout au point de contact, en vol.

C'est ce qui donne enfin un sens au positionnement : blocus d'un détroit, escorte d'un convoi,
embuscade sur une route connue. Et ça rend le renseignement directement monnayable — savoir *où*
passe un convoi permet de se placer sur sa route.

**Le calcul est déjà écrit.** C'est la même intersection segment/cercle que les fenêtres de
révélation du brouillard ([technique/brouillard-et-fanout.md](../technique/brouillard-et-fanout.md)),
faite au même moment : à la création du mouvement. Un mouvement connaît sa courbe, ses dates, et la
position de tous les intercepteurs existants. On en déduit la date et le lieu du contact, et on
planifie la résolution.

Rayon d'interception indicatif : fonction de la composition (les chasseurs et escortes l'élargissent,
les transports non) et du niveau du centre logistique.

---

## 2. La matrice d'efficacité

Ligne = attaquant, colonne = défenseur, valeur = multiplicateur de dégâts. `·` = ne peut pas
atteindre.

| Attaquant \ Défenseur | Inf | Bli | TrT | Cha | Bom | TrA | Esc | Car | PAv |
|---|---|---|---|---|---|---|---|---|---|
| **Infanterie** | 1.0 | 0.5 | 1.5 | 0.3 | 0.3 | 0.4 | · | · | · |
| **Blindé** | 1.8 | 1.0 | 2.0 | · | · | 0.2 | · | · | · |
| **Transport terrestre** | 0.2 | 0.1 | 0.3 | · | · | · | · | · | · |
| **Chasseur** | 0.6 | 0.3 | 1.2 | 1.0 | 1.9 | 2.2 | 0.4 | 0.8 | 0.5 |
| **Bombardier** | 1.2 | 1.8 | 1.6 | 0.2 | 0.5 | 0.6 | 1.7 | 1.5 | 2.0 |
| **Transport aérien** | · | · | · | · | · | · | · | · | · |
| **Escorte** | 0.3 | 0.2 | 0.4 | 0.5 | 0.5 | 0.5 | 1.0 | 1.9 | 1.4 |
| **Cargo** | · | · | · | · | · | · | 0.1 | 0.2 | 0.1 |
| **Porte-avions** | 0.4 | 0.2 | 0.8 | 1.5 | 1.2 | 1.4 | 0.9 | 1.1 | 0.8 |

Tous ces chiffres sont des **placeholders à simuler**.

### L'asymétrie est le sujet

Chasseur → Bombardier vaut 1.9 ; Bombardier → Chasseur vaut 0.2. La même paire donne un massacre ou
une déroute selon qui attaque.

C'est ce qui fait de la composition d'armée une décision : on ne choisit pas « la bonne unité », on
choisit **qui on veut être en position d'attaquer**.

### Ce ne sont pas 81 paramètres libres

L'objection évidente tombe grâce à la structure par domaines :

- ~30 cases sont **inatteignables** — elles sont vides, il n'y a rien à régler ;
- les trois transports sont **quasi nuls** partout : ce sont des victimes, pas des combattants ;
- restent **une vingtaine de cases** réellement à équilibrer.

Vingt valeurs, c'est tenable pour un dev solo. Quatre-vingt-une ne l'était pas.

### Deux intentions de design

**Le porte-avions a délibérément une ligne médiocre.** Sa force est la **portée** — il déplace le
point de lancement aérien. Lui donner en plus de bons chiffres supprimerait toute raison de
construire autre chose.

**Le brouillard est ce qui rend la matrice intéressante.** En information parfaite, on voit la
composition adverse et on la contre exactement : le pierre-papier-ciseaux devient un calcul. Dans le
brouillard, on compose **contre un inconnu** — et l'espionnage devient rentable, puisqu'il
transforme un pari en certitude.

---

## 3. La résolution

Déterministe, sans aléa. Dans un jeu asynchrone, le hasard ne se subit pas : on ne peut pas y
réagir.

1. Les modificateurs globaux s'appliquent **avant** la matrice, pour rester lisibles :
   **cap d'arrivée** (§4), **bonus défenseur**, effets d'embargo ou de sabotage en cours.
2. Chaque camp tire avec sa puissance **d'avant-passe** : les pertes sont **simultanées**.
   C'est ce qui préserve le levier de drame n°3 — deux joueurs qui s'attaquent mutuellement
   s'écrasent mutuellement.
3. Trois à quatre passes, puis application du **plancher de pertes** (fiche 07) et du butin.

Les dégâts d'un rôle attaquant se répartissent sur les rôles adverses au prorata de leur part dans
la pile, pondérée par la matrice.

---

## 4. Le cap d'arrivée

L'orientation n'a de sens que si l'on peut manœuvrer — ce qui n'est pas le cas ici. Mais au niveau
stratégique elle en a un, naturel et **gratuit** : la direction depuis laquelle la force arrive. Le
cap de chaque arc est déjà calculé par la carte.

- attaquer par la mer ou par voie terrestre ;
- converger à deux depuis deux directions opposées, ce qui donne un bonus de tenaille ;
- arriver dans le dos d'une force engagée ailleurs.

C'est un modificateur global multiplicatif, lisible, qui récompense la planification sans demander
une seule interaction pendant la bataille.

---

## 5. Le rejeu cinématique

Quand un combat se résout, on peut **plonger sur le point de contact** : zoom serré, silhouettes
1940 placées, déroulé des passes.

C'est un **rejeu**, pas une partie. On obtient tout le spectacle et toute la lisibilité d'une
bataille tactique — ce qui était l'envie de départ — sans aucun problème de synchronicité. Le joueur
absent au moment du combat le regarde en se reconnectant, exactement dans le même état que celui qui
était en ligne.

---

## 6. Les nations modifient une ligne ou une colonne

Jamais la matrice entière. Une nation = un chiffre.

| Nation | Modification |
|---|---|
| Allemagne | ligne **Blindé** × 1.25 |
| Royaume-Uni | colonne **Chasseur** en défense × 1.3 |
| Japon | ligne **Porte-avions** × 1.3 |
| URSS | colonne **Infanterie** en défense × 1.3 |
| États-Unis | ligne **Bombardier** × 1.25 |

Si chaque nation avait sa propre matrice, on passerait de 20 valeurs à 160.

---

## 7. Garde-fous

**La matrice ne doit pas décider seule.** Sans coût différencié, temps de production et plafond
d'effectifs, tout le monde converge vers la même pile optimale et le pierre-papier-ciseaux ne sert
plus à rien.

**Aucune unité ne doit être un contre absolu.** Une valeur au-dessus de ~2.2 rend une composition
non jouable plutôt que risquée.

---

## 8. Ce qui reste ouvert

- **Le rayon d'interception** : fixe, ou fonction de la composition ? S'il est trop grand, plus
  aucun convoi ne passe et le jeu se fige.
- **Peut-on refuser le combat ?** Une force rapide devrait pouvoir se dérober au prix d'un
  détour. Sans cette issue, l'interception devient une punition sans contre-jeu.
- **L'option B**, l'auto-battler à plans, reste en réserve : chaque joueur enregistrerait à l'avance
  formation, orientation et cibles prioritaires. C'est la seule façon de rendre de la décision
  tactique sans casser l'asynchrone. À reconsidérer si le combat automatique paraît trop passif
  après la première saison.
