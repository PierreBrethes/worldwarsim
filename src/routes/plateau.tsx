import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { WorldMap } from '@/map/WorldMap';
import { Shell } from '@/shell/Shell';
import { ErrorScreen } from '@/shell/ErrorScreen';
import { buildLabels } from '@/domain/labels';
import { inkByClaimedCountry } from '@/domain/nations';
import type { World } from '@/domain/world';
import { compassOf, type CompassAction, type CompassTarget } from '@/domain/compass-rose';
import type { MovementType, PlayerView } from '@/domain/player-view';
import { useIndicatorToggles } from '@/data/indicatorToggles';
import { loadGame } from '@/data/loadGame';
import { adaptServerView } from '@/data/serverView';
import { errorCode } from '@/data/errors';
import { forgetToken } from '@/data/token';
import { MovementTimeline } from './-plateau/MovementTimeline';
import { RegionTooltip } from './-plateau/RegionTooltip';
import { SelectedCountryPanel } from './-plateau/SelectedCountryPanel';

const JournalWindow = lazy(() =>
  import('./-plateau/JournalWindow').then((module) => ({ default: module.JournalWindow })),
);
const TroopsWindow = lazy(() =>
  import('./-plateau/TroopsWindow').then((module) => ({ default: module.TroopsWindow })),
);
const ProductionWindow = lazy(() =>
  import('./-plateau/ProductionWindow').then((module) => ({ default: module.ProductionWindow })),
);
const NationWindow = lazy(() =>
  import('./-plateau/NationWindow').then((module) => ({ default: module.NationWindow })),
);
const SettingsWindow = lazy(() =>
  import('./-plateau/SettingsWindow').then((module) => ({ default: module.SettingsWindow })),
);

const WINDOWS = ['journal', 'troops', 'production', 'nation', 'settings'] as const;

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
};

export function withWindow(search: BoardSearch, name: BoardWindow): BoardSearch {
  const others = (search.windows ?? []).filter((open) => open !== name);
  return { ...search, windows: [...others, name] };
}

export function withoutWindow(search: BoardSearch, name: BoardWindow): BoardSearch {
  const { windows, send, ...rest } = search;
  // The send preset belongs to the troops window: it leaves with it.
  const kept = name === 'troops' || send === undefined ? rest : { ...rest, send };
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
    return search;
  },
  /**
   * Expected outcomes are settled before rendering: a season still in the lobby goes back
   * to the lobby, a dead token gets forgotten and the board admits "no game". The rest —
   * broken link, bug — climbs to `errorComponent`, never a blank page.
   */
  loader: async () => {
    try {
      return await loadGame();
    } catch (error) {
      const code = errorCode(error);
      if (code === 'SEASON_NOT_LAUNCHED') throw redirect({ to: '/salon' });
      if (code === 'UNKNOWN_TOKEN' || code === 'SEASON_GONE') {
        forgetToken();
        return { state: 'none' } as const;
      }
      throw error;
    }
  },
  pendingComponent: Loading,
  errorComponent: ({ error, reset }) => <ErrorScreen error={error} reset={reset} />,
  component: Board,
});

function Board() {
  const game = Route.useLoaderData();
  if (game.state === 'none') return <NoGame />;
  return <LiveBoard world={game.world} initialView={game.view} token={game.token} />;
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

function LiveBoard({
  world,
  initialView,
  token,
}: {
  world: World;
  initialView: PlayerView;
  token: string;
}) {
  const server = useQuery(api.view.playerView, { token });
  const view = server ? adaptServerView(world, server) : initialView;
  return <BoardContent world={world} view={view} token={token} />;
}

function BoardContent({ world, view, token }: { world: World; view: PlayerView; token: string }) {
  const { country, windows = [], send } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
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

  const compassOfTarget = useCallback((target: CompassTarget) => compassOf(target, view), [view]);

  const actOnCompass = useCallback(
    (action: CompassAction) => {
      if (action.key === 'view') {
        select(action.country);
        return;
      }
      openSend(action.destination, action.type);
    },
    [select, openSend],
  );

  const inkByCountry = useMemo(
    () => inkByClaimedCountry([view.me, ...view.opponents]),
    [view.me, view.opponents],
  );

  // Ground markers (outposts, stacks, sited constructions) wait for the server to serve
  // positions — see `MapMarker`: nothing to plant while 4.7 does not exist.
  const labels = useMemo(() => buildLabels(view, []), [view]);

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
          selectedCountry={country ?? null}
          playerNation={view.me.nation}
          indicators={toggles}
          accentedMovement={hoveredMovement}
          onSelect={select}
          onRegionHover={setHoveredRegion}
          onArcHover={setHoveredArc}
          onLabelHover={setHoveredLabel}
          compassOf={compassOfTarget}
          onCompassAction={actOnCompass}
        />
        {country && <SelectedCountryPanel country={country} view={view} />}
        <MovementTimeline
          view={view}
          hoveredMovement={hoveredMovement}
          mapDesignatedMovement={mapDesignatedMovement}
          onHover={setHoveredCard}
          onSelect={select}
        />
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-3">
          {hoveredRegion && <RegionTooltip name={hoveredRegion} />}
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
                <ProductionWindow key={name} nation={view.me.nation} token={token} {...windowProps} />
              );
            case 'nation':
              return <NationWindow key={name} view={view} token={token} {...windowProps} />;
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
