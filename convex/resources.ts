import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  RESOURCES,
  canonicalBuildingKey,
  type BuildingKey,
  type DepositKey,
  type ResourceKey,
} from '../src/domain/ids';
import {
  EXPLOITED_DEPOSITS,
  YIELD_OF,
  clipToCapacity,
  emptyStocks,
  exploits,
  isLinked,
  outputShareOf,
  produces,
  settleStocks,
  shortfallOf,
  type ChainReport,
  type Conversion,
} from '../src/domain/economy';
import { activeBuildings, playerBuildings, totalLevelOf } from './buildingReads';
import {
  BASE_CAP,
  COMMANDED_CHAINS,
  DEFAULT_LINE,
  FACTORY_LINES,
  EXTRACTION_PER_HOUR,
  STORAGE_CAP_PER_LEVEL,
  isCommanded,
  type LineKey,
  type Costs,
} from './constants';
import { fail } from './errors';
import { cancelJob, isPending } from './scheduledJobs';
import { heldOver } from './holding';
import { holdsPoint } from './strategicPoints';
import { pointOfBuilding, regionFacts } from './regions';
import { depositAt } from '../src/domain/world';
import { upkeepOf, type Upkeep } from './upkeep';
import type { ResourceAmounts } from '../src/domain/loot';

export type { ResourceKey, Costs };

export async function resourceRows(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'resources'>>> {
  return ctx.db
    .query('resources')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

/**
 * One exploitation building and what it actually pulls out. `deposit` is what the *region*
 * holds, not what the building takes from it: a mine standing over oil reads "pétrole, 0/h",
 * which is a mistake a player must be able to see. A mute building is not an absent one.
 */
export type ExtractionSite = {
  readonly key: BuildingKey;
  readonly regionId: string;
  readonly level: number;
  readonly deposit: DepositKey | null;
  readonly perHour: number;
  /**
   * **Sa région porte-t-elle encore sa couleur** (ADR 0020 §6). Servi à côté du débit plutôt que
   * déduit d'un zéro : une mine posée sur du pétrole rend zéro elle aussi, et les deux se
   * réparent par des gestes opposés — l'une se déplace, l'autre se reprend sur la carte.
   */
  readonly linked: boolean;
  /** La part de son débit qu'elle produit (`outputShareOf`) : 1 reliée ; coupée, 0 ou le quart de
   *  Narvik. Servie à côté de `linked` pour dire pourquoi un site coupé produit encore. */
  readonly share: number;
};

/**
 * Ce que chaque exploitation sort du sol, **et si le sol est encore à elle** (ADR 0020 §6). La
 * couleur arrive en paramètre : c'est celle que la carte peint, calculée une fois
 * (`convex/holding.ts`), jamais relue ici.
 */
export function extractionSites(
  buildings: ReadonlyArray<Doc<'buildings'>>,
  held: ReadonlyMap<string, string>,
  ownerId: string,
  holdsNarvik: boolean,
): ReadonlyArray<ExtractionSite> {
  return buildings
    .filter((building) => EXPLOITED_DEPOSITS[building.key] !== undefined)
    .map((building) => {
      /** Ce que le point du bâtiment tient (ADR 0029 §3), jamais sa région. */
      const deposit = depositAt(pointOfBuilding(building))?.deposit ?? null;
      const yielding = deposit !== null && exploits(building.key, deposit);
      const linked = isLinked(building, held, ownerId);
      const share = outputShareOf(linked, holdsNarvik);
      return {
        key: building.key,
        regionId: building.regionId,
        level: building.level,
        deposit,
        perHour: yielding ? EXTRACTION_PER_HOUR[deposit] * building.level * share : 0,
        linked,
        share,
      };
    });
}

/**
 * What a nation produces every hour, read off the map rather than off a stored number: an
 * exploitation building only yields what the region under it holds, so a mine gives coal on a
 * coal deposit and steel on an iron one, and nothing at all on neither.
 *
 * It sums the sites rather than walking the buildings a second time: the national rate and the
 * per-site detail are the same numbers, and two readings of "does this building yield" would
 * let the industry window disagree with the stock it explains.
 */
export function extractionRates(
  buildings: ReadonlyArray<Doc<'buildings'>>,
  held: ReadonlyMap<string, string>,
  ownerId: string,
  holdsNarvik: boolean,
): Record<ResourceKey, number> {
  const rates = emptyStocks();
  for (const site of extractionSites(buildings, held, ownerId, holdsNarvik)) {
    if (site.deposit !== null) rates[YIELD_OF[site.deposit]] += site.perHour;
  }
  return rates;
}

export function storageCaps(
  buildings: ReadonlyArray<Doc<'buildings'>>,
): Record<ResourceKey, number> {
  const caps = emptyStocks();
  const raised = STORAGE_CAP_PER_LEVEL * totalLevelOf(buildings, 'warehouse');
  for (const key of RESOURCES) caps[key] = BASE_CAP + raised;
  return caps;
}

/** A lot as the settlement reads it, whether it comes from the table or from a settled copy. */
export type OrderState = {
  readonly chain: BuildingKey;
  readonly line?: LineKey | undefined;
  readonly ordered: number;
  readonly produced: number;
};

/**
 * The three chains, standing or not. A chain nobody built settles at zero all the same — it
 * is `settleStocks` that shrugs it off — and keeping it in the list is what lets the industry
 * window print it extinguished: an absent chain is information, an absent line is a hole.
 *
 * A commanded chain carries what is left of its lot as a quota; the others carry `null`, which
 * is not the same as zero — see `Conversion.quota`. A commanded chain with no row is therefore
 * at zero: silent until asked, which is the whole decision.
 */
export function chainsOf(
  buildings: ReadonlyArray<Doc<'buildings'>>,
  orders: ReadonlyArray<OrderState>,
  held: ReadonlyMap<string, string>,
  ownerId: string,
  holdsNarvik: boolean,
): ReadonlyArray<Conversion> {
  /**
   * **Le niveau qui compte est celui des exemplaires reliés** (ADR 0020 §6), un exemplaire coupé
   * comptant pour sa part (`outputShareOf`, Narvik). Deux fonderies, une chez soi et une sous un
   * avant-poste que le raid vient de couper : la vitesse tombe à celle qui reste, elle ne tombe
   * pas à zéro.
   */
  const workedLevelOf = (key: BuildingKey) =>
    buildings.reduce(
      (sum, building) =>
        canonicalBuildingKey(building.key) === canonicalBuildingKey(key)
          ? sum + building.level * outputShareOf(isLinked(building, held, ownerId), holdsNarvik)
          : sum,
      0,
    );

  return COMMANDED_CHAINS.map((key) => {
    const lot = orders.find((order) => order.chain === key);
    /** **The line is the lot's**: a chain with no lot runs the default one, silent at a quota of
     *  zero, so the industry window can still print it. */
    const { output, inputs, perHourPerLevel } = FACTORY_LINES[lot?.line ?? DEFAULT_LINE];
    const standing = totalLevelOf(buildings, key);
    return {
      by: key,
      output,
      inputs,
      level: workedLevelOf(key),
      perHour: perHourPerLevel * workedLevelOf(key),
      quota: isCommanded(key) ? Math.max(0, (lot?.ordered ?? 0) - (lot?.produced ?? 0)) : null,
      /** Bâtie et entièrement coupée : c'est ça, `unlinked`. Rien de bâti reste `off` — il n'y a
       *  pas de réseau à reprendre pour une chaîne qui n'existe pas. */
      linked: standing === 0 || workedLevelOf(key) > 0,
    };
  });
}

export type SettledOrder = OrderState & { readonly row: Doc<'orders'> };

export type Economy = {
  readonly rows: ReadonlyArray<Doc<'resources'>>;
  readonly stocks: Record<ResourceKey, number>;
  /** What **accrues**: the mines, less what the army eats. This is the rate the settlement
   *  integrates, and it must stay free of the chains — they are applied inside the same pass,
   *  and adding them here would convert the same coal twice. */
  readonly ratePerHour: Record<ResourceKey, number>;
  /**
   * **What the player actually reads move**: the accrual plus what the chains make, less what
   * they eat, taken from the outlook the industry window already prints. The client extrapolates
   * a stock between two readings from this number and nothing else — served the accrual alone,
   * the rounds an arsenal casts at three an hour sat frozen at `0 / h` until an unrelated mutation
   * happened to bank them, and the coal it eats climbed on screen while it was being spent.
   */
  readonly netRatePerHour: Record<ResourceKey, number>;
  readonly cap: Record<ResourceKey, number>;
  readonly chains: ReadonlyArray<ChainReport>;
  /** The standing lots, advanced to `now` like the stocks — never as stored. */
  readonly orders: ReadonlyArray<SettledOrder>;
  /** What the army and the outposts eat, already netted out of `ratePerHour` above. It travels
   *  whole because the screen owes the player the halves of a rate he reads as one number. */
  readonly upkeep: Upkeep;
  /**
   * **The army has nothing left to eat.** Nothing dies of it (`consommation-continue.md` D3) —
   * the reserve floors at zero and the recruitment queues stop. Read off the settlement itself
   * rather than off "the stock is zero", which is also what a nation that eats exactly what it
   * grows reads, hour for hour, in perfect health.
   */
  readonly starving: boolean;
  /**
   * **The listening posts have no coal left to burn** (ADR 0028 §1): empty **and** still burning,
   * the same reading as `starving`. A silent post files no sighting and no survey until the coal
   * comes back, and the piece itself says so.
   */
  readonly listeningSilent: boolean;
  /**
   * **Ce que la production reliée a coupé** (ADR 0020 §6) : les bâtiments qui produisent — les
   * quatre extracteurs et les trois chaînes — dont la région ne porte plus la couleur de leur
   * propriétaire. Ni le stockage, ni la projection, ni le quartier général : ils ne font rien
   * entrer dans le monde, donc rien ne se coupe chez eux.
   *
   * C'est un **compte**, et c'est ce qui déclenche la dépêche : le serveur compare celui d'avant
   * l'événement et celui d'après, et n'écrit que si le nombre a bougé.
   */
  readonly unlinked: ReadonlyArray<Doc<'buildings'>>;
  /** Ce que chaque exploitation sort du sol, site par site — le détail que le taux national
   *  résume, servi depuis le même règlement pour qu'aucune des deux lectures ne dérive. */
  readonly extraction: ReadonlyArray<ExtractionSite>;
};

/**
 * The window the chains are diagnosed over. The one just settled cannot serve: a player who
 * just paid for a construction reads zero minutes, where nothing was asked of any chain and
 * every one of them would report as running. An hour ahead of the settled stocks answers the
 * question actually being asked — *why is my steel not rising* — in the present tense.
 */
export const OUTLOOK_HOURS = 1;

/**
 * The whole economy brought up to `now`, without writing anything: this is what a query
 * serves and what a mutation checks before it spends. Accrual and transformation happen in
 * one call because they are one movement — see `settleStocks`.
 *
 * The eight rows share a single `updatedAt` because they are always written together; the
 * latest of them is taken, so a row left behind by a partial write can only under-produce.
 */
export async function economyOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  now: number,
  /** What the caller already read for this player (`viewOf`), the colour of his ground included
   *  (`linkedOn`): the same answer, not a second reading of the season. */
  read?: Parameters<typeof upkeepOf>[3] & {
    held?: ReadonlyMap<string, string>;
    holdsNarvik?: boolean;
  },
): Promise<Economy> {
  const rows = await resourceRows(ctx, playerId);
  const buildings = await playerBuildings(ctx, playerId);
  const active = activeBuildings(buildings, now);
  const player = await ctx.db.get(playerId);
  const held = read?.held ?? (await heldFor(ctx, player, active, now));
  /** **Narvik** (ADR 0032) : ses exploitations coupées produisent un quart, au lieu de rien. */
  const holdsNarvik =
    read?.holdsNarvik ?? (player !== null && (await holdsPoint(ctx, player, 'narvik')));

  const stored = emptyStocks();
  let updatedAt = now;
  for (const key of RESOURCES) {
    const row = rows.find((candidate) => candidate.key === key);
    if (!row) fail('MISSING_RESOURCE', { resource: key });
    stored[key] = row.stock;
    updatedAt = Math.min(updatedAt, row.updatedAt);
  }

  /**
   * **The upkeep is a negative term of the rate, and nothing else in the settlement changes
   * shape.** `settleStocks` integrates a net rate: subtracting the army here rather than
   * draining afterwards is what keeps a single arbitration — a second pass that took food out
   * after the conversions would be a second place a stock moves in time, and the whole reason
   * `settleStocks` is alone is that two of them disagree.
   *
   * **Before the conversions, therefore, and not after.** The army eats first: a nation that
   * cannot feed its troops is a nation whose arsenal has to wait, not one whose surplus alone
   * is at risk. Food feeds no chain today, so the ordering costs nothing yet — it is written
   * down because the day one eats food the behaviour differs and the player will feel it.
   */
  const upkeep = await upkeepOf(ctx, playerId, now, read);
  const ratePerHour = extractionRates(active, held, playerId, holdsNarvik);
  /** What eats and what burns (ADR 0028 §2): the army by steps, the standing outposts by level,
   *  the listening posts in coal. All of it goes through the rate, never through a separate debit. */
  ratePerHour.food -= upkeep.foodPerHour + upkeep.outpostFoodPerHour;
  ratePerHour.coal -= upkeep.listeningCoalPerHour;
  const cap = storageCaps(active);
  const orderRows = await ordersOf(ctx, playerId);
  const settled = settleStocks({
    stocks: stored,
    ratePerHour,
    cap,
    conversions: chainsOf(active, orderRows, held, playerId, holdsNarvik),
    hours: (now - updatedAt) / 3_600_000,
  });

  /**
   * A lot advances by exactly what the settlement made, never by elapsed time: if the steel
   * ran out halfway through the night, the lot is that much less far along, and the two
   * figures cannot drift because only one of them was ever computed.
   */
  const madeBy = new Map(settled.chains.map((report) => [report.conversion.by, report.made]));
  const orders = orderRows.map((row) => ({
    row,
    chain: row.chain,
    line: row.line,
    ordered: row.ordered,
    produced: Math.min(row.ordered, row.produced + (madeBy.get(row.chain) ?? 0)),
  }));

  // Projected, never written: only its verdict is kept. Same function, same arbitration —
  // raising a chain's rate moves the stocks and the diagnosis together or neither. It reads
  // the *settled* lots, so a batch that just finished reports as awaiting an order, not as
  // running for one more hour.
  const outlook = settleStocks({
    stocks: settled.stocks,
    ratePerHour,
    cap,
    conversions: chainsOf(active, orders, held, playerId, holdsNarvik),
    hours: OUTLOOK_HOURS,
  });

  /**
   * `made` is what the outlook says the chain gets through over `OUTLOOK_HOURS` — a real rate
   * and not a nominal one, so a starved arsenal prints what it truly casts and a full one
   * prints nothing. Same arbitration as the stocks: the two cannot disagree, being one reading.
   */
  const netRatePerHour = { ...ratePerHour };
  for (const { conversion, made } of outlook.chains) {
    const perHour = made / OUTLOOK_HOURS;
    netRatePerHour[conversion.output] += perHour;
    for (const [key, quantity] of conversion.inputs) netRatePerHour[key] -= perHour * quantity;
  }

  return {
    rows,
    stocks: settled.stocks,
    ratePerHour,
    netRatePerHour,
    cap,
    chains: outlook.chains,
    orders,
    upkeep,
    /** Empty **and** still being eaten. A reserve at zero under a rate that holds is a nation
     *  living hand to mouth, not a famine, and calling it one would stop its queues for nothing. */
    starving: settled.stocks.food <= 0 && ratePerHour.food < 0,
    listeningSilent:
      upkeep.listeningCoalPerHour > 0 && settled.stocks.coal <= 0 && ratePerHour.coal < 0,
    unlinked: active.filter(
      (building) => produces(building.key) && !isLinked(building, held, playerId),
    ),
    extraction: extractionSites(active, held, playerId, holdsNarvik),
  };
}

/**
 * **La couleur, sur le sol que ce joueur-là a bâti, et rien de plus.** Le classement dépouille le
 * planisphère parce que c'est sa question ; un règlement de stock n'a besoin que des régions qui
 * portent un bâtiment — une poignée — et mesurer les 4 589 à chaque débit serait payer un
 * dépouillement pour une adresse. Même fonction (`heldOver`), moins de sol.
 *
 * **Ce que ça coûte au fan-out** (`technique/brouillard-et-fanout.md`) : la production dépend des
 * points des autres, c'est toute la règle du §6, donc cette lecture balaie la saison. Les
 * règlements la paient ; `playerView` non : elle lit la couleur retenue au dernier changement de
 * couleur (`linkedOn`, #144), et une écriture sur le dépôt d'un point adverse ne la réveille plus.
 */
async function heldFor(
  ctx: QueryCtx,
  player: Doc<'players'> | null,
  buildings: ReadonlyArray<Doc<'buildings'>>,
  now: number,
): Promise<ReadonlyMap<string, string>> {
  if (player === null) return new Map();
  const regions = new Map(
    buildings.flatMap((building) => {
      const facts = regionFacts(building.regionId);
      return facts === null ? [] : [[facts.id, facts] as const];
    }),
  );
  return heldOver(ctx, player.seasonId, [...regions.values()], now);
}

export async function ordersOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'orders'>>> {
  return ctx.db
    .query('orders')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

/**
 * The largest lot the input reserve allows, in units of output — the only ceiling the slider
 * has. It reads the stocks settled to `now`, not the outlook: a player orders against what he
 * holds, not against what he will hold in an hour.
 */
export function maxOrderOf(economy: Economy, line: LineKey): number {
  const limit = FACTORY_LINES[line].inputs.reduce(
    (least, [key, quantity]) => Math.min(least, Math.floor(economy.stocks[key] / quantity)),
    Number.POSITIVE_INFINITY,
  );
  return Number.isFinite(limit) ? Math.max(0, limit) : 0;
}

/** What the client reads of one resource: the settled stock, floored, plus what it needs to
 *  keep extrapolating between two readings. */
export function snapshotOf(
  economy: Economy,
  key: ResourceKey,
): { stock: number; ratePerHour: number; cap: number } {
  return {
    stock: Math.floor(economy.stocks[key]),
    ratePerHour: economy.netRatePerHour[key],
    cap: economy.cap[key],
  };
}

export const snapshotAll = (
  economy: Economy,
): Record<ResourceKey, { stock: number; ratePerHour: number; cap: number }> =>
  Object.fromEntries(RESOURCES.map((key) => [key, snapshotOf(economy, key)])) as Record<
    ResourceKey,
    { stock: number; ratePerHour: number; cap: number }
  >;

/**
 * The stocks and the lots are banked together because they were settled together: writing one
 * without the other would let a mutation re-settle the same hour of arsenal output at the next
 * reading, or bank ammunition against a lot that never advanced.
 */
async function writeStocks(
  ctx: MutationCtx,
  economy: Economy,
  stocks: Record<ResourceKey, number>,
  now: number,
): Promise<void> {
  for (const row of economy.rows) {
    // Never backwards: a job dated in the past that wakes late settles nothing (`economyOf`
    // integrates zero hours for it), and rewinding `updatedAt` would make the next settlement
    // pay again the hours a later one already paid.
    await ctx.db.patch(row._id, {
      stock: stocks[row.key],
      updatedAt: Math.max(now, row.updatedAt),
    });
  }
  for (const order of economy.orders) {
    if (order.produced !== order.row.produced) {
      await ctx.db.patch(order.row._id, { produced: order.produced });
    }
  }

  /**
   * **A famine ends on an event, never on a clock.** A recruitment queue stopped by hunger
   * (`troops.ts`) has nothing to wake it: the food comes back because a farm went up, a lot was
   * refunded or an army shrank, and every one of those is a mutation that banks a stock here.
   * So this is the one door, exactly as it is the one door to the stocks themselves.
   *
   * It fires on the state **before** the write rather than after: a farm finishing raises the
   * rate without adding a grain, so "is there food now" would miss the very event that ends the
   * famine. The woken mutation re-reads the economy and decides — a wake-up that finds the
   * player still hungry costs one no-op and stops there.
   */
  const owner = economy.rows[0]?.playerId;
  if (economy.starving && owner !== undefined) {
    await wakeOnce(ctx, owner, 'resumeJobId', (playerId) =>
      ctx.scheduler.runAfter(0, internal.troops.resumeQueues, { playerId }),
    );
  }

  /**
   * **The ears follow the coal.** Sightings are only re-read by mutations, so a post going silent
   * (or hearing again) needs one: now when the state before or after the write is silent. The
   * instant the coal will run dry is set here too, on the stock just written: a colour another
   * player changed may speed this one's burn without touching his detectors (`reportChange`
   * settles every belligerent), and only his own wake-up would then come in time.
   */
  if (owner !== undefined && economy.upkeep.listeningCoalPerHour > 0) {
    const coal = stocks.coal;
    if (economy.listeningSilent || (coal <= 0 && economy.netRatePerHour.coal < 0)) {
      await wakeOnce(ctx, owner, 'reassessJobId', (playerId) =>
        ctx.scheduler.runAfter(0, internal.listening.reassess, { playerId }),
      );
    }
    await keepDryWakeUp(ctx, await ctx.db.get(owner), coalDryAt(economy, coal, now));
  }
}

/**
 * **L'heure où le charbon tombe à zéro, au train où il brûle maintenant** (ADR 0037 §2) : l'entretien
 * (`ratePerHour`) et, en plus, chaque chaîne qui tourne à son débit nominal. Le débit net de
 * `netRatePerHour` est une moyenne sur l'horizon : il compte la chaîne affamée après le zéro et
 * donne une heure trop tardive. Celle-ci pèche par avance, jamais par retard — un réveil un peu
 * tôt relit et replanifie, un réveil en retard sert un relevé que la vigie n'a pas payé. `null`
 * quand rien ne ronge le charbon ou que les vigies sont déjà muettes.
 */
export function coalDryAt(economy: Economy, coal: number, now: number): number | null {
  if (economy.listeningSilent || economy.upkeep.listeningCoalPerHour <= 0) return null;
  const chains = economy.chains
    .filter((chain) => chain.made > 0)
    .reduce(
      (sum, { conversion }) =>
        sum + conversion.perHour * (conversion.inputs.find(([key]) => key === 'coal')?.[1] ?? 0),
      0,
    );
  const drain = chains - economy.ratePerHour.coal;
  return drain > 0 ? now + (Math.max(0, coal) / drain) * 3_600_000 + 1_000 : null;
}

/**
 * **Un seul réveil de charbon par joueur** (#146). Le job en attente qui part au plus tard à
 * l'heure dite reste : parti un peu tôt, il relit et replanifie, et la ligne `players`, que toutes
 * les vues de la saison lisent, n'est réécrite que si le réveil change. Un job qui partirait trop
 * tard, ou plus de charbon qui brûle, l'annule d'abord.
 */
const DRY_TOLERANCE_MS = 500;

export async function keepDryWakeUp(
  ctx: MutationCtx,
  player: Doc<'players'> | undefined | null,
  dryAt: number | null,
): Promise<void> {
  if (player === undefined || player === null) return;
  const kept = player.dryJob;
  if (
    kept !== undefined &&
    dryAt !== null &&
    kept.at <= dryAt + DRY_TOLERANCE_MS &&
    (await isPending(ctx, kept.jobId))
  )
    return;
  if (kept === undefined && dryAt === null) return;
  if (kept !== undefined) await cancelJob(ctx, kept.jobId);
  const dryJob =
    dryAt === null
      ? undefined
      : {
          jobId: await ctx.scheduler.runAt(dryAt, internal.listening.reassess, {
            playerId: player._id,
          }),
          at: dryAt,
        };
  await ctx.db.patch(player._id, { dryJob });
}

/** **Un réveil à la fois** (#146) : deux règlements de suite sont couverts par le même job, qui
 *  relira l'état une fois la mutation écrite. Un job déjà parti n'empêche pas d'en planifier un. */
async function wakeOnce(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  field: 'reassessJobId' | 'resumeJobId',
  schedule: (playerId: Id<'players'>) => Promise<Id<'_scheduled_functions'>>,
): Promise<void> {
  const player = await ctx.db.get(playerId);
  if (player === null || (await isPending(ctx, player[field]))) return;
  await ctx.db.patch(playerId, { [field]: await schedule(playerId) });
}

/** Whether this player's listening posts are silent for want of coal right now. */
export async function listeningSilentOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  now: number,
): Promise<boolean> {
  return (await economyOf(ctx, playerId, now)).listeningSilent;
}

/** Bring a player up to `now` and write it down, spending nothing. What every mutation that
 *  changes the shape of the economy — a lot placed, a lot cancelled — owes the reading before
 *  it: otherwise the new shape would be applied retroactively to the hours already elapsed. */
export async function settle(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  now: number,
): Promise<Economy> {
  const economy = await economyOf(ctx, playerId, now);
  await writeStocks(ctx, economy, economy.stocks, now);
  return economy;
}

/**
 * **The single door to the clipping of ADR 0017**, and it must stay single: two mutations
 * clipping on their own are two chances to disagree about when a stock is lost, and this
 * repository has already paid for that once.
 *
 * It is called **after** the storage has gone — the ceiling is read off the buildings as they
 * stand, so a warehouse still in the table is a warehouse still holding. The order is the whole
 * contract: remove, then clip.
 *
 * The player is settled to `now` first, at his old shape, so that the hours he did hold the
 * store are his; only what is left over the new ceiling is taken, once. Returns what was lost,
 * for the journal entry the pillage will owe him — nothing here writes it, since nothing here
 * knows why the store fell.
 *
 * **Un seul appelant** (`buildings.demolish`, 15/09) : c'est le seul geste du jeu qui fasse
 * tomber un plafond. Voir la fonction sur laquelle elle s'appuie, `clipToCapacity`.
 */
export async function clipToStorage(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  now: number,
  /** Ce qu'un pillage laisse par ressource (`sparedPerResourceOf`) : le plafond ne coupe pas en
   *  dessous, sans quoi Dakar épargnerait 600 puis les perdrait au rognage. */
  spared = 0,
): Promise<Record<ResourceKey, number>> {
  const economy = await settle(ctx, playerId, now);
  const cap = Object.fromEntries(
    RESOURCES.map((key) => [key, Math.max(economy.cap[key], spared)]),
  ) as Record<ResourceKey, number>;
  const { stocks, lost } = clipToCapacity(economy.stocks, cap);
  if (RESOURCES.every((key) => lost[key] === 0)) return lost;
  await writeStocks(ctx, economy, stocks, now);
  return lost;
}

/**
 * Every cost is checked before any is debited: a partial spend would leave a player short of
 * coal without having received anything, and nothing here knows how to roll back.
 */
export async function debit(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  costs: Costs,
  now: number,
): Promise<void> {
  const economy = await economyOf(ctx, playerId, now);
  const remaining = { ...economy.stocks };

  const short = shortfallOf(costs, (key) => economy.stocks[key]);
  if (short !== null) {
    fail('INSUFFICIENT_RESOURCE', {
      resource: short.resource,
      needed: costs[short.resource],
      available: Math.floor(economy.stocks[short.resource]),
    });
  }
  for (const [key, cost] of Object.entries(costs) as ReadonlyArray<[ResourceKey, number]>) {
    remaining[key] -= cost;
  }

  await writeStocks(ctx, economy, remaining, now);
}

/**
 * The refund of a cancelled batch, whole. It used to be clipped to the ceiling, because a
 * stock above it vanished at the next reading; the ceiling now bounds what *comes in* rather
 * than what is held (`settleStocks`), so clipping here would be the one place that still
 * confiscates — and it would confiscate exactly what the player had already paid.
 *
 * A refund cannot lift anyone above where he was: it hands back what a debit took.
 */
export async function credit(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  gains: Costs,
  now: number,
): Promise<void> {
  const economy = await economyOf(ctx, playerId, now);
  const stocks = { ...economy.stocks };
  for (const [key, gain] of Object.entries(gains) as ReadonlyArray<[ResourceKey, number]>) {
    stocks[key] += gain;
  }
  await writeStocks(ctx, economy, stocks, now);
}

/**
 * A physical delivery fills only free storage. Existing excess is left untouched: capacity
 * bounds what enters, never what the player already owns. The rejected remainder is returned
 * to the caller so one durable report can account for every unit of cargo.
 */
export async function creditToStorage(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  gains: ResourceAmounts,
  now: number,
): Promise<{ readonly delivered: ResourceAmounts; readonly lost: ResourceAmounts }> {
  const economy = await economyOf(ctx, playerId, now);
  const stocks = { ...economy.stocks };
  const delivered = emptyStocks();
  const lost = emptyStocks();
  for (const key of RESOURCES) {
    const accepted = Math.min(gains[key], Math.max(0, economy.cap[key] - stocks[key]));
    delivered[key] = accepted;
    lost[key] = gains[key] - accepted;
    stocks[key] += accepted;
  }
  await writeStocks(ctx, economy, stocks, now);
  return { delivered, lost };
}
