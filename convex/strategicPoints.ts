import { v } from 'convex/values';
import { internal } from './_generated/api';
import { mutation } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  ISTANBUL_PERIOD_HOURS,
  RACE_HOLD_HOURS,
  STRATEGIC_POINTS,
  drawPoints,
  TANGIER_LOT,
  TANGIER_PERIOD_HOURS,
  powerReady,
  raceLeaderOf,
  type StrategicPointKey,
} from '../src/domain/strategic-points';
import { fail } from './errors';
import { emptyStocks } from '../src/domain/economy';
import { creditToStorage, debit, economyOf } from './resources';
import { everySeatOf, playerOf, requirePlayable, seatsOf } from './seats';
import { RESOURCE_KEY } from './validators';
import { regionAtRoutePoint } from './regionGeometry';
import { reassessDetection } from './movement/detection';

/**
 * **Les sept, tirés par la graine de la saison et posés neutres au lancement d'une Mondiale**
 * (P11), et annoncés à toute la table — la une des Sept au jour 0. Chacun sur la région de son
 * lieu, lue sur la même grille que la route : c'est elle que la prise colore.
 */
export async function layOut(ctx: MutationCtx, seasonId: Id<'seasons'>, at: number): Promise<void> {
  const season = await ctx.db.get(seasonId);
  const drawn = drawPoints(season?.seed ?? 0);
  for (const seat of await seatsOf(ctx, seasonId)) {
    await ctx.db.insert('notices', {
      playerId: seat._id,
      at,
      kind: 'pointsDrawn',
      keys: [...drawn],
    });
  }
  for (const key of drawn) await layPoint(ctx, seasonId, key);
}

/**
 * **Un point posé neutre sur la région de son lieu**, s'il ne l'est pas déjà : la région est lue
 * sur la même grille que la route, c'est elle que la prise colore. Les scènes de démo et les
 * suites de règles posent ainsi un point que le tirage n'a pas désigné.
 */
export async function layPoint(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  key: StrategicPointKey,
): Promise<Doc<'strategicPoints'> | null> {
  const existing = (await seasonPoints(ctx, seasonId)).find((point) => point.key === key);
  if (existing !== undefined) return existing;
  const [lon, lat] = STRATEGIC_POINTS[key];
  const regionId = regionAtRoutePoint([lon, lat]);
  if (regionId === null) return null;
  const id = await ctx.db.insert('strategicPoints', {
    seasonId,
    key,
    regionId,
    point: { lon, lat },
    holderId: null,
    heldSince: null,
  });
  return ctx.db.get(id);
}

/**
 * **Qui tient un point, lu au moment de s'en servir** : la règle d'un point s'applique dès la prise
 * et s'éteint à la perte, donc personne ne la garde en mémoire — chaque règle relit son teneur.
 */
export async function holdsPoint(
  ctx: QueryCtx,
  player: Pick<Doc<'players'>, '_id' | 'seasonId'>,
  key: StrategicPointKey,
): Promise<boolean> {
  return (await seasonPoints(ctx, player.seasonId)).some(
    (point) => point.key === key && point.holderId === player._id,
  );
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
 * **Ce que tout le monde lit d'un point** (P2) : son teneur, depuis quand et ses heures d'avant,
 * et s'il est contesté — jamais par qui. La saison conclue, qui l'a tenu le plus longtemps : le
 * palmarès de l'édition finale. La table est publique : la lire ne perce aucun brouillard.
 */
export async function pointsView(ctx: QueryCtx, season: Doc<'seasons'>, viewerId: Id<'players'>) {
  const contested = new Set(
    (
      await ctx.db
        .query('captures')
        .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
        .collect()
    ).flatMap((capture) =>
      capture.target.kind === 'point' && capture.stoppedAt === undefined
        ? [capture.target.pointId as string]
        : [],
    ),
  );
  const seats = new Map((await everySeatOf(ctx, season._id)).map((seat) => [seat._id, seat]));
  const nationOf = (id: Id<'players'>) => {
    const seat = seats.get(id);
    return seat === undefined ? null : (seat.nation ?? seat.nickname);
  };
  const end = season.concludedAt ?? null;
  return (await seasonPoints(ctx, season._id)).map((point) => {
    const holder = point.holderId === null ? null : nationOf(point.holderId);
    const longest = end === null ? undefined : longestOn(point, end);
    const longestNation = longest === undefined ? null : nationOf(longest.id);
    return {
      id: point._id,
      key: point.key,
      regionId: point.regionId,
      point: [point.point.lon, point.point.lat] as const,
      holder:
        point.holderId === null || holder === null
          ? null
          : { nation: holder, heldMs: point.heldMs?.[point.holderId] ?? 0 },
      heldSince: point.heldSince,
      /** Le même « à moi » que le serveur lit au refus (`FRIENDLY_TARGET`) : par l'identité. */
      mine: point.holderId === viewerId,
      contested: contested.has(point._id),
      longest:
        longest === undefined || longestNation === null
          ? null
          : { nation: longestNation, heldMs: longest.heldMs },
    };
  });
}

/** Qui a tenu un point le plus longtemps jusqu'à `end` — personne s'il n'a jamais été tenu. */
const longestOn = (point: Doc<'strategicPoints'>, end: number) =>
  [
    ...new Set([
      ...(Object.keys(point.heldMs ?? {}) as Array<Id<'players'>>),
      ...(point.holderId === null ? [] : [point.holderId]),
    ]),
  ]
    .map((id) => ({ id, heldMs: heldMsOn(point, id, end) }))
    .sort((left, right) => right.heldMs - left.heldMs)[0];

/**
 * **Un point change de teneur** (P1-P3) : les heures de l'ancien teneur se rangent dans son cumul
 * sur ce point (P2, M12), le nouveau le tient dès maintenant — ou personne, quand son teneur est
 * éliminé — et la course se recompte.
 */
export async function handOver(
  ctx: MutationCtx,
  point: Doc<'strategicPoints'>,
  holderId: Id<'players'> | null,
  now: number,
): Promise<void> {
  const former = point.holderId;
  await ctx.db.patch(point._id, {
    holderId,
    heldSince: holderId === null ? null : now,
    ...(former === null
      ? {}
      : { heldMs: { ...point.heldMs, [former]: heldMsOn(point, former, now) } }),
  });
  await tallyRace(ctx, point.seasonId, now);
  /** **Rangoun** : la mi-portée des tournées suit le point, donc le brouillard se relit à la prise
   *  comme à la perte. */
  if (point.key === 'rangoon') await reassessDetection(ctx, point.seasonId, now);
}

/**
 * **Le compte à rebours des 24 h** (M1, P3) : il part quand un joueur atteint quatre points,
 * repart à zéro s'il passe sous la barre, et `race.closeRace` le relit à l'échéance — un seul
 * meneur à la fois, donc un seul compte à rebours.
 */
async function tallyRace(ctx: MutationCtx, seasonId: Id<'seasons'>, now: number): Promise<void> {
  /** Un siège défait ne court pas : ce que ses troupes tiendraient encore ne compte pour
   *  personne. */
  const counts = new Map<Id<'players'>, number>();
  for (const point of await seasonPoints(ctx, seasonId)) {
    if (point.holderId === null || (await ctx.db.get(point.holderId))?.defeated === true) continue;
    counts.set(point.holderId, (counts.get(point.holderId) ?? 0) + 1);
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

/** Les heures qu'un joueur a tenu un point jusqu'à `now` : perdues, et tenues encore. */
const heldMsOn = (point: Doc<'strategicPoints'>, playerId: Id<'players'>, now: number): number =>
  (point.heldMs?.[playerId] ?? 0) +
  (point.holderId === playerId && point.heldSince !== null ? now - point.heldSince : 0);

/** Les heures de points qu'un joueur a tenues jusqu'à `now`, tous points confondus (M12). */
export const heldMsOf = (
  player: Doc<'players'>,
  points: ReadonlyArray<Doc<'strategicPoints'>>,
  now: number,
): number => points.reduce((sum, point) => sum + heldMsOn(point, player._id, now), 0);

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
  const usedAt = point.usedBy === player._id ? point.usedAt : undefined;
  if (!powerReady(usedAt, season.launchedAt ?? now, periodHours, now)) {
    fail('POWER_SPENT', { key });
  }
  return point;
}

/**
 * **Istanbul** (P11) : une fois par jour, le teneur lit le dernier télégramme privé entre deux
 * autres joueurs, nommés par leur nation. Le télégramme porte ensuite le tampon « lu à Istanbul »
 * chez eux, et chacun des deux l'apprend. Une paire muette coûte la lecture aussi : sonder sans
 * compter dirait qui ne se parle pas.
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
    const now = Date.now();
    await ctx.db.patch(point._id, { usedAt: now, usedBy: player._id });
    if (last === undefined) return null;

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
    await ctx.db.patch(point._id, { usedAt: now, usedBy: player._id });
    return { gave: TANGIER_LOT.give, got: delivered[get] };
  },
});
