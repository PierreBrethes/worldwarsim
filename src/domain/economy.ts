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
  | 'REGION_TAKEN'
  | 'BUILDING_CAP_REACHED'
  | 'DEPOSIT_REQUIRED'
  | 'NOT_COASTAL';

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
};

/**
 * Refusals are ordered from the most local to the most general, because that is the order in
 * which they are actionable: a taken region names another region to aim at, a reached ceiling
 * names the headquarters to raise.
 */
export function placementRefusal(
  key: BuildingKey,
  region: { readonly deposit: DepositKey | null; readonly coastal: boolean },
  holdings: Holdings,
): PlacementRefusal | null {
  const raising = holdings.onRegion === key;
  if (holdings.onRegion !== null && !raising) return 'REGION_TAKEN';
  if (!raising && holdings.standing >= holdings.cap) return 'BUILDING_CAP_REACHED';
  if (EXPLOITED_DEPOSITS[key] && !exploits(key, region.deposit)) return 'DEPOSIT_REQUIRED';
  if (key === 'port' && !region.coastal) return 'NOT_COASTAL';
  return null;
}

/** A transformation, as the settlement reads it: what one unit of output costs in inputs, and
 *  how many units an hour the building can push through. */
export type Conversion = {
  readonly output: ResourceKey;
  readonly inputs: ReadonlyArray<readonly [ResourceKey, number]>;
  readonly perHour: number;
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
}): Record<ResourceKey, number> {
  const elapsed = Math.max(0, hours);
  const settled = emptyStocks();
  for (const key of RESOURCES) {
    settled[key] = Math.min(cap[key], stocks[key] + ratePerHour[key] * elapsed);
  }

  for (const conversion of conversions) {
    const room = cap[conversion.output] - settled[conversion.output];
    if (room <= 0) continue;
    const affordable = conversion.inputs.reduce(
      (limit, [key, quantity]) => Math.min(limit, settled[key] / quantity),
      conversion.perHour * elapsed,
    );
    const made = Math.max(0, Math.min(room, affordable));
    if (made === 0) continue;
    for (const [key, quantity] of conversion.inputs) settled[key] -= made * quantity;
    settled[conversion.output] += made;
  }

  return settled;
}
