import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { internalQuery, type QueryCtx } from './_generated/server';
import { MONDIALE_TROOP_BOUND } from './constants';
import { homeCountryOf, pointOfBuilding } from './regions';
import { hostAtPoint } from './routes';
import { isAtWar, everySeatOf } from './seats';
import { seasonMovements, seasonOutposts, seasonTroops } from './movement/forces';
import type { OutpostEvent, ReportInput, ReportTroop } from '../src/domain/season-report';
import { modeOf } from '../src/domain/season-mode';
import type { LonLat } from '../src/domain/geo';

/**
 * **La lecture du rapport de saison** (ADR 0027 §7) : elle range les faits que la base garde,
 * `scripts/rapport-de-saison.mjs` les passe à `seasonReportOf` (`src/domain/season-report.ts`)
 * qui calcule. Aucune règle ici, et aucune table de plus : le journal (`notices`, `engagements`),
 * les éditions et les lignes de l'instant suffisent.
 *
 * Deux fonctions, parce que le journal d'un joueur peut dépasser le plafond de lecture d'une
 * requête : `facts` rend tout sauf les dépêches, `outpostEvents` les rend page par page.
 */

/** La saison demandée par son code, sinon la dernière Mondiale lancée. */
async function seasonToRead(ctx: QueryCtx, code: string | undefined): Promise<Doc<'seasons'>> {
  if (code !== undefined) {
    const season = await ctx.db
      .query('seasons')
      .withIndex('byCode', (q) => q.eq('code', code))
      .unique();
    if (season === null) throw new Error(`aucune saison de code ${code}`);
    return season;
  }
  for await (const season of ctx.db.query('seasons').order('desc')) {
    if (modeOf(season.mode) === 'mondiale' && season.launchedAt !== null) return season;
  }
  throw new Error('aucune saison Mondiale lancée');
}

export const facts = internalQuery({
  args: { code: v.optional(v.string()) },
  handler: async (ctx, { code }) => {
    const season = await seasonToRead(ctx, code);
    if (modeOf(season.mode) !== 'mondiale')
      throw new Error(`${season.code} n'est pas une Mondiale`);
    if (season.launchedAt === null) throw new Error(`${season.code} n'est pas lancée`);
    const seats = (await everySeatOf(ctx, season._id)).filter(
      (seat) => seat.irregular === true || isAtWar(seat, season),
    );

    const editions = await ctx.db
      .query('editions')
      .withIndex('bySeasonAt', (q) => q.eq('seasonId', season._id))
      .collect();

    const buildings = new Map(
      (
        await ctx.db
          .query('buildings')
          .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
          .collect()
      ).map((building) => [building._id as string, building]),
    );
    const outposts = new Map(
      (await seasonOutposts(ctx, season._id)).map((outpost) => [outpost._id as string, outpost]),
    );
    const marching = new Map<string, string>();
    for (const movement of await seasonMovements(ctx, season._id)) {
      for (const troopId of movement.troopIds) marching.set(troopId, `march:${movement._id}`);
    }
    const nationOf = new Map(seats.map((seat) => [seat._id as string, seat.nation]));

    const pointOfAddress = (address: Doc<'troops'>['stationedAt']): LonLat | null => {
      if (address === null) return null;
      if (typeof address !== 'string') return [address.lon, address.lat];
      const building = buildings.get(address);
      if (building !== undefined) return pointOfBuilding(building);
      const outpost = outposts.get(address);
      return outpost === undefined ? null : [outpost.point.lon, outpost.point.lat];
    };

    const troops: ReportTroop[] = [];
    for (const troop of await seasonTroops(ctx, season._id)) {
      const nation = nationOf.get(troop.playerId);
      if (nation === undefined) continue;
      const march = marching.get(troop._id);
      const address = troop.stationedAt;
      const point = pointOfAddress(address);
      const home = homeCountryOf(nation);
      troops.push({
        playerId: troop.playerId,
        place:
          march ??
          (typeof address === 'string'
            ? address
            : point === null
              ? 'home'
              : `point:${point[0]},${point[1]}`),
        // Une troupe sans adresse « rentre » (schéma : `null` = sol national).
        where:
          march !== undefined
            ? 'marching'
            : point === null || (home !== null && hostAtPoint(point) === home)
              ? 'home'
              : 'abroad',
      });
    }

    const queued: Record<string, number> = {};
    const engagements: ReportInput['engagements'][number][] = [];
    for (const seat of seats) {
      queued[seat._id] = (
        await ctx.db
          .query('recruitments')
          .withIndex('byPlayer', (q) => q.eq('playerId', seat._id))
          .collect()
      ).length;
      for (const engagement of await ctx.db
        .query('engagements')
        .withIndex('byAttacker', (q) => q.eq('attackerId', seat._id))
        .collect()) {
        engagements.push({
          attackerId: engagement.attackerId,
          defenderId: engagement.defenderId,
          at: engagement.at,
        });
      }
    }

    const input: Omit<ReportInput, 'outposts' | 'stepHours'> & { code: string } = {
      code: season.code,
      launchedAt: season.launchedAt,
      now: season.concludedAt ?? Date.now(),
      bound: MONDIALE_TROOP_BOUND,
      players: seats.map((seat) => ({
        id: seat._id,
        nation: seat.nation,
        nickname: seat.nickname,
        ...(seat.irregular === true ? { irregular: true } : {}),
      })),
      editions: editions.map(({ playerId, at, territory, industry, military }) => ({
        playerId,
        at,
        territory,
        industry,
        military,
      })),
      troops,
      queued,
      engagements,
    };
    return input;
  },
});

/** Les dépêches d'avant-postes d'un joueur, par pages de `PAGE` lignes (`next: null` à la fin). */
const PAGE = 3000;

export const outpostEvents = internalQuery({
  args: { playerId: v.id('players'), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { playerId, cursor }) => {
    const page = await ctx.db
      .query('notices')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .paginate({ numItems: PAGE, cursor });
    const events: OutpostEvent[] = [];
    for (const notice of page.page) {
      const kind = outpostKindOf(notice);
      if (kind !== null) events.push({ playerId, at: notice.at, kind });
    }
    return { events, next: page.isDone ? null : page.continueCursor };
  },
});

function outpostKindOf(notice: Doc<'notices'>): OutpostEvent['kind'] | null {
  switch (notice.kind) {
    case 'outpostStands':
      return 'stands';
    case 'outpostRaised':
      return 'raised';
    case 'outpostDismantled':
      return 'dismantled';
    case 'foundationLost':
      return 'lost';
    case 'captureSucceeded':
      if (notice.site.kind !== 'outpost') return null;
      return notice.side === 'capturer' ? 'captured' : 'taken';
    default:
      return null;
  }
}
