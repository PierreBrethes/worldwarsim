import {
  canonicalBuildingKey,
  RESOURCES,
  type BuildingKey,
  type DepositKey,
  type ResearchCard,
  type ResourceKey,
} from './ids';
import { distanceKm, type LonLat } from './geo';

export type Stocks = Readonly<Record<ResourceKey, number>>;

/**
 * **The first resource a price cannot be paid in, and by how much** — `null` when every one is
 * covered. The steel is read first, then the family's resource, the order a price is printed in:
 * the screen says the same shortage the server's `debit` refuses on.
 */
export function shortfallOf(
  costs: Readonly<Partial<Record<ResourceKey, number>>>,
  stockOf: (resource: ResourceKey) => number,
): { readonly resource: ResourceKey; readonly missing: number } | null {
  for (const resource of ['steel', ...RESOURCES.filter((key) => key !== 'steel')] as const) {
    const cost = costs[resource] ?? 0;
    if (cost <= 0) continue;
    const held = stockOf(resource);
    // A negation, so that a stock which is not a number covers nothing instead of everything.
    if (!(held >= cost)) return { resource, missing: cost - held };
  }
  return null;
}

/**
 * Which deposit an exploitation building needs under it. The mine is the only one with a
 * choice, and it does not choose: the region does — coal on coal, iron on iron.
 */
export const EXPLOITED_DEPOSITS: Readonly<Partial<Record<BuildingKey, ReadonlyArray<DepositKey>>>> =
  {
    farm: ['food'],
    mine: ['coal', 'iron'],
    oilWell: ['oil'],
  };

/** What a deposit gives once worked. **Iron gives steel straight away** (ADR 0028 §1): no
 *  resource is only an ingredient, so nothing stands between the ore and what it builds. */
export const YIELD_OF: Readonly<Record<DepositKey, ResourceKey>> = {
  food: 'food',
  iron: 'steel',
  coal: 'coal',
  oil: 'oil',
};

export const exploits = (key: BuildingKey, deposit: DepositKey | null): boolean =>
  deposit !== null && (EXPLOITED_DEPOSITS[key]?.includes(deposit) ?? false);

/**
 * **Une dette de socle est un couple, pas une clé** : la mine offerte pour le fer ne s'acquitte
 * que sur une région de fer. Comptée par clé, deux mines posées sur du charbon soldaient les deux
 * dettes et le fer se payait ensuite au prix fort — la ressource qui fait tout le reste.
 *
 * **`deposit: null` est une dette que le sol ne nomme pas** — le quartier général, et lui seul
 * (décision 1b du 13/09). Elle se solde par un exemplaire debout où que le joueur l'ait posé, ce
 * qui est exactement ce que la décision achète : un gisement sous le QG est un gisement perdu, et
 * c'est au joueur de choisir ce qu'il sacrifie.
 *
 * La liste elle-même est une valeur d'équilibrage et vit avec les autres (`foundationFor`,
 * `convex/constants.ts`) ; ce qui est ici est la **règle d'accord**, parce que les deux bouts la
 * posent — le serveur pour facturer zéro, l'écran pour allumer le sol.
 */
export type FoundationDebt = { readonly key: BuildingKey; readonly deposit: DepositKey | null };

/**
 * **Est-ce que ce bâtiment acquitte cette dette ?** Quatre règles la posent — ce que la saison
 * doit encore (`foundationOwed`), ce qui se pose gratuitement (`owedFreely`), ce qui échappe au
 * ce que la ligne de mobilisation allume — et une
 * copie qui dérive est une pose facturée plein tarif sans que rien ne l'ait dit.
 */
export const settlesDebt = (
  due: FoundationDebt,
  held: { readonly key: BuildingKey; readonly deposit: DepositKey | null },
): boolean => due.key === held.key && (due.deposit === null || due.deposit === held.deposit);

/**
 * **Combien de kilomètres au moins entre deux bâtiments d'un même joueur** (ADR 0029 §1). C'est
 * ce qui tient lieu de « une bâtisse par région » : sans lui, dix mines s'empileraient sur le même
 * bassin. Mesuré de point à point, jamais en régions (ADR 0015).
 * @a-mesurer l'ordre de grandeur de l'ADR 0029, à rejouer sur une saison test
 */
export const BUILDING_SPACING_KM = 30;

/**
 * Why a building cannot go down at the point aimed at — `null` when it can. The rule lives here,
 * in the pure domain, because both sides need it and neither may own it: the server refuses the
 * placement with it, and the ghost under the pointer says the same refusal before the click
 * (ADR 0015, ADR 0029). Two copies of this rule would offer a point the server refuses.
 */
export type PlacementRefusal =
  | 'UNKNOWN_BUILDING'
  | 'HQ_FIRST'
  | 'RESEARCH_REQUIRED'
  | 'OUT_OF_REACH'
  | 'DEPOSIT_REQUIRED'
  | 'DEPOSIT_TAKEN'
  | 'NOT_COASTAL'
  | 'TOO_CLOSE'
  | 'ALREADY_BUILT';

/**
 * **The point aimed at, as placement reads it** — the facts each side gathers its own way (the
 * server off its rows and its grid, the screen off its view and its map) and hands to one rule.
 */
export type Spot = {
  /** On the player's national soil, or within the reach of one of his standing outposts. */
  readonly reached: boolean;
  /** The deposit under the point (`depositAt`), and whether a building already holds it. */
  readonly deposit: { readonly key: DepositKey; readonly taken: boolean } | null;
  /** A coast the routing can sail from (`isCoastCell`). */
  readonly coastal: boolean;
  /** The closest of the player's other buildings, standing or ordered, and how far. */
  readonly nearest: { readonly key: BuildingKey; readonly km: number } | null;
  /** One of this very key already stands (built, not captured) or is ordered. */
  readonly already: boolean;
};

/** **Ce qu'on ne bâtit qu'une fois** (#123) : le Centre de recherche. Le QG a sa propre règle. */
const UNIQUE_BUILDINGS: ReadonlyArray<BuildingKey> = ['researchCenter'];

/**
 * **What a key refuses wherever it is aimed** — the half of the rule a catalogue can read before
 * any point exists: nothing but the headquarters before it stands (`HQ_FIRST`), and nothing a
 * research card still holds (`buildingLockOf`, served as `lockedBy`).
 */
export function keyRefusal(
  key: BuildingKey,
  hqLevel: number,
  lockedBy: ResearchCard | null,
): 'UNKNOWN_BUILDING' | 'HQ_FIRST' | 'RESEARCH_REQUIRED' | null {
  if (canonicalBuildingKey(key) !== key) return 'UNKNOWN_BUILDING';
  if (key !== 'hq' && hqLevel === 0) return 'HQ_FIRST';
  if (lockedBy !== null) return 'RESEARCH_REQUIRED';
  return null;
}

/**
 * The whole placement rule. Ordered from what the key is to what the ground is, then to what
 * stands around: a point out of reach names a site to found, a missing deposit a point to aim
 * at, a neighbour too close a step to take.
 *
 * **A raise never reads it**: the point is already written and never moves (ADR 0029 §1).
 */
export function placementRefusal(
  key: BuildingKey,
  spot: Spot,
  hqLevel: number,
  lockedBy: ResearchCard | null,
): PlacementRefusal | null {
  const byKey = keyRefusal(key, hqLevel, lockedBy);
  if (byKey !== null) return byKey;
  if (spot.already && UNIQUE_BUILDINGS.includes(key)) return 'ALREADY_BUILT';
  if (!spot.reached) return 'OUT_OF_REACH';
  if (EXPLOITED_DEPOSITS[key] !== undefined) {
    if (!exploits(key, spot.deposit?.key ?? null)) return 'DEPOSIT_REQUIRED';
    if (spot.deposit?.taken === true) return 'DEPOSIT_TAKEN';
  }
  if (key === 'port' && !spot.coastal) return 'NOT_COASTAL';
  if (spot.nearest !== null && spot.nearest.km < BUILDING_SPACING_KM) return 'TOO_CLOSE';
  return null;
}

/** A standing outpost as a reach reads it: where it stands and how far it carries. */
export type Reach<Id extends string = string> = {
  readonly id: Id;
  readonly lonLat: LonLat;
  readonly reachKm: number;
};

/**
 * **What a building put down here would hang from** (ADR 0020 §10): national soil, or the closest
 * standing outpost whose reach covers the point — `null` when nothing does, which is ground
 * nothing goes up on. The server writes the answer as the anchor; both sides read `reached` off it.
 */
export function siteOfPoint<Id extends string>(
  point: LonLat,
  onHomeSoil: boolean,
  outposts: ReadonlyArray<Reach<Id>>,
): { readonly kind: 'home' } | { readonly kind: 'outpost'; readonly outpostId: Id } | null {
  if (onHomeSoil) return { kind: 'home' };
  let nearest: { readonly outpostId: Id; readonly km: number } | null = null;
  for (const outpost of outposts) {
    const km = distanceKm(point, outpost.lonLat);
    if (km > outpost.reachKm) continue;
    if (nearest === null || km < nearest.km) nearest = { outpostId: outpost.id, km };
  }
  return nearest === null ? null : { kind: 'outpost', outpostId: nearest.outpostId };
}

/** The closest of a list of buildings to a point, and how far — `null` for an empty list. */
export function nearestBuilding(
  point: LonLat,
  others: ReadonlyArray<{ readonly key: BuildingKey; readonly lonLat: LonLat }>,
): { readonly key: BuildingKey; readonly km: number } | null {
  let nearest: { readonly key: BuildingKey; readonly km: number } | null = null;
  for (const other of others) {
    const km = distanceKm(point, other.lonLat);
    if (nearest === null || km < nearest.km) nearest = { key: other.key, km };
  }
  return nearest;
}

/** A transformation, as the settlement reads it: what one unit of output costs in inputs, and
 *  how many units an hour the building can push through. */
export type Conversion = {
  readonly by: BuildingKey;
  readonly output: ResourceKey;
  readonly inputs: ReadonlyArray<readonly [ResourceKey, number]>;
  readonly perHour: number;
  /** The linked level `perHour` was computed from. */
  readonly level?: number;
  /**
   * How many units of output are still owed on a standing lot — `null` for a chain that runs
   * on its own, whatever the stocks.
   *
   * **Zero is not "no ceiling": it is a chain awaiting an order**, and that is the whole point
   * of the field. A chain that eats a matter spent elsewhere may not help itself to it — an
   * arsenal at level 3 takes 216 steel a day from a player saving for a carrier, and nothing
   * on screen says so.
   */
  readonly quota?: number | null;
  /**
   * **Faux quand la nation a cette chaîne debout et qu'aucun de ses exemplaires n'est relié**
   * (ADR 0020 §6). Un champ à part plutôt qu'un `perHour` à zéro qui parlerait pour lui : une
   * chaîne éteinte et une chaîne coupée se réparent par des gestes opposés — l'une se bâtit,
   * l'autre se reprend sur la carte — et un seul zéro pour les deux les rendrait
   * indistinguables. Absent vaut relié : le domaine pur est testé sans carte.
   */
  readonly linked?: boolean;
};

/**
 * Why a conversion made less than its nominal rate. A stock cannot say it — "my ammunition stopped
 * rising" has two different answers, "your arsenal has no coal" and "your ammunition is at the
 * ceiling", and they call for opposite moves.
 *
 * The four states come out of the arbitration itself and out of nothing else, which is the
 * whole reason the report leaves `settleStocks` rather than being recomputed beside it: a
 * second loop making the same trade-off is a second chance to make it differently.
 */
export type ChainState = 'off' | 'unlinked' | 'idle' | 'running' | 'starved' | 'overflowing';

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
  steel: 'mine',
  coal: 'mine',
  oil: 'oilWell',
  ammunition: 'arsenal',
};

/**
 * **Ce qui produit, et ce qui ne fait qu'occuper le sol.** Les trois extracteurs et l'arsenal —
 * ce sont exactement les bâtiments que la production reliée peut couper (ADR 0020 §6).
 * Le stockage, la projection, le quartier général et les cantonnements n'y sont pas : ils ne font
 * rien entrer dans le monde, donc rien ne se coupe chez eux.
 *
 * Dérivé de `PRODUCER_OF` plutôt qu'écrit une seconde fois : la table dit déjà *quel bâtiment
 * amène quelle ressource*, et une liste parallèle serait le premier endroit où une sixième
 * ressource se ferait oublier.
 */
const PRODUCERS: ReadonlySet<string> = new Set(Object.values(PRODUCER_OF));

export const produces = (key: BuildingKey): boolean => PRODUCERS.has(key);

/**
 * **Un bâtiment ne produit que relié** (ADR 0020 §6) : sa région porte la couleur de son
 * propriétaire, ou il ne rend rien. C'est la règle entière, et elle tient en une comparaison —
 * il n'y a **pas** de seconde notion de réseau, pas de chaîne d'approvisionnement, pas de
 * distance à la capitale : `held` est ce que la carte peint, et ce que la carte peint est ce qui
 * produit.
 *
 * La couleur arrive en paramètre, jamais lue ici : c'est `heldRegions` qui la calcule, une fois,
 * pour la carte, le classement, le relevé et ceci (`convex/holding.ts`). Deux lectures seraient
 * deux vérités, et le joueur verrait une région à ses couleurs au-dessus d'un site coupé.
 */
export const isLinked = (
  building: { readonly regionId: string },
  held: ReadonlyMap<string, string>,
  ownerId: string,
): boolean => held.get(building.regionId) === ownerId;

export const emptyStocks = (): Record<ResourceKey, number> =>
  Object.fromEntries(RESOURCES.map((key) => [key, 0])) as Record<ResourceKey, number>;

/**
 * What a settlement answers. `driedAfterHours` is what the drain of `consommation-continue.md`
 * owes everything downstream: a **net** rate that has gone negative empties a reserve part-way
 * through the window, and "it is at zero now" is not the same fact as "it has been at zero for
 * six of these eight hours". A recruitment queue that reads the first advances by eight hours
 * of an army that had nothing to eat for six of them.
 *
 * Hours into the window, never an instant: the settlement is handed a duration and knows no
 * date. `null` is a reserve that never ran out over these hours; `0` is one that was already
 * empty when they opened, which is a famine older than this reading and true from the first
 * minute of it.
 */
export type Settled = {
  readonly stocks: Record<ResourceKey, number>;
  readonly chains: ReadonlyArray<ChainReport>;
  readonly driedAfterHours: Readonly<Record<ResourceKey, number | null>>;
};

/**
 * The whole economy of a player, moved forward by `hours`. Accrual and transformation live in
 * the same pass on purpose: the arsenal eats coal and steel that were themselves accruing, and
 * settling them in two places would let a read order decide how many rounds exist.
 *
 * It returns the report of every conversion beside the stocks because the two are the same
 * arbitration: `room` and `affordable` already decide how much is made, so saying *why* costs
 * nothing here and would cost a divergence anywhere else.
 *
 * **A window is an integration, not a step.** Reading three days as one accrual clipped to the
 * ceiling, then one conversion off the clipped figure, would lose in silence what flowed through
 * the stores over the absence. Hence the two ledgers below — what *flowed*, and what is *stored*.
 * The whole thing stays analytic: **no loop here counts hours.**
 *
 * **No chain may eat another chain's output** (ADR 0028 §1: one transformation, fed by the
 * ground). A chain's room is its output's free space alone; a second chain drawing on the first
 * would need the downstream allowance this pass no longer computes, and would under-produce
 * without a word.
 */
export function settleStocks({
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
}): Settled {
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
   * format hands out more steel than a nation without a warehouse can store (ADR 0015 wants
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
  /**
   * **When the reserve ran out, not merely that it is empty.** A net rate below zero crosses
   * zero at `stock / -rate`, in closed form and inside the same window as everything else — no
   * loop here counts hours, and a week's absence costs what a minute's does.
   *
   * It is read off the accrual alone, before any conversion: no chain eats a resource anything
   * drains today, and the day one does, the honest answer is that the famine started *earlier*
   * than this, never later. Erring towards the early instant is erring towards the player being
   * told he was starving, which is the failure the whole rule exists to make visible.
   */
  const driedAfterHours = Object.fromEntries(RESOURCES.map((key) => [key, null])) as Record<
    ResourceKey,
    number | null
  >;
  for (const key of RESOURCES) {
    passed[key] = stocks[key] + ratePerHour[key] * elapsed;
    if (ratePerHour[key] < 0 && stocks[key] + ratePerHour[key] * elapsed < 0) {
      driedAfterHours[key] = Math.max(0, stocks[key] / -ratePerHour[key]);
    }
    store(key);
  }

  const chains = conversions.map((conversion) => {
    // The lot caps what is asked of the line, never the line's own speed: the rate comes from
    // the building's level, and a throttle would only let a player slow his own works down.
    const quota = conversion.quota ?? Number.POSITIVE_INFINITY;
    const nominal = Math.min(conversion.perHour * elapsed, quota);
    // The output's ceiling still bounds it, and reads the *stored* level: what a full bac
    // refuses is one more unit in it, so an arsenal with nowhere to put its rounds stops rather
    // than burning coal into a spill.
    const room = Math.max(0, cap[conversion.output] - settled[conversion.output]);

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
      ...verdict(
        conversion.perHour,
        made,
        nominal,
        room,
        affordable,
        scarcest,
        quota,
        conversion.linked ?? true,
      ),
    };
  });

  return { stocks: settled, chains, driedAfterHours };
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
 * The ceiling wins the tie: at equal bite, an output with nowhere to go is what the player can
 * act on first, and calling it "à sec" would send him digging coal he already cannot store.
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
  linked: boolean,
): { state: ChainState; missing: ResourceKey | null } {
  /** **Hors réseau passe avant tout le reste** (ADR 0020 §6) : un site coupé n'est pas à sec, il
   *  est coupé, et lui dire « à sec — charbon » enverrait le joueur creuser une mine quand ce
   *  qu'il doit reprendre est une frontière. Avant `off` aussi : la chaîne est bâtie. */
  if (!linked) return { state: 'unlinked', missing: null };
  if (perHour <= 0) return { state: 'off', missing: null };
  if (quota <= 0) return { state: 'idle', missing: null };
  if (made >= nominal) return { state: 'running', missing: null };
  if (room <= affordable) return { state: 'overflowing', missing: null };
  return { state: 'starved', missing: scarcest };
}
