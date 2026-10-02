---
type: prompt
statut: livré
maj: 2026-10-02
code: [src/routes/-plateau/FoundationRows.tsx, src/routes/-plateau/NextActions.tsx]
decisions: [ADR 0015]
voir: [../../design/propositions/ordre-de-mobilisation-et-fenetre-economie.md]
---
# Prompt Claude design — l'ordre de mobilisation et la fenêtre Économie

**En bref.** Prompt Claude design (proposition du 19/08) : carte « ordre de mobilisation », fenêtre Économie (chantier en tête, filière dessinée) et fiche Nation allégée. Maquettes faites et surfaces implémentées.

**En retard** (vérifié le 02/10/2026) :
- L.43 « doctrine choisie » dans la fiche Nation — vrai : la doctrine n'existe plus (ADR 0020 §9), le champ ne survit qu'en legacy, jamais écrit ni lu.

Source : [ordre-de-mobilisation-et-fenetre-economie.md](../../design/propositions/ordre-de-mobilisation-et-fenetre-economie.md)
(proposition du 19/08). À coller dans Claude design, idéalement en rouvrant le canvas
« Interface de saison » pour hériter du système visuel. Les deux surfaces se maquettent dans
la même session : elles partagent le vocabulaire visuel.

---

Ajoute trois planches au canvas, dans le système visuel existant — presse illustrée 1940,
papier `#f0e6d2`/encre `#2a2118`, titres Bodoni Moda, corps Archivo Narrow, chiffres IBM Plex
Mono, filets fins, libellés uppercase espacés. Interface en français. Données fictives :
la France, début de partie skirmish. Haute fidélité, comme les planches existantes.

**Planche 1 — L'ordre de mobilisation (carte sur le plateau).** Une carte persistante posée
sur le plateau, style dépêche militaire 1940 : en-tête « ORDRE DE MOBILISATION », ligne
« Fondation — 3 poses offertes restantes », puis les clés dues : fonderie · entrepôt ·
arsenal. Deux états côte à côte : (a) au repos ; (b) la clé « fonderie » sélectionnée — la
carte du monde derrière (placeholder encadré, ne pas la redessiner) montre deux régions
surlignées, et la carte-dépêche dit « choisissez la région — gisement de fer requis ». La
carte se retire d'elle-même quand la fondation est soldée : pas d'état fermé à dessiner,
c'est son absence.

**Planche 2 — La fenêtre Économie.** Industrie absorbe le recensement des bâtiments et
devient Économie. De haut en bas, deux sections, pas d'onglets :

- **Le chantier, en tête, une seule fois** : quoi, où, temps restant, bouton annuler.
  Cette phrase n'apparaît nulle part ailleurs dans la fenêtre.
- **La filière, dessinée** : un schéma vertical gisement → extracteur → conversion → sortie,
  par chaîne (fer → fonderie → alliage ; charbon → centrale → énergie ; pétrole → raffinerie
  → carburant). Un maillon bâti est plein et porte son débit réel (« +12/h ») ; un maillon
  manquant est en pointillé avec sa condition écrite en clair : « fonderie — pose de
  fondation offerte », « demande un quartier général niveau 3 », « aucun gisement de
  pétrole — ce qui manque se prend ailleurs ». Le trou dans la chaîne doit sauter aux yeux.
- **La projection, en bas** : caserne, aérodrome, port, baraquements — ce qui arme, avec
  leurs conditions au même format.
- **Pas de colonne réserves** : aucun stock chiffré dans cette fenêtre — le panneau
  haut-droit les porte déjà. La fenêtre dit le *pourquoi* (quelle entrée manque), jamais
  le *combien*.

**Planche 3 — La fiche Nation allégée.** Elle ne gère plus rien, elle se lit : identité
stratégique — pouvoir national, manque déclaré (« la France ne tient aucun gisement de
pétrole »), doctrine choisie, armée présente / en transit, plage de repos. Pas de stocks,
pas de recensement de bâtiments, pas d'action.

Règle transverse (elle révise l'ADR 0015) : rien de caché ne se débloque, rien d'affiché
sans sa condition — pas de grisé muet, chaque ligne non disponible dit ce qui l'ouvrirait.
Vocabulaire : *mouvement*, *passe de résolution*, avant-poste *désactivé/détruit* ; bannis :
tick, temps réel, micro, base, rush.
