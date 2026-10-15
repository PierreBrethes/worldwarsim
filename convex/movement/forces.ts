/**
 * Who and what stands on the board, and where. The season/player sweeps every movement
 * reads, the two point conversions, and the one question an arrival or a contact ever asks —
 * who answers here. One arrival is one engagement (ADR 0014), a posted force defends the ground
 * it stands on and orders nothing (ADR 0019 §3), and nothing here ever scans a whole table.
 */

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { distanceKm, type LonLat } from '../../src/domain/geo';
import { homeCountryOf, pointOfBuilding } from '../regions';
import { contactKm, outpostReachKm } from '../constants';
import { seasonTheatre } from './theatre';
import { anchorOf, isAnchored } from '../upkeep';
import { PROJECTION_BY_DOMAIN, type Seated } from '../../src/domain/troops';

export async function movementsOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'movements'>>> {
  return ctx.db
    .query('movements')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

export async function outpostsOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'outposts'>>> {
  return ctx.db
    .query('outposts')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

/** **The board, as one season sees it.** The season bounds these two, not a page size (ADR 0001).
 *  What they must **not** be is the whole table: several seasons stand at once, and a global
 *  sweep is a movement of one game intercepted by a garrison of another. */
export async function seasonMovements(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<Array<Doc<'movements'>>> {
  return ctx.db
    .query('movements')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();
}

export async function seasonOutposts(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<Array<Doc<'outposts'>>> {
  return ctx.db
    .query('outposts')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();
}

/** Every troop hanging from a point or a building, whoever it belongs to. */
export async function troopsStationedAt(
  ctx: QueryCtx,
  stationId: Id<'buildings'> | Id<'outposts'>,
): Promise<Array<Doc<'troops'>>> {
  return ctx.db
    .query('troops')
    .withIndex('byStation', (q) => q.eq('stationedAt', stationId))
    .collect();
}

/**
 * **Every troop of one season, and of no other.** What a contact sweeps when the question is
 * "who stands here" rather than "what is mine": the camps a departing column can walk into, the
 * defence that answers a point. The season filter lives here alone — a sweep without it lets a
 * garrison of a test game defend ground on the board.
 */
export async function seasonTroops(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<Array<Doc<'troops'>>> {
  return ctx.db
    .query('troops')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();
}

export const pointOf = (point: { lon: number; lat: number }): LonLat => [point.lon, point.lat];

export const asPoint = (lonLat: LonLat) => ({ lon: lonLat[0], lat: lonLat[1] });

/** A troop's address as the row stores it. Named because one of its three forms is not an id. */
export type TroopAddress = Doc<'troops'>['stationedAt'];

/** Une troupe telle que la règle des transports la lit (`src/domain/troops.ts`). */
export const seatedOf = (troop: Doc<'troops'>): Seated => ({
  id: troop._id,
  role: troop.role,
  carriedBy: troop.carriedBy,
});

/** **Mes troupes posées à cette adresse** : ce qui s'y dispute les places d'un transport, et
 *  d'où un transport part avec sa cargaison. */
export async function standingPile(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  address: TroopAddress,
): Promise<Array<Doc<'troops'>>> {
  const marching = new Set((await movementsOf(ctx, playerId)).flatMap((one) => one.troopIds));
  return (
    await ctx.db
      .query('troops')
      .withIndex('byStation', (q) => q.eq('stationedAt', address))
      .collect()
  ).filter((troop) => troop.playerId === playerId && !marching.has(troop._id));
}

/** Un aérodrome, la seule adresse où un avion prend ou dépose des passagers (ADR 0025 §4). */
export async function onAirfield(ctx: QueryCtx, address: TroopAddress): Promise<boolean> {
  if (typeof address !== 'string') return false;
  const buildingId = ctx.db.normalizeId('buildings', address);
  return buildingId !== null && (await ctx.db.get(buildingId))?.key === PROJECTION_BY_DOMAIN.air;
}

/** Who a contact is with. `CONTACT_FORCE` is the same union in the shape Convex checks at run
 *  time; this is the one TypeScript reads. */
export type ContactForce =
  | { readonly kind: 'outpost'; readonly outpostId: Id<'outposts'> }
  | { readonly kind: 'movement'; readonly movementId: Id<'movements'> }
  | {
      readonly kind: 'posted';
      readonly playerId: Id<'players'>;
      readonly point: { readonly lon: number; readonly lat: number };
    };

type PostedForce = Extract<ContactForce, { kind: 'posted' }>;

/**
 * **The camps, as a departing column sees them.** A troop keeps its address while it walks, so
 * the manifests are what tell a camp from a column that has already left it. A camp is not a
 * document and has no id: it is filed under its owner and its point, and the `id` here never
 * leaves this pass.
 */
export async function postedForces(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  playerId: Id<'players'>,
): Promise<
  Array<{ id: string; point: LonLat; force: PostedForce; troopIds: ReadonlyArray<Id<'troops'>> }>
> {
  const marching = new Set<Id<'troops'>>(
    (await seasonMovements(ctx, seasonId)).flatMap((movement) => movement.troopIds),
  );
  const camps = new Map<
    string,
    { point: LonLat; force: PostedForce; troopIds: Array<Id<'troops'>> }
  >();
  for (const troop of await seasonTroops(ctx, seasonId)) {
    const address = troop.stationedAt;
    if (troop.playerId === playerId || marching.has(troop._id)) continue;
    if (address === null || typeof address === 'string') continue;
    const key = `posted:${troop.playerId}@${address.lon},${address.lat}`;
    const camp = camps.get(key) ?? {
      point: pointOf(address),
      force: { kind: 'posted' as const, playerId: troop.playerId, point: address },
      troopIds: [],
    };
    camp.troopIds.push(troop._id);
    camps.set(key, camp);
  }
  return [...camps].map(([id, camp]) => ({ id, ...camp }));
}

type Defence = {
  readonly playerId: Id<'players'>;
  readonly troops: ReadonlyArray<Doc<'troops'>>;
  readonly outpostId: Id<'outposts'> | null;
  readonly movementId: Id<'movements'> | null;
};

/**
 * **Ce qu'un ordre d'attaque trouve au bout de son allonge** (ADR 0024 §4). Elle n'est plus lue
 * que là : une marche ne cherche plus personne (`standAt`), et le contact a changé de sens — de
 * déclencheur il est devenu l'**allonge** de l'ordre, `contactKm(théâtre)`.
 *
 * Si plusieurs nations tiennent du sol au même endroit, celle qui a le plus de troupes répond :
 * ADR 0014, couper la colonne résoudrait deux fois la même passe.
 *
 * **Une région se lit comme un point** depuis le 13/09 : les garnisons de ses bâtiments *et* les
 * piles posées à portée du point d'arrivée, en une seule lecture. C'était le trou — une région
 * ciblée engageait la garnison de ses mâts mais pas la colonne campée à dix kilomètres.
 */
export async function defenceOf(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
): Promise<Defence | null> {
  const target = movement.target;
  if (target.kind === 'point') return defenceNear(ctx, movement, pointOf(target.point));
  /** A building of one's own is reached like a point (decision 64b): whoever camps within the
   *  arrival radius of it is met, and the garrison inside is the player's — never a defence. */
  if (target.kind === 'building') return defenceNear(ctx, movement, pointOf(movement.to));
  if (target.kind === 'outpost') {
    const outpost = await ctx.db.get(target.outpostId);
    if (!outpost) return null;
    const garrison = await troopsStationedAt(ctx, outpost._id);
    return garrison.length === 0
      ? null
      : {
          playerId: outpost.playerId,
          troops: garrison,
          outpostId: outpost._id,
          movementId: null,
        };
  }
  if (target.kind !== 'region') return null;
  return defenceNear(ctx, movement, pointOf(movement.to));
}

/**
 * **Who answers a point, by distance rather than by containment**: the server holds no polygons,
 * so ADR 0018 §3's reading is used instead. **A troop in flight stands nowhere** — excluded here
 * and nowhere else, because an outpost is raided whether or not its garrison walked out, where a
 * point asks literally who is present.
 */
async function defenceNear(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  arrival: LonLat,
): Promise<Defence | null> {
  const movements = await seasonMovements(ctx, movement.seasonId);
  const marching = new Set<Id<'troops'>>(movements.flatMap((other) => other.troopIds));
  const reachKm = contactKm(seasonTheatre(await ctx.db.get(movement.seasonId)));
  const byPlayer = new Map<
    Id<'players'>,
    {
      troops: Array<Doc<'troops'>>;
      outposts: Set<Id<'outposts'>>;
      movements: Set<Id<'movements'>>;
    }
  >();

  for (const present of movements) {
    if (
      present._id === movement._id ||
      present.playerId === movement.playerId ||
      present.plunder?.phase !== 'presence' ||
      distanceKm(pointOf(present.to), arrival) > reachKm
    ) {
      continue;
    }
    const kept = byPlayer.get(present.playerId) ?? {
      troops: [],
      outposts: new Set(),
      movements: new Set(),
    };
    kept.troops.push(...(await troopsCarriedBy(ctx, present)));
    kept.movements.add(present._id);
    byPlayer.set(present.playerId, kept);
  }

  /** Toutes les troupes de la saison passent ici, et presque toutes partagent une poignée
   *  d'adresses : un bâtiment ou un point se lit une fois, pas une fois par troupe logée. */
  const stances = new Map<string, Awaited<ReturnType<typeof stanceOf>>>();
  const stanceAt = async (address: TroopAddress) => {
    if (typeof address !== 'string') return stanceOf(ctx, address);
    if (!stances.has(address)) stances.set(address, await stanceOf(ctx, address));
    return stances.get(address)!;
  };

  for (const troop of await seasonTroops(ctx, movement.seasonId)) {
    if (troop.playerId === movement.playerId || marching.has(troop._id)) continue;
    const stance = await stanceAt(troop.stationedAt);
    if (stance === null || distanceKm(stance.point, arrival) > reachKm) continue;
    const kept = byPlayer.get(troop.playerId) ?? {
      troops: [],
      outposts: new Set(),
      movements: new Set(),
    };
    kept.troops.push(troop);
    if (stance.outpostId !== null) kept.outposts.add(stance.outpostId);
    byPlayer.set(troop.playerId, kept);
  }

  let defender: Defence | null = null;
  for (const [playerId, kept] of byPlayer) {
    if (defender !== null && kept.troops.length <= defender.troops.length) continue;
    /** Two outposts answering the same arrival is a place, not a point, and the account must
     *  not pick one of them. */
    const [only] = [...kept.outposts];
    const [onlyMovement] = [...kept.movements];
    defender = {
      playerId,
      troops: kept.troops,
      outpostId: kept.outposts.size === 1 ? only! : null,
      movementId: kept.movements.size === 1 ? onlyMovement! : null,
    };
  }
  return defender;
}

/** A building answers by the point of its region, the only coordinate the index carries for it.
 *  `null` is a troop the game cannot place: at home, or hanging from something razed. */
export async function stanceOf(
  ctx: QueryCtx,
  address: TroopAddress,
): Promise<{ point: LonLat; outpostId: Id<'outposts'> | null } | null> {
  if (address === null) return null;
  if (typeof address !== 'string') return { point: pointOf(address), outpostId: null };
  const outpostId = ctx.db.normalizeId('outposts', address);
  if (outpostId !== null) {
    const outpost = await ctx.db.get(outpostId);
    return outpost === null ? null : { point: pointOf(outpost.point), outpostId };
  }
  const buildingId = ctx.db.normalizeId('buildings', address);
  const building = buildingId === null ? null : await ctx.db.get(buildingId);
  const point = building === null ? null : pointOfBuilding(building);
  return point === null ? null : { point, outpostId: null };
}

/** **A technical tolerance, not a radius of the game** — the width of a coordinate that has been
 *  through the database and back. It replaces an equality between two floats, where a missed
 *  comparison would resolve a battle against nobody and say nothing about it. */
const POSTED_MATCH_KM = 1;

/** An interceptor is a garrison, a column or a camp, read **now** and not at the moment the
 *  contact was computed. Hence the distance: the camp is found by standing where the contact says
 *  it stood, never by matching a coordinate to the digit. */
export async function forceOf(
  ctx: MutationCtx,
  force: ContactForce,
): Promise<{
  playerId: Id<'players'>;
  troops: ReadonlyArray<Doc<'troops'>>;
  movementId: Id<'movements'> | null;
} | null> {
  if (force.kind === 'posted') {
    /** His own columns and nobody else's: no other player's manifest can name one of his
     *  troops. */
    const marching = new Set<Id<'troops'>>(
      (await movementsOf(ctx, force.playerId)).flatMap((movement) => movement.troopIds),
    );
    const here = pointOf(force.point);
    const troops = (
      await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', force.playerId))
        .collect()
    ).filter((troop) => {
      const address = troop.stationedAt;
      if (marching.has(troop._id) || address === null || typeof address === 'string') return false;
      return distanceKm(pointOf(address), here) <= POSTED_MATCH_KM;
    });
    return { playerId: force.playerId, troops, movementId: null };
  }
  if (force.kind === 'outpost') {
    const outpost = await ctx.db.get(force.outpostId);
    if (!outpost) return null;
    return {
      playerId: outpost.playerId,
      troops: await troopsStationedAt(ctx, outpost._id),
      movementId: null,
    };
  }
  const movement = await ctx.db.get(force.movementId);
  if (!movement) return null;
  return {
    playerId: movement.playerId,
    troops: await troopsCarriedBy(ctx, movement),
    movementId: movement._id,
  };
}

export async function troopsCarriedBy(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
): Promise<Array<Doc<'troops'>>> {
  const troops: Array<Doc<'troops'>> = [];
  for (const troopId of movement.troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop) troops.push(troop);
  }
  return troops;
}

/**
 * **What the player already watches — and nothing whatsoever about what stands there.**
 * Passive role ranges are another source (`reperage-des-troupes-posees.md`). ADR 0019
 * §6: recognised ground is not safe ground. It is information about one's own level of
 * information, which is why the server may answer it at all — there is no fog to leak.
 */
export async function recognises(
  ctx: QueryCtx,
  player: Doc<'players'>,
  point: LonLat,
): Promise<boolean> {
  const outposts = await outpostsOf(ctx, player._id);
  /** **Every** point of his, deactivated ones included: a raid burns the depot, it does not
   *  blind the relay. `upkeep.ts` reads the same notion from standing points only. */
  return isAnchored(point, homeCountryOf(player.nation), outposts.map(anchorOf));
}

/**
 * **Une passe s'est-elle déjà servie de ce point ?** — c'est-à-dire un départ postérieur à la
 * fondation dont la route passe à portée. Le relais est chiffré au départ et un poste d'écoute
 * entre dans la réévaluation événementielle. Tant que la réponse est non, le métier du point se change encore
 * (`movements.respecialize`) ; après, il est scellé.
 *
 * La portée est le critère plutôt que le simple fait qu'un mouvement soit parti : un départ à
 * l'autre bout du monde n'a rien lu de ce point-là, et sceller sur lui scellerait chaque
 * avant-poste dans la minute suivant sa fondation. Les sommets de la polyligne suffisent —
 * contre la portée du point, une maille de grille est un détail.
 */
export async function specializationServed(
  ctx: QueryCtx,
  outpost: Doc<'outposts'>,
): Promise<boolean> {
  return served(outpost, await seasonMovements(ctx, outpost.seasonId));
}

/**
 * La même question posée de plusieurs points **en une lecture** : la vue la pose de chaque
 * avant-poste du joueur, et une par point relisait la saison entière autant de fois qu'il en tient
 * — le prix d'un point fondé était payé sur tous les autres, à chaque chargement du plateau.
 */
export async function specializationsServed(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
  outposts: ReadonlyArray<Doc<'outposts'>>,
): Promise<ReadonlySet<Id<'outposts'>>> {
  if (outposts.length === 0) return new Set();
  const movements = await seasonMovements(ctx, seasonId);
  return new Set(
    outposts.filter((outpost) => served(outpost, movements)).map((outpost) => outpost._id),
  );
}

const served = (outpost: Doc<'outposts'>, movements: ReadonlyArray<Doc<'movements'>>): boolean => {
  const here = pointOf(outpost.point);
  return movements.some(
    (movement) =>
      movement.departedAt >= outpost.foundedAt &&
      movement.points.some(
        (point) => distanceKm(pointOf(point), here) <= outpostReachKm(outpost.level),
      ),
  );
};
