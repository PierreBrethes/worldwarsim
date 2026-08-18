import { RESOURCES, type BuildingKey, type DepositKey, type ResourceKey } from './ids';

export type Stocks = Readonly<Record<ResourceKey, number>>;

/**
 * Which deposit an exploitation building needs under it, and what it then pulls out. The mine
 * is the only one with a choice, and it does not choose: the region does. A mine on coal
 * gives coal, a mine on ore gives ore — one building key, two economies (ADR 0015).
 */
export const EXPLOITED_DEPOSITS: Readonly<Partial<Record<BuildingKey, ReadonlyArray<DepositKey>>>> =
  {
    farm: ['food'],
    mill: ['textile'],
    mine: ['coal', 'ore'],
    oilWell: ['oil'],
  };

export const exploits = (key: BuildingKey, deposit: DepositKey | null): boolean =>
  deposit !== null && (EXPLOITED_DEPOSITS[key]?.includes(deposit) ?? false);

/**
 * Why a region refuses a building — `null` when it takes it. The rule lives here, in the pure
 * domain, because both sides need it and neither may own it: the server refuses the placement
 * with it, and the construction screen offers only what it accepts (ADR 0015 wants the screen
 * contextual, never greyed out). Two copies would grey a button the server still takes, or the
 * reverse.
 */
export type PlacementRefusal =
  'REGION_TAKEN' | 'BUILDING_CAP_REACHED' | 'BUILDING_LOCKED' | 'DEPOSIT_REQUIRED' | 'NOT_COASTAL';

/**
 * What the player already holds, as placement reads it. `onRegion` is the building standing on
 * the very region aimed at, if any: when it is the one being ordered, this is a **level being
 * raised**, not a second building — neither the one-per-region rule nor the ceiling applies,
 * since neither the count of buildings nor the count of occupied regions moves.
 */
export type Holdings = {
  readonly onRegion: BuildingKey | null;
  readonly standing: number;
  readonly cap: number;
  /** What the headquarters stands at, which is what opens the catalogue by tier. */
  readonly hqLevel: number;
};

/**
 * Refusals are ordered from the most local to the most general, because that is the order in
 * which they are actionable: a taken region names another region to aim at, a reached ceiling
 * names the headquarters to raise.
 *
 * `unlockedAtHqLevel` comes in as a number rather than being read from a table here: the tiers
 * are balance figures and live with the other ones (`convex/constants.ts`, `UNLOCKED_AT`),
 * which the pure domain may not import. The server passes the table's entry, the screen passes
 * the one served in its catalogue — one value, one place it is decided.
 */
export function placementRefusal(
  key: BuildingKey,
  region: { readonly deposit: DepositKey | null; readonly coastal: boolean },
  holdings: Holdings,
  unlockedAtHqLevel: number,
): PlacementRefusal | null {
  const raising = holdings.onRegion === key;
  if (holdings.onRegion !== null && !raising) return 'REGION_TAKEN';
  if (!raising && holdings.standing >= holdings.cap) return 'BUILDING_CAP_REACHED';
  // The headquarters gates every other key and never itself: at level 0 it is what the player
  // is missing, not what he is refused, and a season plants it anyway (ADR 0015).
  if (key !== 'hq' && holdings.hqLevel < unlockedAtHqLevel) return 'BUILDING_LOCKED';
  if (EXPLOITED_DEPOSITS[key] && !exploits(key, region.deposit)) return 'DEPOSIT_REQUIRED';
  if (key === 'port' && !region.coastal) return 'NOT_COASTAL';
  return null;
}

/** A transformation, as the settlement reads it: what one unit of output costs in inputs, and
 *  how many units an hour the building can push through. */
export type Conversion = {
  readonly by: BuildingKey;
  readonly output: ResourceKey;
  readonly inputs: ReadonlyArray<readonly [ResourceKey, number]>;
  readonly perHour: number;
  /**
   * How many units of output are still owed on a standing lot — `null` for a chain that runs
   * on its own, whatever the stocks.
   *
   * **Zero is not "no ceiling": it is a chain awaiting an order**, and that is the whole point
   * of the field. A chain that eats a matter spent elsewhere may not help itself to it — an
   * arsenal at level 3 takes 216 alloy a day from a player saving for a carrier, and nothing
   * on screen says so.
   */
  readonly quota?: number | null;
};

/**
 * Why a conversion made less than its nominal rate. A stock cannot say it — "my alloy stopped
 * rising" has two different answers, "your foundry has no coal" and "your alloy is at the
 * ceiling", and they call for opposite moves.
 *
 * The four states come out of the arbitration itself and out of nothing else, which is the
 * whole reason the report leaves `settleStocks` rather than being recomputed beside it: a
 * second loop making the same trade-off is a second chance to make it differently.
 */
export type ChainState = 'off' | 'idle' | 'running' | 'starved' | 'overflowing';

export type ChainReport = {
  readonly conversion: Conversion;
  readonly state: ChainState;
  /** The input that ran out first, named — `null` outside `starved`. Naming it is the point:
   *  "entrées insuffisantes" sends the player looking, "charbon" sends him building. */
  readonly missing: ResourceKey | null;
  /** How much output actually came out over the window. Over an hour it **is** the real rate,
   *  which is the figure a starved chain must print instead of its nominal one. */
  readonly made: number;
};

/**
 * Which building brings a resource into the world. It answers the refusal that names its cause
 * — "jamais : aucune mine de charbon" beats "il faut 72 de charbon (0 disponibles)", because
 * the first one says what to build.
 *
 * Written out rather than inverted from `EXPLOITED_DEPOSITS` and `CHAINS`: the mine works two
 * deposits, so the inversion is not a function. `convex/economy.test.ts` holds it against both
 * tables rather than trusting this paragraph.
 */
export const PRODUCER_OF: Readonly<Record<ResourceKey, BuildingKey>> = {
  food: 'farm',
  textile: 'mill',
  coal: 'mine',
  oil: 'oilWell',
  ore: 'mine',
  alloy: 'foundry',
  ammunition: 'arsenal',
  bandages: 'quartermaster',
};

export const emptyStocks = (): Record<ResourceKey, number> =>
  Object.fromEntries(RESOURCES.map((key) => [key, 0])) as Record<ResourceKey, number>;

/**
 * The whole economy of a player, moved forward by `hours`. Accrual and transformation live in
 * the same pass on purpose: a foundry consumes ore that was itself accruing, and settling them
 * in two places would let a read order decide how much alloy exists.
 *
 * The conversions are applied **in the order given**, so a chain resolves inside one window —
 * the alloy a foundry makes at 9 h is available to the arsenal in the same reading. Strict
 * simultaneity would idle the arsenal for one read every time a foundry is built, which is a
 * worse lie about a continuous process than the ordering is.
 *
 * It returns the report of every conversion beside the stocks because the two are the same
 * arbitration: `room` and `affordable` already decide how much is made, so saying *why* costs
 * nothing here and would cost a divergence anywhere else.
 *
 * **A window is an integration, not a step.** Reading three days as one accrual clipped to the
 * ceiling, then one conversion off the clipped figure, made a mine at level 2 look as though it
 * had brought up four hundred ore instead of twelve hundred: half of a three-day absence lost
 * in silence, and only for the player without a warehouse. Hence the two ledgers below — what
 * *flowed*, and what is *stored* — and the fixed point that gives a saturating output back the
 * room a downstream chain frees. The whole thing stays analytic: **no loop here counts hours.**
 */
export function settleStocks(settlement: {
  stocks: Stocks;
  ratePerHour: Stocks;
  cap: Stocks;
  conversions: ReadonlyArray<Conversion>;
  hours: number;
}): { stocks: Record<ResourceKey, number>; chains: ReadonlyArray<ChainReport> } {
  /**
   * The space left in a bac is not what a chain may pour into it: whatever a downstream chain
   * takes back out over the same window is room too — an arsenal emptying the alloy as it is
   * cast keeps the foundry running well past the four hundredth ingot.
   *
   * That draw is settled by iteration, not by a formula, because it depends on the production
   * it authorises. The first pass lifts the ceilings to get an upper bound, and each pass
   * afterwards can only lower it, so it converges — **in a number of passes bounded by the
   * number of chains, never by the hours elapsed.** Three chains, four passes at worst; a
   * week's absence costs exactly what a minute's does.
   */
  let allowance: ReadonlyArray<number> = settlement.conversions.map(() => Number.POSITIVE_INFINITY);
  let settled = integrate(settlement, allowance);
  for (let pass = 0; pass <= settlement.conversions.length; pass += 1) {
    const drawn = drawnDownstream(settlement.conversions, settled.chains);
    if (drawn.every((value, rank) => value === allowance[rank])) break;
    allowance = drawn;
    settled = integrate(settlement, allowance);
  }
  return settled;
}

/**
 * **The other half of the ceiling** (ADR 0017). A ceiling bounds what comes in and never what
 * is held — that is `settleStocks` above. So a stock standing above its ceiling has to come
 * down somewhere, and the decision is that it comes down **when the capacity does**: what no
 * longer fits is lost once, at that instant, and never again by a later reading.
 *
 * It is an event, not a rule, and that is why it is a function of its own rather than a clause
 * inside the settlement: a settlement runs on every read, and this must run on exactly one.
 *
 * **Nothing calls it yet, on purpose.** No building is destroyed, dismantled or lowered today;
 * the real caller comes with pillage, where an emptied warehouse must cost its owner something
 * (fiche 02). It is written and tested before that, because the sense of the ceiling itself was
 * once decided in passing in the middle of another subject, and that cost a silent confiscation.
 *
 * `lost` carries every resource, zeros included, so that a caller reading it never has to ask
 * whether a missing key means nothing lost or nothing known — the player's journal is what will
 * name the ones that are not zero.
 */
export function clipToCapacity(
  stocks: Stocks,
  cap: Stocks,
): { stocks: Record<ResourceKey, number>; lost: Record<ResourceKey, number> } {
  const kept = emptyStocks();
  const lost = emptyStocks();
  for (const key of RESOURCES) {
    kept[key] = Math.min(stocks[key], cap[key]);
    lost[key] = Math.max(0, stocks[key] - cap[key]);
  }
  return { stocks: kept, lost };
}

/**
 * What the chains **after** each one take out of its output, over the window. Only later ones:
 * `CHAINS` is ordered upstream first, so what a chain feeds is always behind it.
 */
function drawnDownstream(
  conversions: ReadonlyArray<Conversion>,
  probe: ReadonlyArray<ChainReport>,
): ReadonlyArray<number> {
  return conversions.map((conversion, rank) =>
    conversions.slice(rank + 1).reduce((drawn, later, offset) => {
      const perUnit = later.inputs.find(([key]) => key === conversion.output)?.[1] ?? 0;
      return drawn + perUnit * (probe[rank + 1 + offset]?.made ?? 0);
    }, 0),
  );
}

function integrate(
  {
    stocks,
    ratePerHour,
    cap,
    conversions,
    hours,
  }: {
    stocks: Stocks;
    ratePerHour: Stocks;
    cap: Stocks;
    conversions: ReadonlyArray<Conversion>;
    hours: number;
  },
  /** Extra output allowed past the bac's own space, because a later chain will take it. */
  allowance: ReadonlyArray<number>,
): { stocks: Record<ResourceKey, number>; chains: ReadonlyArray<ChainReport> } {
  const elapsed = Math.max(0, hours);

  /**
   * **What went through the player's hands over the window** — the opening stock plus
   * everything extracted or produced, *never* clipped to the ceiling. This is the ledger a
   * conversion may spend from, and keeping it apart from the stored stock is the whole fix:
   * a ceiling bounds what accumulates, it has never bounded what flows.
   *
   * **Where the drain will plug in** (`consommation-continue.md`): the accrual below is a net
   * rate, so an upkeep that eats food is `ratePerHour` turning negative and nothing else here
   * changes shape. What that prompt owes is the instant a reserve hit zero — a negative rate
   * makes `passed` fall through zero mid-window, and a chain fed by it did run until then.
   */
  const passed = emptyStocks();
  const settled = emptyStocks();
  /**
   * **A ceiling bounds what comes in, never what is already held.** The starting kit of a
   * format hands out more alloy than a nation without a warehouse can store (ADR 0015 wants
   * the store necessary, hence a target); clipping the opening stock would confiscate the
   * difference between the launch and the moment the player places that warehouse — silently,
   * which is exactly the defect the foundation exists to kill.
   *
   * So the bar is `max(cap, opening stock)`: nothing can *rise* past the ceiling, and a stock
   * that starts above it stays there until it is spent. It comes back under the ceiling on its
   * own, since every window opens on what the last one left.
   */
  const held = (key: ResourceKey) => Math.max(cap[key], stocks[key]);
  const store = (key: ResourceKey) => {
    settled[key] = Math.max(0, Math.min(held(key), passed[key]));
  };
  for (const key of RESOURCES) {
    passed[key] = stocks[key] + ratePerHour[key] * elapsed;
    store(key);
  }

  const chains = conversions.map((conversion, rank) => {
    // The lot caps what is asked of the line, never the line's own speed: the rate comes from
    // the building's level, and a throttle would only let a player slow his own works down.
    const quota = conversion.quota ?? Number.POSITIVE_INFINITY;
    const nominal = Math.min(conversion.perHour * elapsed, quota);
    // The output's ceiling still bounds it, and reads the *stored* level: what a full bac
    // refuses is one more unit in it, so a foundry with nowhere to put its alloy stops rather
    // than burning ore into a spill.
    const room =
      Math.max(0, cap[conversion.output] - settled[conversion.output]) + (allowance[rank] ?? 0);

    let affordable = nominal;
    let scarcest: ResourceKey | null = null;
    for (const [key, quantity] of conversion.inputs) {
      const limit = passed[key] / quantity;
      if (limit < affordable) {
        affordable = limit;
        scarcest = key;
      }
    }

    const made = Math.max(0, Math.min(room, affordable));
    for (const [key, quantity] of conversion.inputs) {
      passed[key] -= made * quantity;
      store(key);
    }
    passed[conversion.output] += made;
    store(conversion.output);

    return {
      conversion,
      made,
      ...verdict(conversion.perHour, made, nominal, room, affordable, scarcest, quota),
    };
  });

  return { stocks: settled, chains };
}

/**
 * The ceiling wins the tie: at equal bite, an output with nowhere to go is what the player can
 * act on first, and calling it "à sec" would send him mining ore he already cannot store.
 *
 * **`idle` is tested before the nominal is met**, and it has to be: a lot of zero asks for
 * nothing, so nothing is refused, and the line would report as running. A chain awaiting an
 * order and a chain out of matter are opposite situations — one wants a click, the other a
 * mine — and the whole reason the state exists is that they must not look alike.
 *
 * A window of zero hours makes every chain look as if it ran — nothing was asked of it, so
 * nothing was refused. That is why the industry report is read off an hour ahead rather than
 * off the window just settled (`economyOf`).
 */
function verdict(
  perHour: number,
  made: number,
  nominal: number,
  room: number,
  affordable: number,
  scarcest: ResourceKey | null,
  quota: number,
): { state: ChainState; missing: ResourceKey | null } {
  if (perHour <= 0) return { state: 'off', missing: null };
  if (quota <= 0) return { state: 'idle', missing: null };
  if (made >= nominal) return { state: 'running', missing: null };
  if (room <= affordable) return { state: 'overflowing', missing: null };
  return { state: 'starved', missing: scarcest };
}
