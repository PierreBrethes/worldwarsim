import type { BotWorld } from './bot';

/** La géographie qu'une vue faite à la main n'exerce pas : un monde de terre, sans voisin ni route. */
export const noGeography: Pick<
  BotWorld,
  'groundAt' | 'coastalAt' | 'walkableAt' | 'landRoute' | 'regions' | 'nearestRegionId'
> = {
  groundAt: () => 'land',
  coastalAt: () => false,
  walkableAt: () => true,
  landRoute: () => null,
  regions: [],
  nearestRegionId: () => null,
};
