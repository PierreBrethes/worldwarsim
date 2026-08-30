# Prompt Claude design — couche permanente, deuxième passe

Suite de `maquette-couche-permanente.md` (planches 1a-1c validées le 30/08, avec trois
amendements de Pierre) : le bandeau des ressources passe à **icône seule + stock, sans
plafond, repliable** ; la popin Troupe **ne porte aucune action** — la carte au clic droit
= agir, la popin = lire ; les ordres passent par la **rose des vents** existante, ouverte
aussi au clic gauche sur la troupe.

À coller dans Claude design, dans le canvas « Interface de saison », à la suite de 1a-1c.

---

Ajoute deux planches, même système visuel que 1a-1c (papier `#f0e6d2`/encre `#2a2118`,
Bodoni Moda, Archivo Narrow, IBM Plex Mono, filets fins, uppercase espacé). France, deuxième
journée d'escarmouche. Haute fidélité.

**Planche 2a — Le bandeau à icônes, quatre états, échelle 2×.** Remplace 1b. Les **icônes de
ressources existantes** (`src/emblems/resources/*.webp`, telles qu'elles s'affichent déjà dans
Réserves et Production — les reprendre à l'identique, ne pas en redessiner), à 16 px, puis le
stock en chiffres mono : icône + « 84 », **aucun nom, aucun plafond**. Filet double entre
entrepôt (six) et dépôt (deux). Un chevron discret à droite pour replier.

(a) déplié, au repos ; (b) déplié, survol d'alliage : infobulle papier « alliage · 84 / 120 ·
+12 / passe · fonderie MK1 » — c'est **ici seulement** que nom et plafond apparaissent ;
(c) déplié, alliage plein (pavé plein, encre critique) et pétrole insuffisant (pavé creux,
encre notable), infobulles de diagnostic comme en 1b ; (d) **replié** : une ligne fine de la
hauteur d'un filet, qui ne montre **que les ressources marquées** — ici « ■ [alliage] 120 · □ [pétrole] 5 » —
et, quand rien n'est marqué, un simple filet avec le chevron. Note en marge : replier ne
cache jamais une marque.

**Planche 2b — La rose des vents sur la troupe.** Remplace 1c. Deux états côte à côte.

(a) **Clic gauche sur la troupe** : la popin Troupe s'ouvre (« TROUPE · FRANCE », « infanterie
· MK1 », « effectif 50 / 50 », « ravitaillée », « relève à 60 km ») **sans aucun bouton**, une
ligne de pied grise « clic droit — ordres » ; **et** la rose des vents s'ouvre en même temps
sur le sprite, dans le style de la rose existante (clic droit sur un point) : un cartouche
d'en-tête « ma force · 1 unité · Piémont », puis les branches que cette troupe accepte, avec
leur conséquence en petit sous chacune — « Envoyer » (« trace l'arc réel et propose l'envoi »),
« Fonder un avant-poste » (« la colonne y devient garnison »), « Voir le pays ». Rien d'autre.
Sur la carte : cercle de relève, sprite surligné.

(b) **« Envoyer » choisi** : la rose se ferme, la popin reste et dit « choisissez la
destination » en sous-titre, curseur en croix, destinations légales surlignées au survol,
« échap — désarme » en pied de popin. Aucune fenêtre en haut à gauche.

Note en marge de la planche : *la carte au clic droit = agir, la popin = lire* ; clic droit
sur le sprite = rose de la troupe, clic droit sur la région = rose du bâti — jamais un menu
mixte.

Ce qui n'est pas demandé : la carte « À faire maintenant » (validée en 1a), Économie,
Production, Journal, mobile.
