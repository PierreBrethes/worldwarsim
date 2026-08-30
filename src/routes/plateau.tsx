import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import {
  ARRIVAL_RADIUS_KM,
  LISTENING_STATION_RADIUS_KM,
  OUTPOST_REACH_KM,
  SCOUT_RADIUS_KM,
} from '../../convex/constants';
import { fr } from '@/i18n/fr';
import { ControlsCard } from '@/map/ControlsCard';
import { WorldMap } from '@/map/WorldMap';
import { Shell } from '@/shell/Shell';
import { ErrorScreen } from '@/shell/ErrorScreen';
import { StaleToken } from '@/shell/StaleToken';
import { buildLabels, type MapMarker, type Reach } from '@/domain/labels';
import type { BuildingKey } from '@/domain/ids';
import { COUNTRY_BY_NATION, inkByClaimedCountry, isNation } from '@/domain/nations';
import { buildingSprite } from '@/emblems/buildings/manifest';
import type { LonLat } from '@/domain/geo';
import type { RegionIdentity, World } from '@/domain/world';
import { compassOf, type CompassAction, type CompassTarget } from '@/domain/compass-rose';
import { knownObjectiveAt } from '@/domain/objectives';
import { placementOf } from '@/domain/construction';
import type { Column, MovementAim } from '@/domain/movement-orders';
import type {
  ArcView,
  MovementType,
  PlayerView,
  Stack,
  TroopStation,
  TroopView,
} from '@/domain/player-view';
import {
  PROJECTION_BY_DOMAIN,
  marchingTroopIds,
  representativeRole,
  stationKeyOf,
  troopsAt,
  type MarchStation,
} from '@/domain/troops';
import { spriteUrl } from '@/emblems/units/manifest';
import { useIndicatorToggles } from '@/data/indicatorToggles';
import { briefingSeen, markBriefingSeen } from '@/data/settings';
import { loadGame } from '@/data/loadGame';
import { adaptServerView, type MovementPreviewed } from '@/data/serverView';
import { useTelegraph } from '@/data/telegraph';
import { errorCode, handleError } from '@/data/errors';
import { ConstructionPanel } from './-plateau/ConstructionPanel';
import { GarrisonPanel } from './-plateau/GarrisonPanel';
import { MovementPreview, wireOrigin, wireTarget } from './-plateau/MovementPreview';
import { GroundPanel } from './-plateau/GroundPanel';
import { TroopsWidget, stationNamer } from './-plateau/TroopsWidget';
import { ReservesPanel } from './-plateau/ReservesPanel';
import { MobilizationCard } from './-plateau/MobilizationCard';
import { BriefingSheet } from './-plateau/BriefingSheet';
import { TroopBadge } from './-plateau/TroopBadge';

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

/**
 * **La troupe désignée sur la carte**, et le point où le cartouche se pose. Une seule : un point
 * qui en porte plusieurs ouvre la garnison, parce qu'il y a alors une pile à composer.
 */
type PostedTroop = {
  readonly station: Extract<TroopStation, { readonly kind: 'point' }>;
  readonly troop: TroopView;
  readonly labelId: string;
  readonly x: number;
  readonly y: number;
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
const EconomyWindow = lazy(() =>
  import('./-plateau/EconomyWindow').then((module) => ({ default: module.EconomyWindow })),
);
const NationWindow = lazy(() =>
  import('./-plateau/NationWindow').then((module) => ({ default: module.NationWindow })),
);
const SettingsWindow = lazy(() =>
  import('./-plateau/SettingsWindow').then((module) => ({ default: module.SettingsWindow })),
);
const TelegraphWindow = lazy(() =>
  import('./-plateau/TelegraphWindow').then((module) => ({ default: module.TelegraphWindow })),
);

const WINDOWS = ['journal', 'telegraph', 'production', 'economy', 'nation', 'settings'] as const;

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
  hq: 'economy',
  farm: 'economy',
  mill: 'economy',
  mine: 'economy',
  oilWell: 'economy',
  foundry: 'economy',
  arsenal: 'economy',
  quartermaster: 'economy',
  warehouse: 'economy',
  depot: 'economy',
  listening: 'economy',
  barracks: 'production',
  airfield: 'production',
  port: 'production',
  billets: 'production',
};

/** The two surfaces a focus can live in. Closing one of them lets it go — there is a single
 *  `building` in the URL, so a focus that outlived its window would resurface unasked. The
 *  nation sheet left the list with its census: it names no building any more. */
const FOCUSED_WINDOWS: ReadonlyArray<BoardWindow> = ['economy', 'production'];

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
 * The outcomes of a failed board subscription. Three are ordinary and get a route of their own:
 * a season still in the lobby and a seat whose owner has not entered the war both send the
 * player back to the lobby, and a token the server does not know gets dropped. Everything else
 * is a genuine failure and says so.
 */
function BoardError({ error, reset }: { error: unknown; reset: () => void }) {
  const code = errorCode(error);
  if (code === 'SEASON_NOT_LAUNCHED' || code === 'NOT_AT_WAR') return <Navigate to="/salon" />;
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
  /**
   * **Une troupe seule est désignée, pas ouverte** (décision Pierre, 29/08). La fenêtre de
   * garnison sert à composer une pile ; un point qui n'en porte qu'une n'a rien à composer, et
   * lui faire payer un formulaire pour trois lignes était le reproche de la première partie.
   * Ce qu'elle vaut se lit sur la carte : sa planche prend l'encre, son cercle de détection
   * s'ouvre, et le cartouche dit le reste.
   */
  const [posted, setPosted] = useState<PostedTroop | null>(null);
  const [foundError, setFoundError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ ids: ReadonlyArray<string>; nonce: number } | null>(null);
  /**
   * **The mobilisation order, armed.** The season still owes free placements, the player has
   * clicked one of its keys, and the board is waiting for the ground. It lives here beside the
   * other two map gestures — a construction site and an aim — because it is one of them: a
   * click on the map that means something because of what is armed.
   */
  const [mobilized, setMobilized] = useState<BuildingKey | null>(null);
  const [mobilizeError, setMobilizeError] = useState<string | null>(null);
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
  /** Une troupe en route n'est pas posée : elle pend du mouvement qui la porte, et c'est son
   *  pion qui la dessine. La même exclusion que le widget, lue sur la même liste. */
  const marching = useMemo(() => marchingTroopIds(view.arcs), [view.arcs]);

  const openGarrison = useCallback(
    (station: TroopStation, preselect: ReadonlyArray<string>, at: { x: number; y: number }) => {
      setColumn(null);
      setOrder(null);
      setPosted(null);
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
   * **La troisième porte de la même garnison** : la pile posée sur la carte. Rien de coché
   * d'avance — on ouvre ce qui se tient là, on compose ensuite, comme sur un mât.
   */
  const openStack = useCallback(
    (station: TroopStation, clientX: number, clientY: number) => {
      const rect = document.body.getBoundingClientRect();
      const at = { x: clientX - rect.left, y: clientY - rect.top };
      /**
       * **Une seule troupe ne compose rien** (décision Pierre, 29/08) : elle se désigne, et la
       * carte répond — planche surlignée, cercle de détection, cartouche d'état. La fenêtre est
       * pour les piles ; la servir ici faisait payer un formulaire pour trois lignes.
       */
      const held = troopsAt(view.me, stationKeyOf(station), marching);
      const alone = held.length === 1 ? held[0] : undefined;
      if (alone === undefined || station.kind !== 'point') {
        openGarrison(station, [], at);
        return;
      }
      setGarrison(null);
      setFoundError(null);
      setPosted({ station, troop: alone, labelId: `stack-${stationKeyOf(station)}`, ...at });
      /**
       * **Désigner une troupe, c'est l'armer** (correctif du 30/08). Le cartouche disait ce
       * qu'elle valait et rien ne pouvait plus la bouger : une troupe seule ne passe par aucune
       * garnison, donc par aucun bouton « préparer », et le clic droit ne trouvait pas de
       * colonne à viser. La désignation *est* la préparation — c'est le seul geste qu'il reste
       * quand il n'y a rien à composer.
       */
      setOrder(null);
      setColumn(armedColumn(view, station, [alone.id]));
    },
    [openGarrison, view, marching],
  );

  /**
   * The fan the right click opens. Armed, it holds **only** the marches the server will accept
   * for that target — same function, same rule (ADR 0015). Unarmed, it is the ordinary fan.
   */
  const compassOfTarget = useCallback(
    (target: CompassTarget) =>
      compassOf(target, view, column?.rule ?? null, objectiveUnder(target, view)),
    [view, column],
  );

  const foundHere = useMutation(api.movements.foundOutpostHere);

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
          return;
        /**
         * **La fondation, depuis le clic droit sur la pile qui fonde** (décision du 29/08). Elle
         * pose « relais » : le serveur exige un mot à l'insertion et la carte n'est pas le lieu
         * d'un formulaire — c'est le panneau du point, une fois planté, qui rattrape ce choix
         * tant qu'aucune passe ne l'a lu (`movements.respecialize`).
         */
        case 'found':
          setFoundError(null);
          foundHere({
            token,
            point: { lon: action.point[0], lat: action.point[1] },
            specialization: 'relay',
            troopIds: action.troopIds.map((troopId) => troopId as Id<'troops'>),
          }).then(
            () => {
              setPosted(null);
              setColumn(null);
            },
            (problem: unknown) => handleError(problem, setFoundError),
          );
      }
    },
    [select, foundHere, token],
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

  /** **Une désignation et la colonne qu'elle arme sont un seul état**, lâché d'un seul geste :
   *  le cartouche fermé, la troupe n'est plus en visée non plus. */
  const releasePosted = useCallback(() => {
    setPosted(null);
    setColumn(null);
    setOrder(null);
  }, []);

  // Une désignation se lâche de la même touche que la visée.
  useEffect(() => {
    if (posted === null) return;
    const release = (event: KeyboardEvent) => {
      if (event.key === 'Escape') releasePosted();
    };
    document.addEventListener('keydown', release);
    return () => document.removeEventListener('keydown', release);
  }, [posted, releasePosted]);

  /**
   * **The keys the season still owes, and the ground each one accepts.** The eligibility is
   * `placementOf` — the placement refusal the server itself raises, read over the player's own
   * regions. Nothing is re-decided here, which is the whole point: the order can only ever
   * highlight ground `constructions.start` would take.
   */
  const foundation = useMemo(
    () => [...new Set(view.me.foundation)].map((key) => placementOf(view, key)),
    [view],
  );

  const designated = useMemo(
    () => foundation.find((placement) => placement.key === mobilized)?.regionIds ?? [],
    [foundation, mobilized],
  );

  // The order disarms itself when its key is paid off: `me.foundation` is what draws the card,
  // so a key that has left it has no line left to be armed on.
  const armed = mobilized !== null && view.me.foundation.includes(mobilized) ? mobilized : null;

  const place = useMutation(api.constructions.start);

  /**
   * **The foundation goes down where it is clicked, through the one mutation that places.**
   * There is no second door: `constructions.start` reads the free placement off `foundationOwed`
   * and stands the building at once — the order only chooses the region, which is the single
   * gesture of the opening that is a decision.
   */
  const placeFoundation = useCallback(
    (regionId: string | null) => {
      if (armed === null || regionId === null) return;
      if (!designated.includes(regionId)) return;
      setMobilizeError(null);
      /**
       * **The key stays armed.** A skirmish owes two mines, and disarming after the first would
       * make the second placement a fresh hunt through the card. It disarms on its own when the
       * debt is paid: `armed` is read off `me.foundation`, which the placement empties.
       */
      place({ token, building: armed, regionId }).catch((problem: unknown) =>
        handleError(problem, setMobilizeError),
      );
    },
    [armed, designated, place, token],
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

  // Buildings hang from a region id and the map layer resolves it; an outpost carries its own
  // point, because it *is* a point and colours no ground (fiche 03). Sited constructions still
  // wait for 4.7 to serve positions — see `MapMarker`.
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
      /** **Ce qu'il écoute est ce qu'il ravitaille** : le même rayon, montré au survol. Le
       *  relais couvre le même cercle mais n'y relève rien — c'est le temps de trajet qu'il
       *  change, et la carte n'a pas de trait pour dire une vitesse. */
      reach:
        outpost.specialization === 'listening'
          ? { lonLat: outpost.lonLat, km: OUTPOST_REACH_KM }
          : null,
      ink: view.me.ink,
    }));

    /**
     * **Une troupe posée se tient sur la carte**, et c'est la seule adresse qui n'a pas déjà un
     * mât : une colonne laissée en campagne, une coque qui tient un bout de mer. Sans ce
     * marqueur elles n'existaient que dans le widget — le joueur lisait « en campagne » sans
     * jamais savoir où. Les autres adresses ne passent pas par ici : une garnison de bâtiment
     * se lit sur sa plaque, celle d'un avant-poste sur son point.
     */
    const stacks: ReadonlyArray<MapMarker> = postedStacks(view.me, marching);

    if (!toggles.buildings) return [...deposits, ...outposts, ...stacks];
    const host = isNation(view.me.nation) ? COUNTRY_BY_NATION[view.me.nation] : null;
    const work = view.me.construction;
    const finishesAt = work === null ? null : view.loadedAt + work.minutesLeft * 60_000;
    const pointOfRegion = new Map(view.me.regions.map((region) => [region.id, region.point]));
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
      /** **Le seul bâtiment qui couvre du terrain**, et le seul dont le rayon décide où on le
       *  pose. Le point est celui de la région tel que le serveur le mesure, jamais celui que
       *  la couche des régions dessine — deux points, deux cercles, et l'un des deux mentirait
       *  sur ce que la station entend vraiment. */
      reach: reachOfStation(building.key, pointOfRegion.get(building.regionId)),
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
              /** Rien ne se tient encore : un chantier n'entend rien. */
              reach: null,
              ink: view.me.ink,
            },
          ];
    return [...deposits, ...outposts, ...stacks, ...standing, ...raising];
  }, [marching, view.me, view.loadedAt, toggles.buildings, toggles.deposits]);

  const labels = useMemo(() => buildLabels(view, markers), [view, markers]);

  /**
   * **Le cercle de détection de la troupe désignée** (ADR 0019 §5) : le seul détecteur qui soit
   * une troupe, et le seul chiffre qui dise ce que la poser rapporte. Il est rendu comme le cercle
   * d'écoute — une onde, pas une couche — et part avec la désignation.
   */
  const postedReach = useMemo<Reach | null>(
    () => (posted === null ? null : { lonLat: posted.station.lonLat, km: SCOUT_RADIUS_KM }),
    [posted],
  );

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

  /**
   * The command sheet, served on a player's very first board and by the settings line after
   * that. The flag is read once at mount: marking it seen inside the season must not make the
   * sheet vanish under a re-render, only stop the *next* arrival from serving it.
   */
  /** **Le canal général se tient au plateau, fenêtre ouverte ou non** : le badge du rail compte
   *  et le tic-tac sonne quand on regarde ailleurs (`telegraph.ts`). */
  const telegraph = useTelegraph(token);

  const [briefing, setBriefing] = useState(() => !briefingSeen());

  /**
   * The morning edition: with **unread** critical news, the journal is already on the desk on
   * arrival. Once per arrival, and never over a deep link asking for another surface.
   *
   * Unread is the whole condition. It used to open on any critical dispatch ever filed, so the
   * same battle greeted a player on every visit until the season ended — a paper that reprints
   * yesterday's headline is not an edition.
   */
  const editionServed = useRef(false);
  useEffect(() => {
    if (editionServed.current) return;
    editionServed.current = true;
    if (windows.length) return;
    if (!view.journal.some((dispatch) => dispatch.unread && dispatch.severity === 'critical'))
      return;
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
    <Shell view={view} telegraphUnread={telegraph.unread}>
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
          onOpenStack={openStack}
          selectedLabel={posted?.labelId ?? null}
          reach={postedReach}
          onCountryHover={setHoveredCountry}
          onRegionHover={setHoveredRegion}
          onArcHover={setHoveredArc}
          onLabelHover={setHoveredLabel}
          compassOf={compassOfTarget}
          onCompassAction={actOnCompass}
          building={buildingSite !== null}
          aiming={column !== null}
          designatedRegions={designated}
          onDesignateRegion={placeFoundation}
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
        {posted && (
          <TroopBadge
            key={posted.labelId}
            nation={view.me.nation}
            troop={posted.troop}
            at={posted}
            onClose={releasePosted}
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
              setPosted(null);
            }}
          />
        )}
        {/* Top left, one column: the mobilisation order stands as long as the season owes
            placements, and the aim banner joins it above rather than covering it. */}
        <div className="pointer-events-none absolute top-4 left-4 z-10 flex flex-col items-start gap-3 [&>*]:pointer-events-auto">
          {column && !order && <AimBanner view={view} column={column} />}
          {foundError !== null && (
            <div className="hud border border-[var(--critical)] bg-[var(--desk)] px-3 py-2 text-[11px] text-[var(--critical)]">
              {foundError}
            </div>
          )}
          <MobilizationCard
            view={view}
            placements={foundation}
            armed={armed}
            error={mobilizeError}
            onArm={(key) => {
              setMobilizeError(null);
              setMobilized(key);
            }}
          />
        </div>
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
              return <JournalWindow key={name} view={view} token={token} {...windowProps} />;
            case 'telegraph':
              return (
                <TelegraphWindow key={name} telegraph={telegraph} token={token} {...windowProps} />
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
            case 'economy':
              return (
                <EconomyWindow
                  key={name}
                  view={view}
                  token={token}
                  focused={focused ?? null}
                  {...windowProps}
                />
              );
            case 'nation':
              return <NationWindow key={name} view={view} {...windowProps} />;
            case 'settings':
              return (
                <SettingsWindow
                  key={name}
                  token={token}
                  founder={view.me.creator}
                  onShowBriefing={() => setBriefing(true)}
                  {...windowProps}
                />
              );
          }
        })}
      </Suspense>
      {briefing && (
        <BriefingSheet
          onDismiss={() => {
            markBriefingSeen();
            setBriefing(false);
          }}
        />
      )}
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
      /** The same reading the server makes with `hostAtPoint`: the station carries the host the
       *  view already resolved, and the open sea is the one that comes back empty. Nothing is
       *  recomputed here — a second geometry on the client is a second answer. */
      afloat: station.kind === 'point' && station.country === '',
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
/**
 * **Les piles posées, une carte par adresse.** Le portrait est celui du rôle majoritaire — la
 * règle du pion d'un mouvement (`movementSprite`), pour qu'une colonne ne change pas de visage
 * en s'arrêtant. Une nation sans planche pour ce rôle rend `null` et l'étiquette retombe sur
 * son pictogramme : c'est un dessin qui manque, jamais une pile qui disparaît.
 */
function postedStacks(
  me: PlayerView['me'],
  marching: ReadonlySet<string>,
): ReadonlyArray<MapMarker> {
  const posts = new Map<
    string,
    { readonly at: Extract<TroopStation, { kind: 'point' }>; readonly held: TroopView[] }
  >();
  for (const troop of me.troops) {
    const at = troop.stationedAt;
    if (marching.has(troop.id) || at.kind !== 'point') continue;
    const key = stationKeyOf(at);
    const post = posts.get(key);
    if (post === undefined) posts.set(key, { at, held: [troop] });
    else post.held.push(troop);
  }

  return [...posts].map(([key, { at, held }]) => {
    const stack: Stack = held.reduce<Stack>(
      (counted, troop) => ({ ...counted, [troop.role]: (counted[troop.role] ?? 0) + 1 }),
      {},
    );
    const face = representativeRole(stack);
    const tier = held.find((troop) => troop.role === face)?.tier ?? 1;
    return {
      kind: 'stack' as const,
      id: `stack-${key}`,
      lonLat: at.lonLat,
      station: at,
      stack,
      plate: face === null ? null : spriteUrl(me.nation, face, tier),
      ink: me.ink,
    };
  });
}

function markerOfStation(view: PlayerView, station: TroopStation): string | null {
  /** Une pile posée a désormais son marqueur : la caméra a où aller quand on ouvre sa carte. */
  if (station.kind === 'point') return `stack-${stationKeyOf(station)}`;
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
    <div className="hud border border-[var(--ink-quiet)] bg-[var(--desk)] px-3 py-2">
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

/** A station is the one building whose radius is a rule (`LISTENING_STATION_RADIUS_KM`); every
 *  other one covers nothing, and a region the view does not carry has no point to draw around. */
const reachOfStation = (key: BuildingKey, point: LonLat | undefined): Reach | null =>
  key === 'listening' && point !== undefined
    ? { lonLat: point, km: LISTENING_STATION_RADIUS_KM }
    : null;

/**
 * **Ce que la vue du joueur donne pour attaquable sous le clic** — et rien d'autre ne répond à
 * cette question (décision Pierre, 29/08). Un avant-poste cliqué en est un par définition : on ne
 * dessine que les siens, et viser le sien reste refusé par `FRIENDLY_TARGET`, pas par ici.
 *
 * `ARRIVAL_RADIUS_KM` est le rayon parce que c'est celui que l'arrivée lira (`defenceNear`) : un
 * objectif hors de ce cercle est un objectif que l'assaut ne trouverait pas.
 */
function objectiveUnder(target: CompassTarget, view: PlayerView): boolean {
  if (target.kind === 'outpost') return true;
  if (target.kind !== 'point') return false;
  return knownObjectiveAt(view, [target.lon, target.lat], target.country, ARRIVAL_RADIUS_KM);
}
