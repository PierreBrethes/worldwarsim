import { outOfRounds, topUp, type SupplyStocks } from './supplies';
import { carryCapacityOf } from './loot';
import { CARRY_CAPACITY_BY_ROLE } from '../../convex/constants';
import { captureRate } from './capture';
import { emptyLoad, isAirStop } from './logistics';
import { marchingTroopIds, PROJECTION_BY_DOMAIN, type MarchStation } from './troops';
import { playedTheatre } from './theatres';
import type { PlayerView } from './player-view';
import type { Column } from './movement-orders';

/**
 * A column composed and armed, waiting for an aim. `rule` is the shape the shared legality
 * function reads — built once here so the fan does not rebuild it on every hover.
 */
export type ArmedColumn = {
  /** The address the widget and the garrison panel select on — and the one the order leaves
   *  from, since ADR 0019 §1 made them the same thing. */
  readonly station: MarchStation;
  readonly troopIds: ReadonlyArray<string>;
  readonly rule: Column;
};

/**
 * **Ce que des troupes peuvent encore charger**, leur charge en cours déduite : le seul chiffre
 * qui décide si « ramasser » existe. `carryCapacityOf` est la fonction que le serveur mesure avec
 * (`convex/cargo.ts`) — une seconde table de ce qui tient à bord serait exactement la divergence
 * que l'ADR 0015 interdit à la rose.
 */
export function freeCapacityOf(view: PlayerView, troopIds: ReadonlyArray<string>): number {
  const picked = new Set(troopIds);
  const capacity = carryCapacityOf(
    view.me.troops.filter((troop) => picked.has(troop.id)),
    CARRY_CAPACITY_BY_ROLE,
  );
  const carried = view.me.stationedCargo
    .filter((group) => group.troopIds.some((troopId) => picked.has(troopId)))
    .reduce((total, group) => total + group.cargo.carried, 0);
  return Math.max(0, capacity - carried);
}

export function armedColumn(
  view: PlayerView,
  station: MarchStation,
  troopIds: ReadonlyArray<string>,
): ArmedColumn {
  const troops = troopIds.flatMap((troopId) => {
    const troop = view.me.troops.find((candidate) => candidate.id === troopId);
    return troop ? [troop] : [];
  });
  const roles = troops.map((troop) => troop.role);
  const departure =
    station.kind === 'building'
      ? view.me.buildings.find((building) => building.id === station.buildingId)
      : undefined;
  const outpost =
    station.kind === 'outpost'
      ? view.me.outposts.find((candidate) => candidate.id === station.outpostId)
      : undefined;
  return {
    station,
    troopIds,
    rule: {
      roles,
      myRegionIds: new Set(view.me.buildings.map((building) => building.regionId)),
      myOutpostIds: new Set(view.me.outposts.map((outpost) => outpost.id)),
      /** An outpost and a plain point carry no region, so a column standing on one finds no gate
       *  under it and walks — which is the whole of what ADR 0013 still forbids (ADR 0019 §2). */
      departureBuildings: new Set([
        ...(departure === undefined
          ? []
          : view.me.buildings
              .filter((building) => building.regionId === departure.regionId)
              .map((building) => building.key)),
        /** **L'escale aérienne** (ADR 0028 §5), comme `departureOf` la lit. */
        ...(outpost !== undefined && isAirStop(outpost.level) ? [PROJECTION_BY_DOMAIN.air] : []),
      ]),
      /** Servi avec l'adresse et lu sur la grille de routage, jamais déduit de `country` : le
       *  polygone dit « terre » sur des rivages que la grille tient pour de l'eau, et c'est la
       *  grille qui a accepté la visée. Rien n'est recalculé ici — une seconde géométrie côté
       *  client est une seconde réponse. */
      afloat: station.kind === 'point' && station.afloat,
      /** Servi avec l'adresse, jamais recalculé ici — même raison que `afloat` juste au-dessus,
       *  et c'est la grille de routage du serveur qui l'a lu (ADR 0019 §2, révision du 04/09). */
      coastal: station.kind === 'point' ? station.coastal : (outpost?.coastal ?? false),
      captureRate: captureRate(troops),
      ...roundsOf(view, troops),
      ...blitzOf(view, troops),
    },
  };
}

/** **La même lecture que `columnOf` après la recharge du départ** (ADR 0028 §3) : une troupe
 *  ancrée reprend ses coups à son ancre — le plateau personnel, ou le dépôt de l'avant-poste —
 *  avant que l'ordre ne les lise. */
function roundsOf(view: PlayerView, troops: ReadonlyArray<PlayerView['me']['troops'][number]>) {
  if (view.mode === 'blitz') return {};
  const marching = marchingTroopIds(view.arcs);
  const stock = (key: keyof SupplyStocks) => view.me.resources[key]?.stock ?? 0;
  const board = { ammunition: stock('ammunition'), oil: stock('oil'), coal: stock('coal') };
  const stores = new Set(troops.map((troop) => troop.depotId));
  const supplies = new Map(
    [...stores].flatMap((store) => [
      ...topUp(
        troops
          .filter((troop) => troop.depotId === store)
          .map((troop) => ({
            ...troop.supplies,
            id: troop.id,
            role: troop.role,
            anchored: troop.supplied && !marching.has(troop.id),
          })),
        store === undefined
          ? board
          : (view.me.outposts.find((outpost) => outpost.id === store)?.depot ?? emptyLoad()),
      ).supplies,
    ]),
  );
  const after = troops.map((troop) => ({
    role: troop.role,
    ...(supplies.get(troop.id) ?? troop.supplies),
  }));
  return outOfRounds(after) ? { outOfRounds: true } : {};
}

/** **La même lecture que `columnOf`** côté serveur (lot 5) : le théâtre, le rechargement, et mes
 *  bâtiments déjà tenus par une troupe posée. */
function blitzOf(view: PlayerView, troops: ReadonlyArray<PlayerView['me']['troops'][number]>) {
  const theatre = playedTheatre(view);
  if (theatre === null) return {};
  const marching = marchingTroopIds(view.arcs);
  const leaving = new Set(troops.map((troop) => troop.id));
  const now = Date.now();
  return {
    blitz: {
      theatre,
      reloading: troops.some((troop) => (troop.reloadUntil ?? 0) > now),
      occupiedBuildingIds: new Set(
        view.me.troops.flatMap((troop) =>
          troop.stationedAt.kind === 'building' && !marching.has(troop.id) && !leaving.has(troop.id)
            ? [troop.stationedAt.buildingId]
            : [],
        ),
      ),
    },
  };
}
