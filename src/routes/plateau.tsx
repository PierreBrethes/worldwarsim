import { useTokenDrag } from '@/map/TokenDrag';
import { loadReadingOf, type TokenSource } from './-plateau/load-reading';
import { Navigate, createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { contactKm, outpostReachKm } from '../../convex/constants';
import { fr } from '@/i18n/fr';
import { ControlsCard, CornerCard } from '@/map/ControlsCard';
import { isTyping } from '@/map/typing';
import { WorldMap } from '@/map/WorldMap';
import type { TakeDepot } from '@/map/MapLabels';
import type { PieceClick } from '@/map/engine';
import {
  readWindows,
  withWindow,
  withoutWindow,
  type BoardSearch,
  type BoardWindow,
} from './-plateau/board-search';
import { forbiddenGroundOf } from '@/domain/drop-order';
import { endingOf } from '@/domain/ending';
import { useOpenedOnce } from './-plateau/useOpenedOnce';
import { useHeldRegions } from './-plateau/useHeldRegions';
import { useOrderPreview } from './-plateau/useOrderPreview';
import { useTours } from './-plateau/useTours';
import { usePlacing } from './-plateau/usePlacing';
import { BoardWindows } from './-plateau/BoardWindows';
import { SheetCount } from './-plateau/Window';
import { Shell } from '@/shell/Shell';
import { SelectionSheetReport, sheetHeight, sheetLift } from '@/shell/BottomSheet';
import { MAT_LIFT, useNarrowScreen } from '@/shell/viewport';
import { ErrorScreen } from '@/shell/ErrorScreen';
import { StaleSeat } from '@/shell/StaleSeat';
import {
  buildLabels,
  ownerFlags,
  type MapLabel,
  type MapMarker,
  type Reach,
} from '@/domain/labels';
import { type BuildingKey } from '@/domain/ids';
import { produces } from '@/domain/economy';
import { inkByClaimedCountry, nationInk } from '@/domain/nations';
import type { LonLat } from '@/domain/geo';
import { maquettesOf } from './-plateau/maquettes';
import { producingSites } from '@/domain/producing';
import { type HoveredRegion, type World } from '@/domain/world';
import {
  compassOf,
  type Compass,
  type CompassAction,
  type CompassTarget,
  type OrderAction,
  isOrder,
} from '@/domain/compass-rose';
import { boardPlacesOf, boardingOf, traceCompass } from '@/domain/compass-logistics';
import { MapButtons, type Corner } from './-plateau/MapButtons';
import { armedColumn, freeCapacityOf } from '@/domain/armed-column';
import {
  buildingLabelId,
  campsOf,
  markerOfStation,
  markersOf,
  stackOf,
  standingPilesOf,
} from './-plateau/board-markers';
import { handReachOf, movementReachOf } from '@/domain/board-reach';
import { depositHolders } from '@/domain/construction';
import { carry, clickPile, composeHand, dropOn, type Hand, type PileClick } from '@/domain/hand';
import {
  groupCompassOf,
  groupSlotsOf,
  holds,
  matchingOrder,
  squadLeadOf,
  toggleIn,
  type Selection,
} from '@/domain/selection';
import { SelectionBar } from './-plateau/SelectionBar';
import { carriersFor } from '@/domain/cargo-tag';
import type { DropHint, PieceFrom } from '@/map/DropHint';
import { openingFrameOf, playedTheatre } from '@/domain/theatres';
import {
  boardingRefusalDetails,
  boardingRefusalOf,
  disbandRefusalOf,
} from '@/domain/movement-orders';
import {
  type CombatReport,
  type JournalDispatch,
  type ReplayView,
  type PlayerView,
  type TroopStation,
  type TroopView,
} from '@/domain/player-view';
import { underwayOf, type RecruitmentDue, type Underway } from '@/domain/underway';
import {
  carrierIn,
  hasSiteSheet,
  isProjectionKey,
  marchingTroopIds,
  representativeRole,
  stationAtCombat,
  stationKeyOf,
  troopsAt,
  unitsOf,
  type MarchStation,
} from '@/domain/troops';
import { pilePlace, stationNames, type RegionAt } from '@/domain/station-name';
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
import { errorCode, errorMessage, handleError } from '@/data/errors';
import { notify } from '@/shell/notifications';
import { binPoint, centreOf, flyFlows, mapPoint, spent as flySpent } from '@/shell/flights';
import { useMapMotion } from '@/data/mapMotion';
import { useSupplyFlights } from './-plateau/useSupplyFlights';
import { ConstructionPanel } from './-plateau/ConstructionPanel';
import { GarrisonPanel } from './-plateau/GarrisonPanel';
import { DemolitionCard } from './-plateau/DemolitionCard';
import { DismantleCard } from './-plateau/DismantleCard';
import {
  useSendOrder,
  wireOrigin,
  choiceOf,
  groupKeyOf,
  type OrderChoice,
  type Previewed,
  type Sent,
} from './-plateau/order-wire';
import { SentNotice } from './-plateau/SentNotice';
import { UnderwayColumn } from './-plateau/UnderwayColumn';
import { LayersGrid, LayersSheet } from '@/shell/LayersSheet';
import { GroundPanel } from './-plateau/GroundPanel';
import { CombatToasts } from './-plateau/CombatToasts';
import { DispatchSheet } from './-plateau/DispatchSheet';
import { ReplayDeck, ReplayLaunch } from './-plateau/ReplayDeck';
import type { ReplayStep } from '@/domain/replay';
import { NextActions } from './-plateau/NextActions';
import { FootBar } from '@/shell/foot';
import { debtKey } from './-plateau/FoundationRows';
import { BriefingSheet } from './-plateau/BriefingSheet';
import { FirstStepsList, useFirstSteps } from './-plateau/FirstSteps';
import { shownStepOf } from '@/domain/first-steps';
import { HandSheet } from './-plateau/HandSheet';
import { LivePoster } from './-plateau/MapPoster';
import { posterOf } from '@/domain/map-poster';
import { LootCrateCard } from './-plateau/LootCrateCard';
import { CampBadge } from './-plateau/CampBadge';
import { ObjectiveBadge } from './-plateau/ObjectiveBadge';
import { StrategicPointBadge } from './-plateau/StrategicPointBadge';
import type { LootRumor } from './-plateau/JournalWindow';

type BuildingSite = { regionId: string; x: number; y: number };

/** **Le mât qu'on s'apprête à raser**, et l'endroit du geste. Un identifiant plutôt que la ligne
 *  de la vue : la vue se réinvalide sous la carte, et une copie prise au clic afficherait un
 *  niveau périmé au moment de confirmer. */
type Demolition = { buildingId: string; x: number; y: number };

/** **Le point qu'on s'apprête à démonter**, et l'endroit du geste — même contrat que `Demolition`
 *  et pour la même raison : l'identifiant voyage, la ligne se relit dans la vue. */
type Dismantling = { outpostId: string; x: number; y: number };

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

/** **La marche que la route chiffre sous un pointeur arrêté** (ADR 0026 §6), et le point où
 *  l'heure s'affiche. */
type RestAim = OrderChoice & { readonly x: number; readonly y: number };

const EMPTY_HAND: Hand = { kind: 'empty' };

/** Ce qu'une pile de la sélection a lu sur une cible : de quoi envoyer son propre ordre. */
type GroupRead = {
  readonly station: MarchStation;
  readonly troopIds: ReadonlyArray<string>;
  readonly compass: Compass | null;
};

/** L'identifiant que porte une pile sur la carte : son étiquette posée, ou sa garnison. */
const pileIdOf = (station: MarchStation): string =>
  station.kind === 'point' ? stackLabelId(station) : stationKeyOf(station);

/** **L'ordre qui vient de partir**, tant que le cartouche « transmis » le dit (refonte mobile,
 *  1d) : de quoi le suivre, et le nom de l'ordre que la branche portait. */
type SentOrder = Sent & { readonly order: string };

const PersonalBoard = lazy(() =>
  import('./-plateau/PersonalBoard').then((module) => ({ default: module.PersonalBoard })),
);

/**
 * **Where a building is *used*, never where it is maintained.** One rule for all of them, so
 * that a click means the same thing everywhere: *see what this building does for me.* The
 * record is complete on purpose — a key added to the domain without a destination has to break
 * the compilation, never produce a dead click.
 */
const WINDOW_OF_BUILDING: Readonly<Record<BuildingKey, BoardWindow>> = {
  hq: 'personalBoard',
  farm: 'personalBoard',
  mine: 'personalBoard',
  oilWell: 'personalBoard',
  arsenal: 'personalBoard',
  warehouse: 'personalBoard',
  depot: 'personalBoard',
  listening: 'personalBoard',
  /** Le Centre de recherche ouvre l'arbre (#123). */
  researchCenter: 'research',
  barracks: 'site',
  airfield: 'site',
  port: 'site',
  /** La ville de la Blitz se lit dans sa modale : ce qu'elle verse, et qui s'y tient. */
  city: 'site',
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
  // it on each render would redo the labels and the compass on every keystroke elsewhere. The
  // previous one lends its unchanged subtrees, so a new answer only renews what it changed.
  const previousView = useRef<PlayerView | null>(null);
  const view = useMemo(() => {
    if (server === undefined) return null;
    previousView.current = adaptServerView(world, server, previousView.current);
    return previousView.current;
  }, [world, server]);
  if (view === null) return <Loading />;
  return (
    <>
      {interrupted && (
        <div
          role="status"
          className="hud paper-grain fixed top-[calc(var(--board-top)/var(--hud-scale)_+_12px)] left-1/2 z-[var(--z-notice)] -translate-x-1/2 border border-l-[3px] border-[var(--critical)] px-3 py-2 text-[11px] text-[var(--ink)] float"
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
  const blitz = view.mode === 'blitz';
  /** A Blitz shows no ground card on hover alone; a country picked by click keeps its whole card. */
  const quietHover = blitz && country == null;
  const blitzTheatre = useMemo(
    () => playedTheatre({ mode: view.mode, theatre: view.theatre }),
    [view.mode, view.theatre],
  );
  const ending = endingOf(view);
  const navigate = useNavigate({ from: Route.fullPath });
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<HoveredRegion | null>(null);
  // Where the crane was clicked: the construction panel is anchored to the aimed point, since
  // what it answers is "here", not "somewhere".
  const [buildingSite, setBuildingSite] = useState<BuildingSite | null>(null);
  const [demolition, setDemolition] = useState<Demolition | null>(null);
  const [dismantling, setDismantling] = useState<Dismantling | null>(null);
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
  /** **Plusieurs piles prises ensemble** (#130) : Maj + clic, le lasso, ou au doigt l'appui long
   *  sur le plateau puis les touchers (`picking`). Levée, une pile choisie emmène les autres. */
  const [selection, setSelection] = useState<Selection>([]);
  const [picking, setPicking] = useState(false);
  /** Ce que G ou U n'ont pas pu faire, dit dans la barre jusqu'au prochain choix. */
  const [barRefusal, setBarRefusal] = useState<string | null>(null);
  /** Maj tenue au dernier appui : un clic sur une pile, figurine ou étiquette, la choisit. */
  const shifted = useRef(false);
  useEffect(() => {
    const read = (event: PointerEvent) => {
      shifted.current = event.shiftKey;
    };
    document.addEventListener('pointerdown', read, true);
    return () => document.removeEventListener('pointerdown', read, true);
  }, []);
  const [departures, setDepartures] = useState(0);
  /** Chaque levée est une fiche neuve : ses cases repartent de ce qu'on vient de prendre. */
  const [lifts, setLifts] = useState(0);
  /** **La main d'un glisser** : la pastille sous le pointeur dit tout, la fiche se tait le temps
   *  du geste (POC « Manipuler les pions »). */
  const [dragged, setDragged] = useState<Hand | null>(null);
  const column = useMemo(
    () => (hand.kind === 'held' ? armedColumn(view, hand.station, hand.troopIds) : null),
    [view, hand],
  );
  /** Ce que le moteur porte sous le pointeur : la pile posée ou la garnison d'où la main l'a
   *  prise, par l'identifiant que porte sa pile ; un avant-poste n'a pas de figurines, la main y
   *  est seule. */
  const forbidden = forbiddenGroundOf(column?.rule.roles ?? []);
  const holding = useMemo(
    () =>
      hand.kind === 'empty'
        ? null
        : {
            pileId: pileIdOf(hand.station),
            troopIds: hand.troopIds,
            forbidden,
          },
    [hand, forbidden],
  );
  const [resting, setResting] = useState<RestAim | null>(null);
  /** La rose de la pile en main, lue par la carte : la fiche y prend « fonder ». */
  const [heldCompass, setHeldCompass] = useState<Compass | null>(null);
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
  /** **Le rejeu en cours** (surface 4.7) : la vue servie, la phrase de sa dépêche, et ce que le
   *  bandeau commande — la carte le joue tant qu'il est là. */
  const [replay, setReplay] = useState<{
    readonly view: ReplayView;
    readonly said: string;
    readonly step: ReplayStep | null;
    readonly playing: boolean;
    readonly stepping: { readonly direction: 1 | -1; readonly nonce: number } | null;
  } | null>(null);
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
  const [selectedPoint, setSelectedPoint] = useState<OpenObjective | null>(null);
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
  const openStrategic = useCallback(
    (pointId: string, clientX: number, clientY: number) => {
      if (!aimingOnPhone) setSelectedPoint({ id: pointId, ...boardPoint(clientX, clientY) });
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

  /** Une pile partie, tombée, ou une Blitz — une pièce par unité, pas d'escouade — sort de la
   *  sélection d'elle-même. */
  const chosen = useMemo(
    () =>
      blitz || view.me.defeated
        ? []
        : selection.filter(
            (station) => troopsAt(view.me, stationKeyOf(station), marching).length > 0,
          ),
    [blitz, view.me, selection, marching],
  );
  const selectedPiles = useMemo(() => chosen.map(pileIdOf), [chosen]);
  /** La pièce en main emmène la sélection quand elle en est. */
  const grouped = hand.kind === 'held' && chosen.length >= 2 && holds(chosen, hand.station);
  const clearSelection = useCallback(() => {
    setSelection([]);
    setPicking(false);
    setBarRefusal(null);
  }, []);
  const choose = useCallback((next: (was: Selection) => Selection) => {
    setSelection(next);
    setBarRefusal(null);
  }, []);

  const openGarrison = useCallback(
    (station: TroopStation, preselect: ReadonlyArray<string>, at: { x: number; y: number }) => {
      setHand(EMPTY_HAND);
      /** **Un observateur lit sa garnison, il ne la compose plus** (décision du 31/08) : les
       *  cases partent avec `observing` et « préparer » avec elles, mais le panneau s'ouvre —
       *  une porte qui ne s'ouvre que parfois se lit comme une panne, et ses troupes restent
       *  les siennes à regarder. */
      setGarrison({ station, preselect, ...at });
      setGarrisonPicked(preselect);
      const marker = markerOfStation({ me: view.me }, station);
      /** **Sous le seuil la garnison est une feuille à mi-hauteur** (A7) : la carte remonte le
       *  point au-dessus d'elle plutôt que de le cadrer dessous. */
      if (marker !== null)
        setFocus({ ids: [marker], lift: narrow ? sheetLift('half') : 0, nonce: Date.now() });
    },
    [view.me, narrow],
  );

  /**
   * **Recentrer, jamais commander.** La fiche de nation nomme une adresse, le plateau est ce qui
   * s'y rend : une station qui a un marqueur est cadrée par lui, une pile posée par son point.
   */
  const locateStation = useCallback(
    (station: TroopStation) => {
      const marker = markerOfStation({ me: view.me }, station);
      if (marker !== null) setFocus({ ids: [marker], nonce: Date.now() });
    },
    [view.me],
  );

  /** **En Blitz, une pièce par unité** (15/10) : les unités qui se tiennent à une adresse. */
  /** Ce que les règles de la main lisent à une adresse : la pile, qui dit qui porte qui, et en
   *  Blitz ses unités. */
  const unitsAt = useCallback(
    (station: MarchStation) => {
      const pile = troopsAt(view.me, stationKeyOf(station), marching);
      return blitz
        ? { pile, units: unitsOf(pile).map((unit) => unit.map((troop) => troop.id)) }
        : { pile };
    },
    [blitz, view.me, marching],
  );

  const liftHand = useCallback((next: Hand) => {
    setHand(next);
    setLifts((count) => count + 1);
    setGarrison(null);
    setOrderError(null);
  }, []);

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
      /** **En Blitz, un bâtiment qui tient une de mes unités la lève** (retour de Pierre, 15/10) :
       *  il ne recrute pas tant qu'elle y est (U6), et l'unité sortie d'une formation n'avait
       *  qu'une porte, la modale, ses cases puis « préparer ». */
      if (blitz && !view.me.defeated) {
        const station: TroopStation = { kind: 'building', buildingId };
        const unit = unitsAt(station).units?.[0];
        if (unit !== undefined) {
          liftHand({ kind: 'held', station, troopIds: unit });
          return;
        }
      }
      /** **En Mondiale, un site de projection se sélectionne** (#163, comme dans Warcraft III) :
       *  l'anneau sur son mât, et la bande du plateau personnel montre ce qu'il forme. Sa fiche
       *  s'ouvre depuis la bande. */
      if (!blitz && isProjectionKey(standing.key)) {
        setGarrison(null);
        setHand(EMPTY_HAND);
        setFocus({ ids: [buildingLabelId(standing)], nonce: Date.now() });
        void navigate({
          search: (previous) => {
            const windows = (previous.windows ?? []).filter((open) => open !== 'site');
            return {
              ...withWindow({ ...previous, windows }, 'personalBoard'),
              building: buildingId,
            };
          },
        });
        return;
      }
      /** La modale ferme la visée en cours : elle est le début d'un ordre, pas son milieu. */
      /** **En Blitz tout bâtiment tenu a sa modale** : le QG forme l'infanterie, la ville dit ce
       *  qu'elle verse, et la garnison s'y compose comme dans une caserne. */
      const siteModal = hasSiteSheet(view.mode, standing.key);
      if (siteModal) {
        setGarrison(null);
        setHand(EMPTY_HAND);
        setFocus({ ids: [buildingLabelId(standing)], nonce: Date.now() });
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
        search: (previous) => {
          const next = withWindow(previous, siteModal ? 'site' : WINDOW_OF_BUILDING[standing.key]);
          /** Un site resté ouvert se retargeterait sur ce bâtiment, qui n'a pas de fiche de site. */
          const windows = (next.windows ?? []).filter((open) => siteModal || open !== 'site');
          return { ...next, windows, building: buildingId };
        },
      });
    },
    [
      navigate,
      openGarrison,
      boardPoint,
      view.me,
      view.mode,
      marching,
      narrow,
      column,
      blitz,
      liftHand,
      unitsAt,
    ],
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

  const dropHand = useCallback(() => {
    setHand(EMPTY_HAND);
    setResting(null);
  }, []);

  /**
   * **Maj + clic, ou au doigt un toucher pendant qu'on choisit** (#130) : la pile entre dans la
   * sélection ou en sort, avec celle qu'on tenait. Sans Maj, un clic hors de la sélection la défait
   * et lève comme toujours ; sur une pile choisie, il lève le groupe.
   */
  const selectClick = useCallback(
    (click: PileClick): boolean => {
      if (blitz || view.me.defeated || click.kind !== 'pile') return false;
      if (shifted.current || picking) {
        const held = hand.kind === 'held' ? hand.station : null;
        choose((was) =>
          toggleIn(
            held === null || holds(was, held) || stationKeyOf(held) === stationKeyOf(click.station)
              ? was
              : [...was, held],
            click.station,
          ),
        );
        if (hand.kind === 'held') dropHand();
        return true;
      }
      if (chosen.length > 0 && !holds(chosen, click.station)) clearSelection();
      return false;
    },
    [blitz, view.me.defeated, picking, hand, chosen, choose, dropHand, clearSelection],
  );

  /** **Un clic sur une de mes piles** : il lève, repose, ou vise — `clickPile` décide, et le
   *  plateau rend vrai quand la pile cliquée devient la destination. */
  const applyPileClick = useCallback(
    (click: PileClick, clientX: number, clientY: number): boolean => {
      const move = clickPile(hand, click, unitsAt(click.station));
      if (move.kind === 'pose') return true;
      if (move.kind === 'drop') dropHand();
      else {
        // Une troupe de la pile déployée compose la main : la fiche, remontée sur la main, en
        // reprend les cases — et la caméra ne bouge pas sous le doigt qui coche.
        liftHand(move.hand);
        /** La fiche monte à l'aperçu : la pièce levée remonte au-dessus d'elle, sans quoi le
         *  toucher qui la repose tomberait sur la feuille. */
        if (narrow && click.kind === 'pile')
          setReveal({
            ...boardPoint(clientX, clientY),
            floor: sheetHeight('peek'),
            nonce: Date.now(),
          });
      }
      return false;
    },
    [hand, liftHand, dropHand, narrow, boardPoint, unitsAt],
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
      const click: PileClick = { kind: 'pile', station, troopIds };
      if (selectClick(click)) return false;
      return applyPileClick(click, clientX, clientY);
    },
    [openGarrison, boardPoint, view.me, marching, applyPileClick, selectClick],
  );

  /**
   * The fan the right click opens. Armed, it holds **only** the marches the server will accept
   * for that target — same function, same rule (ADR 0015). Unarmed, it is the ordinary fan.
   */
  /** Ce que la pile armée peut encore charger (`freeCapacityOf`). */
  const freeCapacity = useMemo(
    () => (column === null ? 0 : freeCapacityOf({ me: view.me }, column.troopIds)),
    [column, view.me],
  );

  const { trace, setTrace, onTour, tourLoops } = useTours(seat, view.me, setOrderError);
  /** **La rose d'une pile de la sélection**, lue comme si elle était en main. */
  const pileCompass = useCallback(
    (target: CompassTarget, station: MarchStation, troopIds: ReadonlyArray<string>) =>
      compassOf(
        target,
        view,
        armedColumn(view, station, troopIds).rule,
        station,
        freeCapacityOf(view, troopIds),
        troopIds,
        Date.now(),
      ),
    [view],
  );
  /** Ce que chaque pile de la sélection a lu, par la cible de l'ordre du groupe : l'envoi y
   *  reprend la branche de chacune. */
  const groupReads = useRef(new Map<string, ReadonlyArray<GroupRead>>());
  /** L'envoi du groupe, qui lit l'aperçu, l'envoi et la fin du geste déclarés plus bas. */
  const groupSend = useRef<(reads: ReadonlyArray<GroupRead>, action: CompassAction) => void>(
    () => {},
  );
  /** **La sélection lue sur une cible** : la pile en main d'abord, puis les autres entières. */
  const readGroup = useCallback(
    (target: CompassTarget, lead: Hand & { kind: 'held' }, others: Selection) => {
      const reads: ReadonlyArray<GroupRead> = [
        { station: lead.station, troopIds: lead.troopIds },
        ...others.map((station) => ({
          station,
          troopIds: troopsAt(view.me, stationKeyOf(station), marching).map((troop) => troop.id),
        })),
      ].map((pile) => ({ ...pile, compass: pileCompass(target, pile.station, pile.troopIds) }));
      const group = groupCompassOf(
        reads.map((read) => read.compass),
        groupSlotsOf(
          view,
          reads.map((read) => read.troopIds),
        ),
      );
      for (const action of group?.actions ?? [])
        if (isOrder(action)) groupReads.current.set(groupKeyOf(action), reads);
      return group;
    },
    [view, marching, pileCompass],
  );
  const compassOfTarget = useCallback(
    (target: CompassTarget) =>
      grouped && hand.kind === 'held'
        ? readGroup(
            target,
            hand,
            chosen.filter((station) => stationKeyOf(station) !== stationKeyOf(hand.station)),
          )
        : trace !== null && column?.troopIds.includes(trace.carrierId) === true
          ? traceCompass(target, view, trace)
          : compassOf(
              target,
              view,
              column?.rule ?? null,
              column?.station ?? null,
              freeCapacity,
              column?.troopIds ?? null,
              Date.now(),
            ),
    [view, column, freeCapacity, trace, grouped, hand, chosen, readGroup],
  );

  const motion = useMapMotion();
  useSupplyFlights(view, motion);
  const foundHere = useMutation(api.movements.foundOutpostHere);
  const startConstruction = useMutation(api.constructions.start);
  const raiseOutpost = useMutation(api.constructions.raiseOutpost);
  const respecialize = useMutation(api.movements.respecialize);
  const boardTransport = useMutation(api.movements.board);
  const disembark = useMutation(api.movements.disembark);
  const bombard = useMutation(api.movements.bombard);
  const deliver = useMutation(api.logistics.deliver);
  const airdrop = useMutation(api.logistics.airdrop);
  const loadTransport = useMutation(api.logistics.load);
  /** **Charger** (ADR 0028 §4) : des jetons du plateau personnel ou d'un dépôt, glissés sur un
   *  transport ; la main montre alors toutes les étiquettes de transport. */
  const [carryingTokens, setCarryingTokens] = useState(false);
  const tokens = useTokenDrag<TokenSource>({
    read: (from, carrierId, resource, grabbed) =>
      loadReadingOf(view, carrierId, from, resource, grabbed, Date.now()),
    drop: (_from, carrierId, resource, amount) => {
      setOrderError(null);
      const carrier = document.querySelector(`[data-carrier-id="${carrierId}"]`);
      const depot = typeof _from === 'string' ? undefined : _from.outpostId;
      loadTransport({ ...seat, troopId: carrierId as Id<'troops'>, resource, amount }).then(
        () => {
          // Confirmé : les jetons partent du bac, ou du dépôt, vers l'étiquette du transport.
          const lonLat = view.me.outposts.find((one) => one.id === depot)?.lonLat;
          const from = depot === undefined ? binPoint(resource) : lonLat && mapPoint(lonLat);
          if (carrier !== null && from)
            void flyFlows([{ resource, amount, from, to: centreOf(carrier) }], motion);
          notify(fr.logistics.loaded(amount, fr.resources[resource]), 'info');
        },
        (problem: unknown) => handleError(problem, setOrderError),
      );
    },
    onHold: setCarryingTokens,
  });
  /** Prendre au dépôt, toujours la même fonction : la carte ne se redessine pas pour une
   *  identité neuve (#189). La prise lit le glisser du dernier rendu. */
  const latestTokens = useRef(tokens);
  useEffect(() => {
    latestTokens.current = tokens;
  });
  const takeDepot = useCallback<TakeDepot>(
    (outpostId, resource, event) => latestTokens.current.start({ outpostId }, resource, event),
    [],
  );

  /** **L'ordre parti, la feuille se referme seule** (refonte mobile, 1d) : sous le seuil, le
   *  cartouche « transmis » prend le relais le temps qu'on le lise. */
  const afterSent = useCallback(
    (filed: Sent, label: string) => {
      if (narrow) setSent({ ...filed, order: label });
      setDepartures((count) => count + 1);
      dropHand();
    },
    [narrow, dropHand],
  );
  const sendOrder = useSendOrder(seat);
  /** **Tirer un passager hors de l'étiquette** (POC du 16/10) : il descend au pied de son
   *  transport, sur-le-champ — la règle de `movements.disembark`, que l'étiquette a déjà lue. */
  const disembarkFromTag = useCallback(
    (troopIds: ReadonlyArray<string>) => {
      setOrderError(null);
      disembark({ ...seat, troopIds: troopIds.map((troopId) => troopId as Id<'troops'>) }).catch(
        (problem: unknown) => handleError(problem, setOrderError),
      );
    },
    [disembark, seat],
  );
  /** **Un ordre en vol** : un second lâcher n'envoie pas les mêmes troupes deux fois, et la fiche
   *  attend son issue pour revenir. */
  const inFlight = useRef(false);
  const settle = useCallback(() => {
    inFlight.current = false;
    setDragged(null);
  }, []);
  const carryEnded = useCallback(() => {
    if (!inFlight.current) setDragged(null);
  }, []);
  /** **La pile en main monte à bord d'un transport** : l'embarquement de la rose et celui d'une
   *  pièce lâchée sur sa pile partent du même appel. */
  const boardHand = useCallback(
    (troopIds: ReadonlyArray<string>, carrierId: string) => {
      setOrderError(null);
      return boardTransport({
        ...seat,
        troopIds: troopIds.map((troopId) => troopId as Id<'troops'>),
        carrierId: carrierId as Id<'troops'>,
      });
    },
    [boardTransport, seat],
  );
  /** L'aperçu du serveur sous la main, lu par l'envoi pour nommer la destination. */
  const previewNow = useRef<{ aim: OrderChoice['aim']; preview: Previewed } | undefined>(undefined);
  const actOnCompass = useCallback(
    (action: CompassAction, at: { x: number; y: number }) => {
      /** **Un ordre de colonne en vol, une fois** : le second lâcher n'envoie pas les mêmes troupes
       *  deux fois, et la main ne se repose qu'à l'issue (refus compris). */
      const sendColumn = (send: () => Promise<Sent>, label: string) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setOrderError(null);
        send().then(
          (filed) => {
            settle();
            afterSent(filed, label);
          },
          (problem: unknown) => {
            settle();
            handleError(problem, setOrderError);
            dropHand();
          },
        );
      };
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
            point: { lon: action.point[0], lat: action.point[1] },
          }).then(
            () => {
              const raised = view.me.buildings.find(
                (one) => one.key === action.buildingKey && one.regionId === action.regionId,
              );
              flySpent(raised?.nextLevelCost ?? {}, action.point, motion);
            },
            (problem: unknown) => handleError(problem, setOrderError),
          );
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
        /** **Embarquer au point du transport est immédiat** (révision de l'ADR 0025, 15/10) : pas
         *  d'aperçu ni de slot, la pile armée monte à bord et la visée se referme. */
        case 'board':
          if (column === null) return;
          boardHand(column.troopIds, action.carrierId).then(dropHand, (problem: unknown) =>
            handleError(problem, setOrderError),
          );
          return;
        /** **Livrer** (ADR 0028 §4) : la pastille l'a dit, le transport part au lâcher. **Larguer** :
         *  l'avion part de même, paie l'aller-retour et rentre seul. */
        case 'deliver':
        case 'airdrop': {
          if (column === null) return;
          const order = {
            ...seat,
            origin: wireOrigin(column.station),
            troopIds: column.troopIds.map((troopId) => troopId as Id<'troops'>),
          };
          sendColumn(
            () =>
              (action.key === 'deliver'
                ? deliver({ ...order, outpostId: action.outpostId as Id<'outposts'> })
                : airdrop({
                    ...order,
                    target:
                      action.target.kind === 'outpost'
                        ? { kind: 'outpost', outpostId: action.target.outpostId as Id<'outposts'> }
                        : {
                            kind: 'squad',
                            point: { lon: action.target.point[0], lat: action.target.point[1] },
                          },
                  })
              ).then((filed) => ({ ...filed, destination: action.destination })),
            action.label,
          );
          return;
        }
        /** **Tracer une tournée** (ADR 0028) : le premier dépôt, puis les suivants ; rien ne part
         *  avant que l'étiquette du transport la lance. */
        case 'tour':
          setOrderError(null);
          setTrace({ carrierId: action.carrierId, stops: [action.outpostId] });
          dropHand();
          return;
        case 'tourStop':
          setTrace((was) =>
            was === null ? was : { ...was, stops: [...was.stops, action.outpostId] },
          );
          dropHand();
          return;
        /** **Bombarder est immédiat** (B20) : la branche est l'ordre, aucune colonne ne part ;
         *  la pièce reste posée et la main se repose. */
        case 'bombard':
          setOrderError(null);
          bombard({
            ...seat,
            troopId: action.troopId as Id<'troops'>,
            target:
              action.target.kind === 'camp'
                ? { kind: 'camp', campId: action.target.campId as Id<'campSightings'> }
                : { kind: 'track', movementId: action.target.movementId as Id<'movements'> },
          }).then(dropHand, (problem: unknown) => handleError(problem, setOrderError));
          return;
        /** **L'ordre part au lâcher** (POC « Manipuler les pions », 16/10) : la pastille sous
         *  la main l'a déjà dit, il n'y a plus de carte à confirmer. */
        case 'aim':
        case 'plunder':
        case 'capture':
        case 'collect': {
          if (grouped) {
            // Never the lead alone: a group read that is gone is said, not half sent.
            const reads = groupReads.current.get(groupKeyOf(action));
            if (reads === undefined) {
              setOrderError(fr.selection.reread);
              dropHand();
            } else groupSend.current(reads, action);
            return;
          }
          if (column === null) return;
          sendColumn(() => {
            const chosen = choiceOf(action);
            const seen = previewNow.current;
            return sendOrder(
              column.station,
              column.troopIds,
              chosen,
              // The stop the server measured may be another target than the one let go on.
              seen !== undefined && JSON.stringify(seen.aim) === JSON.stringify(chosen.aim)
                ? seen.preview
                : undefined,
            );
          }, action.label);
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
      motion,
      view.me.buildings,
      foundHere,
      startConstruction,
      raiseOutpost,
      respecialize,
      boardHand,
      bombard,
      deliver,
      airdrop,
      dropHand,
      column,
      seat,
      narrow,
      sendOrder,
      afterSent,
      settle,
      grouped,
      setTrace,
    ],
  );

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
      const move = composeHand(hand, troopIds, hand.kind === 'held' ? unitsAt(hand.station) : {});
      if (move.kind !== 'lift') {
        dropHand();
        return;
      }
      setHand(move.hand);
    },
    [hand, dropHand, unitsAt],
  );

  const restAt = useCallback(
    (action: OrderAction | null, at: { x: number; y: number }) =>
      setResting(action === null ? null : { ...choiceOf(action), ...at }),
    [],
  );

  const {
    placing,
    placingCard,
    setPlacingAim,
    hold,
    dismissPlacing,
    placeAt,
    holdTile,
    placeTile,
    foundation,
    armed,
    mobilizeError,
    setMobilizeError,
  } = usePlacing(view, seat, motion, setOrderError);

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

  const inkByCountry = useMemo(
    () => (blitz ? new Map<string, string>() : inkByClaimedCountry([view.me, ...view.opponents])),
    [blitz, view.me, view.opponents],
  );

  const { held, knownRegionById, suspendedUntilByRegion, surveyClock } = useHeldRegions(
    seat,
    blitz,
  );
  const cut = useMemo(
    () => ({
      unlinked: view.me.regions.filter((region) => !region.linked).map((region) => region.id),
      producing: new Set(
        view.me.buildings
          .filter((building) => produces(building.key))
          .map((building) => building.regionId),
      ),
    }),
    [view.me.regions, view.me.buildings],
  );

  const reachedOutposts = useMemo(
    () =>
      view.me.outposts.map(({ id, lonLat, level, standsAt }) => ({
        id,
        lonLat,
        reachKm: outpostReachKm(level),
        standsAt,
      })),
    [view.me.outposts],
  );

  const built = useMemo(
    () => ({
      regionIds: view.me.buildings.map(({ regionId }) => regionId),
      ink: view.me.ink,
    }),
    [view.me.buildings, view.me.ink],
  );

  // Every building stands at the point written at its placement (ADR 0029), and so does the
  // work that will raise it; an outpost carries its own point, because it *is* a point and
  // colours no ground (fiche 03).
  const holders = useMemo(
    () => depositHolders({ me: view.me, surveyedInstallations: view.surveyedInstallations }),
    [view.me, view.surveyedInstallations],
  );
  const markers = useMemo<ReadonlyArray<MapMarker>>(
    () =>
      markersOf(view, { marching, trace, regionAt, toggles, placing, holders, knownRegionById }),
    // Les champs de `view` que les marqueurs lisent, pas la vue entière : elle se réinvalide sans cesse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      marching,
      trace,
      regionAt,
      view.me,
      view.loadedAt,
      view.buildCatalog,
      view.lootSightings,
      view.camps,
      view.objectives,
      view.strategicPoints,
      view.surveyedInstallations,
      view.neutralSites,
      knownRegionById,
      toggles.buildings,
      toggles.deposits,
      placing,
      holders,
      view.mode,
      toggles.objectives,
    ],
  );

  const { arcs, loadedAt, captures, mode } = view;
  const ink = view.me.ink;
  const labels = useMemo(() => {
    const built = buildLabels({ arcs, loadedAt, captures, me: { ink } }, markers);
    return mode === 'blitz'
      ? ownerFlags(
          built,
          (regionId) => {
            const held = knownRegionById.get(regionId);
            return held === undefined ? null : nationInk(held.nation);
          },
          ink,
        )
      : built;
  }, [arcs, loadedAt, captures, mode, ink, markers, knownRegionById]);

  /** La pile entière, par n'importe laquelle de ses pièces — ou, `single`, la troupe pressée
   *  longuement (POC du 16/10). La garnison d'un bâtiment se lève par ses figurines comme une
   *  pile posée. */
  const pileOf = useCallback(
    (pileId: string) => {
      const pile = markers.find(
        (marker): marker is Extract<MapMarker, { kind: 'stack' }> =>
          marker.kind === 'stack' && marker.id === pileId,
      );
      const building = view.me.buildings.find(
        (candidate) => stationKeyOf({ kind: 'building', buildingId: candidate.id }) === pileId,
      );
      const station: TroopStation | undefined =
        pile?.station ?? (building && { kind: 'building', buildingId: building.id });
      return station === undefined || station.kind === 'home' ? null : { station, pile };
    },
    [markers, view.me.buildings],
  );
  const pileClickOf = useCallback(
    (hit: PieceClick, single = false): PileClick | null => {
      const found = pileOf(hit.pileId);
      if (found === null) return null;
      const { station, pile } = found;
      const troopId = hit.troopIds[0];
      return single && troopId !== undefined
        ? { kind: 'troop', station, troopId }
        : {
            kind: 'pile',
            station,
            /** En Blitz, la figurine touchée est une unité (15/10) : `clickPile` la lève entière. */
            troopIds:
              blitz && hit.troopIds.length > 0
                ? hit.troopIds
                : (pile?.pieces.troopIds ??
                  troopsAt(view.me, hit.pileId, marching).map((troop) => troop.id)),
          };
    },
    [pileOf, view.me, marching, blitz],
  );

  /** Une pièce dessinée, ou l'étiquette d'une de mes piles posées : la pile qu'elle désigne. */
  const clickOfFrom = useCallback(
    (from: PieceFrom, single = false): PileClick | null => {
      if (from.kind === 'piece') return pileClickOf(from.hit, single);
      if (from.station.kind !== 'point') return null;
      const troopIds = troopsAt(view.me, stationKeyOf(from.station), marching).map(
        (troop) => troop.id,
      );
      return { kind: 'pile', station: from.station, troopIds };
    },
    [pileClickOf, view.me, marching],
  );

  /**
   * **Le glisser prend la pièce** (15/10) : une troupe déployée seule — c'est ainsi qu'une pile se
   * scinde —, ou la pile ; en Blitz, l'unité touchée, ou la première de l'étiquette.
   */
  const takePiece = useCallback(
    (from: PieceFrom, single: boolean): Hand | null => {
      const click = clickOfFrom(from, single);
      if (click === null) return null;
      const rules = unitsAt(click.station);
      const next: Hand =
        rules.units !== undefined && from.kind === 'stack'
          ? (() => {
              const move = clickPile(EMPTY_HAND, click, rules);
              return move.kind === 'lift' ? move.hand : EMPTY_HAND;
            })()
          : carry(hand, click, rules.pile);
      if (next.kind === 'empty') return null;
      if (next !== hand) liftHand(next);
      return next;
    },
    [clickOfFrom, unitsAt, hand, liftHand],
  );
  const carryPiece = useCallback(
    (from: PieceFrom, single: boolean): boolean => {
      const next = takePiece(from, single);
      // A troop taken alone, or a pile outside the selection, goes by itself.
      if (next?.kind === 'held' && (single || !holds(chosen, next.station))) clearSelection();
      setDragged(next);
      return next !== null;
    },
    [takePiece, chosen, clearSelection],
  );
  /** Released where a long press took one troop, the click lifts that troop alone. */
  const pieceClick = useCallback(
    (hit: PieceClick): boolean => {
      if (hit.single === true) return takePiece({ kind: 'piece', hit }, true) !== null;
      const click = pileClickOf(hit);
      if (click === null || selectClick(click)) return false;
      return applyPileClick(click, hit.clientX, hit.clientY);
    },
    [pileClickOf, applyPileClick, takePiece, selectClick],
  );

  /** **Le lasso** (#130) : il ajoute ce qu'il entoure à ce qui était choisi quand il a commencé. */
  const lassoBase = useRef<Selection | null>(null);
  const lasso = useCallback(
    (pileIds: ReadonlyArray<string>, done: boolean) => {
      if (blitz || view.me.defeated) return;
      const base = (lassoBase.current ??= chosen);
      if (done) lassoBase.current = null;
      const next = pileIds
        .flatMap((id) => pileOf(id)?.station ?? [])
        .reduce<Selection>((was, station) => (holds(was, station) ? was : [...was, station]), base);
      if (next.map(pileIdOf).join() !== selectedPiles.join()) choose(() => next);
    },
    [blitz, view.me.defeated, chosen, pileOf, selectedPiles, choose],
  );

  /** **La sélection part** (#130) : un ordre par pile, la branche que chacune avait lue sur la
   *  cible ; le serveur relit chacun avec sa propre règle, et son slot. */
  const sendGroup = useCallback(
    (reads: ReadonlyArray<GroupRead>, action: CompassAction) => {
      if (inFlight.current) return;
      const orders = reads.flatMap(({ station, troopIds, compass }) => {
        const own = matchingOrder(compass, action);
        return own !== undefined && isOrder(own) ? [{ station, troopIds, own }] : [];
      });
      if (orders.length !== reads.length) {
        setOrderError(fr.selection.partRefused(reads.length - orders.length, reads.length, null));
        dropHand();
        return;
      }
      inFlight.current = true;
      setOrderError(null);
      void Promise.allSettled(
        orders.map(({ station, troopIds, own }) => sendOrder(station, troopIds, choiceOf(own))),
      ).then((results) => {
        settle();
        // A pile the server refused stays chosen; one that left drops out by itself.
        const failed = results.find((result) => result.status === 'rejected');
        if (failed === undefined) clearSelection();
        else handleError(failed.reason, setOrderError);
        const sent = results.find((result) => result.status === 'fulfilled');
        if (sent !== undefined) afterSent(sent.value, action.label);
        else dropHand();
      });
    },
    [sendOrder, settle, clearSelection, afterSent, dropHand],
  );
  groupSend.current = sendGroup;

  /** **G : former une escouade** — les piles choisies rejoignent la plus grosse, par la branche
   *  « rejoindre » de chacune ; une seule qui ne peut pas, et la barre le dit. */
  const formSquad = useCallback(() => {
    const sizeOf = (station: MarchStation) =>
      troopsAt(view.me, stationKeyOf(station), marching).map((troop) => troop.id);
    const lead = squadLeadOf(
      chosen.map((station) => ({ station, troops: sizeOf(station).length })),
    );
    const [first, ...rest] = chosen.filter(
      (station) => lead === null || stationKeyOf(station) !== stationKeyOf(lead),
    );
    if (chosen.length < 2 || lead === null || first === undefined) {
      setBarRefusal(chosen.length < 2 ? fr.selection.atLeastTwo : fr.selection.noSquadHere);
      return;
    }
    const target: CompassTarget = {
      kind: 'force',
      id: stackLabelId(lead),
      country: lead.country === '' ? null : lead.country,
      name: fr.compass.fallbackForce,
      headcount: sizeOf(lead).length,
      onLand: !lead.afloat,
      station: lead,
      regionId: null,
    };
    const group = readGroup(
      target,
      { kind: 'held', station: first, troopIds: sizeOf(first) },
      rest,
    );
    const join = group?.actions.find((action) => action.key === 'aim' && action.join !== undefined);
    const reads = join?.key === 'aim' ? groupReads.current.get(groupKeyOf(join)) : undefined;
    if (join === undefined || reads === undefined) {
      setBarRefusal(group?.refusal ?? fr.selection.noSquadHere);
      return;
    }
    sendGroup(reads, join);
  }, [chosen, view.me, marching, readGroup, sendGroup]);

  const disbandMutation = useMutation(api.movements.disband);
  /** **U : dissoudre l'escouade choisie** — ses pièces se posent à part, autour de son point. */
  const disbandSquad = useCallback(() => {
    const [only] = chosen;
    const pile =
      only === undefined || chosen.length !== 1
        ? []
        : troopsAt(view.me, stationKeyOf(only), marching);
    const refusal = disbandRefusalOf({
      onPoint: only?.kind === 'point' && chosen.length === 1,
      pieces: pile.filter((troop) => carrierIn(troop, pile) === null).length,
      blitz,
      loaded:
        only?.kind === 'point' &&
        view.me.lootPoints.some(
          (spot) => spot.lon === only.lonLat[0] && spot.lat === only.lonLat[1],
        ),
    });
    if (refusal !== null || only?.kind !== 'point') {
      setBarRefusal(fr.errors[refusal ?? 'NOT_A_SQUAD']());
      return;
    }
    setBarRefusal(null);
    disbandMutation({ ...seat, point: { lon: only.lonLat[0], lat: only.lonLat[1] } }).then(
      clearSelection,
      (problem: unknown) => handleError(problem, setBarRefusal),
    );
  }, [chosen, view.me, marching, blitz, disbandMutation, seat, clearSelection]);

  /** Échap lâche la sélection une fois la main vide ; G et U parlent à la sélection. */
  useEffect(() => {
    if (chosen.length === 0 && !picking) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping() || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape' && hand.kind === 'empty') clearSelection();
      else if (event.key === 'g' || event.key === 'G') {
        event.preventDefault();
        formSquad();
      } else if (event.key === 'u' || event.key === 'U') {
        event.preventDefault();
        disbandSquad();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [chosen.length, picking, hand.kind, clearSelection, formSquad, disbandSquad]);

  /** Échap lâche aussi le pays lu, sauf quand une fenêtre est devant : c'est elle qu'il ferme. */
  const surfaceOpen = windows.some((name) => name !== 'personalBoard');
  useEffect(() => {
    if (country == null || surfaceOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && hand.kind === 'empty' && !isTyping()) select(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [country, surfaceOpen, hand.kind, select]);

  /** Un clic net sur le plateau, main vide, défait la sélection — sauf au doigt qui choisit. */
  /** **Le site de projection sélectionné** (#163) : celui que la bande fait former, tant
   *  qu'elle est dépliée et que sa fiche n'est pas devant. */
  const selectedSite =
    blitz || !windows.includes('personalBoard') || windows.includes('site')
      ? null
      : (view.me.buildings.find(
          (building) => building.id === focused && isProjectionKey(building.key),
        ) ?? null);
  /** Un clic dans le vide désélectionne le site : la bande revient aux tuiles. */
  const deselectSite = useCallback(
    () =>
      void navigate({
        search: ({ building: _dropped, ...rest }) => rest,
      }),
    [navigate],
  );
  const readGround = useCallback(
    (name: string | null) => {
      if (!picking && hand.kind === 'empty') clearSelection();
      void navigate({
        search: ({ country: _country, building, ...rest }) => ({
          ...rest,
          ...(building === undefined || building === selectedSite?.id ? {} : { building }),
          ...(name ? { country: name } : {}),
        }),
        replace: true,
      });
    },
    [picking, hand.kind, clearSelection, navigate, selectedSite?.id],
  );
  const startPicking = useCallback(() => {
    dropHand();
    setPicking(true);
  }, [dropHand]);

  const selectionBar =
    dragged !== null || (chosen.length === 0 && !picking) ? null : (
      <SelectionBar
        piles={chosen.length}
        roles={chosen.flatMap((station) =>
          troopsAt(view.me, stationKeyOf(station), marching).map((troop) => troop.role),
        )}
        picking={picking}
        refusal={barRefusal}
        onForm={formSquad}
        onDisband={disbandSquad}
        onClear={clearSelection}
        onDone={() => setPicking(false)}
      />
    );

  /** **La pièce lâchée sur une de mes piles** (15/10) : sur un transport de son adresse elle
   *  embarque, sur elle-même elle se repose ; ailleurs c'est poser, et la rose s'ouvre. */
  const dropPiece = useCallback(
    (on: PieceFrom): 'pose' | 'board' | 'back' => {
      const click = clickOfFrom(on);
      if (click === null || hand.kind !== 'held') return 'pose';
      const drop = dropOn(hand, click, unitsAt(click.station).pile);
      if (drop.kind === 'pose') return 'pose';
      if (drop.kind === 'putBack') {
        dropHand();
        return 'back';
      }
      if (inFlight.current) return 'board';
      inFlight.current = true;
      boardHand(hand.troopIds, drop.carrierId).then(
        () => {
          settle();
          dropHand();
        },
        (problem: unknown) => {
          settle();
          handleError(problem, setOrderError);
        },
      );
      return 'board';
    },
    [clickOfFrom, hand, unitsAt, dropHand, boardHand, settle],
  );

  /** **My transports that could take the hand** (POC, `avail`): their rings beat while it is
   *  held, and their tags open on their seats. */
  const availablePiles = useMemo((): ReadonlyArray<string> => {
    if (hand.kind !== 'held') return [];
    const held = view.me.troops.filter((troop) => hand.troopIds.includes(troop.id));
    const piles = new Map<string, { station: TroopStation; troops: TroopView[] }>();
    for (const troop of view.me.troops) {
      if (marching.has(troop.id) || hand.troopIds.includes(troop.id)) continue;
      const key = stationKeyOf(troop.stationedAt);
      const pile = piles.get(key);
      if (pile === undefined) piles.set(key, { station: troop.stationedAt, troops: [troop] });
      else pile.troops.push(troop);
    }
    return [...piles.values()].flatMap(({ station, troops }) =>
      carriersFor(held, troops).length === 0
        ? []
        : [station.kind === 'point' ? stackLabelId(station) : stationKeyOf(station)],
    );
  }, [hand, view.me.troops, marching]);
  /** **Le signe d'embarquement**, sous le pointeur, sur un transport de la même adresse — les
   *  places d'après, ou le motif. Ailleurs, la rose le dit (`undefined`). */
  const dropHintOf = useCallback(
    (on: PieceFrom): DropHint | null | undefined => {
      const click = clickOfFrom(on);
      if (click === null || hand.kind !== 'held') return undefined;
      const { pile } = unitsAt(click.station);
      const drop = dropOn(hand, click, pile);
      if (drop.kind === 'pose') return undefined;
      if (drop.kind === 'putBack')
        return { icon: '↺', tone: 'calm', verb: fr.drop.putBack, detail: fr.drop.putBackDetail };
      const carrier = pile.find((troop) => troop.id === drop.carrierId)!;
      const held = pile.filter((troop) => hand.troopIds.includes(troop.id));
      const boarding = boardingOf(view.me.buildings, click.station, carrier, held, pile);
      const refusal = boardingRefusalOf(boarding);
      const seated = {
        carrierId: carrier.id,
        need: boardingRefusalDetails(boarding).needed,
        fits: refusal === null,
      };
      return refusal === null
        ? {
            boarding: seated,
            icon: '⤓',
            tone: 'order',
            verb: fr.drop.verbs.board,
            detail: `${fr.compass.transports([carrier.role])} · ${boardPlacesOf(boarding)}`,
          }
        : {
            boarding: seated,
            icon: '✕',
            tone: 'refused',
            verb: fr.drop.boardRefused,
            detail: fr.errors[refusal](boardingRefusalDetails(boarding)),
          };
    },
    [clickOfFrom, hand, unitsAt, view.me.buildings],
  );
  /** **Une pile de Blitz se dessine en unités** (15/10) : une pièce chacune, et rien ne se
   *  déploie — la pièce est déjà l'unité. */
  const standing = useMemo(
    () => standingPilesOf(view.me, markers, marching, blitz),
    [markers, view.me, marching, blitz],
  );
  const maquettes = useMemo(() => {
    const keyOf = new Map(view.objectives.map((objective) => [objective.id, objective.key]));
    return maquettesOf(markers, (id) => keyOf.get(id), producingSites(view.me));
  }, [markers, view.objectives, view.me]);
  const camps = useMemo(() => campsOf(markers), [markers]);

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
    () => handReachOf(view.me, column, blitzTheatre),
    [column, view.me, blitzTheatre],
  );
  const movementReach = useMemo<Reach | null>(
    () =>
      movementReachOf(
        { arcs: view.arcs, me: { troops: view.me.troops } },
        hoveredMovement,
        surveyClock,
        blitzTheatre,
      ),
    [hoveredMovement, surveyClock, view.arcs, view.me.troops, blitzTheatre],
  );
  const selectedCampView =
    selectedCamp === null ? null : (view.camps.find((camp) => camp.id === selectedCamp.id) ?? null);
  const selectedObjectiveView =
    selectedObjective === null
      ? null
      : (view.objectives.find((objective) => objective.id === selectedObjective.id) ?? null);
  const selectedPointView =
    selectedPoint === null
      ? null
      : (view.strategicPoints.find((point) => point.id === selectedPoint.id) ?? null);
  const selectedLootSighting =
    selectedLoot === null
      ? null
      : (view.lootSightings.find(
          (sighting) => sighting.id === selectedLoot.id && sighting.present,
        ) ?? null);
  const poster = useCallback(
    (label: MapLabel) => {
      return posterOf(label, view, Date.now()) === null ? null : (
        <LivePoster label={label} view={view} />
      );
    },
    [view],
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

  useOpenedOnce(ending.key === null ? null : `wws-ending-${seat.seasonId}-${ending.key}`, () =>
    openWindow('press'),
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
   * The command sheet, served on a player's very first Blitz board and by the settings line after
   * that. The flag is read once at mount: marking it seen inside the season must not make the
   * sheet vanish under a re-render, only stop the *next* arrival from serving it.
   */
  /** **Le canal général se tient au plateau, fenêtre ouverte ou non** : le badge du rail compte
   *  et le tic-tac sonne quand on regarde ailleurs (`telegraph.ts`). */
  const telegraph = useTelegraph(seat);

  /** **En Mondiale, les premiers pas tiennent l'entrée** (ADR 0027 §2) : la feuille ne s'ouvre
   *  plus d'elle-même, elle se relit depuis les Réglages. La Blitz garde la sienne. */
  const [briefing, setBriefing] = useState(() => blitz && !briefingSeen());
  const firstSteps = useFirstSteps(view, seat);
  const boardOpen = windows.includes('personalBoard');
  const researchOpen = windows.includes('research');
  /** The windows drawn as windows: the personal board is the band, its flag only unfolds it. */
  const surfaces = windows.filter(
    (name): name is Exclude<BoardWindow, 'personalBoard'> => name !== 'personalBoard',
  );
  const stepCue = firstSteps?.cue ?? null;
  const stepText = stepCue === null ? null : fr.firstSteps.cue[stepCue.say];
  /** Repliés ou passés, les premiers pas se reprennent depuis l'aide ; finis, il n'y a rien à reprendre. */
  const resumeSteps =
    firstSteps === null || firstSteps.lit === null || firstSteps.shown === 'open'
      ? null
      : () => firstSteps.show('open');
  const cuedLabel = stepCue?.kind === 'map' ? markerOfStation(view, stepCue.station) : null;
  /** Le même objet tant que la bulle ne change pas : la carte ne se redessine pas pour un égal. */
  const mapCue = useMemo(
    () => (cuedLabel === null || stepText === null ? null : { labelId: cuedLabel, text: stepText }),
    [cuedLabel, stepText],
  );

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
   * va donc à `me.openingPoint` — la capitale de 1940, seul point qu'on connaisse de lui tant
   * qu'il n'a rien bâti (décision 1b du 13/09) —, servi par le serveur parce que la table vit
   * avec l'index des régions, côté serveur. **Une Blitz cadre son QG**, que le serveur sert au
   * même champ et que la carte de départ pose au lancement, un quart du théâtre autour
   * (`openingFrameOf`) : la distance nulle laisse ce cadre décider.
   *
   * Une seule fois, et jamais après la pose : un recadrage qui reviendrait à chaque vue reprendrait
   * la caméra des mains du joueur.
   */
  const framedOnOpening = useRef(false);
  useEffect(() => {
    if (framedOnOpening.current) return;
    const places = openingFrameOf({
      theatre: blitzTheatre,
      hqLevel: view.me.hqLevel,
      openingPoint: view.me.openingPoint,
      pieces: view.me.buildings.map((building) => building.point),
    });
    if (places === null) return;
    framedOnOpening.current = true;
    setFocus({
      ids: [],
      places,
      distance: blitzTheatre === null ? NATION_VIEW_DISTANCE : 0,
      nonce: Date.now(),
    });
  }, [blitzTheatre, view.me.hqLevel, view.me.openingPoint, view.me.buildings]);

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
    (combat: CombatReport) => stationAtCombat(view.me, combat, marching, contactKm(blitzTheatre)),
    [view.me, marching, blitzTheatre],
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
   * **Rejouer une dépêche** : le serveur d'abord — un refus reste dans la dépêche, rien d'autre
   * ne bouge —, puis ce qui couvrirait la scène se ferme (le journal, lu comme à sa fermeture ;
   * la feuille d'arrivée ; la pièce en main) et la carte joue.
   */
  const convex = useConvex();
  const markJournalRead = useMutation(api.journal.markRead);
  const launchReplay = useCallback(
    async (dispatch: JournalDispatch): Promise<string | null> => {
      if (dispatch.combat === null) return null;
      try {
        const served = await convex.query(api.replay.replayOf, {
          ...seat,
          combatId: dispatch.combat.id,
        });
        if ('refusal' in served) return fr.errors[served.refusal]();
        if (windows.includes('journal')) {
          void markJournalRead(seat).catch(() => undefined);
          setJournalLead(null);
          closeWindow('journal');
        }
        setOpenedReport(null);
        dropHand();
        setReplay({ view: served, said: dispatch.text, step: null, playing: true, stepping: null });
        return null;
      } catch (error) {
        return errorMessage(error) ?? fr.unexpectedError;
      }
    },
    [convex, seat, windows, markJournalRead, closeWindow, dropHand],
  );
  const replayStep = useCallback(
    (step: ReplayStep, ended: boolean) =>
      setReplay(
        (current) => current && { ...current, step, playing: ended ? false : current.playing },
      ),
    [],
  );
  const { preview, dropNotes, aimRoute } = useOrderPreview(seat, column, resting);
  previewNow.current =
    resting === null || preview === undefined ? undefined : { aim: resting.aim, preview };

  /** Le mât visé par la confirmation, relu dans la vue : effacé, la carte se ferme d'elle-même
   *  plutôt que d'annoncer un niveau qui n'existe plus. */
  const razed = view.me.buildings.find((building) => building.id === demolition?.buildingId);
  const dismantled = view.me.outposts.find((outpost) => outpost.id === dismantling?.outpostId);

  /** La place que la feuille à l'aperçu peut prendre au pied du plateau : la rose s'ouvre
   *  au-dessus. L'aperçu épouse son contenu jusqu'à mi-hauteur, et la fiche d'une troupe armée,
   *  avec ses cibles, y monte (refonte mobile, 1b) : mesurée au tiers, elle laissait la troupe
   *  sous la feuille. */
  const [selectionSheet, setSelectionSheet] = useState<number | null>(null);
  /** Les feuilles montées au téléphone : elles seules couvrent la carte (#189). */
  const [sheets, setSheets] = useState(0);
  const countSheet = useCallback((delta: 1 | -1) => setSheets((count) => count + delta), []);
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
        const started = facility.queue.filter((batch) => batch.started);
        if (started.length === 0) return [];
        const minutesLeft = Math.min(...started.map((batch) => batch.minutesLeft));
        return [
          {
            buildingId: facility.id,
            key: facility.key,
            regionId: facility.regionId,
            regionName: facility.regionName,
            endsAt: workshop!.loadedAt + minutesLeft * 60_000,
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
    (building: { key: string; point: LonLat | null }, distance?: number) => {
      const at = distance === undefined ? {} : { distance };
      if (!toggles.buildings && building.point !== null)
        setFocus({ ids: [], places: [building.point], ...at, nonce: Date.now() });
      else setFocus({ ids: [buildingLabelId(building)], ...at, nonce: Date.now() });
    },
    [toggles.buildings],
  );

  const locateUnderway = useCallback(
    (line: Underway) => {
      const { place } = line;
      if (place.kind === 'movement') setFocus({ ids: [place.arcId], nonce: Date.now() });
      else if (place.kind === 'outpost')
        setFocus({ ids: [`outpost-${place.outpostId}`], nonce: Date.now() });
      else focusBuilding(place);
    },
    [focusBuilding],
  );

  /** **Le chemin du retour** : le quartier général, ou la capitale de 1940 tant qu'il n'est pas
   *  posé — le même repli que le cadrage d'ouverture. Demandé, il rapproche : on rentre chez soi
   *  pour y lire ses pièces, pas pour revoir le monde autour. */
  const recenterOnHome = useCallback(() => {
    const hq = view.me.buildings.find((building) => building.key === 'hq');
    if (hq !== undefined) focusBuilding(hq, DISPATCH_VIEW_DISTANCE);
    else if (view.me.capitalPoint !== null)
      setFocus({
        ids: [],
        places: [view.me.capitalPoint],
        distance: DISPATCH_VIEW_DISTANCE,
        nonce: Date.now(),
      });
  }, [view.me.buildings, view.me.capitalPoint, focusBuilding]);

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
        const due = view.me.foundation.find((candidate) => debtKey(candidate) === debt);
        hold(due === undefined ? null : { key: due.key, debt: due, title: fr.buildings[due.key] });
      }}
      onGoToMap={(point) => setFocus({ ids: [], places: [point], nonce: Date.now() })}
      onOpenSurface={openWindow}
      onOpenSite={openBuilding}
      onOpenOutpost={openOutpost}
      shut={boardOpen}
      firstSteps={
        firstSteps === null || shownStepOf(view) === null ? null : (
          <FirstStepsList
            steps={firstSteps}
            onLead={() => {
              if (stepCue?.kind === 'map') locateStation(stepCue.station);
              else openWindow('personalBoard');
            }}
          />
        )
      }
    />
  );

  return (
    <Shell
      view={view}
      telegraphUnread={telegraph.unread}
      todo={narrow ? nextActions('sheet') : replay === null && nextActions('card')}
      onShowBriefing={showBriefing}
      onResumeSteps={resumeSteps}
    >
      <SelectionSheetReport.Provider value={setSelectionSheet}>
        <SheetCount.Provider value={countSheet}>
          <ReplayLaunch.Provider value={launchReplay}>
            <div ref={board} className="relative min-w-0 flex-1">
              {blitzTheatre !== null && view.me.hqLevel === 0 && !view.me.defeated && (
                <div
                  role="status"
                  className="eyebrow-dark pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center"
                >
                  {fr.lobby.preparingMap}
                </div>
              )}
              {tokens.chip}
              <WorldMap
                blitz={blitzTheatre === null ? null : { theatre: blitzTheatre }}
                world={world}
                arcs={view.arcs}
                troops={view.me.troops}
                journal={view.journal}
                labels={labels}
                standing={standing}
                camps={camps}
                maquettes={maquettes}
                inkByCountry={inkByCountry}
                held={held}
                outposts={reachedOutposts}
                cut={cut}
                built={built}
                selectedCountry={country ?? null}
                playerNation={view.me.nation}
                indicators={toggles}
                accentedMovement={hoveredMovement}
                quietRouteScale={blitz}
                underRouteScale={
                  orderError !== null && !narrow && !windows.includes('journal') ? (
                    <div className="hud paper-grain float border border-l-[3px] border-[var(--critical)] px-3 py-2 text-[11px] text-[var(--ink)]">
                      {orderError}
                    </div>
                  ) : undefined
                }
                onSelect={aimingOnPhone ? keepSelection : readGround}
                onOpenBuilding={openBuilding}
                onOpenStack={openStack}
                holding={holding}
                departures={departures}
                onPieceClick={view.me.defeated ? undefined : pieceClick}
                onPieceCarry={view.me.defeated ? undefined : carryPiece}
                onPieceDrop={dropPiece}
                dropHintOf={dropHintOf}
                onRestAim={restAt}
                onRoseDismiss={dropHand}
                onHeldCompass={setHeldCompass}
                onOpenLoot={openLoot}
                onOpenCamp={openCamp}
                onOpenObjective={openObjective}
                onOpenStrategic={openStrategic}
                selectedLabel={
                  highlight?.labelId ??
                  (selectedSite === null ? null : buildingLabelId(selectedSite))
                }
                selectedPlate={highlightPlate}
                selectedLootLabel={selectedLoot === null ? null : `loot-${selectedLoot.id}`}
                reach={handReach ?? movementReach}
                onCountryHover={setHoveredCountry}
                onRegionHover={setHoveredRegion}
                onRegionsLoaded={keepRegionAt}
                onArcHover={setHoveredArc}
                onLabelHover={setHoveredLabel}
                poster={poster}
                compassOf={compassOfTarget}
                onCompassAction={actOnCompass}
                onDropRefused={dropHand}
                dropNotes={dropNotes}
                aimRoute={aimRoute}
                availablePiles={availablePiles}
                onCarryEnd={carryEnded}
                onDisembark={view.me.defeated ? undefined : disembarkFromTag}
                carriersShown={carryingTokens}
                onTour={view.me.defeated ? undefined : onTour}
                tourLoops={tourLoops}
                cue={mapCue}
                selectedPiles={selectedPiles}
                onLasso={blitz ? undefined : lasso}
                onSelectHold={blitz || view.me.defeated ? undefined : startPicking}
                selectionBar={selectionBar}
                onTakeDepot={view.me.defeated ? undefined : takeDepot}
                building={buildingSite !== null}
                placing={placingCard}
                onPlacePoint={placeAt}
                onPlacingDismiss={dismissPlacing}
                onPlacingAim={setPlacingAim}
                aiming={column !== null}
                focus={focus}
                searchArea={searchArea}
                fingerRose={fingerRose}
                covered={narrow && sheets > 0}
                reveal={reveal}
                replay={replay}
                onReplayStep={replayStep}
                replayBelow={narrow ? REPLAY_BELOW_NARROW : 0}
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
              {selectedPoint !== null && selectedPointView !== null && (
                <StrategicPointBadge
                  key={selectedPoint.id}
                  point={selectedPointView}
                  mine={selectedPointView.mine}
                  seat={seat}
                  nations={view.opponents.map((opponent) => opponent.nation)}
                  at={selectedPoint}
                  onClose={() => setSelectedPoint(null)}
                />
              )}
              {buildingSite && (
                /* Keyed on where it was aimed: a panel opened at a second point is a second panel,
             and it must not inherit the push the player gave the first (`Draggable`). */
                <ConstructionPanel
                  key={`${buildingSite.regionId}-${buildingSite.x}-${buildingSite.y}`}
                  view={view}
                  regionId={buildingSite.regionId}
                  at={buildingSite}
                  onClose={() => setBuildingSite(null)}
                  onPlace={(option) =>
                    hold({
                      key: option.key,
                      debt: null,
                      title: regionName(view, buildingSite.regionId),
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
              {hand.kind === 'held' && hand !== dragged && (
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
                  onDisembark={(troopIds) =>
                    disembark({
                      ...seat,
                      troopIds: troopIds.map((troopId) => troopId as Id<'troops'>),
                    }).then(
                      () => compose(hand.troopIds.filter((troopId) => !troopIds.includes(troopId))),
                      (problem: unknown) => handleError(problem, setOrderError),
                    )
                  }
                  founding={
                    heldCompass === null
                      ? null
                      : {
                          action:
                            heldCompass.actions.find(
                              (action): action is Extract<CompassAction, { key: 'found' }> =>
                                action.key === 'found',
                            ) ?? null,
                          refusal: heldCompass.refusal,
                          onFound: () => {
                            const found = heldCompass.actions.find(
                              (action) => action.key === 'found',
                            );
                            if (found !== undefined) actOnCompass(found, boardPoint());
                          },
                        }
                  }
                  onOpenGunnery={() => openWindow('gunnery')}
                  onDrop={dropHand}
                />
              )}
              <CombatToasts
                journal={view.journal}
                quiet={replay !== null || view.me.defeated}
                onShow={showCombat}
              />
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
              {/* Le refus d'un ordre reste affiché jusqu'au geste suivant, la main toujours levée.
            **Plus rien n'y dit la visée** — le cartouche la porte (décision du 30/08). Au bureau il
            s'empile sous l'échelle du trajet, au coin droit (`underRouteScale`) ; ici, seulement au
            téléphone et quand le journal tient la marge droite (piste 1c) : centré en haut. */}
              {orderError !== null && (narrow || windows.includes('journal')) && (
                <div
                  className={`hud paper-grain absolute z-[var(--z-band)] border border-l-[3px] border-[var(--critical)] px-3 py-2 text-[11px] text-[var(--ink)] float left-1/2 -translate-x-1/2 ${
                    narrow
                      ? 'top-[calc((var(--board-top)_-_var(--safe-top))/var(--hud-scale)_+_40px)]'
                      : 'top-[calc(var(--board-top)/var(--hud-scale)_+_12px)]'
                  }`}
                >
                  {orderError}
                </div>
              )}
              {/* **« En cours » se range pendant la visée** (refonte mobile, 1b) : la carte est alors à
            la cible, et la colonne passerait sous le doigt qui la nomme. */}
              {narrow && column === null && (
                <div className="absolute top-[calc(var(--board-top)_-_var(--safe-top)_+_22px)] left-2 z-10">
                  <UnderwayColumn
                    lines={underway}
                    nation={view.me.nation}
                    fresh={sent === null ? null : `movement-${sent.movementId}`}
                    onLocate={locateUnderway}
                  />
                </div>
              )}
              {narrow && sent !== null && (
                <div
                  className="absolute inset-x-[10px] bottom-[96px] z-[var(--z-indicator)]"
                  style={{ marginBottom: MAT_LIFT }}
                >
                  <SentNotice
                    order={sent.order}
                    destination={sent.destination}
                    arrivesAt={sent.arrivesAt}
                    slots={blitz ? null : view.me.slots}
                    onFollow={() => setFocus({ ids: [sent.movementId], nonce: Date.now() })}
                  />
                </div>
              )}
              {/* **Bas-droite, une rangée** (table plein écran, 13/10) : la fiche du survol posée à
            gauche de la pile des boutons, bas alignés, au même écart et à la même marge que la
            colonne des surfaces en face (`--table-gap`, `--table-margin`). Sous le seuil, les
            boutons passent en bas à gauche, au-dessus de la barre basse. */}
              <div className="pointer-events-none absolute right-(--table-margin) bottom-(--table-margin) z-[var(--z-indicator)] flex items-end gap-(--table-gap) [&>*]:pointer-events-auto">
                {/* En visée sous le seuil, toucher le sol nomme une destination : la feuille du sol
              prendrait la place de la visée et la désarmerait. */}
                {!aimingOnPhone && (
                  <div style={{ marginBottom: MAT_LIFT }}>
                    <GroundPanel
                      selected={country ?? null}
                      hoveredCountry={quietHover ? null : hoveredCountry}
                      hoveredRegion={quietHover ? null : hoveredRegion}
                      holding={
                        hoveredRegion === null
                          ? null
                          : (knownRegionById.get(hoveredRegion.id) ?? null)
                      }
                      suspendedUntil={
                        hoveredRegion === null
                          ? null
                          : (suspendedUntilByRegion.get(hoveredRegion.id) ?? null)
                      }
                      view={view}
                      onDeselect={() => select(null)}
                    />
                  </div>
                )}
                {!narrow && (
                  <div className="pointer-events-none flex flex-col items-end gap-(--table-gap) [&>*]:pointer-events-auto">
                    {corner === 'controls' && (
                      <ControlsCard
                        onClose={() => setCorner(null)}
                        onResumeSteps={
                          resumeSteps === null
                            ? null
                            : () => {
                                setCorner(null);
                                resumeSteps();
                              }
                        }
                      />
                    )}
                    {corner === 'layers' && (
                      <CornerCard title={fr.foot.layersTitle} onClose={() => setCorner(null)}>
                        <LayersGrid />
                      </CornerCard>
                    )}
                    {replay === null && (
                      <MapButtons
                        narrow={false}
                        layers={view.mode !== 'blitz'}
                        onRecenter={recenterOnHome}
                        onCorner={setCorner}
                      />
                    )}
                  </div>
                )}
              </div>
              {/* Sous le seuil, les gestes vivent dans l'aide-mémoire du dossier de la nation : le
            coin ne porte que ce qu'on y touche souvent (refonte mobile, 1a), et cède la place au
            cartouche « transmis » le temps qu'il se lit. */}
              {narrow && sent === null && replay === null && (
                <div
                  className="absolute bottom-(--table-margin) left-(--table-margin) z-[var(--z-indicator)]"
                  style={{ marginBottom: MAT_LIFT }}
                >
                  <MapButtons
                    narrow
                    layers={view.mode !== 'blitz'}
                    onRecenter={recenterOnHome}
                    onCorner={setCorner}
                  />
                </div>
              )}
              {narrow && corner === 'layers' && <LayersSheet onClose={() => setCorner(null)} />}
              {/* **Pendant le rejeu, la carte ne se commande pas** : un voile prend tous les gestes —
            ni lever, ni rose, ni caméra, que le rejeu conduit et ramène. */}
              {replay !== null && (
                <div className="absolute inset-0 z-[var(--z-band)]">
                  <ReplayDeck
                    view={replay.view}
                    said={replay.said}
                    step={replay.step}
                    playing={replay.playing}
                    onToggle={() =>
                      setReplay((current) => current && { ...current, playing: !current.playing })
                    }
                    onStep={(direction) =>
                      setReplay(
                        (current) =>
                          current && { ...current, stepping: { direction, nonce: Date.now() } },
                      )
                    }
                    onLeave={() => setReplay(null)}
                  />
                </div>
              )}
            </div>
            {/* **Le sous-main** (#122) : en Mondiale, la bande du plateau personnel est toujours sur
          la table, repliée tant que sa languette ne la déplie pas ; le rejeu la retire, et la barre des
          réserves et de la clé la remplace, comme le temps que le plateau se charge. */}
            {!blitz && replay !== null && <FootBar view={view} />}
            {!blitz && replay === null && (
              <Suspense fallback={<FootBar view={view} />}>
                <PersonalBoard
                  view={view}
                  seat={seat}
                  open={boardOpen}
                  research={researchOpen}
                  onResearch={(open) => (open ? openWindow('research') : closeWindow('research'))}
                  front={surfaces.length === 0 || windows.at(-1) === 'personalBoard'}
                  onOpen={(open) =>
                    open ? openWindow('personalBoard') : closeWindow('personalBoard')
                  }
                  focused={boardOpen ? (focused ?? null) : null}
                  site={selectedSite}
                  onDeselectSite={deselectSite}
                  onOpenSiteSheet={() => openWindow('site')}
                  onHoldTile={holdTile}
                  placing={placing?.key ?? null}
                  onPlaceTile={placeTile}
                  onTakeTokens={(resource, event) => tokens.start('board', resource, event)}
                  cue={
                    stepCue?.kind === 'rack' && stepText !== null
                      ? { rack: stepCue.rack, text: stepText }
                      : null
                  }
                />
              </Suspense>
            )}
            {/* **Une frontière par fenêtre** (#161) : la fenêtre qu'on ouvre pour la première fois
              se charge sans cacher celle qu'elle remplace, qui peut alors se replier. */}
            <BoardWindows
              surfaces={surfaces}
              view={view}
              seat={seat}
              telegraph={telegraph}
              theatre={blitzTheatre}
              ending={ending.facts}
              blitz={blitz}
              focused={focused}
              journalLead={journalLead}
              rumors={lootRumors}
              selectedRumorId={selectedRumorId}
              onSelectRumor={selectRumor}
              garrisonAt={garrisonAtCombat}
              onShowCombat={showCombat}
              onLocate={locate}
              onOpenGarrison={(station) => openGarrison(station, [], boardPoint())}
              onOpenWindow={openWindow}
              onPrepare={prepareColumn}
              onLocateStation={locateStation}
              onShowBriefing={showBriefing}
              onBringForward={bringForward}
              onClose={(name) => {
                /** La manchette d'une notification ne survit pas au journal qui la portait. */
                if (name === 'journal') setJournalLead(null);
                closeWindow(name);
              }}
            />
            {briefing && (
              <BriefingSheet
                theatre={blitzTheatre}
                blitz={blitz}
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
          </ReplayLaunch.Provider>
        </SheetCount.Provider>
      </SelectionSheetReport.Provider>
    </Shell>
  );
}

/**
 * **D'où l'on regarde le lieu d'une dépêche**, et son QG quand on y rentre : assez près pour lire
 * les régions et les mâts autour — la place d'une passe est un lieu, pas un continent.
 */
const DISPATCH_VIEW_DISTANCE = 20;

/** **À l'ouverture d'une Mondiale, la carte se cadre sur la nation** : assez près pour qu'elle
 *  tienne l'écran, sans fond de table. @a-mesurer */
const NATION_VIEW_DISTANCE = 60;

/** Au téléphone, le bandeau du rejeu et son compte rendu couvrent le bas de la carte : la scène
 *  se cadre dans ce qui reste au-dessus. */
const REPLAY_BELOW_NARROW = 0.45;

/** Clear of the closed hand the cursor draws, thirty-two pixels wide. */

/** Le temps de lire « transmis » et de voir la ligne neuve sortir de « En cours ». */
const SENT_NOTICE_MS = 6000;

/** En visée sous le seuil, toucher nomme une destination : la sélection du pays n'en est pas
 *  une, et la feuille du sol reviendrait sous le pouce une fois l'ordre parti. */
const keepSelection = (): void => {};

function Loading() {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--desk)]">
      <span className="eyebrow-dark">{fr.board.loading}</span>
    </div>
  );
}

/** La région désignée, nommée — la carte de pose dit d'abord *où*, et le joueur vient de fermer
 *  le panneau qui portait ce nom en titre. */
const regionName = (view: PlayerView, regionId: string): string =>
  view.me.regions.find((region) => region.id === regionId)?.name ?? regionId;
