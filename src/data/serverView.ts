import type { FunctionReturnType } from 'convex/server';
import { api } from '../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import type { BuildingKey } from '@/domain/ids';
import { COUNTRY_BY_NATION, isNation } from '@/domain/nations';
import type { World } from '@/domain/world';
import { formatWindow } from '@/domain/rest-window';
import type { PlayerView } from '@/domain/player-view';

export type ServerView = FunctionReturnType<typeof api.view.playerView>;

export function adaptServerView(world: World, server: ServerView): PlayerView {
  const countryName = isNation(server.me.nation)
    ? COUNTRY_BY_NATION[server.me.nation]
    : server.me.nation;
  const homePosition = world.countries.find((country) => country.name === countryName)?.lonLat;
  if (!homePosition) throw new Error(`nation without a position: ${server.me.nation}`);

  return {
    season: server.season,
    me: {
      nation: server.me.nation,
      homePosition,
      ink: server.me.ink,
      power: isNation(server.me.nation) ? fr.nationPowers[server.me.nation] : '',
      doctrine: server.me.doctrine,
      progress: server.me.progress,
      restWindow: formatWindow(server.me.restWindow),
      resources: server.me.resources,
      slots: server.me.slots,
      hqLevel: server.me.hqLevel,
      buildingCap: server.me.buildingCap,
      buildings: server.me.buildings.map((building) => ({
        ...building,
        name: fr.buildings[building.key],
      })),
      regions: server.me.regions,
      // A deployment ahead of the client returns an object without this field. The adapter is
      // the only boundary: a version gap gets absorbed here, not in the panels, where an
      // `undefined` takes down the whole board.
      construction: server.me.construction
        ? {
            name:
              fr.buildings[server.me.construction.name as BuildingKey] ??
              server.me.construction.name,
            key: server.me.construction.key as BuildingKey,
            regionId: server.me.construction.regionId,
            regionName: server.me.construction.regionName,
            minutesLeft: server.me.construction.minutesLeft,
          }
        : null,
      armyPresent: server.me.armyPresent ?? {},
      armyInTransit: {},
      outposts: [],
    },
    buildCatalog: server.buildCatalog,
    arcs: [],
    journal: [],
    opponents: server.opponents.map((opponent) => ({
      nation: opponent.nation,
      ink: opponent.ink,
      power: isNation(opponent.nation) ? fr.nationPowers[opponent.nation] : '',
      bar: { state: 'anonymous', progress: 0 },
      restWindow: formatWindow(opponent.restWindow),
      lastIntel: opponent.lastIntel,
    })),
    coverage: { visible: 0, total: 0 },
    loadedAt: server.loadedAt,
  };
}
