import { UPKEEP_STEPS, UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../convex/constants';

/**
 * **Ce que l'armée coûte en vivres par heure, par paliers** (ADR 0028 §2). Chaque troupe paie le
 * tarif de son rang : la onzième passe au palier suivant, comme une tranche d'impôt, sans que les
 * dix premières ne changent. Hors ancrage, une troupe paie le double (`isAnchored`).
 *
 * Les troupes ravitaillées prennent les premiers rangs et celles hors ancrage les derniers : le
 * total ne dépend alors d'aucun ordre de lecture, et envoyer la dernière recrue au loin est ce
 * qui coûte, pas une vieille garnison qu'on n'a pas bougée.
 */
const cumulative = (troops: number): number => {
  let total = 0;
  let from = 0;
  for (const { upTo, rate } of UPKEEP_STEPS) {
    if (troops <= from) break;
    total += (Math.min(troops, upTo) - from) * rate;
    from = upTo;
  }
  return total;
};

export const armyUpkeep = (
  plain: number,
  unsupplied: number,
  multiplier = UPKEEP_UNSUPPLIED_MULTIPLIER,
): number => cumulative(plain) + multiplier * (cumulative(plain + unsupplied) - cumulative(plain));

/**
 * Le palier de la prochaine troupe, quand on en tient déjà `troops` : ce qu'elle paiera, et où
 * commence le palier d'après — la lecture qui rend le prix de l'armée lisible avant de former.
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
