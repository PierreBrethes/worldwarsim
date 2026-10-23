import {
  ACESFilmicToneMapping,
  Color,
  Fog,
  MOUSE,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  Ray,
  Raycaster,
  Scene,
  TOUCH,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { isTyping } from '@/map/typing';
import {
  CLASSIC_MAPPING,
  buttonAt,
  cleanPressAt,
  releaseOf,
  type CleanPress,
  dragRoleAt,
  type MouseButton,
  type MouseMapping,
  type MouseRole,
} from '@/domain/mouse-mapping';
import type { Atlas, Detail } from '@/domain/atlas';
import { destinationPoint, type LonLat } from '@/domain/geo';
import type { RegionType } from '@/domain/ids';
import type { HoveredRegion, RegionIdentity } from '@/domain/world';
import {
  carriesBuilding,
  decodeCoast,
  groundOf,
  isLandingShore,
  nearestCoast,
  onRegionCoast,
  COAST_REACH_KM,
  type Coast,
} from '@/domain/coast';
import {
  groundAt,
  isOpenWaterCell,
  isWalkableCell,
  type Ground,
  type Medium,
  type RouteGrid,
} from '@/domain/routing';
import { PLACING_SNAP_KM } from '@/domain/construction';
import type { ArcView, TroopView } from '@/domain/player-view';
import { flowPaceOf, FLOW_TOUCH_MS, FrameDemand, HEARTBEAT_MS } from './frame-demand';
import { setNearFloor } from './figurines/figurine';
import { Ambience } from './ambience';
import { CURRENT_RIBBONS, RibbonLayer, WIND_RIBBONS } from './ribbons';
import type { ContourWeight } from '@/domain/contours';
import {
  boardInstant,
  DEFAULT_DAY_CYCLE,
  fullDayOver,
  nightOfAltitude,
  subsolarPoint,
  sunLightAt,
  type DayCycle,
} from '@/domain/daylight';
import { parseFx, type MapMotion } from '@/domain/map-motion';
import { pieceScale } from './piece-scale';
import type { PieceScale } from '@/domain/piece-scale';
import { ArcLayer, ARC_HOVER_THRESHOLD } from './arcs';
import { cameraYaw } from './billboard';
import { boardHoldOf, steepestTiltAt } from './camera-tilt';
import { castShadows, Lamp, LAMP_EXPOSURE, SHADOW_MAP } from './lamp';
import { NightSky } from './night';
import { Halos, warmPieces } from './halo';
import { InkLayer } from './ink';
import { ParachuteLayer } from './parachute';
import { TourInk, type TourLoop } from './tour-ink';
import type { InkBurst, StampWords } from '@/domain/ink-bursts';
import { circleAround, ReachRing, ReachRings } from './reach';
import { AimRibbon } from './aim';
import { playTableSound, warmTableSoundOnFirstPress } from '../table-sound';
import type { RingState } from './ink-ring';
import type { Reach } from '@/domain/labels';
import { LabelLayer, type EdgeInsets, type LabelProjection, type NamedAnchor } from './labels';
import { PALETTE } from './palette';
import {
  buildCountries,
  coastWidthPx,
  COUNTRY_BORDER_MAX,
  COUNTRY_BORDER_REST,
  COUNTRY_DASH_PX,
  COUNTRY_GAP_PX,
  levelAt,
  levelOf,
  sheetData,
  showLevel,
  type CountryMesh,
  type CountrySheet,
  type SheetLevel,
} from './countries';
import { buildBoard } from './board';
import { TerrainDrawings } from './terrain-drawings';
import { BASIN_MIN_RADIUS_PX, DepositBasins, SWEEP_GLOW_MS } from './deposit-basins';
import { BASIN_KM } from '@/domain/deposit-basins';
import { SweepWave } from './deposit-sweep';
import type { NearSheet } from './near-sheet';
import { fromGeometryData } from './atlas-geometry';
import {
  RegionLayer,
  REGIONS_FULL_DISTANCE,
  REGIONS_GONE_DISTANCE,
  TRAME_SCALE,
  type HeldClaim,
} from './regions';
import { depositAim, PlacingGhost, threadPath, type ScreenPoint } from './placing';
import type { DepositCall } from '@/domain/construction';
import type { DepositKey } from '@/domain/ids';
import { COUNTRY_THICKNESS, PROJECTION, SEA_LEVEL, WorldFrame, framingDistanceOf } from './frame';
import { SearchAreaLayer, type SearchArea } from './search-area';
import { SeaLayer, type Shore } from './sea';
import { MaquetteLayer, type StandingMaquette } from './maquettes';
import {
  StandingLayer,
  type DropVerdict,
  type PieceHold,
  type PiecePick,
  type StandingPile,
} from './standing';
import { PointerRest } from './pointer-rest';
import { nearer, screenRect, type PieceHit } from './piece-pick';
import type { Rect } from '@/domain/poster-placement';
import { CampLayer, type SurveyedCamp } from './annotations';
import { PIN_APPROACH_DISTANCE, PinLayer, type PinHit } from './pins';
import type { Pin } from '@/domain/pins';
import { nationInk } from '@/domain/nations';
import { TheatreFrame } from './theatre';
import { CarryVeil } from './veil';
import type { Theatre } from '@/domain/theatres';
import { batteryAt, ReplayScene, replayReach, type ReplayFire } from './replay';
import {
  REPLAY_MS,
  REPLAY_STEPS,
  replayAt,
  stepBounds,
  steppedFrom,
  type ReplayStep,
} from '@/domain/replay';
import type { ReplayView } from '@/domain/player-view';

export type { SearchArea } from './search-area';
export type { DropVerdict, PieceHold, PiecePick, StandingPile } from './standing';
export type { StandingMaquette } from './maquettes';
export type { SurveyedCamp } from './annotations';

/**
 * What the player has raised, and the ink to draw it in. **Only ever his own**: `PlayerView`
 * carries no opposing building, so the map has nothing to filter — the fog holds on the shape
 * of the served data, not on a display test (ADR 0005).
 */
export type { HeldClaim } from './regions';

/** A shore is read around a pile's point this far out, in board units at full piece size —
 *  about a pile's reach. */
const SHORE_REACH = 0.6;
const SHORE_PROBES = 8;

/** How much of its own colour a country gives off under the pointer, and once selected. */
const HOVERED_LIFT = 0.35;
const SELECTED_LIFT = 0.75;

/** @a-mesurer Délai avant de redemander `/coast.json` après un échec. */
const COAST_RETRY_MS = 3000;
/** Under a finger, the point a held building aims at stands this far above it (#239). @a-mesurer */
const PLACING_FINGER_LIFT_PX = 64;
/** Half the width of a reach's name (`fr.placing.reach`), in CSS pixels. */
const RING_NAME_ROOM_PX = 80;
/** Closer than this the pointer is on its pin, and no thread is drawn between them. */
const TAUT_MIN_PX = 6;

/**
 * What picking reports from the acting click — whichever button the player put `act` on
 * (`MouseMapping`). `country` is null on the open sea; `region` is null there too, and
 * everywhere the region layer has faded out — far from the ground, the game aims at a country,
 * up close at a region.
 */
/**
 * **What the held building leaps onto** (ADR 0029): nothing (it stands under the pointer), the
 * open-sea coast of the region under the pointer (#221), or the nearest of a list of points — the
 * free deposits.
 */
export type PlacingMagnet =
  | { readonly kind: 'free' }
  | { readonly kind: 'coast' }
  /** The deposits a held exploitation calls (#239): all wake, those the pose takes attract. */
  | { readonly kind: 'deposits'; readonly calls: ReadonlyArray<DepositCall> };

/** What the board holds: its plate, its magnet, and the reach of the outposts it may go under. */
export type HeldPlacing = {
  readonly sprite: string | null;
  readonly magnet: PlacingMagnet;
  readonly reaches: ReadonlyArray<{ readonly lonLat: LonLat; readonly reachKm: number }>;
};

/**
 * **The thread of a placement, on screen** (#239), in CSS pixels of the map: the long one from
 * the ghost to the nearest deposit the pose takes (cut at the screen's edge when the deposit is
 * off it), and the taut one from the pointer to the pin the magnet holds — or the finger's.
 */
export type PlacingThread = {
  readonly long: {
    readonly from: ScreenPoint;
    readonly to: ScreenPoint;
    readonly bend: ScreenPoint;
    readonly off: boolean;
    readonly angle: number;
    readonly deposit: DepositKey;
    readonly place: string | null;
    readonly km: number;
  } | null;
  readonly taut: { readonly from: ScreenPoint; readonly to: ScreenPoint } | null;
  readonly refused: boolean;
  /** The top of each outpost's reach on screen, where its name stands, and how far it carries. */
  readonly rings: ReadonlyArray<{ readonly top: ScreenPoint; readonly km: number }>;
};

/** The point the ghost holds, with what the board knows of it: whose region, its coast, land. */
export type PlacingSpot = {
  readonly lonLat: LonLat;
  readonly region: RegionIdentity | null;
  /** `null` until `/coast.json` has landed: no verdict on a coast the board has not read. */
  readonly coastal: boolean | null;
  readonly onLand: boolean;
};

/** A deposit the sweep names (#249), and when its front reaches it, in ms from its start. */
export type SweepTarget = { readonly id: string; readonly lonLat: LonLat; readonly hitMs: number };

/**
 * **Where the sweep's names stand on screen** (#249), in CSS pixels of the map: by the basin, or
 * at the edge of the map towards it (`off`, `angle` the way it lies). Only those the front has
 * reached.
 */
export type SweepTag = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly off: boolean;
  readonly angle: number;
  /** The basin's radius on screen, as the map draws it: the card stands clear below it. */
  readonly radius: number;
};

export type MapActClick = {
  country: string | null;
  region: RegionIdentity | null;
  /** The place itself, land or water — `null` only when the ray leaves the board entirely. */
  point: LonLat | null;
  clientX: number;
  clientY: number;
};

/** A clean press that took one of my pieces, or a troop of the deployed one
 *  (`MapEngine.onPieceClick`). */
export type PieceClick = PiecePick & {
  clientX: number;
  clientY: number;
  /** Released where a long press took one troop of a squad: that troop, not the squad. */
  single?: boolean;
};

/** A clean press on a drawn piece (`MapEngine.onPiecePress`), already read through the mapping. */
export type PiecePress = {
  readonly labelId: string;
  readonly press: CleanPress;
  readonly pointerType: string;
  readonly clientX: number;
  readonly clientY: number;
};

/** Where a held piece's pointer stopped: what `onAct` gets, and the DOM label it stopped on —
 *  the canvas does not see under a label, so the point may be missing there. */
export type PointerStop = MapActClick & { labelId: string | null };

/**
 * **What a drag carries a piece from, or lets it go on** (glisser-déposer, 15/10): one of my
 * pieces the canvas draws, or a label — the canvas does not see under a label.
 */
export type CarryTarget =
  | { readonly kind: 'canvas'; readonly pick: PiecePick }
  | { readonly kind: 'label'; readonly labelId: string };

/** A finger holds this long on a piece before carrying it: a quicker finger pans the board. */
const LONG_PRESS_MS = 300;
/** **Held still this long on a squad, the press takes one troop** (POC « Manipuler les pions »,
 *  16/10): a quick drag takes the whole squad. Exported for the ring that fills meanwhile. */
export const DETACH_MS = 450;
/** The click a browser sends after a release arrives within this, the same turn of its loop. */
const CARRY_CLICK_MS = 250;

/**
 * The trowel, hot spot on its point — top *right* of the drawing, hence `29 3`: at `0 0` the
 * click would land twenty-nine pixels away from the tool. The fallback keyword is not
 * decoration either — without it the whole declaration is invalid and silently dropped.
 */
const TROWEL_CURSOR = 'url(/cursors/curseur-construire.png) 29 3, crosshair';

/** The aim wears a plain crosshair: there is no drawn cursor for it, and inventing one here
 *  would put a drawing decision in the engine. */
const AIM_CURSOR = 'crosshair';

/** One of my pieces under the pointer, nothing in hand, then in hand: the system's own hand —
 *  the copy on the board already says what is carried (ADR 0026 §6). */
const PIECE_CURSOR = 'grab';
const HOLDING_CURSOR = 'grabbing';

/** The one refusal the board shows with a cursor: holding a building over ground that has no
 *  shore to take it. The system's own, because refusal is a browser word before it is ours. */
const REFUSED_CURSOR = 'not-allowed';

/**
 * How long the orbit gets to settle before recomputing the overlap degradation of labels.
 * That computation measures the DOM; doing it while the camera turns would cost a layout
 * per frame.
 */
const CAMERA_REST_MS = 180;

/**
 * The journey toward an entity designated at the screen edge. Long enough to follow the
 * motion with the eyes — that is what teaches where the entity was — short enough not to
 * wait. Zoom does not move: only a cluster overflowing the field widens the view.
 */
const JOURNEY_MS = 500;
const SEARCH_AREA_MARGIN = 1.3;
const SEARCH_AREA_MIN_DISTANCE = 18;
const DEFAULT_MAX_DISTANCE = 300;
/** The share of its overshoot a target past the board's edge takes back each frame (#187).
 *  @a-mesurer */
const BOARD_HOLD_RATE = 0.12;
/** Development and the bench only: `?heure=2026-01-15T23:00Z` holds the sun at that instant, to judge it now. */
function forcedInstant(search: string): number | null {
  const raw =
    import.meta.env.DEV || import.meta.env.VITE_BANC === '1'
      ? new URLSearchParams(search).get('heure')
      : null;
  return raw === null ? null : Date.parse(raw);
}

/**
 * Below this accumulated motion, the gesture is a clean click and designates the aimed
 * entity; beyond, it was a camera orientation and nothing gets selected. Without this
 * split, every half-turn started on a country would end up selecting it on release.
 */
const CLEAN_CLICK_PX = 6;

/** `act` is a clean click, so the orbital controls are told to leave that button alone. */
const CONTROL_BY_ROLE: Readonly<Record<MouseRole, MOUSE | null>> = {
  orient: MOUSE.ROTATE,
  pan: MOUSE.PAN,
  act: null,
};

/** `null` for the side buttons, which the browser keeps for back and forward. */
type MouseButtonOrNull = ReturnType<typeof buttonAt>;

/**
 * What we keep of a press until its release. `panning` is frozen at press time: the mapping
 * never flips mid-drag, otherwise the gesture changes nature under the player's fingers.
 */
type Gesture = {
  readonly pointerId: number;
  /** `PointerEvent.pointerType` and `button`, kept raw: the domain says what they mean. */
  readonly pointerType: string;
  readonly index: number;
  readonly button: MouseButtonOrNull;
  readonly panning: boolean;
  traveledPx: number;
  x: number;
  y: number;
  pastThreshold: boolean;
  /** The piece a drag would carry, pressed on: the press does not orient the board. */
  carry: CarryTarget | null;
  carrying: boolean;
  /** Pressed on a label, which answers its own clean click. */
  readonly fromLabel: boolean;
  /** A finger's long press, waiting. */
  hold: ReturnType<typeof setTimeout> | null;
  /** A mouse held still on a squad: past `DETACH_MS` the drag takes the one troop pressed. */
  detach?: ReturnType<typeof setTimeout> | null;
  single?: boolean;
  /** **The lasso** (#130): Maj + drag on the bare board, the stroke as the hand drew it. */
  lasso?: Array<[number, number]>;
};

/**
 * Imperative engine: the scene is built once then driven by calls. No React dependency —
 * that is what keeps three.js on one side and the interface on the other, with a single
 * boundary.
 */
type Landing = { readonly point: Vector3; readonly country: CountryMesh };

export class MapEngine {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  /**
   * **What renders, as opposed to what is driven.** The controls, the distance and every
   * threshold read `camera`; the eye stands on its axis, backed off to frame the same looked-at
   * plane through the prototype's telephoto (`EYE_FOV`), and the perspective flattens around it.
   */
  private readonly eye = new PerspectiveCamera(EYE_FOV, 1, 0.5, 3000);
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly frame: WorldFrame;
  private readonly lamp: Lamp;
  private readonly night: NightSky;
  private readonly halos: Halos;
  /** The night the pieces were last warmed by. */
  private warmed = 0;
  /** A figurine or a maquette landed since the programs were last compiled ahead (`warmPrograms`). */
  private programsStale = true;
  /** The screen's edge cast on the board (`fullDayInView`). */
  private readonly sight = new Ray();
  private readonly onGround = new Vector3();
  private readonly theatreFrame: TheatreFrame;
  private readonly veil: CarryVeil;
  private readonly forcedInstant = forcedInstant(location.search);
  private dayCycle: DayCycle = DEFAULT_DAY_CYCLE;
  private readonly sea: SeaLayer | null;
  private readonly arcs: ArcLayer;
  private readonly standing: StandingLayer;
  private readonly maquettes: MaquetteLayer;
  private readonly camps: CampLayer;
  private readonly pins: PinLayer;
  /** Where the piece in hand is over the board: its pin follows it far away (#234). */
  private heldGround: Vector3 | null = null;
  private readonly ink: InkLayer;
  private readonly parachutes: ParachuteLayer;
  private readonly reach: ReachRing;
  /** The road the piece in hand would take (POC « Manipuler les pions »). */
  private readonly aimRibbon = new AimRibbon();
  private readonly tourInk: TourInk;
  private aimRoute: Vector3[] | null = null;
  private verdict: DropVerdict = 'none';
  /** What the carried piece is over, and the ring the drop gives it (POC, `ringStyle`). */
  private carryOver: CarryTarget | { readonly kind: 'ground' } | null = null;
  private dropRing: RingState | null = null;
  /** The pile under a free pointer, ringed in ink. */
  private hoveredPile: string | null = null;
  /** My transports that could take the piece in hand, ringed while it is held. */
  private available: ReadonlyArray<string> = [];
  /** The piles taken together (#130), ringed as the one in hand is. */
  private selected: ReadonlyArray<string> = [];
  /** The lasso's pencil stroke, over the board while it is drawn. */
  private lassoPath: SVGPathElement | null = null;
  private aimedPile: string | null = null;
  private lastFrame = performance.now();
  private readonly searchArea: SearchAreaLayer;
  private readonly labels: LabelLayer;
  private readonly regions: RegionLayer;
  private readonly drawings: TerrainDrawings;
  private readonly basins: DepositBasins;
  private readonly sweepWave: SweepWave;
  /** The sweep under way (#249), `null` when none: what it names, from when, and in what motion. */
  private sweeping: {
    readonly targets: ReadonlyArray<SweepTarget>;
    readonly startedAt: number;
    readonly still: boolean;
  } | null = null;
  private sweepSaid = 'null';
  /** The sweep's names moved on screen: the board draws them (`WorldMap`). */
  onSweep?: ((tags: ReadonlyArray<SweepTag> | null) => void) | undefined;
  private readonly countries: CountryMesh[];
  /** Land, ink, coast and wash, drawn at the far level of the atlas until the near one lands
   *  and the eye comes close enough to tell them apart (`levelAt`, ADR 0034); the region lines
   *  follow. */
  private readonly sheet: CountrySheet;
  private readonly farLevel: SheetLevel;
  private nearLevel: SheetLevel | null = null;
  private detail: Detail = 'far';
  /** The sea plane, kept apart from the decor: it takes the pieces' shadows. */
  private readonly surface: Mesh;
  /** The sheet as a ray meets it, sea and land alike: the land lies 0.004 u above the sea, a
   *  hair at any tilt, and one plane answers where 250 country sheets cost milliseconds. */
  private readonly sheetPlane = new Plane(new Vector3(0, 1, 0), -SEA_LEVEL);
  private readonly countryOf = new Map<string, CountryMesh>();
  private readonly ray = new Raycaster();
  private readonly pointer = new Vector2(-2, -2);
  private readonly aim = new Vector2();
  private readonly pointerScreen = { x: 0, y: 0 };
  private hovered: CountryMesh | null = null;
  private selection: string | null = null;
  private animation = 0;
  private gesture: Gesture | null = null;
  /** The orbit a carry switched off, given back on release. */
  private orbitHeld = false;
  /** When the last carry ended: the label's click that follows it at once is not a click. */
  private carriedAt = -Infinity;
  private mapping: MouseMapping = CLASSIC_MAPPING;
  private spaceHeld = false;
  private aiming = false;
  /** The building held over the board, `null` when nothing is held. */
  private placing: HeldPlacing | null = null;
  private readonly placingReach: ReachRings;
  /** Under a finger the aim stands above it (#239): where the finger itself is, for the thread. */
  private placingFinger: ScreenPoint | null = null;
  private threadSaid = 'null';
  /** The thread changed on screen: the board draws it (`WorldMap`). */
  onPlacingThread?: ((thread: PlacingThread | null) => void) | undefined;
  private readonly ghost: PlacingGhost;
  private placingRefused = false;
  /**
   * The routing grid, `grid.json` loaded with the atlas (`loadGame`): the raster the server
   * routes and refuses on (`convex/routes.ts`). Here from the constructor on, so the land never
   * reads as sea while it downloads.
   */
  private readonly routeGrid: RouteGrid;
  private screenWidth = 1;
  private screenHeight = 1;
  private restTimer: ReturnType<typeof setTimeout> | null = null;
  private journey: Journey | null = null;
  private replay: Replay | null = null;
  /** The pawns a replay hid: unlike piles and blocks, nothing shows them again each frame. */
  private readonly replayHidden = new Set<Object3D>();
  private playerNation: string | null = null;
  private readonly restListeners = new Set<() => void>();
  /**
   * Picking costs three passes — countries, arcs, then point-in-polygon over the regions —
   * and its result only changes when the pointer or the camera moves. Arcs advance every
   * frame, but along geometry that was baked once: a still pointer over a still camera hits
   * the same thread. So the sweep is done on demand rather than sixty times a second.
   */
  private hoverDirty = true;
  /** Un écran qu'on touche : la carte y dessine moins de pixels et fait couler ses fils moins vite. */
  private readonly touch = matchMedia('(pointer: coarse)').matches;
  /** Ce qui décide si l'image de ce tour de boucle est due — voir `frame-demand.ts`. */
  private readonly demand = new FrameDemand(performance.now(), this.touch ? FLOW_TOUCH_MS : 0);
  private readonly ambience = new Ambience(parseFx(location.search));

  /**
   * The country under the pointer, by `adm0_a3`. It is a second announcement rather than a
   * field of `onRegionHover`, because the two do not switch on at the same distance: the
   * region layer only exists close in, the country is there at every zoom, and the board's
   * card has to keep answering when there is no region to name yet.
   */
  onCountryHover: (adm0: string | null) => void = () => {};
  onRegionHover: (region: HoveredRegion | null) => void = () => {};
  onArcHover: (id: string | null) => void = () => {};
  onSelect: (name: string | null) => void = () => {};
  /**
   * A clean left click while a building is held: the point the ghost holds. It replaces the
   * selection rather than doubling it: a click that both places an arsenal and re-frames the
   * country would answer two questions where the player asked one.
   */
  onPlacePoint: (spot: PlacingSpot) => void = () => {};
  /** The acting button, pressed while a building is held, puts it back (#162). */
  onPlacingDismiss: () => void = () => {};
  /** The ghost moved onto another point — what the board reads its refusal off, before the click. */
  onPlacingAim: (spot: PlacingSpot | null) => void = () => {};
  onAct: (click: MapActClick) => void = () => {};
  /**
   * The first orientation drag. It is the instant the player discovers that dragging the
   * mouse does not pan the map: it is there, and nowhere else, that we can tell them.
   */
  onOrientationStarted: () => void = () => {};
  /** Called every frame: the interface writes transforms there, never a React render. */
  onLabels: (projections: ReadonlyArray<LabelProjection>) => void = () => {};
  /**
   * The same projections, for the edge indicator layer. Two calls rather than a
   * subscription: they are two distinct DOM layers, each reading only its fields.
   */
  onEdges: (projections: ReadonlyArray<LabelProjection>) => void = () => {};
  private hoveredCountry: string | null = null;
  private hoveredRegion: string | null = null;
  /**
   * **A finger has no hover** (C4 of the mobile survey): it lands, lifts, and no `pointerleave`
   * ever takes back what it lit. While it is the last pointer on the board, the hover is still
   * aimed — the placement ghost and a tap's reading need it — but nothing of it is announced or
   * lit.
   */
  private fingerOnBoard = false;
  /** A finger has no hover: the region is read once, at the tap that selects, and kept until the
   *  next tap or the selection leaves. */
  private regionTapped = false;
  private hoveredArc: string | null = null;
  /** The piece in hand, `null` when nothing is held (ADR 0026 §6). */
  private held: PieceHold | null = null;
  /** The cursor the piece under the mouse asks for: a hand on what lifts, a finger on what opens. */
  private hoveredPiece: string | null = null;
  /** The label of the piece under the mouse (`onPieceHover`). */
  private hoveredLabel: string | null = null;
  private readonly rest = new PointerRest();
  private readonly lastPointer = { clientX: 0, clientY: 0 };
  /** The label under a held piece's pointer, `null` over the bare board. */
  private restLabel: string | null = null;

  /**
   * **A clean press took one of my pieces** — a group by its figurines, the whole pile by a
   * counter. Tested before the countries on the press that reads, the left one or a finger,
   * piece in hand or not: a click on the lifted piece is how it is put back. Nothing else is
   * done with that press. Unset, the press reads the board as it always did.
   */
  onPieceClick?: ((hit: PieceClick) => void) | undefined;
  /**
   * **The piece under the mouse, by its label's id** — a figurine, a maquette, a block, a pawn
   * covers far more of the screen than its label does, and is what the player points at. `null`
   * off every piece. A finger has no hover, a press in course or a building held none either.
   */
  onPieceHover?: ((labelId: string | null) => void) | undefined;
  /** **A cluster opened** (#234) — hovered, or touched — where its sheet hangs; `null` closes it. */
  onClusterOpen?:
    | ((
        cluster: {
          readonly ids: ReadonlyArray<string>;
          readonly clientX: number;
          readonly clientY: number;
        } | null,
      ) => void)
    | undefined;
  /** The cluster whose sheet is open, by its pieces: hovering it again opens nothing new. */
  private openedCluster: string | null = null;
  /** A clean press on a piece the canvas drew: its label answers it as if it had been pressed
   *  itself, and says whether it did — `false` lets the board read the press. */
  onPiecePress?: ((press: PiecePress) => boolean) | undefined;
  /** **A drag takes a piece** (15/10): the host lifts it and says whether it is now in hand. */
  onPieceCarry?:
    ((from: CarryTarget, clientX: number, clientY: number, single: boolean) => boolean) | undefined;
  /** **The long press on a squad**: `start` at the press, `done` once it takes one troop, `end`
   *  when the press is over — the ring under the pointer fills meanwhile. */
  onDetach?:
    ((phase: 'start' | 'done' | 'end', clientX: number, clientY: number) => void) | undefined;
  /** **The right button, pressed while a piece is carried**, takes the gesture back; a clean
   *  press of the acting button puts a held piece back too (#229). */
  onCarryCancel?: (() => void) | undefined;
  /** The drag is over, its drop told first: let go, put back or cancelled. */
  onCarryEnd?: (() => void) | undefined;
  /** The carried piece let go on a piece or a label; on the ground it is `onAct`'s. */
  onPieceDrop?: ((on: CarryTarget, clientX: number, clientY: number) => void) | undefined;
  /** What the carried piece is over, at every move — the sign of what a drop would do: a piece, a
   *  label, the bare ground, or `null` once the carry is over. */
  onCarryOver?:
    | ((
        over: CarryTarget | { readonly kind: 'ground' } | null,
        clientX: number,
        clientY: number,
      ) => void)
    | undefined;
  /** **The lasso** (#130): its stroke at every move, and `done` at release. Unset, Maj + drag
   *  is the plain drag it always was. */
  onLasso?: ((stroke: ReadonlyArray<readonly [number, number]>, done: boolean) => void) | undefined;
  /** **A finger held still on the bare board** (#130): the selection starts, taps then add. */
  onSelectHold?: (() => void) | undefined;
  /** A piece in hand, the mouse still `REST_MS` over the board: once per stop. */
  onRest?: (at: PointerStop) => void;
  /** It moved again after `onRest`, or left the board. */
  onRestless?: () => void;

  constructor(
    private readonly container: HTMLElement,
    atlas: Atlas,
    shore: Shore,
  ) {
    this.routeGrid = shore.grid;
    this.frame = new WorldFrame(PROJECTION);
    this.tourInk = new TourInk(this.frame);

    this.scene.background = new Color(PALETTE.desk);
    this.scene.fog = new Fog(PALETTE.desk, FOG_NEAR * EYE_BACKOFF, FOG_FAR * EYE_BACKOFF);

    this.camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.5, 3000);
    this.camera.position.set(30, 250, 300);

    // The stencil serves the coastal wash, whose ribbons overlap: without it, three opens
    // the context without a stencil buffer since r163 and the material would plead in vain.
    this.renderer = new WebGLRenderer({ antialias: true, stencil: true });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, this.touch ? TOUCH_PIXEL_RATIO : DESK_PIXEL_RATIO),
    );
    TRAME_SCALE.value = this.renderer.getPixelRatio();
    // La lumière du prototype (`carte-refonte`, #195) : couleurs franches sous une lampe forte.
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LAMP_EXPOSURE;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // Redrawn on whole frames only (`FrameDemand`): an ambient step moves no piece.
    this.renderer.shadowMap.autoUpdate = false;
    // Off by default in three: a site under the crane is cut where its work has reached, by a
    // plane on its own materials (`maquettes.ts`).
    this.renderer.localClippingEnabled = true;
    // Each program's first use read back its log, a wait on the driver's compiler (~100 ms at the
    // first close-up on a phone, #199): the checks stay in development, where shaders change.
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    /** **L'aplomb est permis** (retour d'Abdul, 15/09) : les 0,3 rad d'avant — dix-sept degrés —
     *  interdisaient de regarder la carte perpendiculairement, ce qu'un joueur fait pour lire une
     *  frontière ou viser une région. Les planches sont prévues pour l'angle : elles se couchent
     *  sur le plateau en pivotant sur leur pied (`billboard.ts`). Le reste de zéro reste au
     *  plateau et non à la sphère — à polaire nulle, l'azimut d'`OrbitControls` n'a plus de sens
     *  et la carte tourne sur elle-même au moindre tremblement de la main. */
    this.controls.minPolarAngle = 0.05;
    // Le plafond suit la distance, recalé à chaque tour de boucle (`steepestTiltAt`).
    this.controls.minDistance = 4;
    this.controls.maxDistance = DEFAULT_MAX_DISTANCE;
    this.controls.screenSpacePanning = false;
    // **Le doigt ne lit pas le réglage de la souris** (décision mobile-1c) : un doigt déplace,
    // deux pincent et orientent. Le toucher net, lui, est au moteur — il agit, comme le bouton
    // qui agit (`cleanPressAt`).
    this.controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE };
    // The button that acts belongs to the compass rose and drives nothing here. Which one it
    // is is the player's setting; the space alias doubles the pan whatever the mapping, since
    // many trackpads have no third button and that path must stay open.
    this.applyMapping();

    this.lamp = new Lamp(this.scene, this.touch ? TOUCH_SHADOW_MAP : SHADOW_MAP);

    this.sea = this.ambience.enabled('sea') ? new SeaLayer() : null;
    const board = buildBoard(
      PROJECTION,
      this.frame,
      this.renderer.capabilities.getMaxAnisotropy(),
      this.sea,
    );
    if (this.sea) this.ambience.add(this.sea);
    this.sea?.shore(this.frame, shore);
    this.surface = board.surface;
    this.night = new NightSky(this.scene, this.frame, this.sea, board.surface.geometry);
    this.halos = new Halos();
    this.scene.add(this.halos.object);
    this.theatreFrame = new TheatreFrame(this.scene, board.surface.geometry);
    this.veil = new CarryVeil(this.scene, board.surface.geometry);
    this.surface.receiveShadow = true;
    this.scene.add(board.surface);
    for (const object of board.decor) this.scene.add(object);

    this.farLevel = levelOf(sheetData(atlas, 'far', this.frame));
    this.sheet = buildCountries(this.farLevel, this.night.uniforms);
    const { meshes, borders, coast, wash } = this.sheet;
    this.countries = meshes;
    this.scene.add(wash);
    for (const mesh of meshes) {
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    this.scene.add(borders);
    this.scene.add(coast);

    for (const mesh of meshes) this.countryOf.set(mesh.userData.adm0, mesh);

    if (this.ambience.enabled('sea')) {
      this.ambience.add(
        new RibbonLayer(this.scene, this.eye, this.renderer, this.frame, {
          ...CURRENT_RIBBONS,
          // An ambience is no rule: the grid alone, not the atlas's 40 µs at sea (#224).
          afloat: (lonLat) => groundAt(this.routeGrid, lonLat) !== 'land',
        }),
      );
    }
    if (this.ambience.enabled('wind')) {
      this.ambience.add(
        new RibbonLayer(this.scene, this.eye, this.renderer, this.frame, WIND_RIBBONS),
      );
    }
    this.ink = new InkLayer(this.frame, this.ambience.enabled('ink'));
    this.arcs = new ArcLayer(this.frame, this.ink, (medium, which, at, hint) =>
      this.endOf(medium, which, at, hint),
    );
    this.reach = new ReachRing(this.frame);
    this.placingReach = new ReachRings(this.frame);
    this.searchArea = new SearchAreaLayer(this.frame);
    this.ghost = new PlacingGhost(this.frame, this.touch);
    this.standing = new StandingLayer(
      this.frame,
      () => this.landed(),
      (id) => this.maquettes.garrisonAt(id),
      (lonLat) => this.seawardOf(lonLat),
    );
    this.ambience.add(this.standing.smoke);
    this.scene.add(this.arcs.group);
    this.scene.add(this.standing.group);
    this.maquettes = new MaquetteLayer(
      this.frame,
      (regionId) => this.regions.anchorOf(regionId),
      () => this.landed(),
      (at, words) =>
        this.inkBurst({
          kind: 'built',
          at: this.frame.lonLatAt(at.x + this.frame.centerX, at.z + this.frame.centerY),
          words,
        }),
      (x, z) => this.landAt(this.frame.lonLatAt(x + this.frame.centerX, z + this.frame.centerY)),
    );
    this.scene.add(this.maquettes.group);
    this.ambience.add(this.maquettes.smoke);
    this.camps = new CampLayer(this.frame);
    this.scene.add(this.camps.group);
    this.pins = new PinLayer(
      this.frame,
      (regionId) => this.regions.anchorOf(regionId),
      this.touch,
      () => this.invalidate(),
    );
    this.scene.add(this.pins.group);
    this.scene.add(this.ink.group);
    this.parachutes = new ParachuteLayer(this.frame);
    this.scene.add(this.parachutes.group);
    this.scene.add(this.reach.object);
    this.scene.add(this.placingReach.object);
    this.scene.add(this.aimRibbon.group);
    this.scene.add(this.tourInk.group);
    this.standing.elsewhere = (id) => this.camps.positionOf(id);
    this.scene.add(this.searchArea.object);
    this.scene.add(this.ghost.object);

    this.regions = new RegionLayer(this.frame, this.touch, this.night.uniforms, atlas);
    this.ambience.add(this.regions.contours);
    this.labels = new LabelLayer(
      this.frame,
      (regionId) => this.regions.anchorOf(regionId),
      () => (this.regions.isActive ? this.regions.fade : 0),
      (id) =>
        this.standing.isDressed(id) || this.camps.isDressed(id) || this.maquettes.isDressed(id),
      (id) => this.maquettes.drawnAt(id),
    );

    this.drawings = new TerrainDrawings(
      this.frame,
      this.renderer.capabilities.getMaxAnisotropy(),
      this.touch,
      this.night.uniforms,
    );
    this.scene.add(this.drawings.object);
    this.basins = new DepositBasins(this.frame, this.night.uniforms);
    this.scene.add(this.basins.object);
    this.sweepWave = new SweepWave(this.frame, this.night.uniforms);
    this.scene.add(this.sweepWave.mesh);
    this.scene.add(this.regions.lines);
    this.scene.add(this.regions.held);
    this.scene.add(this.regions.contours.group);
    this.scene.add(this.regions.hoverOutline);

    // The thread is aimed at on screen the way it is drawn there: the threshold adds to the
    // ribbon's drawn half-width (`Ribbon.raycast`). Without it, a ribbon at its 2 px floor would
    // only hover to the pixel.
    this.ray.params.Line2 = { threshold: ARC_HOVER_THRESHOLD };

    this.wireInputs();
    this.resize();
    this.loop();
  }

  /** The airfields the threads were last laid against (`runwaysKey`). */
  private runways = '';

  /**
   * **La carte ne rend plus que si on le lui demande** (`frame-demand.ts`). Toute méthode
   * publique qui change ce qu'on voit commence par cet appel — `frame-demand.test.ts` le vérifie
   * sur la source —, et un composant qui pose ses propres nœuds sur la carte (étiquettes,
   * indicateurs de bord) l'appelle dans un effet dont les dépendances sont tout ce qui fait naître
   * ou change un nœud : ses nœuds naissent cachés et c'est la prochaine image qui les place.
   * Chaque appel coûte `SETTLE_MS` d'images.
   */
  invalidate(): void {
    this.demand.stir(performance.now());
  }

  /**
   * Whether the board is in full day all along the screen's edge — so all over the screen, its
   * night being lowest on its edge: only close in, where the screen holds far less than the
   * night's half of the globe. Not when the horizon is in sight.
   */
  private fullDayInView(sun: LonLat): boolean {
    const points: LonLat[] = [];
    for (const [x, y] of SCREEN_EDGE) {
      this.sight.origin.setFromMatrixPosition(this.eye.matrixWorld);
      this.sight.direction.set(x, y, 0.5).unproject(this.eye).sub(this.sight.origin).normalize();
      if (this.sight.intersectPlane(BOARD_PLANE, this.onGround) === null) return false;
      points.push(
        this.frame.lonLatAt(
          this.onGround.x + this.frame.centerX,
          this.onGround.z + this.frame.centerY,
        ),
      );
    }
    return fullDayOver(sun, points);
  }

  /** A figurine or a maquette landed in the scene: drawn at the next frame, compiled ahead at rest. */
  private landed(): void {
    this.invalidate();
    this.programsStale = true;
  }

  /**
   * **Les programmes se compilent au repos, pas au premier rapproché** (#199). De loin la lampe ne
   * porte pas d'ombre et les pièces ne se dessinent pas : le premier zoom compilait d'un coup une
   * quarantaine de programmes — pièces, et tout ce qui reçoit l'ombre —, une demi-seconde figée
   * au banc du téléphone. Au battement qui suit l'arrivée d'une pièce, de loin, chaque couche du
   * plateau se compile à son tour, lampe portante, sans rien dessiner ; restent les programmes de
   * la carte d'ombres.
   */
  private warmPrograms(): void {
    this.programsStale = false;
    const roots = [...this.scene.children];
    const next = (): void => {
      const root = roots.shift();
      // Disposed meanwhile: the scene was cleared, and the context is gone with it.
      if (root === undefined || root.parent !== this.scene) return;
      const light = this.lamp.light;
      const cast = light.castShadow;
      light.castShadow = true;
      // `compile` and not `compileAsync`: the latter polls each material until its program is
      // ready, and throws from a timer when a pile is taken away meanwhile.
      this.renderer.compile(root, this.eye, this.scene);
      light.castShadow = cast;
      setTimeout(next, 0);
    };
    next();
  }

  /** **Couverte par une feuille, la carte ne dessine plus** (#189) : au téléphone, sous le
   *  journal ou une fiche, elle rendait encore 45 images par seconde que personne ne voyait. */
  cover(covered: boolean): void {
    this.invalidate();
    this.demand.cover(covered);
  }

  inkBurst(burst: InkBurst): void {
    this.invalidate();
    /** **Le coup de ma batterie** (B20) : un trait d'encre droit d'elle au tampon, tenu puis
     *  levé comme le cercle d'un point — la même plume. */
    if (burst.from !== undefined) {
      const [from, to] = [burst.from, burst.at];
      const shot = Array.from({ length: 25 }, (_, i) =>
        this.frame.projectLonLat(
          [from[0] + ((to[0] - from[0]) * i) / 24, from[1] + ((to[1] - from[1]) * i) / 24],
          COUNTRY_THICKNESS + 0.04,
        ),
      );
      this.ink.traceReach(shot, performance.now());
    }
    if (burst.kind === 'airdropped') this.parachutes.release(burst.at, performance.now());
    this.ink.burst(burst, performance.now());
  }

  /** The stamps of `kind` lifted from the board, as a replay that is left takes its own. */
  liftStamps(kind: InkBurst['kind']): void {
    this.invalidate();
    this.ink.lift(kind);
  }

  /** A site of mine just cut off: its stamp beside the maquette, where its region anchors it. */
  inkCut(regionId: string, words: StampWords): void {
    this.invalidate();
    const at = this.regions.anchorOf(regionId);
    if (at === null) return;
    this.ink.burst(
      {
        kind: 'cut',
        at: this.frame.lonLatAt(at.x + this.frame.centerX, at.z + this.frame.centerY),
        words,
      },
      performance.now(),
    );
  }

  /** A point of mine now holds this far: its reach is inked once around it. */
  inkReach(at: LonLat, km: number): void {
    this.invalidate();
    const ring = circleAround(this.frame, at, km).positions;
    const vertices = Array.from(
      { length: ring.length / 3 },
      (_, i) => new Vector3(ring[3 * i], ring[3 * i + 1], ring[3 * i + 2]),
    );
    this.ink.traceReach(vertices, performance.now());
  }

  displayArcs(arcs: ReadonlyArray<ArcView>, troops: ReadonlyArray<TroopView>): void {
    this.invalidate();
    this.arcs.troops = troops;
    this.arcs.display(arcs);
    // New pick targets under an unmoved pointer: the hover must be recomputed even though
    // nothing on screen moved.
    this.hoverDirty = true;
  }

  /** My piles standing at a point, dressed in figurines up close (ADR 0026 §5). */
  displayStanding(piles: ReadonlyArray<StandingPile>): void {
    this.invalidate();
    this.standing.display(piles);
  }

  /** My buildings, my surveys of the enemy's and the neutral objectives, in maquettes up close
   *  (ADR 0026 §1). */
  displayMaquettes(maquettes: ReadonlyArray<StandingMaquette>): void {
    // The view is re-served at every step of any column: a frame only when something changed.
    if (!this.maquettes.display(maquettes)) return;
    this.invalidate();
    const runways = this.maquettes.runwaysKey();
    if (runways === this.runways) return;
    this.runways = runways;
    this.arcs.rebuild();
  }

  /**
   * **Lifts a piece, or puts it back with `null`** (ADR 0026 §6). The original washes out where
   * it stands; a copy of the held groups follows the ground under the mouse, and the
   * cursor closes — the cursor alone when the pile is not dressed. Pointer stops are
   * told through `onRest` from the first move on; the clean left press then puts down
   * (`onAct`) rather than reads.
   */
  holdPiece(held: PieceHold | null, sent = false): void {
    this.invalidate();
    this.held = held;
    this.standing.hold(held, sent);
    // Put back mid-drag (Échap, the right button): letting go afterwards orders nothing.
    const gesture = this.gesture;
    if (held === null && gesture?.carrying === true) {
      gesture.carrying = false;
      gesture.carry = null;
      gesture.pastThreshold = true;
      this.tellCarryOver(null, gesture.x, gesture.y);
      this.onCarryEnd?.();
    }
    this.veil.show(held?.forbidden ?? null, performance.now());
    if (this.veil.needsGround) this.veil.ground(this.routeGrid, this.frame);
    // Another piece, or none: the route told for the last stop is not this one's.
    if (this.rest.stop()) this.onRestless?.();
    if (held === null) this.carryOver = null;
    this.refreshRings();
    this.hoverDirty = true;
    this.refreshCursor();
  }

  /** **The ring under the carried piece reads the drop**: an order, a refusal, or nothing. */
  markDrop(verdict: DropVerdict, ring: RingState | null = null): void {
    this.invalidate();
    this.verdict = verdict;
    this.dropRing = ring;
    this.standing.markDrop(verdict);
    this.refreshRings();
  }

  /** **My transports that could take the piece in hand**: their rings pulse while it is held. */
  setAvailable(pileIds: ReadonlyArray<string>): void {
    this.invalidate();
    this.available = pileIds;
    this.refreshRings();
  }

  /** **The piles taken together** (#130): each wears the ring of a piece in hand. */
  setSelected(pileIds: ReadonlyArray<string>): void {
    this.invalidate();
    this.selected = pileIds;
    this.refreshRings();
  }

  private tellCarryOver(
    over: CarryTarget | { readonly kind: 'ground' } | null,
    clientX: number,
    clientY: number,
  ): void {
    this.carryOver = over;
    this.onCarryOver?.(over, clientX, clientY);
  }

  /** **Every pile's ring, from what the hand is doing** (POC, `ringStyle`): hovered, in hand,
   *  aimed at, or a seat that could take it. */
  private refreshRings(): void {
    const rings = new Map<string, RingState>();
    const held = this.held;
    if (held === null) {
      this.camps.mark(null, null);
      if (this.hoveredPile !== null) rings.set(this.hoveredPile, 'hover');
      for (const id of this.selected) rings.set(id, 'selected');
      this.standing.setRings(rings);
      return;
    }
    for (const id of this.available) rings.set(id, 'avail');
    for (const id of this.selected) rings.set(id, 'selected');
    rings.set(held.pileId, 'selected');
    const over = this.carryOver;
    const target =
      over === null || over.kind === 'ground'
        ? null
        : over.kind === 'canvas'
          ? over.pick.pileId
          : this.standing.pileOfLabel(over.labelId);
    const ringed = target !== null && target !== held.pileId && this.dropRing !== null;
    if (ringed) rings.set(target, this.dropRing as RingState);
    // An enemy camp under the hand wears its own ring (POC, `enemy`).
    const camp =
      over !== null && over.kind === 'label' && this.camps.isDressed(over.labelId)
        ? over.labelId
        : null;
    this.camps.mark(camp, camp === null ? null : this.dropRing);
    // The target answers with a click of wood as the hand comes over it (POC, `snap`).
    const aimed = ringed ? target : camp !== null && this.dropRing !== null ? camp : null;
    if (aimed !== null && aimed !== this.aimedPile) playTableSound('snap');
    this.aimedPile = aimed;
    this.standing.setRings(rings, aimed);
  }

  /** **The server's road for the drop under the resting pointer**, `null` while it moves: the
   *  hand draws a straight line from home until then (`AimRibbon`). */
  setAimRoute(points: ReadonlyArray<LonLat> | null): void {
    this.invalidate();
    this.aimRoute = points === null ? null : points.map((point) => this.frame.projectLonLat(point));
  }

  /** **Les boucles de mes tournées**, à l'encre (ADR 0028) : posées une fois, sans flux. */
  showTours(loops: ReadonlyArray<TourLoop>): void {
    this.invalidate();
    this.tourInk.show(loops);
  }

  /** **The drop is refused**: the piece shakes its head before it goes home. */
  refuseDrop(): void {
    this.invalidate();
    playTableSound('bad');
    this.standing.refuseDrop();
  }

  /** **The piece in hand is set down where the pose opened its rose**, and waits there for
   *  the order: it no longer follows the pointer on its way to the rose. */
  setDownPiece(clientX: number, clientY: number): void {
    this.invalidate();
    if (this.held === null || !this.castAt(clientX, clientY)) return;
    const ground = this.sheetPoint() ?? undefined;
    if (ground !== undefined) this.standing.setDown(ground);
  }

  /** The enemy's surveyed camps, annotated in ink up close (F2, ADR 0026 §4 révisé). */
  displayCamps(camps: ReadonlyArray<SurveyedCamp>): void {
    this.invalidate();
    this.camps.display(camps);
  }

  /** **Au loin, chaque pièce est une épingle** (#234) : celles que la vue sert, par étiquette. */
  displayPins(pins: ReadonlyArray<Pin>): void {
    this.invalidate();
    this.pins.display(pins);
  }

  /** **The designated piece far away** — a pile checked, a site opened: a ring at my ink on its pin. */
  selectPin(labelId: string | null): void {
    this.invalidate();
    this.pins.select(labelId, nationInk(this.playerNation));
  }

  setLabelAnchors(anchors: ReadonlyArray<NamedAnchor>): void {
    this.invalidate();
    this.labels.setAnchors(anchors);
    // The label set changed: the overlap degradation must be redone, but not before the
    // loop has laid the new positions — the camera rest serves that too.
    this.postponeRest();
  }

  setEdgeInsets(insets: EdgeInsets): void {
    this.invalidate();
    this.labels.edgeInsets = insets;
  }

  /** The near level of the atlas, after the board like the regions: drawn from the next frame
   *  close enough (`levelAt`). */
  displayNearAtlas({ atlas, sheet }: { atlas: Atlas; sheet: NearSheet }): void {
    this.invalidate();
    this.nearLevel = levelOf(sheet.sheet);
    this.regions.showAtlas(atlas, {
      far: fromGeometryData(sheet.lines.far),
      near: fromGeometryData(sheet.lines.near),
    });
    if (sheet.types !== null) this.drawings.display(sheet.types);
  }

  /**
   * **Les bassins des gisements** (#239) : la bascule des gisements les montre, en Mondiale
   * seule. `public/deposit-basins.json` n'est demandé qu'à la première fois qu'on les montre ;
   * un échec se retente à la prochaine.
   */
  setDepositBasins(shown: boolean): void {
    this.invalidate();
    this.basins.show(shown);
    this.loadBasins();
  }

  private loadBasins(): void {
    if (!this.basins.wanted || this.basinsLoading) return;
    this.basinsLoading = true;
    fetch('/deposit-basins.json')
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((basins) => {
        this.basins.display(basins);
        this.invalidate();
      })
      .catch(() => {})
      .finally(() => (this.basinsLoading = false));
  }

  private basinsLoading = false;

  /**
   * **Where the sweep starts** (#249): the ground at the middle of the map left clear by the
   * rule and the columns — the middle its edge arrows point from. Off the sheet, where the eye
   * looks.
   */
  sweepOrigin(): LonLat {
    const { top, right, bottom, left } = this.labels.edgeInsets;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const middle = this.pointAt(
      rect.left + left + (rect.width - left - right) / 2,
      rect.top + top + (rect.height - top - bottom) / 2,
    );
    const looked = this.controls.target;
    return (
      middle ?? this.frame.lonLatAt(looked.x + this.frame.centerX, looked.z + this.frame.centerY)
    );
  }

  /**
   * **Sonder la carte** (#249) : l'onde part de `from` à l'encre de l'espèce et éveille chaque
   * bassin nommé quand son front l'atteint. Hors des animations actives, ni onde ni battement :
   * les bassins s'allument d'un coup, jusqu'à ce que le plateau efface la sonde (`null`).
   */
  sweepDeposits(
    sweep: {
      readonly from: LonLat;
      readonly species: DepositKey;
      readonly targets: ReadonlyArray<SweepTarget>;
    } | null,
  ): void {
    this.invalidate();
    const now = performance.now();
    const still = this.ambience.motion !== 'full';
    this.sweeping =
      sweep === null
        ? null
        : {
            targets: still
              ? sweep.targets.map((target) => ({ ...target, hitMs: 0 }))
              : sweep.targets,
            startedAt: now,
            still,
          };
    // A new sweep tells its names afresh, even the very ones of the last at the same place.
    this.sweepSaid = '';
    this.basins.sweep(this.sweeping?.targets ?? null, now, still);
    this.loadBasins();
    if (sweep === null || still) this.sweepWave.stop();
    else this.sweepWave.start(sweep.from, sweep.species, now);
  }

  /** The front runs, or a basin it reached still beats: the loop draws each frame. */
  private sweepMoving(now: number): boolean {
    const sweeping = this.sweeping;
    if (sweeping === null || sweeping.still) return false;
    const last = Math.max(0, ...sweeping.targets.map((target) => target.hitMs));
    return this.sweepWave.active || now - sweeping.startedAt <= last + SWEEP_GLOW_MS;
  }

  /** **The sweep's names**, told to the board at a rendered frame when they move on screen. */
  private tellSweep(now: number): void {
    const sweeping = this.sweeping;
    let tags: SweepTag[] | null = null;
    if (sweeping !== null) {
      const { top, right, bottom, left } = this.labels.edgeInsets;
      const width = this.screenWidth - left - right;
      const height = this.screenHeight - top - bottom;
      const centre = { x: width / 2, y: height / 2 };
      tags = sweeping.targets
        .filter((target) => now - sweeping.startedAt >= target.hitMs)
        .map((target) => {
          const at = this.mapPointOf(target.lonLat);
          const edge = threadPath(centre, { x: at.x - left, y: at.y - top }, width, height);
          const angle = Math.atan2(at.y - top - centre.y, at.x - left - centre.x);
          const rim = this.mapPointOf(destinationPoint(target.lonLat, BASIN_KM, 90));
          const radius = Math.max(BASIN_MIN_RADIUS_PX, Math.hypot(rim.x - at.x, rim.y - at.y));
          return edge.off
            ? { id: target.id, x: edge.to.x + left, y: edge.to.y + top, off: true, angle, radius }
            : { id: target.id, x: at.x, y: at.y, off: false, angle: 0, radius };
        });
    }
    const said = JSON.stringify(tags);
    if (said === this.sweepSaid) return;
    this.sweepSaid = said;
    this.onSweep?.(tags);
  }

  /** The regions' terrain and anchor points: the lines, the hover and the terrain wait for them. */
  displayRegions(
    types: ReadonlyMap<string, RegionType>,
    points: ReadonlyMap<string, LonLat>,
  ): void {
    this.invalidate();
    this.regions.display(types, points);
    // The anchors land after the board, so the buildings are asked for before
    // the ground that carries them: a region anchor has no position until now, and without
    // this their labels would never find their footing.
    this.labels.rebuild();
    this.maquettes.rebuild();
    this.pins.rebuild();
    // The regions land half a second after the map: without this, hovering only wakes up on
    // the next pointer move, over a layer that is already drawn.
    this.hoverDirty = true;
  }

  setPlayerNation(nation: string | null): void {
    this.invalidate();
    this.playerNation = nation;
    this.arcs.setPlayerNation(nation);
    this.standing.setNation(nation);
    this.hoverDirty = true;
  }

  accentArc(id: string | null): void {
    this.invalidate();
    this.arcs.accent(id);
  }

  /**
   * **Plays a combat's replay at its point** (surface 4.7, ADR 0026 §7): the camera travels
   * there, my figurines and the enemy's — in its nation's figurines, or blocks on an account from
   * before the fire was seen (F1) — are set down face to face, and the steps of
   * `replayAt` play out — automatically, about ten seconds, unless `setReplayAutoplay(false)`.
   * `onStep` is told each step as it begins, `compte-rendu` included, and once more with `ended`
   * when the replay has played to its end: the account card is the caller's. `below` is the share
   * of the screen the caller covers at the bottom: the scene is framed above it. Whatever stands
   * at the point is hidden meanwhile. A second call replaces the first replay but keeps the
   * camera saved by the first.
   */
  playReplay(
    view: ReplayView,
    onStep: (step: ReplayStep, ended: boolean) => void = () => {},
    below = 0,
  ): void {
    this.invalidate();
    const saved = this.replay?.saved ?? {
      target: this.controls.target.clone(),
      position: this.camera.position.clone(),
    };
    this.replay?.scene.dispose();
    const lonLat = [view.point.lon, view.point.lat] as const;
    const onLand = this.landAt(lonLat);
    const center = this.frame.projectLonLat(lonLat, onLand ? COUNTRY_THICKNESS : SEA_LEVEL);
    const orientation = this.camera.position.clone().sub(this.controls.target).normalize();
    const flat = Math.hypot(orientation.x, orientation.z);
    // Seen from forty degrees above, whatever the orbit was: straight down, a fallen man is a
    // standing one.
    const tilted =
      flat < 1e-3
        ? new Vector3(0, Math.sin(REPLAY_ELEVATION), Math.cos(REPLAY_ELEVATION))
        : new Vector3(
            (orientation.x / flat) * Math.cos(REPLAY_ELEVATION),
            Math.sin(REPLAY_ELEVATION),
            (orientation.z / flat) * Math.cos(REPLAY_ELEVATION),
          );
    const yaw = Math.atan2(tilted.x, tilted.z);
    const fire = this.replayFire(view, center, yaw);
    const reach = replayReach(view, fire);
    // Fitted to the height left above `below`, and to the width on a portrait screen.
    const aspect = this.screenWidth / this.screenHeight;
    const distance = Math.max(
      REPLAY_MIN_DISTANCE,
      reach * 2.2 * Math.max(1 / (1 - below), 1 / Math.min(1, aspect)),
    );
    // The eye aims nearer than the scene, on the ground towards itself, so that the scene rises
    // to the middle of the height left: by `below / 2` of the screen.
    const nearer =
      (below * Math.tan((this.camera.fov * Math.PI) / 360) * distance) / Math.sin(REPLAY_ELEVATION);
    const aim = center
      .clone()
      .add(new Vector3(tilted.x, 0, tilted.z).normalize().multiplyScalar(nearer));
    const scene = new ReplayScene(
      this.playerNation,
      replayAt(view, 0).pieces,
      onLand ? 'land' : 'sea',
      fire,
      view.faced?.nation ?? null,
    );
    scene.object.position.copy(center);
    scene.object.rotation.y = yaw;
    this.scene.add(scene.object);
    this.replay = {
      view,
      scene,
      saved,
      center,
      reach,
      t: 0,
      until: REPLAY_MS,
      clock: performance.now(),
      step: null,
      ended: false,
      onStep,
    };
    this.travel(aim, tilted, distance, stepBounds('voyage').end - stepBounds('voyage').start);
  }

  /** **Un bombardement** (B20, A4) : chez le tireur, sa batterie là où elle a tiré, dans le repère
   *  de la scène ; chez la cible, rien d'où le coup parte. */
  private replayFire(view: ReplayView, center: Vector3, yaw: number): ReplayFire {
    if (view.bombardment === undefined) return null;
    const from = view.bombardment.from;
    if (from === undefined) return view.side === 'defender' ? 'unseen' : null;
    const battery = this.frame
      .projectLonLat([from.lon, from.lat], center.y)
      .sub(center)
      .applyAxisAngle(new Vector3(0, 1, 0), -yaw);
    return { battery: batteryAt([battery.x, battery.z]) };
  }

  /** Off, the step under way plays to its end and the replay holds there; on, it reads on to the end. */
  setReplayAutoplay(on: boolean): void {
    this.invalidate();
    const replay = this.replay;
    if (replay === null) return;
    // Played again from the end, it starts over.
    if (on && replay.t >= REPLAY_MS) {
      replay.t = 0;
      // Told again even when the end is shown at once, as cut motion does.
      replay.ended = false;
    }
    replay.until = on ? REPLAY_MS : this.stepEndAt(replay.t);
    replay.clock = performance.now();
  }

  /** An arrow: the next or the previous step, played from its start. Paused, it holds at its end. */
  stepReplay(direction: 1 | -1): void {
    this.invalidate();
    const replay = this.replay;
    if (replay === null) return;
    const paused = replay.until < REPLAY_MS;
    replay.t = steppedFrom(replay.t, direction);
    replay.until = paused ? this.stepEndAt(replay.t) : REPLAY_MS;
    replay.clock = performance.now();
  }

  /** Leaves the replay: the scene goes, what stood at the point comes back, the camera returns where it was. */
  stopReplay(): void {
    this.invalidate();
    const replay = this.replay;
    if (replay === null) return;
    this.replay = null;
    replay.scene.dispose();
    for (const pawn of this.replayHidden) pawn.visible = true;
    this.replayHidden.clear();
    const { target, position } = replay.saved;
    const orientation = position.clone().sub(target);
    this.travel(target, orientation.clone().normalize(), orientation.length(), JOURNEY_MS * 2);
  }

  /** Camera rest has two audiences — the labels and the edge — hence the subscription. */
  subscribeRest(listener: () => void): () => void {
    this.restListeners.add(listener);
    return () => {
      this.restListeners.delete(listener);
    };
  }

  /**
   * Bring the orbit target onto one or several anchors. A clustered indicator frames its
   * group: the view widens just enough to contain it, and never tightens — a click that
   * zoomed in unasked would lose the thread of the map.
   *
   * `places` are lon/lat rather than anchors, for what has no marker to aim at: a troop left on
   * open ground is a place before it is a datum, and « à faire maintenant » names it that way.
   */
  journeyTo(
    ids: ReadonlyArray<string>,
    places: ReadonlyArray<LonLat> = [],
    lift = 0,
    /** Une distance demandée : la seule façon de rapprocher la caméra, pour un lieu à regarder.
     *  Elle ne fait que rapprocher — déjà plus près, on y reste. */
    distance?: number,
  ): void {
    this.invalidate();
    const points = [
      ...ids
        .map((id) => this.labels.position(id, this.arcs.headPositions))
        .filter((point): point is Vector3 => point !== undefined),
      ...places.map((place) => this.frame.projectLonLat(place)),
    ];
    if (points.length === 0) return;

    const arrival = points
      .reduce((sum, point) => sum.add(point), new Vector3())
      .divideScalar(points.length);
    const radius = Math.max(...points.map((point) => point.distanceTo(arrival)));
    const currentDistance = this.camera.position.distanceTo(this.controls.target);
    const framing = framingDistanceOf(radius, this.camera.fov, this.camera.aspect);
    const arrivalDistance = Math.min(
      this.controls.maxDistance,
      Math.max(
        Math.min(distance ?? currentDistance, currentDistance),
        framing,
        this.controls.minDistance,
      ),
    );
    const orientation = this.camera.position.clone().sub(this.controls.target).normalize();

    this.journey = {
      departure: this.controls.target.clone(),
      /** **Le sujet monte au-dessus de ce qui le couvrirait** : une feuille basse cache le bas de
       *  la carte, et un point cadré au centre tomberait dessous. */
      arrival: arrival.add(this.groundShift(0, -lift, arrivalDistance, orientation)),
      orientation,
      departureDistance: currentDistance,
      arrivalDistance,
      startMs: performance.now(),
    };
  }

  /** Où la caméra se tient de son point visé : un regroupement en tire la distance qui sépare
   *  les siens (`separatingDistance`). */
  cameraDistance(): number {
    return this.camera.position.distanceTo(this.controls.target);
  }

  /** La caméra ne peut plus s'approcher : ce que le zoom ne sépare pas doit se séparer autrement. */
  atZoomFloor(): boolean {
    return this.cameraDistance() <= this.controls.minDistance * ZOOM_FLOOR_SLACK;
  }

  /**
   * **Pousser la carte de quelques pixels, sans voyage** : la rose s'ouvre là où le doigt a
   * touché, et quand elle déborderait de l'écran c'est la carte qui se recale sous elle — un
   * médaillon hors cadre est une action vue mais imprenable. Positif vers la droite et le bas,
   * en pixels du plateau.
   */
  nudge(dx: number, dy: number): void {
    this.invalidate();
    if (dx === 0 && dy === 0) return;
    this.journey = null;
    const distance = this.camera.position.distanceTo(this.controls.target);
    const orientation = this.camera.position.clone().sub(this.controls.target).normalize();
    const shift = this.groundShift(dx, dy, distance, orientation);
    this.controls.target.add(shift);
    this.camera.position.add(shift);
    this.hoverDirty = true;
    this.postponeRest();
  }

  /**
   * Le déplacement au sol qui fait glisser ce qu'on voit de `(dx, dy)` pixels d'écran. Au centre
   * de l'image et à cette distance : la carte est inclinée, et un pixel vertical y couvre plus de
   * sol qu'un pixel horizontal — d'où le sinus de l'élévation, borné pour qu'une caméra rasante
   * ne parte pas à l'horizon.
   */
  private groundShift(dx: number, dy: number, distance: number, orientation: Vector3): Vector3 {
    const perPixel = this.unitsPerPixel(distance);
    const flat = new Vector3(-orientation.x, 0, -orientation.z);
    const along = flat.length();
    const forward = along < 1e-3 ? new Vector3(0, 0, -1) : flat.divideScalar(along);
    const right = new Vector3(-forward.z, 0, forward.x);
    const elevation = Math.max(0.35, orientation.y);
    return right
      .multiplyScalar(-dx * perPixel)
      .add(forward.multiplyScalar((dy * perPixel) / elevation));
  }

  /**
   * Frame the public uncertainty itself. Unlike an entity journey this may tighten the view:
   * the requested subject is the whole circle, not a pin whose wider map context must survive.
   */
  showSearchArea(area: SearchArea | null): void {
    this.invalidate();
    this.searchArea.show(area);
    if (area === null) {
      this.restoreDefaultZoom();
      return;
    }

    const { center, rim } = this.searchArea.framingPoints(area);
    const radius = Math.max(...rim.map((point) => point.distanceTo(center)));
    const verticalHalfFov = (this.camera.fov * Math.PI) / 360;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * this.camera.aspect);
    const framing =
      (radius * SEARCH_AREA_MARGIN) / Math.tan(Math.min(verticalHalfFov, horizontalHalfFov));
    const currentDistance = this.camera.position.distanceTo(this.controls.target);

    const arrivalDistance = Math.max(SEARCH_AREA_MIN_DISTANCE, framing, this.controls.minDistance);
    // A circle cut by the map's seam occupies both canonical rims. The ordinary 300-unit
    // orbit ceiling cannot contain that honest projection, so it is lifted only for this
    // journey and restored once the zone is dismissed or a local zone is selected.
    this.controls.maxDistance = Math.max(DEFAULT_MAX_DISTANCE, currentDistance, arrivalDistance);
    const orientation = this.camera.position.clone().sub(this.controls.target).normalize();
    if (this.ambience.motion !== 'full') {
      this.controls.target.copy(center);
      this.camera.position.copy(center).addScaledVector(orientation, arrivalDistance);
      this.controls.maxDistance = Math.max(DEFAULT_MAX_DISTANCE, arrivalDistance);
      this.hoverDirty = true;
      this.postponeRest();
      return;
    }
    this.journey = {
      departure: this.controls.target.clone(),
      arrival: center,
      orientation,
      departureDistance: currentDistance,
      arrivalDistance,
      maxDistanceAtEnd: Math.max(DEFAULT_MAX_DISTANCE, arrivalDistance),
      startMs: performance.now(),
    };
  }

  select(adm0: string | null): void {
    this.invalidate();
    this.selection = adm0;
    if (adm0 === null && this.fingerOnBoard) this.updateRegionHover(null);
  }

  /**
   * The country under a screen point, as an `adm0_a3`, aimed on demand. The rose also opens
   * from an HTML label, which ate the canvas's `pointermove`: reading the last frame's hover
   * would give the land before entering the label, not the one it designates.
   */
  countryAtPoint(clientX: number, clientY: number): string | null {
    return this.aimAt(clientX, clientY)?.country.userData.adm0 ?? null;
  }

  /**
   * **The place under a screen point, at every scale and over water too.** The ray is given the
   * sea as well as the land, because a point aimed at the open sea is a legal destination and a
   * ray that only knew the continents would answer nothing there (ADR 0019 §1).
   */
  pointAt(clientX: number, clientY: number): LonLat | null {
    const hit = this.castAt(clientX, clientY) ? this.sheetPoint() : null;
    if (hit === null) return null;
    return this.frame.lonLatAt(hit.x + this.frame.centerX, hit.z + this.frame.centerY);
  }

  /**
   * The region under a screen point, or `null` when the layer is not on screen — the fade
   * threshold is the aiming threshold, so the player only ever aims at what he can see.
   */
  regionAtPoint(clientX: number, clientY: number): RegionIdentity | null {
    if (!this.regions.isActive) return null;
    const point = this.aimAt(clientX, clientY)?.point;
    if (point === undefined) return null;
    return this.regions.regionAt(point.x + this.frame.centerX, point.z + this.frame.centerY);
  }

  /**
   * The region under a lon/lat, by the same pick as the hover (`Atlas.regionAt`), so a pile's
   * cartouche and the hover card can never name two regions for one spot. `null` until the
   * layer has landed, and wherever no region lies.
   */
  regionAtLonLat(lonLat: LonLat): RegionIdentity | null {
    const point = this.frame.projectLonLat(lonLat);
    return this.regions.regionAt(point.x + this.frame.centerX, point.z + this.frame.centerY);
  }

  /** **The maquette under a screen point**, by its label's id: what a tile from the personal
   *  board lets go on (#205). Its mast, folded, takes no pointer, and the garrison standing at its
   *  foot does not hide it — a tile only ever acts on a building. */
  maquetteAtPoint(clientX: number, clientY: number): string | null {
    if (!this.castAt(clientX, clientY)) return null;
    return this.maquettes.under(this.ray)?.id ?? null;
  }

  private aimAt(clientX: number, clientY: number): Landing | null {
    return this.castAt(clientX, clientY) ? this.landUnderRay() : null;
  }

  /** Where the ray meets the sheet, sea or land, inside the board's outline. */
  private sheetPoint(): Vector3 | null {
    const point = this.ray.ray.intersectPlane(this.sheetPlane, new Vector3());
    if (point === null || Math.abs(point.z) > this.frame.height / 2) return null;
    const x = point.x + this.frame.centerX;
    const { westX, eastX } = this.frame.edgeAtLatitude(
      this.frame.lonLatAt(x, point.z + this.frame.centerY)[1],
    );
    return x >= westX && x <= eastX ? point : null;
  }

  /** The country under the ray: the one of the region there once the regions have landed, the
   *  far sheets themselves until then. */
  private landUnderRay(): Landing | null {
    if (!this.regions.ready) {
      const hit = this.ray.intersectObjects(this.countries, false)[0];
      return hit ? { point: hit.point, country: hit.object as CountryMesh } : null;
    }
    const point = this.sheetPoint();
    if (point === null) return null;
    const region = this.regions.regionAt(
      point.x + this.frame.centerX,
      point.z + this.frame.centerY,
    );
    const country = region === null ? undefined : this.countryOf.get(region.country);
    return country === undefined ? null : { point, country };
  }

  private castAt(clientX: number, clientY: number): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    this.aim.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.aim, this.syncEye());
    return true;
  }

  /** The camera holds still while a rose is open: one does not aim at a moving target. */
  freezeOrbit(frozen: boolean): void {
    this.invalidate();
    this.controls.enabled = !frozen;
  }

  /**
   * **Qui tient quelles régions** (ADR 0033). Le contour reste au loin quand les frontières
   * s'effacent : on lit qui tient quoi sans lire le découpage — voir `RegionLayer.showHeld`.
   */
  showHeldRegions(claims: ReadonlyArray<HeldClaim>): void {
    this.invalidate();
    this.regions.showHeld(claims);
  }

  /**
   * **The ground one detector covers, while the pointer asks for it and no longer** (fiche 03).
   * `null` puts it away — the ring is an answer to a hover, not a layer of the board.
   */
  showReach(reach: Reach | null): void {
    this.invalidate();
    this.reach.show(reach);
  }

  resize(): void {
    this.invalidate();
    const { clientWidth, clientHeight } = this.container;
    if (!clientWidth || !clientHeight) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.eye.aspect = this.camera.aspect;
    this.eye.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
    this.sheet.coast.material.resolution.set(clientWidth, clientHeight);
    this.screenWidth = clientWidth;
    this.screenHeight = clientHeight;
    this.arcs.resize(clientWidth, clientHeight);
    this.ink.resize(clientWidth, clientHeight);
    this.reach.resize(clientWidth, clientHeight);
    this.placingReach.resize(clientWidth, clientHeight);
    this.pins.resize(clientWidth, clientHeight);
    this.basins.resize(clientWidth, clientHeight);
    this.hoverDirty = true;
  }

  /**
   * The whole board is GPU memory: geometries, materials and the sea texture baked at
   * construction. Dropping the JavaScript references is not enough — WebGL keeps them until
   * `dispose()` is called on each. The layers that own shared resources free them
   * themselves and detach, then the sweep below takes what is left in the scene.
   */
  dispose(): void {
    setNearFloor(0);
    cancelAnimationFrame(this.animation);
    if (this.restTimer !== null) clearTimeout(this.restTimer);
    removeEventListener('pointermove', this.trackGesture);
    removeEventListener('pointerup', this.endGesture);
    removeEventListener('pointercancel', this.endGesture);
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('blur', this.onFocusLost);

    this.reach.dispose();
    this.placingReach.dispose();
    this.aimRibbon.dispose();
    this.tourInk.dispose();
    this.searchArea.dispose();
    this.ghost.dispose();
    this.standing.dispose();
    this.maquettes.dispose();
    this.camps.dispose();
    this.pins.dispose();
    this.replay?.scene.dispose();
    this.arcs.dispose();
    this.ink.dispose();
    this.parachutes.dispose();
    this.regions.dispose();
    this.drawings.dispose();
    this.basins.dispose();
    this.sweepWave.dispose();
    this.sea?.dispose();
    this.veil.dispose();
    this.halos.dispose();
    this.scene.traverse(disposeNode);
    this.scene.clear();

    this.controls.dispose();
    this.renderer.dispose();
    // Without this, the browser keeps the context alive until it garbage-collects the
    // canvas, and a page that rebuilds the map a few times hits the context limit.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.lassoPath?.ownerSVGElement?.remove();
  }

  private wireInputs(): void {
    const canvas = this.renderer.domElement;
    this.controls.addEventListener('change', () => {
      this.invalidate();
      // The camera moved: the sheet would hang where the cluster no longer stands.
      this.closeCluster();
      this.hoverDirty = true;
      this.postponeRest();
      // The ground slid under a still pointer: the stop it was on is not the same place.
      if (this.pointer.x !== -2) this.pointerMoved();
    });
    canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
    canvas.addEventListener('pointerleave', () => {
      this.pointer.set(-2, -2);
      this.hoverDirty = true;
      if (this.rest.stop()) this.onRestless?.();
      if (this.held !== null && this.gesture?.carrying !== true) this.tellCarryOver(null, 0, 0);
    });
    canvas.addEventListener('pointerdown', (event) => {
      this.journey = null;
      this.fingerOnBoard = event.pointerType === 'touch';
      // A second finger makes it a pinch: the press it joins can no longer be a clean one.
      if (this.gesture !== null && this.fingerOnBoard) {
        this.gesture.pastThreshold = true;
        return;
      }
      const button = buttonAt(event.button);
      const role = this.roleOf(event.pointerType, event.button);
      this.gesture = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        index: event.button,
        button,
        // A finger pans only once it has moved: still, it is a clean press that acts.
        panning: !this.fingerOnBoard && (role === 'pan' || (button === 'left' && this.spaceHeld)),
        traveledPx: 0,
        x: event.clientX,
        y: event.clientY,
        pastThreshold: false,
        carry: null,
        carrying: false,
        fromLabel: false,
        hold: null,
      };
      this.armCarry(this.gesture, event, () => this.carryFrom(event.clientX, event.clientY));
      this.armSelection(this.gesture, event);
      this.refreshCursor();
    });
    canvas.addEventListener('wheel', () => {
      this.journey = null;
    });
    // The browser's autoscroll arms on the middle button and plants itself over the map.
    // It is only cut here: pointer events give no purchase on it.
    canvas.addEventListener('mousedown', (event) => {
      if (buttonAt(event.button) === 'middle') event.preventDefault();
    });

    // Cut whatever the right button carries: it may orient, pan or act, and none of the three
    // wants the browser's menu planted over the board.
    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    // The gesture is tracked on the window, not the canvas: a drag released over a card is
    // still a drag, and leaving it running would freeze the cursor on a closed hand.
    addEventListener('pointermove', this.trackGesture);
    addEventListener('pointerup', this.endGesture);
    addEventListener('pointercancel', this.endGesture);
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    // A window switch swallows the release: without this, space would stay held on return.
    addEventListener('blur', this.onFocusLost);
    warmTableSoundOnFirstPress();
  }

  private trackGesture = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (gesture === null || event.pointerId !== gesture.pointerId) return;
    gesture.traveledPx += Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    if (gesture.lasso !== undefined) {
      this.drawLasso(gesture as Gesture & { lasso: Array<[number, number]> });
      return;
    }
    if (gesture.carrying) {
      // Chorded: a second button down during a drag comes as a move, never as a press.
      if ((event.buttons & 2) !== 0) this.onCarryCancel?.();
      else this.carryMove(event.clientX, event.clientY);
      return;
    }
    if (gesture.pastThreshold || gesture.traveledPx < CLEAN_CLICK_PX) return;
    gesture.pastThreshold = true;
    this.endDetach(gesture);
    // A finger that moves before its long press pans the board, as it always did.
    if (gesture.hold !== null) {
      clearTimeout(gesture.hold);
      gesture.hold = null;
      gesture.carry = null;
    } else if (gesture.carry !== null) this.beginCarry(gesture);
    if (gesture.carrying || gesture.fromLabel) return;
    if (this.roleOf(gesture.pointerType, gesture.index) === 'orient' && !gesture.panning)
      this.onOrientationStarted();
  };

  /**
   * **Pressed on one of my pieces, a drag carries it** (glisser-déposer, 15/10) — the left button
   * whatever the mapping, as the click that lifts, and a finger after a long press: a quick finger
   * pans the board, as it always did. The orbit holds still from the press, so a mouse drag does
   * not turn the table under the piece.
   */
  private armCarry(gesture: Gesture, event: PointerEvent, from: () => CarryTarget | null): void {
    if (this.onPieceCarry === undefined || this.placing !== null) return;
    const finger = event.pointerType === 'touch';
    if (!finger && (buttonAt(event.button) !== 'left' || this.spaceHeld)) return;
    gesture.carry = from();
    if (gesture.carry === null) return;
    if (!finger) {
      this.holdOrbit();
      const carry = gesture.carry;
      if (carry.kind === 'canvas' && carry.pick.squad === true) {
        this.onDetach?.('start', gesture.x, gesture.y);
        gesture.detach = setTimeout(() => {
          gesture.detach = null;
          if (this.gesture !== gesture || gesture.carrying || gesture.pastThreshold) return;
          gesture.single = true;
          this.onDetach?.('done', gesture.x, gesture.y);
          playTableSound('tick');
        }, DETACH_MS);
      }
      return;
    }
    gesture.hold = setTimeout(() => {
      gesture.hold = null;
      if (this.gesture === gesture) this.beginCarry(gesture);
    }, LONG_PRESS_MS);
  }

  /**
   * **Maj + drag on the bare board draws the lasso** (#130) — the drag that pans or turns it is
   * the one without Maj — and **a finger held still there starts a selection**, which its taps
   * then fill: on a piece, that same long press carries it, as it always did.
   */
  private armSelection(gesture: Gesture, event: PointerEvent): void {
    if (gesture.carry !== null || this.held !== null || this.placing !== null) return;
    if (event.pointerType === 'touch') {
      const onSelectHold = this.onSelectHold;
      if (onSelectHold === undefined) return;
      gesture.hold = setTimeout(() => {
        gesture.hold = null;
        if (this.gesture !== gesture || gesture.pastThreshold) return;
        gesture.pastThreshold = true;
        navigator.vibrate?.(12);
        onSelectHold();
      }, LONG_PRESS_MS);
      return;
    }
    if (this.onLasso === undefined || !event.shiftKey || gesture.button !== 'left') return;
    if (this.spaceHeld) return;
    gesture.lasso = [[event.clientX, event.clientY]];
    this.holdOrbit();
  }

  /** The stroke follows the hand, never closed back to its start (POC du 16/10). */
  private drawLasso(gesture: Gesture & { lasso: Array<[number, number]> }): void {
    const [lastX, lastY] = gesture.lasso.at(-1)!;
    if (Math.hypot(gesture.x - lastX, gesture.y - lastY) < 3) return;
    gesture.lasso.push([gesture.x, gesture.y]);
    if (this.lassoPath === null) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('map-lasso');
      this.lassoPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.append(this.lassoPath);
      this.container.append(svg);
    }
    const box = this.container.getBoundingClientRect();
    this.lassoPath.setAttribute(
      'd',
      `M${gesture.lasso.map(([x, y]) => `${x - box.left} ${y - box.top}`).join(' L')}`,
    );
    this.onLasso?.(gesture.lasso, false);
  }

  private endLasso(gesture: Gesture & { lasso: Array<[number, number]> }): void {
    this.lassoPath?.ownerSVGElement?.remove();
    this.lassoPath = null;
    this.onLasso?.(gesture.lasso, true);
  }

  private beginCarry(gesture: Gesture): void {
    if (gesture.carry === null) return;
    gesture.carrying =
      this.onPieceCarry?.(gesture.carry, gesture.x, gesture.y, gesture.single === true) === true;
    if (!gesture.carrying) {
      gesture.carry = null;
      this.releaseOrbit();
      return;
    }
    this.holdOrbit();
    if (gesture.pointerType === 'touch') navigator.vibrate?.(12);
    this.carryMove(gesture.x, gesture.y);
    this.refreshCursor();
  }

  /** The carried piece follows the pointer, a finger's too, and says what it is over. */
  private carryMove(clientX: number, clientY: number): void {
    this.invalidate();
    this.fingerOnBoard = false;
    this.aimPointer(clientX, clientY);
    this.lastPointer.clientX = clientX;
    this.lastPointer.clientY = clientY;
    this.hoverDirty = true;
    // The stop that tells the server's route counts from the last move, a carried one too.
    this.pointerMoved();
    this.tellCarryOver(
      this.carryTargetAt(clientX, clientY) ?? { kind: 'ground' },
      clientX,
      clientY,
    );
  }

  /** What stands under the pointer, a label first — never the carried copy, which is always there. */
  private carryTargetAt(clientX: number, clientY: number): CarryTarget | null {
    const label = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>('[data-label-id]')?.dataset.labelId;
    if (label !== undefined) return { kind: 'label', labelId: label };
    if (!this.castAt(clientX, clientY)) return null;
    // Far away a pin is what one drops on, as on its label.
    const pin = this.pinUnder(this.aim);
    if (pin?.kind === 'pin') return { kind: 'label', labelId: pin.id };
    const pick = this.standing.pick(this.ray, { under: true });
    // An enemy camp's annotation is aimed at by its label: the rose reads it there (POC, attack).
    const camp = this.camps.under(this.ray);
    if (
      camp !== null &&
      (pick === null || pick.pileId === this.held?.pileId || camp.distance < pick.distance)
    )
      return { kind: 'label', labelId: camp.id };
    return pick === null ? null : { kind: 'canvas', pick };
  }

  /** The long press is over, taken or not: the ring under the pointer goes. */
  private endDetach(gesture: Gesture): void {
    if (gesture.detach != null) clearTimeout(gesture.detach);
    gesture.detach = null;
    if (gesture.carry?.kind === 'canvas' && gesture.carry.pick.squad === true)
      this.onDetach?.('end', gesture.x, gesture.y);
  }

  private holdOrbit(): void {
    if (!this.controls.enabled || this.orbitHeld) return;
    this.controls.enabled = false;
    this.orbitHeld = true;
  }

  private releaseOrbit(): void {
    if (!this.orbitHeld) return;
    this.controls.enabled = true;
    this.orbitHeld = false;
  }

  /**
   * **A press on a label of mine** may become a drag that carries its pile: the engine follows it
   * from there. A press that stays a click is the label's own (`consumeCarry`).
   */
  pressOnLabel(labelId: string, event: PointerEvent): void {
    this.invalidate();
    if (this.gesture !== null) return;
    const gesture: Gesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      index: event.button,
      button: buttonAt(event.button),
      panning: false,
      traveledPx: 0,
      x: event.clientX,
      y: event.clientY,
      pastThreshold: false,
      carry: null,
      carrying: false,
      fromLabel: true,
      hold: null,
    };
    this.armCarry(gesture, event, () => ({ kind: 'label', labelId }));
    if (gesture.carry !== null) this.gesture = gesture;
  }

  /** **The piece let go boards a transport there** (15/10): it glides into it rather than home. */
  boardInto(clientX: number, clientY: number): void {
    this.invalidate();
    if (!this.castAt(clientX, clientY)) return;
    const ground = this.sheetPoint() ?? undefined;
    if (ground !== undefined) this.standing.boardInto(ground);
  }

  /** **Whether the click now arriving closes a carry** — the browser sends it at once after the
   *  release, so a click later than that is a click. */
  consumeCarry(): boolean {
    return performance.now() - this.carriedAt < CARRY_CLICK_MS;
  }

  /**
   * Two clean clicks, never a drag: **the left one reads whatever role its drag carries** — that
   * invariant is what keeps the board selectable under any mapping — and the one that acts opens
   * the rose. A drag was an orientation or a pan; held space makes the left button a pan, not a
   * designation. Both fire when the player put `act` on the left button, and in that order: the
   * rose answers about what the click has just designated. A clean touch is always both. **A
   * piece in hand turns the left one into a putting down** — it acts, once — and before any of
   * it, the left press or the touch takes one of my pieces when it lands on one.
   */
  private endGesture = (event: PointerEvent): void => {
    const gesture = this.gesture;
    // Another finger of a pinch lifted: the press stays spoiled until its own finger goes.
    if (gesture !== null && event.pointerId !== gesture.pointerId) return;
    this.gesture = null;
    if (gesture?.hold != null) clearTimeout(gesture.hold);
    if (gesture !== null) this.endDetach(gesture);
    this.releaseOrbit();
    this.applyMapping();
    this.refreshCursor();
    // A tap on a card, a sheet's « fermer », lands here too (#189): it pressed nothing on the
    // board, and marking the hover dirty woke the map for a second and a half at sixty frames.
    if (gesture === null) return;
    // A press hides the piece under the pointer: released, it is there again.
    this.hoverDirty = true;
    if (gesture.lasso !== undefined) {
      this.endLasso(gesture as Gesture & { lasso: Array<[number, number]> });
      if (gesture.lasso.length > 2) return;
    }
    if (gesture.carrying) {
      this.carriedAt = performance.now();
      this.tellCarryOver(null, event.clientX, event.clientY);
      if (event.type === 'pointerup') this.dropCarried(event);
      this.onCarryEnd?.();
      return;
    }
    if (event.type !== 'pointerup' || gesture.fromLabel) return;
    const press = cleanPressAt(
      this.mapping,
      gesture.pointerType,
      gesture.index,
      this.held !== null,
    );
    // A piece in hand goes back home at any clean press that does not put it down, the button
    // that pans included, like Escape (#229).
    const release = releaseOf(gesture, press);
    if (release === 'cancel') return this.onCarryCancel?.();
    if (release === 'none') return;
    // A finger has no hover to read from: the board is aimed where it lifted, now, so the
    // ghost of a placement and the country under it answer for this point and not the last.
    if (this.fingerOnBoard) {
      this.aimPointer(event.clientX, event.clientY);
      this.hoverDirty = false;
      this.updateHover();
    }
    if (press.picks && this.approachClusterAt(event.clientX, event.clientY, gesture.pointerType))
      return;
    this.closeCluster();
    if (press.picks && this.pickAt(event, gesture.single === true)) return;
    if (this.pressPiece(event, press)) return;
    if (press.reads) this.readAt();
    if (press.acts && !press.reads && this.placing !== null) return this.onPlacingDismiss();
    if (press.acts) this.onAct(this.actClickAt(event.clientX, event.clientY));
  };

  /** **The carried piece let go** (15/10): on a piece or a label, the host says what it does
   *  there; on the ground it is put down, as a click in hand puts it down. */
  private dropCarried(event: PointerEvent): void {
    const on = this.carryTargetAt(event.clientX, event.clientY);
    if (on !== null) {
      this.onPieceDrop?.(on, event.clientX, event.clientY);
      return;
    }
    if (!this.castAt(event.clientX, event.clientY)) return;
    this.onAct(this.actClickAt(event.clientX, event.clientY));
  }

  private actClickAt(clientX: number, clientY: number): MapActClick {
    return {
      country: this.countryAtPoint(clientX, clientY),
      region: this.regionAtPoint(clientX, clientY),
      point: this.pointAt(clientX, clientY),
      clientX,
      clientY,
    };
  }

  /** A building held or a key armed wants the ground, not the piece standing on it. */
  private pickAt(event: PointerEvent, single: boolean): boolean {
    const onPieceClick = this.onPieceClick;
    if (onPieceClick === undefined || this.placing !== null) return false;
    if (!this.castAt(event.clientX, event.clientY)) return false;
    const piece = this.pieceToTake();
    if (piece === null) return false;
    onPieceClick({
      ...piece,
      clientX: event.clientX,
      clientY: event.clientY,
      ...(single ? { single } : {}),
    });
    return true;
  }

  /** **The piece the ray takes**, unless a maquette stands in front of it: a garrison at its
   *  building's foot is lifted by its figurines, the building by its maquette opens its site. */
  private pieceToTake(): PiecePick | null {
    const piece = this.standing.pick(this.ray);
    if (piece === null || piece.carried) return piece;
    const maquette = this.maquettes.under(this.ray);
    return maquette !== null && maquette.distance < piece.distance ? null : piece;
  }

  /** A finger lifts where it was never hovering: the piece under it is cast for, then. */
  private pressPiece(event: PointerEvent, press: CleanPress): boolean {
    if (this.onPiecePress === undefined || this.placing !== null) return false;
    if (!this.castAt(event.clientX, event.clientY)) return false;
    const labelId = this.pieceUnder(this.aim)?.id;
    if (labelId === undefined) return false;
    return this.onPiecePress({
      labelId,
      press,
      pointerType: event.pointerType,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }

  /** Where a place of the board falls on the page, for what flies to it (`shell/flights`). */
  screenOf(at: LonLat): { x: number; y: number } | null {
    const point = this.frame.projectLonLat(at, COUNTRY_THICKNESS).project(this.eye);
    if (point.z > 1) return null;
    const box = this.renderer.domElement.getBoundingClientRect();
    return {
      x: box.left + ((point.x + 1) / 2) * box.width,
      y: box.top + ((1 - point.y) / 2) * box.height,
    };
  }

  pieceRect(labelId: string): Rect | null {
    const box =
      this.standing.boxOf(labelId) ??
      this.camps.boxOf(labelId) ??
      this.arcs.boxOf(labelId) ??
      this.maquettes.boxOf(labelId);
    return box === null || box.isEmpty()
      ? this.pins.rectOf(labelId)
      : screenRect(box, this.eye, this.screenWidth, this.screenHeight);
  }

  /** The pin under a point of the screen, in device coordinates; a pin is drawn over everything. */
  private pinUnder(ndc: Vector2): PinHit | null {
    return this.pins.under(
      ((ndc.x + 1) / 2) * this.screenWidth,
      ((1 - ndc.y) / 2) * this.screenHeight,
    );
  }

  /** **What a press on the canvas would carry**: the figurine under it, or far away its pin. */
  private carryFrom(clientX: number, clientY: number): CarryTarget | null {
    if (!this.castAt(clientX, clientY)) return null;
    const pick = this.pieceToTake();
    if (pick !== null) return pick.carried ? null : { kind: 'canvas', pick };
    return this.pileOfPin(this.pinUnder(this.aim));
  }

  /** A pin of one of my piles carries it, as its label does. */
  private pileOfPin(pin: PinHit | null): CarryTarget | null {
    return pin?.kind === 'pin' && this.standing.pileOfLabel(pin.id) !== null
      ? { kind: 'label', labelId: pin.id }
      : null;
  }

  /** **A cluster is not lifted, it is approached** (#234): the camera comes down until it opens. */
  approachCluster(ids: ReadonlyArray<string>): void {
    this.invalidate();
    this.closeCluster();
    this.journeyTo(ids, [], 0, PIN_APPROACH_DISTANCE);
  }

  /** A click on a cluster approaches it; a finger, which has no hover, opens its sheet. */
  private approachClusterAt(clientX: number, clientY: number, pointerType = 'mouse'): boolean {
    // A piece in hand puts down on a cluster: it is a place like any other.
    if (this.held !== null || !this.castAt(clientX, clientY)) return false;
    const pin = this.pinUnder(this.aim);
    if (pin?.kind !== 'cluster') return false;
    if (pointerType === 'touch') this.openCluster(pin);
    else this.approachCluster(pin.ids);
    return true;
  }

  private openCluster(cluster: Extract<PinHit, { kind: 'cluster' }>): void {
    const key = cluster.ids.join(' ');
    if (key === this.openedCluster) return;
    this.openedCluster = key;
    const box = this.renderer.domElement.getBoundingClientRect();
    this.onClusterOpen?.({
      ids: cluster.ids,
      clientX: box.left + cluster.x,
      clientY: box.top + cluster.y,
    });
  }

  /** Its sheet closed: the next hover over the cluster opens it again. */
  closeCluster(): void {
    this.invalidate();
    if (this.openedCluster === null) return;
    this.openedCluster = null;
    this.onClusterOpen?.(null);
  }

  /** Every piece the canvas draws, nearest first: they stand in front of the regions they are on. */
  private pieceUnder(ndc: Vector2 = this.pointer): PieceHit | null {
    const pin = this.pinUnder(ndc);
    if (pin !== null) return pin.kind === 'pin' ? { id: pin.id, distance: 0 } : null;
    return [
      this.standing.under(this.ray),
      this.camps.under(this.ray),
      this.arcs.pawnUnder(this.ray),
      this.maquettes.under(this.ray),
    ].reduce(nearer, null);
  }

  /**
   * **The mouse moved over a DOM label**, which takes it from the canvas: a held piece's stop is
   * told there too, on that label — a mast, a camp, an objective are where one puts down.
   */
  pointerOverLabel(labelId: string, clientX: number, clientY: number): void {
    this.invalidate();
    this.restLabel = labelId;
    this.lastPointer.clientX = clientX;
    this.lastPointer.clientY = clientY;
    this.pointerMoved();
  }

  private pointerMoved(): void {
    if (this.held !== null && this.rest.moved(performance.now())) this.onRestless?.();
  }

  private tellRest(): void {
    const { clientX, clientY } = this.lastPointer;
    const click = this.actClickAt(clientX, clientY);
    if (click.point === null && this.restLabel === null) return;
    this.onRest?.({ ...click, labelId: this.restLabel ?? this.hoveredLabel });
  }

  private readAt(): void {
    if (this.placing !== null) {
      const spot = this.ghost.spot;
      if (spot !== null) this.onPlacePoint(this.placingSpotAt(spot));
      return;
    }
    if (this.fingerOnBoard) {
      this.regionTapped = true;
      this.updateHover();
    }
    this.onSelect(this.hovered?.userData.adm0 ?? null);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Space' || isTyping()) return;
    // Without this, the page scrolls under the map on every press.
    event.preventDefault();
    if (this.spaceHeld) return;
    this.spaceHeld = true;
    this.applyMapping();
    this.refreshCursor();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== 'Space' || !this.spaceHeld) return;
    this.spaceHeld = false;
    this.applyMapping();
    this.refreshCursor();
  };

  private onFocusLost = (): void => {
    if (!this.spaceHeld) return;
    this.spaceHeld = false;
    this.applyMapping();
    this.refreshCursor();
  };

  /**
   * **The one place a button becomes a role.** Nothing else in the engine reads a button
   * number: a second reading would be a second mapping, and the day the player swaps two
   * buttons only one of them would have moved.
   */
  private roleOf(pointerType: string, index: number): MouseRole | null {
    return dragRoleAt(this.mapping, pointerType, index);
  }

  /** The pointer moved over the board: the aim, and what a piece held by a click reads. */
  private pointerMove(event: PointerEvent): void {
    if (this.gesture?.carrying === true) return;
    this.fingerOnBoard = event.pointerType === 'touch';
    // A tile carried under a finger is aimed above it: the finger would hide the point. A press
    // on the canvas is put down under the finger at its release (`endGesture`), so aims there.
    const lift =
      this.placing !== null && this.fingerOnBoard && this.gesture === null
        ? PLACING_FINGER_LIFT_PX
        : 0;
    this.aimPointer(event.clientX, event.clientY - lift);
    this.placingFinger =
      lift === 0 ? null : { x: this.pointerScreen.x, y: this.pointerScreen.y + lift };
    this.lastPointer.clientX = event.clientX;
    this.lastPointer.clientY = event.clientY;
    this.restLabel = null;
    if (!this.fingerOnBoard) this.pointerMoved();
    // Lifted by a click, the piece reads its drop as a carried one does: the release is the click.
    if (this.held !== null && !this.fingerOnBoard)
      this.tellCarryOver(
        this.carryTargetAt(event.clientX, event.clientY) ?? { kind: 'ground' },
        event.clientX,
        event.clientY,
      );
  }

  private aimPointer(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerScreen.x = clientX - rect.left;
    this.pointerScreen.y = clientY - rect.top;
    this.pointer.x = (this.pointerScreen.x / rect.width) * 2 - 1;
    this.pointer.y = -(this.pointerScreen.y / rect.height) * 2 + 1;
    this.hoverDirty = true;
  }

  private syncEye(): PerspectiveCamera {
    const target = this.controls.target;
    this.eye.position
      .subVectors(this.camera.position, target)
      .multiplyScalar(EYE_BACKOFF)
      .add(target);
    this.eye.quaternion.copy(this.camera.quaternion);
    this.eye.updateMatrixWorld();
    return this.eye;
  }

  setDayCycle(cycle: DayCycle): void {
    this.invalidate();
    this.dayCycle = cycle;
  }

  setContourWeight(weight: ContourWeight): void {
    this.invalidate();
    this.regions.contours.weight = weight;
  }

  /** **Le cadre d'une Blitz** (B1) : la boîte du théâtre, et le reste délavé ; `null` l'ôte. */
  setTheatre(theatre: Theatre | null): void {
    this.invalidate();
    this.theatreFrame.show(theatre);
    this.arcs.setAloft(theatre !== null);
  }

  /** Percentages from the settings; the pieces re-measure on the next frame. */
  setPieceScale(scale: PieceScale): void {
    this.invalidate();
    pieceScale.troops = scale.troops / 100;
    pieceScale.buildings = scale.buildings / 100;
    this.maquettes.resize();
  }

  setMapMotion(motion: MapMotion): void {
    this.invalidate();
    this.ambience.motion = motion;
    this.arcs.motion = motion;
    this.standing.motion = motion;
    this.camps.motion = motion;
    this.veil.motion = motion;
    this.ink.motion = motion;
    this.parachutes.motion = motion;
    this.maquettes.motion = motion;
    this.ghost.motion = motion;
  }

  /**
   * Le mappage s'applique aussitôt, sans rechargement. Un glisser en cours garde le sien
   * jusqu'au relâchement (règle de controles-camera) : changer de rôle sous les doigts du
   * joueur ferait d'un geste commencé un autre geste.
   */
  setMouseMapping(mapping: MouseMapping): void {
    this.invalidate();
    this.mapping = mapping;
    this.applyMapping();
    this.refreshCursor();
  }

  /** A running drag keeps the mapping it had at press; it resumes on release. */
  private applyMapping(): void {
    if (this.gesture !== null) return;
    const control = (button: MouseButton) => CONTROL_BY_ROLE[this.mapping[button]];
    this.controls.mouseButtons = {
      LEFT: this.spaceHeld ? MOUSE.PAN : control('left'),
      MIDDLE: control('middle'),
      RIGHT: control('right'),
    };
  }

  /**
   * Without this visual feedback, the pan mode is invisible: open hand as soon as space is
   * held, closed hand during the drag. The rest of the time, the system cursor stays the
   * system's.
   */
  private refreshCursor(): void {
    const { style } = this.renderer.domElement;
    if (this.gesture?.panning === true) style.cursor = 'grabbing';
    else if (this.spaceHeld) style.cursor = 'grab';
    else if (this.placing !== null)
      style.cursor =
        this.ghost.spot === null || this.placingRefused ? REFUSED_CURSOR : TROWEL_CURSOR;
    else if (this.held !== null) style.cursor = HOLDING_CURSOR;
    else if (this.aiming) style.cursor = AIM_CURSOR;
    else if (this.hoveredPiece !== null) style.cursor = this.hoveredPiece;
    else style.cursor = '';
  }

  /** The board is in aim: a column is armed and the next right click names its march. */
  setAiming(aiming: boolean): void {
    this.invalidate();
    if (aiming === this.aiming) return;
    this.aiming = aiming;
    this.refreshCursor();
  }

  /** The board says whether the point the ghost holds is refused: the cursor says it too. */
  setPlacingRefused(refused: boolean): void {
    this.invalidate();
    if (refused === this.placingRefused) return;
    this.placingRefused = refused;
    this.ghost.refuse(refused);
    this.refreshCursor();
  }

  /**
   * **The board is holding a building, and the next left click puts it down** (ADR 0029). The
   * ghost follows the pointer anywhere; its magnet, when it has one, makes it leap onto the
   * open-sea coast of the region under the pointer (`nearestCoast`, the file the server refuses
   * with) or onto one of a list of points — the free deposits. What the point is worth is not
   * decided here: the board reads it off `onPlacingAim`, through the placement rule.
   */
  setPlacing(placing: HeldPlacing | null): void {
    this.invalidate();
    if (placing === this.placing) return;
    this.placing = placing;
    this.placingFinger = null;
    this.basins.wake(placing?.magnet.kind === 'deposits' ? placing.magnet.calls : null);
    this.loadBasins();
    this.placingReach.show(placing?.reaches ?? []);
    if (placing === null) {
      this.ghost.disarm();
      this.onPlacingAim(null);
      this.refreshCursor();
      return;
    }
    if (placing.magnet.kind === 'coast') this.loadCoast();
    this.ghost.arm(
      placing.sprite,
      (pointer) => this.snapFor(placing.magnet, pointer),
      placing.magnet.kind === 'deposits',
    );
    this.hoverDirty = true;
    this.refreshCursor();
  }

  /**
   * **Dans sa région** (#221) : au-dessus d'une région, le fantôme ne saute que sur sa côte — une
   * région de l'intérieur n'en a pas, et il reste sous le pointeur ; au large, sur la côte la
   * plus proche, de qui qu'elle soit.
   */
  private snapFor(magnet: PlacingMagnet, pointer: LonLat): LonLat {
    if (magnet.kind === 'free') return pointer;
    if (magnet.kind === 'deposits') return depositAim(magnet.calls, pointer).spot;
    if (this.coast === null) return pointer;
    const region = this.regionAtLonLat(pointer)?.id ?? null;
    return nearestCoast(this.coast, pointer, PLACING_SNAP_KM, region)?.lonLat ?? pointer;
  }

  /** Un point posé sur le trait de côte tombe parfois hors du dessin de sa région : la côte la
   *  plus proche la nomme alors. */
  private placingSpotAt(lonLat: LonLat): PlacingSpot {
    const shore = () => {
      const regionId = this.coast && nearestCoast(this.coast, lonLat, COAST_REACH_KM)?.regionId;
      return regionId ? this.regions.identityOf(regionId) : null;
    };
    const region = this.regionAtLonLat(lonLat) ?? shore();
    if (this.coast === null) this.loadCoast();
    return {
      lonLat,
      region,
      coastal:
        this.coast === null
          ? null
          : region !== null && onRegionCoast(this.coast, lonLat, region.id),
      onLand: carriesBuilding(this.routeGrid, this.coast, lonLat),
    };
  }

  /** Where a point of the board falls on the map, in its own CSS pixels. */
  private mapPointOf(lonLat: LonLat): ScreenPoint {
    // ponytail: a point behind the eye mirrors; the board is looked at from above.
    const ndc = this.frame.projectLonLat(lonLat, COUNTRY_THICKNESS).project(this.eye);
    return {
      x: Math.round(((ndc.x + 1) / 2) * this.screenWidth),
      y: Math.round(((1 - ndc.y) / 2) * this.screenHeight),
    };
  }

  /**
   * **The thread of the held building** (#239), told to the board when it changes on screen —
   * at a rendered frame only, so it moves with the aim and the camera, and never at rest.
   */
  private tellThread(): void {
    const spot = this.placing === null ? null : this.ghost.spot;
    let thread: PlacingThread | null = null;
    if (this.placing !== null && spot !== null) {
      const foot = this.mapPointOf(spot);
      const pointer = this.placingFinger ?? {
        x: Math.round(this.pointerScreen.x),
        y: Math.round(this.pointerScreen.y),
      };
      const magnet = this.placing.magnet;
      const target = magnet.kind === 'deposits' ? depositAim(magnet.calls, spot).target : null;
      const long =
        target === null || target.km < 1
          ? null
          : {
              from: foot,
              ...threadPath(
                foot,
                this.mapPointOf(target.call.deposit.lonLat),
                this.screenWidth,
                this.screenHeight,
              ),
              deposit: target.call.deposit.deposit,
              place: this.regions.identityOf(target.call.deposit.regionId)?.name ?? null,
              km: Math.round(target.km),
            };
      const taut =
        Math.hypot(pointer.x - foot.x, pointer.y - foot.y) > TAUT_MIN_PX
          ? { from: pointer, to: foot }
          : null;
      thread = {
        long,
        taut,
        refused: this.placingRefused,
        // A name whose top is off the screen would be cut by its edge: it stays unsaid.
        rings: this.placing.reaches
          .map(({ lonLat, reachKm }) => ({
            top: this.mapPointOf(destinationPoint(lonLat, reachKm, 0)),
            km: reachKm,
          }))
          .filter(
            ({ top }) =>
              top.x > RING_NAME_ROOM_PX &&
              top.x < this.screenWidth - RING_NAME_ROOM_PX &&
              top.y > 20 &&
              top.y < this.screenHeight,
          ),
      };
    }
    const said = JSON.stringify(thread);
    if (said === this.threadSaid) return;
    this.threadSaid = said;
    this.onPlacingThread?.(thread);
  }

  private coast: Coast | null = null;
  /** The coast has landed: a rose waiting on it reads itself again (#224). */
  onCoast?: (() => void) | undefined;
  private coastLoading = false;
  /** Après un échec, le prochain essai attend ce délai : la visée le redemande à chaque pas. */
  private coastRetryAt = 0;

  /**
   * La côte de mer ouverte et les régions sans cellule (`public/coast.json`, 0,55 Mo gzip) : la
   * terre de Malte ou du centre de Naples en dépend (#224). Le plateau la demande au repos, après
   * le niveau près (`WorldMap`) ; un geste qui en a besoin avant la demande aussitôt (`groundAt`,
   * `placingSpotAt`). Tant qu'elle n'est pas là le fantôme n'a pas de verdict sur l'eau de la
   * grille (`coastal: null`) ; un échec se retente (`COAST_RETRY_MS`) au prochain point visé.
   */
  loadCoast(): void {
    if (this.coast !== null || this.coastLoading || performance.now() < this.coastRetryAt) return;
    this.coastLoading = true;
    fetch('/coast.json')
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((asset) => {
        const started = performance.now();
        this.coast = decodeCoast(asset, PROJECTION);
        performance.measure('coast.json décodé', { start: started });
        this.onCoast?.();
        const held = this.ghost.spot;
        if (this.placing !== null && held !== null) this.onPlacingAim(this.placingSpotAt(held));
        this.hoverDirty = true;
        this.invalidate();
      })
      .catch(() => {
        this.coastRetryAt = performance.now() + COAST_RETRY_MS;
      })
      .finally(() => (this.coastLoading = false));
  }

  /**
   * **Une coque accoste-t-elle ici ?** La même lecture que le serveur refuse avec
   * (`coastAtPoint`), sur la même grille et la même côte : ce que la visée offre au clic droit et
   * ce que la mutation accepte sortent d'une seule fonction (ADR 0015, `isLandingShore`). Un port
   * ne la lit pas : il se pose sur la côte de l'atlas (#221).
   */
  coastAt(lonLat: LonLat): boolean {
    if (this.coast === null) this.loadCoast();
    return isLandingShore(this.routeGrid, this.coast, lonLat);
  }

  /** Une route à pied aboutit-elle ici ? La cellule que le serveur lit (`isWalkableCell`). */
  walkableAt(lonLat: LonLat): boolean {
    return isWalkableCell(this.routeGrid, lonLat);
  }

  /** **L'eau ouverte de la grille avant la côte** : une coque n'y a pas de verdict, la côte est
   *  demandée tout de suite (#224). */
  coastPendingAt(lonLat: LonLat): boolean {
    if (this.coast !== null || !isOpenWaterCell(this.routeGrid, lonLat)) return false;
    this.loadCoast();
    return true;
  }

  /** Le sol que le dessin lit (piles, maquettes) : il ne réclame pas la côte, il l'attend. */
  landAt(lonLat: LonLat): boolean {
    return groundOf(this.routeGrid, this.coast, lonLat) === 'land';
  }

  /**
   * Terre, mer ou lac, comme le serveur le lit avec `groundAtPoint` (`groundOf`, #224) : la
   * grille, puis la côte de l'atlas une fois `coast.json` arrivé. Un geste qui tombe sur l'eau de
   * la grille avant elle la demande tout de suite, sans attendre le repos (`loadCoast`).
   */
  groundAt(lonLat: LonLat): Ground {
    const ground = groundOf(this.routeGrid, this.coast, lonLat);
    if (this.coast === null && ground === 'sea') this.loadCoast();
    return ground;
  }

  /**
   * **How a thread leaves or reaches a runway or a quay** (#129): a plane takes the axis of its
   * airfield in the sense it is going, a hull leaves seaward and arrives along the shore.
   */
  private endOf(
    medium: Medium,
    which: 'start' | 'end',
    at: Vector3,
    hint: readonly [number, number],
  ): readonly [number, number] | null {
    if (medium === 'air') {
      const axis = this.maquettes.runwayAt(at.x, at.z);
      if (axis === null) return null;
      return axis[0] * hint[0] + axis[1] * hint[1] >= 0 ? axis : [-axis[0], -axis[1]];
    }
    if (medium !== 'sea') return null;
    const seaward = this.seawardOf(
      this.frame.lonLatAt(at.x + this.frame.centerX, at.z + this.frame.centerY),
    );
    if (seaward === null) return null;
    if (which === 'start') return seaward;
    const shore: readonly [number, number] = [-seaward[1], seaward[0]];
    return shore[0] * hint[0] + shore[1] * hint[1] >= 0 ? shore : [-shore[0], -shore[1]];
  }

  /** **Toward the water from a point on a shore**, a unit vector on the board — `null` inland, or
   *  out at sea: a pile there has no land side (`formationOf`). */
  private seawardOf(lonLat: LonLat): readonly [number, number] | null {
    const point = this.frame.projectLonLat(lonLat);
    // The pile is drawn at the troops' size: its blocks reach as far as that, and so does the probe.
    const reach = SHORE_REACH * pieceScale.troops;
    let [x, z] = [0, 0];
    let wet = 0;
    for (let k = 0; k < SHORE_PROBES; k++) {
      const angle = (2 * Math.PI * k) / SHORE_PROBES;
      const [dx, dz] = [Math.sin(angle), Math.cos(angle)];
      const probe = this.frame.lonLatAt(
        point.x + dx * reach + this.frame.centerX,
        point.z + dz * reach + this.frame.centerY,
      );
      if (this.landAt(probe)) continue;
      wet++;
      x += dx;
      z += dz;
    }
    const length = Math.hypot(x, z);
    return wet === 0 || wet === SHORE_PROBES || length === 0 ? null : [x / length, z / length];
  }

  /**
   * How many board units one pixel holds at this distance. Marks, dashes and pawns use it
   * to keep their screen size: it is the only measure linking a drawn size to a perceived
   * one, and it beats an eyeballed factor.
   */
  private unitsPerPixel(distance: number): number {
    return (2 * Math.tan((this.camera.fov * Math.PI) / 360) * distance) / this.screenHeight;
  }

  private stepEndAt(t: number): number {
    const step = REPLAY_STEPS.find((each) => t < stepBounds(each).end);
    return step === undefined ? REPLAY_MS : stepBounds(step).end;
  }

  /** A journey that also turns the eye; at once when motion is not full. */
  private travel(
    arrival: Vector3,
    orientation: Vector3,
    distance: number,
    durationMs: number,
  ): void {
    if (this.ambience.motion !== 'full') {
      this.journey = null;
      this.controls.target.copy(arrival);
      this.camera.position.copy(arrival).addScaledVector(orientation, distance);
      this.hoverDirty = true;
      this.postponeRest();
      return;
    }
    this.journey = {
      departure: this.controls.target.clone(),
      arrival: arrival.clone(),
      fromOrientation: this.camera.position.clone().sub(this.controls.target).normalize(),
      orientation,
      departureDistance: this.camera.position.distanceTo(this.controls.target),
      arrivalDistance: distance,
      startMs: performance.now(),
      durationMs,
    };
  }

  /** The replay's clock runs to `until`; the frame shown follows the motion setting. */
  private advanceReplay(now: number): void {
    const replay = this.replay;
    if (replay === null) return;
    // Cut motion shows the account at once: the replay is over as soon as it begins.
    replay.t =
      this.ambience.motion === 'off'
        ? REPLAY_MS
        : Math.min(replay.until, Math.max(replay.t, replay.t + now - replay.clock));
    replay.clock = now;
    const frame = replayAt(replay.view, replay.t, this.ambience.motion);
    const ended = replay.t >= REPLAY_MS;
    if (frame.step !== replay.step || ended !== replay.ended) {
      replay.step = frame.step;
      replay.ended = ended;
      replay.onStep(frame.step, ended);
    }
    replay.scene.show(frame, now / 1000, this.ambience.motion !== 'full');
    // Frames are due while it plays, and while a hull burns at full motion; held, it is still.
    if (replay.t < replay.until || (this.ambience.motion === 'full' && replay.scene.smoking))
      this.invalidate();
  }

  /** What stands at the point would stand inside the replay: piles, blocks, passing pawns. */
  private clearReplayGround(): void {
    const replay = this.replay;
    if (replay === null) return;
    for (const layer of [this.standing.group, this.camps.group])
      for (const object of layer.children)
        if (object.position.distanceTo(replay.center) < replay.reach) object.visible = false;
    for (const pawn of this.arcs.pawns)
      if (pawn.visible && pawn.position.distanceTo(replay.center) < replay.reach) {
        pawn.visible = false;
        this.replayHidden.add(pawn);
      }
  }

  /** A mast's label is DOM, not scene: it goes by its place on screen, inside the scene's reach. */
  private outsideReplay(
    projections: ReadonlyArray<LabelProjection>,
    distance: number,
  ): ReadonlyArray<LabelProjection> {
    const replay = this.replay;
    if (replay === null) return projections;
    const center = replay.center.clone().project(this.eye);
    const x = ((center.x + 1) / 2) * this.screenWidth;
    const y = ((1 - center.y) / 2) * this.screenHeight;
    const radius = replay.reach / this.unitsPerPixel(distance);
    return projections.map((label) =>
      label.visible && Math.hypot(label.x - x, label.y - y) < radius
        ? { ...label, visible: false }
        : label,
    );
  }

  private postponeRest(): void {
    if (this.restTimer !== null) clearTimeout(this.restTimer);
    this.restTimer = setTimeout(() => {
      this.restTimer = null;
      for (const listener of this.restListeners) listener();
    }, CAMERA_REST_MS);
  }

  /** The journey yields to the first hand on the camera: we do not fight the player. */
  private animateJourney(): void {
    if (this.journey === null) return;
    this.invalidate();
    const share = Math.min(
      1,
      (performance.now() - this.journey.startMs) / (this.journey.durationMs ?? JOURNEY_MS),
    );
    const eased = share * share * (3 - 2 * share);

    this.controls.target.copy(this.journey.departure).lerp(this.journey.arrival, eased);
    const distance =
      this.journey.departureDistance +
      (this.journey.arrivalDistance - this.journey.departureDistance) * eased;
    const orientation = this.journey.fromOrientation
      ? this.journey.fromOrientation.clone().lerp(this.journey.orientation, eased).normalize()
      : this.journey.orientation;
    this.camera.position.copy(this.controls.target).addScaledVector(orientation, distance);
    // A journey moves the camera without going through OrbitControls, so no `change` event
    // fires: the hover has to be invalidated by hand.
    this.hoverDirty = true;

    if (share === 1) {
      if (this.journey.maxDistanceAtEnd !== undefined) {
        this.controls.maxDistance = this.journey.maxDistanceAtEnd;
      }
      this.journey = null;
      this.postponeRest();
    }
  }

  private restoreDefaultZoom(): void {
    const currentDistance = this.camera.position.distanceTo(this.controls.target);
    // The orbit's clamp leaves a float of noise past the ceiling: not a distance to travel back.
    if (currentDistance <= DEFAULT_MAX_DISTANCE + 1e-3) {
      this.controls.maxDistance = DEFAULT_MAX_DISTANCE;
      return;
    }
    if (this.ambience.motion !== 'full') {
      const orientation = this.camera.position.clone().sub(this.controls.target).normalize();
      this.camera.position
        .copy(this.controls.target)
        .addScaledVector(orientation, DEFAULT_MAX_DISTANCE);
      this.controls.maxDistance = DEFAULT_MAX_DISTANCE;
      this.hoverDirty = true;
      this.postponeRest();
      return;
    }
    this.journey = {
      departure: this.controls.target.clone(),
      arrival: this.controls.target.clone(),
      orientation: this.camera.position.clone().sub(this.controls.target).normalize(),
      departureDistance: currentDistance,
      arrivalDistance: DEFAULT_MAX_DISTANCE,
      maxDistanceAtEnd: DEFAULT_MAX_DISTANCE,
      startMs: performance.now(),
    };
  }

  private updateHover(): void {
    this.ray.setFromCamera(this.pointer, this.syncEye());
    /** **The pointer's rest, (-2, -2), is off the screen but not off the board**: tilted and
     *  close, a ray cast outside the frame still lands on a country, and the dock would announce
     *  a hover nobody made — on a phone, from the first frame. */
    const onScreen = Math.abs(this.pointer.x) <= 1 && Math.abs(this.pointer.y) <= 1;
    /** **A finger has no hover** (#189): under it, the country is only read for a tap. Cast at
     *  every frame of a pinch, the ray through every coast cost the phone a second in nine. */
    const hit = onScreen && (!this.fingerOnBoard || this.regionTapped) ? this.landUnderRay() : null;
    const touched = hit?.country;
    const pointing =
      onScreen && !this.fingerOnBoard && this.gesture === null && this.placing === null;
    const pin = pointing ? this.pinUnder(this.pointer) : null;
    const label = pointing ? (this.pieceUnder()?.id ?? null) : null;
    this.pins.hover(pin?.kind === 'pin' ? pin.id : null);
    // Hovered, a cluster opens its sheet; another piece under the pointer closes it.
    if (pin?.kind === 'cluster') this.openCluster(pin);
    else if (pin !== null) this.closeCluster();
    if (label !== this.hoveredLabel) {
      this.hoveredLabel = label;
      this.onPieceHover?.(label);
    }

    // The piece stands in front of its region: the region is not what the pointer is on.
    if (!this.fingerOnBoard || this.regionTapped) {
      this.regionTapped = false;
      this.updateRegionHover(label === null && pin === null ? (hit?.point ?? null) : null);
    }

    const take = !this.fingerOnBoard && onScreen ? this.pieceToTake() : null;
    const piece =
      take !== null || this.pileOfPin(pin) !== null
        ? PIECE_CURSOR
        : label !== null || pin !== null
          ? 'pointer'
          : null;
    const hoveredPile =
      this.held !== null || take === null || take.carried === true ? null : take.pileId;
    if (hoveredPile !== this.hoveredPile) {
      this.hoveredPile = hoveredPile;
      this.refreshRings();
    }
    if (piece !== this.hoveredPiece) {
      this.hoveredPiece = piece;
      this.refreshCursor();
    }
    if (this.held !== null) {
      const ground = onScreen && !this.fingerOnBoard ? this.sheetPoint() : null;
      this.standing.carryTo(ground ?? null);
      this.heldGround = ground ?? null;
    }

    const arc = this.fingerOnBoard || !onScreen ? null : this.arcs.hover(this.ray);
    if (arc !== this.hoveredArc) {
      this.hoveredArc = arc;
      this.onArcHover(arc);
    }

    /** The ghost follows over the water too, so the ray is given the sea back — the hover above
     *  only wanted the land. It has just walked the arcs, hence the second aim rather than the
     *  hit already in hand. */
    if (this.placing !== null) {
      const before = this.ghost.spot;
      this.ray.setFromCamera(this.pointer, this.syncEye());
      const board = onScreen ? this.sheetPoint() : null;
      this.ghost.aimAt(
        board === null ? null : board.x + this.frame.centerX,
        board === null ? null : board.z + this.frame.centerY,
      );
      const after = this.ghost.spot;
      if (after !== null && after !== before) {
        if (before === null) this.refreshCursor();
        this.onPlacingAim(this.placingSpotAt(after));
      }
    }

    this.hovered = touched ?? null;
    const adm0 =
      this.fingerOnBoard || label !== null || pin !== null
        ? null
        : (this.hovered?.userData.adm0 ?? null);
    if (adm0 !== this.hoveredCountry) {
      this.hoveredCountry = adm0;
      this.onCountryHover(adm0);
    }
  }

  /** Region hover only exists once the layer has faded in on screen, never at sea. */
  private updateRegionHover(point: Vector3 | null): void {
    let region: HoveredRegion | null = null;
    if (point !== null && this.regions.isActive) {
      region = this.regions.hover(point.x + this.frame.centerX, point.z + this.frame.centerY);
    } else {
      this.regions.clearHover();
    }
    // Compared by id, never by name: two countries own a "Córdoba", and a pointer sliding
    // from one to the other must announce the second.
    if ((region?.id ?? null) !== this.hoveredRegion) {
      this.hoveredRegion = region?.id ?? null;
      this.onRegionHover(region);
    }
  }

  private lightCountries(): void {
    for (const mesh of this.countries) {
      const isHovered = mesh === this.hovered && !this.fingerOnBoard;
      const isSelected = mesh.userData.adm0 === this.selection;
      /** **Its own ink, lit**: a warm glow added to France's blue turned it grey under the
       *  pointer, and Japan's purple brown — the lift keeps the family (palette des nations). */
      const lift = isSelected ? SELECTED_LIFT : isHovered ? HOVERED_LIFT : 0;
      mesh.material.emissive.copy(mesh.material.color).multiplyScalar(lift);
    }
  }

  /**
   * **La cible reste sur le monde, retenue sans à-coup** (#187) : passée le bord du plateau, elle
   * revient chaque tour d'une part de ce qui dépasse — un glisser au-delà sent une résistance, pas
   * un mur. L'œil suit la cible : ni la pente ni la distance ne bougent. Hors animations actives :
   * d'un coup, comme tout mouvement de caméra.
   */
  private holdTargetOnBoard(): void {
    const target = this.controls.target;
    const rate = this.ambience.motion !== 'full' ? 1 : BOARD_HOLD_RATE;
    const dx = boardHoldOf(target.x, this.frame.width / 2, rate);
    const dz = boardHoldOf(target.z, this.frame.height / 2, rate);
    if (dx === 0 && dz === 0) return;
    target.x += dx;
    target.z += dz;
    this.camera.position.x += dx;
    this.camera.position.z += dz;
  }

  private loop = (): void => {
    this.animation = requestAnimationFrame(this.loop);
    this.animateJourney();
    // Held orbit (a pile carried, the lasso): the map must not slide under the hand.
    if (this.journey === null && !this.orbitHeld) this.holdTargetOnBoard();
    this.controls.maxPolarAngle = steepestTiltAt(
      this.camera.position.distanceTo(this.controls.target),
    );
    this.controls.update();
    this.syncEye();
    if (this.hoverDirty) {
      // Le survol change ce qui s'allume.
      this.invalidate();
      this.hoverDirty = false;
      this.updateHover();
    }
    // Le pion porté suit la main : à chaque image. Un fil qui coule ou un anneau qui bat n'en
    // demande qu'au pas de `flowPace`.
    if (
      this.ink.active ||
      this.parachutes.active ||
      this.maquettes.settling ||
      this.standing.isCarrying ||
      (this.aimRibbon.isFlowing && this.ambience.motion !== 'off') ||
      this.veil.fading ||
      this.sweepMoving(performance.now())
    )
      this.invalidate();
    const now = performance.now();
    this.advanceReplay(now);
    if (this.held !== null && this.rest.due(now)) this.tellRest();
    if (this.ambience.advance(now)) this.demand.request();
    // Un fil affiché coule (tirets, pion qui marche), un anneau bat : une image complète au pas
    // du mouvement, 30 par seconde en actif, 10 en réduit. Onglet caché : rien que le remué.
    const flowing = this.arcs.isFlowing || this.standing.ringing || this.camps.ringing;
    const flowPace = flowPaceOf(this.ambience.motion, this.touch);
    const reason = this.demand.due(
      now,
      document.hidden ? Number.POSITIVE_INFINITY : flowing ? flowPace : HEARTBEAT_MS,
    );
    if (reason === null) return;
    // Close in, the lamp already casts and each frame compiles what it draws.
    if (reason === 'heartbeat' && this.programsStale && !this.lamp.light.castShadow)
      this.warmPrograms();
    const whole = reason !== 'ambient';
    this.ambience.frame();
    // The sun crosses a few degrees a minute at most: the heartbeat is enough, no frame is ever
    // asked for the sky alone, and cut motion keeps it — nothing about it is an animation.
    const distance = this.camera.position.distanceTo(this.controls.target);
    setNearFloor(distance);
    const looked = this.controls.target;
    const instant = this.forcedInstant ?? boardInstant(Date.now(), this.dayCycle);
    const lookedAt = this.frame.lonLatAt(
      looked.x + this.frame.centerX,
      looked.z + this.frame.centerY,
    );
    // The moon lights the pieces and the sheet from where one looks; the band of night
    // (`NightSky`'s veil) tells who sleeps where, per pixel, at every distance (#198).
    const sun = sunLightAt(instant, lookedAt);
    const night = nightOfAltitude(sun.altitude);
    this.night.apply(instant, night);
    if (whole)
      this.night.veil(
        distance > REGIONS_GONE_DISTANCE || !this.fullDayInView(subsolarPoint(instant)),
      );
    // Only on whole frames: the shadow map is redrawn with them, and must fall from the same lamp.
    if (whole) this.lamp.shine(sun, night);
    this.lightCountries();

    // At zoom, the stroke hierarchy flips ink: country borders darken while regions appear
    // beneath. The coast is the one fat stroke, a ribbon with a pixel floor.
    const yaw = cameraYaw(this.camera.position, this.controls.target);
    this.arcs.animate(this.camera, this.unitsPerPixel(distance), yaw);
    this.ink.animate(now, this.unitsPerPixel(distance));
    this.parachutes.animate(now, this.unitsPerPixel(distance));
    // Vingt-cinq kilomètres ne se lisent pas depuis l'orbite : le cercle de contact se retire
    // plutôt que de se poser en point sur le mât qu'il entoure.
    this.reach.animate(this.unitsPerPixel(distance));
    this.ghost.orient(this.camera.position);
    this.tellThread();
    this.sweepWave.animate(now);
    this.basins.animate(now);
    this.tellSweep(now);
    this.standing.orient(this.camera.position);
    const reading = this.standing.reading;
    const tone = this.verdict;
    this.aimRibbon.show(
      reading === null || tone === 'none'
        ? null
        : tone !== 'refused' && this.aimRoute !== null
          ? this.aimRoute
          : [reading.from, reading.to],
      tone === 'none' ? 'order' : tone,
    );
    this.tourInk.animate(this.unitsPerPixel(distance), this.screenHeight);
    this.aimRibbon.animate(
      this.unitsPerPixel(distance),
      this.screenHeight,
      (now - this.lastFrame) / 1000,
      this.ambience.motion !== 'off',
    );
    this.lastFrame = now;
    this.veil.step(now);
    this.maquettes.orient(this.camera.position, this.replay, Date.now());
    this.camps.orient(this.camera.position, yaw);
    this.pins.hold(this.held?.pileId ?? null, this.held === null ? null : this.heldGround);
    this.pins.layout(
      this.eye,
      this.screenWidth,
      this.screenHeight,
      this.arcs.headPositions,
      this.arcs.aheadPositions,
      this.camera.position,
    );
    this.clearReplayGround();
    this.renderer.shadowMap.needsUpdate = whole;
    const shadowed = this.lamp.follow(this.controls.target, distance);
    const pieces = [this.standing.group, this.maquettes.group, this.camps.group, this.arcs.group];
    if (this.replay) pieces.push(this.replay.scene.object);
    if (shadowed && whole) for (const root of pieces) castShadows(root);
    if (whole) {
      // Warm by the same night as the halos, shadows or not: a piece must not keep a stale glow.
      if (night > 0 || this.warmed > 0) for (const root of pieces) warmPieces(root, night);
      this.warmed = night;
      if (night > 0.004) {
        this.halos.begin();
        const lit = (at: Vector3, radius: number, near: number) => this.halos.add(at, radius, near);
        this.standing.lights(lit);
        this.maquettes.lights(lit);
        this.pins.lights(lit, this.unitsPerPixel(distance));
        this.halos.end(night);
      } else this.halos.hide();
    }
    this.regions.animate(distance, this.unitsPerPixel(distance));
    this.sea?.fade(distance);
    const borders = this.sheet.borders.material;
    borders.opacity =
      COUNTRY_BORDER_REST +
      (COUNTRY_BORDER_MAX - COUNTRY_BORDER_REST) *
        Math.min(
          1,
          Math.max(
            0,
            (REGIONS_GONE_DISTANCE - distance) / (REGIONS_GONE_DISTANCE - REGIONS_FULL_DISTANCE),
          ),
        );
    borders.dashSize = COUNTRY_DASH_PX * this.unitsPerPixel(distance);
    borders.gapSize = COUNTRY_GAP_PX * this.unitsPerPixel(distance);
    this.sheet.coast.material.linewidth = coastWidthPx(this.unitsPerPixel(distance));
    const detail = this.nearLevel === null ? 'far' : levelAt(this.detail, distance);
    if (detail !== this.detail) {
      this.detail = detail;
      showLevel(this.sheet, detail === 'near' ? this.nearLevel! : this.farLevel);
      this.regions.showLines(detail);
    }

    this.renderer.render(this.scene, this.eye);
    // The ambience only steps shader uniforms: the labels stand where the last whole frame put them.
    if (!whole) return;
    const projections = this.labels.project(
      this.eye,
      this.screenWidth,
      this.screenHeight,
      this.arcs.headPositions,
      this.camera.position,
    );
    this.onLabels(this.outsideReplay(projections, distance));
    // An arrow at the edge would lead out of a replay the veil does not let one leave.
    this.onEdges(
      this.replay === null
        ? projections
        : projections.map((projection) => ({ ...projection, atEdge: false })),
    );
  };
}

/** The screen's edge, eight points a side, in device coordinates (`fullDayInView`). */
const SCREEN_EDGE: ReadonlyArray<readonly [number, number]> = Array.from(
  { length: 8 },
  (_, k) => -1 + k / 4,
).flatMap((t) => [[t, -1] as const, [1, t] as const, [-t, 1] as const, [-1, -t] as const]);
const BOARD_PLANE = new Plane(new Vector3(0, 1, 0), 0);

const DESK_PIXEL_RATIO = 2;
/** **Au doigt, un pixel et demi par point** (#189) : un téléphone à 3 dessinait la carte en
 *  780×1688 avec MSAA ×4, 1,3 million de pixels à chaque image pour un écran qu'on tient à
 *  bout de bras. À 1,5, 44 % de pixels en moins ; les étiquettes, en HTML, restent nettes, le
 *  trait de côte et les courbes de niveau s'adoucissent à peine. @a-mesurer : le gain réel se lit
 *  au GPU d'un vrai téléphone, que le banc n'a pas. */
const TOUCH_PIXEL_RATIO = 1.5;
/** **Au doigt, une carte d'ombres de 1024** (#199, choix de Pierre du 21/10) : 24 Mo de moins
 *  (couleur et profondeur) pour une ombre portée un peu plus pâle et plus floue, sur un écran
 *  qu'on tient à bout de bras. @a-mesurer */
const TOUCH_SHADOW_MAP = 1024;
const FOG_NEAR = 460;
const FOG_FAR = 950;
/** The driven camera's field: every distance threshold was measured through it. */
const CAMERA_FOV = 42;
/** The prototype's telephoto, through which the board renders (`eye`). */
const EYE_FOV = 30;
const halfTan = (fov: number): number => Math.tan((fov * Math.PI) / 360);
/** How far the eye backs off along the camera's axis to frame the same plane at `EYE_FOV`. */
const EYE_BACKOFF = halfTan(CAMERA_FOV) / halfTan(EYE_FOV);

/** Une marge au-dessus du plancher : la molette s'arrête rarement pile sur `minDistance`. */
const ZOOM_FLOOR_SLACK = 1.15;

type Journey = {
  readonly departure: Vector3;
  readonly arrival: Vector3;
  readonly orientation: Vector3;
  readonly departureDistance: number;
  readonly arrivalDistance: number;
  readonly maxDistanceAtEnd?: number;
  readonly startMs: number;
  /** The eye turns from this one to `orientation` on the way; it keeps `orientation` without. */
  readonly fromOrientation?: Vector3;
  readonly durationMs?: number;
};

type Replay = {
  readonly view: ReplayView;
  readonly scene: ReplayScene;
  /** Where the camera was before the first replay: where `stopReplay` takes it back. */
  readonly saved: { readonly target: Vector3; readonly position: Vector3 };
  readonly center: Vector3;
  readonly reach: number;
  /** Milliseconds into the replay, and the moment it runs to. */
  t: number;
  until: number;
  clock: number;
  step: ReplayStep | null;
  ended: boolean;
  readonly onStep: (step: ReplayStep, ended: boolean) => void;
};

/** The eye's elevation over a replay, and its least distance: the figurines full (`nearWeight`). */
const REPLAY_ELEVATION = (40 * Math.PI) / 180;
const REPLAY_MIN_DISTANCE = 5;

/**
 * Frees one scene node's GPU resources. A material's texture is only released when the
 * material declares owning it: sprite maps come from a module-level cache shared with the
 * next engine, and disposing one here would blank the sprites on the following map.
 */
function disposeNode(node: Object3D): void {
  const holder = node as Partial<Mesh>;
  holder.geometry?.dispose();
  const material = holder.material;
  if (material === undefined) return;
  for (const single of Array.isArray(material) ? material : [material]) {
    if (single.userData.ownsMap === true) {
      (single as MeshStandardMaterial).map?.dispose();
    }
    single.dispose();
  }
}
