# worldwarsim — miroir de lecture

> **La source de vérité est le repo** (`~/Documents/Projects/Worldwarsim`) : `WWS/` pour le design, les ADR et la simulation ; `CLAUDE.md` + `CONVENTIONS.md` à la racine. Ce doc n'est qu'un miroir. Mis à jour : **2026-09-14 (ADR 0024 codée, non commitée — à déployer et à jouer)**. Détail de la journée : `HANDOFF-2026-09-14.md` ; nuit des timeouts : `HANDOFF-2026-09-13.md` et `HANDOFF-2026-09-12.md`.

## Le jeu

Stratégie **web asynchrone** sur carte du monde réel, esthétique **presse illustrée 1940**. Un seul format (ADR 0020 §11), horloge optionnelle, wipe, 2 à 8 joueurs entre amis. Mode unique : **domination territoriale par couleur**. Le cœur : projeter de la force quand l'information est chère et tout engagement irréversible.

---

## LE 13 SEPTEMBRE — les règles de contact, réécrites en jouant

Pierre joue deux comptes sur la saison `898YQ3` et remonte ce qu'il voit ; six chantiers dans la journée, tous vérifieur vert (1 161 tests), prompts en `done/`. **Tranché** : 1b QG posé par le joueur (révision ADR 0015 / 0017 §2) · 2a dette de socle par gisement · 4a relevé tronqué, jamais la destination (révision fiche 04) · **ADR 0024** — *l'engagement est intentionnel, et une force posée se voit dans la portée* : camps relevés (position, milieu, depuis quand — jamais la composition), rien ne se bat sans ordre d'attaque, riposte automatique, l'attaque ne se donne que sur un objet relevé (`NOTHING_TO_ATTACK`), dernière position connue 24 h `@a-mesurer`. Révise ADR 0008, 0019 §3/§6, 0021 §2/§3. **Bugs trouvés en lisant** : la plage de repos était jugée en UTC dans l'isolat et déclarée en heure locale (2 h d'écart l'été) ; la dernière position connue disparaissait à l'arrivée de la colonne (contre l'ADR 0005). Les deux corrigés.

**État git** : quatre commits de la journée (messages anglais génériques, à francifier à l'avenir) + **un chantier de 65 fichiers non commité** (ADR 0024, lots A/B/C, stub `movements.encounter`). Aucune migration. Après déploiement : un mouvement sur la saison pour amorcer les relevés de camps.

## ⚠ À FAIRE TOUT DE SUITE

1. Commit unique « feat(convex): engagement intentionnel et camps relevés (ADR 0024) », push, CI, déploiement, un mouvement.
2. **Jouer et compter** : attaques volontaires sur camp relevé par joueur et par jour — la mesure de l'ADR 0024. Aussi : rumeur (84a), retenue à l'écran, tronçon lisible, joueur « réduit » faute de QG.
3. Puis `objectifs-neutres` (bannière 0024 posée en tête, cible `objective` publique).

## Ce qui n'a pas bougé

Restauration SQLite · export saison Japon · `scenarios.mjs:109` (le miroir plante encore le QG, dérive muette) · salve d'allonge classée « abandonnée » sans décision · `countSeat` · `_wws_snapshot.tgz` · conteneurs Hueco `Exited`.

## Questions ouvertes

Intercepter / escorter (V1 — la géométrie `firstMobileEncounter` est gardée pour ça) · identification / agent dormant (rien ne perce) · les deux rayons 25 km d'arrivée / 60 km de détection (gardés, décision 2a du 13/09 au soir) · 81 frappe terminale · 82-83 chantiers 3D · récupération passive · cas 50/50 de la victoire · recherche (44a, ADR à écrire).

## Reste à coder (dans l'ordre naturel)

Objectifs neutres · fin de saison au seuil tenu · commandes de la souris (91a) · page de presse et écran de fin · recherche (ADR à écrire) · récupération passive · intercepter / escorter.

## Verrous (ADR 0001-0024)

0005 révisée 31/08 (0020), 08/09 (0021), 10/09 (84a) · 0008 révisée 08/09 (0021), **13/09 (0024)** · 0015 et 0017 §2 **révisées 13/09 (QG posé)** · 0017 (horloge optionnelle, format retiré ; stockage unique 09/09) · 0018 (§3/§5 révisés 08/09) · 0019 (§5 révisé 08/09 ; **§3 et §6 révisés 13/09**) · 0020 · 0021 révisée 08/09, **§2/§3 révisés 13/09** · 0022 révisée 12/09 · 0023 (raster, 12/09) · **0024 (13/09)**. Règles : aucune quantité en régions ; les bonus cassent une règle ; ce qui est joli s'achète ; la plage de repos est publique, 7 h fixes, en UTC ; une force posée se voit et ne se bat que si on l'attaque ; pas de nucléaire (0007 tient).

## Méthode

Une seule source d'instructions dans le repo : `CLAUDE.md`. Cowork = design, docs, ADR, prompts. Claude Code = **seul exécutant**, un chantier à la fois, ne commet pas. Les commits sont à Pierre, message en français décrivant le chantier entier. Chaque prompt embarque ses cas d'acceptation. Depuis la VM Cowork : `GIT_OPTIONAL_LOCKS=0` devant tout `git`. Vocabulaire : mouvement · passe de résolution · avant-poste désactivé/détruit · emplacement · portée de détection · relevé · camp relevé · dernière position connue · édition · entrepôt · caisse de butin · rumeur. Bannis : tick, temps réel, micro, base, rush, convoi, leurre, atelier.
