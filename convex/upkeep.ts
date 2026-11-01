import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import type { LonLat } from '../src/domain/geo';
import {
  isStanding,
  lookoutCoalPerHour,
  reachingOutpost,
  withinReach,
  type OutpostReach,
} from '../src/domain/outposts';
import { armyUpkeep } from '../src/domain/upkeep';
import {
  LISTENING_COAL_PER_HOUR,
  OUTPOST_FOOD_PER_HOUR_PER_LEVEL,
  outpostReachKm,
} from './constants';
import { activeBuildings, inService, playerBuildings } from './buildingReads';
import { homeCountryOf, pointOfBuilding } from './regions';
import { hostAtPoint, landAtPoint } from './routes';
import { modeOf } from '../src/domain/season-mode';

/**
 * **What an army costs to hold, and why it costs more far from home** (ADR 0019 §4).
 *
 * `consommation-continue.md` settled the shape: one rate per troop, no table of nine (steps by rank
 * since ADR 0028 §2), and nothing dies when the reserve runs out. Read alone, that made a sentinel at the end of the
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
  anchors: ReadonlyArray<OutpostReach>,
): boolean {
  if (homeCountry !== null && hostAtPoint(point) === homeCountry) return true;
  return withinReach(point, anchors);
}

/**
 * **Aucun quai ne nourrit le large** (règle 5 du 18/09, révision de l'ADR 0019 §2). Rester en mer
 * est devenu un ordre, et la question s'est posée avec lui : un rayon d'avant-poste est un disque,
 * donc un point côtier couvrait déjà l'eau à côté de lui et une flotte mouillée là mangeait au
 * tarif du pays. C'était la géométrie qui répondait, pas la règle.
 *
 * Le refus est **ici et pas dans `isAnchored`** : la même lecture sert le *sol reconnu* de la
 * visée et le « cap sur moi » du relevé (`view.ts`), et un avant-poste côtier voit bel et bien
 * la mer devant lui — nourrir et reconnaître sont deux questions, et c'est la couture que
 * `isAnchored` porte déjà en recevant ses ancres en paramètre.
 *
 * Le ravitaillement en mer par un port ami à portée reste ouvert (`QUESTIONS.md` 🟡) : il se
 * décidera, il ne se déduira pas d'un disque terrestre.
 */
/**
 * **Où une troupe ancrée se sert** (ADR 0028 §3) : sur le sol national, au plateau personnel ;
 * dans le rayon d'un avant-poste, au dépôt du plus proche des points **debout** qui la couvrent.
 * `fed` dit si elle mange au tarif simple — un chantier nourrit déjà — et `store` où elle se
 * recharge : un chantier n'a pas encore de dépôt.
 */
function anchorAt(
  point: LonLat,
  homeCountry: string | null,
  anchors: ReadonlyArray<
    OutpostReach & { readonly id: Id<'outposts'>; readonly standing: boolean }
  >,
): { readonly fed: boolean; readonly store: AnchorStore | null } {
  if (!landAtPoint(point)) return { fed: false, store: null };
  if (homeCountry !== null && hostAtPoint(point) === homeCountry)
    return { fed: true, store: 'board' };
  const depot = reachingOutpost(
    point,
    anchors.filter((anchor) => anchor.standing),
  )?.nearest.id;
  return { fed: depot !== undefined || withinReach(point, anchors), store: depot ?? null };
}

/** Le plateau personnel, ou le dépôt de cet avant-poste. */
export type AnchorStore = 'board' | Id<'outposts'>;

/** L'ancre telle que la portée la lit : chaque point porte son rayon, qui suit son niveau
 *  (`outpostReachKm`, 31/08) — un rayon commun dirait que tous couvrent la même chose. */
export const anchorOf = (outpost: Doc<'outposts'>): OutpostReach => ({
  point: [outpost.point.lon, outpost.point.lat],
  reachKm: outpostReachKm(outpost.level),
});

export type Upkeep = {
  /** Every troop of the player, standing or garrisoning — a queued batch is not a troop yet. */
  readonly troops: number;
  /** How many of them stand outside every anchor of their own, hence at the raised rate. */
  readonly unsupplied: number;
  /** Food an hour the army takes, the steps and the multiplier already applied. */
  readonly foodPerHour: number;
  /** Food an hour the standing outposts take, by level (ADR 0028 §2). */
  readonly outpostFoodPerHour: number;
  /** Coal an hour the listening posts burn: stations, and outposts that listen. */
  readonly listeningCoalPerHour: number;
  /** The troops that pay the raised rate, so the screen can mark them where the player looks. */
  readonly unsuppliedTroopIds: ReadonlyArray<Id<'troops'>>;
  /** How many outposts stand (a site under construction is not counted yet). */
  readonly outposts: number;
  /** **Où chaque troupe ancrée se recharge** (`storeAt`) ; une troupe absente ne l'est pas. */
  readonly storeOf: Readonly<Record<string, AnchorStore>>;
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
  /** What the caller already read for this player (`viewOf`): the same rows, not a second read. */
  read?: { troops: Array<Doc<'troops'>>; outposts: Array<Doc<'outposts'>> },
): Promise<Upkeep> {
  const player = await ctx.db.get(playerId);
  /**
   * **Le siège irrégulier ne mange pas** (objectifs neutres, 17/09/2026). Une garnison locale est
   * posée pour la saison, elle ne se renforce jamais et ne se ravitaille pas : lui compter un
   * entretien ferait de son stock de vivres — qui n'existe pas — une famine permanente, et le
   * `starving` d'un joueur que personne ne joue n'a rien à arbitrer.
   */
  /** **La Blitz ne mange pas non plus** : sa seule ressource est les fonds, qui ne nourrissent
   *  personne. Sans cela chaque Blitz serait une famine dès le premier fantassin. */
  const blitz = player !== null && modeOf((await ctx.db.get(player.seasonId))?.mode) === 'blitz';
  if (player?.irregular === true || blitz) {
    return {
      troops: 0,
      unsupplied: 0,
      foodPerHour: 0,
      outpostFoodPerHour: 0,
      listeningCoalPerHour: 0,
      unsuppliedTroopIds: [],
      outposts: 0,
      storeOf: {},
    };
  }
  const home = homeCountryOf(player?.nation ?? null);

  const outposts =
    read?.outposts ??
    (await ctx.db
      .query('outposts')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect());

  /** **A site under construction already feeds**: what raising it opens is the ground (colour,
   *  slots, reach, survey), never the cooking pot. The column that founds it camps in place, and
   *  charging it the raised rate during its own works would punish the order just given. */
  const supplying = outposts
    .filter((outpost) => outpost.disabledUntil === null || outpost.disabledUntil <= now)
    .map((outpost) => ({
      ...anchorOf(outpost),
      id: outpost._id,
      standing: isStanding(outpost, now),
    }));

  const troops =
    read?.troops ??
    (await ctx.db
      .query('troops')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect());

  /** Vingt troupes logent dans trois casernes : l'adresse se lit une fois, pas une fois par
   *  troupe — ce calcul passe à chaque vue, à chaque règlement et à chaque débit. */
  const stationed = new Map<string, LonLat | null>();
  const unsuppliedTroopIds: Array<Id<'troops'>> = [];
  const storeOf: Record<string, AnchorStore> = {};
  for (const troop of troops) {
    const address = troop.stationedAt;
    let point: LonLat | null;
    if (typeof address !== 'string') {
      point = await standsAt(ctx, troop);
    } else if (stationed.has(address)) {
      point = stationed.get(address)!;
    } else {
      point = await standsAt(ctx, troop);
      stationed.set(address, point);
    }
    /** A troop the game cannot place is at home: `null` is national soil hanging from nothing
     *  that stands (schema), and so is a building razed under it. Neither is an expedition. */
    const { fed, store } =
      point === null ? { fed: true, store: 'board' as const } : anchorAt(point, home, supplying);
    if (!fed) unsuppliedTroopIds.push(troop._id);
    if (store !== null) storeOf[troop._id] = store;
  }

  const plain = troops.length - unsuppliedTroopIds.length;
  const standing = outposts.filter((outpost) => isStanding(outpost, now));
  /** A post out of service is silent, so it burns nothing. Every standing outpost keeps a
   *  lookout, priced by its level (ADR 0037 §2). */
  const listeningCoalPerHour =
    LISTENING_COAL_PER_HOUR *
      activeBuildings(await playerBuildings(ctx, playerId), now).filter(
        (building) => building.key === 'listening',
      ).length +
    standing
      .filter((outpost) => inService(outpost.disabledUntil, now))
      .reduce((sum, outpost) => sum + lookoutCoalPerHour(outpost.level), 0);
  return {
    troops: troops.length,
    unsupplied: unsuppliedTroopIds.length,
    foodPerHour: armyUpkeep(plain, unsuppliedTroopIds.length),
    outpostFoodPerHour:
      OUTPOST_FOOD_PER_HOUR_PER_LEVEL * standing.reduce((sum, outpost) => sum + outpost.level, 0),
    listeningCoalPerHour,
    unsuppliedTroopIds,
    outposts: standing.length,
    storeOf,
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
  return building === null ? null : pointOfBuilding(building);
}
