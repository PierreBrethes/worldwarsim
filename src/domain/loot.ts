import { BASE_CAP, DAKAR_SPARED_PER_RESOURCE } from '../../convex/constants';
import { RESOURCES, type ResourceKey, type UnitRole } from './ids';

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
