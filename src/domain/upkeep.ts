import { UPKEEP_STEPS, UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../convex/constants';

/** Food an hour for the first `troops` ranks of the army, each rank at its step's rate. */
export const cumulative = (troops: number): number => {
  let total = 0;
  let from = 0;
  for (const { upTo, rate } of UPKEEP_STEPS) {
    if (troops <= from) break;
    total += (Math.min(troops, upTo) - from) * rate;
    from = upTo;
  }
  return total;
};

/**
 * **What the army eats an hour, by steps** (ADR 0028 §2). Each troop pays the rate of its rank:
 * the eleventh moves to the next step, like a tax bracket, without the first ten changing.
 * Outside every anchor (`isAnchored`) a troop pays double.
 *
 * The supplied troops take the first ranks and the unanchored ones the last, so the total
 * depends on no reading order, and it is the last recruit sent far away that costs, not an old
 * garrison nobody moved.
 */
export const armyUpkeep = (
  plain: number,
  unsupplied: number,
  multiplier = UPKEEP_UNSUPPLIED_MULTIPLIER,
): number => cumulative(plain) + multiplier * (cumulative(plain + unsupplied) - cumulative(plain));

/**
 * The step of the next troop when `troops` are already held: what it will pay, and where the
 * following step begins. It is what makes the price of an army readable before forming.
 */
export function upkeepStep(troops: number): {
  readonly rate: number;
  readonly nextAt: number | null;
  readonly nextRate: number | null;
} {
  const index = UPKEEP_STEPS.findIndex(({ upTo }) => troops < upTo);
  const step = UPKEEP_STEPS[index]!;
  const next = UPKEEP_STEPS[index + 1];
  return {
    rate: step.rate,
    nextAt: next === undefined ? null : step.upTo + 1,
    nextRate: next?.rate ?? null,
  };
}
