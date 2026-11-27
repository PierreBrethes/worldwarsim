import { countryLabel, fr, nationLabel } from '@/i18n/fr';
import { asPressDate } from '@/domain/duration';
import type { DepositKey } from '@/domain/ids';
import { DEPOSIT_POINTS, type HoveredRegion } from '@/domain/world';
import type { RegionHolding } from './GroundPanel';

/** What the strip writes of the ground under the pointer. */
export type CursorReading = {
  /** The region when the layer is there, else the country. */
  readonly place: string;
  /** The region's country, to tell two « Córdoba » apart; `null` when the place is the country. */
  readonly country: string | null;
  /** Who holds the region, as the player knows it (`control.held`), or `null`. */
  readonly held: string | null;
  /** The deposits the ground holds: geology is public (decision 65a). */
  readonly deposits: ReadonlyArray<string>;
};

/**
 * **Le sol sous le curseur, dit à la barrette** (#721) : le nom de la région, et ce que le joueur a
 * le droit d'en savoir. Les mêmes sources que la fiche du sol (`GroundPanel`) — `control.held` pour
 * le tenant, l'asset pour les gisements — donc les deux ne peuvent pas se contredire. Une région
 * d'un autre pays que celui qu'annonce la carte est écartée, comme la fiche le fait. En mer, rien.
 */
export function cursorReading({
  region,
  country,
  holding,
  deposits,
}: {
  region: HoveredRegion | null;
  country: string | null;
  holding: RegionHolding | null;
  deposits: ReadonlyArray<DepositKey>;
}): CursorReading | null {
  const adm0 = region?.country ?? country;
  if (adm0 === null) return null;
  const shown = region !== null && (country === null || region.country === country) ? region : null;
  if (shown === null)
    return { place: countryLabel(country ?? adm0), country: null, held: null, deposits: [] };
  return {
    place: shown.name,
    country: countryLabel(shown.country),
    held:
      holding === null
        ? null
        : holding.state === 'current'
          ? fr.placeStrip.heldBy(nationLabel(holding.nation))
          : fr.placeStrip.heldBy(
              fr.selectedCountry.heldBySurveyed(
                nationLabel(holding.nation),
                asPressDate(holding.seenAt),
              ),
            ),
    deposits: deposits.map((deposit) => fr.deposits[deposit]),
  };
}

const DEPOSITS_BY_REGION = new Map<string, DepositKey[]>();
for (const { regionId, deposit } of DEPOSIT_POINTS) {
  const held = DEPOSITS_BY_REGION.get(regionId) ?? [];
  if (!held.includes(deposit)) DEPOSITS_BY_REGION.set(regionId, [...held, deposit]);
}

/** The deposits one region holds, each kind once. */
export const depositsInRegion = (regionId: string): ReadonlyArray<DepositKey> =>
  DEPOSITS_BY_REGION.get(regionId) ?? [];
