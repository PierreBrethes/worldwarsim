import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { fr } from '@/i18n/fr';
import { ControlsCard } from '@/map/ControlsCard';
import { WorldMap } from '@/map/WorldMap';
import { Shell } from '@/shell/Shell';
import { ErrorScreen } from '@/shell/ErrorScreen';
import { StaleToken } from '@/shell/StaleToken';
import { buildLabels, type MapMarker } from '@/domain/labels';
import type { BuildingKey } from '@/domain/ids';
import { COUNTRY_BY_NATION, inkByClaimedCountry, isNation } from '@/domain/nations';
import { buildingSprite } from '@/emblems/buildings/manifest';
import type { LonLat } from '@/domain/geo';
import type { RegionIdentity, World } from '@/domain/world';
import { compassOf, type CompassAction, type CompassTarget } from '@/domain/compass-rose';
import type { Column, MovementAim } from '@/domain/movement-orders';
import type { ArcView, MovementType, PlayerView, TroopStation } from '@/domain/player-view';
import { PROJECTION_BY_DOMAIN, stationKeyOf, type MarchStation } from '@/domain/troops';
import { useIndicatorToggles } from '@/data/indicatorToggles';
import { loadGame } from '@/data/loadGame';
import { adaptServerView, type MovementPreviewed } from '@/data/serverView';
import { errorCode } from '@/data/errors';
import { ConstructionPanel } from './-plateau/ConstructionPanel';
import { GarrisonPanel } from './-plateau/GarrisonPanel';
import { MovementPreview, wireOrigin, wireTarget } from './-plateau/MovementPreview';
import { GroundPanel } from './-plateau/GroundPanel';
import { TroopsWidget, stationNamer } from './-plateau/TroopsWidget';
import { ReservesPanel } from './-plateau/ReservesPanel';

type BuildingSite = { regionId: string; x: number; y: number };

/** The garrison panel's subject and the point it is anchored to. */
type OpenGarrison = {
  readonly station: TroopStation;
  readonly preselect: ReadonlyArray<string>;
  readonly x: number;
  readonly y: number;
};

/**
 * A column composed and armed, waiting for an aim. `rule` is the shape the shared legality
 * function reads — built once here so the fan does not rebuild it on every hover.
 */
type ArmedColumn = {
  /** The address the widget and the garrison panel select on — and the one the order leaves
   *  from, since ADR 0019 §1 made them the same thing. */
  readonly station: MarchStation;
  readonly troopIds: ReadonlyArray<string>;
  readonly rule: Column;
};

/** An aim named on the map: what the preview card sits on and what the mutation will carry. */
type Order = {
  readonly aim: MovementAim;
  readonly type: MovementType;
  readonly x: number;
  readonly y: number;
};

/** The three buildings that station a column — their mast opens a garrison. Since ADR 0019 they
 *  no longer decide what it may ask for, only where a domain gate is read. */
const PROJECTION_KEYS: ReadonlyArray<BuildingKey> = Object.values(PROJECTION_BY_DOMAIN);

const JournalWindow = lazy(() =>
  import('./-plateau/JournalWindow').then((module) => ({ default: module.JournalWindow })),
);
const ProductionWindow = lazy(() =>
  import('./-plateau/ProductionWindow').then((module) => ({ default: module.ProductionWindow })),
);
const IndustryWindow = lazy(() =>
  import('./-plateau/IndustryWindow').then((module) => ({ default: module.IndustryWindow })),
);
const NationWindow = lazy(() =>
  import('./-plateau/NationWindow').then((module) => ({ default: module.NationWindow })),
);
const SettingsWindow = lazy(() =>
  import('./-plateau/SettingsWindow').then((module) => ({ default: module.SettingsWindow })),
);

const WINDOWS = ['journal', 'production', 'industry', 'nation', 'settings'] as const;

export type BoardWindow = (typeof WINDOWS)[number];

/**
 * The windows array's order is the stacking order: the last entry is in front.
 *
 * **Nothing about a movement lives here.** Composing a column and aiming it happen on the map,
 * in the widget and in the panels it opens (decision 12a) — a half-armed column in a URL would
 * be a shareable link to a state the server never heard of.
 */
export type BoardSearch = {
  country?: string;
  windows?: BoardWindow[];
  /**
   * The building whose line the opened surface focuses on — an **instance id**, never a key:
   * `?building=barracks` would open the barracks of Normandy for a click on the one in
   * Brittany. A stale id is not an error, it is a window without a focus.
   */
  building?: string;
};

/**
 * **Where a building is *used*, never where it is maintained.** One rule for the fifteen, so
 * that a click means the same thing everywhere: *see what this building does for me.* The
 * record is complete on purpose — a key added to the domain without a destination has to break
 * the compilation, never produce a dead click.
 */
const WINDOW_OF_BUILDING: Readonly<Record<BuildingKey, BoardWindow>> = {
  hq: 'nation',
  farm: 'industry',
  mill: 'industry',
  mine: 'industry',
  oilWell: 'industry',
  foundry: 'industry',
  arsenal: 'industry',
  quartermaster: 'industry',
  warehouse: 'industry',
  depot: 'industry',
  listening: 'industry',
  barracks: 'production',
  airfield: 'production',
  port: 'production',
  billets: 'production',
};

/** The three surfaces a focus can live in. Closing one of them lets it go — there is a single
 *  `building` in the URL, so a focus that outlived its window would resurface unasked. */
const FOCUSED_WINDOWS: ReadonlyArray<BoardWindow> = ['industry', 'production', 'nation'];

export function withWindow(search: BoardSearch, name: BoardWindow): BoardSearch {
  const others = (search.windows ?? []).filter((open) => open !== name);
  return { ...search, windows: [...others, name] };
}

export function withoutWindow(search: BoardSearch, name: BoardWindow): BoardSearch {
  const { windows, building, ...rest } = search;
  // The building focus leaves with whichever surface could have been carrying it.
  const kept =
    FOCUSED_WINDOWS.includes(name) || building === undefined ? rest : { ...rest, building };
  const remaining = (windows ?? []).filter((open) => open !== name);
  return remaining.length ? { ...kept, windows: remaining } : kept;
}

export const toggleWindow = (search: BoardSearch, name: BoardWindow): BoardSearch =>
  (search.windows ?? []).includes(name) ? withoutWindow(search, name) : withWindow(search, name);

export const windowOpen = (search: BoardSearch, name: BoardWindow): boolean =>
  (search.windows ?? []).includes(name);

function readWindows(raw: Record<string, unknown>): BoardWindow[] {
  const requested = Array.isArray(raw.windows) ? raw.windows : [raw.windows];
  return requested
    .filter((value): value is BoardWindow => WINDOWS.includes(value as BoardWindow))
    .filter((name, rank, all) => all.indexOf(name) === rank);
}

export const Route = createFileRoute('/plateau')({
  validateSearch: (raw: Record<string, unknown>): BoardSearch => {
    const search: BoardSearch = {};
    if (typeof raw.country === 'string') search.country = raw.country;
    const windows = readWindows(raw);
    if (windows.length) search.windows = windows;
    if (typeof raw.building === 'string' && raw.building.length > 0) search.building = raw.building;
    return search;
  },
  // The loader only fetches the world and the token; the view comes from the subscription,
  // so the errors that used to surface here now surface at render — see `BoardError`.
  loader: loadGame,
  pendingComponent: Loading,
  errorComponent: ({ error, reset }) => <BoardError error={error} reset={reset} />,
  component: Board,
});

/**
 * The three outcomes of a failed board subscription. Two are ordinary and get a route of
 * their own: a season still in the lobby sends the player back to the lobby, a token the
 * server does not know gets dropped. Everything else is a genuine failure and says so.
 */
function BoardError({ error, reset }: { error: unknown; reset: () => void }) {
  const code = errorCode(error);
  if (code === 'SEASON_NOT_LAUNCHED') return <Navigate to="/salon" />;
  if (code === 'UNKNOWN_TOKEN' || code === 'SEASON_GONE') return <StaleToken to="/accueil" />;
  return <ErrorScreen error={error} reset={reset} />;
}

function Board() {
  const entry = Route.useLoaderData();
  if (entry.state === 'none') return <NoGame />;
  return <LiveBoard world={entry.world} token={entry.token} />;
}

function NoGame() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full items-center justify-center bg-[var(--desk)] px-6">
      <div className="hud paper-grain w-[520px] max-w-full border border-[var(--ink)] px-[30px] pt-[22px] pb-6 text-center">
        <p className="text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          {fr.board.unavailableKicker}
        </p>
        <h1 className="mt-3 border-t-2 border-b border-[var(--ink)] py-3 font-(family-name:--font-display) text-[26px] leading-none font-extrabold tracking-[.03em] text-[var(--ink)] uppercase">
          {fr.board.noGameTitle}
        </h1>
        <p className="mt-4 text-[13px] leading-[1.55] text-[var(--ink)]">{fr.board.noGameBody}</p>
        <button
          type="button"
          onClick={() => void navigate({ to: '/accueil' })}
          className="mt-5 w-full cursor-pointer border border-[var(--ink)] py-[10px] text-[10px] tracking-[.2em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          {fr.board.backHome}
        </button>
      </div>
    </div>
  );
}

function LiveBoard({ world, token }: { world: World; token: string }) {
  const server = useQuery(api.view.playerView, { token });
  // The adapted view is memoized because it is the identity every panel keys on: rebuilding
  // it on each render would redo the labels and the compass on every keystroke elsewhere.
  const view = useMemo(
    () => (server === undefined ? null : adaptServerView(world, server)),
    [world, server],
  );
  if (view === null) return <Loading />;
  return <BoardContent world={world} view={view} token={token} />;
}

function BoardContent({ world, view, token }: { world: World; view: PlayerView; token: string }) {
  const { country, windows = [], building: focused } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<RegionIdentity | null>(null);
  // Where the crane was clicked: the construction panel is anchored to the aimed point, since
  // what it answers is "here", not "somewhere".
  const [buildingSite, setBuildingSite] = useState<BuildingSite | null>(null);
  // Two sources for one accent: when the pointer leaves the map to enter a card, the render
  // loop announces "nothing under the pointer" on the next frame. A single variable and
  // that echo would erase the hover the card just lit.
  const [hoveredArc, setHoveredArc] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  /**
   * **The whole movement flow, in three states and one direction.** A garrison is opened, a
   * column is armed out of it, an aim is named on the map — and the only way back is to close.
   * Nothing here can redirect a movement already gone: there is no state for it, and that is
   * the guarantee rather than a missing button (decision 13a).
   */
  const [garrison, setGarrison] = useState<OpenGarrison | null>(null);
  const [column, setColumn] = useState<ArmedColumn | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [focus, setFocus] = useState<{ ids: ReadonlyArray<string>; nonce: number } | null>(null);
  const toggles = useIndicatorToggles();
  const hoveredMovement = hoveredCard ?? hoveredLabel ?? hoveredArc;

  const select = useCallback(
    (name: string | null) => {
      void navigate({
        search: (previous) => {
          const { country: _dropped, ...rest } = previous;
          return name ? { ...rest, country: name } : rest;
        },
        replace: true,
      });
    },
    [navigate],
  );

  /**
   * **One selection state, two doors.** The widget's *stationnaire* card and the building's own
   * mast open this same panel with the same troops pre-checked — never two flows for one thing.
   * The camera goes to the mast either way, so the panel always names something one can see.
   */
  const openGarrison = useCallback(
    (station: TroopStation, preselect: ReadonlyArray<string>, at: { x: number; y: number }) => {
      setColumn(null);
      setOrder(null);
      setGarrison({ station, preselect, ...at });
      const marker = markerOfStation(view, station);
      if (marker !== null) setFocus({ ids: [marker], nonce: Date.now() });
    },
    [view],
  );

  /**
   * A click on a mast opens what that building *is used for*. For a projection building that is
   * its garrison — the column leaves from there (ADR 0013), and that is the same door the widget
   * opens. Everything else keeps opening the surface where the building's line lives; the key is
   * read off the view rather than carried in the URL, so a razed instance simply finds none.
   */
  const openBuilding = useCallback(
    (buildingId: string, clientX: number, clientY: number) => {
      const standing = view.me.buildings.find((candidate) => candidate.id === buildingId);
      if (standing === undefined) return;
      if (PROJECTION_KEYS.includes(standing.key)) {
        const rect = document.body.getBoundingClientRect();
        openGarrison({ kind: 'building', buildingId }, [], {
          x: clientX - rect.left,
          y: clientY - rect.top,
        });
        return;
      }
      void navigate({
        search: (previous) => ({
          ...withWindow(previous, WINDOW_OF_BUILDING[standing.key]),
          building: buildingId,
        }),
      });
    },
    [navigate, openGarrison, view.me.buildings],
  );

  /**
   * The fan the right click opens. Armed, it holds **only** the marches the server will accept
   * for that target — same function, same rule (ADR 0015). Unarmed, it is the ordinary fan.
   */
  const compassOfTarget = useCallback(
    (target: CompassTarget) => compassOf(target, view, column?.rule ?? null),
    [view, column],
  );

  const actOnCompass = useCallback(
    (action: CompassAction, at: { x: number; y: number }) => {
      switch (action.key) {
        case 'view':
          select(action.country);
          return;
        case 'build':
          setBuildingSite({ regionId: action.regionId, x: at.x, y: at.y });
          return;
        case 'aim':
          setOrder({ aim: action.aim, type: action.type, x: at.x, y: at.y });
      }
    },
    [select],
  );

  // Escape disarms the aim — and only the aim: the rose stops the key before it gets here.
  useEffect(() => {
    if (column === null) return;
    const disarm = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setColumn(null);
      setOrder(null);
    };
    document.addEventListener('keydown', disarm);
    return () => document.removeEventListener('keydown', disarm);
  }, [column]);

  const inkByCountry = useMemo(
    () => inkByClaimedCountry([view.me, ...view.opponents]),
    [view.me, view.opponents],
  );

  // Nothing filters here: `me.buildings` is the player's own list and there is no other, so
  // the map cannot ink a region an opponent built on (ADR 0005).
  const built = useMemo(
    () => ({
      regionIds: view.me.buildings.map(({ regionId }) => regionId),
      ink: view.me.ink,
    }),
    [view.me.buildings, view.me.ink],
  );

  // Buildings hang from a region id and the map layer resolves it; an outpost carries its own
  // point, because it *is* a point and colours no ground (fiche 03). Stacks and sited
  // constructions still wait for 4.7 to serve positions — see `MapMarker`.
  const markers = useMemo<ReadonlyArray<MapMarker>>(() => {
    // Same rule as the buildings above and for the same reason: `me.regions` is the ground the
    // player may build on and there is no other, so an opponent's deposit cannot reach the map
    // — there is nothing to filter on nationality (ADR 0005).
    const deposits: ReadonlyArray<MapMarker> = toggles.deposits
      ? view.me.regions.flatMap((region) =>
          region.deposit === null
            ? []
            : [
                {
                  kind: 'deposit' as const,
                  id: `deposit-${region.id}`,
                  regionId: region.id,
                  deposit: region.deposit,
                },
              ],
        )
      : [];

    /**
     * **A founded outpost has to stand on the board.** Without this the column that planted it
     * becomes a garrison hanging from a point nothing draws: the troops leave the *stationnaires*
     * of the widget for an address the map never shows, and the whole march reads as "nothing
     * happened". `me.outposts` is mine only — the fog keeps an opponent's point out of the answer
     * itself (`view.ts`), so there is nothing to filter on nationality here.
     */
    const outposts: ReadonlyArray<MapMarker> = view.me.outposts.map((outpost) => ({
      kind: 'outpost' as const,
      id: `outpost-${outpost.id}`,
      lonLat: outpost.lonLat,
      hostCountry: outpost.hostCountry,
      specialization: outpost.specialization,
      level: outpost.level,
      garrison: outpost.garrison,
      ink: view.me.ink,
    }));

    if (!toggles.buildings) return [...deposits, ...outposts];
    const host = isNation(view.me.nation) ? COUNTRY_BY_NATION[view.me.nation] : null;
    const work = view.me.construction;
    const finishesAt = work === null ? null : view.loadedAt + work.minutesLeft * 60_000;
    const standing = view.me.buildings.map((building) => ({
      kind: 'building' as const,
      id: `building-${building.regionId}-${building.key}`,
      buildingId: building.id,
      regionId: building.regionId,
      hostCountry: host,
      name: building.name,
      level: building.level,
      plate: buildingSprite(building.key),
      // An upgrade is work on a building that already stands: the crane takes the plate's
      // place on the mast that is already there, rather than raising a second one beside it.
      finishesAt:
        work !== null && work.regionId === building.regionId && work.key === building.key
          ? finishesAt
          : null,
      ink: view.me.ink,
    }));

    // A first level has no building to hang the crane on: the site gets its own mast, and
    // that is the whole point — a region under work reads as such before anything stands.
    const raising =
      work === null || standing.some((building) => building.finishesAt !== null)
        ? []
        : [
            {
              kind: 'building' as const,
              id: `building-${work.regionId}-${work.key}`,
              // A first level under the crane opens nothing: no line stands for it yet.
              buildingId: null,
              regionId: work.regionId,
              hostCountry: host,
              name: work.name,
              level: null,
              plate: null,
              finishesAt,
              ink: view.me.ink,
            },
          ];
    return [...deposits, ...outposts, ...standing, ...raising];
  }, [
    toggles.buildings,
    toggles.deposits,
    view.me.buildings,
    view.me.outposts,
    view.me.regions,
    view.me.construction,
    view.me.nation,
    view.me.ink,
    view.loadedAt,
  ]);

  const labels = useMemo(() => buildLabels(view, markers), [view, markers]);

  const closeWindow = useCallback(
    (name: BoardWindow) => {
      void navigate({ search: (previous) => withoutWindow(previous, name) });
    },
    [navigate],
  );

  const bringForward = useCallback(
    (name: BoardWindow) => {
      void navigate({ search: (previous) => withWindow(previous, name), replace: true });
    },
    [navigate],
  );

  // The morning edition: with unread critical news, the journal is already on the desk on
  // arrival. Once per arrival, and never over a deep link asking for another surface.
  const editionServed = useRef(false);
  useEffect(() => {
    if (editionServed.current) return;
    editionServed.current = true;
    if (windows.length) return;
    if (!view.journal.some((dispatch) => dispatch.severity === 'critical')) return;
    void navigate({
      search: (previous) => withWindow(previous, 'journal'),
      replace: true,
    });
  }, [windows, view.journal, navigate]);

  const preview = useQuery(
    api.movements.preview,
    column === null || order === null
      ? 'skip'
      : {
          token,
          origin: wireOrigin(column.station),
          troopIds: column.troopIds.map((troopId) => troopId as Id<'troops'>),
          target: wireTarget(order.aim),
          type: order.type,
        },
  );

  /**
   * **The aimed arc is the route the server just computed**, drawn with the board's own thread
   * and nothing else — never a great-circle approximation laid on top. It joins the arcs of the
   * movements in flight in the same list, so it inherits the same stroke, the same pawn, the
   * same everything.
   */
  const arcs = useMemo<ReadonlyArray<ArcView>>(
    () =>
      column === null || order === null || !preview
        ? view.arcs
        : [...view.arcs, previewArc(column, order, preview)],
    [view.arcs, column, order, preview],
  );

  return (
    <Shell view={view}>
      <div className="relative min-w-0 flex-1">
        <WorldMap
          world={world}
          arcs={arcs}
          labels={labels}
          inkByCountry={inkByCountry}
          built={built}
          selectedCountry={country ?? null}
          playerNation={view.me.nation}
          indicators={toggles}
          accentedMovement={hoveredMovement}
          onSelect={select}
          onOpenBuilding={openBuilding}
          onCountryHover={setHoveredCountry}
          onRegionHover={setHoveredRegion}
          onArcHover={setHoveredArc}
          onLabelHover={setHoveredLabel}
          compassOf={compassOfTarget}
          onCompassAction={actOnCompass}
          building={buildingSite !== null}
          aiming={column !== null}
          focus={focus}
        />
        {buildingSite && (
          /* Keyed on where it was aimed: a panel opened at a second point is a second panel,
             and it must not inherit the push the player gave the first (`Draggable`). */
          <ConstructionPanel
            key={`${buildingSite.regionId}-${buildingSite.x}-${buildingSite.y}`}
            view={view}
            token={token}
            regionId={buildingSite.regionId}
            at={buildingSite}
            onClose={() => setBuildingSite(null)}
          />
        )}
        {garrison && (
          <GarrisonPanel
            /* The pre-check is part of the panel's identity, not only its address: a second
               card of the same garrison — the cargo after the infantry — opens the same
               station and must arrive with *its* troops ticked, not the previous card's. */
            key={`${stationKeyOf(garrison.station)}-${garrison.x}-${garrison.y}-${garrison.preselect.join()}`}
            view={view}
            token={token}
            station={garrison.station}
            at={garrison}
            preselect={garrison.preselect}
            onClose={() => setGarrison(null)}
            onPrepare={(station, troopIds) => {
              /** `home` is the one address no column leaves from — the panel offers nothing
               *  there, so this branch only guards the type. */
              if (station.kind === 'home') return;
              setGarrison(null);
              setColumn(armedColumn(view, station, troopIds));
            }}
          />
        )}
        {column && order && (
          <MovementPreview
            token={token}
            origin={column.station}
            troopIds={column.troopIds}
            aim={order.aim}
            type={order.type}
            at={order}
            preview={preview}
            freeSlots={view.me.slots.total - view.me.slots.used}
            onClose={() => {
              setOrder(null);
              setColumn(null);
            }}
          />
        )}
        {column && !order && <AimBanner view={view} column={column} />}
        <TroopsWidget
          view={view}
          hoveredMovement={hoveredMovement}
          // What the widget's card should read as pressed: the garrison panel's own subject
          // while it is open, then the column it armed for as long as an aim is still live, and
          // nothing for neither — one selection, wherever the flow currently stands (13a).
          selectedStation={stationKeyOf((garrison ?? column)?.station ?? { kind: 'home' })}
          onHover={setHoveredCard}
          onOpenGarrison={(station, preselect) =>
            openGarrison(station, preselect, { x: 24, y: 92 })
          }
          onFollow={(arcId) => setFocus({ ids: [arcId], nonce: Date.now() })}
        />
        {/* The top right is the reserves' now — permanently. What answers a *gesture* (the
            pointer on a region, a selected country) reads at the other end of the same column,
            clear of the timeline's band: two things one glances at, one place to look.

            **One column, bottom-anchored, and the map's own help card is in it.** It used to
            anchor itself and so did this stack; each guessed at the other's height and the open
            card covered the panel. Stacked, the badge stays on the floor and everything above
            it is pushed up by whatever is there — no arrangement of the two can overlap. */}
        <ReservesPanel view={view} />
        <div className="pointer-events-none absolute right-4 bottom-4 z-10 flex flex-col items-end gap-3 [&>*]:pointer-events-auto">
          <GroundPanel
            selected={country ?? null}
            hoveredCountry={hoveredCountry}
            hoveredRegion={hoveredRegion}
            view={view}
          />
          <ControlsCard />
        </div>
      </div>
      <Suspense fallback={null}>
        {windows.map((name, rank) => {
          const windowProps = {
            rank,
            inFront: rank === windows.length - 1,
            onBringForward: () => bringForward(name),
            onClose: () => closeWindow(name),
          };
          switch (name) {
            case 'journal':
              return <JournalWindow key={name} view={view} {...windowProps} />;
            case 'production':
              return (
                <ProductionWindow
                  key={name}
                  view={view}
                  token={token}
                  focused={focused ?? null}
                  {...windowProps}
                />
              );
            case 'industry':
              return (
                <IndustryWindow
                  key={name}
                  view={view}
                  token={token}
                  focused={focused ?? null}
                  {...windowProps}
                />
              );
            case 'nation':
              return (
                <NationWindow
                  key={name}
                  view={view}
                  token={token}
                  focused={focused ?? null}
                  {...windowProps}
                />
              );
            case 'settings':
              return <SettingsWindow key={name} {...windowProps} />;
          }
        })}
      </Suspense>
      {/* the curtain extends the launch's black until the map's first frame */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40 bg-[var(--desk)]"
        style={{ animation: 'curtain-rise .9s ease forwards' }}
      />
    </Shell>
  );
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--desk)]">
      <span className="eyebrow-dark">{fr.board.loading}</span>
    </div>
  );
}

/**
 * The column as the shared rule reads it, built from what the player is allowed to see. It is
 * the same shape `convex/movements.ts` fills from its documents — the seam between one rule and
 * two callers.
 *
 * `station` is the address the garrison panel was opened on, whichever of its two doors — the
 * ground under it is only consulted for the domain gates, and a point carries none.
 */
function armedColumn(
  view: PlayerView,
  station: MarchStation,
  troopIds: ReadonlyArray<string>,
): ArmedColumn {
  const roles = troopIds.flatMap((troopId) => {
    const troop = view.me.troops.find((candidate) => candidate.id === troopId);
    return troop ? [troop.role] : [];
  });
  const departure =
    station.kind === 'building'
      ? view.me.buildings.find((building) => building.id === station.buildingId)
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
      departureBuildings: new Set(
        departure === undefined
          ? []
          : view.me.buildings
              .filter((building) => building.regionId === departure.regionId)
              .map((building) => building.key),
      ),
    },
  };
}

/**
 * The aimed arc, in the `mine` state because it is the player's own: it carries a type and a
 * stack, and the union makes that the only thing it can be. It is a preview and nothing on the
 * board treats it otherwise — it disappears with the card that describes it.
 */
function previewArc(
  column: ArmedColumn,
  order: Order,
  preview: NonNullable<MovementPreviewed>,
): ArcView {
  const points = preview.route.points.map((point) => [point.lon, point.lat] as LonLat);
  return {
    state: 'mine',
    id: PREVIEW_ARC,
    from: points[0] ?? [0, 0],
    to: points[points.length - 1] ?? [0, 0],
    route: {
      mode: preview.route.mode,
      points,
      distanceUnits: preview.route.distanceUnits,
      costUnits: preview.route.costUnits,
      landCost: preview.route.landCost,
      legs: preview.route.legs,
    },
    originCountry: '',
    /** A point belongs to nobody until the arrival says otherwise — the arc stays neutral. */
    destinationCountry:
      order.aim.kind === 'region'
        ? order.aim.country
        : order.aim.kind === 'outpost'
          ? order.aim.hostCountry
          : '',
    originLabel: preview.originName,
    destinationLabel: preview.destinationName,
    type: order.type,
    stack: column.rule.roles.reduce<Record<string, number>>(
      (counted, role) => ({ ...counted, [role]: (counted[role] ?? 0) + 1 }),
      {},
    ),
    troopIds: column.troopIds,
    /**
     * **Nothing has left**: the pawn sits at the barracks and the thread is entirely ahead. The
     * duration of the trip is not written here on purpose — the map walks a column against its
     * own clock from exactly this pair (`paceOf`, `map/engine/arcs.ts`), and a preview carrying
     * a real countdown would crawl off the barracks while the player is still deciding. What the
     * trip costs is read on the aiming card, from `preview.minutes`, which is the only place it
     * means anything before the slot is spent.
     */
    minutesLeft: 0,
    borderWait:
      preview.holdUntil === null
        ? null
        : { resolutionInMinutes: Math.max(0, (preview.holdUntil - Date.now()) / 60_000) },
    progress: 0,
  };
}

const PREVIEW_ARC = 'preview';

/** Where a station stands on the board, as the label layer names it. A building answers with
 *  its mast and an outpost with its own marker; a **point** has none — the camera then holds
 *  still rather than flying somewhere approximate. */
function markerOfStation(view: PlayerView, station: TroopStation): string | null {
  if (station.kind === 'outpost') {
    return view.me.outposts.some((candidate) => candidate.id === station.outpostId)
      ? `outpost-${station.outpostId}`
      : null;
  }
  if (station.kind !== 'building') return null;
  const building = view.me.buildings.find((candidate) => candidate.id === station.buildingId);
  return building === undefined ? null : `building-${building.regionId}-${building.key}`;
}

/**
 * What the board says while a column is armed: the pile, where it stands, and the two gestures
 * that matter. It names the way out, because a mode one cannot leave is a trap.
 */
function AimBanner({ view, column }: { view: PlayerView; column: ArmedColumn }) {
  const address = column.station;
  const building =
    address.kind === 'building'
      ? view.me.buildings.find((candidate) => candidate.id === address.buildingId)
      : undefined;
  const station = building?.name ?? stationNamer(view)(address);
  return (
    <div className="hud absolute top-4 left-4 z-10 border border-[var(--ink-quiet)] bg-[var(--desk)] px-3 py-2">
      <div className="text-[10px] tracking-[.22em] text-[var(--notable)] uppercase">
        {fr.aim.armed}
      </div>
      <div className="mt-1 font-(family-name:--font-mono) text-[11px] leading-[1.7] text-[var(--paper-dim)]">
        <div>{fr.aim.column(column.troopIds.length, station)}</div>
        <div>{fr.aim.gesture}</div>
        <div>{fr.aim.disarm}</div>
      </div>
    </div>
  );
}
