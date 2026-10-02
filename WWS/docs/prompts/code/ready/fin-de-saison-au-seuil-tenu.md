---
type: prompt
statut: proposé
maj: 2026-10-02
code: [convex/victory.ts, src/domain/victory.ts, convex/holding.ts, convex/press.ts]
decisions: [ADR 0020]
voir: [../../../design/propositions/vision-v1-expeditions.md, ../../../../QUESTIONS.md, ../../../RESTE-A-CODER.md]
---
# fin-de-saison-au-seuil-tenu — la part de carte tenue conclut la saison (ADR 0020 §2 et §9)

**En bref.** Domination par part du théâtre tenue 12 h, qui remplacerait l'échafaudage `REDUCTION_FACTOR`. Remis à plus tard (Pierre, 16/09) et à ne pas donner avant d'avoir tranché le sol national dans la part (QUESTIONS.md) ; rien n'en est codé.

> **Remis à plus tard (Pierre, 16/09)** : « quand on aura mieux établi le gameplay ». Garde
> `DOMINATION_SHARE = 0,5` et `DOMINATION_HELD_HOURS = 12` en `@a-mesurer`, mesure nommée :
> durée entre la première `dominanceClaimed` et la conclusion, par saison.
>
> ⚠ **Ne pas donner avant d'avoir tranché le sol national dans la part** (`QUESTIONS.md` 🟠) :
> `heldRegions` compte tout le sol d'origine, et les admin-1 sont inégales — Royaume-Uni 232,
> Italie 110, France 101, URSS 85, États-Unis 51, Japon 47, Chine 32, Allemagne 16. Tel quel,
> Royaume-Uni contre Allemagne se conclut à 12 h sans un mouvement.
>
> **Depuis la rédaction (06/09), la couleur a gagné des événements** — relis les appelants de
> `settleBeforeChange` : le lever de fondation (`outposts.standOutpost`, 15/09), l'élévation
> (`constructions.ts`, 15/09), la fin de désactivation (`production.ts`), la capitulation, et le
> démantèlement à venir (`rose-sur-les-avant-postes`). `reassessDominance` s'accroche **une fois**,
> au voisinage de `settleBeforeChange` / `settle`, pas dans chaque appelant. `heldOf` vit toujours
> dans `convex/control.ts` ; la lecture unique de la couleur est `heldOver` (`convex/holding.ts`).

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0020 §2, §4, §9 et ses conséquences
(« la victoire par seuil tenu devient obligatoire »), `convex/victory.ts` (**l'échafaudage à
remplacer**, son en-tête le dit), `src/domain/victory.ts`, `convex/view.ts` (`season.reduction`,
`standingsOf` — l'échafaudage servi), `src/routes/-plateau/JournalWindow.tsx` (le tableau de la
victoire de test en pied), `convex/control.ts` (`heldOf`), `src/domain/standings.ts`
(`territory`), `convex/press.ts` (`publishFinalEdition`), `convex/seasons.ts`
(`concludeSeason`, `conclude`), `convex/players.ts` (`surrender` → dernier debout). Ne commit
pas, ne push pas. Un chantier, un commit.

## La règle

Un joueur **gagne** quand sa **part du théâtre** (régions tenues ÷ régions tenues par quelqu'un,
ADR 0020 §2 — la même formule que `standings.territory`) est **≥ `DOMINATION_SHARE`**
(`@a-mesurer`, 0,5) **sans interruption pendant `DOMINATION_HELD_HOURS`** (`@a-mesurer`, 12 h).
Une durée, jamais un rendez-vous. Le compte à rebours est **public** (§4 : le score est public) :
tout le monde sait qui menace et depuis quand — c'est le moment où l'on s'allie contre lui. La
saison se conclut à la passe qui constate la durée tenue ; l'édition finale de la presse s'écrit
(`publishFinalEdition`), le vainqueur est nommé. Les autres portes de sortie restent : `conclude`
du fondateur (ou du doyen), dernier non défait.

## Ce qui change

1. **Domaine pur** — `src/domain/victory.ts` réécrit : `dominanceOf(sharesByPlayer, threshold)
   → playerId | null` (une seule part ≥ seuil ; deux à la fois est impossible avec 0,5, mais la
   fonction rend `null` s'il y en a plus d'une, pour un seuil plus bas) et
   `heldLongEnough(since, now, hours)`. `isReduced`, `playersToReduce`, `REDUCTION_FACTOR`
   **disparaissent** avec tout ce qui les lit (`standingsOf`, `season.reduction`, le tableau du
   journal, `fr.victory.*` de test) — l'échafaudage part **entier**, il ne se raffine pas.
2. **Serveur** — `seasons.dominance: { playerId, since } | null` (optionnel jusqu'au wipe).
   À **chaque événement qui change la couleur** (les mêmes que `production-reliee` et
   `memoire-de-la-carte` : fondation, désactivation, destruction, réactivation d'avant-poste,
   capitulation), `reassessDominance(ctx, seasonId)` : calcule les parts (une seule fonction
   avec `standings.territory` — pas deux formules), et : personne au seuil → `dominance = null`
   + job annulé ; le même joueur → rien ; un nouveau → `dominance = { playerId, since: now }` +
   job `victory.settle` planifié à `since + DOMINATION_HELD_HOURS` (`jobId` gardé pour
   l'annulation). `settle` **revérifie** à l'heure dite (gardé par `seasonStillPlays`) : tenu →
   `concludeSeason(winner)` ; sinon no-op (la réévaluation a déjà nettoyé). Pas de cron.
3. **Public** — `playerView.season.dominance: { nickname, nation, share, since, settlesAt } |
   null` pour tous ; dépêches à **tous** : `dominanceClaimed` (critique — « <nation> tient
   <share> % du théâtre — la saison se conclut à HH:MM si rien ne change »),
   `dominanceBroken` (notable), `seasonWon` (critique, remplace le texte de `concluded` s'il
   existe). Le bandeau porte le compte à rebours quand il court (un chiffre, `asDuration`).
4. **Presse** : rien à changer — l'édition finale est déjà écrite par `concludeSeason` ; la page
   dit le vainqueur **seulement** par le tampon existant de la saison close (contrat 07 : elle
   ne couronne pas — le journal le fait).
5. **`surrender`** : le dernier non défait gagne, comme aujourd'hui ; si une dominance courait
   pour un joueur qui capitule, elle est réévaluée (il ne tient plus rien qui compte — précise
   dans le code si un défait tient encore sa couleur : oui, ADR 0020 « vos avant-postes gardent
   votre encre » ; donc un défait peut encore *bloquer* une dominance par sa part, jamais la
   gagner — teste-le).

## Ce que ce prompt ne fait pas

Pas d'écran de fin (la presse finale + le journal en tiennent lieu). Pas de wipe automatique.
Pas de seuil variable par nombre de joueurs (une constante, à mesurer en partie).

## Cas d'acceptation (tests d'abord)

1. À 2 joueurs, A tient 6 régions, B 4 : part 0,6 ≥ 0,5 → `dominance = { A, since }`, job à
   +12 h, dépêche à tous ; B fonde 3 régions à +5 h → parts 6/13 = 0,46 → `null`, job annulé,
   `dominanceBroken`.
2. A tient 12 h sans rupture → `settle` conclut, `winner = A`, édition finale `final: true`,
   `seasonWon` chez tous, `status: 'concluded'`.
3. Un raid désactive un avant-poste de A à +11 h 59 → `settle` à +12 h est un no-op, la saison
   continue.
4. Un défait (observateur) qui tient 3 régions compte au dénominateur ; il n'est jamais
   `dominance.playerId`.
5. `playerView.season.reduction` n'existe plus ; le journal n'a plus de tableau de test ; aucune
   clé `fr.victory.*` morte ne reste (test de clés mortes s'il existe, sinon `knip`).
6. `conclude` par le fondateur pendant une dominance courante → conclusion immédiate, job annulé.
7. Budget : `reassessDominance` lit `heldOf` une fois par événement — pas par joueur.

`npm run verifier` vert. `a-mesurer.md` régénéré. `CLAUDE.md` (« la victoire »), `QUESTIONS.md`
(« 34 % des saisons se terminent avant 48 h » et le 🔴 clôture se relisent), `RESTE-A-CODER.md`
(12 livré), `WWS/CONTEXT.md` (dominance, seuil tenu).
