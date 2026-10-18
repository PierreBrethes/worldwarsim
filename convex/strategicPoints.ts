import { v } from 'convex/values';
import { internal } from './_generated/api';
import { mutation } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  ISTANBUL_PERIOD_HOURS,
  RACE_HOLD_HOURS,
  STRATEGIC_POINTS,
  STRATEGIC_POINT_KEYS,
  TANGIER_LOT,
  TANGIER_PERIOD_HOURS,
  powerReady,
  raceLeaderOf,
  type StrategicPointKey,
} from '../src/domain/strategic-points';
import { fail } from './errors';
import { emptyStocks } from '../src/domain/economy';
import { creditToStorage, debit, economyOf } from './resources';
import { playerOf, requirePlayable, seatsOf } from './seats';
import { RESOURCE_KEY } from './validators';
import { regionAtRoutePoint } from './regionGeometry';

/**
 * **Les sept, posés neutres au lancement d'une Mondiale** (P11), et annoncés à toute la table —
 * la une des Sept au jour 0. Chacun sur la région de son lieu, lue sur la même grille que la
 * route : c'est elle que la prise colore.
 */
export async function layOut(ctx: MutationCtx, seasonId: Id<'seasons'>, at: number): Promise<void> {
  for (const seat of await seatsOf(ctx, seasonId)) {
    await ctx.db.insert('notices', { playerId: seat._id, at, kind: 'pointsDrawn' });
  }
  for (const key of STRATEGIC_POINT_KEYS) {
    const [lon, lat] = STRATEGIC_POINTS[key];
    const regionId = regionAtRoutePoint([lon, lat]);
    if (regionId === null) continue;
    await ctx.db.insert('strategicPoints', {
      seasonId,
      key,
      regionId,
      point: { lon, lat },
      holderId: null,
      heldSince: null,
    });
  }
}

export const seasonPoints = (
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<ReadonlyArray<Doc<'strategicPoints'>>> =>
  ctx.db
    .query('strategicPoints')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();

/**
 * **Ce que tout le monde lit d'un point** (P2) : son teneur et depuis quand, et s'il est contesté
 * — jamais par qui. La table est publique : la lire ne perce aucun brouillard.
 */
export async function pointsView(ctx: QueryCtx, seasonId: Id<'seasons'>) {
  const contested = new Set(
    (
      await ctx.db
        .query('captures')
        .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
        .collect()
    ).flatMap((capture) =>
      capture.target.kind === 'point' && capture.stoppedAt === undefined
        ? [capture.target.pointId as string]
        : [],
    ),
  );
  const points = await seasonPoints(ctx, seasonId);
  const holders = new Map<string, Doc<'players'> | null>();
  for (const point of points) {
    if (point.holderId !== null && !holders.has(point.holderId)) {
      holders.set(point.holderId, await ctx.db.get(point.holderId));
    }
  }
  return points.map((point) => {
    const holder = point.holderId === null ? null : (holders.get(point.holderId) ?? null);
    return {
      id: point._id,
      key: point.key,
      regionId: point.regionId,
      point: [point.point.lon, point.point.lat] as const,
      holder: holder === null ? null : { nation: holder.nation ?? holder.nickname },
      heldSince: point.heldSince,
      contested: contested.has(point._id),
    };
  });
}

/**
 * **Un point change de teneur** (P1-P3) : les heures de l'ancien teneur se rangent dans son cumul
 * (M12), le nouveau le tient dès maintenant — ou personne, quand son teneur est éliminé — et la
 * course se recompte.
 */
export async function handOver(
  ctx: MutationCtx,
  point: Doc<'strategicPoints'>,
  holderId: Id<'players'> | null,
  now: number,
): Promise<void> {
  if (point.holderId !== null && point.heldSince !== null) {
    const former = await ctx.db.get(point.holderId);
    if (former !== null) {
      await ctx.db.patch(former._id, {
        pointMs: (former.pointMs ?? 0) + (now - point.heldSince),
      });
    }
  }
  await ctx.db.patch(point._id, { holderId, heldSince: holderId === null ? null : now });
  await tallyRace(ctx, point.seasonId, now);
}

/**
 * **Le compte à rebours des 24 h** (M1, P3) : il part quand un joueur atteint quatre points,
 * repart à zéro s'il passe sous la barre, et `race.closeRace` le relit à l'échéance — un seul
 * meneur à la fois, donc un seul compte à rebours.
 */
async function tallyRace(ctx: MutationCtx, seasonId: Id<'seasons'>, now: number): Promise<void> {
  const counts = new Map<Id<'players'>, number>();
  for (const point of await seasonPoints(ctx, seasonId)) {
    if (point.holderId !== null) counts.set(point.holderId, (counts.get(point.holderId) ?? 0) + 1);
  }
  const leader = raceLeaderOf(counts);
  const season = await ctx.db.get(seasonId);
  if (season === null || leader === (season.raceLeaderId ?? null)) return;
  if (leader === null) {
    await ctx.db.patch(seasonId, { raceLeaderId: undefined, raceSince: undefined });
    return;
  }
  await ctx.db.patch(seasonId, { raceLeaderId: leader, raceSince: now });
  await ctx.scheduler.runAt(now + RACE_HOLD_HOURS * 3_600_000, internal.race.closeRace, {
    seasonId,
    since: now,
  });
}

/** Les heures de points qu'un joueur a tenues jusqu'à `now`, cumul et points tenus encore. */
export const heldMsOf = (
  player: Doc<'players'>,
  points: ReadonlyArray<Doc<'strategicPoints'>>,
  now: number,
): number =>
  (player.pointMs ?? 0) +
  points.reduce(
    (sum, point) =>
      point.holderId === player._id && point.heldSince !== null
        ? sum + (now - point.heldSince)
        : sum,
    0,
  );

/** **Le pouvoir d'un point, à son teneur seul et s'il est rechargé** (P4) — refusé sinon. */
async function spendPower(
  ctx: MutationCtx,
  player: Doc<'players'>,
  season: Doc<'seasons'>,
  key: StrategicPointKey,
  periodHours: number,
): Promise<Doc<'strategicPoints'>> {
  const point = (await seasonPoints(ctx, season._id)).find((one) => one.key === key);
  if (point === undefined || point.holderId !== player._id) fail('POINT_NOT_HELD', { key });
  const now = Date.now();
  if (!powerReady(point.usedAt, season.launchedAt ?? now, periodHours, now)) {
    fail('POWER_SPENT', { key });
  }
  return point;
}

/**
 * **Istanbul** (P11) : une fois par jour, le teneur lit le dernier télégramme privé entre deux
 * autres joueurs, nommés par leur nation. Le télégramme porte ensuite le tampon « lu à Istanbul »
 * chez eux, et chacun des deux l'apprend. Rien de lu, rien de dépensé.
 */
export const listen = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), between: v.array(v.string()) },
  handler: async (ctx, { token, seasonId, between }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    const point = await spendPower(ctx, player, season, 'istanbul', ISTANBUL_PERIOD_HOURS);
    const seats = await seatsOf(ctx, season._id);
    const pair = between.map((nation) => seats.find((seat) => seat.nation === nation));
    const [a, b] = pair;
    if (
      pair.length !== 2 ||
      a === undefined ||
      b === undefined ||
      a._id === b._id ||
      a._id === player._id ||
      b._id === player._id
    ) {
      fail('UNKNOWN_NATION');
    }
    const lastFrom = (from: Doc<'players'>, to: Doc<'players'>) =>
      ctx.db
        .query('messages')
        .withIndex('byPair', (q) =>
          q
            .eq('seasonId', season._id)
            .eq('lobby', undefined)
            .eq('to', to._id)
            .eq('playerId', from._id),
        )
        .order('desc')
        .first();
    const last = [await lastFrom(a, b), await lastFrom(b, a)]
      .filter((message) => message !== null)
      .sort((left, right) => right.at - left.at)[0];
    if (last === undefined) return null;

    const now = Date.now();
    await ctx.db.patch(point._id, { usedAt: now });
    await ctx.db.patch(last._id, { readAtIstanbul: true });
    const sender = last.playerId === a._id ? a : b;
    const recipient = sender === a ? b : a;
    const words = {
      from: sender.nation ?? sender.nickname,
      to: recipient.nation ?? recipient.nickname,
    };
    await ctx.db.insert('notices', {
      playerId: player._id,
      at: now,
      kind: 'readAtIstanbul',
      ...words,
      text: last.text,
    });
    for (const seat of [a, b]) {
      await ctx.db.insert('notices', {
        playerId: seat._id,
        at: now,
        kind: 'readAtIstanbul',
        ...words,
      });
    }
    return { ...words, text: last.text, at: last.at };
  },
});

/**
 * **Tanger** (P11) : le teneur, et lui seul, commerce avec le comptoir neutre — un lot de trois
 * contre un, une fois par édition. Ce qui revient entre dans ses magasins comme une livraison.
 */
export const trade = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), give: RESOURCE_KEY, get: RESOURCE_KEY },
  handler: async (ctx, { token, seasonId, give, get }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    if (give === get) fail('SAME_RESOURCE');
    const point = await spendPower(ctx, player, season, 'tangier', TANGIER_PERIOD_HOURS);
    const now = Date.now();
    /** Un lot qui ne tiendrait pas dans ses magasins se refuse avant de rien prendre : le
     *  comptoir ne garde pas la monnaie. */
    const economy = await economyOf(ctx, player._id, now);
    if (economy.cap[get] - economy.stocks[get] < TANGIER_LOT.get) {
      fail('STORAGE_FULL', { resource: get, needed: TANGIER_LOT.get });
    }
    await debit(ctx, player._id, { [give]: TANGIER_LOT.give }, now);
    const { delivered } = await creditToStorage(
      ctx,
      player._id,
      { ...emptyStocks(), [get]: TANGIER_LOT.get },
      now,
    );
    await ctx.db.patch(point._id, { usedAt: now });
    return { gave: TANGIER_LOT.give, got: delivered[get] };
  },
});
