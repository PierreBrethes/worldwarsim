import {
  ACESFilmicToneMapping,
  Color,
  Fog,
  MOUSE,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  TOUCH,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Intersection,
  type LineBasicMaterial,
  type LineSegments,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { isTyping } from '@/map/typing';
import {
  CLASSIC_MAPPING,
  buttonAt,
  cleanPressAt,
  type CleanPress,
  dragRoleAt,
  type MouseButton,
  type MouseMapping,
  type MouseRole,
} from '@/domain/mouse-mapping';
import type { LonLat } from '@/domain/geo';
import type { HoveredRegion, RegionIdentity, RegionsData, World } from '@/domain/world';
import {
  buildGrid,
  coastCellsIn,
  isCoastCell,
  isLandCell,
  KM_PER_UNIT,
  type Medium,
  type RouteGrid,
} from '@/domain/routing';
import { PLACING_SNAP_KM } from '@/domain/construction';
import type { ArcView, TroopView } from '@/domain/player-view';
import { FrameDemand } from './frame-demand';
import { setNearFloor } from './figurines/figurine';
import { Ambience } from './ambience';
import { CURRENT_RIBBONS, RibbonLayer, WIND_RIBBONS } from './ribbons';
import {
  DEFAULT_CAMERA_LENS,
  eyeDistanceFactor,
  LENS_FOV,
  type CameraLens,
} from '@/domain/camera-lens';
import { boardInstant, type DayCycle } from '@/domain/daylight';
import { parseFx, type MapMotion } from '@/domain/map-motion';
import { pieceScale } from './piece-scale';
import type { PieceScale } from '@/domain/piece-scale';
import { ArcLayer, ARC_HOVER_THRESHOLD } from './arcs';
import { cameraYaw } from './billboard';
import { edgeSafeTiltAt, steepestTiltAt, tiltShiftOf } from './camera-tilt';
import { castShadows, Lamp } from './lamp';
import { NightSky } from './night';
import { InkLayer } from './ink';
import { ParachuteLayer } from './parachute';
import { TourInk, type TourLoop } from './tour-ink';
import type { InkBurst, StampWords } from '@/domain/ink-bursts';
import { circleAround, ReachRing } from './reach';
import { AimRibbon } from './aim';
import { playTableSound } from '../table-sound';
import type { RingState } from './ink-ring';
import type { Reach } from '@/domain/labels';
import { LabelLayer, type EdgeInsets, type LabelProjection, type NamedAnchor } from './labels';
import { buildCoastalWash } from './coastal-wash';
import { HELD_OPACITY, nationShades, PALETTE } from './palette';
import { buildCountries, coastWidthPx, type CountryMesh } from './countries';
import { buildBoard } from './board';
import { RegionLayer, REGIONS_GONE_DISTANCE, type HeldClaim } from './regions';
import { PlacingGhost } from './placing';
import { snapTo } from '@/domain/construction';
import { COUNTRY_THICKNESS, SEA_LEVEL, WorldFrame, framingDistanceOf } from './frame';
import { SearchAreaLayer, type SearchArea } from './search-area';
import { SeaLayer } from './sea';
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

export type BuiltRegions = {
  readonly regionIds: ReadonlyArray<string>;
  readonly ink: string;
};

/**
 * What picking reports from the acting click — whichever button the player put `act` on
 * (`MouseMapping`). `country` is null on the open sea; `region` is null there too, and
 * everywhere the region layer has faded out — far from the ground, the game aims at a country,
 * up close at a region.
 */
/**
 * **What the held building leaps onto** (ADR 0029): nothing (it stands under the pointer), the
 * nearest quay of the routing grid, or the nearest of a list of points — the free deposits.
 */
export type PlacingMagnet =
  | { readonly kind: 'free' }
  | { readonly kind: 'coast' }
  | { readonly kind: 'points'; readonly points: ReadonlyArray<LonLat> };

/** The point the ghost holds, with what the board knows of it: whose region, and a coast. */
export type PlacingSpot = {
  readonly lonLat: LonLat;
  readonly region: RegionIdentity | null;
  readonly coastal: boolean;
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
/** The far edge is taken this share of its true distance: a margin, not a hair (#131). */
const EDGE_MARGIN = 0.88;
/** Development only: `?heure=2026-01-15T23:00Z` holds the sun at that instant, to judge it now. */
function forcedInstant(search: string): number | null {
  const raw = import.meta.env.DEV ? new URLSearchParams(search).get('heure') : null;
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
};

/**
 * Imperative engine: the scene is built once then driven by calls. No React dependency —
 * that is what keeps three.js on one side and the interface on the other, with a single
 * boundary.
 */
export class MapEngine {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  /**
   * **What renders, as opposed to what is driven** (`camera-lens.ts`). The controls, the
   * distance and every threshold read `camera`; the eye stands on its axis, backed off to frame
   * the same looked-at plane through its own lens. With the game lens it is the camera's twin.
   */
  private readonly eye = new PerspectiveCamera(LENS_FOV.game, 1, 0.5, 3000);
  private lens: CameraLens = DEFAULT_CAMERA_LENS;
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly frame: WorldFrame;
  private readonly lamp: Lamp;
  private readonly night: NightSky;
  private readonly theatreFrame: TheatreFrame;
  private readonly veil: CarryVeil;
  private readonly forcedInstant = forcedInstant(location.search);
  private dayCycle: DayCycle = 'real';
  private readonly sea: SeaLayer | null;
  private readonly arcs: ArcLayer;
  private readonly standing: StandingLayer;
  private readonly maquettes: MaquetteLayer;
  private readonly camps: CampLayer;
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
  private aimedPile: string | null = null;
  private lastFrame = performance.now();
  private readonly searchArea: SearchAreaLayer;
  private readonly labels: LabelLayer;
  private readonly regions: RegionLayer;
  private readonly countries: CountryMesh[];
  private nationInks: ReadonlyMap<string, string> = new Map();
  private sheets: ReadonlyMap<string, string> = new Map();
  /** The sea plane, kept apart from the decor: it is what a ray hits off the coast. */
  private readonly surface: Mesh;
  private readonly borders: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly coast: LineSegments2;
  /** Land and water in one list, allocated once: it is walked on every hover of a placement,
   *  and a fresh array per frame is the kind of garbage a render loop must not make. */
  private readonly aimable: Object3D[];
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
  private building = false;
  private aiming = false;
  /** The building held over the board, `null` when nothing is held. */
  private placing: { readonly sprite: string | null; readonly magnet: PlacingMagnet } | null = null;
  private readonly ghost: PlacingGhost;
  private placingRefused = false;
  /**
   * The routing grid, built on the first placement and kept — 1.33 M cells, the same raster the
   * server routes on (`convex/routes.ts`). Nothing else on the client needs it, so nothing else
   * pays for it: a player who never puts a port down never rasterises a world.
   */
  private routeGrid: RouteGrid | null = null;
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
  /** Ce qui décide si l'image de ce tour de boucle est due — voir `frame-demand.ts`. */
  private readonly demand = new FrameDemand(performance.now());
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
  /** 0..1, told only when it changes. */
  onTiltShift: (strength: number) => void = () => {};
  private released = false;
  private tiltShift = -1;
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
  /** **The right button, pressed while a piece is carried**, takes the gesture back. */
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
  /** A piece in hand, the mouse still `REST_MS` over the board: once per stop. */
  onRest?: (at: PointerStop) => void;
  /** It moved again after `onRest`, or left the board. */
  onRestless?: () => void;

  constructor(
    private readonly container: HTMLElement,
    /** Kept for the one thing that is asked of the world after the board is built: the routing
     *  raster, rasterised on the first placement and never before (`snapFor`). */
    private readonly world: World,
  ) {
    this.frame = new WorldFrame(world);
    this.tourInk = new TourInk(this.frame);

    this.scene.background = new Color(PALETTE.desk);
    this.scene.fog = new Fog(PALETTE.desk, FOG_NEAR, FOG_FAR);

    this.camera = new PerspectiveCamera(LENS_FOV.game, 1, 0.5, 3000);
    this.camera.position.set(30, 250, 300);

    // The stencil serves the coastal wash, whose ribbons overlap: without it, three opens
    // the context without a stencil buffer since r163 and the material would plead in vain.
    this.renderer = new WebGLRenderer({ antialias: true, stencil: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // Redrawn on whole frames only (`FrameDemand`): an ambient step moves no piece.
    this.renderer.shadowMap.autoUpdate = false;
    // Off by default in three: a site under the crane is cut where its work has reached, by a
    // plane on its own materials (`maquettes.ts`).
    this.renderer.localClippingEnabled = true;
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

    this.lamp = new Lamp(this.scene);

    this.sea = this.ambience.enabled('sea') ? new SeaLayer() : null;
    const board = buildBoard(
      world,
      this.frame,
      this.renderer.capabilities.getMaxAnisotropy(),
      this.sea,
    );
    if (this.sea) {
      this.ambience.add(this.sea);
      void this.sea.shore(this.frame, this.world).then((grid) => {
        if (grid) this.routeGrid ??= grid;
        this.invalidate();
      });
    }
    this.surface = board.surface;
    this.night = new NightSky(this.scene, this.frame, board.surface.geometry, this.lamp, this.sea);
    this.theatreFrame = new TheatreFrame(this.scene, board.surface.geometry);
    this.veil = new CarryVeil(this.scene, board.surface.geometry);
    this.surface.receiveShadow = true;
    this.scene.add(board.surface);
    for (const object of board.decor) this.scene.add(object);

    this.scene.add(buildCoastalWash(world, this.frame));

    const { meshes, borders, coast } = buildCountries(world, this.frame);
    this.countries = meshes;
    this.borders = borders;
    this.coast = coast;
    for (const mesh of meshes) {
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    this.scene.add(borders);
    this.scene.add(coast);

    this.aimable = [...this.countries, this.surface];

    if (this.ambience.enabled('sea')) {
      this.ambience.add(
        new RibbonLayer(this.scene, this.eye, this.renderer, this.frame, {
          ...CURRENT_RIBBONS,
          // Until the surf's grid lands, no current is born: building it here would cost a
          // second copy of the same raster on the first ambient step.
          afloat: (lonLat) => this.routeGrid !== null && !this.landAt(lonLat),
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
    this.searchArea = new SearchAreaLayer(this.frame);
    this.ghost = new PlacingGhost(this.frame);
    this.standing = new StandingLayer(
      this.frame,
      () => this.invalidate(),
      (id) => this.maquettes.garrisonAt(id),
      (lonLat) => this.seawardOf(lonLat),
    );
    this.ambience.add(this.standing.smoke);
    this.scene.add(this.arcs.group);
    this.scene.add(this.standing.group);
    this.maquettes = new MaquetteLayer(
      this.frame,
      (regionId) => this.regions.anchorOf(regionId),
      () => this.invalidate(),
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
    this.scene.add(this.ink.group);
    this.parachutes = new ParachuteLayer(this.frame);
    this.scene.add(this.parachutes.group);
    this.scene.add(this.reach.object);
    this.scene.add(this.aimRibbon.group);
    this.scene.add(this.tourInk.group);
    this.standing.elsewhere = (id) => this.camps.positionOf(id);
    this.scene.add(this.searchArea.object);
    this.scene.add(this.ghost.object);

    this.regions = new RegionLayer(this.frame, (sheets) => {
      this.sheets = sheets;
      this.paintCountries();
    });
    this.labels = new LabelLayer(
      this.frame,
      (regionId) => this.regions.anchorOf(regionId),
      () => (this.regions.isActive ? this.regions.fade : 0),
      (id) =>
        this.standing.isDressed(id) || this.camps.isDressed(id) || this.maquettes.isDressed(id),
      (id) => this.maquettes.drawnAt(id),
    );

    this.scene.add(this.regions.lines);
    this.scene.add(this.regions.held);
    this.scene.add(this.regions.built);
    this.scene.add(this.regions.hoverOutline);
    this.scene.add(this.regions.terrain.group);

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
   * indicateurs de bord) l'appelle après chaque rendu : ses nœuds naissent cachés et c'est la
   * prochaine image qui les place.
   */
  invalidate(): void {
    this.demand.stir(performance.now());
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
    if (this.veil.needsGround)
      this.veil.ground((this.routeGrid ??= buildGrid(this.world)), this.frame);
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
      this.standing.setRings(rings);
      return;
    }
    for (const id of this.available) rings.set(id, 'avail');
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
    const ground = this.ray.intersectObjects(this.aimable, false)[0]?.point;
    if (ground !== undefined) this.standing.setDown(ground);
  }

  /** The enemy's surveyed camps, annotated in ink up close (F2, ADR 0026 §4 révisé). */
  displayCamps(camps: ReadonlyArray<SurveyedCamp>): void {
    this.invalidate();
    this.camps.display(camps);
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

  displayRegions(data: RegionsData): void {
    this.invalidate();
    this.regions.display(data);
    // The 500 KB land half a second after the board, so the buildings are asked for before
    // the ground that carries them: a region anchor has no position until now, and without
    // this their labels would never find their footing.
    this.labels.rebuild();
    this.maquettes.rebuild();
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
    const orientation = this.leanedAt(
      this.camera.position.clone().sub(this.controls.target).normalize(),
      arrival,
      arrivalDistance,
    );

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
    return (this.aimAt(clientX, clientY)?.object as CountryMesh | undefined)?.userData.adm0 ?? null;
  }

  /**
   * **The place under a screen point, at every scale and over water too.** The ray is given the
   * sea as well as the land, because a point aimed at the open sea is a legal destination and a
   * ray that only knew the continents would answer nothing there (ADR 0019 §1).
   */
  pointAt(clientX: number, clientY: number): LonLat | null {
    const hit = this.aimAt(clientX, clientY, true)?.point;
    if (hit === undefined) return null;
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
   * The region under a lon/lat, by the same pick as the hover — enclave first — so a pile's
   * cartouche and the hover card can never name two regions for one spot. `null` until the
   * layer has landed, and wherever no region lies.
   */
  regionAtLonLat(lonLat: LonLat): RegionIdentity | null {
    const point = this.frame.projectLonLat(lonLat);
    return this.regions.regionAt(point.x + this.frame.centerX, point.z + this.frame.centerY);
  }

  private aimAt(clientX: number, clientY: number, includeSea = false): Intersection | undefined {
    if (!this.castAt(clientX, clientY)) return undefined;
    return this.ray.intersectObjects(includeSea ? this.aimable : this.countries, false)[0];
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
   * A country carries a nation's ink because a player reserved it, never because it is
   * named like it: the map receives the holders' table, it does not deduce it. Everything
   * absent from it returns to neutral land — resetting the table is enough to undo.
   */
  colorNations(inkByCountry: ReadonlyMap<string, string>): void {
    this.invalidate();
    this.nationInks = inkByCountry;
    this.paintCountries();
  }

  /** A sheet painted whole takes the holder's lavis — over the paper, never over another ink. */
  private paintCountries(): void {
    const grounds = new Map<string, string>();
    for (const mesh of this.countries) {
      const sheet = this.sheets.get(mesh.userData.adm0);
      const nation = this.nationInks.get(mesh.userData.name);
      if (sheet === undefined && nation !== undefined) grounds.set(mesh.userData.adm0, nation);
      const ink = sheet ?? nation;
      mesh.material.color.set(ink === undefined ? PALETTE.neutralLand : nationShades(ink).sheet);
      mesh.userData.pencil.value = sheet === undefined ? 1 : 1 - HELD_OPACITY;
    }
    this.regions.setGrounds(grounds);
  }

  /**
   * The regions that carry one of the player's buildings, inked denser than his country. The
   * set may arrive before the regions themselves — the layer keeps it and lays it down when
   * the 500 KB land.
   */
  showBuiltRegions(built: BuiltRegions): void {
    this.invalidate();
    this.regions.showBuilt(new Set(built.regionIds), built.ink);
  }

  /**
   * **Qui tient quelles régions** (ADR 0020 §1). La teinte reste au loin quand les frontières
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
    this.coast.material.resolution.set(clientWidth, clientHeight);
    this.screenWidth = clientWidth;
    this.screenHeight = clientHeight;
    this.arcs.resize(clientWidth, clientHeight);
    this.ink.resize(clientWidth, clientHeight);
    this.regions.resize(clientWidth, clientHeight);
    this.regions.terrain.resize(clientWidth, clientHeight);
    this.reach.resize(clientWidth, clientHeight);
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
    this.aimRibbon.dispose();
    this.tourInk.dispose();
    this.searchArea.dispose();
    this.ghost.dispose();
    this.standing.dispose();
    this.maquettes.dispose();
    this.camps.dispose();
    this.replay?.scene.dispose();
    this.arcs.dispose();
    this.ink.dispose();
    this.parachutes.dispose();
    this.regions.dispose();
    this.sea?.dispose();
    this.veil.dispose();
    this.scene.traverse(disposeNode);
    this.scene.clear();

    this.controls.dispose();
    this.renderer.dispose();
    // Without this, the browser keeps the context alive until it garbage-collects the
    // canvas, and a page that rebuilds the map a few times hits the context limit.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private wireInputs(): void {
    const canvas = this.renderer.domElement;
    this.controls.addEventListener('start', () => {
      this.released = true;
    });
    this.controls.addEventListener('change', () => {
      this.invalidate();
      this.hoverDirty = true;
      this.postponeRest();
      // The ground slid under a still pointer: the stop it was on is not the same place.
      if (this.pointer.x !== -2) this.pointerMoved();
    });
    canvas.addEventListener('pointermove', (event) => {
      if (this.gesture?.carrying === true) return;
      this.fingerOnBoard = event.pointerType === 'touch';
      this.aimPointer(event.clientX, event.clientY);
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
    });
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
      this.armCarry(this.gesture, event, () => {
        if (!this.castAt(event.clientX, event.clientY)) return null;
        const pick = this.pieceToTake();
        return pick === null || pick.carried ? null : { kind: 'canvas', pick };
      });
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
  }

  private trackGesture = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (gesture === null || event.pointerId !== gesture.pointerId) return;
    gesture.traveledPx += Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    gesture.x = event.clientX;
    gesture.y = event.clientY;
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
    const ground = this.ray.intersectObjects(this.aimable, false)[0]?.point;
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
    // A press hides the piece under the pointer: released, it is there again.
    this.hoverDirty = true;
    this.applyMapping();
    this.refreshCursor();
    if (gesture === null) return;
    if (gesture.carrying) {
      this.carriedAt = performance.now();
      this.tellCarryOver(null, event.clientX, event.clientY);
      if (event.type === 'pointerup') this.dropCarried(event);
      this.onCarryEnd?.();
      return;
    }
    if (event.type !== 'pointerup' || gesture.fromLabel) return;
    if (gesture.panning || gesture.pastThreshold) return;
    const press = cleanPressAt(
      this.mapping,
      gesture.pointerType,
      gesture.index,
      this.held !== null,
    );
    // A finger has no hover to read from: the board is aimed where it lifted, now, so the
    // ghost of a placement and the country under it answer for this point and not the last.
    if (this.fingerOnBoard) {
      this.aimPointer(event.clientX, event.clientY);
      this.hoverDirty = false;
      this.updateHover();
    }
    if (press.picks && this.pickAt(event, gesture.single === true)) return;
    if (this.pressPiece(event, press)) return;
    if (press.reads) this.readAt();
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
    const labelId = this.pieceUnder()?.id;
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
      ? null
      : screenRect(box, this.eye, this.screenWidth, this.screenHeight);
  }

  /** Every piece the canvas draws, nearest first: they stand in front of the regions they are on. */
  private pieceUnder(): PieceHit | null {
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

  private aimPointer(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerScreen.x = clientX - rect.left;
    this.pointerScreen.y = clientY - rect.top;
    this.pointer.x = (this.pointerScreen.x / rect.width) * 2 - 1;
    this.pointer.y = -(this.pointerScreen.y / rect.height) * 2 + 1;
    this.hoverDirty = true;
  }

  setCameraLens(lens: CameraLens): void {
    this.invalidate();
    this.lens = lens;
    this.eye.fov = LENS_FOV[lens];
    this.eye.updateProjectionMatrix();
    this.renderer.toneMapping = lens === 'poc' ? ACESFilmicToneMapping : NoToneMapping;
    this.renderer.toneMappingExposure = lens === 'poc' ? POC_EXPOSURE : 1;
    const fog = this.scene.fog as Fog;
    fog.near = FOG_NEAR * eyeDistanceFactor(lens);
    fog.far = FOG_FAR * eyeDistanceFactor(lens);
    this.syncEye();
  }

  private syncEye(): PerspectiveCamera {
    const target = this.controls.target;
    this.eye.position
      .subVectors(this.camera.position, target)
      .multiplyScalar(eyeDistanceFactor(this.lens))
      .add(target);
    this.eye.quaternion.copy(this.camera.quaternion);
    this.eye.updateMatrixWorld();
    return this.eye;
  }

  setDayCycle(cycle: DayCycle): void {
    this.invalidate();
    this.dayCycle = cycle;
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
    this.regions.terrain.motion = motion;
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
    else if (this.building) style.cursor = TROWEL_CURSOR;
    else if (this.held !== null) style.cursor = HOLDING_CURSOR;
    else if (this.aiming) style.cursor = AIM_CURSOR;
    else if (this.hoveredPiece !== null) style.cursor = this.hoveredPiece;
    else style.cursor = '';
  }

  /** The board wears the trowel while a construction panel is open, and only then. */
  setBuilding(building: boolean): void {
    this.invalidate();
    if (building === this.building) return;
    this.building = building;
    this.refreshCursor();
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
    this.refreshCursor();
  }

  /**
   * **The board is holding a building, and the next left click puts it down** (ADR 0029). The
   * ghost follows the pointer anywhere; its magnet, when it has one, makes it leap onto a quay of
   * the routing grid (`isCoastCell`, the very function the server refuses with) or onto one of a
   * list of points — the free deposits. What the point is worth is not decided here: the board
   * reads it off `onPlacingAim`, through the placement rule.
   */
  setPlacing(
    placing: { readonly sprite: string | null; readonly magnet: PlacingMagnet } | null,
  ): void {
    this.invalidate();
    if (placing === this.placing) return;
    this.placing = placing;
    if (placing === null) {
      this.ghost.disarm();
      this.onPlacingAim(null);
      this.refreshCursor();
      return;
    }
    this.ghost.arm(placing.sprite, (pointer) => this.snapFor(placing.magnet, pointer));
    this.hoverDirty = true;
    this.refreshCursor();
  }

  private snapFor(magnet: PlacingMagnet, pointer: LonLat): LonLat {
    if (magnet.kind === 'free') return pointer;
    if (magnet.kind === 'points') return snapTo(pointer, magnet.points);
    this.routeGrid ??= buildGrid(this.world);
    const at = this.frame.projectLonLat(pointer);
    const [x, y] = [at.x + this.frame.centerX, at.z + this.frame.centerY];
    const reach = PLACING_SNAP_KM / KM_PER_UNIT;
    const quays = coastCellsIn(this.routeGrid, [x - reach, y - reach, x + reach, y + reach]);
    return snapTo(
      pointer,
      quays.map((quay) => quay.lonLat),
    );
  }

  private placingSpotAt(lonLat: LonLat): PlacingSpot {
    return { lonLat, region: this.regionAtLonLat(lonLat), coastal: this.coastAt(lonLat) };
  }

  /**
   * **Cette cellule est-elle une côte ?** La même lecture que le serveur refuse avec
   * (`coastAtPoint`), sur la même grille : ce que la visée offre au clic droit et ce que la
   * mutation accepte sortent d'une seule fonction (ADR 0015). La grille se bâtit à la première
   * question et se garde ensuite, comme pour la pose d'un port.
   */
  coastAt(lonLat: LonLat): boolean {
    this.routeGrid ??= buildGrid(this.world);
    return isCoastCell(this.routeGrid, lonLat);
  }

  landAt(lonLat: LonLat): boolean {
    this.routeGrid ??= buildGrid(this.world);
    return isLandCell(this.routeGrid, lonLat);
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
      this.released = true;
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
    const hit = onScreen ? this.ray.intersectObjects(this.countries, false)[0] : undefined;
    const touched = hit?.object as CountryMesh | undefined;
    const pointing =
      onScreen && !this.fingerOnBoard && this.gesture === null && this.placing === null;
    const label = pointing ? (this.pieceUnder()?.id ?? null) : null;
    if (label !== this.hoveredLabel) {
      this.hoveredLabel = label;
      this.onPieceHover?.(label);
    }

    // The piece stands in front of its region: the region is not what the pointer is on.
    if (!this.fingerOnBoard || this.regionTapped) {
      this.regionTapped = false;
      this.updateRegionHover(label === null ? (hit?.point ?? null) : null);
    }

    const take = !this.fingerOnBoard && onScreen ? this.pieceToTake() : null;
    const piece = take !== null ? PIECE_CURSOR : label !== null ? 'pointer' : null;
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
      const ground =
        onScreen && !this.fingerOnBoard
          ? this.ray.intersectObjects(this.aimable, false)[0]?.point
          : undefined;
      this.standing.carryTo(ground ?? null);
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
      const board = onScreen ? this.ray.intersectObjects(this.aimable, false)[0]?.point : undefined;
      this.ghost.aimAt(
        board === undefined ? null : board.x + this.frame.centerX,
        board === undefined ? null : board.z + this.frame.centerY,
      );
      const after = this.ghost.spot;
      if (after !== null && after !== before) {
        if (before === null) this.refreshCursor();
        this.onPlacingAim(this.placingSpotAt(after));
      }
    }

    this.hovered = touched ?? null;
    const adm0 =
      this.fingerOnBoard || label !== null ? null : (this.hovered?.userData.adm0 ?? null);
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
   * The steepest tilt the eye may take at `distance` from `target`, looking along `orientation`
   * (the offset from the target to the eye): the distance's ceiling, lowered so the board's far
   * edge stays out of the picture (#131). The edge is the board's rectangle along the way the eye
   * looks; the upright stays allowed, as ever.
   */
  private tiltCeilingAt(target: Vector3, orientation: Vector3, distance: number): number {
    const edge = this.edgeAhead(target, orientation);
    return Math.max(
      this.controls.minPolarAngle,
      Math.min(
        steepestTiltAt(distance),
        edgeSafeTiltAt(distance, this.camera.fov, edge * EDGE_MARGIN),
      ),
    );
  }

  /** How far the board runs beyond `target`, along the way the eye looks (`orientation` is the
   *  offset from the target to the eye): its rectangle, the nearest side ahead. */
  private edgeAhead(target: Vector3, orientation: Vector3): number {
    const flat = Math.hypot(orientation.x, orientation.z);
    let edge = Infinity;
    if (flat < 1e-6) return edge;
    const sides: Array<[number, number, number]> = [
      [target.x, -orientation.x / flat, this.frame.width / 2],
      [target.z, -orientation.z / flat, this.frame.height / 2],
    ];
    for (const [at, step, half] of sides) {
      if (Math.abs(step) < 1e-6) continue;
      edge = Math.min(edge, Math.max(0, ((step > 0 ? half : -half) - at) / step));
    }
    return edge;
  }

  /**
   * Where even the upright sees past the far edge (the world view, the target far from the
   * middle), the target slides back toward the middle of the board — never past it — until the
   * desk is a frame all round rather than a band on one side (#131).
   */
  private pullTargetFromEdge(): void {
    const target = this.controls.target;
    const eye = this.camera.position.clone().sub(target);
    const distance = eye.length();
    const half = (this.camera.fov * Math.PI) / 360;
    const reach = Math.cos(this.controls.getPolarAngle() + half);
    const need = reach <= 0.05 ? Infinity : (distance * Math.sin(half)) / reach;
    const edge = this.edgeAhead(target, eye) * EDGE_MARGIN;
    const flat = Math.hypot(eye.x, eye.z);
    if (edge >= need || flat < 1e-6) return;
    const ahead = new Vector3(-eye.x / flat, 0, -eye.z / flat);
    const toMiddle = Math.max(0, target.dot(ahead));
    const slide = ahead.multiplyScalar(-Math.min(need - edge, toMiddle));
    target.add(slide);
    this.camera.position.add(slide);
  }

  /** A journey arrives at the tilt the board allows there: otherwise the first frame after it
   *  would snap the eye down by whatever the arrival let through. */
  private leanedAt(orientation: Vector3, target: Vector3, distance: number): Vector3 {
    const ceiling = this.tiltCeilingAt(target, orientation, distance);
    const flat = Math.hypot(orientation.x, orientation.z);
    if (Math.acos(Math.min(1, orientation.y)) <= ceiling || flat < 1e-6) return orientation;
    return new Vector3(
      (orientation.x / flat) * Math.sin(ceiling),
      Math.cos(ceiling),
      (orientation.z / flat) * Math.sin(ceiling),
    );
  }

  private loop = (): void => {
    this.animation = requestAnimationFrame(this.loop);
    this.animateJourney();
    // The ceiling holds from the first journey's end or the first gesture: the opening starts
    // further out than the orbit allows, and a ceiling there would stand the eye upright for
    // every journey after it. A journey is programmatic and arrives at its own ceiling.
    const settled = this.released && this.journey === null;
    if (settled) this.pullTargetFromEdge();
    const eye = this.camera.position.clone().sub(this.controls.target);
    this.controls.maxPolarAngle = settled
      ? this.tiltCeilingAt(this.controls.target, eye, eye.length())
      : steepestTiltAt(eye.length());
    this.controls.update();
    this.syncEye();
    if (this.hoverDirty) {
      // Le survol change ce qui s'allume.
      this.invalidate();
      this.hoverDirty = false;
      this.updateHover();
    }
    // Un fil affiché coule : ses tirets dérivent et son pion marche, à chaque image — et la plume
    // trace le terrain survolé tant qu'elle n'a pas fini.
    if (
      this.arcs.isFlowing ||
      this.ink.active ||
      this.parachutes.active ||
      this.maquettes.settling ||
      this.regions.terrain.active ||
      this.standing.isCarrying ||
      this.standing.ringing ||
      this.camps.ringing ||
      (this.aimRibbon.isFlowing && this.ambience.motion !== 'off') ||
      this.veil.fading
    )
      this.invalidate();
    const now = performance.now();
    this.advanceReplay(now);
    if (this.held !== null && this.rest.due(now)) this.tellRest();
    if (this.ambience.advance(now)) this.demand.request();
    const reason = this.demand.due(now);
    if (reason === null) return;
    const whole = reason !== 'ambient';
    this.ambience.frame();
    // The sun crosses a quarter degree a minute: the heartbeat is enough, no frame is ever asked
    // for the sky alone, and cut motion keeps it — nothing about it is an animation.
    const distance = this.camera.position.distanceTo(this.controls.target);
    setNearFloor(distance);
    const looked = this.controls.target;
    this.night.apply(
      this.forcedInstant ?? boardInstant(Date.now(), this.dayCycle),
      this.frame.lonLatAt(looked.x + this.frame.centerX, looked.z + this.frame.centerY),
      distance,
    );
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
    this.clearReplayGround();
    this.renderer.shadowMap.needsUpdate = whole;
    if (this.lamp.follow(this.controls.target, distance) && whole) {
      for (const root of [
        this.standing.group,
        this.maquettes.group,
        this.camps.group,
        this.arcs.group,
      ])
        castShadows(root);
      if (this.replay) castShadows(this.replay.scene.object);
    }
    this.regions.animate(distance, now, this.unitsPerPixel(distance));
    this.sea?.fade(distance);
    this.borders.material.opacity =
      distance < REGIONS_GONE_DISTANCE
        ? Math.min(0.95, 0.62 + (REGIONS_GONE_DISTANCE - distance) * 0.007)
        : 0.62;
    this.coast.material.linewidth = coastWidthPx(this.unitsPerPixel(distance));

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
    const tilt =
      this.ambience.motion === 'off'
        ? 0
        : Math.round(tiltShiftOf(this.controls.getPolarAngle(), distance) * 50) / 50;
    if (tilt !== this.tiltShift) {
      this.tiltShift = tilt;
      this.onTiltShift(tilt);
    }
    this.onLabels(this.outsideReplay(projections, distance));
    // An arrow at the edge would lead out of a replay the veil does not let one leave.
    this.onEdges(
      this.replay === null
        ? projections
        : projections.map((projection) => ({ ...projection, atEdge: false })),
    );
  };
}

const FOG_NEAR = 460;
const FOG_FAR = 950;
/** The prototype's exposure under ACES (P:456). */
const POC_EXPOSURE = 1.05;

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
