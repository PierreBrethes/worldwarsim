---
type: prompt
statut: proposé
maj: 2026-10-04
code: [CLAUDE.md, WWS/docs/ETAT-DU-CODE.md]
decisions: [menage-1c-2026-10-04]
voir: [outillage/24-etat-du-code-deplace.md, ../../rapports/2026-10-04-etat-outillage.md]
---

# menage-3-recit-hors-de-claude-md — le prompt outillage 24, recalé au 04/10

**En bref.** Le récit du livré quitte `CLAUDE.md` (50 933 caractères, chargés à chaque session et
par chaque sous-agent) pour `WWS/docs/ETAT-DU-CODE.md`, **à l'identique**, prouvé par script.
Rangement pur. La voie menage-1c tranche la contradiction relevée par le rapport du 04/10 : l'état
du code vit dans `ETAT-DU-CODE.md`, celui de la doc dans `WWS/INDEX.md` (menage-5), et `CLAUDE.md`
redevient un fichier d'instructions (menage-4).

**Lis `WWS/docs/prompts/code/ready/outillage/24-etat-du-code-deplace.md` et applique-le**, avec
ses conventions (`ready/outillage/README.md`), aux écarts près ci-dessous. Ne commit pas, ne push pas.
**Suppose :** menage-2 commité (le cas 1 de 24 compare à `HEAD`).

## Écarts à 24

1. **« Suppose : 21, 22 »** ne tient plus : ni l'un ni l'autre n'est donné. Les six ancres sont
   présentes une fois chacune au 04/10 (vérifié par `grep -cF`) ; les numéros `~NN` de 24 datent
   de `7bc3a69`, ne t'y fie pas.
2. **Point 5, renvois de 22** : 22 n'étant pas passé, dans `WWS/CLAUDE.md` et `WWS/README.md`,
   remplace seulement la phrase qui envoie au « `CLAUDE.md` à la racine » pour **l'état du code** par
   un lien vers `docs/ETAT-DU-CODE.md`. Rien d'autre dans ces deux fichiers (menage-5).
3. **Cas 4** : recompte d'abord `git grep -n "CLAUDE.md" -- src convex scripts` sur l'arbre de
   départ ; le cas tient si, après, ne restent que les renvois que 24 garde (architecture,
   `RegionType`, `convex/view.ts`), et chaque écart se justifie au rapport.
4. **Cas 5** : la cible « environ 7 000, sous 9 000 » datait de 49 557 caractères ; `## Instructions`
   a gagné une ligne (menage-2). Rapporte `wc -m` avant et après ; le cas tient sous 10 000.
5. Depuis le 23/09, le récit a gagné des systèmes (notifications, invitation par lien, application
   installable, mobile, La Manchette). S'ils vivent dans les blocs A, B ou C, ils partent avec ;
   sinon ils restent où ils sont, et le rapport les nomme pour menage-4.
6. Fin : supprime `ready/outillage/24-etat-du-code-deplace.md` — il est consommé par ce prompt —
   et mets à jour sa ligne dans `ready/outillage/README.md` (« repris par menage-3, livré <date> »).

## Acceptation

Les cas 1 à 5 de 24 (avec les écarts 3 et 4), `npm run verifier` vert, et le rapport de 24 : numéros
des trois blocs au départ, `wc -m` avant / après, sortie du script, affirmations périmées croisées
sans les corriger (pour 26). Message proposé : « docs: le récit du livré quitte CLAUDE.md pour
WWS/docs/ETAT-DU-CODE.md, à l'identique ».
