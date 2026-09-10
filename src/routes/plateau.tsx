import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import {
  ARRIVAL_RADIUS_KM,
  LISTENING_STATION_RADIUS_KM,
  outpostReachKm,
  detectionRangeOf,
  SURVEY_FADED_HOURS,
} from '../../convex/constants';
import { fr } from '@/i18n/fr';
import { ControlsCard } from '@/map/ControlsCard';
import { WorldMap, type PlacingBuilding } from '@/map/WorldMap';
import { Shell } from '@/shell/Shell';
import { useClock } from '@/shell/clock';
import { ErrorScreen } from '@/shell/ErrorScreen';
import { StaleToken } from '@/shell/StaleToken';
import { buildLabels, type MapMarker, type Reach } from '@/domain/labels';
import { RESOURCES, type BuildingKey, type UnitRole } from '@/domain/ids';
import { COUNTRY_BY_NATION, inkByClaimedCountry, isNation } from '@/domain/nations';
import { surveyWash } from '@/domain/control';
import { carryCapacityOf } from '@/domain/loot';
import { CARRY_CAPACITY_BY_ROLE } from '../../convex/constants';
import { buildingSprite } from '@/emblems/buildings/manifest';
import type { LonLat } from '@/domain/geo';
import { positionAt } from '@/domain/interception';
import { DEPOSIT_REGIONS, type RegionIdentity, type World } from '@/domain/world';
import { compassOf, type CompassAction, type CompassTarget } from '@/domain/compass-rose';
import { knownObjectiveAt } from '@/domain/objectives';
import { placementOf } from '@/domain/construction';
import { asDuration } from '@/domain/duration';
import type { Column, MovementAim } from '@/domain/movement-orders';
import type {
  ArcView,
  Cost,
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
import { usePresence } from '@/data/presence';
import { adaptServerView } from '@/data/serverView';
import { useTelegraph } from '@/data/telegraph';
import { errorCode, handleError } from '@/data/errors';
import { notify } from '@/shell/notifications';
import { ConstructionPanel } from './-plateau/ConstructionPanel';
import { GarrisonPanel } from './-plateau/GarrisonPanel';
import {
  MovementPreview,
  wireOrigin,
  wireTarget,
  type PreviewMission,
  type Previewed,
} from './-plateau/MovementPreview';
import { GroundPanel } from './-plateau/GroundPanel';
import { NextActions } from './-plateau/NextActions';
import { BriefingSheet } from './-plateau/BriefingSheet';
import { TroopBadge } from './-plateau/TroopBadge';
import { LootCrateCard } from './-plateau/LootCrateCard';
import type { LootRumor } from './-plateau/JournalWindow';

type BuildingSite = { regionId: string; x: number; y: number };

/** Ce que la carte dessine, plus la clé que le plateau commande : la carte n'a pas à savoir ce
 *  qu'elle tient — elle sait où ça peut tomber, et rend le point. */
type HeldBuilding = PlacingBuilding & { readonly key: BuildingKey };

/** The garrison panel's subject and the point it is anchored to. */
type OpenGarrison = {
  readonly station: TroopStation;
  readonly preselect: ReadonlyArray<string>;
  readonly x: number;
  readonly y: number;
};

type OpenLoot = { readonly id: string; readonly x: number; readonly y: number };

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
 * **La force désignée sur la carte**, et le point où le cartouche se pose. Une troupe seule quand
 * le clic gauche l'a désignée ; la pile entière quand une garnison ou la rose l'a armée — le
 * cartouche porte alors l'état de la visée, qui n'a plus de fenêtre à lui (décision du 30/08).
 */
type PostedForce = {
  readonly station: Extract<TroopStation, { readonly kind: 'point' }>;
  readonly troops: ReadonlyArray<TroopView>;
  readonly labelId: string;
  readonly x: number;
  readonly y: number;
};

/** An aim named on the map: what the preview card sits on and what the mutation will carry. */
/**
 * **Ce que la carte a déjà décidé, en attente de la confirmation au bout de l'arc.** Trois
 * missions et pas une de plus : la marche ordinaire, l'expédition sur un site relevé, le
 * ramassage d'une caisse relevée. Chacune a son aperçu et sa mutation — un seul objet à champs
 * optionnels aurait laissé au rendu le soin de deviner laquelle.
 */
type Order = {
  readonly aim: MovementAim;
  readonly type: MovementType;
  readonly label: string;
  readonly x: number;
  readonly y: number;
} & (
  | { readonly mission: 'march' }
  | { readonly mission: 'plunder'; readonly buildingId: string }
  | { readonly mission: 'collect'; readonly sightingId: string }
);

/** The three buildings that station a column — their mast opens a garrison. Since ADR 0019 they
 *  no longer decide what it may ask for, only where a domain gate is read. */
const PROJECTION_KEYS: ReadonlyArray<BuildingKey> = Object.values(PROJECTION_BY_DOMAIN);

const JournalWindow = lazy(() =>
  import('./-plateau/JournalWindow').then((module) => ({ default: module.JournalWindow })),
);
const SiteModal = lazy(() =>
  import('./-plateau/SiteModal').then((module) => ({ default: module.SiteModal })),
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
const GunneryWindow = lazy(() =>
  import('./-plateau/GunneryWindow').then((module) => ({ default: module.GunneryWindow })),
);
const PressWindow = lazy(() =>
  import('./-plateau/PressWindow').then((module) => ({ default: module.PressWindow })),
);

const WINDOWS = [
  'journal',
  'telegraph',
  /** **Pas d'entrée de rail** : la modale d'un site s'ouvre au clic gauche sur son mât, et de
   *  nulle part ailleurs (59a). Elle est ici parce qu'elle est une fenêtre comme les autres —
   *  même pile, même Échap, même URL partageable — et le bâtiment qu'elle sert est `building`. */
  'site',
  'economy',
  'nation',
  'settings',
  /** L'abaque de tir a pris l'entrée de rail que l'onglet « prod. » a libérée (59a, contrat 06) :
   *  il faut pouvoir le lire sans posséder un seul bâtiment de projection. */
  'gunnery',
  /** La presse : le classement à l'heure du dernier relevé. Elle ne commande rien — on la
   *  ferme, et c'est la seule action que le contrat 07 lui accorde. */
  'press',
] as const;

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
  barracks: 'site',
  airfield: 'site',
  port: 'site',
  /** Les baraquements ne forment rien : ils portent le plafond, et leur ligne vit au recensement
   *  de la projection avec les trois autres (fenêtre Économie). */
  billets: 'economy',
};

/** The two surfaces a focus can live in. Closing one of them lets it go — there is a single
 *  `building` in the URL, so a focus that outlived its window would resurface unasked. The
 *  nation sheet left the list with its census: it names no building any more. */
const FOCUSED_WINDOWS: ReadonlyArray<BoardWindow> = ['economy', 'site'];

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
  usePresence(token);
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
  /**
   * **Un bâtiment tenu en main, en attente du point où il se pose** (ADR 0013, révision du
   * 04/09) : le port et lui seul. C'est le cousin de la visée — même priorité sur les clics,
   * Échap le lâche, aucune rose ne s'ouvre pendant — et il vit ici parce que c'est un geste de
   * carte, comme la visée et l'ordre de mobilisation.
   */
  const [placing, setPlacing] = useState<HeldBuilding | null>(null);
  // Two sources for one accent: a thread caught anywhere along its length, and the pawn's own
  // label. They are separate because the render loop announces "nothing under the pointer" on
  // the frame after the pointer slides from one to the other, and a single variable would let
  // that echo erase the accent the other just lit.
  const [hoveredArc, setHoveredArc] = useState<string | null>(null);
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
  const [posted, setPosted] = useState<PostedForce | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{
    readonly ids: ReadonlyArray<string>;
    readonly places?: ReadonlyArray<LonLat>;
    readonly nonce: number;
  } | null>(null);
  const [selectedRumorId, setSelectedRumorId] = useState<string | null>(null);
  const [selectedLoot, setSelectedLoot] = useState<OpenLoot | null>(null);
  /**
   * **The mobilisation order, armed.** The season still owes free placements, the player has
   * clicked one of its keys, and the board is waiting for the ground. It lives here beside the
   * other two map gestures — a construction site and an aim — because it is one of them: a
   * click on the map that means something because of what is armed.
   */
  const [mobilized, setMobilized] = useState<BuildingKey | null>(null);
  const [mobilizeError, setMobilizeError] = useState<string | null>(null);
  const toggles = useIndicatorToggles();
  const hoveredMovement = hoveredLabel ?? hoveredArc;
  const lootRumors = useQuery(api.lootRumors.list, { token });
  const searchArea = useMemo(() => {
    const rumor = lootRumors?.find((candidate) => candidate.id === selectedRumorId);
    if (rumor === undefined) return null;
    return {
      center: [rumor.center.lon, rumor.center.lat] as LonLat,
      radiusKm: rumor.radiusKm,
      state: rumor.state,
    };
  }, [lootRumors, selectedRumorId]);

  /**
   * **Le repère des panneaux est le plateau, jamais la fenêtre.** Ils sont posés en absolu dans
   * ce cadre — qui commence sous la manchette et le bandeau, et à droite du rail — alors que le
   * clic arrive en coordonnées d'écran. Les convertir contre `document.body` les décalait de la
   * hauteur des barres et de la largeur du rail ; le décalage a grandi avec le bandeau des
   * ressources, et un cartouche qui ne tombe pas sur son sprite ne désigne plus rien.
   */
  const board = useRef<HTMLDivElement>(null);
  /** Le point du plateau où poser un panneau. Sans pointeur — une ligne de la carte « à faire
   *  maintenant » ouvre la même porte au clavier comme à la souris — il se pose au centre plutôt
   *  que dans le coin haut-gauche, où il masquerait le bandeau. */
  const boardPoint = useCallback((clientX?: number, clientY?: number) => {
    const rect = board.current?.getBoundingClientRect();
    if (clientX === undefined || clientY === undefined)
      return { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 };
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);

  const openLoot = useCallback(
    (ids: ReadonlyArray<string>, clientX: number, clientY: number) => {
      const first = ids[0];
      if (first === undefined) return;
      const at = boardPoint(clientX, clientY);
      setSelectedLoot((previous) => {
        const rank = previous === null ? -1 : ids.indexOf(previous.id);
        return { id: ids[(rank + 1) % ids.length] ?? first, ...at };
      });
    },
    [boardPoint],
  );

  /** A negative observation removes the private marker and any card still attached to it. */
  useEffect(() => {
    setSelectedLoot((previous) =>
      previous !== null &&
      !view.lootSightings.some((sighting) => sighting.id === previous.id && sighting.present)
        ? null
        : previous,
    );
  }, [view.lootSightings]);

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
  const selectRumor = useCallback(
    (rumor: LootRumor) =>
      setSelectedRumorId((selected) => (selected === rumor.id ? null : rumor.id)),
    [],
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
      /** **Un observateur lit sa garnison, il ne la compose plus** (décision du 31/08) : les
       *  cases partent avec `observing` et « préparer » avec elles, mais le panneau s'ouvre —
       *  une porte qui ne s'ouvre que parfois se lit comme une panne, et ses troupes restent
       *  les siennes à regarder. */
      setGarrison({ station, preselect, ...at });
      const marker = markerOfStation(view, station);
      if (marker !== null) setFocus({ ids: [marker], nonce: Date.now() });
    },
    [view],
  );

  /**
   * **Recentrer, jamais commander.** La fiche de nation nomme une adresse, le plateau est ce qui
   * s'y rend : une station qui a un marqueur est cadrée par lui, une pile posée par son point.
   */
  const locateStation = useCallback(
    (station: TroopStation) => {
      const marker = markerOfStation(view, station);
      if (marker !== null) setFocus({ ids: [marker], nonce: Date.now() });
    },
    [view],
  );

  /**
   * **Un clic sur un mât ouvre ce à quoi ce bâtiment sert**, et il n'y a plus qu'une réponse par
   * bâtiment (61a). Pour un site de projection c'est sa modale — ce qu'il forme et ce qu'il tient
   * debout, composition de pile comprise ; pour les autres, la surface où vit leur ligne. La clé
   * se lit dans la vue plutôt que dans l'URL, donc une instance rasée n'en trouve simplement
   * aucune.
   *
   * **Sauf quand une colonne s'y tient : ce à quoi le bâtiment sert, c'est alors elle.** Un
   * bâtiment sans modale de site — le quartier général au premier chef — n'a pas de cadre qui
   * porte une garnison, et la troupe offerte au lancement y stationne (`seasons.endow`). Elle se
   * lisait sur la fiche de nation et ne se manœuvrait nulle part : depuis la disparition du
   * widget de troupes (30/08), plus aucune porte n'ouvrait sa pile. Le mât garde donc **une**
   * destination — il n'y a jamais deux réponses au même clic, l'une exclut l'autre — mais elle
   * suit ce qui se tient là : une garnison quand il y en a une, la ligne du bâtiment sinon.
   */
  const openBuilding = useCallback(
    (buildingId: string, clientX?: number, clientY?: number) => {
      const standing = view.me.buildings.find((candidate) => candidate.id === buildingId);
      if (standing === undefined) return;
      /** La modale ferme la visée en cours : elle est le début d'un ordre, pas son milieu. */
      if (PROJECTION_KEYS.includes(standing.key)) {
        setGarrison(null);
        setColumn(null);
        setOrder(null);
        setPosted(null);
        setFocus({ ids: [`building-${standing.regionId}-${standing.key}`], nonce: Date.now() });
      } else if (!view.me.defeated) {
        /** **L'observateur garde la ligne, pas la pile** (décision du 31/08) : le panneau de
         *  garnison n'a qu'une sortie — « préparer » — et l'ouvrir à un défait promettrait
         *  l'ordre que `requirePlayable` refuse. Son mât continue donc d'ouvrir la ligne du
         *  bâtiment, et ses troupes se lisent où elles se lisent déjà pour tous — la fenêtre
         *  Nation, une ligne par station (`stationGroups`). */
        const station: TroopStation = { kind: 'building', buildingId };
        if (troopsAt(view.me, stationKeyOf(station), marching).length > 0) {
          openGarrison(station, [], boardPoint(clientX, clientY));
          return;
        }
      }
      void navigate({
        search: (previous) => ({
          ...withWindow(previous, WINDOW_OF_BUILDING[standing.key]),
          building: buildingId,
        }),
      });
    },
    [navigate, openGarrison, boardPoint, view.me, marching],
  );

  /**
   * **La troisième porte de la même garnison** : la pile posée sur la carte. Rien de coché
   * d'avance — on ouvre ce qui se tient là, on compose ensuite, comme sur un mât.
   *
   * Il rend vrai quand le clic a **désigné** une troupe : la carte ouvre alors sa rose sur le
   * sprite, en même temps que le cartouche (`WorldMap`). La règle qui sépare les deux réponses
   * reste ici, parce que c'est ici qu'on sait ce qui se tient là.
   */
  const openStack = useCallback(
    (station: TroopStation, clientX: number, clientY: number): boolean => {
      const at = boardPoint(clientX, clientY);
      /**
       * **Une seule troupe ne compose rien** (décision Pierre, 29/08) : elle se désigne, et la
       * carte répond — planche surlignée, cercle de détection, cartouche d'état. La fenêtre est
       * pour les piles ; la servir ici faisait payer un formulaire pour trois lignes.
       */
      const held = troopsAt(view.me, stationKeyOf(station), marching);
      const alone = held.length === 1 ? held[0] : undefined;
      if (alone === undefined || station.kind !== 'point') {
        openGarrison(station, [], at);
        return false;
      }
      /**
       * **Désigner une troupe, c'est l'armer** (décision Pierre, 29/08, tenue le 31/08). Le geste
       * ne propose rien : il dit *celle-ci*, le cartouche la lit, et la destination se nomme au
       * clic droit **ailleurs** — une branche « envoyer » sur le sprite n'aurait fait qu'ajouter
       * un cran à un état déjà pris.
       */
      setGarrison(null);
      setOrderError(null);
      setOrder(null);
      setPosted({ station, troops: [alone], labelId: `stack-${stationKeyOf(station)}`, ...at });
      /** Le cartouche d'un observateur se lit — encre, effectif, abaque de tir — mais désigner
       *  n'arme plus rien : il n'a plus d'ailleurs à nommer (décision du 31/08). */
      if (!view.me.defeated) setColumn(armedColumn(view, station, [alone.id]));
      return true;
    },
    [openGarrison, boardPoint, view, marching],
  );

  /**
   * The fan the right click opens. Armed, it holds **only** the marches the server will accept
   * for that target — same function, same rule (ADR 0015). Unarmed, it is the ordinary fan.
   */
  /**
   * **Ce que la pile armée peut encore charger**, sa charge en cours déduite : le seul chiffre
   * qui décide si « ramasser » existe. `carryCapacityOf` est la fonction que le serveur mesure
   * avec (`convex/cargo.ts`) — une seconde table de ce qui tient à bord serait exactement la
   * divergence que l'ADR 0015 interdit à la rose.
   */
  const freeCapacity = useMemo(() => {
    if (column === null) return 0;
    const picked = new Set(column.troopIds);
    const capacity = carryCapacityOf(
      view.me.troops.filter((troop) => picked.has(troop.id)),
      CARRY_CAPACITY_BY_ROLE,
    );
    const carried = view.me.stationedCargo
      .filter((group) => group.troopIds.some((troopId) => picked.has(troopId)))
      .reduce((total, group) => total + group.cargo.carried, 0);
    return Math.max(0, capacity - carried);
  }, [column, view.me.troops, view.me.stationedCargo]);

  const compassOfTarget = useCallback(
    (target: CompassTarget) =>
      compassOf(
        target,
        view,
        column?.rule ?? null,
        objectiveUnder(target, view),
        column?.station ?? null,
        freeCapacity,
      ),
    [view, column, freeCapacity],
  );

  const foundHere = useMutation(api.movements.foundOutpostHere);
  const startConstruction = useMutation(api.constructions.start);

  const actOnCompass = useCallback(
    (action: CompassAction, at: { x: number; y: number }) => {
      switch (action.key) {
        case 'build':
          setBuildingSite({ regionId: action.regionId, x: at.x, y: at.y });
          return;
        /**
         * **L'élévation part de la carte, par la mutation d'`UpgradeControl` et pas une autre**
         * (décisions 54a et 57a). Le doublon est assumé — monter un niveau se fait ici et dans
         * les fenêtres — mais il n'y a toujours qu'un seul appelant de `constructions.start` par
         * surface, et c'est la même fonction que le serveur refuse. Le refus a déjà été lu par
         * `upgradeHold` avant l'ouverture ; ce qui reste est la course — deux clics dans la même
         * seconde — et elle se dit au bandeau d'erreur du plateau, comme un refus de fondation.
         */
        case 'upgrade':
          setOrderError(null);
          startConstruction({
            token,
            building: action.buildingKey,
            regionId: action.regionId,
          }).catch((problem: unknown) => handleError(problem, setOrderError));
          return;
        case 'aim':
          setOrder({
            mission: 'march',
            aim: action.aim,
            type: action.type,
            label: action.label,
            x: at.x,
            y: at.y,
          });
          return;
        /**
         * **Piller ou saboter — un seul ordre, la même carte de confirmation** (S8). Le type sur
         * le fil reste `march` : l'expédition marche jusqu'au site, et ce qui la distingue est ce
         * qu'elle y fait, que le serveur seul écrit (`movements.plunder`).
         */
        case 'plunder':
          setOrder({
            mission: 'plunder',
            buildingId: action.buildingId,
            aim: action.aim,
            type: 'march',
            label: action.label,
            x: at.x,
            y: at.y,
          });
          return;
        case 'collect':
          setOrder({
            mission: 'collect',
            sightingId: action.sightingId,
            aim: {
              kind: 'point',
              lon: action.point[0],
              lat: action.point[1],
              onLand: true,
              coastal: false,
            },
            type: 'march',
            label: action.label,
            x: at.x,
            y: at.y,
          });
          return;
        /**
         * **La fondation, depuis le clic droit sur la pile qui fonde** (décision du 29/08). Elle
         * pose « relais » : le serveur exige un mot à l'insertion et la carte n'est pas le lieu
         * d'un formulaire — c'est le panneau du point, une fois planté, qui rattrape ce choix
         * tant qu'aucune passe ne l'a lu (`movements.respecialize`).
         */
        case 'found':
          setOrderError(null);
          foundHere({
            token,
            point: { lon: action.point[0], lat: action.point[1] },
            /** Le sol sous la pile, tel que la carte le dessine : le serveur n'a pas les
             *  polygones et ne peut que vérifier le pays. Au dézoom il n'y a pas de région, et
             *  `null` laisse le repli répondre. */
            regionId: action.regionId,
            specialization: 'relay',
            troopIds: action.troopIds.map((troopId) => troopId as Id<'troops'>),
          }).then(
            () => {
              setPosted(null);
              setColumn(null);
            },
            (problem: unknown) => handleError(problem, setOrderError),
          );
      }
    },
    [foundHere, startConstruction, token],
  );

  /** Fermer le cartouche lâche tout : désigner et armer sont deux crans du même geste, et le
   *  cartouche est ce qui les porte tous les deux. */
  const releasePosted = useCallback(() => {
    setPosted(null);
    setColumn(null);
    setOrder(null);
  }, []);

  /**
   * **Échap lâche la visée, et la désignation avec elle** : désigner une troupe l'arme, donc les
   * deux sont un seul état et une seule sortie. La rose arrête la touche avant nous quand elle
   * est ouverte.
   */
  useEffect(() => {
    if (column === null && posted === null) return;
    const disarm = (event: KeyboardEvent) => {
      if (event.key === 'Escape') releasePosted();
    };
    document.addEventListener('keydown', disarm);
    return () => document.removeEventListener('keydown', disarm);
  }, [column, posted, releasePosted]);

  /** **Échap rend la carte intacte** : rien n'a été enfilé, il n'y a donc rien à défaire. */
  useEffect(() => {
    if (placing === null) return;
    const drop = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlacing(null);
    };
    document.addEventListener('keydown', drop);
    return () => document.removeEventListener('keydown', drop);
  }, [placing]);

  /**
   * **Le clic sur le rivage commande le chantier**, par la mutation qui commande tous les
   * autres : le mode de pose n'a rien ajouté au flux, il a seulement retardé l'appel du temps
   * qu'un point soit nommé. Le refus se lit au bandeau du plateau, comme une fondation refusée.
   */
  const placePort = useCallback(
    (point: LonLat) => {
      if (placing === null) return;
      const ordered = placing;
      setPlacing(null);
      setOrderError(null);
      startConstruction({
        token,
        building: ordered.key,
        regionId: ordered.regionId,
        point: { lon: point[0], lat: point[1] },
      }).then(
        () => notify(fr.construction.queued(fr.buildings[ordered.key]), 'info'),
        (problem: unknown) => handleError(problem, setOrderError),
      );
    },
    [placing, startConstruction, token],
  );

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
  /**
   * **La couleur du sol, servie par sa propre query** (ADR 0020 §1) : elle ne bouge qu'à la
   * fondation ou à la perte d'un avant-poste, là où `PlayerView` se réinvalide au moindre pas
   * d'une colonne. Les coudre ensemble ferait recalculer 4 589 régions pour une troupe qui
   * marche. Le temps que la première réponse arrive, la carte est simplement sans teinte.
   */
  const heldRaw = useQuery(api.control.held, { token });
  /**
   * **L'ancienneté d'un relevé se voit sur la carte, pas au survol** (ADR 0020 §5) : une région à
   * jour est franche, un relevé ancien est délavé. Le battement est à la minute — `surveyWash`
   * rend une valeur crantée, donc la géométrie ne se refond qu'au changement de cran, et
   * `showHeld` ignore une liste identique.
   */
  const surveyClock = useClock(60_000);
  const held = useMemo(
    () =>
      (heldRaw ?? []).map(({ ink, regions }) => ({
        ink,
        regions: regions.map((region) => ({
          id: region.id,
          wash:
            region.state === 'current'
              ? 1
              : surveyWash(surveyClock - region.seenAt, SURVEY_FADED_HOURS * 3_600_000),
        })),
      })),
    [heldRaw, surveyClock],
  );

  /**
   * **Ce que le survol lit du tenant d'une région — la même réponse que la carte peint**, indexée.
   * La nation vient de la revendication, jamais des avant-postes de la vue : `me.outposts` ne dit
   * que ce que le joueur a planté *dans ce pays-ci*, et une région tenue depuis le pays voisin s'y
   * lisait « avant-poste : aucun » pendant que la carte la peignait (correctif du 31/08).
   */
  const knownRegionById = useMemo(
    () =>
      new Map(
        (heldRaw ?? []).flatMap((claim) =>
          claim.regions.map((region) => [region.id, { ...region, nation: claim.nation }] as const),
        ),
      ),
    [heldRaw],
  );

  const built = useMemo(
    () => ({
      regionIds: view.me.buildings.map(({ regionId }) => regionId),
      ink: view.me.ink,
    }),
    [view.me.buildings, view.me.ink],
  );

  // Buildings hang from a region id and the map layer resolves it — **sauf le port**, qui porte
  // le point de côte choisi à la pose (ADR 0013, révision du 04/09) ; un outpost carries its own
  // point, because it *is* a point and colours no ground (fiche 03). Sited constructions still
  // wait for 4.7 to serve positions — see `MapMarker`.
  const markers = useMemo<ReadonlyArray<MapMarker>>(() => {
    const loot: ReadonlyArray<MapMarker> = view.lootSightings
      .filter((sighting) => sighting.present)
      .map((sighting) => ({
        kind: 'loot' as const,
        id: `loot-${sighting.id}`,
        sightingId: sighting.id,
        lonLat: sighting.point,
        current: sighting.current,
      }));
    /**
     * **Toute la géologie, pas seulement la sienne** (décision 65a du 01/09). La bascule dessinait
     * `me.regions` au nom de l'ADR 0005 : contresens, elle protège les *joueurs* — positions,
     * mouvements, tenants — et le sol n'est ni l'un ni l'autre. Un gisement est fixe, identique
     * pour tout le monde et connu d'un atlas ; le cacher n'apprenait rien à personne sur
     * l'adversaire et laissait le joueur ignorer où le pétrole se prend. La source est l'asset
     * (`DEPOSIT_REGIONS`), donc aucune donnée de joueur n'entre ici — les marqueurs n'ont ni
     * encre ni ligne, et ils suivent la couche des régions comme avant (`withRegionLayer`) :
     * au dézoom, rien ne pleut sur la carte.
     */
    const deposits: ReadonlyArray<MapMarker> = toggles.deposits
      ? DEPOSIT_REGIONS.map(([regionId, deposit]) => ({
          kind: 'deposit' as const,
          id: `deposit-${regionId}`,
          regionId,
          deposit,
        }))
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
      /** **Le mât ouvre la garnison** : la colonne qui a fondé stationne là (ADR 0019 §1), et
       *  depuis la disparition du widget de troupes plus rien ne l'ouvrait. */
      station: { kind: 'outpost', outpostId: outpost.id },
      specialization: outpost.specialization,
      level: outpost.level,
      garrison: outpost.garrison,
      /** **Ce qu'il écoute est ce qu'il ravitaille** : le même rayon, montré au survol. Le
       *  relais couvre le même cercle mais n'y relève rien — c'est le temps de trajet qu'il
       *  change, et la carte n'a pas de trait pour dire une vitesse. */
      reach:
        outpost.specialization === 'listening'
          ? { lonLat: outpost.lonLat, km: outpostReachKm(outpost.level) }
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

    /**
     * **Ce qu'on a relevé chez l'autre se tient sur la carte** (S8) : sans mât, l'expédition
     * n'avait aucune poignée — un ordre existait côté serveur que rien à l'écran ne pouvait
     * nommer. Le point exact d'un site adverse n'est pas servi : le relevé porte la région, et
     * le mât se pose à son centroïde, comme un gisement. Il suit le même interrupteur que les
     * mâts à soi, parce que c'est le même encombrement.
     */
    const surveyed: ReadonlyArray<MapMarker> = view.surveyedInstallations.map((installation) => ({
      kind: 'installation' as const,
      id: `installation-${installation.id}`,
      buildingId: installation.id,
      key: installation.key,
      regionId: installation.regionId,
      name: fr.buildings[installation.key],
      plate: buildingSprite(installation.key),
      washed: knownRegionById.get(installation.regionId)?.state !== 'current',
    }));

    if (!toggles.buildings) return [...deposits, ...loot, ...outposts, ...stacks];
    const host = isNation(view.me.nation) ? COUNTRY_BY_NATION[view.me.nation] : null;
    const work = view.me.construction;
    const finishesAt = work === null ? null : view.loadedAt + work.minutesLeft * 60_000;
    const pointOfRegion = new Map(view.me.regions.map((region) => [region.id, region.point]));
    const standing = view.me.buildings.map((building) => ({
      kind: 'building' as const,
      id: `building-${building.regionId}-${building.key}`,
      buildingId: building.id,
      key: building.key,
      regionId: building.regionId,
      lonLat: building.point,
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
              key: work.key,
              regionId: work.regionId,
              lonLat: work.point,
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
    return [...deposits, ...loot, ...surveyed, ...outposts, ...stacks, ...standing, ...raising];
  }, [
    marching,
    view.me,
    view.loadedAt,
    view.lootSightings,
    view.surveyedInstallations,
    knownRegionById,
    toggles.buildings,
    toggles.deposits,
  ]);

  const labels = useMemo(() => buildLabels(view, markers), [view, markers]);

  /**
   * **Le cercle de détection de la troupe désignée** (ADR 0019 §5) : le seul détecteur qui soit
   * une troupe, et le seul chiffre qui dise ce que la poser rapporte. Il est rendu comme le cercle
   * d'écoute — une onde, pas une couche — et part avec la désignation.
   */
  const postedReach = useMemo<Reach | null>(
    () =>
      posted === null
        ? null
        : {
            lonLat: posted.station.lonLat,
            km: detectionRangeOf(posted.troops.map((troop) => troop.role)),
          },
    [posted],
  );
  const movementReach = useMemo<Reach | null>(() => {
    const movement = view.arcs.find(
      (arc): arc is Extract<ArcView, { state: 'mine' }> =>
        arc.state === 'mine' && arc.id === hoveredMovement,
    );
    if (movement === undefined) return null;
    const roles = (Object.entries(movement.stack) as ReadonlyArray<[UnitRole, number | undefined]>)
      .filter(([, count]) => (count ?? 0) > 0)
      .map(([role]) => role);
    const elapsed = Math.max(0, surveyClock - view.loadedAt);
    const progress =
      movement.progress >= 1 || movement.minutesLeft <= 0
        ? 1
        : Math.min(
            1,
            movement.progress +
              ((1 - movement.progress) * elapsed) / (movement.minutesLeft * 60_000),
          );
    return {
      lonLat: positionAt(
        {
          id: movement.id,
          points: movement.route.points,
          legs: movement.route.legs,
          distanceUnits: movement.route.distanceUnits,
          landCost: movement.route.landCost,
          departedAt: 0,
          arrivesAt: 1,
        },
        progress,
      ),
      km: detectionRangeOf(roles),
    };
  }, [hoveredMovement, surveyClock, view.arcs, view.loadedAt]);
  const selectedLootSighting =
    selectedLoot === null
      ? null
      : (view.lootSightings.find(
          (sighting) => sighting.id === selectedLoot.id && sighting.present,
        ) ?? null);
  const postedCargo = useMemo(
    () =>
      posted === null
        ? []
        : view.me.stationedCargo
            .filter((group) =>
              group.troopIds.some((troopId) => posted.troops.some((troop) => troop.id === troopId)),
            )
            .map((group) => ({
              id: group.troopIds.join('-'),
              cargo: group.cargo,
              carriers: group.troopIds.length,
            })),
    [posted, view.me.stationedCargo],
  );

  const closeWindow = useCallback(
    (name: BoardWindow) => {
      void navigate({ search: (previous) => withoutWindow(previous, name) });
    },
    [navigate],
  );

  const openWindow = useCallback(
    (name: BoardWindow) => {
      void navigate({ search: (previous) => withWindow(previous, name) });
    },
    [navigate],
  );

  /**
   * **Une pile composée, armée** — depuis le panneau d'une garnison posée ou depuis la modale
   * d'un site, qui porte la même composition depuis la décision 61a. Un seul chemin, parce
   * qu'il n'y a qu'un flux : composer, armer, viser sur la carte.
   */
  const prepareColumn = useCallback(
    (station: TroopStation, troopIds: ReadonlyArray<string>) => {
      /** `home` is the one address no column leaves from — the panel offers nothing there, so
       *  this branch only guards the type. */
      if (station.kind === 'home') return;
      const from = garrison;
      setGarrison(null);
      /** La modale s'efface avec la pile qu'elle vient d'armer : la destination se nomme sur la
       *  carte, et une fenêtre de 1180 pixels par-dessus cacherait la cible. */
      if (station.kind === 'building') closeWindow('site');
      setColumn(armedColumn(view, station, troopIds));
      /**
       * **Le cartouche porte l'état, et il n'y a plus de fenêtre pour le porter à sa place.**
       * Une pile armée depuis une garnison posée sur la carte s'y montre — « pile de 3 »,
       * « choisissez la destination », « échap — désarme ». Depuis un mât ou un avant-poste il
       * n'y a pas d'étiquette de pile à désigner : la visée se lit sur la carte, comme avant.
       */
      if (station.kind !== 'point' || from === null) return;
      setPosted({
        station,
        troops: troopIds.flatMap((troopId) => {
          const troop = view.me.troops.find((candidate) => candidate.id === troopId);
          return troop ? [troop] : [];
        }),
        labelId: `stack-${stationKeyOf(station)}`,
        x: from.x,
        y: from.y,
      });
    },
    [view, garrison, closeWindow],
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

  /**
   * **Un aperçu par mission, et le serveur date toujours seul.** Les trois requêtes coexistent
   * parce qu'aucune ne sait refuser à la place des autres : celle qui ne sert pas est en `skip`,
   * et la carte lit celle de l'ordre en cours.
   */
  const dispatch =
    column === null || order === null
      ? null
      : {
          token,
          origin: wireOrigin(column.station),
          troopIds: column.troopIds.map((troopId) => troopId as Id<'troops'>),
        };
  const marchPreview = useQuery(
    api.movements.preview,
    dispatch === null || order === null || order.mission !== 'march'
      ? 'skip'
      : { ...dispatch, target: wireTarget(order.aim), type: order.type },
  );
  const plunderPreview = useQuery(
    api.movements.previewPlunder,
    dispatch === null || order === null || order.mission !== 'plunder'
      ? 'skip'
      : { ...dispatch, buildingId: order.buildingId as Id<'buildings'> },
  );
  const collectPreview = useQuery(
    api.movements.previewLootCollection,
    dispatch === null || order === null || order.mission !== 'collect'
      ? 'skip'
      : { ...dispatch, sightingId: order.sightingId as Id<'lootCrateSightings'> },
  );
  const preview =
    order === null
      ? undefined
      : order.mission === 'plunder'
        ? plunderPreview
        : order.mission === 'collect'
          ? collectPreview
          : marchPreview;

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
      <div ref={board} className="relative min-w-0 flex-1">
        <WorldMap
          world={world}
          arcs={arcs}
          labels={labels}
          inkByCountry={inkByCountry}
          held={held}
          built={built}
          selectedCountry={country ?? null}
          playerNation={view.me.nation}
          indicators={toggles}
          accentedMovement={hoveredMovement}
          onSelect={select}
          onOpenBuilding={openBuilding}
          onOpenStack={openStack}
          onOpenLoot={openLoot}
          selectedLabel={posted?.labelId ?? null}
          selectedLootLabel={selectedLoot === null ? null : `loot-${selectedLoot.id}`}
          reach={postedReach ?? movementReach}
          onCountryHover={setHoveredCountry}
          onRegionHover={setHoveredRegion}
          onArcHover={setHoveredArc}
          onLabelHover={setHoveredLabel}
          compassOf={compassOfTarget}
          onCompassAction={actOnCompass}
          building={buildingSite !== null}
          placing={placing}
          onPlacePoint={placePort}
          aiming={column !== null}
          designatedRegions={designated}
          onDesignateRegion={placeFoundation}
          focus={focus}
          searchArea={searchArea}
        />
        {selectedLoot !== null && selectedLootSighting !== null && (
          <LootCrateCard
            key={selectedLoot.id}
            sighting={selectedLootSighting}
            at={selectedLoot}
            onClose={() => setSelectedLoot(null)}
          />
        )}
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
            onPlace={(option) =>
              setPlacing({
                regionId: buildingSite.regionId,
                key: option.key,
                sprite: buildingSprite(option.key),
                title: regionName(view, buildingSite.regionId),
                figures: fr.placing.figures(
                  fr.buildings[option.key],
                  priceOf(option.cost),
                  asDuration(option.minutes),
                ),
              })
            }
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
            onPrepare={prepareColumn}
          />
        )}
        {posted && (
          <TroopBadge
            key={posted.labelId}
            nation={view.me.nation}
            troops={posted.troops}
            at={posted}
            aiming={column !== null}
            cargo={postedCargo}
            onOpenGunnery={() => openWindow('gunnery')}
            onClose={releasePosted}
          />
        )}
        {column && order && (
          <MovementPreview
            label={order.label}
            token={token}
            origin={column.station}
            troopIds={column.troopIds}
            aim={order.aim}
            type={order.type}
            at={order}
            preview={preview}
            mission={missionOf(order)}
            freeSlots={view.me.slots.total - view.me.slots.used}
            onClose={() => {
              setOrder(null);
              setColumn(null);
              setPosted(null);
            }}
          />
        )}
        {/* Haut-gauche : le refus de fondation, et lui seul. **Plus rien n'y dit la visée** — le
            cartouche la porte (décision du 30/08). */}
        {orderError !== null && (
          <div className="hud absolute top-4 left-4 z-10 border border-[var(--critical)] bg-[var(--desk)] px-3 py-2 text-[11px] text-[var(--critical)]">
            {orderError}
          </div>
        )}
        {/* Bas-gauche : ce qui attend le joueur, et rien de ce qu'il possède — la carte a
            remplacé le widget de troupes (décision Pierre, 30/08). Vide, elle n'est pas là. */}
        <div className="absolute bottom-4 left-4 z-10">
          <NextActions
            view={view}
            placements={foundation}
            armed={armed}
            error={mobilizeError}
            onArm={(key) => {
              setMobilizeError(null);
              setMobilized(key);
            }}
            onGoToMap={(point) => setFocus({ ids: [], places: [point], nonce: Date.now() })}
            onOpenSurface={openWindow}
            onOpenSite={openBuilding}
          />
        </div>
        <div className="pointer-events-none absolute right-4 bottom-4 z-10 flex flex-col items-end gap-3 [&>*]:pointer-events-auto">
          <GroundPanel
            selected={country ?? null}
            hoveredCountry={hoveredCountry}
            hoveredRegion={hoveredRegion}
            holding={
              hoveredRegion === null ? null : (knownRegionById.get(hoveredRegion.id) ?? null)
            }
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
              return (
                <JournalWindow
                  key={name}
                  view={view}
                  token={token}
                  rumors={lootRumors}
                  selectedRumorId={selectedRumorId}
                  onSelectRumor={selectRumor}
                  {...windowProps}
                />
              );
            case 'telegraph':
              return (
                <TelegraphWindow key={name} telegraph={telegraph} token={token} {...windowProps} />
              );
            case 'site':
              /** Sans bâtiment nommé il n'y a pas de site : l'URL a perdu son ancre, et une
               *  modale sans sujet n'est pas une modale vide, c'est rien du tout. */
              return focused === undefined ? null : (
                <SiteModal
                  key={name}
                  view={view}
                  token={token}
                  buildingId={focused}
                  onOpenGunnery={() => openWindow('gunnery')}
                  onPrepare={prepareColumn}
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
              return (
                <NationWindow key={name} view={view} onLocate={locateStation} {...windowProps} />
              );
            case 'gunnery':
              return <GunneryWindow key={name} token={token} {...windowProps} />;
            case 'press':
              return <PressWindow key={name} press={view.press} {...windowProps} />;
            case 'settings':
              return (
                <SettingsWindow
                  key={name}
                  token={token}
                  mayConclude={view.me.mayConclude}
                  defeated={view.me.defeated}
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
/** L'ordre dit déjà quelle mutation il vise ; la carte n'a qu'à le relire. */
const missionOf = (order: Order): PreviewMission =>
  order.mission === 'plunder'
    ? { kind: 'plunder', buildingId: order.buildingId }
    : order.mission === 'collect'
      ? { kind: 'collect', sightingId: order.sightingId }
      : { kind: 'march' };

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
      /** Servi avec l'adresse et lu sur la grille de routage, jamais déduit de `country` : le
       *  polygone dit « terre » sur des rivages que la grille tient pour de l'eau, et c'est la
       *  grille qui a accepté la visée. Rien n'est recalculé ici — une seconde géométrie côté
       *  client est une seconde réponse. */
      afloat: station.kind === 'point' && station.afloat,
      /** Servi avec l'adresse, jamais recalculé ici — même raison que `afloat` juste au-dessus,
       *  et c'est la grille de routage du serveur qui l'a lu (ADR 0019 §2, révision du 04/09). */
      coastal: station.kind === 'point' && station.coastal,
    },
  };
}

/**
 * The aimed arc, in the `mine` state because it is the player's own: it carries a type and a
 * stack, and the union makes that the only thing it can be. It is a preview and nothing on the
 * board treats it otherwise — it disappears with the card that describes it.
 */
function previewArc(column: ArmedColumn, order: Order, preview: NonNullable<Previewed>): ArcView {
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

/** La région désignée, nommée — la carte de pose dit d'abord *où*, et le joueur vient de fermer
 *  le panneau qui portait ce nom en titre. */
const regionName = (view: PlayerView, regionId: string): string =>
  view.me.regions.find((region) => region.id === regionId)?.name ?? regionId;

/** La facture d'une ligne du panneau, en une phrase — la carte de pose n'a pas la place des
 *  planches illustrées, et elle nomme les mêmes chiffres que la ligne qu'on vient de cliquer. */
const priceOf = (cost: Cost): string =>
  RESOURCES.filter((key) => (cost[key] ?? 0) > 0)
    .map((key) => `${cost[key]} ${fr.resources[key]}`)
    .join(' · ');

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
