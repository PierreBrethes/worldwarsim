# Prompt de recherche — mécaniques du spectre RTS → OGame/Risk (29/08/2026)

À coller dans une conversation de recherche (avec accès web). Autonome : tout le contexte
nécessaire est dedans. Le rapport revient ensuite à Cowork pour tri contre le corpus.

---

Je développe **worldwarsim**, un jeu de stratégie web asynchrone entre amis (2 à 8 joueurs), sur une carte 3D du monde réel, esthétique presse illustrée 1940. Fais-moi une recherche large sur les mécaniques de jeux de stratégie, pour m'en inspirer et imaginer des mélanges.

**Le jeu, en bref** — pour filtrer ce qui est pertinent :
- Asynchrone : pas de temps réel, pas de micro-gestion. On donne des ordres (construire, recruter, déplacer), le serveur résout, on revient plus tard. Parties de 48 h, 7 jours, ou sans limite.
- Chaque joueur incarne un pays réel (France, UK, USA, URSS, Allemagne…) avec ses unités historiques. Économie : ressources localisées sur la carte (fer, charbon, pétrole, nourriture), extracteurs, un quartier général qui gate la progression, avant-postes qui projettent portée et ravitaillement.
- Combat : mouvements irréversibles vers un point de la carte, interception, brouillard de guerre par défaut (l'information est chère — stations d'écoute, leurres). Terre, mer, air.
- Piliers non négociables : jamais de temps réel ni de micro ; l'information cachée est le cœur du jeu ; les bonus en pourcentage sont bannis (une récompense = une ressource, une position ou une règle, jamais un « +15 % d'attaque ») ; un joueur écrasé reste nuisible, jamais éliminé.
- Déjà décidé, ne pas re-proposer : classement à score flou publié périodiquement, notifications push, objectifs PVE neutres (garnisons/dépôts sur pays non-joueurs), pillage entre joueurs (en design).

**Ce que je te demande** — balaie le spectre du RTS au jeu lent, au minimum : Advance Wars, Risk et ses variantes modernes, OGame/Travian/Ikariam et les browser games persistants, Rise of Kingdoms / Call of Dragons, Hearts of Iron et Paradox en général, Neptune's Pride / Subterfuge / Solium Infernum (les asynchrones purs), Diplomacy, jeux de plateau modernes pertinents (Twilight Struggle, War of the Ring), et ce que tu jugeras utile.

Pour chaque **famille de mécaniques**, liste les mécaniques notables avec : le jeu d'origine, comment ça marche concrètement, quel problème de design ça résout, et un verdict de compatibilité avec mes piliers (compatible / à adapter / incompatible et pourquoi). Familles attendues :

1. Rythme et engagement asynchrone (fenêtres d'action, ordres programmés, protection des absents, fin de partie qui ne traîne pas)
2. Information et espionnage (brouillard, rapports, contre-espionnage, désinformation)
3. Adversité et incitation au conflit (pourquoi on attaque : butin, territoire, objectifs, humiliation publique)
4. Diplomatie et trahison entre amis (alliances sans système, promesses, ce qui rend Diplomacy et Subterfuge mémorables)
5. Économie et logistique (chaînes de ressources, ravitaillement, convois attaquables)
6. Territoire et carte (contrôle de zones, chokepoints, ce que Risk fait bien avec si peu)
7. Progression sur une partie courte (arbres, débloquages, asymétries entre factions)
8. Fin de partie et scoring (conditions de victoire multiples, points, ce qui évite l'effet boule de neige)

**En plus, une section à part sur le visuel** : ma carte 3D (globe incliné, sprites d'unités et de bâtiments posés dessus) est le point fort du jeu. Cherche ce que des jeux à carte-monde font de marquant visuellement et qui pourrait avoir du **sens mécanique ou d'ambiance** chez moi : cycle jour/nuit (et est-ce que des jeux le lient à la mécanique — vision réduite la nuit ?), météo, saisons, traînées de convois, lignes de front qui se dessinent, propagande sur la carte, vieillissement du papier… Pour chaque idée : purement cosmétique ou porteuse de gameplay, et le risque (lisibilité, coût).

**Format du rendu** : par famille, un tableau ou une liste dense ; puis une section finale « mélanges candidats » — 5 à 10 combinaisons concrètes de mécaniques adaptées à MON jeu, chacune en 3-4 phrases avec le problème qu'elle résout chez moi. Pas de généralités de game design théorique : des mécaniques nommées, sourcées, décrites. Cite tes sources.
