import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { regionFacts } from './regions';
import { settle } from './resources';
import { isAtWar, seatsOf } from './seats';
import { reassessDetection } from './movement/detection';
import { recordLinkage } from './holding';

/**
 * **La production reliée, du côté de l'horloge qu'il n'y a pas** (ADR 0020 §6).
 *
 * La règle elle-même est ailleurs et tient en une comparaison (`isLinked`) ; ce qui vit ici est
 * la seule chose qu'elle demande au serveur : **régler les stocks avant que la couleur change**.
 * Il n'y a pas de tic-tac dans ce jeu, donc rien ne « constate » une coupure ; la couleur ne
 * bouge qu'à trois événements — une fondation, une désactivation, la fin d'une désactivation —
 * et à chacun d'eux le règlement doit se faire à l'ancienne couleur, sans quoi la nouvelle
 * s'appliquerait rétroactivement aux heures déjà écoulées.
 *
 * Le geste est donc toujours le même, en deux temps autour de l'écriture :
 *
 * ```
 * const before = await settleBeforeChange(ctx, seasonId, now);
 * …ce qui change la couleur…
 * await reportChange(ctx, seasonId, before, now);
 * ```
 *
 * Après le premier temps, chaque joueur porte `updatedAt === now` : le prochain règlement
 * intègre la nouvelle forme sur zéro heure écoulée, ce qui est exactement la promesse. Pas de
 * cron, pas de recalcul rétroactif, pas de champ `linked` stocké.
 */

/** Les sites qu'un joueur avait hors réseau au moment du règlement — par identité de bâtiment,
 *  jamais par compte : deux sites coupés et deux sites rendus se compensent, et le joueur
 *  n'aurait rien lu de ce qui vient de lui arriver. */
type Cuts = ReadonlyMap<Id<'players'>, ReadonlyArray<Id<'buildings'>>>;

export async function settleBeforeChange(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  now: number,
): Promise<Cuts> {
  const cuts = new Map<Id<'players'>, ReadonlyArray<Id<'buildings'>>>();
  for (const player of await belligerents(ctx, seasonId)) {
    const economy = await settle(ctx, player._id, now);
    cuts.set(
      player._id,
      economy.unlinked.map((building) => building._id),
    );
  }
  return cuts;
}

/**
 * **Ce que la couleur vient de couper, et de rendre** — chez le seul propriétaire. L'adversaire
 * qui a coupé la frontière le lit sur sa carte ; une dépêche chez lui lui donnerait ce que son
 * renseignement n'a pas payé (ADR 0005).
 *
 * Rien n'est réglé ici : le règlement a eu lieu juste avant, à l'ancienne couleur, et ce second
 * temps ne fait que lire et écrire des lignes de journal.
 */
export async function reportChange(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  before: Cuts,
  now: number,
): Promise<void> {
  for (const player of await belligerents(ctx, seasonId)) {
    const was = new Set(before.get(player._id) ?? []);
    const nowCut = (await settle(ctx, player._id, now)).unlinked;
    const ids = new Set(nowCut.map((building) => building._id));

    const cut = nowCut.filter((building) => !was.has(building._id));
    if (cut.length > 0) {
      await ctx.db.insert('notices', {
        playerId: player._id,
        at: now,
        kind: 'productionCut',
        sites: cut.length,
        hostCountry: countryOf(cut),
      });
    }

    /** Ce qui était coupé et ne l'est plus. Les bâtiments rasés ne comptent pas : ils ne sont
     *  plus nulle part, et « de nouveau relié » sur une ruine serait un mensonge. */
    const restored = [...was].flatMap((id) => (ids.has(id) ? [] : [id]));
    const standing = (await Promise.all(restored.map((id) => ctx.db.get(id)))).flatMap(
      (building) => (building === null ? [] : [building]),
    );
    if (standing.length > 0) {
      await ctx.db.insert('notices', {
        playerId: player._id,
        at: now,
        kind: 'productionRestored',
        sites: standing.length,
        hostCountry: countryOf(standing),
      });
    }
  }
  /** La couleur que la vue lira jusqu'au prochain changement (#144). */
  await recordLinkage(ctx, seasonId);
}

/**
 * **La fin d'une désactivation est un événement comme les deux autres** — le seul que personne
 * n'ordonne. Il est daté à la seconde où le raid l'a posé (`disabledUntil`), donc il se planifie
 * à ce moment-là : c'est un rendez-vous pris, pas une horloge qui bat.
 *
 * Le règlement se fait **à `disabledUntil` exactement**, quelle que soit l'heure à laquelle le
 * travail se réveille : sans quoi un réveil en retard créditerait au plein débit les heures où
 * le point était hors service. C'est aussi pourquoi la lecture de la couleur borne la
 * désactivation de façon **inclusive** (`convex/holding.ts`) — à cet instant précis le point est
 * encore hors service, et la fenêtre se referme sur elle-même.
 */
export const restoreAfterDisabling = internalMutation({
  args: { seasonId: v.id('seasons'), at: v.number() },
  handler: async (ctx, { seasonId, at }) => {
    const season = await ctx.db.get(seasonId);
    if (season === null || season.concludedAt !== null) return;
    const before = await settleBeforeChange(ctx, seasonId, at);
    await reportChange(ctx, seasonId, before, Date.now());
    await reassessDetection(ctx, seasonId);
  },
});

/** Le rendez-vous que la désactivation prend pour sa propre fin. */
export const scheduleRestore = (
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  disabledUntil: number,
): Promise<void> =>
  ctx.scheduler
    .runAt(disabledUntil, internal.production.restoreAfterDisabling, {
      seasonId,
      at: disabledUntil,
    })
    .then(() => undefined);

/** Les belligérants, jamais les sièges : quelqu'un qui n'a pas choisi son drapeau n'a ni
 *  ressources ni bâtiments, et `settle` n'a rien à lui régler. */
async function belligerents(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
): Promise<ReadonlyArray<Doc<'players'>>> {
  const season = await ctx.db.get(seasonId);
  if (season === null) return [];
  const seats = await seatsOf(ctx, seasonId);
  return seats.filter((seat) => isAtWar(seat, season));
}

/** Le pays d'où la nouvelle vient. Le premier site touché, et pas une liste : la dépêche dit
 *  qu'il faut aller voir, la carte « à faire maintenant » dit lesquels. */
const countryOf = (buildings: ReadonlyArray<Doc<'buildings'>>): string =>
  regionFacts(buildings[0]!.regionId)?.country ?? '';
