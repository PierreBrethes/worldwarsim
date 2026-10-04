---
type: prompt
statut: proposé
maj: 2026-10-04
code: [WWS/docs/RESTE-A-CODER.md, WWS/QUESTIONS.md]
decisions: [menage-1c-2026-10-04]
voir: [outillage/30-reste-a-coder-en-file.md, ../../rapports/2026-10-04-etat-outillage.md]
---

# menage-6-reste-en-file — le prompt outillage 30, recalé au 04/10

**En bref.** `RESTE-A-CODER.md` (≈ 31 000 caractères, sections empilées hors d'ordre, statuts faux)
redevient une file : une ligne par item, des numéros qui ne bougent plus, aucun récit. Dernier
prompt du ménage de la doc (voie menage-1c).

**Lis `WWS/docs/prompts/code/ready/outillage/30-reste-a-coder-en-file.md` et applique-le**, avec ses
conventions (`ready/outillage/README.md`), aux écarts près ci-dessous. Ne commit pas, ne push pas.
**Suppose :** menage-5 commité.

## Écarts à 30

1. **« Suppose : 27, 29 »** et **`WWS/docs/HANDOFF.md`** n'existent pas (27 et 29 sont supprimés,
   aucun `HANDOFF.md`). Le point 7 de 30 ne s'applique pas. À sa place, la section
   `## Repris des archives du 04/10` posée par menage-2 : chacun de ses points devient un item
   numéroté, ou une question dans `QUESTIONS.md`, et la section disparaît.
2. **Statuts** : pas de dossier `plus-tard/`, donc pas de statut « plus tard » ; un item remis à plus
   tard est « évoqué ». La liste fermée devient : « à rédiger », « prêt » (prompt dans `ready/`),
   « ADR à écrire », « attend une décision » (avec son renvoi QUESTIONS), « évoqué », « à Pierre ».
3. **Sections nées depuis le 23/09** : « Acté le 03/10 — le mobile entier, et la une à l'entrée »
   et ce qui touche aux notifications, à l'invitation par lien, au renommage : leurs prompts sont
   dans `done/` (`mobile-1-socle-tactile`, `mobile-2-cadre`, `mobile-3-ordres`, `page-d-accueil-la-une`,
   `notifications-*`, `invitation-par-lien`, `renommer-la-manchette`…) — livrés, avec leur hash.
4. Les numéros `~NN` de 30 datent du 23/09 : retrouve chaque passage par `grep -F`.
5. **« Ce que ce prompt ne fait pas »** : le contrôle automatique des statuts ne viendra pas (31 à 33
   sont abandonnés) ; la discipline est celle du SKILL de fin de session.
6. **Cas 6** : `git status --short` ne montre rien hors `RESTE-A-CODER.md`, `rapports/`, `QUESTIONS.md`,
   `INDEX.md` (sa ligne de `RESTE-A-CODER`, si la phrase change) et la suppression du point 7.
7. Fin : les liens cassés de `RESTE-A-CODER.md` relevés par menage-5 sont réparés ; supprime
   `ready/outillage/30-…` (consommé) et mets à jour sa ligne dans `ready/outillage/README.md`.

## Acceptation

Les cas 1 à 6 de 30 (avec l'écart 6), et son rapport : tableau ancien → nouveau, sort de chaque
récit, numéros attribués, taille avant / après, les « attend une décision ». Message proposé :
« docs: RESTE-A-CODER redevient une file — une ligne par item, numéros fixes, aucun récit ».
