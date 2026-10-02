---
type: prompt
statut: livré
maj: 2026-10-02
code: [src/routes/-plateau/NextActions.tsx, src/shell/ResourceBand.tsx]
decisions: []
voir: [maquette-couche-permanente-2.md]
---
# Prompt Claude design — la couche permanente du plateau

**En bref.** Prompt Claude design de la couche permanente du plateau (décision de Pierre, 30/08) : carte « à faire maintenant », bandeau des ressources, plateau en visée. Seule la planche 1 (à faire maintenant) fait encore autorité ; les planches 2 et 3 sont remplacées par la -2.

**En retard** (vérifié le 02/10/2026) :
- L.31 « entrepôt (les six premières) et dépôt (pétrole, munitions) » — vrai : le stockage est unifié en entrepôt depuis le 09/09, il n'y a plus de famille dépôt.
- L.54 « deux boutons-tampons « ENVOYER » et « FONDER UN AVANT-POSTE » » dans la popin — vrai : la popin Troupe ne porte aucune action (la carte agit au clic droit), amendement de la -2.
- L.26 « huit valeurs … stock / plafond » — vrai : le bandeau est à icônes seules, sans plafond (planche 2a de la -2).

Décision de Pierre (30/08) : **une information, une fois, au bon endroit.** Trois couches :
(1) *toujours visible* = ce qui est rare et borne l'action — ressources, slots, non-lu, horloge ;
(2) *la carte* = tout ce qui a une position ; (3) *au clic* = le détail. Règle : ce qui a une
position ne vit pas dans un panneau. Conséquences tranchées : la fenêtre « Visée armée »
disparaît (la popin Troupe porte l'état) ; les ressources passent en bandeau sous la manchette
(façon Ogame) ; le widget Troupes est remplacé par une carte « à faire maintenant ».

À coller dans Claude design en rouvrant le canvas « Interface de saison » pour hériter du
système visuel.

---

Ajoute trois planches au canvas, dans le système visuel existant — presse illustrée 1940,
papier `#f0e6d2`/encre `#2a2118`, titres Bodoni Moda, corps Archivo Narrow, chiffres IBM Plex
Mono, filets fins, libellés uppercase espacés. Interface en français. Données fictives : la
France, deuxième journée d'une escarmouche. Haute fidélité. La carte du monde derrière est un
placeholder encadré (ne pas la redessiner), mais les marqueurs qui vivent *sur* la carte sont
à dessiner.

**Planche 1 — Le plateau au repos.** Plein écran, rien de sélectionné. Ne doit rester à
l'écran que :

- La manchette (existante) et, juste dessous, **le bandeau des ressources** : une ligne façon
  cours de bourse, huit valeurs en chiffres mono — nourriture, tissus, charbon, minerais,
  alliage, pétrole, munitions, bandages — chacune « stock / plafond » (ex. « alliage 84 / 120 »).
  Deux marques d'encre, jamais d'icône : **plein** (le stock touche le plafond — la production
  se perd, c'est le signal le plus important du bandeau) et **insuffisant** (ne couvre pas le
  chantier en tête de file). Dessine les deux sur des ressources différentes. Regroupe
  visuellement entrepôt (les six premières) et dépôt (pétrole, munitions) par un filet.
- Le rail (existant) : télégraphe, production, économie, nation, réglages.
- Le bandeau nation (existant) : slots « 1 / 3 », journal « 2 dépêches non lues ».
- **La carte « À faire maintenant »**, bas-gauche, style dépêche militaire comme l'ordre de
  mobilisation qu'elle généralise. Titre « À FAIRE MAINTENANT », puis une ligne par chose qui
  attend le joueur, chacune cliquable (la ligne recentre la carte ou ouvre la surface) :
  « 2 poses de fondation offertes » · « chantier libre — rien en file » · « 1 troupe sans
  ordre — Piémont » · « caserne inactive — Lyon » · « 1 slot de mouvement libre ». Quand
  rien n'attend, la carte n'existe pas : dessine-la avec cinq lignes, et note en marge
  qu'elle se vide ligne à ligne.
- Sur la carte : les troupes posées (sprite + un seul cartouche « 1 INF », pas de halo ni de
  drapeau en plus), les bâtiments, les colonnes en mouvement avec leur arc.

Rien d'autre. Pas de liste de troupes, pas de « rien en vol », pas de phrase de règle imprimée.

**Planche 2 — Le bandeau des ressources, trois états.** Détail à l'échelle 2× :
(a) au repos ; (b) survol de « alliage » : infobulle papier « +12 / passe · fonderie MK1 ·
plafond 120 (entrepôt MK1) » ; (c) alliage plein et pétrole insuffisant, avec les deux
marques d'encre et, au survol de la marque, « la fonderie tourne pour rien — agrandir
l'entrepôt » / « il manque 15 de pétrole pour le port en file ».

**Planche 3 — Le plateau en visée.** Même plateau, une troupe cliquée. La popin Troupe
(existante : « infanterie · MK1 », « effectif 50 / 50 », « ravitaillée », « relève à 60 km »)
porte désormais **l'état et les actions** : deux boutons-tampons « ENVOYER » et « FONDER UN
AVANT-POSTE », et en pied, une ligne grise « échap — désarme ». Sur la carte : le cercle de
relève, la troupe surlignée, les destinations légales révélées au survol. **Aucune fenêtre
en haut à gauche.** Deux états côte à côte : (a) popin ouverte, rien d'armé ; (b) « ENVOYER »
pressé — le tampon reste enfoncé, le curseur devient une croix, la carte a des régions
surlignées, la popin dit « choisissez la destination ».

Ce qui n'est pas demandé : Économie, Production, Journal (déjà maquettés ou inchangés), le mobile.
