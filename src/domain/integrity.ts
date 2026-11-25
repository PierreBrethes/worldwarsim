import {
  BUILDING_DISABLED_HOURS,
  BUILDING_IMMUNITY_HOURS,
  DAMAGED_HOURS,
} from '../../convex/constants';
import type { BuildingKey } from './ids';
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

/** **Les dates que la vue sert à son propriétaire** (`integrity`, `restoresAt`), relues comme
 *  celles du serveur : l'écran pose la même question que la mutation, à la même fonction. */
export const servedDates = (building: {
  readonly integrity?: 'damaged' | 'disabled' | undefined;
  readonly restoresAt?: number | undefined;
}): IntegrityDates =>
  building.integrity === 'disabled'
    ? { disabledUntil: building.restoresAt }
    : building.integrity === 'damaged'
      ? { damagedUntil: building.restoresAt }
      : {};

/** Ses bâtiments tels que sa vue les sert, relus en dates (`servedDates`). */
export const servedBuildings = <
  B extends {
    readonly integrity?: 'damaged' | 'disabled' | undefined;
    readonly restoresAt?: number | undefined;
  },
>(
  buildings: ReadonlyArray<B>,
): Array<B & IntegrityDates> =>
  buildings.map((building) => ({ ...building, ...servedDates(building) }));

/**
 * **Son QG est désactivé** (ADR 0046 §8) : il ne lance plus de chantier ni de recherche, et ses
 * chantiers attendent son retour. Le sien seul : un QG pris à un autre ne tient pas sa file.
 */
export const hqDisabledAt = (
  buildings: ReadonlyArray<
    IntegrityDates & { readonly key: BuildingKey; readonly captured?: boolean | undefined }
  >,
  now: number,
): boolean =>
  buildings.some(
    (building) =>
      building.key === 'hq' &&
      building.captured !== true &&
      integrityOf(building, now) === 'disabled',
  );
