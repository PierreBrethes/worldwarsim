import { Navigate, createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
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
import { ControlsCard, CornerCard } from '@/map/ControlsCard';
import { isTyping } from '@/map/typing';
import type { StackHover } from '@/map/MapLabels';
import { WorldMap, type PlacingBuilding } from '@/map/WorldMap';
import type { PieceClick } from '@/map/engine';
import {
  readWindows,
  withWindow,
  withoutWindow,
  type BoardSearch,
  type BoardWindow,
} from './-plateau/board-search';
import { Shell } from '@/shell/Shell';
import { SelectionSheetReport, sheetHeight, sheetLift } from '@/shell/BottomSheet';
import { useClock } from '@/shell/clock';
import { useNarrowScreen } from '@/shell/viewport';
import { ErrorScreen } from '@/shell/ErrorScreen';
import { StaleSeat } from '@/shell/StaleSeat';
import { buildLabels, type MapLabel, type MapMarker, type Reach } from '@/domain/labels';
import { pilePieces, pileSheet } from '@/domain/pile-pieces';
import { isOutpostWork, RESOURCES, type BuildingKey, type UnitRole } from '@/domain/ids';
import { COUNTRY_BY_NATION, inkByClaimedCountry, isNation } from '@/domain/nations';
import { FADED_WASH, surveyWash } from '@/domain/control';
import { carryCapacityOf } from '@/domain/loot';
import { CARRY_CAPACITY_BY_ROLE } from '../../convex/constants';
import { buildingSprite } from '@/emblems/buildings/manifest';
import { objectiveSprite } from '@/emblems/objectives/manifest';
import { lootWords } from '@/domain/journal';
import { objectiveArchetype } from '../../convex/constants';
import type { LonLat } from '@/domain/geo';
import { positionAt } from '@/domain/interception';
import { DEPOSIT_REGIONS, depositOfRegion, type RegionIdentity, type World } from '@/domain/world';
import {
  compassOf,
  isOrder,
  type Compass,
  type CompassAction,
  type CompassTarget,
  type OrderAction,
} from '@/domain/compass-rose';
import { placementOf } from '@/domain/construction';
import { clickPile, composeHand, type Hand, type PileClick } from '@/domain/hand';
import { asDuration, asLocalTime } from '@/domain/duration';
import type { Column } from '@/domain/movement-orders';
import {
  PREVIEW_ARC_ID,
  type ArcView,
  type CombatReport,
  type Cost,
  type PlayerView,
  type Stack,
  type TroopStation,
  type TroopView,
} from '@/domain/player-view';
import { underwayOf, type RecruitmentDue, type Underway } from '@/domain/underway';
import {
  PROJECTION_BY_DOMAIN,
  marchingTroopIds,
  representativeRole,
  stationAtCombat,
  stationKeyOf,
  troopsAt,
  type MarchStation,
} from '@/domain/troops';
import { pilePlace, placeLabel, stationNames, type RegionAt } from '@/domain/station-name';
import { highlightOf, stackLabelId } from '@/domain/force-highlight';
import { spriteUrl } from '@/emblems/units/manifest';
import { useIndicatorToggles } from '@/data/indicatorToggles';
import { briefingSeen, markBriefingSeen } from '@/data/settings';
import { loadGame } from '@/data/loadGame';
import { adoptSeason } from '@/data/adoptSeason';
import { convexClient } from '@/data/convexClient';
import { usePresence } from '@/data/presence';
import { useBoardView } from '@/data/useBoardView';
import { keepSeat, readSession, type Seat } from '@/data/session';
import { adaptServerView } from '@/data/serverView';
import { useTelegraph } from '@/data/telegraph';
import { errorCode, handleError } from '@/data/errors';
import { notify } from '@/shell/notifications';
import { ConstructionPanel } from './-plateau/ConstructionPanel';
import { GarrisonPanel } from './-plateau/GarrisonPanel';
import { DemolitionCard } from './-plateau/DemolitionCard';
import { DismantleCard } from './-plateau/DismantleCard';
import {
  MovementPreview,
  wireOrigin,
  wireTarget,
  type OrderChoice,
  type Previewed,
  type Sent,
} from './-plateau/MovementPreview';
import { SentNotice } from './-plateau/SentNotice';
import { UnderwayColumn } from './-plateau/UnderwayColumn';
import { LayersGrid, LayersSheet } from '@/shell/LayersSheet';
import { LayersGlyph, Glyph } from '@/shell/Glyph';
import { GroundPanel } from './-plateau/GroundPanel';
import { DispatchSheet } from './-plateau/DispatchSheet';
import { NextActions } from './-plateau/NextActions';
import { debtKey } from './-plateau/FoundationRows';
import { BriefingSheet } from './-plateau/BriefingSheet';
import { HandSheet } from './-plateau/HandSheet';
import { PileSheet } from './-plateau/PileSheet';
import { LootCrateCard } from './-plateau/LootCrateCard';
import { CampBadge } from './-plateau/CampBadge';
import { ObjectiveBadge } from './-plateau/ObjectiveBadge';
import type { LootRumor } from './-plateau/JournalWindow';

type BuildingSite = { regionId: string; x: number; y: number };

/** **Le mât qu'on s'apprête à raser**, et l'endroit du geste. Un identifiant plutôt que la ligne
 *  de la vue : la vue se réinvalide sous la carte, et une copie prise au clic afficherait un
 *  niveau périmé au moment de confirmer. */
type Demolition = { buildingId: string; x: number; y: number };

/** **Le point qu'on s'apprête à démonter**, et l'endroit du geste — même contrat que `Demolition`
 *  et pour la même raison : l'identifiant voyage, la ligne se relit dans la vue. */
type Dismantling = { outpostId: string; x: number; y: number };

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

/** Le camp relevé dont le cartouche est ouvert, et le point où il se pose. */
type OpenCamp = { readonly id: string; readonly x: number; readonly y: number };
type OpenObjective = { readonly id: string; readonly x: number; readonly y: number };

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
 * **Ce que la carte a déjà décidé, en attente de la confirmation au bout de l'arc**, et le point
 * où elle se pose. `choices` est tout ce que la cible accepte de cette pile : la rose du bureau en
 * a déjà choisi un, la feuille du téléphone les offre en onglets (refonte mobile, 1c).
 */
type Order = OrderChoice & {
  readonly choices: ReadonlyArray<OrderChoice>;
  readonly x: number;
  readonly y: number;
};

/** **La marche que la route chiffre sous un pointeur arrêté** (ADR 0026 §6), et le point où
 *  l'heure s'affiche. */
type RestAim = OrderChoice & { readonly x: number; readonly y: number };

const EMPTY_HAND: Hand = { kind: 'empty' };

/** **L'ordre qui vient de partir**, tant que le cartouche « transmis » le dit (refonte mobile,
 *  1d) : de quoi le suivre, et le nom de l'ordre que la branche portait. */
type SentOrder = Sent & { readonly order: string };

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

export const Route = createFileRoute('/plateau')({
  validateSearch: (raw: Record<string, unknown>): BoardSearch => {
    const search: BoardSearch = {};
    if (typeof raw.country === 'string') search.country = raw.country;
    const windows = readWindows(raw);
    if (windows.length) search.windows = windows;
    if (typeof raw.building === 'string' && raw.building.length > 0) search.building = raw.building;
    if (typeof raw.season === 'string' && raw.season.length > 0) search.season = raw.season;
    if (typeof raw.report === 'string' && raw.report.length > 0) search.report = raw.report;
    return search;
  },
  /** **La saison d'une notification se retient avant le chargement, puis quitte l'adresse** : la
   *  redirection rejoue la route sans le paramètre, avec la place déjà active. */
  beforeLoad: async ({ search }) => {
    if (search.season === undefined) return;
    const { season, ...rest } = search;
    await adoptSeason(season, {
      token: readSession(),
      seatsOf: (token) =>
        convexClient === null
          ? Promise.resolve([])
          : convexClient.query(api.accounts.seats, { token }),
      keepSeat,
    });
    throw redirect({ to: '/plateau', search: rest, replace: true });
  },
  // The loader only fetches the world and the seat; the view comes from the subscription,
  // so the errors that used to surface here now surface at render — see `BoardError`.
  loader: loadGame,
  pendingComponent: Loading,
  errorComponent: ({ error, reset }) => <BoardError error={error} reset={reset} />,
  component: Board,
});

/**
 * The outcomes of a failed board subscription. Three are ordinary and get a route of their own:
 * a season still in the lobby and a seat whose owner has not entered the war both send the
 * player back to the lobby, and a seat the server does not know gets dropped. Everything else
 * is a genuine failure and says so.
 */
/** Owns the hover so a pointer crossing piles does not re-render the whole board. */
function StackHoverSheet({
  register,
  me,
  marching,
  holding,
  labels,
}: {
  register: { current: (hover: StackHover | null) => void };
  me: PlayerView['me'];
  marching: ReturnType<typeof marchingTroopIds>;
  /** Pièce en main, la fiche latérale parle : le survol se tait (ADR 0026 §6). */
  holding: boolean;
  labels: ReadonlyArray<MapLabel>;
}) {
  const [hover, setHover] = useState<StackHover | null>(null);
  useEffect(() => {
    register.current = setHover;
    return () => {
      register.current = () => {};
    };
  }, [register]);
  // A pile that leaves takes its label away without a pointerleave.
  useEffect(() => {
    if (hover !== null && !labels.some((label) => label.id === hover.labelId)) setHover(null);
  }, [hover, labels]);
  const sheet = useMemo(() => {
    if (hover === null || holding) return null;
    const held = troopsAt(me, stationKeyOf(hover.station), marching);
    if (held.length === 0) return null;
    const ids = new Set(held.map((troop) => troop.id));
    return {
      lines: pileSheet(held),
      cargo: me.stationedCargo
        .filter((group) => group.troopIds.some((id) => ids.has(id)))
        .map((group) => group.cargo),
    };
  }, [hover, holding, me, marching]);
  return sheet !== null && hover !== null ? <PileSheet {...sheet} at={hover} /> : null;
}

function BoardError({ error, reset }: { error: unknown; reset: () => void }) {
  const code = errorCode(error);
  if (code === 'SEASON_NOT_LAUNCHED' || code === 'NOT_AT_WAR') {
    return <Navigate to="/salon" replace />;
  }
  if (code === 'NO_SEAT' || code === 'SEASON_GONE') return <StaleSeat to="/accueil" />;
  return <ErrorScreen error={error} reset={reset} />;
}

function Board() {
  const entry = Route.useLoaderData();
  if (entry.state === 'none') return <NoGame />;
  return <LiveBoard world={entry.world} seat={entry.seat} />;
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

function LiveBoard({ world, seat }: { world: World; seat: Seat }) {
  const { server, interrupted } = useBoardView(seat);
  usePresence(seat);
  // The adapted view is memoized because it is the identity every panel keys on: rebuilding
  // it on each render would redo the labels and the compass on every keystroke elsewhere.
  const view = useMemo(
    () => (server === undefined ? null : adaptServerView(world, server)),
    [world, server],
  );
  if (view === null) return <Loading />;
  return (
    <>
      {interrupted && (
        <div
          role="status"
          className="hud fixed top-4 left-1/2 z-50 -translate-x-1/2 border border-[var(--critical)] bg-[var(--desk)] px-3 py-2 text-[11px] text-[var(--critical)]"
        >
          {fr.board.linkLost}
        </div>
      )}
      <BoardContent world={world} view={view} seat={seat} />
    </>
  );
}

function BoardContent({ world, view, seat }: { world: World; view: PlayerView; seat: Seat }) {
  const { country, windows = [], building: focused, report } = Route.useSearch();
  /**
   * **Une seule surface ouverte sous le seuil** (piste A, passe 2, qui révise le 15/09) : la pile
   * est rendue entière, et une fenêtre qu'une autre recouvre se ferme d'elle-même (`Window.tsx`) —
   * fermer celle du dessus rend la carte, pas la précédente.
   */
  const narrow = useNarrowScreen();
  const navigate = useNavigate({ from: Route.fullPath });
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<RegionIdentity | null>(null);
  // Where the crane was clicked: the construction panel is anchored to the aimed point, since
  // what it answers is "here", not "somewhere".
  const [buildingSite, setBuildingSite] = useState<BuildingSite | null>(null);
  const [demolition, setDemolition] = useState<Demolition | null>(null);
  const [dismantling, setDismantling] = useState<Dismantling | null>(null);
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
   * **The whole movement flow, in one direction.** A piece is lifted — off the map, or prepared
   * in a garrison —, put down on the map, confirmed — and the only way back is to put it back.
   * Nothing here can redirect a movement already gone: there is no state for it, and that is
   * the guarantee rather than a missing button (decision 13a).
   */
  const [garrison, setGarrison] = useState<OpenGarrison | null>(null);
  /** **La pièce en main, seule source** (ADR 0026 §6) : la colonne armée et la main du moteur
   *  en dérivent, et `clickPile` est la seule règle qui la change sur la carte. */
  const [hand, setHand] = useState<Hand>(EMPTY_HAND);
  /** Chaque levée est une fiche neuve : ses cases repartent de ce qu'on vient de prendre. */
  const [lifts, setLifts] = useState(0);
  const column = useMemo(
    () => (hand.kind === 'held' ? armedColumn(view, hand.station, hand.troopIds) : null),
    [view, hand],
  );
  /** Ce que le moteur porte sous le pointeur : un mât n'a pas de figurines, la main y est seule. */
  const holding = useMemo(
    () =>
      hand.kind === 'empty'
        ? null
        : {
            pileId:
              hand.station.kind === 'point'
                ? stackLabelId(hand.station)
                : stationKeyOf(hand.station),
            troopIds: hand.troopIds,
          },
    [hand],
  );
  const [order, setOrder] = useState<Order | null>(null);
  const [resting, setResting] = useState<RestAim | null>(null);
  const [sent, setSent] = useState<SentOrder | null>(null);
  /** La carte ouverte au coin bas-droit — une seule à la fois, la colonne ne déborde pas. */
  const [corner, setCorner] = useState<Corner | null>(null);
  /** Les cases cochées du panneau de garnison ouvert — remontées pour la seule mise en avant :
   *  la composition reste au panneau, qui seul la soumet. */
  const [garrisonPicked, setGarrisonPicked] = useState<ReadonlyArray<string>>([]);
  /** De quoi nommer la région d'une pile, dès que la carte a chargé ses régions. */
  const [regionAt, setRegionAt] = useState<RegionAt | null>(null);
  const keepRegionAt = useCallback((lookup: RegionAt) => setRegionAt(() => lookup), []);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{
    readonly ids: ReadonlyArray<string>;
    readonly places?: ReadonlyArray<LonLat>;
    readonly lift?: number;
    readonly distance?: number;
    readonly nonce: number;
  } | null>(null);
  /**
   * **La dépêche ouverte depuis une notification d'attaque**, sous le seuil (lot mobile-3, §6),
   * par l'identifiant de son engagement. Au-dessus du seuil c'est le journal qui la porte en
   * manchette (`journalLead`) — une seule adresse, deux cadres.
   */
  const [openedReport, setOpenedReport] = useState<string | null>(null);
  const [journalLead, setJournalLead] = useState<string | null>(null);
  /** Une pose de rose en cours, cachée sous une feuille si l'on n'y prend garde : un point qu'une
   *  surface basse va couvrir est remonté au-dessus d'elle (`WorldMap.reveal`). */
  const [reveal, setReveal] = useState<{
    readonly x: number;
    readonly y: number;
    readonly floor: number;
    readonly nonce: number;
  } | null>(null);
  const [selectedRumorId, setSelectedRumorId] = useState<string | null>(null);
  const [selectedLoot, setSelectedLoot] = useState<OpenLoot | null>(null);
  const [selectedCamp, setSelectedCamp] = useState<OpenCamp | null>(null);
  const [selectedObjective, setSelectedObjective] = useState<OpenObjective | null>(null);
  /**
   * **The mobilisation order, armed.** The season still owes free placements, the player has
   * clicked one of its keys, and the board is waiting for the ground. It lives here beside the
   * other two map gestures — a construction site and an aim — because it is one of them: a
   * click on the map that means something because of what is armed.
   */
  /** La dette armée dans l'ordre de mobilisation, par son couple (`debtKey`) : le quartier
   *  général n'a pas de gisement, et deux mines dues ne se distinguent que par le leur. */
  const [mobilized, setMobilized] = useState<string | null>(null);
  const [mobilizeError, setMobilizeError] = useState<string | null>(null);
  const toggles = useIndicatorToggles();
  const hoveredMovement = hoveredLabel ?? hoveredArc;
  const lootRumors = useQuery(api.lootRumors.list, seat);
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

  /**
   * **En visée, sous le seuil, un toucher choisit** : la fiche d'un camp, d'un objectif ou d'une
   * caisse prendrait la place de la visée — une surface à la fois — et la désarmerait sous le
   * doigt qui nomme sa destination. La rose s'ouvre seule, comme au clic droit.
   */
  const aimingOnPhone = narrow && column !== null;

  const openLoot = useCallback(
    (ids: ReadonlyArray<string>, clientX: number, clientY: number) => {
      const first = ids[0];
      if (first === undefined || aimingOnPhone) return;
      const at = boardPoint(clientX, clientY);
      setSelectedLoot((previous) => {
        const rank = previous === null ? -1 : ids.indexOf(previous.id);
        return { id: ids[(rank + 1) % ids.length] ?? first, ...at };
      });
    },
    [boardPoint, aimingOnPhone],
  );

  const openCamp = useCallback(
    (campId: string, clientX: number, clientY: number) => {
      if (!aimingOnPhone) setSelectedCamp({ id: campId, ...boardPoint(clientX, clientY) });
    },
    [boardPoint, aimingOnPhone],
  );

  const openObjective = useCallback(
    (objectiveId: string, clientX: number, clientY: number) => {
      if (!aimingOnPhone)
        setSelectedObjective({ id: objectiveId, ...boardPoint(clientX, clientY) });
    },
    [boardPoint, aimingOnPhone],
  );

  /** Un relevé que le délai a périmé emporte le cartouche qui le lisait : la carte ne garde pas
   *  ouverte une fiche sur une ligne que le serveur ne sert plus (ADR 0024 §2). */
  useEffect(() => {
    setSelectedCamp((previous) =>
      previous !== null && !view.camps.some((camp) => camp.id === previous.id) ? null : previous,
    );
  }, [view.camps]);

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
      setHand(EMPTY_HAND);
      setOrder(null);
      /** **Un observateur lit sa garnison, il ne la compose plus** (décision du 31/08) : les
       *  cases partent avec `observing` et « préparer » avec elles, mais le panneau s'ouvre —
       *  une porte qui ne s'ouvre que parfois se lit comme une panne, et ses troupes restent
       *  les siennes à regarder. */
      setGarrison({ station, preselect, ...at });
      setGarrisonPicked(preselect);
      const marker = markerOfStation(view, station);
      /** **Sous le seuil la garnison est une feuille à mi-hauteur** (A7) : la carte remonte le
       *  point au-dessus d'elle plutôt que de le cadrer dessous. */
      if (marker !== null)
        setFocus({ ids: [marker], lift: narrow ? sheetLift('half') : 0, nonce: Date.now() });
    },
    [view, narrow],
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
      /** **Sous le seuil, le toucher en visée agit et ne lit pas** : il lit *et* agit au repos, et
       *  la modale fermait la visée qu'il venait de diriger sur ce mât — un port ne pouvait plus
       *  être visé du doigt. */
      if (narrow && column !== null) return;
      /** La modale ferme la visée en cours : elle est le début d'un ordre, pas son milieu. */
      if (PROJECTION_KEYS.includes(standing.key)) {
        setGarrison(null);
        setHand(EMPTY_HAND);
        setOrder(null);
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
    [navigate, openGarrison, boardPoint, view.me, marching, narrow, column],
  );

  /**
   * **La porte d'un avant-poste, ouverte depuis « à faire maintenant »** (précision du 15/09).
   * Le mât se recadre et le panneau de garnison s'ouvre — c'est là que vit l'élévation, et le
   * même geste que `openBuilding` donne à une caserne au repos. Il n'y a pas de position d'écran
   * à viser : la ligne se clique au bas-gauche, le panneau s'ancre au centre.
   */
  const openOutpost = useCallback(
    (outpostId: string) => {
      const station: TroopStation = { kind: 'outpost', outpostId };
      openGarrison(station, [], { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    },
    [openGarrison],
  );

  const liftHand = useCallback((next: Hand) => {
    setHand(next);
    setLifts((count) => count + 1);
    setGarrison(null);
    setOrder(null);
    setOrderError(null);
  }, []);

  const dropHand = useCallback(() => {
    setHand(EMPTY_HAND);
    setOrder(null);
    setResting(null);
  }, []);

  /** **Un clic sur une de mes piles** : il lève, repose, ou vise — `clickPile` décide, et le
   *  plateau rend vrai quand la pile cliquée devient la destination. */
  const applyPileClick = useCallback(
    (click: PileClick): boolean => {
      const move = clickPile(hand, click);
      if (move.kind === 'pose') return true;
      if (move.kind === 'drop') dropHand();
      else liftHand(move.hand);
      return false;
    },
    [hand, liftHand, dropHand],
  );

  /**
   * **L'étiquette d'une adresse à moi** : une pile posée se lève entière (ADR 0026 §6) ; un
   * avant-poste, qui n'a pas de figurines, ouvre sa garnison, d'où « préparer » met la pile en
   * main. **Un observateur ne lève rien** (décision du 31/08) : il lit la pile au panneau.
   */
  const openStack = useCallback(
    (station: TroopStation, clientX: number, clientY: number): boolean => {
      if (station.kind !== 'point' || view.me.defeated) {
        openGarrison(station, [], boardPoint(clientX, clientY));
        return false;
      }
      const troopIds = troopsAt(view.me, stationKeyOf(station), marching).map((troop) => troop.id);
      return applyPileClick({ station, troopIds, shift: false });
    },
    [openGarrison, boardPoint, view.me, marching, applyPileClick],
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
      compassOf(target, view, column?.rule ?? null, column?.station ?? null, freeCapacity),
    [view, column, freeCapacity],
  );

  const foundHere = useMutation(api.movements.foundOutpostHere);
  const startConstruction = useMutation(api.constructions.start);
  const raiseOutpost = useMutation(api.constructions.raiseOutpost);
  const respecialize = useMutation(api.movements.respecialize);
  const boardTransport = useMutation(api.movements.board);

  const actOnCompass = useCallback(
    (action: CompassAction, at: { x: number; y: number }) => {
      switch (action.key) {
        case 'build':
          setBuildingSite({ regionId: action.regionId, x: at.x, y: at.y });
          /** La feuille de construction couvre la moitié basse : le point visé remonte. */
          if (narrow) setReveal({ ...at, floor: sheetHeight('half'), nonce: Date.now() });
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
            ...seat,
            building: action.buildingKey,
            regionId: action.regionId,
          }).catch((problem: unknown) => handleError(problem, setOrderError));
          return;
        /**
         * **Raser demande une confirmation, et rien d'autre ne la demande** (demande du 15/09) :
         * c'est le seul ordre du jeu qui efface sans passe d'armes et sans contrepartie, donc la
         * carte au bout du geste énumère ce qui part avant que le mot *irréversible* soit lu.
         */
        case 'demolish':
          setOrderError(null);
          setDemolition({ buildingId: action.buildingId, x: at.x, y: at.y });
          return;
        /**
         * **La même mutation que le panneau de garnison** (décision du 16/09) : la rose ajoute
         * une porte à l'élévation d'un point, elle n'en ouvre pas une seconde. Le refus a déjà
         * été lu par `outpostRaiseHold` avant l'ouverture ; ce qui reste est la course, et elle
         * se dit au bandeau.
         */
        case 'raiseOutpost':
          setOrderError(null);
          raiseOutpost({ ...seat, outpostId: action.outpostId as Id<'outposts'> }).catch(
            (problem: unknown) => handleError(problem, setOrderError),
          );
          return;
        /**
         * **Le métier en cours ne se reclique pas** : la branche est marquée, elle dit l'état, et
         * il n'y a rien à changer. Scellée, elle part au serveur quand même — la bulle a déjà dit
         * pourquoi il refusera, et rien n'est grisé (ADR 0015).
         */
        case 'specialize':
          if (action.current) return;
          setOrderError(null);
          respecialize({
            ...seat,
            outpostId: action.outpostId as Id<'outposts'>,
            specialization: action.specialization,
          }).catch((problem: unknown) => handleError(problem, setOrderError));
          return;
        /**
         * **Démanteler demande la même confirmation que raser**, et elle en dit davantage : un
         * point emporte la couleur de son sol et les mâts qu'il ancre, ce qu'aucune bulle
         * n'aurait la place d'énumérer.
         */
        case 'dismantle':
          setOrderError(null);
          setDismantling({ outpostId: action.outpostId, x: at.x, y: at.y });
          return;
        /** **Embarquer est immédiat** (ADR 0025 §3) : pas d'aperçu ni de slot, la pile armée
         *  prend l'adresse du transport et la visée se referme. */
        case 'board':
          if (column === null || action.transport.kind === 'home') return;
          setOrderError(null);
          boardTransport({
            ...seat,
            origin: wireOrigin(column.station),
            troopIds: column.troopIds.map((troopId) => troopId as Id<'troops'>),
            transport: wireOrigin(action.transport),
          }).then(dropHand, (problem: unknown) => handleError(problem, setOrderError));
          return;
        case 'aim':
        case 'plunder':
        case 'collect': {
          const choice = choiceOf(action);
          setOrder({ ...choice, choices: [choice], x: at.x, y: at.y });
          return;
        }
        /**
         * **La fondation, depuis le clic droit sur la pile qui fonde** (décision du 29/08). Elle
         * pose « relais » : le serveur exige un mot à l'insertion et la carte n'est pas le lieu
         * d'un formulaire — c'est le panneau du point, une fois planté, qui rattrape ce choix
         * tant qu'aucune passe ne l'a lu (`movements.respecialize`).
         */
        case 'found':
          setOrderError(null);
          foundHere({
            ...seat,
            point: { lon: action.point[0], lat: action.point[1] },
            /** Le sol sous la pile, tel que la carte le dessine : le serveur n'a pas les
             *  polygones et ne peut que vérifier le pays. Au dézoom il n'y a pas de région, et
             *  `null` laisse le repli répondre. */
            regionId: action.regionId,
            specialization: 'relay',
            troopIds: action.troopIds.map((troopId) => troopId as Id<'troops'>),
          }).then(dropHand, (problem: unknown) => handleError(problem, setOrderError));
      }
    },
    [
      foundHere,
      startConstruction,
      raiseOutpost,
      respecialize,
      boardTransport,
      dropHand,
      column,
      seat,
      narrow,
    ],
  );

  /**
   * **Sous le seuil, la cible touchée ouvre la feuille d'ordre**, pas la rose (refonte mobile,
   * 1c) : tout ce qu'elle accepte de la pile, en onglets, et le premier choisi — l'ordre même où
   * la rose les aurait posés. Une cible qui n'accepte rien rend la main à la rose, qui seule sait
   * dire pourquoi.
   */
  const orderFrom = useCallback((compass: Compass, at: { x: number; y: number }): boolean => {
    /** Embarquer n'est pas un ordre de la feuille (rien ne part) : la rose, qui le porte à côté
     *  des marches, s'ouvre à sa place. */
    if (compass.actions.some((action) => action.key === 'board')) return false;
    const choices = compass.actions.filter(isOrder).map(choiceOf);
    const first = choices[0];
    if (first === undefined) return false;
    setOrder({ ...first, choices, x: at.x, y: at.y });
    return true;
  }, []);

  /** **Échap repose la pièce en main** (ADR 0026 §6). La rose arrête la touche avant nous quand
   *  elle est ouverte. */
  useEffect(() => {
    if (hand.kind === 'empty') return;
    const putBack = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dropHand();
    };
    document.addEventListener('keydown', putBack);
    return () => document.removeEventListener('keydown', putBack);
  }, [hand.kind, dropHand]);

  /** **Une pièce dont les troupes ne sont plus là se repose seule** — parties, tombées, ou un
   *  observateur qui vient de capituler : la main ne tient pas ce que la vue ne sert plus. */
  useEffect(() => {
    if (hand.kind === 'empty') return;
    const here = new Set(
      troopsAt(view.me, stationKeyOf(hand.station), marching).map((troop) => troop.id),
    );
    if (view.me.defeated || !hand.troopIds.every((troopId) => here.has(troopId))) dropHand();
  }, [hand, view.me, marching, dropHand]);

  /** **Les cases de la fiche latérale composent la main**, sans la lâcher (`composeHand`). Un
   *  ordre choisi pour l'ancienne composition ne vaut plus pour la nouvelle. */
  const compose = useCallback(
    (troopIds: ReadonlyArray<string>) => {
      if (hand.kind === 'held' && hand.troopIds.join() === troopIds.join()) return;
      const move = composeHand(hand, troopIds);
      if (move.kind !== 'lift') {
        dropHand();
        return;
      }
      setHand(move.hand);
      setOrder(null);
    },
    [hand, dropHand],
  );

  const restAt = useCallback(
    (action: OrderAction | null, at: { x: number; y: number }) =>
      setResting(action === null ? null : { ...choiceOf(action), ...at }),
    [],
  );

  /**
   * **Échap referme ce qui est posé sur la carte, une couche par touche** : les fenêtres d'abord,
   * la visée et la pose ensuite — chacune a sa propre sortie —, puis les cartes et panneaux ancrés
   * à un point. La rose, en capture, arrête la touche avant tous.
   */
  useEffect(() => {
    if (windows.length > 0 || column !== null || placing !== null) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setGarrison(null);
      setBuildingSite(null);
      setDemolition(null);
      setDismantling(null);
      setSelectedLoot(null);
      setSelectedCamp(null);
      setSelectedObjective(null);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [windows.length, column, placing]);

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
        ...seat,
        building: ordered.key,
        regionId: ordered.regionId,
        point: { lon: point[0], lat: point[1] },
      }).then(
        () => notify(fr.construction.queued(fr.buildings[ordered.key]), 'info'),
        (problem: unknown) => handleError(problem, setOrderError),
      );
    },
    [placing, startConstruction, seat],
  );

  /**
   * **The keys the season still owes, and the ground each one accepts.** The eligibility is
   * `placementOf` — the placement refusal the server itself raises, read over the player's own
   * regions. Nothing is re-decided here, which is the whole point: the order can only ever
   * highlight ground `constructions.start` would take.
   */
  const foundation = useMemo(
    () =>
      view.me.foundation.map((due) => {
        const placement = placementOf(view, due.key);
        /** **Une dette ne s'acquitte que sur son gisement** (`owedFreely`) : allumer tout le sol
         *  que la clé accepte ferait poser la mine du fer sur du charbon, et le serveur la
         *  facturerait plein tarif sans que rien ne l'ait dit. La dette du quartier général ne
         *  nomme aucun gisement : tout le sol qu'elle accepte l'acquitte (`settlesDebt`). */
        const regionIds =
          due.deposit === null
            ? placement.regionIds
            : placement.regionIds.filter((regionId) => depositOfRegion(regionId) === due.deposit);
        return {
          ...placement,
          deposit: due.deposit,
          regionIds,
          condition:
            regionIds.length === 0 && placement.condition === null
              ? ({ kind: 'regionsTaken' } as const)
              : placement.condition,
        };
      }),
    [view],
  );

  const designated = useMemo(
    () => foundation.find((placement) => debtKey(placement) === mobilized)?.regionIds ?? [],
    [foundation, mobilized],
  );

  // The order disarms itself when its debt is paid off: `me.foundation` is what draws the card,
  // so a couple that has left it has no line left to be armed on.
  const armed =
    mobilized !== null && view.me.foundation.some((due) => debtKey(due) === mobilized)
      ? mobilized
      : null;

  const place = useMutation(api.constructions.start);

  /**
   * **The foundation goes down where it is clicked, through the one mutation that places.**
   * There is no second door: `constructions.start` reads the free placement off `foundationOwed`
   * and stands the building at once — the order only chooses the region, which is the single
   * gesture of the opening that is a decision.
   */
  const placeFoundation = useCallback(
    (regionId: string | null) => {
      const due =
        armed === null ? undefined : view.me.foundation.find((debt) => debtKey(debt) === armed);
      if (due === undefined || regionId === null) return;
      if (!designated.includes(regionId)) return;
      setMobilizeError(null);
      /**
       * **The key stays armed.** A skirmish owes two mines, and disarming after the first would
       * make the second placement a fresh hunt through the card. It disarms on its own when the
       * debt is paid: `armed` is read off `me.foundation`, which the placement empties.
       */
      place({ ...seat, building: due.key, regionId }).catch((problem: unknown) =>
        handleError(problem, setMobilizeError),
      );
    },
    [armed, designated, place, seat, view.me.foundation],
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
  const heldRaw = useQuery(api.control.held, seat);
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
          /** **Une zone suspendue est au plancher, et elle y reste** (ADR 0020 §7) : elle ne
           *  vieillit pas — il est chez lui, il sait ce qu'il a perdu et quand il le reprend —
           *  donc son délavage est une constante et non une horloge. */
          wash:
            region.state === 'current'
              ? 1
              : region.state === 'suspended'
                ? FADED_WASH
                : surveyWash(surveyClock - region.seenAt, SURVEY_FADED_HOURS * 3_600_000),
          suspended: region.state === 'suspended',
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
          claim.regions.flatMap((region) =>
            region.state === 'suspended'
              ? []
              : [[region.id, { ...region, nation: claim.nation }] as const],
          ),
        ),
      ),
    [heldRaw],
  );

  /**
   * **L'heure du retour, par région suspendue** (ADR 0020 §7). À part du tenant et jamais fondue
   * dedans : une région disputée reprise par le voisin pendant la désactivation est *à lui* et
   * *suspendue chez moi* à la fois, et une seule ligne aurait obligé l'une des deux à mentir.
   * Le serveur ne la sert qu'au propriétaire (ADR 0005), donc rien ne filtre ici.
   */
  const suspendedUntilByRegion = useMemo(
    () =>
      new Map(
        (heldRaw ?? []).flatMap((claim) =>
          claim.regions.flatMap((region) =>
            region.state === 'suspended' ? [[region.id, region.until] as const] : [],
          ),
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
      standsAt: outpost.standsAt,
      garrison: outpost.garrison,
      /** **Ce qu'il écoute est ce qu'il ravitaille** : le même rayon, montré au survol. Le
       *  relais couvre le même cercle mais n'y relève rien — c'est le temps de trajet qu'il
       *  change, et la carte n'a pas de trait pour dire une vitesse. */
      /** Un chantier n'atteint rien : pas de cercle à montrer tant qu'il n'est pas levé. */
      reach:
        outpost.specialization === 'listening' && outpost.standsAt === null
          ? {
              lonLat: outpost.lonLat,
              detectionKm: outpostReachKm(outpost.level),
              /** Un point n'engage rien : il relève, et le cercle de contact est celui d'une
               *  pile (décisions 4a et 3a du 16/09). */
              contactKm: null,
            }
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
    const stacks: ReadonlyArray<MapMarker> = postedStacks(view.me, marching, regionAt);

    /**
     * **Ce qu'on a relevé chez l'autre se tient sur la carte** (S8) : sans mât, l'expédition
     * n'avait aucune poignée — un ordre existait côté serveur que rien à l'écran ne pouvait
     * nommer. Le point exact d'un site adverse n'est pas servi : le relevé porte la région, et
     * le mât se pose à son centroïde, comme un gisement. Il suit le même interrupteur que les
     * mâts à soi, parce que c'est le même encombrement.
     */
    /**
     * **Un camp adverse relevé se tient sur la carte** (ADR 0024 §1) : sans mât, le §3 serait
     * injouable — un adversaire camperait chez le joueur sans que rien ne le lui dise. Le
     * marqueur ne porte que ce que le relevé sert : un point, un milieu, deux dates.
     */
    const camps: ReadonlyArray<MapMarker> = view.camps.map((camp) => ({
      kind: 'camp' as const,
      id: `camp-${camp.id}`,
      campId: camp.id,
      lonLat: camp.point,
      medium: camp.medium,
      lastKnown: camp.lastKnown,
      since: camp.since,
      seenMinutesAgo: camp.seenMinutesAgo,
    }));

    /**
     * **Les objectifs neutres se tiennent sur la carte, pour tout le monde** (17/09/2026). C'est
     * le seul marqueur public par décision : sans lui, une réserve annoncée par dépêche serait
     * une adresse que rien à l'écran ne sait montrer, et le PVE ne ferait converger personne.
     * Il ne porte ni encre ni garnison — un objectif n'appartient à personne, et ce qui le tient
     * se relève comme toute force posée.
     */
    const objectives: ReadonlyArray<MapMarker> = view.objectives.map((objective) => ({
      kind: 'objective' as const,
      id: `objective-${objective.id}`,
      objectiveId: objective.id,
      lonLat: objective.point,
      name: fr.objectives.names[objective.key] ?? objective.key,
      tier: fr.objectives.tiers[objectiveArchetype(objective.key)?.tier ?? ''] ?? '',
      plate: objectiveSprite(objective.key),
      depot: lootWords(objective.depot),
      emptied: objective.status === 'taken',
    }));

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

    if (!toggles.buildings)
      return [...deposits, ...loot, ...camps, ...objectives, ...outposts, ...stacks];
    const host = isNation(view.me.nation) ? COUNTRY_BY_NATION[view.me.nation] : null;
    const work = view.me.construction;
    const finishesAt = work === null ? null : view.loadedAt + work.minutesLeft * 60_000;
    const pointOfRegion = new Map(view.me.regions.map((region) => [region.id, region.point]));
    const nameOfRegion = new Map(view.me.regions.map((region) => [region.id, region.name]));
    const standing = view.me.buildings.map((building) => ({
      kind: 'building' as const,
      id: `building-${building.regionId}-${building.key}`,
      buildingId: building.id,
      key: building.key,
      regionId: building.regionId,
      regionName: nameOfRegion.get(building.regionId) ?? building.regionId,
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
    /** **Une élévation d'avant-poste ne plante pas de grue** : le point a déjà son mât, et une
     *  seconde marque sur sa région en ferait un bâtiment (précision du 15/09). */
    const site = work === null || isOutpostWork(work.key) ? null : { ...work, key: work.key };
    const raising =
      site === null || standing.some((building) => building.finishesAt !== null)
        ? []
        : [
            {
              kind: 'building' as const,
              id: `building-${site.regionId}-${site.key}`,
              // A first level under the crane opens nothing: no line stands for it yet.
              buildingId: null,
              key: site.key,
              regionId: site.regionId,
              regionName: site.regionName,
              lonLat: site.point,
              hostCountry: host,
              name: site.name,
              level: null,
              plate: null,
              finishesAt,
              /** Rien ne se tient encore : un chantier n'entend rien. */
              reach: null,
              ink: view.me.ink,
            },
          ];
    return [
      ...deposits,
      ...loot,
      ...camps,
      ...objectives,
      ...surveyed,
      ...outposts,
      ...stacks,
      ...standing,
      ...raising,
    ];
  }, [
    marching,
    regionAt,
    view.me,
    view.loadedAt,
    view.lootSightings,
    view.camps,
    view.objectives,
    view.surveyedInstallations,
    knownRegionById,
    toggles.buildings,
    toggles.deposits,
  ]);

  const labels = useMemo(() => buildLabels(view, markers), [view, markers]);

  /** Un groupe de figurines, ou toute la pile par son jeton. */
  const pieceClick = useCallback(
    (hit: PieceClick): boolean => {
      const pile = markers.find(
        (marker): marker is Extract<MapMarker, { kind: 'stack' }> =>
          marker.kind === 'stack' && marker.id === hit.pileId,
      );
      if (pile === undefined || pile.station.kind === 'home') return false;
      return applyPileClick({ station: pile.station, troopIds: hit.troopIds, shift: hit.shift });
    },
    [markers, applyPileClick],
  );
  const standing = useMemo(
    () =>
      markers.flatMap((marker) =>
        marker.kind === 'stack'
          ? [{ id: marker.id, lonLat: marker.lonLat, pieces: marker.pieces }]
          : [],
      ),
    [markers],
  );
  const camps = useMemo(
    () =>
      markers.flatMap((marker) =>
        marker.kind === 'camp'
          ? [
              {
                id: marker.id,
                lonLat: marker.lonLat,
                medium: marker.medium,
                washed: marker.lastKnown,
              },
            ]
          : [],
      ),
    [markers],
  );

  /**
   * **La troupe touchée ou cochée grossit** (carte-lisible, 03/10), et c'est `highlightOf` qui
   * dit laquelle — la colonne armée, la troupe désignée, puis les cases de la garnison. La pile
   * prend alors le visage de ce qui est mis en avant : un char coché dans une garnison
   * d'infanterie se voit char. Le visage voyage à côté des étiquettes plutôt que dedans, pour
   * qu'une case cochée ne reconstruise pas toute la couche.
   */
  const highlight = useMemo(
    () =>
      highlightOf(
        column && { station: column.station, troopIds: column.troopIds },
        garrison && { station: garrison.station, troopIds: garrisonPicked },
      ),
    [column, garrison, garrisonPicked],
  );
  const highlightPlate = useMemo(() => {
    if (highlight === null) return null;
    const chosen = view.me.troops.filter((troop) => highlight.troopIds.includes(troop.id));
    const face = representativeRole(stackOf(chosen));
    if (face === null) return null;
    const tier = chosen.find((troop) => troop.role === face)?.tier ?? 1;
    return spriteUrl(view.me.nation, face, tier);
  }, [highlight, view.me]);

  /**
   * **Le cercle de détection de la pièce en main** (ADR 0019 §5) : le seul détecteur qui soit
   * une troupe, et le seul chiffre qui dise ce que la poser rapporte. Il part avec la main.
   */
  const handReach = useMemo<Reach | null>(
    () =>
      column === null || column.station.kind !== 'point'
        ? null
        : {
            lonLat: column.station.lonLat,
            detectionKm: detectionRangeOf(column.rule.roles),
            /** **Ce qu'elle touche, à côté de ce qu'elle voit** (décisions 4a et 3a du 16/09) :
             *  une seule constante, celle que l'arrivée lit pour trouver qui se tient là. */
            contactKm: ARRIVAL_RADIUS_KM,
          },
    [column],
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
      detectionKm: detectionRangeOf(roles),
      contactKm: ARRIVAL_RADIUS_KM,
    };
  }, [hoveredMovement, surveyClock, view.arcs, view.loadedAt]);
  const selectedCampView =
    selectedCamp === null ? null : (view.camps.find((camp) => camp.id === selectedCamp.id) ?? null);
  const selectedObjectiveView =
    selectedObjective === null
      ? null
      : (view.objectives.find((objective) => objective.id === selectedObjective.id) ?? null);
  const selectedLootSighting =
    selectedLoot === null
      ? null
      : (view.lootSightings.find(
          (sighting) => sighting.id === selectedLoot.id && sighting.present,
        ) ?? null);
  const setStackHover = useRef<(hover: StackHover | null) => void>(() => {});
  const onStackHover = useCallback((hover: StackHover | null) => setStackHover.current(hover), []);
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
   * **Une pile composée, mise en main** — depuis le panneau d'une garnison ou depuis la modale
   * d'un site, qui porte la même composition depuis la décision 61a. C'est la même main que la
   * pile levée sur la carte : un bâtiment n'a pas de figurines à prendre, pas d'autre flux.
   */
  const prepareColumn = useCallback(
    (station: TroopStation, troopIds: ReadonlyArray<string>) => {
      /** `home` is the one address no column leaves from — the panel offers nothing there, so
       *  this branch only guards the type. */
      if (station.kind === 'home') return;
      /** La modale s'efface avec la pile qu'elle vient de mettre en main : la destination se pose
       *  sur la carte, et une fenêtre de 1180 pixels par-dessus cacherait la cible. */
      if (station.kind === 'building') closeWindow('site');
      liftHand({ kind: 'held', station, troopIds });
    },
    [liftHand, closeWindow],
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
  const telegraph = useTelegraph(seat);

  const [briefing, setBriefing] = useState(() => !briefingSeen());

  /**
   * The morning edition: with **unread** critical news, the journal is already on the desk on
   * arrival. Once per arrival, and never over a deep link asking for another surface.
   *
   * Unread is the whole condition. It used to open on any critical dispatch ever filed, so the
   * same battle greeted a player on every visit until the season ended — a paper that reprints
   * yesterday's headline is not an edition.
   */
  /**
   * **Un joueur sans quartier général n'a rien sur la carte**, et la carte s'ouvre sur le monde
   * entier : il lui faudrait trouver son pays avant de pouvoir poser quoi que ce soit. La caméra
   * va donc à la capitale de 1940 — le seul point qu'on connaisse de lui tant qu'il n'a rien
   * bâti (décision 1b du 13/09), servi par `me.capitalPoint` parce que la table vit avec l'index
   * des régions, côté serveur.
   *
   * Une seule fois, et jamais après la pose : un recadrage qui reviendrait à chaque vue reprendrait
   * la caméra des mains du joueur.
   */
  const framedOnCapital = useRef(false);
  useEffect(() => {
    if (framedOnCapital.current || view.me.hqLevel > 0) return;
    const capital = view.me.capitalPoint;
    if (capital === null) return;
    framedOnCapital.current = true;
    setFocus({ ids: [], places: [capital], nonce: Date.now() });
  }, [view.me.hqLevel, view.me.capitalPoint]);

  const editionServed = useRef(false);
  useEffect(() => {
    if (editionServed.current) return;
    editionServed.current = true;
    if (windows.length || report !== undefined) return;
    if (!view.journal.some((dispatch) => dispatch.unread && dispatch.severity === 'critical'))
      return;
    void navigate({
      search: (previous) => withWindow(previous, 'journal'),
      replace: true,
    });
  }, [windows, report, view.journal, navigate]);

  /**
   * **L'arrivée sur une dépêche de combat** (lot mobile-3, §6) : l'adresse d'une notification
   * d'attaque seule porte l'engagement. La carte se centre sur le lieu, et la dépêche s'ouvre —
   * en feuille à l'aperçu sous le seuil, en manchette du journal au-dessus. L'adresse la rend
   * ensuite : c'est une arrivée, et recharger la page ne doit pas la rejouer. Une dépêche que la
   * vue ne sert plus (au-delà des derniers comptes rendus) retombe sur le journal.
   */
  const reportServed = useRef<string | null>(null);
  useEffect(() => {
    if (report === undefined) {
      reportServed.current = null;
      return;
    }
    if (reportServed.current === report) return;
    reportServed.current = report;
    const combat = view.journal.find((dispatch) => dispatch.combat?.id === report)?.combat ?? null;
    if (combat !== null) {
      setFocus({
        ids: [],
        places: [[combat.point.lon, combat.point.lat]],
        lift: narrow ? sheetLift('peek') : 0,
        distance: DISPATCH_VIEW_DISTANCE,
        nonce: Date.now(),
      });
      if (narrow) setOpenedReport(report);
      else setJournalLead(report);
    }
    void navigate({
      search: (previous) => {
        const { report: _served, ...rest } = previous;
        return narrow && combat !== null ? rest : withWindow(rest, 'journal');
      },
      replace: true,
    });
  }, [report, view.journal, narrow, navigate]);

  const openedDispatch =
    openedReport === null
      ? null
      : (view.journal.find((dispatch) => dispatch.combat?.id === openedReport) ?? null);
  const openedCombat = openedDispatch?.combat ?? null;
  /** Ce qui se tient encore à soi au lieu d'un combat : la garnison qu'ouvre sa dépêche. */
  const garrisonAtCombat = useCallback(
    (combat: CombatReport) => stationAtCombat(view.me, combat, marching, ARRIVAL_RADIUS_KM),
    [view.me, marching],
  );
  const combatStation = openedCombat === null ? null : garrisonAtCombat(openedCombat);
  const locate = useCallback((place: { readonly lon: number; readonly lat: number }) => {
    setFocus({
      ids: [],
      places: [[place.lon, place.lat]],
      distance: DISPATCH_VIEW_DISTANCE,
      nonce: Date.now(),
    });
  }, []);
  const showCombat = useCallback((combat: CombatReport) => locate(combat.point), [locate]);

  /**
   * **Un aperçu par mission, et le serveur date toujours seul.** Les trois requêtes coexistent
   * parce qu'aucune ne sait refuser à la place des autres : celle qui ne sert pas est en `skip`,
   * et la carte lit celle de l'ordre en cours.
   */
  /** L'ordre ouvert l'emporte sur l'arrêt du pointeur : une seule demande, celle qu'on lit. */
  const aimed = order ?? resting;
  const dispatch =
    column === null || aimed === null
      ? null
      : {
          ...seat,
          origin: wireOrigin(column.station),
          troopIds: column.troopIds.map((troopId) => troopId as Id<'troops'>),
        };
  const mission = aimed?.mission ?? null;
  /** **Une réponse périmée ne s'affiche jamais** : un argument neuf rend `undefined` jusqu'à sa
   *  propre réponse, et l'abonnement précédent est remplacé, pas empilé (ADR 0026 §6). */
  const marchPreview = useQuery(
    api.movements.preview,
    dispatch === null || aimed === null || mission?.kind !== 'march'
      ? 'skip'
      : { ...dispatch, target: wireTarget(aimed.aim), type: aimed.type },
  );
  const plunderPreview = useQuery(
    api.movements.previewPlunder,
    dispatch === null || mission?.kind !== 'plunder'
      ? 'skip'
      : { ...dispatch, buildingId: mission.buildingId as Id<'buildings'> },
  );
  const collectPreview = useQuery(
    api.movements.previewLootCollection,
    dispatch === null || mission?.kind !== 'collect'
      ? 'skip'
      : { ...dispatch, sightingId: mission.sightingId as Id<'lootCrateSightings'> },
  );
  const preview =
    mission === null
      ? undefined
      : mission.kind === 'plunder'
        ? plunderPreview
        : mission.kind === 'collect'
          ? collectPreview
          : marchPreview;

  /**
   * **The aimed arc is the route the server just computed**, drawn with the board's own thread
   * and nothing else — never a great-circle approximation laid on top. It joins the arcs of the
   * movements in flight in the same list, so it inherits the same stroke, the same pawn, the
   * same everything.
   */
  /** Le mât visé par la confirmation, relu dans la vue : effacé, la carte se ferme d'elle-même
   *  plutôt que d'annoncer un niveau qui n'existe plus. */
  const razed = view.me.buildings.find((building) => building.id === demolition?.buildingId);
  const dismantled = view.me.outposts.find((outpost) => outpost.id === dismantling?.outpostId);

  const arcs = useMemo<ReadonlyArray<ArcView>>(
    () =>
      column === null || aimed === null || !preview
        ? view.arcs
        : [...view.arcs, previewArc(column, aimed, preview)],
    [view.arcs, column, aimed, preview],
  );

  /** La place que la feuille à l'aperçu peut prendre au pied du plateau : la rose s'ouvre
   *  au-dessus. L'aperçu épouse son contenu jusqu'à mi-hauteur, et la fiche d'une troupe armée,
   *  avec ses cibles, y monte (refonte mobile, 1b) : mesurée au tiers, elle laissait la troupe
   *  sous la feuille. */
  const [selectionSheet, setSelectionSheet] = useState<number | null>(null);
  /** **Le plancher suit le cran courant de la feuille de sélection, mesuré** (décision 3a du
   *  05/10) : réduite, la feuille ne couvre que son en-tête et la rose se pose plus bas au lieu
   *  de se caler contre le bandeau. Sans feuille de sélection, la moitié réservée d'avant. */
  const fingerRose = useMemo(
    () => (narrow ? { floor: selectionSheet ?? sheetHeight('half') } : null),
    [narrow, selectionSheet],
  );

  /**
   * **Les recrutements commencés, datés par l'atelier** : la vue ne sert que la liste des casernes
   * occupées, et « En cours » ne vit que sous le seuil — l'abonnement aussi.
   */
  const workshop = useQuery(api.troops.workshop, narrow ? seat : 'skip');
  const recruitments = useMemo<ReadonlyArray<RecruitmentDue>>(
    () =>
      (workshop?.facilities ?? []).flatMap((facility) => {
        const head = facility.queue[0];
        if (head === undefined || !head.started) return [];
        return [
          {
            buildingId: facility.id,
            key: facility.key,
            regionId: facility.regionId,
            regionName: facility.regionName,
            endsAt: workshop!.loadedAt + head.minutesLeft * 60_000,
          },
        ];
      }),
    [workshop],
  );
  const underway = useMemo(
    () => (narrow ? underwayOf(view, recruitments) : []),
    [narrow, view, recruitments],
  );

  /** **Un bâtiment se cadre même calque éteint** : sans le calque, son mât n'existe pas et la
   *  carte n'aurait rien à rejoindre — on vise alors le point de sa région. */
  const focusBuilding = useCallback(
    (regionId: string, key: string) => {
      const point = view.me.regions.find((region) => region.id === regionId)?.point;
      if (!toggles.buildings && point !== undefined)
        setFocus({ ids: [], places: [point], nonce: Date.now() });
      else setFocus({ ids: [`building-${regionId}-${key}`], nonce: Date.now() });
    },
    [view.me.regions, toggles.buildings],
  );

  const locateUnderway = useCallback(
    (line: Underway) => {
      const { place } = line;
      if (place.kind === 'movement') setFocus({ ids: [place.arcId], nonce: Date.now() });
      else if (place.kind === 'outpost')
        setFocus({ ids: [`outpost-${place.outpostId}`], nonce: Date.now() });
      else focusBuilding(place.regionId, place.key);
    },
    [focusBuilding],
  );

  /** **Le chemin du retour** : le quartier général, ou la capitale de 1940 tant qu'il n'est pas
   *  posé — le même repli que le cadrage d'ouverture. */
  const recenterOnHome = useCallback(() => {
    const hq = view.me.buildings.find((building) => building.key === 'hq');
    if (hq !== undefined) focusBuilding(hq.regionId, 'hq');
    else if (view.me.capitalPoint !== null)
      setFocus({ ids: [], places: [view.me.capitalPoint], nonce: Date.now() });
  }, [view.me.buildings, view.me.capitalPoint, focusBuilding]);

  /** **L'ordre parti, la feuille se referme seule** (refonte mobile, 1d) : sous le seuil, le
   *  cartouche « transmis » prend le relais le temps qu'on le lise. */
  const afterSent = useCallback(
    (filed: Sent) => {
      if (narrow && order !== null) setSent({ ...filed, order: order.label });
      dropHand();
    },
    [narrow, order, dropHand],
  );
  useEffect(() => {
    if (sent === null) return;
    const timer = setTimeout(() => setSent(null), SENT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [sent]);

  const showBriefing = useCallback(() => setBriefing(true), []);

  const nextActions = (frame: 'card' | 'sheet') => (
    <NextActions
      view={view}
      frame={frame}
      placements={foundation}
      armed={armed}
      error={mobilizeError}
      onArm={(debt) => {
        setMobilizeError(null);
        setMobilized(debt);
      }}
      onGoToMap={(point) => setFocus({ ids: [], places: [point], nonce: Date.now() })}
      onOpenSurface={openWindow}
      onOpenSite={openBuilding}
      onOpenOutpost={openOutpost}
    />
  );

  return (
    <Shell
      view={view}
      telegraphUnread={telegraph.unread}
      todo={nextActions('sheet')}
      onShowBriefing={showBriefing}
    >
      <SelectionSheetReport.Provider value={setSelectionSheet}>
        <div ref={board} className="relative min-w-0 flex-1">
          <WorldMap
            world={world}
            arcs={arcs}
            journal={view.journal}
            labels={labels}
            standing={standing}
            camps={camps}
            inkByCountry={inkByCountry}
            held={held}
            built={built}
            selectedCountry={country ?? null}
            playerNation={view.me.nation}
            indicators={toggles}
            accentedMovement={hoveredMovement}
            onSelect={aimingOnPhone ? keepSelection : select}
            onOpenBuilding={openBuilding}
            onOpenStack={openStack}
            holding={holding}
            onPieceClick={view.me.defeated ? undefined : pieceClick}
            onRestAim={restAt}
            onRoseDismiss={dropHand}
            onOpenLoot={openLoot}
            onOpenCamp={openCamp}
            onOpenObjective={openObjective}
            selectedLabel={highlight?.labelId ?? null}
            selectedPlate={highlightPlate}
            selectedLootLabel={selectedLoot === null ? null : `loot-${selectedLoot.id}`}
            reach={handReach ?? movementReach}
            onCountryHover={setHoveredCountry}
            onRegionHover={setHoveredRegion}
            onRegionsLoaded={keepRegionAt}
            onArcHover={setHoveredArc}
            onLabelHover={setHoveredLabel}
            onStackHover={onStackHover}
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
            fingerRose={fingerRose}
            showDestinations
            onOrderTarget={narrow ? orderFrom : undefined}
            covered={narrow && windows.length > 0}
            reveal={reveal}
          />
          {selectedLoot !== null && selectedLootSighting !== null && (
            <LootCrateCard
              key={selectedLoot.id}
              sighting={selectedLootSighting}
              at={selectedLoot}
              onClose={() => setSelectedLoot(null)}
            />
          )}
          {selectedCamp !== null && selectedCampView !== null && (
            <CampBadge
              key={selectedCamp.id}
              camp={selectedCampView}
              at={selectedCamp}
              onClose={() => setSelectedCamp(null)}
            />
          )}
          {selectedObjective !== null && selectedObjectiveView !== null && (
            <ObjectiveBadge
              key={selectedObjective.id}
              objective={selectedObjectiveView}
              at={selectedObjective}
              onClose={() => setSelectedObjective(null)}
            />
          )}
          {buildingSite && (
            /* Keyed on where it was aimed: a panel opened at a second point is a second panel,
             and it must not inherit the push the player gave the first (`Draggable`). */
            <ConstructionPanel
              key={`${buildingSite.regionId}-${buildingSite.x}-${buildingSite.y}`}
              view={view}
              seat={seat}
              regionId={buildingSite.regionId}
              at={buildingSite}
              onClose={() => setBuildingSite(null)}
              onRaiseOutpost={(outpostId) => {
                setBuildingSite(null);
                openOutpost(outpostId);
              }}
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
          {demolition !== null && razed !== undefined && (
            /* Relu dans la vue à chaque image plutôt que recopié au clic : le mât disparaît au
             moment où le serveur répond, et la carte s'en va avec lui. */
            <DemolitionCard
              key={razed.id}
              seat={seat}
              view={view}
              building={razed}
              at={demolition}
              onClose={() => setDemolition(null)}
            />
          )}
          {dismantling !== null && dismantled !== undefined && (
            /* Relu dans la vue comme le mât rasé : le point disparaît au moment où le serveur
             répond, et la carte s'en va avec lui. */
            <DismantleCard
              key={dismantled.id}
              seat={seat}
              view={view}
              outpost={dismantled}
              at={dismantling}
              onClose={() => setDismantling(null)}
            />
          )}
          {garrison && (
            <GarrisonPanel
              /* The pre-check is part of the panel's identity, not only its address: a second
               card of the same garrison — the cargo after the infantry — opens the same
               station and must arrive with *its* troops ticked, not the previous card's. */
              key={`${stationKeyOf(garrison.station)}-${garrison.x}-${garrison.y}-${garrison.preselect.join()}`}
              view={view}
              seat={seat}
              station={garrison.station}
              at={garrison}
              preselect={garrison.preselect}
              onClose={() => setGarrison(null)}
              onPrepare={prepareColumn}
              onPickedChange={setGarrisonPicked}
            />
          )}
          {/* Sous le seuil la feuille de visée prend sa place dès qu'une destination est nommée :
            une surface à la fois, et c'est la visée qui parle alors. */}
          <StackHoverSheet
            register={setStackHover}
            me={view.me}
            marching={marching}
            holding={hand.kind === 'held'}
            labels={labels}
          />
          {hand.kind === 'held' && !(narrow && order !== null) && (
            <HandSheet
              key={`${stationKeyOf(hand.station)}-${lifts}`}
              view={view}
              station={hand.station}
              place={
                hand.station.kind === 'point'
                  ? pilePlace(hand.station, stationNames(view), regionAt)
                  : stationNames(view).place(hand.station)
              }
              held={troopsAt(view.me, stationKeyOf(hand.station), marching)}
              troopIds={hand.troopIds}
              onCompose={compose}
              onOpenGunnery={() => openWindow('gunnery')}
              onDrop={dropHand}
            />
          )}
          {resting !== null && order === null && preview && (
            /* Placed outside the `.hud` zoom, which would scale the board point as well. */
            <div
              className="pointer-events-none absolute z-10"
              style={{ left: resting.x + REST_TAG_GAP, top: resting.y + REST_TAG_GAP }}
            >
              <div className="hud border border-[var(--ink-quiet)] bg-[var(--desk)] px-[8px] py-[4px] font-(family-name:--font-mono) text-[11px] whitespace-nowrap text-[var(--paper)]">
                {fr.aim.arrival(asLocalTime(preview.arrivesAt))}
              </div>
            </div>
          )}
          {column && order && (
            <MovementPreview
              seat={seat}
              origin={column.station}
              troopIds={column.troopIds}
              strength={view.me.troops
                .filter((troop) => column.troopIds.includes(troop.id))
                .reduce((sum, troop) => sum + troop.strength, 0)}
              choice={order}
              choices={order.choices}
              onChoose={(choice) =>
                setOrder(
                  (previous) =>
                    previous && {
                      ...choice,
                      choices: previous.choices,
                      x: previous.x,
                      y: previous.y,
                    },
                )
              }
              at={order}
              preview={preview}
              slots={view.me.slots}
              originName={stationNames(view).place(column.station)}
              onClose={dropHand}
              onSent={afterSent}
            />
          )}
          {openedDispatch !== null && openedCombat !== null && (
            <DispatchSheet
              dispatch={openedDispatch}
              combat={openedCombat}
              onOpenGarrison={
                combatStation === null
                  ? null
                  : () => {
                      setOpenedReport(null);
                      openGarrison(combatStation, [], boardPoint());
                    }
              }
              onOpenJournal={() => {
                setOpenedReport(null);
                openWindow('journal');
              }}
              onClose={() => setOpenedReport(null)}
            />
          )}
          {/* Haut-droite : le refus de fondation, et lui seul. **Plus rien n'y dit la visée** — le
            cartouche la porte (décision du 30/08). Pas en haut à gauche : l'échelle de route d'un
            mouvement survolé s'y pose, et le refus reste affiché jusqu'au geste suivant. */}
          {orderError !== null && (
            <div
              className={`hud absolute z-[var(--z-band)] border border-[var(--critical)] bg-[var(--desk)] px-3 py-2 text-[11px] text-[var(--critical)] ${
                narrow
                  ? 'bottom-4 left-4'
                  : /** Le journal tient la marge droite (piste 1c) : le refus ne doit pas passer dessous. */
                    windows.includes('journal')
                    ? 'top-4 left-1/2 -translate-x-1/2'
                    : 'top-4 right-4'
              }`}
            >
              {orderError}
            </div>
          )}
          {/* Bas-gauche : ce qui attend le joueur, et rien de ce qu'il possède — la carte a
            remplacé le widget de troupes (décision Pierre, 30/08). Vide, elle n'est pas là.
            **Sous le seuil elle quitte la carte** : elle est la feuille de l'entrée « à faire »
            du pied (piste A, A5), et le plateau ne lui donne que ses lignes. */}
          {!narrow && (
            <div className="absolute bottom-4 left-4 z-[var(--z-band)]">{nextActions('card')}</div>
          )}
          {/* **« En cours » se range pendant la visée** (refonte mobile, 1b) : la carte est alors à
            la cible, et la colonne passerait sous le doigt qui la nomme. */}
          {narrow && column === null && (
            <div className="absolute top-[10px] left-2 z-10">
              <UnderwayColumn
                lines={underway}
                nation={view.me.nation}
                fresh={sent === null ? null : `movement-${sent.movementId}`}
                onLocate={locateUnderway}
              />
            </div>
          )}
          {narrow && sent !== null && (
            <div className="absolute inset-x-[10px] bottom-[14px] z-[var(--z-indicator)]">
              <SentNotice
                order={sent.order}
                destination={sent.destination}
                arrivesAt={sent.arrivesAt}
                slots={view.me.slots}
                onFollow={() => setFocus({ ids: [sent.movementId], nonce: Date.now() })}
              />
            </div>
          )}
          <div className="pointer-events-none absolute right-4 bottom-4 z-[var(--z-indicator)] flex flex-col items-end gap-3 [&>*]:pointer-events-auto">
            {/* En visée sous le seuil, toucher le sol nomme une destination : la feuille du sol
              prendrait la place de la visée et la désarmerait. */}
            {!aimingOnPhone && (
              <GroundPanel
                selected={country ?? null}
                hoveredCountry={hoveredCountry}
                hoveredRegion={hoveredRegion}
                holding={
                  hoveredRegion === null ? null : (knownRegionById.get(hoveredRegion.id) ?? null)
                }
                suspendedUntil={
                  hoveredRegion === null
                    ? null
                    : (suspendedUntilByRegion.get(hoveredRegion.id) ?? null)
                }
                view={view}
                onDeselect={() => select(null)}
              />
            )}
            {/* Sous le seuil, les gestes vivent dans l'aide-mémoire du dossier de la nation : le
              coin ne porte que ce qu'on y touche souvent (refonte mobile, 1a), et cède la place
              au cartouche « transmis » le temps qu'il se lit. */}
            {!narrow && corner === 'controls' && <ControlsCard onClose={() => setCorner(null)} />}
            {!narrow && corner === 'layers' && (
              <CornerCard title={fr.foot.layersTitle} onClose={() => setCorner(null)}>
                <LayersGrid />
              </CornerCard>
            )}
            {(!narrow || sent === null) && (
              <MapButtons narrow={narrow} onRecenter={recenterOnHome} onCorner={setCorner} />
            )}
          </div>
          {narrow && corner === 'layers' && <LayersSheet onClose={() => setCorner(null)} />}
        </div>
        <Suspense fallback={null}>
          {windows.map((name, rank) => {
            const windowProps = {
              rank,
              inFront: rank === windows.length - 1,
              onBringForward: () => bringForward(name),
              onClose: () => {
                /** La manchette d'une notification ne survit pas au journal qui la portait. */
                if (name === 'journal') setJournalLead(null);
                closeWindow(name);
              },
            };
            switch (name) {
              case 'journal':
                return (
                  <JournalWindow
                    key={name}
                    view={view}
                    seat={seat}
                    leadReport={journalLead}
                    rumors={lootRumors}
                    selectedRumorId={selectedRumorId}
                    onSelectRumor={selectRumor}
                    garrisonAt={garrisonAtCombat}
                    onShowCombat={showCombat}
                    onLocate={locate}
                    onOpenGarrison={(station) => openGarrison(station, [], boardPoint())}
                    {...windowProps}
                  />
                );
              case 'telegraph':
                return (
                  <TelegraphWindow key={name} telegraph={telegraph} seat={seat} {...windowProps} />
                );
              case 'site':
                /** Sans bâtiment nommé il n'y a pas de site : l'URL a perdu son ancre, et une
                 *  modale sans sujet n'est pas une modale vide, c'est rien du tout. */
                return focused === undefined ? null : (
                  <SiteModal
                    key={name}
                    view={view}
                    seat={seat}
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
                    seat={seat}
                    focused={focused ?? null}
                    onRaiseOutpost={openOutpost}
                    {...windowProps}
                  />
                );
              case 'nation':
                return (
                  <NationWindow key={name} view={view} onLocate={locateStation} {...windowProps} />
                );
              case 'gunnery':
                return <GunneryWindow key={name} seat={seat} {...windowProps} />;
              case 'press':
                return <PressWindow key={name} press={view.press} {...windowProps} />;
              case 'settings':
                return (
                  <SettingsWindow
                    key={name}
                    seat={seat}
                    mayConclude={view.me.mayConclude}
                    defeated={view.me.defeated}
                    onShowBriefing={showBriefing}
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
          className="pointer-events-none fixed inset-0 z-[var(--z-veil)] bg-[var(--desk)]"
          style={{ animation: 'curtain-rise .9s ease forwards' }}
        />
      </SelectionSheetReport.Provider>
    </Shell>
  );
}

/**
 * **D'où l'on regarde le lieu d'une dépêche** : assez près pour lire les régions et les mâts
 * autour — la place d'une passe est un lieu, pas un continent.
 */
const DISPATCH_VIEW_DISTANCE = 20;

/** Clear of the closed hand the cursor draws, thirty-two pixels wide. */
const REST_TAG_GAP = 20;

/** Le temps de lire « transmis » et de voir la ligne neuve sortir de « En cours ». */
const SENT_NOTICE_MS = 6000;

/** En visée sous le seuil, toucher nomme une destination : la sélection du pays n'en est pas
 *  une, et la feuille du sol reviendrait sous le pouce une fois l'ordre parti. */
const keepSelection = (): void => {};

type Corner = 'layers' | 'controls';

/**
 * **Les boutons du coin de la carte** (refonte mobile, 1a ; bureau aligné le 12/10) : revenir chez
 * soi, les calques, et au bureau l'aide-mémoire — du même papier, 44 px sous le pouce, 36 à la
 * souris. Sous le seuil, les calques gardent aussi leur ligne au dossier de la nation et les gestes
 * vivent dans son aide-mémoire. `H` recentre et `?` ouvre les gestes, jamais pendant une saisie.
 */
function MapButtons({
  narrow,
  onRecenter,
  onCorner,
}: {
  narrow: boolean;
  onRecenter: () => void;
  onCorner: Dispatch<SetStateAction<Corner | null>>;
}) {
  const toggle = (card: Corner) => onCorner((open) => (open === card ? null : card));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onCorner(null);
      if (isTyping() || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '?' && !narrow) {
        event.preventDefault();
        onCorner((open) => (open === 'controls' ? null : 'controls'));
      } else if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        onRecenter();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [narrow, onRecenter, onCorner]);

  const size = narrow ? 'h-[44px] w-[44px]' : 'h-[36px] w-[36px]';
  const glyph = narrow ? 22 : 18;
  return (
    <div className="hud flex flex-col gap-2">
      <button
        type="button"
        title={fr.mapUi.recenterTitle}
        aria-label={fr.mapUi.recenter}
        aria-keyshortcuts="H"
        onClick={onRecenter}
        className={`${MAP_BUTTON} ${size}`}
      >
        <Glyph size={glyph}>
          <circle cx="10" cy="10" r="5.2" />
          <path d="M10 1.5v4.2M10 14.3v4.2M1.5 10h4.2M14.3 10h4.2" />
        </Glyph>
      </button>
      <button
        type="button"
        title={fr.foot.layersTitle}
        aria-label={fr.foot.layersTitle}
        onClick={() => toggle('layers')}
        className={`${MAP_BUTTON} ${size}`}
      >
        <LayersGlyph size={glyph} />
      </button>
      {!narrow && (
        <button
          type="button"
          title={fr.mapUi.controlsLabel}
          aria-label={fr.mapUi.controlsLabel}
          aria-keyshortcuts="?"
          onClick={() => toggle('controls')}
          className={`${MAP_BUTTON} ${size} font-(family-name:--font-body) text-[16px] leading-none`}
        >
          ?
        </button>
      )}
    </div>
  );
}

const MAP_BUTTON =
  'paper-grain flex cursor-pointer items-center justify-center border border-[var(--ink)] text-[var(--ink)] shadow-[0_2px_0_rgba(15,10,4,.55)]';

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
/**
 * **Une branche de la rose, devenue un ordre.** Piller ou saboter — un seul ordre, la même carte
 * de confirmation (S8) : le type sur le fil reste `march`, l'expédition marche jusqu'au site et
 * ce qui la distingue est ce qu'elle y fait, que le serveur seul écrit (`movements.plunder`). Un
 * ramassage est une marche vers un relevé, et le relevé du sol ne décide de rien pour lui.
 */
function choiceOf(action: OrderAction): OrderChoice {
  const said = { label: action.label, consequence: action.consequence };
  switch (action.key) {
    case 'aim':
      return { ...said, aim: action.aim, type: action.type, mission: { kind: 'march' } };
    case 'plunder':
      return {
        ...said,
        aim: action.aim,
        type: 'march',
        mission: { kind: 'plunder', buildingId: action.buildingId },
      };
    case 'collect':
      return {
        ...said,
        aim: {
          kind: 'point',
          lon: action.point[0],
          lat: action.point[1],
          onLand: true,
          coastal: false,
          surveyed: false,
        },
        type: 'march',
        mission: { kind: 'collect', sightingId: action.sightingId },
      };
  }
}

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
function previewArc(
  column: ArmedColumn,
  order: OrderChoice,
  preview: NonNullable<Previewed>,
): ArcView {
  const points = preview.route.points.map((point) => [point.lon, point.lat] as LonLat);
  return {
    state: 'mine',
    id: PREVIEW_ARC_ID,
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
    originLabel: placeLabel(preview.originName),
    destinationLabel: placeLabel(preview.destinationName),
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
  regionAt: RegionAt | null,
): ReadonlyArray<MapMarker> {
  const names = stationNames({ me });
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

  return [...posts.values()].map(({ at, held }) => {
    const stack = stackOf(held);
    const face = representativeRole(stack);
    const tier = held.find((troop) => troop.role === face)?.tier ?? 1;
    return {
      kind: 'stack' as const,
      id: stackLabelId(at),
      lonLat: at.lonLat,
      station: at,
      stack,
      place: pilePlace(at, names, regionAt),
      plate: face === null ? null : spriteUrl(me.nation, face, tier),
      pieces: pilePieces(held),
      ink: me.ink,
    };
  });
}

const stackOf = (troops: ReadonlyArray<TroopView>): Stack =>
  troops.reduce<Stack>(
    (counted, troop) => ({ ...counted, [troop.role]: (counted[troop.role] ?? 0) + 1 }),
    {},
  );

function markerOfStation(view: PlayerView, station: TroopStation): string | null {
  /** Une pile posée a désormais son marqueur : la caméra a où aller quand on ouvre sa carte. */
  if (station.kind === 'point') return stackLabelId(station);
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
    ? { lonLat: point, detectionKm: LISTENING_STATION_RADIUS_KM, contactKm: null }
    : null;
