import {
  BUILDING_DISABLED_HOURS,
  BUILDING_IMMUNITY_HOURS,
  DAMAGED_HOURS,
} from '../../convex/constants';
import { inService } from './loot';

/**
 * **Trois états, aucun nombre** (ADR 0046 §1). Un bâtiment est intact, endommagé ou désactivé, et
 * l'état se lit de ses dates : `disabledUntil`, celle du sabotage, est le seul « désactivé » du jeu.
 */
export type Integrity = 'intact' | 'damaged' | 'disabled';

export type IntegrityDates = {
  readonly disabledUntil?: number | null | undefined;
  readonly damagedUntil?: number | null | undefined;
  readonly immuneUntil?: number | null | undefined;
};

const HOUR = 3_600_000;

export function integrityOf(building: IntegrityDates, now: number): Integrity {
  if (!inService(building.disabledUntil, now)) return 'disabled';
  return building.damagedUntil != null && building.damagedUntil >= now ? 'damaged' : 'intact';
}

/** L'heure où il revient intact ; `null` s'il l'est. */
export function restoresAtOf(building: IntegrityDates, now: number): number | null {
  switch (integrityOf(building, now)) {
    case 'disabled':
      return building.disabledUntil!;
    case 'damaged':
      return building.damagedUntil!;
    case 'intact':
      return null;
  }
}

/**
 * **À l'abri** (ADR 0046 §5) : l'abri suit le rétablissement, donc seul un bâtiment intact l'a.
 * Endommagé, la même date le couvre déjà, et un second coup doit pouvoir le désactiver.
 */
export const shelteredFromStrike = (building: IntegrityDates, now: number): boolean =>
  integrityOf(building, now) === 'intact' &&
  building.immuneUntil != null &&
  building.immuneUntil >= now;

/** Le sabotage et la frappe désactivent par les mêmes dates. */
export const disablingOf = (now: number) => {
  const disabledUntil = now + BUILDING_DISABLED_HOURS * HOUR;
  return { disabledUntil, immuneUntil: disabledUntil + BUILDING_IMMUNITY_HOURS * HOUR };
};

/**
 * **Un coup retire un cran** (ADR 0046 §4) : intact devient endommagé, endommagé devient désactivé
 * (et le dommage, que le désactivé couvre, s'efface). Un désactivé n'a plus de cran : `null`.
 */
export function struckOf(
  building: IntegrityDates,
  now: number,
):
  | { readonly damagedUntil: number; readonly immuneUntil: number }
  | {
      readonly damagedUntil: undefined;
      readonly disabledUntil: number;
      readonly immuneUntil: number;
    }
  | null {
  switch (integrityOf(building, now)) {
    case 'intact': {
      const damagedUntil = now + DAMAGED_HOURS * HOUR;
      return { damagedUntil, immuneUntil: damagedUntil + BUILDING_IMMUNITY_HOURS * HOUR };
    }
    case 'damaged':
      return { damagedUntil: undefined, ...disablingOf(now) };
    case 'disabled':
      return null;
  }
}
