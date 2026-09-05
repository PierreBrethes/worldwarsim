import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MOUSE,
  PerspectiveCamera,
  Raycaster,
  Scene,
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
import type { LonLat } from '@/domain/geo';
import type { RegionIdentity, RegionsData, World } from '@/domain/world';
import { buildGrid, coastCellsIn, isCoastCell, type RouteGrid } from '@/domain/routing';
import type { ArcView } from '@/domain/player-view';
import { ArcLayer, ARC_HOVER_THRESHOLD } from './arcs';
import { ReachRing } from './reach';
import type { Reach } from '@/domain/labels';
import { Curvature } from './curvature';
import { LabelLayer, type LabelProjection, type NamedAnchor } from './labels';
import { buildCoastalWash } from './coastal-wash';
import { PALETTE } from './palette';
import { buildCountries, type CountryMesh } from './countries';
import { buildBoard } from './board';
import { RegionLayer, REGIONS_GONE_DISTANCE, type HeldClaim } from './regions';
import { PlacingGhost, type CoastSpot } from './placing';
import { WorldFrame } from './frame';

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
 * What picking reports from a right click. `country` is null on the open sea; `region` is null
 * there too, and everywhere the region layer has faded out — far from the ground, the game
 * aims at a country, up close at a region.
 */
export type MapRightClick = {
  country: string | null;
  region: RegionIdentity | null;
  /** The place itself, land or water — `null` only when the ray leaves the board entirely. */
  point: LonLat | null;
  clientX: number;
  clientY: number;
};

/**
 * The trowel, hot spot on its point — top *right* of the drawing, hence `29 3`: at `0 0` the
 * click would land twenty-nine pixels away from the tool. The fallback keyword is not
 * decoration either — without it the whole declaration is invalid and silently dropped.
 */
const TROWEL_CURSOR = 'url(/cursors/curseur-construire.png) 29 3, crosshair';

/** The aim wears a plain crosshair: there is no drawn cursor for it, and inventing one here
 *  would put a drawing decision in the engine. */
const AIM_CURSOR = 'crosshair';

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

/**
 * Below this accumulated motion, the gesture is a clean click and designates the aimed
 * entity; beyond, it was a camera orientation and nothing gets selected. Without this
 * split, every half-turn started on a country would end up selecting it on release.
 */
const CLEAN_CLICK_PX = 6;

/**
 * What we keep of a press until its release. `panning` is frozen at press time: the mapping
 * never flips mid-drag, otherwise the gesture changes nature under the player's fingers.
 */
type Gesture = {
  readonly button: number;
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
  private readonly curvature: Curvature;
  private readonly arcs: ArcLayer;
  private readonly reach: ReachRing;
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
  private readonly restListeners = new Set<() => void>();
  /**
   * Picking costs three passes — countries, arcs, then point-in-polygon over the regions —
   * and its result only changes when the pointer or the camera moves. Arcs advance every
   * frame, but along geometry that was baked once: a still pointer over a still camera hits
   * the same thread. So the sweep is done on demand rather than sixty times a second.
   */
  private hoverDirty = true;

  /**
   * The country under the pointer, by `adm0_a3`. It is a second announcement rather than a
   * field of `onRegionHover`, because the two do not switch on at the same distance: the
   * region layer only exists close in, the country is there at every zoom, and the board's
   * card has to keep answering when there is no region to name yet.
   */
  onCountryHover: (adm0: string | null) => void = () => {};
  onRegionHover: (region: RegionIdentity | null) => void = () => {};
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
  onRightClick: (click: MapRightClick) => void = () => {};
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
  private hoveredArc: string | null = null;

  constructor(
    private readonly container: HTMLElement,
    /** Kept for the one thing that is asked of the world after the board is built: the routing
     *  raster, rasterised on the first placement and never before (`coastOfRegion`). */
    private readonly world: World,
  ) {
    this.frame = new WorldFrame(world);
    this.curvature = new Curvature(this.frame);

    this.scene.background = new Color(PALETTE.desk);
    this.scene.fog = new Fog(PALETTE.desk, 460, 950);

    this.camera = new PerspectiveCamera(42, 1, 0.5, 3000);
    this.camera.position.set(30, 250, 300);

    // The stencil serves the coastal wash, whose ribbons overlap: without it, three opens
    // the context without a stencil buffer since r163 and the material would plead in vain.
    this.renderer = new WebGLRenderer({ antialias: true, stencil: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = 0.3;
    this.controls.maxPolarAngle = 1.15;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 300;
    this.controls.screenSpacePanning = false;
    // The right button belongs to the compass rose, it drives nothing here anymore. Panning
    // goes through the pressed wheel, doubled by the space alias: many trackpads have no
    // third button, and that path must stay open.
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: null };

    this.scene.add(new HemisphereLight('#fff3dc', '#5a4e3a', 1.35));
    const sun = new DirectionalLight('#fffaf0', 0.5);
    sun.position.set(-180, 320, 160);
    this.scene.add(sun);

    const board = buildBoard(
      world,
      this.frame,
      this.curvature,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.surface = board.surface;
    this.scene.add(board.surface);
    for (const object of board.decor) this.scene.add(object);

    this.scene.add(buildCoastalWash(world, this.frame, this.curvature));

    const { meshes, borders } = buildCountries(world, this.frame, this.curvature);
    this.countries = meshes;
    this.borders = borders;
    for (const mesh of meshes) this.scene.add(mesh);
    this.scene.add(borders);

    this.aimable = [...this.countries, this.surface];

    this.arcs = new ArcLayer(this.frame);
    this.reach = new ReachRing(this.frame);
    this.ghost = new PlacingGhost(this.frame);
    this.scene.add(this.arcs.group);
    this.scene.add(this.reach.object);
    this.scene.add(this.ghost.object);

    this.regions = new RegionLayer(this.frame, this.curvature);
    this.labels = new LabelLayer(
      this.frame,
      (regionId) => this.regions.anchorOf(regionId),
      () => (this.regions.isActive ? this.regions.fade : 0),
    );

    this.scene.add(this.regions.lines);
    this.scene.add(this.regions.held);
    this.scene.add(this.regions.built);
    this.scene.add(this.regions.designated);
    this.scene.add(this.regions.hoverOutline);
    this.scene.add(this.regions.props);

    // The thread is aimed at on screen the way it is drawn there: the threshold adds to the
    // material's pixel thickness. Without it, a 1.5 px stroke would only hover to the pixel.
    this.ray.params.Line2 = { threshold: ARC_HOVER_THRESHOLD };

    this.wireInputs();
    this.resize();
    this.loop();
  }

  displayArcs(arcs: ReadonlyArray<ArcView>): void {
    this.arcs.display(arcs);
    // New pick targets under an unmoved pointer: the hover must be recomputed even though
    // nothing on screen moved.
    this.hoverDirty = true;
  }

  setLabelAnchors(anchors: ReadonlyArray<NamedAnchor>): void {
    this.labels.setAnchors(anchors);
    // The label set changed: the overlap degradation must be redone, but not before the
    // loop has laid the new positions — the camera rest serves that too.
    this.postponeRest();
  }

  displayRegions(data: RegionsData): void {
    this.regions.display(data);
    // The 500 KB land half a second after the board, so the buildings are asked for before
    // the ground that carries them: a region anchor has no position until now, and without
    // this their labels would wait for the next curvature change to find their footing.
    this.labels.rebuild();
    // The regions land half a second after the map: without this, hovering only wakes up on
    // the next pointer move, over a layer that is already drawn.
    this.hoverDirty = true;
  }

  setPlayerNation(nation: string | null): void {
    this.arcs.setPlayerNation(nation);
    this.hoverDirty = true;
  }

  accentArc(id: string | null): void {
    this.arcs.accent(id);
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
  journeyTo(ids: ReadonlyArray<string>, places: ReadonlyArray<LonLat> = []): void {
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

    this.journey = {
      departure: this.controls.target.clone(),
      arrival,
      orientation: this.camera.position.clone().sub(this.controls.target).normalize(),
      departureDistance: currentDistance,
      arrivalDistance: Math.min(
        this.controls.maxDistance,
        Math.max(currentDistance, framing, this.controls.minDistance),
      ),
      startMs: performance.now(),
    };
  }

  select(adm0: string | null): void {
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

  private aimAt(clientX: number, clientY: number, includeSea = false): Intersection | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return undefined;
    this.aim.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.aim, this.camera);
    return this.ray.intersectObjects(includeSea ? this.aimable : this.countries, false)[0];
  }

  /** The camera holds still while a rose is open: one does not aim at a moving target. */
  freezeOrbit(frozen: boolean): void {
    this.controls.enabled = !frozen;
  }

  /**
   * A country carries a nation's ink because a player reserved it, never because it is
   * named like it: the map receives the holders' table, it does not deduce it. Everything
   * absent from it returns to neutral land — resetting the table is enough to undo.
   */
  colorNations(inkByCountry: ReadonlyMap<string, string>): void {
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
    this.regions.showBuilt(new Set(built.regionIds), built.ink);
  }

  /**
   * **Qui tient quelles régions** (ADR 0020 §1). La teinte reste au loin quand les frontières
   * s'effacent : on lit qui tient quoi sans lire le découpage — voir `RegionLayer.showHeld`.
   */
  showHeldRegions(claims: ReadonlyArray<HeldClaim>): void {
    this.regions.showHeld(claims);
  }

  /** The ground an armed key accepts, as the domain computed it — see `RegionLayer.showDesignated`. */
  showDesignatedRegions(regionIds: ReadonlyArray<string>): void {
    this.regions.showDesignated(new Set(regionIds));
  }

  /**
   * **The ground one detector covers, while the pointer asks for it and no longer** (fiche 03).
   * `null` puts it away — the ring is an answer to a hover, not a layer of the board.
   */
  showReach(reach: Reach | null): void {
    this.reach.show(reach);
  }

  setCurvature(intensity: number): void {
    this.frame.curvature = intensity;
    this.curvature.applyAll();
    this.reach.rebuild();
    this.ghost.rebuild();
    this.arcs.rebuild();
    this.labels.rebuild();
    this.regions.rebuild();
    // Every vertex on the board just moved under a pointer that did not.
    this.hoverDirty = true;
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.container;
    if (!clientWidth || !clientHeight) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
    this.screenWidth = clientWidth;
    this.screenHeight = clientHeight;
    this.arcs.resize(clientWidth, clientHeight);
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
    this.ghost.dispose();
    this.arcs.dispose();
    this.regions.dispose();
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
      this.hoverDirty = true;
      this.postponeRest();
    });
    canvas.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.pointerScreen.x = event.clientX - rect.left;
      this.pointerScreen.y = event.clientY - rect.top;
      this.pointer.x = (this.pointerScreen.x / rect.width) * 2 - 1;
      this.pointer.y = -(this.pointerScreen.y / rect.height) * 2 + 1;
      this.hoverDirty = true;
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointer.set(-2, -2);
      this.hoverDirty = true;
    });
    canvas.addEventListener('pointerdown', (event) => {
      this.journey = null;
      this.gesture = {
        button: event.button,
        panning: event.button === 1 || this.spaceHeld,
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
      if (event.button === 1) event.preventDefault();
    });

    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.onRightClick({
        country: this.countryAtPoint(event.clientX, event.clientY),
        region: this.regionAtPoint(event.clientX, event.clientY),
        point: this.pointAt(event.clientX, event.clientY),
        clientX: event.clientX,
        clientY: event.clientY,
      });
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
    if (gesture === null) return;
    gesture.traveledPx += Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    if (gesture.pastThreshold || gesture.traveledPx < CLEAN_CLICK_PX) return;
    gesture.pastThreshold = true;
    if (gesture.button === 0 && !gesture.panning) this.onOrientationStarted();
  };

  /**
   * Only a clean left-button click selects. A drag was an orientation, the right button
   * belongs to the rose — without this guard, every rose would land on a selection nobody
   * asked for — and held space makes the left button a pan, not a designation.
   */
  private endGesture = (event: PointerEvent): void => {
    const gesture = this.gesture;
    this.gesture = null;
    this.applyMapping();
    this.refreshCursor();
    if (gesture === null || event.type !== 'pointerup') return;
    if (gesture.button !== 0 || gesture.panning || gesture.pastThreshold) return;
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
  };

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

  /** A running drag keeps the mapping it had at press; it resumes on release. */
  private applyMapping(): void {
    if (this.gesture !== null) return;
    this.controls.mouseButtons.LEFT = this.spaceHeld ? MOUSE.PAN : MOUSE.ROTATE;
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
    else if (this.aiming) style.cursor = AIM_CURSOR;
    else style.cursor = '';
  }

  /** The board wears the trowel while a construction panel is open, and only then. */
  setBuilding(building: boolean): void {
    if (building === this.building) return;
    this.building = building;
    this.refreshCursor();
  }

  /** The board is in aim: a column is armed and the next right click names its march. */
  setAiming(aiming: boolean): void {
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
    const share = Math.min(1, (performance.now() - this.journey.startMs) / JOURNEY_MS);
    const eased = share * share * (3 - 2 * share);

    this.controls.target.copy(this.journey.departure).lerp(this.journey.arrival, eased);
    const distance =
      this.journey.departureDistance +
      (this.journey.arrivalDistance - this.journey.departureDistance) * eased;
    this.camera.position
      .copy(this.controls.target)
      .addScaledVector(this.journey.orientation, distance);
    // A journey moves the camera without going through OrbitControls, so no `change` event
    // fires: the hover has to be invalidated by hand.
    this.hoverDirty = true;

    if (share === 1) {
      this.journey = null;
      this.postponeRest();
    }
  }

  private updateHover(): void {
    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = this.ray.intersectObjects(this.countries, false)[0];
    const touched = hit?.object as CountryMesh | undefined;

    this.updateRegionHover(hit?.point ?? null);

    const arc = this.arcs.hover(this.ray);
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
      const board = this.ray.intersectObjects(this.aimable, false)[0]?.point;
      this.ghost.aimAt(
        board === undefined ? null : board.x + this.frame.centerX,
        board === undefined ? null : board.z + this.frame.centerY,
      );
      if (arrived && this.ghost.spot !== null) this.refreshCursor();
    }

    this.hovered = touched ?? null;
    const adm0 = this.hovered?.userData.adm0 ?? null;
    if (adm0 !== this.hoveredCountry) {
      this.hoveredCountry = adm0;
      this.onCountryHover(adm0);
    }
  }

  /** Region hover only exists once the layer has faded in on screen, never at sea. */
  private updateRegionHover(point: Vector3 | null): void {
    let region: RegionIdentity | null = null;
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
      const isHovered = mesh === this.hovered;
      const isSelected = mesh.userData.adm0 === this.selection;
      const intensity = isSelected ? 0.26 : isHovered ? 0.12 : 0;
      mesh.material.emissive.setRGB(intensity, intensity * 0.85, intensity * 0.55);
    }
  }

  private loop = (): void => {
    this.animation = requestAnimationFrame(this.loop);
    this.animateJourney();
    this.controls.update();
    if (this.hoverDirty) {
      this.hoverDirty = false;
      this.updateHover();
    }
    this.lightCountries();

    // At zoom, the stroke hierarchy flips ink: country borders darken while regions appear
    // beneath — WebGL only knows one pixel of width.
    const distance = this.camera.position.distanceTo(this.controls.target);
    this.arcs.animate(this.camera, this.unitsPerPixel(distance));
    this.ghost.orient(this.camera.position);
    this.regions.animate(distance);
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
    this.onLabels(projections);
    this.onEdges(projections);
  };
}

type Journey = {
  readonly departure: Vector3;
  readonly arrival: Vector3;
  readonly orientation: Vector3;
  readonly departureDistance: number;
  readonly arrivalDistance: number;
  readonly startMs: number;
};

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
