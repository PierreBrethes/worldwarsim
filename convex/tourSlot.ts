import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { homeCountryOf, regionFacts } from './regions';
import { tourHoldsSlot } from '../src/domain/tour-slot';

type StoredStop = NonNullable<Doc<'troops'>['tour']>['stops'][number];

/** **Le pays où se tient une adresse** (un bâtiment ou un avant-poste), `null` s'il n'en reste rien
 *  ou si ce n'est qu'un point : le sol se lit par la géographie de la région. */
async function countryOfAddress(ctx: QueryCtx, address: string): Promise<string | null> {
  const buildingId = ctx.db.normalizeId('buildings', address);
  const building = buildingId === null ? null : await ctx.db.get(buildingId);
  if (building !== null) return regionFacts(building.regionId)?.country ?? null;
  const outpostId = ctx.db.normalizeId('outposts', address);
  const outpost = outpostId === null ? null : await ctx.db.get(outpostId);
  return outpost?.hostCountry ?? null;
}

/**
 * **Cette tournée prend-elle un slot ?** (ADR 0028 §4, #618) : la même fonction que la feuille de
 * route (`tourHoldsSlot`), sur le pays du point de chargement et de chaque arrêt. Lue à chaque
 * décompte, jamais stockée : la carte peut changer sous une tournée longue.
 */
export async function tourHoldsSlotFor(
  ctx: QueryCtx,
  player: Doc<'players'>,
  base: Doc<'troops'>['stationedAt'],
  stops: ReadonlyArray<StoredStop>,
): Promise<boolean> {
  const addresses: string[] = [
    ...(typeof base === 'string' ? [base] : []),
    ...stops.map((stop) => (typeof stop === 'string' ? stop : stop.id)),
  ];
  const countries = await Promise.all(addresses.map((address) => countryOfAddress(ctx, address)));
  const unplaced = typeof base === 'string' ? [] : [null];
  return tourHoldsSlot([...unplaced, ...countries], homeCountryOf(player.nation));
}
