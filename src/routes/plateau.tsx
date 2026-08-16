import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { WorldMap } from '@/map/WorldMap';
import { Shell } from '@/shell/Shell';
import { ErrorScreen } from '@/shell/ErrorScreen';
import { StaleToken } from '@/shell/StaleToken';
import { buildLabels, type MapMarker } from '@/domain/labels';
import type { BuildingKey } from '@/domain/ids';
import { COUNTRY_BY_NATION, inkByClaimedCountry, isNation } from '@/domain/nations';
import { buildingSprite } from '@/emblems/buildings/manifest';
import type { RegionIdentity, World } from '@/domain/world';
import { compassOf, type CompassAction, type CompassTarget } from '@/domain/compass-rose';
import type { MovementType, PlayerView } from '@/domain/player-view';
import { useIndicatorToggles } from '@/data/indicatorToggles';
import { loadGame } from '@/data/loadGame';
import { adaptServerView } from '@/data/serverView';
import { errorCode } from '@/data/errors';
import { ConstructionPanel } from './-plateau/ConstructionPanel';
import { MovementTimeline } from './-plateau/MovementTimeline';
import { RegionTooltip } from './-plateau/RegionTooltip';
import { ReservesPanel } from './-plateau/ReservesPanel';
import { SelectedCountryPanel } from './-plateau/SelectedCountryPanel';

type BuildingSite = { regionId: string; x: number; y: number };

const JournalWindow = lazy(() =>
  import('./-plateau/JournalWindow').then((module) => ({ default: module.JournalWindow })),
);
const TroopsWindow = lazy(() =>
  import('./-plateau/TroopsWindow').then((module) => ({ default: module.TroopsWindow })),
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

const WINDOWS = ['journal', 'troops', 'production', 'industry', 'nation', 'settings'] as const;

export type BoardWindow = (typeof WINDOWS)[number];

const MOVEMENT_TYPES: ReadonlyArray<string> = ['attack', 'raid', 'outpost', 'agent', 'decoy'];

/**
 * The windows array's order is the stacking order: the last entry is in front. `send` is
 * the movement type preset by the compass rose; its mere presence opens the troops window
 * on the send tab.
 */
export type BoardSearch = {
  country?: string;
  windows?: BoardWindow[];
  send?: MovementType;
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
  const { windows, send, building, ...rest } = search;
  // The send preset belongs to the troops window: it leaves with it, and the building focus
  // leaves with whichever surface could have been carrying it.
  const withSend = name === 'troops' || send === undefined ? rest : { ...rest, send };
  const kept =
    FOCUSED_WINDOWS.includes(name) || building === undefined
      ? withSend
      : { ...withSend, building };
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
    if (typeof raw.send === 'string' && MOVEMENT_TYPES.includes(raw.send)) {
      search.send = raw.send as MovementType;
    }
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
        <p className="text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">{fr.board.unavailableKicker}</p>
        <h1 className="mt-3 border-t-2 border-b border-[var(--ink)] py-3 font-[var(--font-display)] text-[26px] leading-none font-extrabold tracking-[.03em] text-[var(--ink)] uppercase">
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
  const { country, windows = [], send, building: focused } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
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
  const toggles = useIndicatorToggles();
  const hoveredMovement = hoveredCard ?? hoveredLabel ?? hoveredArc;
  // The map designates the track by its arc or its label; a hovered card does not.
  const mapDesignatedMovement = hoveredCard ? null : (hoveredLabel ?? hoveredArc);

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

  const openSend = useCallback(
    (destination: string | null, type: MovementType | null) => {
      void navigate({
        search: (previous) => {
          const withTroops = withWindow(previous, 'troops');
          return {
            ...withTroops,
            ...(destination === null ? {} : { country: destination }),
            send: type ?? 'attack',
          };
        },
      });
    },
    [navigate],
  );

  /**
   * A click on a mast opens the surface where that building is *used*. The key is read off the
   * view rather than carried in the URL: what travels is the instance, and a razed one simply
   * finds no key — the window then opens without a focus, which is the honest fallback and the
   * one `ProductionWindow` already applies to a vanished site.
   */
  const openBuilding = useCallback(
    (buildingId: string) => {
      const standing = view.me.buildings.find((candidate) => candidate.id === buildingId);
      if (standing === undefined) return;
      void navigate({
        search: (previous) => ({
          ...withWindow(previous, WINDOW_OF_BUILDING[standing.key]),
          building: buildingId,
        }),
      });
    },
    [navigate, view.me.buildings],
  );

  const compassOfTarget = useCallback((target: CompassTarget) => compassOf(target, view), [view]);

  const actOnCompass = useCallback(
    (action: CompassAction, at: { x: number; y: number }) => {
      switch (action.key) {
        case 'view':
          select(action.country);
          return;
        case 'build':
          setBuildingSite({ regionId: action.regionId, x: at.x, y: at.y });
          return;
        case 'send':
          openSend(action.destination, action.type);
      }
    },
    [select, openSend],
  );

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

  // Buildings are the only ground markers the server can place today: a region id is enough,
  // and the map layer resolves it. Outposts, stacks and sited constructions still wait for
  // 4.7 to serve positions — see `MapMarker`.
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

    if (!toggles.buildings) return deposits;
    const host = isNation(view.me.nation) ? COUNTRY_BY_NATION[view.me.nation] : null;
    const work = view.me.construction;
    const finishesAt =
      work === null ? null : view.loadedAt + work.minutesLeft * 60_000;
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
    return [...deposits, ...standing, ...raising];
  }, [
    toggles.buildings,
    toggles.deposits,
    view.me.buildings,
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

  return (
    <Shell view={view}>
      <div className="relative min-w-0 flex-1">
        <WorldMap
          world={world}
          arcs={view.arcs}
          labels={labels}
          inkByCountry={inkByCountry}
          built={built}
          selectedCountry={country ?? null}
          playerNation={view.me.nation}
          indicators={toggles}
          accentedMovement={hoveredMovement}
          onSelect={select}
          onOpenBuilding={openBuilding}
          onRegionHover={setHoveredRegion}
          onArcHover={setHoveredArc}
          onLabelHover={setHoveredLabel}
          compassOf={compassOfTarget}
          onCompassAction={actOnCompass}
          building={buildingSite !== null}
        />
        {buildingSite && (
          <ConstructionPanel
            view={view}
            token={token}
            regionId={buildingSite.regionId}
            at={buildingSite}
            onClose={() => setBuildingSite(null)}
          />
        )}
        <MovementTimeline
          view={view}
          hoveredMovement={hoveredMovement}
          mapDesignatedMovement={mapDesignatedMovement}
          onHover={setHoveredCard}
          onSelect={select}
        />
        {/* The top right is the reserves' now — permanently. What answers a *gesture* (the
            pointer on a region, a selected country) reads at the other end of the same column,
            clear of the timeline's band: two things one glances at, one place to look. */}
        <ReservesPanel view={view} />
        <div className="absolute right-4 bottom-[84px] z-10 flex flex-col items-end gap-3">
          {country && <SelectedCountryPanel country={country} view={view} />}
          {hoveredRegion && (
            <RegionTooltip id={hoveredRegion.id} name={hoveredRegion.name} view={view} />
          )}
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
            case 'troops':
              return (
                <TroopsWindow
                  key={name}
                  view={view}
                  world={world}
                  country={country ?? null}
                  send={send ?? null}
                  {...windowProps}
                />
              );
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
