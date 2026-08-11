# 11 — Brief UI

Document destiné à être passé tel quel à un outil de design. Il contient la direction artistique
déjà validée en prototype, l'inventaire des écrans, et les pièges propres au genre.

---

## 1. Le jeu en cinq lignes

Jeu de stratégie **web, asynchrone**, sur une carte du monde réel, esthétique **presse illustrée
1940**. Saison de 48 h à 7 jours puis remise à zéro. **2 à 8 joueurs, entre amis.**

Chaque joueur tient une nation, produit des ressources, pose des avant-postes sur des pays neutres
et projette des forces. **Il ne voit pas les mouvements adverses** : il paie pour les voir. Tout
envoi est irréversible pendant la durée du trajet.

Ce n'est **pas** un RTS. Le joueur ne contrôle jamais une unité directement, et les batailles se
résolvent sans lui.

---

## 2. Le rythme réel du joueur — la contrainte n°1

| | |
|---|---|
| ~28 actions par jour, soit **1,2 par heure** | **mesuré** en simulation, 2 000 saisons |
| ~8 connexions courtes par jour | **hypothèse de design**, non mesurée |
| plage de repos de 7 h déclarée et publique | **règle de design**, non testée en simulation |

**Conséquence directe : l'écran le plus important n'est pas le plus spectaculaire.** La surface
critique répond à *« qu'est-ce qui a changé depuis la dernière fois ? »*. Les joueurs de ce genre
vivent dans la liste des mouvements, pas sur la carte.

Une session type dure trois minutes : lire le journal, relancer un chantier, envoyer un mouvement,
repartir.

---

## 3. Direction artistique

Valeurs relevées dans le prototype de carte, à réutiliser telles quelles.

### Palette

| Rôle | Hex |
|---|---|
| Fond, le bureau sous la carte | `#171208` |
| Papier | `#e4d8bd` |
| Mer, aplat délavé | `#a9c5cd` |
| Encre, trame et isobathes | `#2c5063` |
| Ombré côtier | `#3f6b7c` |
| Terre neutre | `#d5c5a0` |
| Trait de frontière | `#2a2118` |
| Graticule | `#4a4436` |
| Tranche du socle, haut → bas | `#c7b48e` → `#5f5039` |
| Bordure du monde | `#6b4a24` / `#3a2a18` |

**Encres des huit nations de 1940** (jamais des couleurs d'écran saturées) :
France `#3f5a7d` · Royaume-Uni `#4a4f7a` · États-Unis `#4a7060` · URSS `#9d4638` ·
Allemagne `#6e6a5e` · Japon `#a44a5e` · Italie `#a86c4a` · Chine `#b07434`

### Traitement

- **Grain d'impression** en espace écran, opacité 0.2, mode `overlay`, motif de bruit répété.
- **Vignettage** radial, opacité 0.5.
- **Trame de similigravure** inclinée à 45° pour toute surface qui doit lire comme imprimée.
- Aucune ombre portée, aucun dégradé lisse, aucun néon. Les volumes se lisent par la valeur.

### Typographie — à définir

Un **titrage** type presse (serif à empattements marqués, condensé) et un **texte courant** étroit,
très lisible en petit corps. Chiffres **tabulaires obligatoires** : la moitié de l'UI est faite de
compteurs qui défilent, et des chiffres qui sautent en largeur sont insupportables.

### La règle non négociable

> **Le budget de contraste appartient à la couche de jeu.**

Le plateau est riche mais désaturé, délibérément. Les couleurs de nation, les arcs, les avant-postes
et les alertes doivent ressortir instantanément par-dessus. Une UI qui rivalise avec la carte rend
le jeu illisible.

---

## 4. Les écrans, par ordre d'usage réel

### 4.1 — Journal d'événements ★★★ *le plus important*

Ce que le joueur voit en arrivant. Répond à « qu'est-ce qui a changé ? ». Lisible en dix secondes,
groupé par gravité.

- mouvements arrivés, combats résolus, avec accès au **rejeu**
- avant-postes **désactivés par raid** ou **détruits** — jamais « pris » : un avant-poste ne change
  jamais de propriétaire
- embargo ou exposition subis, avec le temps restant
- chantiers terminés, agents ayant abouti
- mouvements immobilisés à la frontière pendant la plage de repos, et **l'heure à laquelle ils se
  résoudront** — c'est ce que le joueur découvre au réveil

Les entrées lues basculent dans un **historique consultable**. Le rejeu d'un combat doit rester
accessible après coup : c'est le contenu qu'on se raconte.

### 4.2 — Mouvements en cours ★★★

La liste des mouvements en vol. Le joueur y revient sans arrêt.

**Trois états d'affichage, à ne pas confondre :**

| État | Ce qui est visible |
|---|---|
| **Mien** | tout : type, composition, origine, destination, arrivée |
| **Adverse détecté** | l'arc, le cap, l'horaire estimé. **Ni le type ni la composition.** |
| **Adverse, dernière position connue** | l'arc figé, grisé, horodaté « vu il y a X » |

> **Un mouvement adverse ne doit jamais afficher son type.** Le leurre — un mouvement à zéro unité —
> n'a d'intérêt que s'il est indiscernable d'un vrai. Afficher « leurre » dans la liste détruit la
> mécanique.

Cas particulier : le pouvoir britannique *Maîtrise des mers* montre **tous** les arcs maritimes,
mais **sans origine ni destination** — un quatrième état visuel : un arc dont les extrémités
s'effacent.

Toujours visible : **slots utilisés / disponibles**. C'est la ressource la plus rare du jeu et
l'information la plus consultée — elle doit apparaître depuis tous les écrans.

### 4.3 — Envoi d'un mouvement ★★★

**La décision la plus fréquente du jeu.** Écran ou panneau modal.

- choix du type : attaque, raid d'avant-poste, fondation d'avant-poste, agent, leurre
- composition de la pile, par rôle, avec ce qui reste **à domicile** — car les forces en transit ne
  défendent plus rien
- destination, **durée estimée**, indication si le trajet **traverse l'antiméridien**
- **cap d'arrivée**, qui modifie le combat
- coût en slot, et refus explicite s'il n'en reste plus
- avertissement si l'arrivée tombe dans la **plage de repos publique** de la cible

### 4.4 — La carte ★★★

Existe déjà en prototype. L'UI vient **par-dessus** sans la recouvrir : panneaux d'angle, jamais de
bandeau central.

Le panneau contextuel change selon la cible sélectionnée :

| Cible | Contenu |
|---|---|
| Sa propre nation | raccourci vers 4.5 |
| Nation adverse | encre, doctrine si révélée, **plage de repos**, dernier renseignement connu |
| Pays neutre | relation par joueur, capacité d'échange restante, avant-postes présents, agents |
| Avant-poste | propriétaire, spécialisation, niveau, garnison, immunité post-raid en cours |
| Arc | ce que l'état d'affichage autorise (cf. 4.2) |

### 4.5 — La nation ★★

- trois ressources : **ravitaillement, acier, effectifs**, avec leur débit horaire.
  Les effectifs sont **plafonnés et non achetables** : le plafond doit être visible en permanence
- cinq bâtiments : QG, complexe industriel, centre logistique, conscription, station d'écoute.
  Niveau, coût du suivant, durée, file de construction. Le QG plafonne le niveau des autres
- armée par rôle, en distinguant **présente** et **en transit**
- **occupation** le cas échéant : production réduite de moitié, attrition subie par l'occupant
- **Revanchisme** le cas échéant : c'est un flux qui décroît s'il n'est pas dépensé, et il ne peut
  financer que de l'offensif. Les deux contraintes doivent se lire sans explication
- déclaration de sa propre **plage de repos**
- le **pouvoir national**, énoncé comme une règle brisée. Certains sont **actionnables** et ont donc
  besoin d'un bouton et d'un état : réorientation japonaise avant mi-parcours, enchaînement
  allemand, conversion américaine

### 4.6 — Production ★★

- neuf rôles : infanterie, blindé, transport terrestre, chasseur, bombardier, transport aérien,
  escorte, cargo, porte-avions
- **paliers 1 → 2** pour infanterie, blindé et porte-avions : ce sont des améliorations, pas des
  unités distinctes
- coût en **acier + effectifs**
- **fiche d'unité** : contre quoi ce rôle est fort et faible. La matrice complète fait 9×9, mais un
  joueur ne doit jamais la voir en entier — deux listes courtes suffisent
- silhouettes à plat, encre unique, esprit **planches de reconnaissance d'aéronefs** de l'époque

### 4.7 — Rejeu de bataille ★★

Vue rapprochée d'un combat **déjà résolu**. Spectacle, jamais interaction.

Piles des deux camps avant et après, **trois à quatre passes** de résolution successives, pertes par
rôle, cap d'arrivée et bonus défenseur appliqués. **Sautable** — on le regarde une fois, pas trois.

Aucun bouton n'agit sur l'issue. S'il y a un bouton, c'est un contresens.

### 4.8 — Doctrine et progression ★

Sa propre doctrine, et une barre par adversaire avec **trois états** :

| État | Affichage |
|---|---|
| Sous 25 % de progression | barre **anonyme** : quelqu'un est à X %, on ne sait pas qui |
| Au-delà de 25 %, ou après sa première action offensive | barre **attribuée** |
| Cible d'une **exposition** | doctrine révélée de force, et progression **gelée** avec compte à rebours |

Plus l'outil de soustraction propre à sa doctrine : **embargo** (Hégémonie) ou **exposition**
(Influence), avec son coût.

### 4.9 — Espionnage ★

- **sonde** : cible un joueur, révèle ses mouvements sortants pendant une durée. Coût, durée
  restante, ce qu'elle a révélé
- **agent dormant** : posé dans un pays neutre, révèle les arcs proches en continu et peut
  **saboter** un mouvement à portée
- **leurre** : coût forfaitaire plus un slot
- une **carte de couverture** : ce que je vois, et surtout **ce que je ne vois pas** — les zones
  aveugles sont l'information la plus utile de cet écran

### 4.10 — Fin de saison ★

34 % des saisons se terminent avant le terme annoncé. Il faut un écran : qui a gagné, avec quelle
doctrine, la courbe des progressions, et le bilan de chacun. C'est le moment où le groupe se
raconte la partie — c'est du contenu, pas une formalité.

---

## 5. Pièges propres à ce jeu

**Ne jamais afficher ce que le joueur n'a pas le droit de voir.** Le brouillard est la colonne
vertébrale du design. Une maquette qui montre les forces adverses par confort détruit le jeu — et un
filtrage côté client se contourne en trois lignes de console.

**Ne pas révéler le type d'un mouvement adverse.** Voir 4.2. C'est l'erreur la plus facile à
commettre et elle tue le leurre, le sabotage et une partie de l'espionnage.

**Ne pas faire d'écran de bataille interactif.** La bataille est résolue avant d'être affichée.

**Ne pas cacher les compteurs.** Un jeu asynchrone est fait d'attentes : arrivées, chantiers,
embargos, immunités. Ces durées sont le contenu, pas de la plomberie.

**Ne pas inventer une couche sociale.** Pas de chat, pas de guilde, pas de classement mondial. Ce
sont 2 à 8 amis qui se parlent ailleurs.

**Ne pas montrer la matrice 9×9 au joueur.** Deux listes courtes par unité — fort contre, faible
contre — suffisent et se lisent.

**Prévoir le mobile pour 4.1, 4.2 et 4.3.** Huit connexions courtes par jour, c'est un usage
téléphone : lire le journal, relancer, envoyer. La carte, la production et le rejeu peuvent rester
des surfaces de bureau — mais la navigation mobile doit fonctionner **sans passer par la carte**.

---

## 6. Vocabulaire imposé

Le glossaire complet est dans [CONTEXT.md](../../CONTEXT.md). Les pièges les plus fréquents :

| Dire | Ne pas dire |
|---|---|
| mouvement | convoi, flotte, envoi |
| passe de résolution | tour de combat |
| avant-poste désactivé / détruit | avant-poste pris, capturé |
| journal d'événements | rapport, feed, activité |
| slot de mouvement | action, ordre |

Sont bannis : *tick*, *temps réel*, *micro*, *base*, *rush*.

---

## 7. Ce qui n'a pas à être maquetté

Création de saison, tutoriel, compte, paramètres, monétisation. Rien de tout ça n'est au programme
d'une première saison entre amis.
