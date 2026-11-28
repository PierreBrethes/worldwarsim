import type { BotWorld } from './bot';

/** La géographie qu'une vue faite à la main n'exerce pas : un monde de terre, sans voisin ni route. */
export const noGeography: Pick<
  BotWorld,
  | 'groundAt'
  | 'coastalAt'
  | 'walkableAt'
  | 'landRoute'
  | 'landRouteToNearest'
  | 'regions'
  | 'nearestRegionId'
  | 'coastNear'
> = {
  groundAt: () => 'land',
  coastalAt: () => false,
  walkableAt: () => true,
  landRoute: () => null,
  landRouteToNearest: (_from, to) => ({ km: null, blocked: to.map((_, index) => index) }),
  regions: [],
  nearestRegionId: () => null,
  coastNear: () => null,
};
