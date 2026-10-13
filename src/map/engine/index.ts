import {
  Color,
  Fog,
  MOUSE,
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
import { isTyping } from '@/map/typing';
import {
  DEFAULT_MOUSE_MAPPING,
  buttonAt,
  cleanPressAt,
  dragRoleAt,
  type MouseButton,
  type MouseMapping,
  type MouseRole,
} from '@/domain/mouse-mapping';
import type { LonLat } from '@/domain/geo';
import type { HoveredRegion, RegionIdentity, RegionsData, World } from '@/domain/world';
import { buildGrid, coastCellsIn, isCoastCell, isLandCell, type RouteGrid } from '@/domain/routing';
import type { ArcView, TroopView } from '@/domain/player-view';
import { FrameDemand } from './frame-demand';
import { Ambience } from './ambience';
import { CURRENT_RIBBONS, RibbonLayer, WIND_RIBBONS } from './ribbons';
import { parseFx, type MapMotion } from '@/domain/map-motion';
import { ArcLayer, ARC_HOVER_THRESHOLD } from './arcs';
import { cameraYaw } from './billboard';
import { steepestTiltAt } from './camera-tilt';
import { castShadows, Lamp } from './lamp';
import { NightSky } from './night';
import { nightAt } from '@/domain/daylight';
import { InkLayer } from './ink';
import type { InkBurst } from '@/domain/ink-bursts';
import { circleAround, ReachRing } from './reach';
import type { Reach } from '@/domain/labels';
import { LabelLayer, type LabelProjection, type NamedAnchor } from './labels';
import { buildCoastalWash } from './coastal-wash';
import { PALETTE } from './palette';
import { buildCountries, type CountryMesh } from './countries';
import { buildBoard } from './board';
import { RegionLayer, REGIONS_GONE_DISTANCE, type HeldClaim } from './regions';
import { PlacingGhost, type CoastSpot } from './placing';
import { COUNTRY_THICKNESS, SEA_LEVEL, WorldFrame } from './frame';
import { SearchAreaLayer, type SearchArea } from './search-area';
import { SeaLayer } from './sea';
import { StandingLayer, type CounterTexts, type PieceHold, type StandingPile } from './standing';
import { PointerRest } from './pointer-rest';
import { CampLayer, type SurveyedCamp } from './blocks';
import { ReplayScene, replayReach } from './replay';
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
export type { CounterTexts, PieceHold, StandingPile } from './standing';
export type { SurveyedCamp } from './blocks';

/**
 * What the player has raised, and the ink to draw it in. **Only ever his own**: `PlayerView`
 * carries no opposing building, so the map has nothing to filter — the fog holds on the shape
 * of the served data, not on a display test (ADR 0005).
 */
export type { HeldClaim } from './regions';

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
export type MapActClick = {
  country: string | null;
  region: RegionIdentity | null;
  /** The place itself, land or water — `null` only when the ray leaves the board entirely. */
  point: LonLat | null;
  clientX: number;
  clientY: number;
};

/** A clean press that took one of my pieces (`MapEngine.onPieceClick`). */
export type PieceClick = PieceHold & {
  /** Maj + clic adds a group of the same pile (ADR 0026 §6). */
  shift: boolean;
  clientX: number;
  clientY: number;
};

/** Where a held piece's pointer stopped: what `onAct` gets, and the DOM label it stopped on —
 *  the canvas does not see under a label, so the point may be missing there. */
export type PointerStop = MapActClick & { labelId: string | null };

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
/** Development only: `?nuit=0.8` holds the sky at that share of night, to look at it now. */
function forcedNight(search: string): number | null {
  const raw = import.meta.env.DEV ? new URLSearchParams(search).get('nuit') : null;
  return raw === null ? null : Number(raw);
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
};

/**
 * Imperative engine: the scene is built once then driven by calls. No React dependency —
 * that is what keeps three.js on one side and the interface on the other, with a single
 * boundary.
 */
export class MapEngine {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly frame: WorldFrame;
  private readonly lamp: Lamp;
  private readonly night: NightSky;
  private readonly forcedNight = forcedNight(location.search);
  private readonly sea: SeaLayer | null;
  private readonly arcs: ArcLayer;
  private readonly standing: StandingLayer;
  private readonly camps: CampLayer;
  private readonly ink: InkLayer;
  private readonly reach: ReachRing;
  private readonly searchArea: SearchAreaLayer;
  private readonly labels: LabelLayer;
  private readonly regions: RegionLayer;
  private readonly countries: CountryMesh[];
  /** The sea plane, kept apart from the decor: it is what a ray hits off the coast. */
  private readonly surface: Mesh;
  private readonly borders: LineSegments<BufferGeometry, LineBasicMaterial>;
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
  private mapping: MouseMapping = DEFAULT_MOUSE_MAPPING;
  private spaceHeld = false;
  private building = false;
  private aiming = false;
  private designating = false;
  /** The region a building is being placed on, `null` when nothing is held. */
  private placing: string | null = null;
  private readonly ghost: PlacingGhost;
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
   * A clean left click while the board is **designating** — a mobilisation key is armed and
   * the next click names the ground it goes down on. It replaces the selection rather than
   * doubling it: a click that both places a foundry and re-frames the country would answer
   * two questions where the player asked one.
   */
  onRegionClick: (regionId: string | null) => void = () => {};
  /**
   * A clean left click while a building is held: the coast point it snapped onto. Like
   * `onRegionClick`, it replaces the selection rather than doubling it — one click, one answer.
   */
  onPlacePoint: (point: LonLat) => void = () => {};
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
  private hoveredArc: string | null = null;
  /** The piece in hand, `null` when nothing is held (ADR 0026 §6). */
  private held: PieceHold | null = null;
  private hoveredPiece = false;
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
  /** A piece in hand, the mouse still `REST_MS` over the board: once per stop. */
  onRest?: (at: PointerStop) => void;
  /** It moved again after `onRest`, or left the board. */
  onRestless?: () => void;

  constructor(
    private readonly container: HTMLElement,
    /** Kept for the one thing that is asked of the world after the board is built: the routing
     *  raster, rasterised on the first placement and never before (`coastOfRegion`). */
    private readonly world: World,
  ) {
    this.frame = new WorldFrame(world);

    this.scene.background = new Color(PALETTE.desk);
    this.scene.fog = new Fog(PALETTE.desk, 460, 950);

    this.camera = new PerspectiveCamera(42, 1, 0.5, 3000);
    this.camera.position.set(30, 250, 300);

    // The stencil serves the coastal wash, whose ribbons overlap: without it, three opens
    // the context without a stencil buffer since r163 and the material would plead in vain.
    this.renderer = new WebGLRenderer({ antialias: true, stencil: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
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
    this.night = new NightSky(this.scene, this.frame, this.lamp, this.sea);
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
    this.surface.receiveShadow = true;
    this.scene.add(board.surface);
    for (const object of board.decor) this.scene.add(object);

    this.scene.add(buildCoastalWash(world, this.frame));

    const { meshes, borders } = buildCountries(world, this.frame);
    this.countries = meshes;
    this.borders = borders;
    for (const mesh of meshes) {
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    this.scene.add(borders);

    this.aimable = [...this.countries, this.surface];

    if (this.ambience.enabled('sea')) {
      this.ambience.add(
        new RibbonLayer(this.scene, this.camera, this.renderer, this.frame, {
          ...CURRENT_RIBBONS,
          // Until the surf's grid lands, no current is born: building it here would cost a
          // second copy of the same raster on the first ambient step.
          afloat: (lonLat) => this.routeGrid !== null && !this.landAt(lonLat),
        }),
      );
    }
    if (this.ambience.enabled('wind')) {
      this.ambience.add(
        new RibbonLayer(this.scene, this.camera, this.renderer, this.frame, WIND_RIBBONS),
      );
    }
    this.ink = new InkLayer(this.frame, this.ambience.enabled('ink'));
    this.arcs = new ArcLayer(this.frame, this.ink);
    this.reach = new ReachRing(this.frame);
    this.searchArea = new SearchAreaLayer(this.frame);
    this.ghost = new PlacingGhost(this.frame);
    this.standing = new StandingLayer(this.frame, () => this.invalidate());
    this.ambience.add(this.standing.smoke);
    this.scene.add(this.arcs.group);
    this.scene.add(this.standing.group);
    this.camps = new CampLayer(this.frame);
    this.scene.add(this.camps.group);
    this.scene.add(this.ink.group);
    this.scene.add(this.reach.object);
    this.scene.add(this.searchArea.object);
    this.scene.add(this.ghost.object);

    this.regions = new RegionLayer(this.frame);
    this.labels = new LabelLayer(
      this.frame,
      (regionId) => this.regions.anchorOf(regionId),
      () => (this.regions.isActive ? this.regions.fade : 0),
      (id) => this.standing.isDressed(id) || this.camps.isDressed(id),
    );

    this.scene.add(this.regions.lines);
    this.scene.add(this.regions.held);
    this.scene.add(this.regions.built);
    this.scene.add(this.regions.designated);
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
    this.ink.burst(burst, performance.now());
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
  displayStanding(piles: ReadonlyArray<StandingPile>, texts: CounterTexts): void {
    this.invalidate();
    this.standing.display(piles, texts);
  }

  /**
   * **Lifts a piece, or puts it back with `null`** (ADR 0026 §6). The original washes out where
   * it stands; a copy of the held groups follows the ground under the mouse, and the
   * cursor closes — the cursor alone when the pile is not dressed. Pointer stops are
   * told through `onRest` from the first move on; the clean left press then puts down
   * (`onAct`) rather than reads.
   */
  holdPiece(held: PieceHold | null): void {
    this.invalidate();
    this.held = held;
    this.standing.hold(held);
    // Another piece, or none: the route told for the last stop is not this one's.
    if (this.rest.stop()) this.onRestless?.();
    this.hoverDirty = true;
    this.refreshCursor();
  }

  /** The enemy's surveyed camps, in blocks seen from behind up close (ADR 0026 §4). */
  displayCamps(camps: ReadonlyArray<SurveyedCamp>): void {
    this.invalidate();
    this.camps.display(camps, performance.now());
  }

  setLabelAnchors(anchors: ReadonlyArray<NamedAnchor>): void {
    this.invalidate();
    this.labels.setAnchors(anchors);
    // The label set changed: the overlap degradation must be redone, but not before the
    // loop has laid the new positions — the camera rest serves that too.
    this.postponeRest();
  }

  displayRegions(data: RegionsData): void {
    this.invalidate();
    this.regions.display(data);
    // The 500 KB land half a second after the board, so the buildings are asked for before
    // the ground that carries them: a region anchor has no position until now, and without
    // this their labels would never find their footing.
    this.labels.rebuild();
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
   * there, my figurines and the enemy's blocks are set down face to face, and the steps of
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
    // Fitted to the height left above `below`, and to the width on a portrait screen.
    const aspect = this.screenWidth / this.screenHeight;
    const distance = Math.max(
      REPLAY_MIN_DISTANCE,
      replayReach(view) * 2.2 * Math.max(1 / (1 - below), 1 / Math.min(1, aspect)),
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
    );
    scene.object.position.copy(center);
    scene.object.rotation.y = Math.atan2(tilted.x, tilted.z);
    this.scene.add(scene.object);
    this.replay = {
      view,
      scene,
      saved,
      center,
      reach: replayReach(view),
      t: 0,
      until: REPLAY_MS,
      clock: performance.now(),
      step: null,
      ended: false,
      onStep,
    };
    this.travel(aim, tilted, distance, stepBounds('voyage').end - stepBounds('voyage').start);
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
    /** Une distance demandée : la seule façon de rapprocher la caméra, pour un lieu à regarder. */
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
    const framing = radius / Math.tan((this.camera.fov * Math.PI) / 360);
    const orientation = this.camera.position.clone().sub(this.controls.target).normalize();
    const arrivalDistance = Math.min(
      this.controls.maxDistance,
      Math.max(distance ?? currentDistance, framing, this.controls.minDistance),
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
    this.ray.setFromCamera(this.aim, this.camera);
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
    for (const mesh of this.countries) {
      mesh.material.color.set(inkByCountry.get(mesh.userData.name) ?? PALETTE.neutralLand);
    }
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

  /** The ground an armed key accepts, as the domain computed it — see `RegionLayer.showDesignated`. */
  showDesignatedRegions(regionIds: ReadonlyArray<string>): void {
    this.invalidate();
    this.regions.showDesignated(new Set(regionIds));
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
    this.renderer.setSize(clientWidth, clientHeight);
    this.screenWidth = clientWidth;
    this.screenHeight = clientHeight;
    this.arcs.resize(clientWidth, clientHeight);
    this.ink.resize(clientWidth, clientHeight);
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
    cancelAnimationFrame(this.animation);
    if (this.restTimer !== null) clearTimeout(this.restTimer);
    removeEventListener('pointermove', this.trackGesture);
    removeEventListener('pointerup', this.endGesture);
    removeEventListener('pointercancel', this.endGesture);
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('blur', this.onFocusLost);

    this.reach.dispose();
    this.searchArea.dispose();
    this.ghost.dispose();
    this.standing.dispose();
    this.camps.dispose();
    this.replay?.scene.dispose();
    this.arcs.dispose();
    this.ink.dispose();
    this.regions.dispose();
    this.sea?.dispose();
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
    this.controls.addEventListener('change', () => {
      this.invalidate();
      this.hoverDirty = true;
      this.postponeRest();
      // The ground slid under a still pointer: the stop it was on is not the same place.
      if (this.pointer.x !== -2) this.pointerMoved();
    });
    canvas.addEventListener('pointermove', (event) => {
      this.fingerOnBoard = event.pointerType === 'touch';
      this.aimPointer(event.clientX, event.clientY);
      this.lastPointer.clientX = event.clientX;
      this.lastPointer.clientY = event.clientY;
      this.restLabel = null;
      if (!this.fingerOnBoard) this.pointerMoved();
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointer.set(-2, -2);
      this.hoverDirty = true;
      if (this.rest.stop()) this.onRestless?.();
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
      };
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
    if (gesture.pastThreshold || gesture.traveledPx < CLEAN_CLICK_PX) return;
    gesture.pastThreshold = true;
    if (this.roleOf(gesture.pointerType, gesture.index) === 'orient' && !gesture.panning)
      this.onOrientationStarted();
  };

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
    this.applyMapping();
    this.refreshCursor();
    if (gesture === null || event.type !== 'pointerup') return;
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
    if (press.picks && this.pickAt(event)) return;
    if (press.reads) this.readAt(event);
    if (press.acts) this.onAct(this.actClickAt(event.clientX, event.clientY));
  };

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
  private pickAt(event: PointerEvent): boolean {
    const onPieceClick = this.onPieceClick;
    if (onPieceClick === undefined || this.placing !== null || this.designating) return false;
    if (!this.castAt(event.clientX, event.clientY)) return false;
    const piece = this.standing.pick(this.ray);
    if (piece === null) return false;
    onPieceClick({
      ...piece,
      shift: event.shiftKey,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    return true;
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
    this.onRest?.({ ...click, labelId: this.restLabel });
  }

  private readAt(event: PointerEvent): void {
    if (this.placing !== null) {
      const spot = this.ghost.spot;
      if (spot !== null) this.onPlacePoint(spot.lonLat);
      return;
    }
    if (this.designating) {
      this.onRegionClick(this.regionAtPoint(event.clientX, event.clientY)?.id ?? null);
      return;
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

  setMapMotion(motion: MapMotion): void {
    this.invalidate();
    this.ambience.motion = motion;
    this.arcs.motion = motion;
    this.camps.motion = motion;
    this.ink.motion = motion;
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
      style.cursor = this.ghost.spot === null ? REFUSED_CURSOR : TROWEL_CURSOR;
    else if (this.building || this.designating) style.cursor = TROWEL_CURSOR;
    else if (this.held !== null) style.cursor = HOLDING_CURSOR;
    else if (this.aiming) style.cursor = AIM_CURSOR;
    else if (this.hoveredPiece) style.cursor = PIECE_CURSOR;
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

  /**
   * A mobilisation key is armed: the left click names a region instead of selecting a country.
   * It wears the same trowel as the construction panel, because it is the same verb — putting
   * a building down — and a second cursor for one gesture is one vocabulary too many.
   */
  setDesignating(designating: boolean): void {
    this.invalidate();
    if (designating === this.designating) return;
    this.designating = designating;
    this.refreshCursor();
  }

  /**
   * **The board is holding a building, and the next left click puts it down** (ADR 0013,
   * revision of 04/09). Only the port enters this mode, and what it may take is settled here,
   * once: the coast cells of the routing grid that fall inside this region and no other.
   *
   * Two readings meet and neither is guessed — the grid says what a ship can sail from
   * (`coastCellsIn`, the very function the server refuses with), the region layer says where the
   * region stops. A region whose polygons have not landed yet, or one the grid finds no shore
   * in, arms an empty magnet: the ghost stays away and the cursor refuses, rather than offering
   * a click the server would send back.
   */
  setPlacing(regionId: string | null, sprite: string | null): void {
    this.invalidate();
    if (regionId === this.placing) return;
    this.placing = regionId;
    if (regionId === null) {
      this.ghost.disarm();
      this.refreshCursor();
      return;
    }
    this.ghost.arm(sprite, this.coastOfRegion(regionId));
    this.hoverDirty = true;
    this.refreshCursor();
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

  private coastOfRegion(regionId: string): ReadonlyArray<CoastSpot> {
    const outline = this.regions.outlineOf(regionId);
    if (outline === null) return [];
    this.routeGrid ??= buildGrid(this.world);
    return coastCellsIn(this.routeGrid, outline.box).filter((cell) =>
      outline.covers(cell.x, cell.y),
    );
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
    const center = replay.center.clone().project(this.camera);
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
    if (currentDistance <= DEFAULT_MAX_DISTANCE) {
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
    this.ray.setFromCamera(this.pointer, this.camera);
    /** **The pointer's rest, (-2, -2), is off the screen but not off the board**: tilted and
     *  close, a ray cast outside the frame still lands on a country, and the dock would announce
     *  a hover nobody made — on a phone, from the first frame. */
    const onScreen = Math.abs(this.pointer.x) <= 1 && Math.abs(this.pointer.y) <= 1;
    const hit = onScreen ? this.ray.intersectObjects(this.countries, false)[0] : undefined;
    const touched = hit?.object as CountryMesh | undefined;

    this.updateRegionHover(this.fingerOnBoard ? null : (hit?.point ?? null));

    const piece = !this.fingerOnBoard && onScreen && this.standing.pick(this.ray) !== null;
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
      const arrived = this.ghost.spot === null;
      this.ray.setFromCamera(this.pointer, this.camera);
      const board = onScreen ? this.ray.intersectObjects(this.aimable, false)[0]?.point : undefined;
      this.ghost.aimAt(
        board === undefined ? null : board.x + this.frame.centerX,
        board === undefined ? null : board.z + this.frame.centerY,
      );
      if (arrived && this.ghost.spot !== null) this.refreshCursor();
    }

    this.hovered = touched ?? null;
    const adm0 = this.fingerOnBoard ? null : (this.hovered?.userData.adm0 ?? null);
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
      const intensity = isSelected ? 0.26 : isHovered ? 0.12 : 0;
      mesh.material.emissive.setRGB(intensity, intensity * 0.85, intensity * 0.55);
    }
  }

  private loop = (): void => {
    this.animation = requestAnimationFrame(this.loop);
    this.animateJourney();
    this.controls.maxPolarAngle = steepestTiltAt(
      this.camera.position.distanceTo(this.controls.target),
    );
    this.controls.update();
    if (this.hoverDirty) {
      // Le survol change ce qui s'allume.
      this.invalidate();
      this.hoverDirty = false;
      this.updateHover();
    }
    // Un fil affiché coule : ses tirets dérivent et son pion marche, à chaque image — et la plume
    // trace le terrain survolé tant qu'elle n'a pas fini.
    if (this.arcs.isFlowing || this.ink.active || this.regions.terrain.active) this.invalidate();
    const now = performance.now();
    this.advanceReplay(now);
    if (this.held !== null && this.rest.due(now)) this.tellRest();
    if (this.ambience.advance(now)) this.demand.request();
    if (!this.demand.due(now)) return;
    this.ambience.frame();
    // The cycle is slow enough for the heartbeat: no frame is ever asked for the sky alone. Cut
    // motion keeps it too — a half-hour dusk does not move, a stepped one would jump.
    this.night.apply(this.forcedNight ?? nightAt(Date.now()));
    this.lightCountries();

    // At zoom, the stroke hierarchy flips ink: country borders darken while regions appear
    // beneath — WebGL only knows one pixel of width.
    const distance = this.camera.position.distanceTo(this.controls.target);
    const yaw = cameraYaw(this.camera.position, this.controls.target);
    this.arcs.animate(this.camera, this.unitsPerPixel(distance), yaw);
    this.ink.animate(now, this.unitsPerPixel(distance));
    // Vingt-cinq kilomètres ne se lisent pas depuis l'orbite : le cercle de contact se retire
    // plutôt que de se poser en point sur le mât qu'il entoure.
    this.reach.animate(this.unitsPerPixel(distance));
    this.ghost.orient(this.camera.position);
    this.standing.orient(this.camera.position);
    this.camps.orient(this.camera.position, yaw, now);
    this.clearReplayGround();
    if (this.lamp.follow(this.controls.target, distance)) {
      for (const root of [this.standing.group, this.camps.group, this.arcs.group])
        castShadows(root);
      if (this.replay) castShadows(this.replay.scene.object);
    }
    this.regions.animate(distance, now);
    this.sea?.fade(distance);
    this.borders.material.opacity =
      distance < REGIONS_GONE_DISTANCE
        ? Math.min(0.95, 0.62 + (REGIONS_GONE_DISTANCE - distance) * 0.007)
        : 0.62;

    this.renderer.render(this.scene, this.camera);
    const projections = this.labels.project(
      this.camera,
      this.screenWidth,
      this.screenHeight,
      this.arcs.headPositions,
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
