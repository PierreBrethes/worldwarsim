import { BASE_CAP, DAKAR_SPARED_PER_RESOURCE } from '../../convex/constants';
import { EXPLOITED_DEPOSITS } from './economy';
import type { SeasonMode } from './season-mode';
import {
  canonicalBuildingKey,
  RESOURCES,
  type BuildingKey,
  type ResourceKey,
  type UnitRole,
} from './ids';

export type ResourceAmounts = Readonly<Record<ResourceKey, number>>;

export type LootCarrier = {
  readonly role: UnitRole;
  readonly strength: number;
  readonly nominalStrength: number;
};

export function carryCapacityOf(
  troops: ReadonlyArray<LootCarrier>,
  capacityByRole: Readonly<Record<UnitRole, number>>,
): number {
  return troops.reduce((total, troop) => {
    if (troop.nominalStrength <= 0) return total;
    const strengthRatio = Math.min(1, Math.max(0, troop.strength / troop.nominalStrength));
    return total + Math.max(0, capacityByRole[troop.role]) * strengthRatio;
  }, 0);
}

export const emptyAmounts = (): Record<ResourceKey, number> =>
  Object.fromEntries(RESOURCES.map((key) => [key, 0])) as Record<ResourceKey, number>;

/** A raided site is out of service until its date has passed: the one bound every reading uses. */
export const inService = (disabledUntil: number | null | undefined, now: number): boolean =>
  disabledUntil == null || disabledUntil < now;

/**
 * **A raid on a warehouse loots it; on any other site, it sabotages it** (`completePresence`). In a
 * Mondiale an exploitation loots too: it carries its heap off (ADR 0041 §4).
 */
export const raidLoots = (key: BuildingKey, mode: SeasonMode): boolean =>
  raidsStock(key) || (mode === 'mondiale' && EXPLOITED_DEPOSITS[key] !== undefined);

/** **A warehouse is looted from the national stock** (surplus above the spared floor). */
export const raidsStock = (key: BuildingKey): boolean => canonicalBuildingKey(key) === 'warehouse';

/** **What a raid carries off a heap**: whole units, in the room the column has left. The rest stays
 *  at the heap, and no spared floor applies (that one is the national stock's). */
export function lootFromHeap(
  heap: { readonly resource: ResourceKey; readonly amount: number },
  room: number,
): Record<ResourceKey, number> {
  const loot = emptyAmounts();
  loot[heap.resource] = Math.max(0, Math.floor(Math.min(heap.amount, room)));
  return loot;
}

/** **A column that carries nothing** (`CargoView`): what my arcs are served without a cargo. */
export const emptyCargo = () => ({ loot: emptyAmounts(), carried: 0, capacity: 0, free: 0 });

export const difference = (
  before: ResourceAmounts,
  after: ResourceAmounts,
): Record<ResourceKey, number> =>
  Object.fromEntries(
    RESOURCES.map((key) => [key, Math.max(0, before[key] - after[key])]),
  ) as Record<ResourceKey, number>;

export const hasLoot = (loot: ResourceAmounts): boolean => RESOURCES.some((key) => loot[key] > 0);

export const amountTotal = (amounts: ResourceAmounts): number =>
  RESOURCES.reduce((sum, key) => sum + amounts[key], 0);

/**
 * Shares one total limit without rounding each resource independently. The last positive entry
 * receives only the remainder still available, so floating-point residue can lower the total but
 * can never create cargo or exceed an input amount.
 */
function proportionalShare(
  available: ResourceAmounts,
  capacity: number,
): Record<ResourceKey, number> {
  const result = emptyAmounts();
  const positive = RESOURCES.filter((key) => available[key] > 0);
  const total = positive.reduce((sum, key) => sum + available[key], 0);
  const target = Math.min(total, Math.max(0, capacity));
  if (target <= 0 || total <= 0) return result;
  if (target === total) {
    for (const key of positive) result[key] = available[key];
    return result;
  }

  const last = positive.at(-1);
  let assigned = 0;
  for (const key of positive) {
    const share =
      key === last
        ? Math.min(available[key], Math.max(0, target - assigned))
        : Math.min(available[key], (available[key] / total) * target);
    result[key] = share;
    assigned += share;
  }
  return result;
}

/**
 * **Ce qu'un pillage laisse par ressource** (Dakar, ADR 0032) : le plancher de base, relevé pour le
 * teneur du point. La seule lecture : le pilleur la lit avant l'ordre (`surveyedInstallations`),
 * le serveur l'applique à l'arrivée (`completePresence`).
 */
export const sparedPerResourceOf = (holdsDakar: boolean): number =>
  holdsDakar ? DAKAR_SPARED_PER_RESOURCE : BASE_CAP;

export function lootFromSurplus(
  stocks: ResourceAmounts,
  baseCap: number,
  capacity: number,
): Record<ResourceKey, number> {
  const surplus = emptyAmounts();
  for (const key of RESOURCES) surplus[key] = Math.max(0, stocks[key] - baseCap);
  return proportionalShare(surplus, capacity);
}

export const trimLootToCapacity = (
  loot: ResourceAmounts,
  capacity: number,
): Record<ResourceKey, number> => proportionalShare(loot, capacity);
