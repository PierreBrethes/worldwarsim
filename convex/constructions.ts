import { v } from 'convex/values';
import { internalMutation, mutation } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { SeasonFormat } from '../src/domain/ids';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import { EXPLOITED_DEPOSITS, placementRefusal } from '../src/domain/economy';
import { nearestOutpostKm } from '../src/domain/outposts';
import { buildingAt, cappedByHq, levelOf, playerBuildings } from './buildings';
import {
  OUTPOST_REACH_KM,
  SEASON_FORMATS,
  unlockLevel,
  buildCost,
  buildMinutes,
  buildingCap,
  formatOf,
} from './constants';
import { outpostsOf, pointOf } from './movements';
import { fail, type ErrorCode } from './errors';
import { foundationOwed, homeCountryOf, regionFacts } from './regions';
import { credit, debit } from './resources';
import { playerByToken, requirePlayable } from './seasons';
import { BUILDING_KEY } from './validators';

/** An outpost row, as the reach reads it: a point and nothing else. */
const reachSource = (outpost: { point: { lon: number; lat: number } }) => ({
  point: pointOf(outpost.point),
});

/** A refusal, carried rather than thrown: the same rule is read at two doors, and only one of
 *  them answers a player. At the other one it cancels an entry and refunds it. */
type Refusal = { readonly code: ErrorCode; readonly details?: Record<string, unknown> };

/**
 * **Is this placement one the season still owes?** Asked in two places that must agree — the
 * refusal, where a due key escapes the building ceiling, and the bill, where it costs nothing —
 * so it is asked once and answered here.
 *
 * A first level only: raising a building is never a debt of the format.
 */
const owedFreely = (
  nation: string | null,
  buildings: ReadonlyArray<Doc<'buildings'>>,
  building: Doc<'constructions'>['building'],
  regionId: string,
): boolean =>
  (buildingAt(buildings, building, regionId)?.level ?? 0) === 0 &&
  foundationOwed(
    nation,
    buildings.map((held) => held.key),
  ).includes(building);

export const start = mutation({
  args: { token: v.string(), building: BUILDING_KEY, regionId: v.string() },
  handler: async (ctx, { token, building, regionId }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);

    /**
     * **The queue is unbounded and paid in advance** (decision of 25/08). The objection the
     * single site answered was a queue that *promised* a stacking the server refuses; an entry
     * that has already settled its bill promises nothing — the server took it.
     *
     * So every rule below is read against what stands **plus what is queued**: two entries can
     * never aim at the same region, and a pledge counts against the ceiling the headquarters
     * carries. The queue is where a nation would otherwise keep the buildings it is not
     * allowed to have.
     */
    const queue = await queueOf(ctx, player._id);
    const refusal = await refusalFor(ctx, player, season, building, regionId, queue);
    if (refusal) fail(refusal.code, refusal.details);

    const buildings = await playerBuildings(ctx, player._id);
    const level = (buildingAt(buildings, building, regionId)?.level ?? 0) + 1;
    const now = Date.now();

    /**
     * **The foundation is placed, never offered.** Choosing the region is the one gesture of
     * the opening that is a decision; the price and the wait on what is not one are what the
     * format takes back. So as long as a key of the foundation is still owed, its first
     * placement costs nothing and stands at once — every other rule above having already had
     * its say: deposit, one building per region, home country.
     *
     * It never enters the queue: there is nothing to wait for and nothing to bill, so it has
     * no rank, no refund and no turn — a playtest lost three free placements behind a paid
     * mill the day it did (19/08).
     */
    if (owedFreely(player.nation, buildings, building, regionId)) {
      await ctx.db.insert('buildings', { playerId: player._id, key: building, regionId, level: 1 });
      return { finishesAt: now, cost: {}, level, rank: null };
    }

    const cost = buildCost(building, level);
    await debit(ctx, player._id, cost, now);

    const last = queue[queue.length - 1];
    const rank = last ? last.rank + 1 : 0;
    const constructionId = await ctx.db.insert('constructions', {
      playerId: player._id,
      building,
      regionId,
      level,
      rank,
      finishesAt: null,
    });
    await startHead(ctx, player._id, now);

    const written = await ctx.db.get(constructionId);
    return { finishesAt: written?.finishesAt ?? null, cost, level, rank };
  },
});

/**
 * Only what has not started gets refunded — the patron of `troops.cancel`, and for the same
 * reason: a running site has already consumed the queue's time, and taking it back midway
 * would open a free round trip between matter and time.
 */
export const cancel = mutation({
  args: { token: v.string(), constructionId: v.id('constructions') },
  handler: async (ctx, { token, constructionId }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);
    const entry = await ctx.db.get(constructionId);
    if (!entry || entry.playerId !== player._id) fail('UNKNOWN_CONSTRUCTION');
    if (entry.finishesAt !== null) fail('CONSTRUCTION_ALREADY_STARTED');

    const refunded = buildCost(entry.building, entry.level);
    await credit(ctx, player._id, refunded, Date.now());
    await ctx.db.delete(constructionId);
    return { refunded };
  },
});

export const finish = internalMutation({
  args: { constructionId: v.id('constructions') },
  handler: async (ctx, { constructionId }) => {
    const construction = await ctx.db.get(constructionId);
    if (!construction) return;

    const buildings = await playerBuildings(ctx, construction.playerId);
    const standing = buildingAt(buildings, construction.building, construction.regionId);
    if (standing) {
      await ctx.db.patch(standing._id, { level: construction.level });
    } else {
      await ctx.db.insert('buildings', {
        playerId: construction.playerId,
        key: construction.building,
        regionId: construction.regionId,
        level: construction.level,
      });
    }
    await ctx.db.delete(constructionId);
    await startHead(ctx, construction.playerId, Date.now());
  },
});

/**
 * **The second door.** An entry was accepted against the world as it stood at the enqueue; by
 * the time its turn comes the world may have taken the right back — a region lost, a ceiling
 * that came down, a tier that closed. Nothing then starts on a right that no longer exists:
 * the entry is cancelled, refunded whole, and the player is told in the journal.
 *
 * Idempotent on a queue already running, like `troops.startHead`, so every caller may call it
 * unconditionally. It re-reads the state itself rather than trusting whoever woke it.
 */
async function startHead(ctx: MutationCtx, playerId: Id<'players'>, now: number): Promise<void> {
  const player = await ctx.db.get(playerId);
  if (!player) return;
  const season = await ctx.db.get(player.seasonId);
  if (!season) return;

  for (;;) {
    const head = (await queueOf(ctx, playerId))[0];
    if (!head || head.finishesAt !== null) return;

    // The head is measured against what stands, and against nothing queued: everything else in
    // the queue is behind it and has not happened.
    const refusal = await refusalFor(ctx, player, season, head.building, head.regionId, []);
    if (refusal) {
      await credit(ctx, playerId, buildCost(head.building, head.level), now);
      await ctx.db.insert('notices', {
        playerId,
        at: now,
        kind: 'constructionCancelled',
        building: head.building,
        regionId: head.regionId,
      });
      await ctx.db.delete(head._id);
      continue;
    }

    const finishesAt = now + buildMinutes(head.building, head.level) * 60_000;
    await ctx.db.patch(head._id, { finishesAt });
    await ctx.scheduler.runAt(finishesAt, internal.constructions.finish, {
      constructionId: head._id,
    });
    return;
  }
}

/**
 * **The whole of the placement rule, read once.** Both doors call it — the enqueue, where it
 * answers the player, and the start of a head, where it decides whether the entry still has a
 * right to exist. Two copies would drift, and the drift would be a site rising on a right the
 * player lost.
 *
 * `pledged` is what the queue adds to the state for this reading: the whole queue at the
 * enqueue, nothing at all for a head.
 */
async function refusalFor(
  ctx: QueryCtx,
  player: Doc<'players'>,
  season: Doc<'seasons'>,
  building: Doc<'constructions'>['building'],
  regionId: string,
  pledged: ReadonlyArray<Doc<'constructions'>>,
): Promise<Refusal | null> {
  const region = regionFacts(regionId);
  if (!region) return { code: 'UNKNOWN_REGION', details: { regionId } };

  /**
   * **Home, or within reach of one of the player's outposts** (ADR 0015). The reach is a
   * radius in kilometres, never a count of regions — Natural Earth cuts the United Kingdom
   * into 232 districts and Germany into 16, so a radius counted in regions would let a
   * cartography vendor balance the season. How many regions it covers therefore varies by
   * country: that is the geography speaking.
   *
   * Nothing else moves. A well in Arabia is a building like any other — it wants its
   * deposit, it takes the single site of its region, it counts against the ceiling the
   * headquarters carries, and it will be lootable the day looting exists.
   */
  if (region.country !== homeCountryOf(player.nation)) {
    const outposts = await outpostsOf(ctx, player._id);
    const nearest = nearestOutpostKm(region.point, outposts.map(reachSource));
    if (nearest === null || nearest > OUTPOST_REACH_KM) {
      return {
        code: 'OUT_OF_OUTPOST_REACH',
        details: {
          regionId,
          reachKm: OUTPOST_REACH_KM,
          nearestKm: nearest === null ? null : Math.round(nearest),
        },
      };
    }
  }

  const buildings = await playerBuildings(ctx, player._id);
  if (
    building === 'hq' &&
    buildings.some((held) => held.key === 'hq' && held.regionId !== regionId)
  ) {
    return { code: 'HQ_ALREADY_BUILT' };
  }

  /**
   * **One entry per region, standing or queued.** The ground under a pledge is taken though
   * nothing rises on it yet: two entries aiming at the same region would leave two buildings
   * on it once the second `finish` lands, and a raise queued twice would bill a level nobody
   * can reach. It is also what keeps the level of an entry knowable at the enqueue.
   */
  const claimed = pledged.find((entry) => entry.regionId === regionId);
  if (claimed) {
    return { code: 'REGION_TAKEN', details: { regionId, standing: claimed.building } };
  }

  const onRegion = buildings.find((held) => held.regionId === regionId)?.key ?? null;
  const format = formatOf(season.durationHours);
  const hqLevel = levelOf(buildings, 'hq');
  const cap = buildingCap(format, hqLevel);
  const requiredLevel = unlockLevel(building, format);
  // A pledge on a bare region is a building coming; a pledge on a region that already carries
  // one is a raise, and a raise moves neither the count nor the ceiling.
  const standing =
    buildings.length +
    pledged.filter((entry) => !buildings.some((held) => held.regionId === entry.regionId)).length;

  /**
   * **A key the season owes is never refused by the ceiling** (decision of 25/08). It was, and
   * it made a debt of the format unpayable by a rule of the format: a campaign plants its
   * headquarters at 1, which carries five buildings, and an American ground is owed five
   * extractors — the fifth was refused `BUILDING_CAP_REACHED` on an empty map.
   *
   * The ceiling therefore bites the **paying road only**, the same gesture and the same reason
   * as the construction lock before it (`fondation-hors-chantier.md`). It comes back the moment
   * the building stands: the count includes it like any other, so a nation may sit *above* its
   * ceiling for as long as its debt says — the format's debt outranks the player's ambition,
   * and the ambition waits for the headquarters.
   */
  const owed = owedFreely(player.nation, buildings, building, regionId);

  const refusal = placementRefusal(
    building,
    region,
    { onRegion, standing, cap: owed ? Number.POSITIVE_INFINITY : cap, hqLevel },
    requiredLevel,
  );
  if (refusal === 'REGION_TAKEN')
    return { code: refusal, details: { regionId, standing: onRegion } };
  // The refusal names its remedy with the figure it would buy: "montez le QG" is advice,
  // "un quartier général niveau 2 le porte à 8" is a plan (ADR 0015, révision du 24/08).
  if (refusal === 'BUILDING_CAP_REACHED') {
    return { code: refusal, details: { cap, hqLevel, ...relief(format, hqLevel) } };
  }
  // The refusal names its threshold: "demande un QG de niveau 3" is a plan, "impossible" is
  // a wall — and the tier is the one refusal a player can always act on.
  if (refusal === 'BUILDING_LOCKED') {
    return { code: refusal, details: { building, requiredLevel, hqLevel } };
  }
  if (refusal === 'DEPOSIT_REQUIRED') {
    return {
      code: refusal,
      details: { building, expected: EXPLOITED_DEPOSITS[building], found: region.deposit },
    };
  }
  if (refusal === 'NOT_COASTAL') return { code: refusal, details: { regionId } };

  const maximum = SEASON_FORMATS[format].maxHqLevel;
  const level = (buildingAt(buildings, building, regionId)?.level ?? 0) + 1;
  if (building === 'hq' && level > maximum)
    return { code: 'MAX_LEVEL_REACHED', details: { maximum } };
  if (cappedByHq(building, level - 1, hqLevel)) return { code: 'CAPPED_BY_HQ' };
  return null;
}

/**
 * What the next headquarters level would carry, `null` at the top of the format's ladder. Two
 * numbers rather than a sentence (ADR 0016), and both out of `buildingCap` — the screen that
 * says "un quartier général niveau 2 le porte à 8" and the refusal that raised it must be
 * reading the same ladder, never two copies of it.
 */
export const capReliefOf = (
  format: SeasonFormat,
  hqLevel: number,
): { readonly nextHqLevel: number; readonly nextCap: number } | null =>
  hqLevel >= SEASON_FORMATS[format].maxHqLevel
    ? null
    : { nextHqLevel: hqLevel + 1, nextCap: buildingCap(format, hqLevel + 1) };

const relief = (format: SeasonFormat, hqLevel: number) => capReliefOf(format, hqLevel) ?? {};

/** Everything a player has pledged to build, head first. */
export async function queueOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'constructions'>>> {
  const entries = await ctx.db
    .query('constructions')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
  return entries.sort((a, b) => a.rank - b.rank);
}
