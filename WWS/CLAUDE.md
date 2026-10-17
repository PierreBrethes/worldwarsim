---
type: index
statut: validé
maj: 2026-10-17
code: []
decisions: [ADR 0005, ADR 0020]
voir: [CONTEXT.md, QUESTIONS.md, docs/adr/README.md, docs/decisions.md]
---

# WorldWarSim — le coffre de design

**En bref.** Ce dossier garde le *pourquoi* et l'*intention* ; le code garde le *quoi* et fait foi
(`CLAUDE.md` à la racine, « Sources de vérité »). Ici : la boussole et les trois règles de design, les
pièges, les conventions de la doc. Rien ici ne tient un état du projet.

## Où est quoi

| Besoin | Où |
|---|---|
| Pourquoi une règle existe | `docs/adr/README.md`, puis l'ADR ; `docs/decisions.md` pour une décision datée |
| Ce qui n'est pas tranché | `QUESTIONS.md` |
| Ce qui reste à coder | `docs/RESTE-A-CODER.md` |
| Le vocabulaire | `CONTEXT.md` |
| Une surface avant de la coder | `docs/design/11-brief-ui.md` et `docs/design/contrats-de-vue/` |
| Un pourquoi daté introuvable ailleurs | `docs/technique/recit-du-code-2026-10-17.md` (figé) |

Une fiche de `docs/design/` décrit une intention ; une fois la règle codée, elle est figée et le
code l'emporte sur elle.

## La boussole et les trois règles

> Un jeu de plateau qu'on manipule à la main, à l'échelle de la planète : on ne voit que ce
> qu'on a payé pour voir, et ce qu'on engage ne revient pas vite.

Toute proposition se teste contre elles avant d'être discutée. La Mondiale est le jeu, la Blitz
l'atelier des pièces ; le cap et ses raisons : ADR 0027.

1. **Les bonus cassent une règle**, ils ne modifient jamais un pourcentage. « +15 % de dégâts »
   ne change aucune décision ; « je réoriente mes troupes en vol » change la carte mentale.
2. **Ce qui est joli à l'écran est une ressource qu'on achète.** Le rendu est un résultat, pas
   un décor : ce qu'on voit de l'adversaire, on l'a relevé.
3. **En Mondiale, un joueur écrasé reste nuisible, par la parole** : éliminé, il garde le
   télégraphe et ce qu'il a vu. Le risque n°1 du format long est le joueur battu tôt avec des
   jours de rien devant lui. (La Blitz élimine à la chute du QG.)

**Ton : une guerre de pays, sans idéologie** — ni symbole de régime, ni crimes, ni camps ; les
drapeaux sont ceux d'aujourd'hui.

## Pièges connus

- **Ne jamais servir ce que le joueur n'a pas le droit de voir.** Un filtrage côté client se
  contourne en trois lignes de console : le brouillard se garantit au serveur et par les types.
- **Le brouillard est un problème serveur avant d'être un problème de rendu.** Une requête
  réactive naïve se recalcule pour tous à chaque mouvement : on dénormalise par observateur
  (`docs/technique/brouillard-et-fanout.md`).
- **Pas de boucle globale, mais un job planifié par événement.** L'accumulation est paresseuse ;
  ce qui doit arriver à une heure précise se planifie.
- **Le budget de contraste appartient à la couche de jeu.** Le plateau est désaturé exprès.

## Conventions de la doc

- **Toute décision structurante devient un ADR**, avec sa section « ce qu'on abandonne ».
- **Aucun fichier vide**, pas de coquille en attente.
- **Le vocabulaire est imposé** (`CONTEXT.md`) : *mouvement*, *passe de résolution*, avant-poste
  *désactivé*, *détruit* ou *capturé*. Bannis : tick, temps réel, micro, base, rush.
- **Les chiffres de design sont des placeholders** tant qu'ils ne sont pas mesurés
  (`@a-mesurer` dans le code).
