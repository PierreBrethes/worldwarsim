import {
  BUILDABLE_BUILDINGS,
  canonicalBuildingKey,
  RESOURCES,
  type BuildCostKey,
  type BuildingKey,
  type DepositKey,
  type ResearchCard,
  type ResourceKey,
} from './ids';
import {
  BUILDING_SPACING_KM,
  EXPLOITED_DEPOSITS,
  keyRefusal,
  nearestBuilding,
  placementRefusal,
  settlesDebt,
  siteOfPoint,
  type FoundationDebt,
  type PlacementRefusal,
  type Reach,
} from './economy';
import {
  currentStock,
  type Building,
  type BuildSpec,
  type Cost,
  type PlayerView,
  type Resource,
  type SiteRef,
} from './player-view';
import { notInBlitz } from './blitz';
import { distanceKm, type LonLat } from './geo';
import { DEPOSIT_POINTS, depositAt, type DepositPoint } from './world';
import { ADM0_BY_NATION, isNation } from './nations';

/**
 * What a key asks of the point it is aimed at — the sentence that teaches the map: a player who
 * reads "on a coal or iron deposit" under a mine knows where to aim before he aims.
 */
export type BuildReason =
  | { readonly kind: 'deposit'; readonly deposits: ReadonlyArray<DepositKey> }
  | { readonly kind: 'coastal' };

/**
 * What holds a line back **for now** — as opposed to what the catalogue refuses outright, which
 * is `BlockedReason` below. A hold is a remedy ("come back in twenty minutes"), a block a fact.
 */
type BuildHold = 'materials';

export type BuildOption = {
  readonly key: BuildingKey;
  readonly cost: Cost;
  readonly minutes: number;
  readonly reason: BuildReason | null;
  readonly hold: BuildHold | null;
  /** Owed by the format's foundation: placed for nothing, standing at once — on the deposit the
   *  debt names, which the aim decides (`aimVerdict`). */
  readonly free: boolean;
};

/** What the player is, as the catalogue reads it: no ground yet — a key is chosen, then a place
 *  is aimed at (ADR 0029). */
export type Site = {
  /**
   * **The site the region the panel opened on hangs from** (ADR 0020 §10) — `null` is ground no
   * living site of the player reaches any more, and nothing goes up there.
   */
  readonly site: SiteRef | null;
  readonly hqLevel: number;
  readonly stocks: Readonly<Record<ResourceKey, number>>;
  /** What the season still owes (`me.foundation`), served — never re-derived here. */
  readonly foundation: ReadonlyArray<FoundationDebt>;
};

/**
 * **What may be ordered, before any point is aimed at** (ADR 0029): the keys the headquarters
 * opens, with their bill and what they will ask of the ground. The rest of the rule — the deposit,
 * the coast, the reach, the spacing — is the point's, and the ghost says it under the pointer
 * (`aimVerdict`): the same `placementRefusal` the server refuses with.
 *
 * Raising a building is deliberately absent. Upgrading belongs to the nation sheet — one verb
 * per surface.
 */
export function buildableOn(
  site: Site,
  catalog: Readonly<Record<BuildingKey, BuildSpec>>,
): ReadonlyArray<BuildOption> {
  if (site.site === null) return [];

  return BUILDABLE_BUILDINGS.flatMap((key) => {
    // Nothing rises above the headquarters, and a level-1 building needs one standing.
    if (key === 'hq' ? site.hqLevel > 0 : site.hqLevel === 0) return [];
    const spec = catalog[key];
    if (keyRefusal(key, site.hqLevel, spec.lockedBy) !== null) return [];

    /**
     * A key the foundation still owes is placed for nothing and stands at once — so it carries
     * no bill and no delay, and **nothing at all holds it back**. The debt of the format
     * outranks the ambition of the player.
     */
    const free = site.foundation.some((due) => due.key === key);
    const cost = free ? {} : spec.cost;

    return [
      {
        key,
        cost,
        minutes: free ? 0 : spec.minutes,
        reason: reasonFor(key),
        free,
        hold: holdOn(site, free, cost),
      } satisfies BuildOption,
    ];
  });
}

/**
 * Why the catalogue never offers a key here — the *reference* half of the panel, under the offer.
 * It is only ever asked about a key `buildableOn` has already left out.
 */
export type BlockedReason =
  /** No living site of the player reaches this ground any more — a destroyed outpost leaves its
   *  buildings standing and its anchor dead (ADR 0020 §10). */
  | { readonly kind: 'outOfReach' }
  | { readonly kind: 'unique' }
  /** `card: null` — rien ne se bâtit avant le QG (`HQ_FIRST`). */
  | { readonly kind: 'locked'; readonly card: ResearchCard | null };

/** A catalogue line: the bill and the wait are served too, because they are what a player
 *  plans against — the reason says *not yet*, the price says *what it will take*. */
export type BlockedOption = {
  readonly key: BuildingKey;
  readonly cost: Cost;
  readonly minutes: number;
  readonly reason: BlockedReason;
};

/**
 * **The rest of the catalogue**, in the order of `BUILDABLE_BUILDINGS` — every key the offer left
 * out, each carrying the requirement it fails. Together with `buildableOn` it partitions the
 * catalogue exactly once, by construction: the complement of a list, never a second reading.
 */
export function blockedOn(
  site: Site,
  catalog: Readonly<Record<BuildingKey, BuildSpec>>,
): ReadonlyArray<BlockedOption> {
  const offered = new Set(buildableOn(site, catalog).map((option) => option.key));
  return BUILDABLE_BUILDINGS.filter((key) => !offered.has(key)).map((key) => ({
    key,
    cost: catalog[key].cost,
    minutes: catalog[key].minutes,
    reason: blockedBecause(site, key, catalog[key]),
  }));
}

function blockedBecause(site: Site, key: BuildingKey, spec: BuildSpec): BlockedReason {
  if (site.site === null) return { kind: 'outOfReach' };
  if (key === 'hq') return { kind: 'unique' };
  return { kind: 'locked', card: site.hqLevel === 0 ? null : spec.lockedBy };
}

/**
 * What stands between a line and the click. **A running site holds nothing back any more** (the
 * queue is unbounded and paid at the enqueue), and **neither does a key the season owes**.
 */
function holdOn(site: Site, free: boolean, cost: Cost): BuildHold | null {
  if (free) return null;
  return affordable(cost, site.stocks) ? null : 'materials';
}

const affordable = (cost: Cost, stocks: Readonly<Record<ResourceKey, number>>): boolean =>
  Object.entries(cost).every(([key, amount]) => stocks[key as ResourceKey] >= (amount ?? 0));

function reasonFor(key: BuildingKey): BuildReason | null {
  const deposits = EXPLOITED_DEPOSITS[key];
  if (deposits !== undefined) return { kind: 'deposit', deposits };
  return key === 'port' ? { kind: 'coastal' } : null;
}

/**
 * **The whole construction queue as one list**, head first — the running site and everything
 * paid for behind it. Every rule that used to ask "is a construction running" asks this instead.
 */
export const pledgedWork = (
  view: PlayerView,
): ReadonlyArray<{
  readonly key: BuildCostKey;
  readonly regionId: string;
  readonly outpostId: string | null;
  readonly point: LonLat | null;
  /** Daté : il monte déjà (sur une file de chantier) ; absent ou `null` : il attend. */
  readonly minutesLeft?: number | null;
}> =>
  view.me.construction === null
    ? view.me.constructionQueue
    : [view.me.construction, ...view.me.constructionQueue];

/** Ce que la file bâtit, l'élévation d'un avant-poste retirée : elle ne pose rien sur un sol
 *  (précision du 15/09) — chaque entrée a son point (ADR 0029). */
const pledgedBuildings = (view: PlayerView) =>
  pledgedWork(view).flatMap((work) =>
    work.outpostId === null && work.point !== null && work.key !== 'outpost'
      ? [{ key: canonicalBuildingKey(work.key), lonLat: work.point }]
      : [],
  );

const samePoint = (a: LonLat, b: LonLat): boolean => a[0] === b[0] && a[1] === b[1];

/**
 * The site a player's view describes for one region, or `null` when that region is none of
 * his business — the view only carries his own ground, so absence *is* the answer to "may I
 * build there".
 */
export function siteOf(view: PlayerView, regionId: string, now: number): Site | null {
  /** La Blitz n'a pas de chantier (`notInBlitz`) : aucune région n'y est un site où bâtir. */
  if (notInBlitz(view.mode) !== null) return null;
  const region = view.me.regions.find((candidate) => candidate.id === regionId);
  if (region === undefined) return null;
  return {
    site: region.site,
    hqLevel: view.me.hqLevel,
    stocks: stocksNow(view, now),
    foundation: view.me.foundation,
  };
}

const stocksNow = (view: PlayerView, now: number): Record<ResourceKey, number> =>
  Object.fromEntries(
    Object.entries(view.me.resources).map(([key, resource]) => [
      key,
      currentStock(resource, view.loadedAt, now),
    ]),
  ) as Record<ResourceKey, number>;

/** The panel's list, straight from a view. Empty means the region can carry nothing, ever. */
export function buildOptionsAt(
  view: PlayerView,
  regionId: string,
  now: number,
): ReadonlyArray<BuildOption> {
  const site = siteOf(view, regionId, now);
  return site === null ? [] : buildableOn(site, view.buildCatalog);
}

/**
 * **How close the ghost leaps onto a deposit or a quay** (ADR 0029 §3) — a pointer this near a
 * free deposit lands on its exact point, the one the server reads.
 * @a-mesurer choisi à l'œil pour qu'un gisement se prenne sans viser au pixel
 */
export const PLACING_SNAP_KM = 60;

/**
 * **The point under the pointer**, as the board reads it: where (`lonLat`, already snapped), on
 * whose ground (the region the map's polygons put it in, and its country), and whether a ship can
 * sail from it (`isCoastCell`, the server's own reading). `region` is `null` at sea, or while the
 * region layer has not landed.
 */
export type Aim = {
  readonly lonLat: LonLat;
  readonly region: { readonly id: string; readonly name: string; readonly country: string } | null;
  readonly coastal: boolean;
};

/** What the ghost says before the click: `null` refusal is a point the server takes. */
export type AimVerdict = {
  readonly refusal:
    | { readonly code: 'NO_GROUND' }
    | { readonly code: Exclude<PlacementRefusal, 'TOO_CLOSE'> }
    | { readonly code: 'TOO_CLOSE'; readonly near: BuildingKey; readonly km: number }
    | null;
  /** Owed by the foundation **on this very point** — the debt names its deposit. */
  readonly free: boolean;
};

/** Every point a building of the player holds or is ordered on — what the spacing measures. */
const aroundOf = (view: PlayerView) => [
  ...view.me.buildings.map((building) => ({ key: building.key, lonLat: building.point })),
  ...pledgedBuildings(view),
];

/**
 * **A deposit nobody is known to work** — none of the player's own exploitations or orders on
 * it, and no surveyed exploitation of anybody else's (ADR 0029 §3: only an exploitation holds a
 * deposit). The server reads the very same entry at the order (`spotAt`); what the fog hides is
 * settled when the building would stand, and the holder becomes a survey.
 */
export function freeDeposits(view: PlayerView): ReadonlyArray<DepositPoint> {
  const held = depositHolders(view);
  return DEPOSIT_POINTS.filter((deposit) => !held.has(deposit.id));
}

/**
 * **Who is known to work each deposit** (map labels): mine, with the level standing (`null` while
 * only ordered), or a surveyed exploitation of anybody else's — its nation is not in the survey,
 * so the fog keeps it unsaid. A deposit absent from the map is free.
 */
export function depositHolders(
  view: PlayerView,
): ReadonlyMap<string, { readonly mine: boolean; readonly level: number | null }> {
  const holders = new Map<string, { mine: boolean; level: number | null }>();
  const take = (lonLat: LonLat, mine: boolean, level: number | null) => {
    const point = depositAt(lonLat);
    if (point !== null && !holders.has(point.id)) holders.set(point.id, { mine, level });
  };
  for (const building of view.me.buildings)
    if (EXPLOITED_DEPOSITS[building.key] !== undefined) take(building.point, true, building.level);
  for (const order of pledgedBuildings(view))
    if (EXPLOITED_DEPOSITS[order.key] !== undefined) take(order.lonLat, true, null);
  for (const seen of view.surveyedInstallations)
    if (EXPLOITED_DEPOSITS[seen.key] !== undefined) take(seen.point, false, null);
  return holders;
}

/** The player's standing outposts as the reach reads them. `reachKmOf` comes from the balance
 *  table (`convex/constants.ts`), which the pure domain may not import. */
export const reachesOf = (view: PlayerView, reachKmOf: (level: number) => number): Reach[] =>
  view.me.outposts
    .filter((outpost) => outpost.standsAt === null)
    .map((outpost) => ({
      id: outpost.id,
      lonLat: outpost.lonLat,
      reachKm: reachKmOf(outpost.level),
    }));

/**
 * **The placement rule, under the pointer** (ADR 0029). The facts are the view's and the map's;
 * the rule is `placementRefusal`, the very one `constructions.start` refuses with, so the ghost can
 * never offer a point the server sends back — save what the fog keeps from the player.
 */
export function aimVerdict(
  view: PlayerView,
  key: BuildingKey,
  aim: Aim,
  reaches: ReadonlyArray<Reach>,
): AimVerdict {
  const deposit = depositAt(aim.lonLat);
  const free = view.me.foundation.some((due) =>
    settlesDebt(due, { key, deposit: deposit?.deposit ?? null }),
  );
  if (aim.region === null) return { refusal: { code: 'NO_GROUND' }, free };
  const home = isNation(view.me.nation) ? ADM0_BY_NATION[view.me.nation] : null;
  const around = aroundOf(view);
  const spot = {
    reached: siteOfPoint(aim.lonLat, aim.region.country === home, reaches) !== null,
    deposit:
      deposit === null
        ? null
        : { key: deposit.deposit, taken: !freeDeposits(view).includes(deposit) },
    coastal: aim.coastal,
    nearest: nearestBuilding(aim.lonLat, around),
  };
  const refusal = placementRefusal(key, spot, view.me.hqLevel, view.buildCatalog[key].lockedBy);
  if (refusal === null) return { refusal: null, free };
  if (refusal === 'TOO_CLOSE' && spot.nearest !== null) {
    return {
      refusal: { code: 'TOO_CLOSE', near: spot.nearest.key, km: BUILDING_SPACING_KM },
      free,
    };
  }
  return { refusal: { code: refusal as Exclude<PlacementRefusal, 'TOO_CLOSE'> }, free };
}

/**
 * **Where the ghost leaps**: the closest of a list of points within `PLACING_SNAP_KM` of the
 * pointer, or the pointer itself.
 */
export function snapTo(pointer: LonLat, magnets: ReadonlyArray<LonLat>): LonLat {
  let best: LonLat = pointer;
  let bestKm = PLACING_SNAP_KM;
  for (const magnet of magnets) {
    const km = distanceKm(pointer, magnet);
    if (km <= bestKm) {
      best = magnet;
      bestKm = km;
    }
  }
  return best;
}

/**
 * Why **no point at all** takes a key — `null` when one may. Where the aim answers "not here",
 * this answers "nowhere yet", which is the only question the mobilisation order and the supply
 * chart ever ask: they name a building, never a ground.
 */
export type PlacementCondition =
  /** `card: null` — rien ne se pose avant le QG ; sinon la carte de recherche qui la tient. */
  | { readonly kind: 'locked'; readonly card: ResearchCard | null }
  | { readonly kind: 'deposit'; readonly deposits: ReadonlyArray<DepositKey> };

export type Placement = {
  readonly key: BuildingKey;
  /** `null` as soon as a point may take it. */
  readonly condition: PlacementCondition | null;
  /** Owed by the season's foundation: placed for nothing and standing at once. */
  readonly free: boolean;
};

/**
 * **Whether a key can go down anywhere at all.** A key a research card still holds names the
 * card; an exploitation with no free deposit of its kind in a region the player holds names the
 * deposit. Everything else is a matter of aiming.
 */
export function placementOf(
  view: PlayerView,
  key: BuildingKey,
  /** The deposits a debt of the foundation names, when it names one. */
  only?: ReadonlyArray<DepositKey>,
): Placement {
  const lockedBy = view.buildCatalog[key].lockedBy;
  const free = view.me.foundation.some((due) => due.key === key);
  const hqLevel = view.me.hqLevel;
  const impossible =
    !BUILDABLE_BUILDINGS.includes(key) ||
    (key === 'hq' ? hqLevel > 0 : hqLevel === 0) ||
    keyRefusal(key, hqLevel, lockedBy) !== null;
  if (impossible) {
    return { key, condition: { kind: 'locked', card: hqLevel === 0 ? null : lockedBy }, free };
  }
  const deposits = only ?? EXPLOITED_DEPOSITS[key];
  if (deposits === undefined) return { key, condition: null, free };
  const reachable = new Set(
    view.me.regions.filter((region) => region.site !== null).map((region) => region.id),
  );
  const open = freeDeposits(view).some(
    (deposit) => deposits.includes(deposit.deposit) && reachable.has(deposit.regionId),
  );
  return { key, condition: open ? null : { kind: 'deposit', deposits }, free };
}

/**
 * What holds a **raise** back, `null` when nothing does. Raising is not placing: the point is
 * already written and never moves (ADR 0029), so neither the spacing nor the deposit has anything
 * to say — which is why this reads the three refusals `constructions.start` can
 * still raise, and not `placementRefusal`.
 *
 * None of them is re-decided here. The queue and the headquarters ceiling arrive cooked in the
 * view (`me.construction`, `me.constructionQueue`, `building.cappedByHq`); the bill is the
 * served cost against the served stock. A fourth rule appearing in this function would mean the
 * view is short of a field — the answer is to serve it, never to guess it.
 */
export type UpgradeHold =
  /** An order already stands on this point — one entry per point, running or queued. */
  | { readonly kind: 'alreadyQueued' }
  | { readonly kind: 'cappedByHq' }
  | {
      readonly kind: 'materials';
      readonly resource: ResourceKey;
      readonly needed: number;
      readonly available: number;
    };

/**
 * When the missing matter will be there. **A refusal that counts is a wall; a refusal that
 * dates itself is a plan** — "il faut 72 de charbon (0 disponibles)" tells a player he has
 * lost, "disponible dans 4 h 20" tells him to come back.
 *
 * `never` is the one that earns its place. When nothing produces the matter — no mine, so no
 * coal, ever — a countdown would be a lie, and the honest sentence names the building to
 * raise. The ceiling counts as never too: a bill above what the warehouses can hold is not
 * waiting on time, it is waiting on a warehouse.
 */
export type Availability =
  | { readonly kind: 'now' }
  | { readonly kind: 'inMinutes'; readonly minutes: number }
  | { readonly kind: 'never' };

export function availabilityOf(needed: number, held: Resource, stock: number): Availability {
  if (stock >= needed) return { kind: 'now' };
  if (needed > held.cap || held.ratePerHour <= 0) return { kind: 'never' };
  return { kind: 'inMinutes', minutes: ((needed - stock) / held.ratePerHour) * 60 };
}

export function upgradeHold(building: Building, view: PlayerView, now: number): UpgradeHold | null {
  // A raise already queued on this very point is the one thing that still blocks a second
  // order there: the server allows one entry per point (`ALREADY_QUEUED_HERE`).
  if (pledgedBuildings(view).some((work) => samePoint(work.lonLat, building.point))) {
    return { kind: 'alreadyQueued' };
  }
  if (building.cappedByHq) return { kind: 'cappedByHq' };

  // The first shortfall in resource order, never a list: a bill is paid whole or not at all
  // (`debit` checks every cost before debiting any), so naming one is naming the blockage.
  for (const resource of RESOURCES) {
    const needed = building.nextLevelCost[resource] ?? 0;
    if (needed === 0) continue;
    const available = currentStock(view.me.resources[resource], view.loadedAt, now);
    if (available < needed) return { kind: 'materials', resource, needed, available };
  }
  return null;
}

/**
 * **Ce qui empêche de monter un avant-poste**, `null` quand rien ne l'empêche — la règle de la
 * précision du 15/09 (ADR 0020 §10), lue par les deux bouts : le bouton du panneau de garnison
 * et la mutation qui met en file. Deux copies auraient divergé, et la divergence aurait été un
 * bouton qui offre ce que le serveur refuse (ADR 0015 : rien n'est grisé, la phrase dit
 * pourquoi).
 *
 * Quatre, et pas une de plus : le niveau maximal, la désactivation — *on ne rénove pas sous le
 * feu* —, une élévation déjà en file sur ce point, et la facture. Aucune garnison n'est exigée
 * et aucun palier de quartier général : l'avant-poste est déjà debout, monter n'est pas poser.
 */
export type OutpostRaiseHold =
  | { readonly kind: 'maxLevel'; readonly maximum: number }
  | { readonly kind: 'disabled' }
  | { readonly kind: 'alreadyQueued' }
  | {
      readonly kind: 'materials';
      readonly resource: ResourceKey;
      readonly needed: number;
      readonly available: number;
    };

/** L'avant-poste tel que la règle le lit — jamais un document, jamais une vue : les deux bouts
 *  n'ont pas les mêmes en main, et ils doivent poser la même question. */
export type OutpostRaise = {
  readonly level: number;
  readonly disabled: boolean;
  /** Une élévation de **ce** point déjà payée et en file. Une seconde attendrait un niveau que
   *  la première n'a pas encore atteint, donc tarifé faux. */
  readonly queued: boolean;
  readonly stocks: Readonly<Record<ResourceKey, number>>;
};

export function outpostRaiseHold(
  outpost: OutpostRaise,
  cost: Cost,
  maximum: number,
): OutpostRaiseHold | null {
  if (outpost.level >= maximum) return { kind: 'maxLevel', maximum };
  if (outpost.disabled) return { kind: 'disabled' };
  if (outpost.queued) return { kind: 'alreadyQueued' };

  // Le premier manque dans l'ordre des ressources, jamais une liste : une facture se paie
  // entière ou pas du tout (`debit`), donc en nommer une est nommer le blocage.
  for (const resource of RESOURCES) {
    const needed = cost[resource] ?? 0;
    if (needed === 0) continue;
    const available = outpost.stocks[resource];
    if (available < needed) return { kind: 'materials', resource, needed, available };
  }
  return null;
}

/**
 * **Ce qui empêche de fonder**, `null` quand rien ne l'empêche (révision du 15/09 de l'ADR 0020
 * §10 : fonder se paie). La seule retenue qui vive ici est la facture — la composition de la
 * colonne et le sol sont l'affaire de `foundingRefusal`, que le serveur refuse avec —, et elle
 * est lue par les deux bouts : la rose n'offre pas la branche que `debit` refuserait.
 *
 * Même forme et même ordre que `outpostRaiseHold` : la première matière qui manque, jamais une
 * liste, parce qu'une facture se paie entière ou pas du tout.
 */
export function foundationHold(
  view: PlayerView,
  now: number,
): Extract<OutpostRaiseHold, { kind: 'materials' }> | null {
  for (const resource of RESOURCES) {
    const needed = view.outpostFoundation.cost[resource] ?? 0;
    if (needed === 0) continue;
    const available = currentStock(view.me.resources[resource], view.loadedAt, now);
    if (available < needed) return { kind: 'materials', resource, needed, available };
  }
  return null;
}

/** Les avant-postes qu'une élévation en file vise déjà — la lecture cliente de `queued`. */
export const pledgedOutposts = (view: PlayerView): ReadonlySet<string> =>
  new Set(pledgedWork(view).flatMap((work) => (work.outpostId === null ? [] : [work.outpostId])));

/**
 * **Ce qui empêche de raser**, `null` quand rien ne l'empêche (demande de Pierre, 15/09). Deux
 * empêchements et pas un de plus, lus par la rose et par la mutation — une seconde table aurait
 * offert une branche que le serveur refuse (ADR 0015).
 *
 * Le quartier général est le seul bâtiment qu'on ne rase pas : sa destruction serait une
 * révision de « jamais éliminé » (question 39), et elle n'est pas tranchée. Tout le reste part,
 * debout ou en cours d'élévation.
 *
 * **Rien ici ne parle d'une file de démolition** : raser est immédiat — il n'y a pas de chantier
 * à attendre, donc pas d'état « déjà en cours » à lire. Le jour où la démolition prendrait du
 * temps, c'est ici que la retenue viendrait.
 */
export type DemolitionRefusal = 'NOT_YOURS' | 'HQ_NEVER_DEMOLISHED';

/** Le bâtiment tel que la règle le lit — jamais un document, jamais une vue : les deux bouts
 *  n'ont pas les mêmes en main, et ils doivent poser la même question. */
export type Demolition = {
  readonly key: BuildingKey;
  /** Trouvé parmi les siens : un mât adverse relevé n'est pas un bâtiment qu'on rase. */
  readonly mine: boolean;
};

export const demolitionRefusalOf = (building: Demolition): DemolitionRefusal | null =>
  !building.mine ? 'NOT_YOURS' : building.key === 'hq' ? 'HQ_NEVER_DEMOLISHED' : null;

/**
 * **Ce qui empêche de démanteler son propre avant-poste** (décision de Pierre, 16/09), `null`
 * quand rien ne l'empêche. Deux empêchements, lus par la rose et par la mutation — une seconde
 * table aurait offert une branche que le serveur refuse (ADR 0015).
 *
 * **Un chantier n'en est pas un** : un point qui n'est pas encore debout se démantèle comme les
 * autres, et ce qui est en file s'annule selon la règle de la file. Ce qu'on retire là est une
 * promesse, pas une bâtisse.
 *
 * **Servir un mouvement retient, en revanche.** Un relais dans la portée duquel une colonne
 * marche a déjà payé son allure : le retirer sous ses pieds ferait bouger un horaire déjà
 * annoncé. C'est exactement la lecture qui scelle le métier du point (`specializationsServed`,
 * servie au client par `specializationLocked`), et il n'y en a pas deux.
 */
export type OutpostDismantleRefusal = 'NOT_YOURS' | 'OUTPOST_SERVING';

/** L'avant-poste tel que la règle le lit — jamais un document, jamais une vue : les deux bouts
 *  n'ont pas les mêmes en main, et ils doivent poser la même question. */
export type OutpostDismantle = {
  readonly mine: boolean;
  readonly serving: boolean;
};

export const outpostDismantleRefusalOf = (
  outpost: OutpostDismantle,
): OutpostDismantleRefusal | null =>
  !outpost.mine ? 'NOT_YOURS' : outpost.serving ? 'OUTPOST_SERVING' : null;

/**
 * **Ce que l'entrepôt rasé fait perdre, matière par matière** (5a : rien n'est rendu, et le
 * stock au-dessus du nouveau plafond est écrêté). Vide pour tout ce qui ne stocke pas — et
 * `depot` historique compte comme un entrepôt, comme partout ailleurs depuis le 09/09.
 *
 * La popin de confirmation le dit en chiffres avant le clic, et le serveur l'applique après
 * (`clipToStorage`) : c'est la même soustraction, jamais deux.
 */
export function demolitionClipping(
  building: Building,
  view: PlayerView,
  now: number,
): ReadonlyArray<{ readonly resource: ResourceKey; readonly lost: number }> {
  if (canonicalBuildingKey(building.key) !== 'warehouse') return [];
  return RESOURCES.flatMap((resource) => {
    const held = view.me.resources[resource];
    const stock = currentStock(held, view.loadedAt, now);
    const lost = stock - (held.cap - view.storageCapPerLevel * building.level);
    return lost > 0 ? [{ resource, lost }] : [];
  });
}

/**
 * **How far a site has risen, 0 to 1** — the share of its duration already spent. The view
 * serves only the minutes left; the duration is the scale's (`buildMinutes`), the same the
 * server dated the site by, so the share is read and not invented. Clamped: a site dated
 * under an older scale, or a clock a little ahead, never overflows.
 */
export const riseOf = (minutesLeft: number, totalMinutes: number): number =>
  totalMinutes <= 0 ? 1 : Math.min(1, Math.max(0, 1 - minutesLeft / totalMinutes));

/**
 * **A building site as the board stands it** (mode chantier): paid and waiting its turn — a
 * plan inked on the ground —, a first level rising, or a standing building raised a level. Only
 * the head of the queue is dated (`constructionQueue` carries no due time, and none is invented
 * here); a queued raise draws nothing, the building already stands. An outpost's works stay on
 * its own mast.
 */
export type WorkSite = {
  readonly phase: 'queued' | 'rising' | 'raising';
  readonly key: BuildingKey;
  readonly regionId: string;
  readonly regionName: string;
  /** Where the works stand (ADR 0029). */
  readonly point: LonLat | null;
  /** The level the works will stand at. */
  readonly level: number;
  /** Its place in the queue, 0 at the head. */
  readonly rank: number;
  readonly finishesAt: number | null;
  /** What the whole level lasts: the catalog's for a first level, the building's for a raise. */
  readonly minutes: number;
};

type RisingWork = Pick<
  NonNullable<PlayerView['me']['construction']>,
  'key' | 'outpostId' | 'point' | 'regionId' | 'regionName' | 'minutesLeft'
>;

export function workSitesOf(
  me: Pick<PlayerView['me'], 'buildings' | 'construction' | 'constructionQueue'>,
  catalog: Readonly<Record<BuildingKey, BuildSpec>>,
  loadedAt: number,
): WorkSite[] {
  const sites: WorkSite[] = [];
  /** Un chantier qui monte, sur n'importe laquelle des files de chantier (ADR 0031). */
  const rising = (work: RisingWork, rank: number) => {
    if (work.outpostId !== null || work.key === 'outpost') return;
    const key = work.key;
    const at = work.point;
    const standing =
      at === null
        ? undefined
        : me.buildings.find((building) => samePoint(building.point, at) && building.key === key);
    sites.push({
      phase: standing === undefined ? 'rising' : 'raising',
      key,
      regionId: work.regionId,
      regionName: work.regionName,
      point: work.point,
      level: standing === undefined ? 1 : standing.level + 1,
      rank,
      finishesAt: loadedAt + work.minutesLeft * 60_000,
      minutes: standing === undefined ? catalog[key].minutes : standing.nextLevelMinutes,
    });
  };
  if (me.construction !== null) rising(me.construction, 0);
  me.constructionQueue.forEach((queued, k) => {
    if (queued.minutesLeft != null) {
      rising({ ...queued, minutesLeft: queued.minutesLeft }, k + 1);
      return;
    }
    if (queued.outpostId !== null || queued.key === 'outpost' || queued.level !== 1) return;
    sites.push({
      phase: 'queued',
      key: queued.key,
      regionId: queued.regionId,
      regionName: queued.regionName,
      point: queued.point,
      level: 1,
      rank: k + 1,
      finishesAt: null,
      minutes: catalog[queued.key].minutes,
    });
  });
  return sites;
}

/**
 * **La file redatée** : pour chaque entrée dans l'ordre de la file (vrai = elle monte), celles qui
 * démarrent — les premières en attente, tant qu'une file est libre (ADR 0031 : une, deux avec
 * Chantier double). Les files ne rétrécissent jamais : une carte acquise le reste.
 */
export function lanesPlan(running: ReadonlyArray<boolean>, lanes: number): number[] {
  const rising = running.filter(Boolean).length;
  return running
    .map((_, index) => index)
    .filter((index) => !running[index])
    .slice(0, Math.max(0, lanes - rising));
}
