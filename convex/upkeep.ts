import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import type { LonLat } from '../src/domain/geo';
import { withinReach, type OutpostPoint } from '../src/domain/outposts';
import {
  FOOD_UPKEEP_PER_TROOP_PER_HOUR,
  OUTPOST_REACH_KM,
  UPKEEP_UNSUPPLIED_MULTIPLIER,
} from './constants';
import { homeCountryOf, regionFacts } from './regions';
import { hostAtPoint } from './routes';

/**
 * **What an army costs to hold, and why it costs more far from home** (ADR 0019 §4).
 *
 * `consommation-continue.md` settled the shape: one flat rate per troop, no table of nine, and
 * nothing dies when the reserve runs out. Read alone, that made a sentinel at the end of the
 * world cost exactly what a garrison at home costs and never die of it — so ADR 0019 multiplies
 * the rate by where the troop stands. It is the only punishment the project's rule 3 allows: a
 * continuous cost, visible, and repaired by walking home or by founding a point.
 *
 * The module exists so that the drain has a home of its own: `resources.ts` settles stocks and
 * has no business knowing where a troop is standing, and `troops.ts` cannot be asked, since it
 * is the one that reads the settlement.
 */

/**
 * **Where a troop counts as anchored**: on its own national soil, or inside the reach of one of
 * the outposts it is handed. Two sources, one test — `withinReach` is the function that answers
 * "am I within reach of one of mine" and it must not grow a twin (ADR 0015).
 *
 * The outposts are a **parameter** rather than a lookup, and that is the seam: supply and
 * knowledge read the same geometry off different lists. A raided point still watches the ground
 * around it — a raid burns the depot, it does not blind the relay — so `recognises` passes every
 * outpost while the upkeep below passes only the ones still standing.
 */
export function isAnchored(
  point: LonLat,
  homeCountry: string | null,
  anchors: ReadonlyArray<OutpostPoint>,
): boolean {
  if (homeCountry !== null && hostAtPoint(point) === homeCountry) return true;
  return withinReach(point, anchors, OUTPOST_REACH_KM);
}

export type Upkeep = {
  /** Every troop of the player, standing or garrisoning — a queued batch is not a troop yet. */
  readonly troops: number;
  /** How many of them stand outside every anchor of their own, hence at the raised rate. */
  readonly unsupplied: number;
  /** Food an hour, the multiplier already applied. */
  readonly foodPerHour: number;
  /** The troops that pay the raised rate, so the screen can mark them where the player looks. */
  readonly unsuppliedTroopIds: ReadonlyArray<Id<'troops'>>;
};

/**
 * **A deactivated outpost does not feed anybody.** It is the question this rule opens, and
 * ADR 0019 answers it in the same breath as it writes the supply: what the raid gains from the
 * decision is the right to *starve the army camped in the point's radius*. A point that keeps
 * supplying while out of service would leave the raid exactly the economic tool it already was,
 * and the promise and the rule would not meet.
 *
 * It is temporary, like the deactivation: the immunity window runs, the point comes back, and
 * the column that stayed goes back to the plain rate. Nothing dies of it (D3) — it is dearer,
 * which is the whole of the punishment the project allows.
 */
export async function upkeepOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  now: number,
): Promise<Upkeep> {
  const player = await ctx.db.get(playerId);
  const home = homeCountryOf(player?.nation ?? null);

  const supplying = (
    await ctx.db
      .query('outposts')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect()
  )
    .filter((outpost) => outpost.disabledUntil === null || outpost.disabledUntil <= now)
    .map((outpost) => ({ point: [outpost.point.lon, outpost.point.lat] as LonLat }));

  const troops = await ctx.db
    .query('troops')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();

  const unsuppliedTroopIds: Array<Id<'troops'>> = [];
  for (const troop of troops) {
    const point = await standsAt(ctx, troop);
    /** A troop the game cannot place is at home: `null` is national soil hanging from nothing
     *  that stands (schema), and so is a building razed under it. Neither is an expedition. */
    if (point === null) continue;
    if (!isAnchored(point, home, supplying)) unsuppliedTroopIds.push(troop._id);
  }

  const plain = troops.length - unsuppliedTroopIds.length;
  return {
    troops: troops.length,
    unsupplied: unsuppliedTroopIds.length,
    foodPerHour:
      FOOD_UPKEEP_PER_TROOP_PER_HOUR *
      (plain + unsuppliedTroopIds.length * UPKEEP_UNSUPPLIED_MULTIPLIER),
    unsuppliedTroopIds,
  };
}

/** Where a troop stands, for the one question the upkeep asks of it. `null` is a troop with no
 *  place on the map — at home, or hanging from something that no longer stands. */
async function standsAt(ctx: QueryCtx, troop: Doc<'troops'>): Promise<LonLat | null> {
  const address = troop.stationedAt;
  if (address === null) return null;
  if (typeof address !== 'string') return [address.lon, address.lat];

  const outpostId = ctx.db.normalizeId('outposts', address);
  if (outpostId !== null) {
    const outpost = await ctx.db.get(outpostId);
    return outpost === null ? null : [outpost.point.lon, outpost.point.lat];
  }
  const buildingId = ctx.db.normalizeId('buildings', address);
  const building = buildingId === null ? null : await ctx.db.get(buildingId);
  const region = building === null ? null : regionFacts(building.regionId);
  return region === null ? null : region.point;
}
