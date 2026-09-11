import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation, query } from './_generated/server';
import { destinationPoint, type LonLat } from '../src/domain/geo';
import { LOOT_CRATE_HOURS, LOOT_RUMOR_DELAY_MINUTES, LOOT_RUMOR_RADIUS_KM } from './constants';
import { playerOf } from './seasons';

export function approximateLootCenter(
  point: LonLat,
  radiusKm = LOOT_RUMOR_RADIUS_KM,
  random: () => number = Math.random,
): LonLat {
  const distance = radiusKm * Math.sqrt(Math.max(0, Math.min(1, random())));
  return destinationPoint(point, distance, 360 * random());
}

export async function ensureLootRumor(
  ctx: MutationCtx,
  source: {
    seasonId: Id<'seasons'>;
    engagementId: Id<'engagements'>;
    point: LonLat;
    appearedAt: number;
  },
): Promise<Id<'lootRumors'> | null> {
  const season = await ctx.db.get(source.seasonId);
  if (season === null || season.status !== 'launched') return null;
  const existing = await ctx.db
    .query('lootRumors')
    .withIndex('byEngagement', (q) => q.eq('engagementId', source.engagementId))
    .unique();
  if (existing !== null) return existing._id;

  const publishAt = source.appearedAt + LOOT_RUMOR_DELAY_MINUTES * 60_000;
  const endsAt = source.appearedAt + LOOT_CRATE_HOURS * 3_600_000;
  if (Date.now() >= endsAt) return null;
  const version = 1;
  const center = approximateLootCenter(source.point);
  const rumorId = await ctx.db.insert('lootRumors', {
    seasonId: source.seasonId,
    engagementId: source.engagementId,
    center: { lon: center[0], lat: center[1] },
    radiusKm: LOOT_RUMOR_RADIUS_KM,
    appearedAt: source.appearedAt,
    publishAt,
    endsAt,
    version,
  });
  const publishJobId = await ctx.scheduler.runAt(publishAt, internal.lootRumors.publish, {
    rumorId,
    version,
    expectedAt: publishAt,
  });
  const endJobId = await ctx.scheduler.runAt(endsAt, internal.lootRumors.end, {
    rumorId,
    version,
    expectedAt: endsAt,
  });
  await ctx.db.patch(rumorId, { publishJobId, endJobId });
  return rumorId;
}

async function currentAppointment(ctx: MutationCtx, rumorId: Id<'lootRumors'>, version: number) {
  const rumor = await ctx.db.get(rumorId);
  if (rumor === null || rumor.version !== version) return null;
  const season = await ctx.db.get(rumor.seasonId);
  return season?.status === 'launched' ? rumor : null;
}

export const publish = internalMutation({
  args: {
    rumorId: v.id('lootRumors'),
    version: v.number(),
    expectedAt: v.number(),
  },
  handler: async (ctx, { rumorId, version, expectedAt }) => {
    const rumor = await currentAppointment(ctx, rumorId, version);
    if (
      rumor === null ||
      rumor.publishAt !== expectedAt ||
      rumor.publishedAt !== undefined ||
      rumor.endedAt !== undefined ||
      Date.now() < expectedAt
    ) {
      return;
    }
    if (Date.now() >= rumor.endsAt) {
      await ctx.db.patch(rumorId, { endedAt: rumor.endsAt });
      return;
    }
    await ctx.db.patch(rumorId, { publishedAt: expectedAt });
  },
});

export const end = internalMutation({
  args: {
    rumorId: v.id('lootRumors'),
    version: v.number(),
    expectedAt: v.number(),
  },
  handler: async (ctx, { rumorId, version, expectedAt }) => {
    const rumor = await currentAppointment(ctx, rumorId, version);
    if (
      rumor === null ||
      rumor.endsAt !== expectedAt ||
      rumor.endedAt !== undefined ||
      Date.now() < expectedAt
    ) {
      return;
    }
    await ctx.db.patch(rumorId, { endedAt: expectedAt });
  },
});

export const list = query({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { season } = await playerOf(ctx, token, seasonId);
    const rumors = await ctx.db
      .query('lootRumors')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
    return rumors
      .filter((rumor) => rumor.publishedAt !== undefined)
      .sort(
        (left, right) =>
          left.publishAt - right.publishAt ||
          (left._id < right._id ? -1 : left._id === right._id ? 0 : 1),
      )
      .map((rumor) => ({
        id: rumor._id,
        publishedAt: rumor.publishedAt!,
        center: rumor.center,
        radiusKm: rumor.radiusKm,
        state: rumor.endedAt === undefined ? ('active' as const) : ('ended' as const),
      }));
  },
});
