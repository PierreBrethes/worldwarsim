import type { FunctionReturnType } from 'convex/server';
import { api } from '../../convex/_generated/api';
import { TIER_2_HQ_LEVEL } from '../../convex/constants';
import { fr } from '@/i18n/fr';
import { RESOURCES, type BuildingKey, type UnitRole } from '@/domain/ids';
import { COUNTRY_BY_NATION, isNation } from '@/domain/nations';
import type { World } from '@/domain/world';
import { journalDispatches } from '@/domain/journal';
import { formatWindow, toLocalMinutes, type TimeWindow } from '@/domain/rest-window';
import { arcTiming } from '@/domain/arc-timing';
import type { LonLat } from '@/domain/geo';
import type { ArcView, Notice, PlayerView, Stack } from '@/domain/player-view';
import type { ComputedRoute, RouteMode } from '@/domain/routing';
import { COST_BY_MEDIUM } from '@/domain/routing';

export type ServerView = FunctionReturnType<typeof api.view.playerView>;

/** What the aiming card reads. `null` is an unreachable target, never an error. */
export type MovementPreviewed = FunctionReturnType<typeof api.movements.preview>;
export type PlunderPreviewed = FunctionReturnType<typeof api.movements.previewPlunder>;
export type LootCollectionPreviewed = FunctionReturnType<
  typeof api.movements.previewLootCollection
>;

export function adaptServerView(world: World, server: ServerView): PlayerView {
  const countryName = isNation(server.me.nation)
    ? COUNTRY_BY_NATION[server.me.nation]
    : server.me.nation;
  const homePosition = world.countries.find((country) => country.name === countryName)?.lonLat;
  if (!homePosition) throw new Error(`nation without a position: ${server.me.nation}`);

  return {
    season: {
      ...server.season,
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
      creator: server.me.creator ?? false,
      /** Un déploiement d'une version en retard ne connaît que le fondateur : le bouton retombe
       *  sur le titre, ce qu'il a toujours fait, et le doyen n'en voit aucun. */
      mayConclude: server.me.mayConclude ?? server.me.creator ?? false,
      founderAbsence: server.me.founderAbsence ?? null,
      /** Un déploiement d'une version en retard ne connaît pas la capitulation : personne
       *  n'a déposé les armes, et le plateau garde tous ses boutons. */
      defeated: server.me.defeated ?? false,
      homePosition,
      /** Un déploiement d'une version en retard n'en sert aucune : le plateau s'ouvre alors
       *  comme il l'a toujours fait, sur le monde. */
      capitalPoint: (server.me.capitalPoint as LonLat | null | undefined) ?? null,
      ink: server.me.ink,
      power: isNation(server.me.nation) ? fr.nationPowers[server.me.nation] : '',
      progress: server.me.progress,
      restWindow: formatWindow(asLocalWindow(server.me.restWindow)),
      resources: server.me.resources,
      slots: server.me.slots,
      hqLevel: server.me.hqLevel,
      /** A deployment one version behind serves no site at all: no budget, hence nothing
       *  offered — never a placement the server would then refuse after the click. */
      siteSlots: server.me.siteSlots ?? [],
      // A deployment ahead of the client answers without the field: no relief served, no
      // sentence — the site then says what it always said, and nothing breaks.
      homeSlotRelief: server.me.homeSlotRelief ?? null,
      tier2HqLevel: server.me.tier2HqLevel ?? TIER_2_HQ_LEVEL,
      foundation: server.me.foundation ?? [],
      /** Un déploiement d'une version de retard n'en sert aucun : le mât retombe sur la région,
       *  ce qu'il a toujours fait — jamais un port planté à un point inventé ici. */
      buildings: server.me.buildings.map((building) => ({
        ...building,
        point: building.point ?? null,
        name: fr.buildings[building.key],
      })),
      chains: server.me.chains,
      extraction: server.me.extraction,
      /** A region served by a deployment one version behind carries no site: it reads as ground
       *  nothing reaches, which offers nothing rather than offering what the server refuses. */
      regions: server.me.regions.map((region) => ({ ...region, site: region.site ?? null })),
      // A deployment ahead of the client returns an object without this field. The adapter is
      // the only boundary: a version gap gets absorbed here, not in the panels, where an
      // `undefined` takes down the whole board.
      construction: server.me.construction
        ? {
            id: server.me.construction.id,
            name:
              fr.buildings[server.me.construction.name as BuildingKey] ??
              server.me.construction.name,
            key: server.me.construction.key as BuildingKey,
            regionId: server.me.construction.regionId,
            regionName: server.me.construction.regionName,
            point: server.me.construction.point ?? null,
            minutesLeft: server.me.construction.minutesLeft,
          }
        : null,
      constructionQueue: (server.me.constructionQueue ?? []).map((entry) => ({
        id: entry.id,
        name: fr.buildings[entry.key as BuildingKey] ?? entry.name,
        key: entry.key as BuildingKey,
        regionId: entry.regionId,
        regionName: entry.regionName,
        level: entry.level,
      })),
      armyPresent: server.me.armyPresent ?? {},
      armyInTransit: {},
      troopCap: server.me.troopCap,
      /** A deployment one version behind knows no upkeep: a troop without the field is one
       *  nobody charges extra for, and a nation without the line is one holding nothing. */
      troops: server.me.troops.map((troop) => ({ ...troop, supplied: troop.supplied ?? true })),
      stationedCargo: server.me.stationedCargo ?? [],
      /** Un déploiement d'une version de retard n'en sert aucun : aucune caserne n'est alors
       *  déclarée occupée, ce qui donne une ligne de trop et jamais une ligne de moins. */
      recruiting: server.me.recruiting ?? [],
      upkeep: {
        troops: server.me.upkeep?.troops ?? 0,
        unsupplied: server.me.upkeep?.unsupplied ?? 0,
        foodPerHour: server.me.upkeep?.foodPerHour ?? 0,
        outposts: server.me.upkeep?.outposts ?? 0,
        outpostFoodPerHour: server.me.upkeep?.outpostFoodPerHour ?? 0,
        outpostCoalPerHour: server.me.upkeep?.outpostCoalPerHour ?? 0,
      },
      starving: server.me.starving ?? false,
      // A deployment one version behind knows nothing of a raid, and an outpost without the
      // field is an outpost that is standing — the adapter is where that gap is absorbed.
      outposts: server.me.outposts.map((outpost) => ({
        ...outpost,
        disabledMinutesLeft: outpost.disabledMinutesLeft ?? null,
        level: outpost.level ?? 1,
        /** Un déploiement d'une version de retard ne place aucun point : la région est alors
         *  inconnue, et rien de ce qui la lit ne s'ouvre — jamais une mauvaise région. */
        regionId: outpost.regionId ?? null,
      })),
    },
    buildCatalog: server.buildCatalog,
    surveyedInstallations: server.surveyedInstallations ?? [],
    lootSightings: server.lootSightings ?? [],
    /** **Servie telle quelle, jamais recomposée.** L'adaptateur ne calcule rien ici — un delta
     *  reconstitué côté client aurait besoin de l'édition précédente, que la vue ne sert pas et
     *  ne servira pas (contrat 07 P3 : pas d'historique). Un déploiement d'une version de retard
     *  n'en sert aucune, et la page dit simplement qu'aucune édition n'a paru. */
    press: server.press ?? null,
    arcs: [...(server.movements ?? []).map(asArc), ...(server.detected ?? []).map(asDetectedArc)],
    journal: journalDispatches(
      server.reports ?? [],
      server.season.reduction ?? null,
      // A deployment one version behind knows nothing of a latecomer: no entry, no headline.
      server.warEntries ?? [],
      (server.notices ?? []) as ReadonlyArray<Notice>,
      // Absent means nothing has ever been read — which is the state of a first visit anyway.
      server.journalReadAt ?? null,
    ),
    opponents: server.opponents.map((opponent) => ({
      nation: opponent.nation,
      ink: opponent.ink,
      power: isNation(opponent.nation) ? fr.nationPowers[opponent.nation] : '',
      bar: { state: 'anonymous', progress: 0 },
      restWindow: formatWindow(asLocalWindow(opponent.restWindow)),
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
  const timing = arcTiming(
    {
      departedAt: movement.departedAt,
      arrivesAt: movement.arrivesAt,
      heldAt: movement.heldAt,
      holdUntil: movement.holdUntil,
    },
    Date.now(),
  );
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
    cargo: movement.cargo ?? emptyCargo(),
    mission: movement.mission ?? null,
    minutesLeft: timing.minutesLeft,
    borderWait: timing.borderWait,
    progress: timing.progress,
  };
}

/**
 * **La plage se stocke en UTC et se lit à la montre du joueur** : le serveur ne connaît qu'un
 * entier, et c'est ici — au seul endroit qui écrit une heure de plage à l'écran — qu'il redevient
 * l'heure que l'un a déclarée et que l'autre lit.
 */
function asLocalWindow(window: TimeWindow): TimeWindow {
  const offsetMinutes = -new Date().getTimezoneOffset();
  return {
    startMinutes: toLocalMinutes(window.startMinutes, offsetMinutes),
    endMinutes: toLocalMinutes(window.endMinutes, offsetMinutes),
  };
}

const emptyCargo = () => ({
  loot: Object.fromEntries(RESOURCES.map((resource) => [resource, 0])) as Record<
    (typeof RESOURCES)[number],
    number
  >,
  carried: 0,
  capacity: 0,
  free: 0,
});

/**
 * A sighting becomes an arc **in one of the two enemy states and no other**: the union is what
 * guarantees the fog on this side (ADR 0005, convention §8). Nothing built here carries a type, a
 * composition or a nation, because the server sent none — `identification` is nailed to
 * `pierced: false` since no system pierces anything yet (design sheet 04).
 *
 * **The window decides the state.** Inside it, the stretch is watched and the pawn walks it; past
 * its close the arc freezes into the last known position ADR 0005 demands — the information paid
 * for does not evaporate, it ages. `progress` is read at the instant the sighting closed rather
 * than now, which is exactly what "last known" means.
 *
 * **Everything here is measured on the window and not on the trip** (decision 4a of 13/09/2026):
 * the served thread *is* the watched stretch, so the pawn reaches the end of it at `seenTo` and
 * stops there. `estimatedMinutesLeft` no longer times that walk — it is the arrival the label
 * counts down to, and the arrival lies beyond everything drawn.
 */
function asDetectedArc(seen: NonNullable<ServerView['detected']>[number]): ArcView {
  const now = Date.now();
  const window = seen.seenTo - seen.seenFrom;
  const watched = Math.min(now, seen.seenTo);
  const shared = {
    id: seen.id,
    from: [seen.from.lon, seen.from.lat] as LonLat,
    to: [seen.to.lon, seen.to.lat] as LonLat,
    route: routeOf(seen),
    /** The one thing on this card that is about the observer rather than about the column: what
     *  of his caught it. It survives into `lastKnown` — a memory keeps the eye that made it. */
    detector: seen.detector,
    detectorRegion: seen.detectorRegion,
    headingDegrees: seen.headingDegrees,
    progress: window <= 0 ? 1 : Math.min(1, Math.max(0, (watched - seen.seenFrom) / window)),
  };

  if (now > seen.seenTo) {
    return { ...shared, state: 'lastKnown', seenMinutesAgo: (now - seen.seenTo) / 60_000 };
  }
  return {
    ...shared,
    state: 'enemyDetected',
    /** A sentry sees a column go past, not a flag: nothing about the owner is served, and the
     *  card says nothing rather than guessing. */
    suspectedNation: null,
    headingAtMe: seen.headingAtMe,
    identification: { pierced: false },
    estimatedMinutesLeft: Math.max(0, (seen.arrivesAt - now) / 60_000),
    watchMinutesLeft: Math.max(0, (seen.seenTo - now) / 60_000),
  };
}

/** The route as the thread reads it. The mode is derived rather than stored: it is a reading of
 *  the legs, and a stored copy of a reading is one more thing that can disagree with them. */
function routeOf(movement: {
  points: ReadonlyArray<{ lon: number; lat: number }>;
  legs: ReadonlyArray<{ medium: 'land' | 'sea' | 'air'; distanceUnits: number }>;
  distanceUnits: number;
  costUnits: number;
  /** A deployment one version behind sends none: it only ever routed columns on foot, and the
   *  foot price is what its legs were weighted with. */
  landCost?: number | undefined;
}): ComputedRoute {
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
    landCost: movement.landCost ?? COST_BY_MEDIUM.land,
    legs,
  };
}

const stackOf = (roles: ReadonlyArray<UnitRole>): Stack =>
  roles.reduce<Record<string, number>>(
    (counted, role) => ({ ...counted, [role]: (counted[role] ?? 0) + 1 }),
    {},
  );
