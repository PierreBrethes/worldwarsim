import { ConvexError, v, type Infer } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, type MutationCtx } from './_generated/server';
import { isStanding, patrolRefusalOf, sameLiaison } from '../src/domain/outposts';
import { isBlitz } from './blitz';
import { PATROL_HALT_MINUTES, TOUR_RETRY_MINUTES, TOUR_ROAD_WAITS } from './constants';
import { fail } from './errors';
import type { PATROL_END } from './validators';
import { forgetMovement, standAt } from './movement/arrival';
import { movementsOf } from './movement/forces';
import { aimOf, claimSlot, march, slotsTaken } from './movement/orders';
import { drawnLiaisonsAt } from './movement/pace';
import { reassessDetection } from './movement/detection';
import { movementSlots } from '../src/domain/movement-orders';
import { hostAtPoint } from './routes';
import { cancelJob } from './scheduledJobs';
import { playerOf, requirePlayable, seasonStillPlays } from './seats';

/**
 * **La ronde** (ADR 0037 §10, #376) : une troupe terrestre de combat tourne sur une liaison
 * tracée entre deux de mes avant-postes, avec une halte en garnison à chaque bout. La mécanique
 * est celle de la tournée (`convex/tours.ts`) — slot gardé, étapes en `march` avec `keepsSlot`,
 * réessai sur une route refusée, rappel —, pas son contrat. Ce qui la fait finir (bout perdu,
 * liaison retirée du tracé) se lit à l'échéance, à l'arrivée d'une étape ou à la fin d'une halte,
 * jamais par crochets dans les mutations qui changent la carte.
 */

type PatrolEnd = Infer<typeof PATROL_END>;
type Liaison = readonly [Id<'outposts'>, Id<'outposts'>];

/** **Lancer une ronde** : la troupe part sur-le-champ vers l'autre bout. */
export const start = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    troopId: v.id('troops'),
    ends: v.array(v.id('outposts')),
  },
  handler: async (ctx, { token, seasonId, troopId, ends }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    if (await isBlitz(ctx, seasonId)) fail('NOT_IN_BLITZ');
    const troop = await ctx.db.get(troopId);
    if (troop === null || troop.playerId !== player._id) fail('UNKNOWN_TROOP', { troopId });
    if (ends.length !== 2) fail('PATROL_NOT_DRAWN');
    const liaison: Liaison = [ends[0]!, ends[1]!];
    const now = Date.now();
    const movements = await movementsOf(ctx, player._id);
    const troops = await ctx.db
      .query('troops')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    const at = typeof troop.stationedAt === 'string' ? troop.stationedAt : null;
    const refusal = patrolRefusalOf<string>({
      role: troop.role,
      pieces: 1,
      aboard: troop.carriedBy !== undefined,
      busy:
        troop.tour !== undefined ||
        troop.patrol !== undefined ||
        movements.some((movement) => movement.troopIds.includes(troopId)),
      stationedAt: at,
      liaison,
      drawn: await drawnLiaisonsAt(ctx, player._id, now),
      patrolled: patrolledBy(troops),
      slots: {
        used: (await slotsTaken(ctx, player, movements, troops)).used,
        total: movementSlots(player.researched ?? []),
      },
    });
    if (refusal !== null) {
      const { code, ...details } = refusal;
      fail(code, details);
    }
    await claimSlot(ctx, player._id, [troopId]);
    const to = liaison[0] === at ? liaison[1] : liaison[0];
    await ctx.db.patch(troopId, { patrol: { ends: [...liaison], to } });
    /** **La première étape part dans la même mutation** : une route refusée rend son code, et
     *  rien n'est lancé. */
    await leg(ctx, (await ctx.db.get(troopId))!, to);
    await reassessDetection(ctx, seasonId, now, player._id);
    return null;
  },
});

/**
 * **Rappeler** : à l'arrêt, la ronde finit sur-le-champ, en garnison où elle fait halte ; en
 * route, elle finit l'étape et s'arrête au bout atteint — elle n'a pas de base où rentrer.
 */
export const recall = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), troopId: v.id('troops') },
  handler: async (ctx, { token, seasonId, troopId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    const troop = await ctx.db.get(troopId);
    if (troop === null || troop.playerId !== player._id) fail('UNKNOWN_TROOP', { troopId });
    if (troop.patrol === undefined) fail('NOT_ON_PATROL');
    const underway = (await movementsOf(ctx, player._id)).some((movement) =>
      movement.troopIds.includes(troopId),
    );
    if (underway) await ctx.db.patch(troopId, { patrol: { ...troop.patrol, recalled: true } });
    else {
      const now = Date.now();
      await endPatrol(ctx, troop, now, 'recalled');
      await reassessDetection(ctx, seasonId, now, player._id);
    }
    return null;
  },
});

/** **La halte finit**, ou une route refusée se relit : la ronde repart vers l'autre bout. */
export const haltEnds = internalMutation({
  args: { troopId: v.id('troops') },
  handler: async (ctx, { troopId }) => {
    const troop = await ctx.db.get(troopId);
    if (troop?.patrol?.haltUntil === undefined) return;
    if (!(await seasonStillPlays(ctx, troop.playerId))) return;
    const now = Date.now();
    const here =
      typeof troop.stationedAt === 'string'
        ? ctx.db.normalizeId('outposts', troop.stationedAt)
        : null;
    const ended = here === null ? 'lost' : await endedAt(ctx, troop, here, now);
    if (ended !== null) await endPatrol(ctx, troop, now, ended);
    else {
      const to = troop.patrol.ends.find((end) => end !== here) ?? troop.patrol.to;
      const ready = { ...troop, patrol: { ...troop.patrol, to } };
      if (await tryLeg(ctx, ready, to)) {
        const { haltUntil: _halt, jobId: _job, roads: _roads, ...rolling } = troop.patrol;
        await ctx.db.patch(troopId, { patrol: { ...rolling, to } });
      } else await waitForRoad(ctx, ready, now);
    }
    await reassessDetection(ctx, troop.seasonId, now, troop.playerId);
  },
});

/**
 * **Au bout d'une étape** : rappelée, elle s'arrête là ; son bout perdu (capturé, démantelé), elle
 * se pose au point atteint, hors garnison ; sa liaison retirée du tracé, elle s'arrête en
 * garnison ; sinon elle y fait halte. L'appelant relit le brouillard.
 */
export async function arriveOnPatrol(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<void> {
  const target = movement.target.kind === 'outpost' ? movement.target.outpostId : null;
  const end = target === null ? null : await ctx.db.get(target);
  const held = end !== null && end.playerId === movement.playerId && isStanding(end, now);
  await standAt(ctx, movement, held ? end._id : movement.to);
  await forgetMovement(ctx, movement._id, now);
  for (const troopId of movement.troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop?.patrol === undefined) continue;
    const ended =
      troop.patrol.recalled === true
        ? 'recalled'
        : !held
          ? 'lost'
          : await endedAt(ctx, troop, end._id, now);
    if (ended !== null) await endPatrol(ctx, troop, now, ended);
    else await halt(ctx, troop, now, PATROL_HALT_MINUTES);
  }
}

/** Ses liaisons tenues par une ronde, dans un sens ou dans l'autre. */
export const patrolledBy = (troops: ReadonlyArray<Doc<'troops'>>): Liaison[] =>
  troops.flatMap((troop) =>
    troop.patrol === undefined ? [] : [[troop.patrol.ends[0]!, troop.patrol.ends[1]!] as const],
  );

/** **Ce qui finit la ronde au bout `here`**, relu à l'échéance : le bout perdu, ou la liaison
 *  que la carte ne trace plus (un nouveau point, une élévation, un point revenu en service). */
async function endedAt(
  ctx: MutationCtx,
  troop: Doc<'troops'>,
  here: Id<'outposts'>,
  now: number,
): Promise<PatrolEnd | null> {
  const patrol = troop.patrol!;
  const end = await ctx.db.get(here);
  if (end === null || end.playerId !== troop.playerId || !isStanding(end, now)) return 'lost';
  const liaison: Liaison = [patrol.ends[0]!, patrol.ends[1]!];
  const drawn = await drawnLiaisonsAt(ctx, troop.playerId, now);
  return drawn.some((pair) => sameLiaison(pair, liaison)) ? null : 'withdrawn';
}

/** **Une étape** : une marche vers l'autre bout, qui garde le slot de la ronde. Une route
 *  refusée lève son code. */
async function leg(ctx: MutationCtx, troop: Doc<'troops'>, to: Id<'outposts'>): Promise<void> {
  const season = (await ctx.db.get(troop.seasonId))!;
  const from = troop.stationedAt as Id<'outposts'>;
  const { movementId } = await march(ctx, {
    playerId: troop.playerId,
    season,
    type: 'march',
    origin: { kind: 'outpost', outpostId: from },
    troopIds: [troop._id],
    aim: await aimOf(ctx, troop.playerId, { kind: 'outpost', outpostId: to }),
    keepsSlot: true,
  });
  await ctx.db.patch(movementId, { patrolLeg: true });
}

/** `false` : la route le refuse — le plein manque, le plus souvent. */
async function tryLeg(ctx: MutationCtx, troop: Doc<'troops'>, to: Id<'outposts'>) {
  try {
    await leg(ctx, troop, to);
    return true;
  } catch (refused) {
    if (refused instanceof ConvexError) return false;
    throw refused;
  }
}

/** **Une halte** en garnison, jusqu'à son échéance, qui relit la règle. */
async function halt(ctx: MutationCtx, troop: Doc<'troops'>, now: number, minutes: number) {
  const patrol = troop.patrol!;
  if (patrol.jobId !== undefined) await cancelJob(ctx, patrol.jobId);
  const jobId = await ctx.scheduler.runAfter(minutes * 60_000, internal.patrols.haltEnds, {
    troopId: troop._id,
  });
  await ctx.db.patch(troop._id, {
    patrol: { ...patrol, haltUntil: now + minutes * 60_000, jobId },
  });
}

/** **Une route refusée ne revient pas seule** : la halte se prolonge, et au troisième refus
 *  d'affilée la ronde finit (`road`). */
async function waitForRoad(ctx: MutationCtx, troop: Doc<'troops'>, now: number) {
  const roads = (troop.patrol!.roads ?? 0) + 1;
  if (roads >= TOUR_ROAD_WAITS) return endPatrol(ctx, troop, now, 'road');
  await halt(ctx, { ...troop, patrol: { ...troop.patrol!, roads } }, now, TOUR_RETRY_MINUTES);
}

/**
 * **La ronde finit**, là où elle se tient, et la dépêche le dit avec le pays. La seule fonction
 * qui finit une ronde : sa prochaine échéance est annulée avec elle, et son slot se rend.
 */
export async function endPatrol(
  ctx: MutationCtx,
  troop: Doc<'troops'>,
  now: number,
  why: PatrolEnd,
): Promise<void> {
  const jobId = troop.patrol?.jobId;
  if (jobId !== undefined) await cancelJob(ctx, jobId);
  await ctx.db.patch(troop._id, { patrol: undefined });
  await ctx.db.insert('notices', {
    playerId: troop.playerId,
    at: now,
    kind: 'patrolEnded',
    role: troop.role,
    why,
    hostCountry: await countryOf(ctx, troop),
  });
}

/** Le pays où elle se tient : celui de son avant-poste, ou celui du point atteint. */
async function countryOf(ctx: MutationCtx, troop: Doc<'troops'>): Promise<string> {
  const address = troop.stationedAt;
  if (typeof address === 'string') {
    const outpostId = ctx.db.normalizeId('outposts', address);
    const outpost = outpostId === null ? null : await ctx.db.get(outpostId);
    if (outpost !== null) return outpost.hostCountry;
  }
  return address !== null && typeof address !== 'string'
    ? hostAtPoint([address.lon, address.lat])
    : '';
}
