/**
 * **L'économie de la Blitz et sa carte de départ** (lot 4 des deux modes, 14/10). La règle est
 * pure (`src/domain/blitz.ts`, `src/domain/blitz-placement.ts`) ; ce module mesure, écrit et
 * règle.
 *
 * La carte se pose comme les objectifs neutres (`objectives.ts`), et pour la même raison : un
 * champ de distances par QG candidat ne tient pas dans la seconde d'une mutation. **Lire**
 * (`placementInput`), **calculer** dans une action (`place`), **écrire** en une transaction
 * (`commit`), qui refuse une seconde pose.
 *
 * Les bâtiments neutres appartiennent au siège irrégulier, sans garnison : on les capture comme
 * on capture ceux d'un adversaire (`captures.ts`), et ils sont publics (`view.ts`).
 */

import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  clockVerdict,
  fundsAt,
  incomePerMinute,
  mendPlan,
  notInBlitz,
  type Funds,
} from '../src/domain/blitz';
import {
  blitzMapRulesOf,
  planBlitzMap,
  type BlitzCandidate,
  type BlitzMeasure,
  type BlitzSite,
} from '../src/domain/blitz-placement';
import type { LonLat } from '../src/domain/geo';
import { modeOf } from '../src/domain/season-mode';
import { theatreById, type Theatre } from '../src/domain/theatres';
import { playerBuildings } from './buildingReads';
import { BLITZ, nominalStrength } from './constants';
import { fail } from './errors';
import { endowIrregular, irregularSeat } from './objectives';
import { allRegions, pointOfBuilding, regionFacts } from './regions';
import { coastPointNear, routeKmFrom } from './routes';
import { seatsOf } from './seats';
import { concludeSeason } from './seasons';
import { surveyFromPoint } from './surveys';
import { reassessCaptures } from './captures';
import { movementsOf } from './movement/forces';
import { BUILDING_KEY, LAUNCH_REFUSAL } from './validators';

export const isBlitz = async (ctx: QueryCtx, seasonId: Id<'seasons'>): Promise<boolean> =>
  modeOf((await ctx.db.get(seasonId))?.mode) === 'blitz';

/** Les fonds tels qu'ils courent : le stock réglé, et le débit des villes et du QG tenus. */
export async function fundsOf(ctx: QueryCtx, player: Doc<'players'>, now: number): Promise<Funds> {
  const held = await playerBuildings(ctx, player._id);
  return {
    stock: player.funds ?? 0,
    at: player.fundsAt ?? now,
    perMinute: incomePerMinute(held.map((building) => building.key)),
  };
}

/**
 * **Régler avant que le débit change** : une capture qui donne une ville créditerait sinon au
 * nouveau débit toutes les minutes d'avant. Comme `settleBeforeChange` pour les huit ressources.
 */
export async function settleFunds(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  now: number,
): Promise<number> {
  const player = await ctx.db.get(playerId);
  if (player === null) return 0;
  const stock = fundsAt(await fundsOf(ctx, player, now), now);
  await ctx.db.patch(playerId, { funds: stock, fundsAt: now });
  return stock;
}

export async function spendFunds(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  amount: number,
  now: number,
): Promise<void> {
  const stock = await settleFunds(ctx, playerId, now);
  if (stock < amount) fail('INSUFFICIENT_FUNDS', { needed: amount, held: Math.floor(stock) });
  await ctx.db.patch(playerId, { funds: stock - amount });
}

export const placementInput = internalQuery({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }) => {
    const season = await ctx.db.get(seasonId);
    if (season === null || season.status !== 'launched' || modeOf(season.mode) !== 'blitz') {
      return null;
    }
    const seats = await seatsOf(ctx, seasonId);
    if (seats.length === 0) return null;
    return {
      seed: season.seed,
      theatre: season.theatre ?? null,
      seats: seats.map((seat) => seat._id),
    };
  },
});

export const place = internalAction({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }): Promise<void> => {
    const input = await ctx.runQuery(internal.blitz.placementInput, { seasonId });
    if (input === null) return;
    /** **Une pose qui échoue ne laisse pas une saison lancée sans carte** : elle revient au salon,
     *  qui le dit, et le fondateur relance. */
    let plan: ReadonlyArray<BlitzSite> | null;
    let quays: ReadonlyMap<string, LonLat>;
    try {
      const theatre = theatreById(input.theatre ?? '');
      if (theatre === null) throw new Error('theatre');
      ({ plan, quays } = drawMap(theatre, input.seats, input.seed));
    } catch {
      await ctx.runMutation(internal.blitz.abandon, { seasonId, refusal: 'BLITZ_MAP_FAILED' });
      return;
    }
    if (plan === null) {
      await ctx.runMutation(internal.blitz.abandon, { seasonId, refusal: 'BLITZ_MAP_UNFAIR' });
      return;
    }
    const quayOf = (regionId: string) => {
      const quay = quays.get(regionId)!;
      return { lon: quay[0], lat: quay[1] };
    };
    await ctx.runMutation(internal.blitz.commit, {
      seasonId,
      sites: plan.map((site) => ({
        key: site.key,
        regionId: site.regionId,
        owner: site.owner as Id<'players'> | null,
        point: site.key === 'port' ? quayOf(site.regionId) : null,
      })),
    });
  },
});

export function drawMap(
  theatre: Theatre,
  seats: ReadonlyArray<string>,
  seed: number,
): { plan: ReadonlyArray<BlitzSite> | null; quays: ReadonlyMap<string, LonLat> } {
  /** **Une côte n'est côte que si un quai s'y trouve** : la règle ne pose un port que là, et
   *  aucun port tiré ne disparaît ensuite faute d'amarrage. */
  const quays = new Map<string, LonLat>();
  const candidates = theatreGround(theatre.box).map((candidate) => {
    const quay = candidate.coastal ? coastPointNear(candidate.point) : null;
    if (quay !== null) quays.set(candidate.regionId, quay);
    return { ...candidate, coastal: quay !== null };
  });
  const places = candidates.map((candidate) => ({
    id: candidate.regionId,
    point: candidate.point,
  }));
  const pointOf = new Map(places.map((place) => [place.id, place.point]));
  const fields = new Map<string, ReadonlyMap<string, number>>();
  const measure: BlitzMeasure = (regionId, mode, maxKm) => {
    const key = `${regionId}|${mode}|${String(Math.round(maxKm))}`;
    let field = fields.get(key);
    if (field === undefined) {
      field = routeKmFrom(pointOf.get(regionId)!, places, mode, maxKm);
      fields.set(key, field);
    }
    return field;
  };

  const plan = planBlitzMap({
    seats,
    candidates,
    rules: blitzMapRulesOf(theatre, BLITZ.map),
    seed,
    measure,
  });
  return { plan, quays };
}

/**
 * **La carte n'a pas pu se poser : la saison revient au salon**, plutôt que de servir une partie
 * déséquilibrée ou sans carte. Tout ce que le lancement avait écrit s'efface — dotations, entrée
 * en guerre, prêts — et le salon dit pourquoi (`seasons.launchRefusal`). Rien n'est encore joué :
 * la pose suit le lancement d'une seconde.
 */
export const abandon = internalMutation({
  args: { seasonId: v.id('seasons'), refusal: LAUNCH_REFUSAL },
  handler: async (ctx, { seasonId, refusal }) => {
    const season = await ctx.db.get(seasonId);
    if (season === null || season.status !== 'launched') return;
    const built = await ctx.db
      .query('buildings')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .first();
    if (built !== null) return;
    const seats = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect();
    for (const seat of seats) {
      for (const row of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', seat._id))
        .collect()) {
        await ctx.db.delete(row._id);
      }
      if (seat.irregular === true) await ctx.db.delete(seat._id);
      else await ctx.db.patch(seat._id, { enteredWarAt: null, ready: false });
    }
    await ctx.db.patch(seasonId, {
      status: 'lobby',
      launchedAt: null,
      playableRegion: null,
      launchRefusal: refusal,
    });
  },
});

/** **Chez qui que ce soit** : la Blitz ne joue pas sur le sol national (B7). */
function theatreGround(box: {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}): ReadonlyArray<BlitzCandidate> {
  return allRegions().flatMap((region) => {
    const [lon, lat] = region.point;
    const east = lon < box.west ? lon + 360 : lon;
    return east <= box.east && lat >= box.south && lat <= box.north
      ? [{ regionId: region.id, point: region.point, coastal: region.coastal }]
      : [];
  });
}

export const commit = internalMutation({
  args: {
    seasonId: v.id('seasons'),
    sites: v.array(
      v.object({
        key: BUILDING_KEY,
        regionId: v.string(),
        owner: v.union(v.id('players'), v.null()),
        point: v.union(v.object({ lon: v.number(), lat: v.number() }), v.null()),
      }),
    ),
  },
  handler: async (ctx, { seasonId, sites }) => {
    const season = await ctx.db.get(seasonId);
    if (season === null || season.status !== 'launched' || modeOf(season.mode) !== 'blitz') return;
    const already = await ctx.db
      .query('buildings')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .first();
    if (already !== null) return;

    const now = Date.now();
    const neutral = await irregularSeat(ctx, seasonId);
    await endowIrregular(ctx, neutral, now);
    for (const seat of await seatsOf(ctx, seasonId)) {
      await ctx.db.patch(seat._id, { funds: BLITZ.startingFunds, fundsAt: now });
    }
    for (const site of sites) {
      if (regionFacts(site.regionId) === null) continue;
      const buildingId = await ctx.db.insert('buildings', {
        seasonId,
        playerId: site.owner ?? neutral,
        key: site.key,
        regionId: site.regionId,
        level: 1,
        outpostId: null,
        ...(site.point === null ? {} : { point: site.point }),
        /** **En Blitz rien n'est bâti** : ce que tient un joueur colore sa région comme une
         *  capture (`occupationsOf`), le QG de départ compris. Un neutre ne colore rien. */
        ...(site.owner === null ? { startedNeutral: true as const } : { capturedAt: now }),
        ...(site.owner !== null && site.key === 'hq' ? { homeOf: site.owner } : {}),
      });
      if (site.owner === null) continue;
      /** **Un fantassin au QG, l'autre dans la caserne** (U6) : une unité par bâtiment, et
       *  chacun des deux sites de départ peut former dès qu'il se vide. */
      if (site.key === 'hq' || site.key === 'barracks') {
        const strength = nominalStrength('infantry', 1);
        await ctx.db.insert('troops', {
          seasonId,
          playerId: site.owner,
          role: 'infantry',
          tier: 1,
          nominalStrength: strength,
          currentStrength: strength,
          stationedAt: buildingId,
        });
      }
      if (site.key !== 'hq') continue;
      const point = pointOfBuilding({ regionId: site.regionId });
      if (point !== null) await surveyFromPoint(ctx, site.owner, point, now);
    }
    await ctx.scheduler.runAfter(BLITZ.mend.stepMinutes * 60_000, internal.blitz.mend, {
      seasonId,
    });
  },
});

/**
 * **Le soin, un pas par minute** : une troupe entamée posée sur un bâtiment à soi — en garnison,
 * ou au point même du site qu'elle vient de capturer — reprend des forces en payant des fonds.
 * Un travail de saison qui se replanifie tant que la Blitz se joue : deux heures, cent vingt pas.
 */
export const mend = internalMutation({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }) => {
    const season = await ctx.db.get(seasonId);
    if (season === null || season.status !== 'launched' || modeOf(season.mode) !== 'blitz') return;
    const now = Date.now();
    let healed = false;
    for (const seat of await seatsOf(ctx, seasonId)) {
      if (seat.defeated === true) continue;
      const wounded = (await ownedTroopsOnSite(ctx, seat._id)).filter(
        (troop) => troop.currentStrength < troop.nominalStrength,
      );
      if (wounded.length === 0) continue;
      const funds = await settleFunds(ctx, seat._id, now);
      const plan = mendPlan(wounded.map(asWounded), funds);
      for (const { troop, strength } of plan) {
        healed = true;
        await ctx.db.patch(troop.doc._id, { currentStrength: strength });
      }
      const spent = plan.reduce((sum, step) => sum + step.cost, 0);
      await ctx.db.patch(seat._id, { funds: funds - spent });
    }
    if (healed) await reassessCaptures(ctx, seasonId, now);
    await ctx.scheduler.runAfter(BLITZ.mend.stepMinutes * 60_000, internal.blitz.mend, {
      seasonId,
    });
  },
});

export const asWounded = (doc: Doc<'troops'>) => ({
  id: doc._id as string,
  role: doc.role,
  strength: doc.currentStrength,
  nominalStrength: doc.nominalStrength,
  doc,
});

/** Ses troupes posées sur l'un de ses bâtiments : en garnison, ou à son point exact. */
export async function ownedTroopsOnSite(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'troops'>>> {
  const buildings = await playerBuildings(ctx, playerId);
  const ids = new Set<string>(buildings.map((building) => building._id));
  const points = new Set(
    buildings.flatMap((building) => {
      const point = pointOfBuilding(building);
      return point === null ? [] : [pointKey(point)];
    }),
  );
  const marching = new Set(
    (
      await ctx.db
        .query('movements')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect()
    ).flatMap((movement) => movement.troopIds as ReadonlyArray<string>),
  );
  return (
    await ctx.db
      .query('troops')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect()
  ).filter((troop) => {
    if (marching.has(troop._id)) return false;
    const address = troop.stationedAt;
    if (typeof address === 'string') return ids.has(address);
    return address !== null && points.has(pointKey([address.lon, address.lat]));
  });
}

/**
 * **Mes bâtiments déjà tenus** (B15, une unité par bâtiment) : une de mes troupes y est posée.
 * Les troupes de l'ordre n'en occupent aucun — elles partent. La rose lit la même chose dans la
 * vue (`armedColumn`).
 * L'arrivée le relit aussi : de deux marches parties vers le même bâtiment vide, la seconde se
 * pose à sa porte (`movements.arrive`).
 */
export async function occupiedBuildingIds(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  leavingIds: ReadonlyArray<Id<'troops'>>,
): Promise<Set<string>> {
  const marching = new Set((await movementsOf(ctx, playerId)).flatMap((one) => one.troopIds));
  const leaving = new Set(leavingIds);
  return new Set(
    (
      await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect()
    ).flatMap((troop) =>
      typeof troop.stationedAt === 'string' && !marching.has(troop._id) && !leaving.has(troop._id)
        ? [troop.stationedAt]
        : [],
    ),
  );
}

const pointKey = (point: LonLat) => `${point[0]},${point[1]}`;

/**
 * **À deux heures, la Blitz se conclut** (B11) : le plus gros revenu tenu à l'instant gagne, la
 * caisse départage, puis l'égalité (`clockVerdict`). Planifié au lancement à l'échéance de
 * l'horloge ; une saison déjà conclue, relancée depuis ou revenue au salon n'en fait rien.
 */
export const closeAtClock = internalMutation({
  args: { seasonId: v.id('seasons'), expectedAt: v.number() },
  handler: async (ctx, { seasonId, expectedAt }) => {
    const season = await ctx.db.get(seasonId);
    if (
      season === null ||
      season.status !== 'launched' ||
      season.launchedAt === null ||
      season.durationHours === null ||
      season.launchedAt + season.durationHours * 3_600_000 !== expectedAt
    ) {
      return;
    }
    const lines = [];
    for (const seat of await seatsOf(ctx, seasonId)) {
      if (seat.defeated === true) continue;
      const funds = await fundsOf(ctx, seat, expectedAt);
      lines.push({ id: seat._id, perMinute: funds.perMinute, funds: fundsAt(funds, expectedAt) });
    }
    const { winnerId, reason, perMinute } = clockVerdict(lines);
    await concludeSeason(ctx, seasonId, winnerId, expectedAt, {
      reason,
      ...(perMinute === null ? {} : { perMinute }),
    });
  },
});

/** La porte serveur de `notInBlitz` : bâtir, élever, fonder, démolir, piller, commander un lot. */
export function refuseInBlitz(season: Doc<'seasons'>): void {
  const refusal = notInBlitz(modeOf(season.mode));
  if (refusal !== null) fail(refusal);
}
