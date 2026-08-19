import type { FunctionReturnType } from 'convex/server';
import { api } from '../../convex/_generated/api';
import { formatOf, tier2HqLevel } from '../../convex/constants';
import { fr } from '@/i18n/fr';
import type { BuildingKey } from '@/domain/ids';
import { COUNTRY_BY_NATION, isNation } from '@/domain/nations';
import type { World } from '@/domain/world';
import { combatDispatches } from '@/domain/journal';
import { formatWindow } from '@/domain/rest-window';
import type { ArcView, PlayerView, Stack } from '@/domain/player-view';
import type { ComputedRoute, RouteMode } from '@/domain/routing';
import type { UnitRole } from '@/domain/ids';

export type ServerView = FunctionReturnType<typeof api.view.playerView>;

/** What the aiming card reads. `null` is an unreachable target, never an error. */
export type MovementPreviewed = FunctionReturnType<typeof api.movements.preview>;

export function adaptServerView(world: World, server: ServerView): PlayerView {
  const countryName = isNation(server.me.nation)
    ? COUNTRY_BY_NATION[server.me.nation]
    : server.me.nation;
  const homePosition = world.countries.find((country) => country.name === countryName)?.lonLat;
  if (!homePosition) throw new Error(`nation without a position: ${server.me.nation}`);

  return {
    // Same absorption as `construction` below: a deployment one version behind answers without
    // a format, and every screen that reads the format table would then index it with
    // `undefined` — a crash on opening a window, half an hour from its cause.
    season: {
      ...server.season,
      format: server.season.format ?? formatOf(server.season.durationHours),
      // A deployment one version behind knows no test victory: an empty board rather than an
      // `undefined` the journal would then index into.
      reduction: server.season.reduction ?? {
        target: 1,
        concludedAt: null,
        winnerNation: null,
        standings: [],
      },
    },
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
      tier2HqLevel:
        server.me.tier2HqLevel ??
        tier2HqLevel(server.season.format ?? formatOf(server.season.durationHours)),
      foundation: server.me.foundation ?? [],
      buildings: server.me.buildings.map((building) => ({
        ...building,
        name: fr.buildings[building.key],
      })),
      chains: server.me.chains,
      extraction: server.me.extraction,
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
      troopCap: server.me.troopCap,
      /** A deployment one version behind knows no upkeep: a troop without the field is one
       *  nobody charges extra for, and a nation without the line is one holding nothing. */
      troops: server.me.troops.map((troop) => ({ ...troop, supplied: troop.supplied ?? true })),
      upkeep: server.me.upkeep ?? { troops: 0, unsupplied: 0, foodPerHour: 0 },
      starving: server.me.starving ?? false,
      // A deployment one version behind knows nothing of a raid, and an outpost without the
      // field is an outpost that is standing — the adapter is where that gap is absorbed.
      outposts: server.me.outposts.map((outpost) => ({
        ...outpost,
        disabledMinutesLeft: outpost.disabledMinutesLeft ?? null,
        level: outpost.level ?? 1,
      })),
    },
    buildCatalog: server.buildCatalog,
    arcs: (server.movements ?? []).map(asArc),
    journal: combatDispatches(server.reports ?? [], server.season.reduction ?? null),
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

/**
 * A movement of mine becomes an arc **in the `mine` state and no other**: the union is what
 * guarantees the fog here — an arc built from this function structurally carries a type and a
 * stack because it is the player's own, and nothing in the server's answer could turn it into a
 * detected one by accident (ADR 0005, convention §8).
 *
 * `progress` is the share of the trip already walked at the instant the view was loaded; the map
 * and the widget advance it from there against their own clock. `borderWait` is served as an
 * instant and travels as a countdown, like every other due time on the board.
 */
function asArc(movement: NonNullable<ServerView['movements']>[number]): ArcView {
  const departed = movement.arrivesAt - movement.departedAt;
  const now = Date.now();
  return {
    state: 'mine',
    id: movement.id,
    from: [movement.from.lon, movement.from.lat],
    to: [movement.to.lon, movement.to.lat],
    route: routeOf(movement),
    originCountry: movement.originCountry,
    destinationCountry: movement.destinationCountry,
    originLabel: movement.originName,
    destinationLabel: movement.destinationName,
    type: movement.type,
    stack: stackOf(movement.roles as ReadonlyArray<UnitRole>),
    troopIds: movement.troopIds,
    minutesLeft: Math.max(0, (movement.arrivesAt - now) / 60_000),
    borderWait:
      movement.holdUntil === null
        ? null
        : { resolutionInMinutes: Math.max(0, (movement.holdUntil - now) / 60_000) },
    progress: departed <= 0 ? 1 : Math.min(1, Math.max(0, (now - movement.departedAt) / departed)),
  };
}

/** The route as the thread reads it. The mode is derived rather than stored: it is a reading of
 *  the legs, and a stored copy of a reading is one more thing that can disagree with them. */
function routeOf(movement: NonNullable<ServerView['movements']>[number]): ComputedRoute {
  const legs = movement.legs.map((leg) => ({
    medium: leg.medium,
    distanceUnits: leg.distanceUnits,
  }));
  const mode: RouteMode =
    legs.length > 1
      ? 'combined'
      : legs[0]?.medium === 'sea'
        ? 'naval'
        : legs[0]?.medium === 'air'
          ? 'air'
          : 'land';
  return {
    mode,
    points: movement.points.map((point) => [point.lon, point.lat] as [number, number]),
    distanceUnits: movement.distanceUnits,
    costUnits: movement.costUnits,
    legs,
  };
}

const stackOf = (roles: ReadonlyArray<UnitRole>): Stack =>
  roles.reduce<Record<string, number>>(
    (counted, role) => ({ ...counted, [role]: (counted[role] ?? 0) + 1 }),
    {},
  );
