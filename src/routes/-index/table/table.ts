import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  Clock,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  CatmullRomCurve3,
} from 'three';
import { distanceKm, type LonLat } from '@/domain/geo';
import type { BuildingKey, Nation, UnitRole } from '@/domain/ids';
import {
  ASSAULT,
  assaultStepAt,
  captureShareAt,
  dayInstant,
  NIGHT_CITIES,
  nightInstant,
  RACE_POINTS,
  raceAt,
  type RacePoint,
} from '@/domain/landing';
import type { MapMotion } from '@/domain/map-motion';
import { INK_BY_NATION } from '@/domain/nations';
import { nightAt } from '@/domain/daylight';
import { KM_PER_UNIT } from '@/domain/routing';
import type { UnitTier } from '@/domain/troops';
import { BUILDING_MAQUETTES } from '@/emblems/buildings/manifest';
import { fr } from '@/i18n/fr';
import { figurineFor, sceneOf, type Figurine } from '@/map/engine/figurines/figurine';
import { stride } from '@/map/engine/figurines/infantry';
import { SEA_LEVEL, WorldFrame } from '@/map/engine/frame';
import { castShadows, Lamp } from '@/map/engine/lamp';
import { NightSky } from '@/map/engine/night';
import { ARC_COLORS, PALETTE } from '@/map/engine/palette';
import {
  MINUTES_PER_1000_KM_ON_LAND,
  OUTPOST_REACH_KM_BY_LEVEL,
} from '../../../../convex/constants';
import {
  along,
  bow,
  circle,
  headingAt,
  Moments,
  ribbon,
  SHEET_Y,
  smooth,
  surveyMark,
  type Ribbon,
} from './marks';
import { engrave, landMask, type EuropeSheet } from './sheet';

export type SceneName = 'hero' | 'front' | 'fog' | 'battle' | 'race' | 'night' | 'press' | 'bureau';

/** What the page's scroll says, written by the page and read by the table at every image. */
export type Reading = {
  scene: SceneName;
  progress: number;
  /** Where the camera's aim sits on the screen, in pixels: the photo's centre on the une. */
  focus: readonly [number, number];
};

export type Order = 'march' | 'found';

/** What the table tells the page: only what the page draws, and only when it changes. */
export type Story = {
  readonly front: {
    readonly step: number;
    readonly rose: readonly [number, number] | null;
    readonly confirm: Order | null;
    readonly place: string | null;
    readonly km: number;
    readonly minutes: number;
    readonly sent: boolean;
  };
  readonly battle: {
    readonly step: number;
    readonly order: readonly [number, number] | null;
    readonly capture: number;
    readonly taken: boolean;
  };
};

const PLACES = {
  paris: [2.35, 48.86],
  lille: [3.06, 50.63],
  london: [-0.12, 51.5],
  brest: [-4.49, 48.39],
  cherbourg: [-1.62, 49.64],
  dover: [1.31, 51.13],
  verdun: [5.38, 49.16],
  metz: [6.18, 49.12],
  nancy: [6.18, 48.69],
  reims: [4.03, 49.26],
  strasbourg: [7.75, 48.58],
  saarbrucken: [6.99, 49.24],
  brussels: [4.35, 50.85],
  lyon: [4.83, 45.76],
  berne: [7.45, 46.95],
  vienna: [16.37, 48.21],
} as const satisfies Record<string, LonLat>;
/** The places a dropped piece may be named after, when it lands near one. */
const NAMED: ReadonlyArray<keyof typeof fr.front.places> = [
  'verdun',
  'metz',
  'nancy',
  'reims',
  'strasbourg',
  'saarbrucken',
  'brussels',
  'lille',
  'lyon',
  'paris',
];

const PLAYING_SCENES = new Set<SceneName>(['front', 'fog', 'battle']);
/** The hour the folio of page 2 prints: the march is dated from it. */
const FRONT_HOUR = 14 * 60 + 5;
const MAQUETTE_ROOM = 0.63;

type Key = { at: () => Vector3; dist: number; phi: number; theta: number };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hourOf = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const material = (color: string) =>
  new MeshStandardMaterial({ color, roughness: 0.75, flatShading: true });

/** A pole, a pennant and a plinth: an outpost, a flag, or one of the Seven. */
function mast(cloth: string, scale: number): { group: Group; cloth: Mesh } {
  const group = new Group();
  const pole = new Mesh(new CylinderGeometry(0.017, 0.017, 0.8, 6), material(PALETTE.border));
  pole.position.y = 0.4;
  const flag = new Mesh(
    new PlaneGeometry(0.3, 0.2),
    new MeshStandardMaterial({ color: cloth, side: DoubleSide, roughness: 0.9 }),
  );
  flag.position.set(0.157, 0.68, 0);
  const plinth = new Mesh(new CylinderGeometry(0.23, 0.26, 0.083, 24), material(PALETTE.plinthTop));
  plinth.position.y = 0.04;
  group.add(pole, flag, plinth);
  group.scale.setScalar(scale);
  castShadows(group);
  return { group, cloth: flag };
}

/**
 * **La table de la une** : une scène three.js à part, légère et sans état de partie — la feuille
 * d'Europe gravée, la lampe et la nuit du plateau (`Lamp`, `NightSky`), ses figurines et ses
 * maquettes (`figurineFor`, `BUILDING_MAQUETTES`), et des scènes jouées que le défilement choisit.
 * Elle n'importe pas `MapEngine` : le plateau porte une partie, celle-ci un récit.
 *
 * Les GLB se chargent à la demande, scène par scène (`prepare`). Hors mouvement complet, rien ne
 * glisse ni ne fume, et une image n'est rendue que si quelque chose a changé.
 */
export class LandingTable {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.15, 400);
  private readonly frame: WorldFrame;
  private readonly lamp: Lamp;
  private readonly night: NightSky;
  private readonly moments: Moments;
  private readonly clock = new Clock();
  private readonly ray = new Raycaster();
  private readonly ground = new Plane(new Vector3(0, 1, 0), -SHEET_Y);
  private readonly pins = new Map<
    string,
    {
      el: HTMLElement | null;
      anchor: Vector3;
      on: boolean;
      fit: { half: number; zoom: number } | null;
    }
  >();
  private readonly prepared = new Set<SceneName>();
  private readonly maquettes: Vector3[] = [];
  private readonly isLand: (x: number, y: number) => boolean;
  private readonly still: boolean;
  private current: SceneName | null = null;
  private running = true;
  private frameId = 0;
  private cam = { x: 0, z: 0, dist: 60, phi: 0.9, theta: 0, fx: 0, fy: 0 };
  private camKnown = false;
  private lastCam = '';
  private lastStory = '';
  private down: [number, number] | null = null;
  private age = 0;
  private readonly today = Date.now();

  private hero: {
    smokeFrom: Object3D[];
    escort: Figurine | null;
    plane: Figurine | null;
    lane: Vector3[];
  } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sheet: EuropeSheet,
    motion: MapMotion,
    private readonly reading: Reading,
    private readonly onStory: (story: Story) => void,
  ) {
    this.still = motion !== 'full';
    this.frame = new WorldFrame({ sphere: sheet.sphere, outline: sheet.outline, countries: [] });
    this.isLand = landMask(sheet);
    const narrow = innerWidth <= 760;
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    // Whatever was built before a throw — a context, listeners, textures — goes with it.
    try {
      this.renderer.setPixelRatio(Math.min(narrow ? 1.6 : 2, devicePixelRatio));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = PCFSoftShadowMap;
      this.renderer.toneMapping = NoToneMapping;
      this.scene.background = new Color(PALETTE.desk);
      this.moments = new Moments(this.scene, motion);
      this.lamp = new Lamp(this.scene);

      const { x0, x1, y0, y1 } = sheet.box;
      const texture = new CanvasTexture(engrave(sheet, narrow ? 2560 : 4096));
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      const edge = new MeshStandardMaterial({ color: '#cbbb98', roughness: 0.9 });
      const top = new MeshStandardMaterial({ map: texture, roughness: 0.92 });
      const paper = new Mesh(new BoxGeometry(x1 - x0, 0.13, y1 - y0), [
        edge,
        edge,
        top,
        edge,
        edge,
        edge,
      ]);
      paper.position.copy(this.frame.toWorld((x0 + x1) / 2, (y0 + y1) / 2, SHEET_Y - 0.065));
      paper.receiveShadow = true;
      const desk = new Mesh(
        new PlaneGeometry(500, 500),
        new MeshStandardMaterial({ color: '#241a0e', roughness: 1 }),
      );
      desk.rotation.x = -Math.PI / 2;
      desk.position.copy(paper.position).setY(-0.07);
      desk.receiveShadow = true;
      this.scene.add(paper, desk);
      this.night = new NightSky(this.scene, this.frame, this.surface(), this.lamp, null);

      addEventListener('resize', this.resize);
      canvas.addEventListener('pointerdown', this.onDown);
      addEventListener('pointermove', this.onMove);
      addEventListener('pointerup', this.onUp);
      addEventListener('keydown', this.onKey);
      this.resize();
      this.prepare('hero');
    } catch (error) {
      this.dispose();
      throw error;
    }
    this.frameId = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    this.running = false;
    removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerup', this.onUp);
    removeEventListener('keydown', this.onKey);
    cancelAnimationFrame(this.frameId);
    this.renderer.dispose();
    // The page can be left and reopened: a context per visit would pile up to the browser's cap.
    this.renderer.forceContextLoss();
  }

  /** Lays a DOM node on the table: the table moves it over its anchor at every image. */
  pin(key: string, el: HTMLElement | null): void {
    const pin = this.pins.get(key);
    if (pin) {
      pin.el = el;
      pin.fit = null;
    } else this.pins.set(key, { el, anchor: new Vector3(), on: false, fit: null });
  }

  setSurveyAge(hours: number): void {
    this.age = hours;
  }

  // ---------- geometry ----------

  /** The sheet as the night reads it: a grid carrying each vertex's lon/lat. */
  private surface(): PlaneGeometry {
    const { x0, x1, y0, y1 } = this.sheet.box;
    const geometry = new PlaneGeometry(x1 - x0, y1 - y0, 72, 44);
    geometry.rotateX(-Math.PI / 2);
    const centre = this.frame.toWorld((x0 + x1) / 2, (y0 + y1) / 2, SEA_LEVEL);
    geometry.translate(centre.x, SEA_LEVEL, centre.z);
    const position = geometry.getAttribute('position');
    const lonLat: number[] = [];
    for (let i = 0; i < position.count; i++)
      lonLat.push(
        ...this.frame.lonLatAt(
          position.getX(i) + this.frame.centerX,
          position.getZ(i) + this.frame.centerY,
        ),
      );
    geometry.setAttribute('lonLat', new Float32BufferAttribute(lonLat, 2));
    return geometry;
  }

  /** A point of the sheet: a place, nudged by `du`, `dv` projected units. */
  private at(lonLat: LonLat, du = 0, dv = 0): Vector3 {
    return this.frame.projectLonLat(lonLat, SHEET_Y).add(new Vector3(du, 0, dv));
  }

  private lonLatOf(point: Vector3): LonLat {
    return this.frame.lonLatAt(point.x + this.frame.centerX, point.z + this.frame.centerY);
  }

  private maquette(
    key: BuildingKey,
    span: number,
    at: Vector3,
    yaw: number,
    onLoad: (model: Object3D) => void = () => undefined,
  ): Group {
    const holder = new Group();
    holder.position.copy(at);
    holder.rotation.y = yaw;
    this.scene.add(holder);
    this.maquettes.push(at);
    const url = BUILDING_MAQUETTES[key];
    if (url !== null)
      void sceneOf(url).then((scene) => {
        const model = scene.clone(true);
        const size = new Box3().setFromObject(model).getSize(new Vector3());
        model.scale.setScalar(span / Math.max(size.x, size.z));
        model.position.y -= new Box3().setFromObject(model).min.y;
        castShadows(model);
        model.traverse((part) => {
          if ((part as Mesh).isMesh) part.receiveShadow = true;
        });
        holder.add(model);
        onLoad(model);
      });
    return holder;
  }

  private piece(nation: Nation, role: UnitRole, marks: ReadonlyArray<UnitTier>): Figurine | null {
    const figurine = figurineFor(nation, role, marks);
    if (figurine !== null)
      void figurine.ready.then(
        () => castShadows(figurine.object),
        () => undefined,
      );
    return figurine;
  }

  /** Pushes a point off the land to the nearest water, so a hull never grazes the coast. */
  private toSea(point: Vector3, margin = 0.093): Vector3 {
    const [x, y] = [point.x + this.frame.centerX, point.z + this.frame.centerY];
    const clear = (u: number, v: number) =>
      !this.isLand(u, v) &&
      Array.from({ length: 8 }, (_, a) => a).every(
        (a) =>
          !this.isLand(
            u + Math.cos((a * Math.PI) / 4) * margin,
            v + Math.sin((a * Math.PI) / 4) * margin,
          ),
      );
    if (clear(x, y)) return point;
    for (let r = 0.017; r < 0.83; r += 0.017)
      for (let a = 0; a < 24; a++) {
        const u = x + Math.cos((a / 24) * Math.PI * 2) * r;
        const v = y + Math.sin((a / 24) * Math.PI * 2) * r;
        if (clear(u, v)) return this.frame.toWorld(u, v, point.y);
      }
    return point;
  }

  private routeAround(a: Vector3, b: Vector3): Vector3[] {
    for (const k of [0.1, -0.1, 0.2, -0.2, 0.32, -0.32, 0.45, -0.45]) {
      const points = bow(a, b, k);
      if (
        points
          .slice(4, -4)
          .every((p) =>
            this.maquettes.every((m) => Math.hypot(p.x - m.x, p.z - m.z) > MAQUETTE_ROOM),
          )
      )
        return points;
    }
    return bow(a, b, 0.1);
  }

  // ---------- scenes ----------

  /** A scene's pieces, built once, the first time it or the one before it is reached. */
  private prepare(name: SceneName): void {
    if (this.prepared.has(name)) return;
    this.prepared.add(name);
    if (name === 'hero') this.buildHero();
    if (name === 'front') this.buildFront();
    if (name === 'fog') this.buildFog();
    if (name === 'battle') this.buildBattle();
    if (name === 'race') this.buildRace();
  }

  private buildHero(): void {
    const paris = PLACES.paris;
    this.maquette('hq', 0.83, this.at(paris, -0.35, 0.15), 0.3);
    const smokeFrom: Object3D[] = [];
    this.maquette('foundry', 0.73, this.at(PLACES.lille, 0, 0.2), -0.4, (model) =>
      model.traverse((part) => {
        if (part.name === 'fx_smoke') smokeFrom.push(part);
      }),
    );
    this.maquette('barracks', 0.73, this.at(paris, 0.5, 1.15), 0.5);
    const escort = this.piece('france', 'escort', [1]);
    const plane = this.piece('france', 'fighter', [1]);
    if (escort) this.scene.add(escort.object);
    if (plane) this.scene.add(plane.object);
    const { brest, cherbourg, dover } = PLACES;
    const curve = new CatmullRomCurve3(
      [
        this.at(brest, -1.6, -0.2),
        this.at(brest, 0.6, -1.3),
        this.at(cherbourg, -0.4, -0.9),
        this.at(cherbourg, 1.4, -1.0),
        this.at(dover, -0.3, 0.35),
      ].map((p) => this.toSea(p)),
    );
    const lane = curve.getPoints(160).map((p) => this.toSea(p, 0.073));
    this.hero = { smokeFrom, escort, plane, lane };
  }

  private tickHero(dt: number, t: number): void {
    const hero = this.hero;
    if (hero === null) return;
    const { escort, plane, lane } = hero;
    const k = this.still ? 0.35 : (Math.sin(t * 0.07) + 1) / 2;
    const p = along(lane, k);
    const heading = headingAt(lane, k) + (Math.cos(t * 0.07) < 0 && !this.still ? Math.PI : 0);
    if (escort) {
      escort.object.position.copy(p).setY(SHEET_Y - 0.04);
      escort.object.rotation.set(
        this.still ? 0 : Math.sin(t * 1.3) * 0.03,
        heading,
        this.still ? 0 : Math.sin(t * 1.1) * 0.05,
      );
    }
    const centre = this.at(PLACES.london, 1.2, 2.4);
    const a = this.still ? 1 : t * 0.22;
    if (plane) {
      plane.object.position.set(centre.x + Math.cos(a) * 1.4, 1.4, centre.z + Math.sin(a) * 1.4);
      plane.object.rotation.set(0, -a, 0);
      plane.object.rotateZ(-0.35);
      if (!this.still) plane.spin(dt);
    }
    if (this.still) return;
    if (Math.floor(t * 3) !== Math.floor((t - dt) * 3))
      for (const source of hero.smokeFrom)
        this.moments.puff(source.getWorldPosition(new Vector3()), {
          color: '#5b544a',
          size: 0.18,
          grow: 2.2,
          life: 3.2,
          rise: 0.3,
          drift: [0.12, -0.03],
          opacity: 0.38,
        });
    if (Math.floor(t * 6) !== Math.floor((t - dt) * 6)) {
      const wake = new Vector3(-Math.sin(heading) * 0.53, 0, -Math.cos(heading) * 0.53).add(p);
      wake.y = SHEET_Y + 0.067;
      this.moments.puff(wake, {
        color: '#f6f0e0',
        size: 0.1,
        grow: 2.2,
        life: 2.2,
        rise: 0,
        opacity: 0.4,
      });
    }
  }

  // ----- page 2 : lift, place, choose, send -----

  private front: {
    squad: Figurine | null;
    holder: Group;
    home: Vector3;
    state: 'rest' | 'carried' | 'placed' | 'confirm' | 'sent';
    auto: boolean;
    timer: number;
    target: Vector3;
    carry: Vector3;
    drop: Vector3;
    order: Order;
    place: string | null;
    km: number;
    minutes: number;
    route: Ribbon | null;
    path: Vector3[];
    reach: Ribbon | null;
    arrived: boolean;
  } | null = null;

  private buildFront(): void {
    const home = this.at(PLACES.paris, 1.25, -0.2);
    const holder = new Group();
    const squad = this.piece('france', 'infantry', [1, 1, 1]);
    if (squad) holder.add(squad.object);
    holder.position.copy(home);
    holder.rotation.y = Math.PI / 2 - 0.1;
    this.scene.add(holder);
    this.front = {
      squad,
      holder,
      home,
      state: 'rest',
      auto: true,
      timer: 0,
      target: home.clone(),
      carry: home.clone(),
      drop: home.clone(),
      order: 'march',
      place: null,
      km: 0,
      minutes: 0,
      route: null,
      path: [],
      reach: null,
      arrived: false,
    };
    this.setPin('pile', home.clone().setY(0.73), false);
  }

  private resetFront(auto: boolean): void {
    const f = this.front;
    if (f === null) return;
    f.state = 'rest';
    f.auto = auto;
    f.timer = 0;
    f.arrived = false;
    f.holder.position.copy(f.home);
    f.holder.rotation.set(0, Math.PI / 2 - 0.1, 0);
    if (f.squad) stride(f.squad.object, null);
    for (const r of [f.route, f.reach]) if (r) this.scene.remove(r);
    f.route = f.reach = null;
  }

  private lift(): void {
    const f = this.front!;
    f.state = 'carried';
    f.timer = 0;
    f.carry.copy(f.holder.position);
  }

  private place(point: Vector3): void {
    const f = this.front!;
    f.state = 'placed';
    f.timer = 0;
    f.drop.copy(point).setY(SHEET_Y);
    const nearest = NAMED.map(
      (key) => [key, this.at(PLACES[key]).distanceTo(f.drop)] as const,
    ).sort((a, b) => a[1] - b[1])[0]!;
    f.place = nearest[1] < 1.33 ? fr.front.places[nearest[0]] : null;
    f.km = Math.round(distanceKm(this.lonLatOf(f.home), this.lonLatOf(f.drop)));
    f.minutes = Math.max(1, (f.km / 1000) * MINUTES_PER_1000_KM_ON_LAND);
    this.setPin('send', f.drop.clone(), false);
  }

  choose(order: Order): void {
    const f = this.front;
    if (f === null || (f.state !== 'placed' && f.state !== 'confirm')) return;
    f.state = 'confirm';
    f.timer = 0;
    f.order = order;
    if (f.route === null) {
      f.path = this.routeAround(f.home, f.drop);
      f.route = ribbon(this.scene, f.path, 0.067, ARC_COLORS.mine.trace, {
        dash: 0.23,
        opacity: 0.35,
      });
      f.route.reveal(1);
    }
    this.setPin('send', f.drop.clone(), true);
  }

  send(): void {
    const f = this.front;
    if (f === null || f.state !== 'confirm') return;
    f.state = 'sent';
    f.timer = 0;
    f.route?.material.setValues({ opacity: 0.95 });
    f.route?.reveal(0);
    f.holder.position.copy(f.home);
    this.setPin('send', f.drop, false);
  }

  /** The rose's « close »: a click elsewhere puts the piece back, once the visitor holds it. */
  dismiss(): void {
    if (this.front && !this.front.auto) this.resetFront(false);
  }

  private tickFront(dt: number, t: number): void {
    const f = this.front;
    if (f === null) return;
    f.timer += dt;
    const holder = f.holder;
    const still = this.still;
    if (f.state === 'rest' && f.auto && f.timer > (still ? 0.6 : 1.6)) this.lift();
    if (f.state === 'carried') {
      if (f.auto) {
        f.target.copy(f.home).lerp(this.at(PLACES.verdun, 0.1, 0.25), smooth(f.timer / 2.4));
        if (f.timer > 2.8) this.place(f.target);
      }
      if (f.state === 'carried') {
        f.carry.lerp(f.target, still ? 1 : 1 - Math.exp(-dt * 7));
        const rise = still ? 1 : smooth(f.timer / 0.3);
        holder.position.set(
          f.carry.x,
          SHEET_Y + rise * 0.6 + (still ? 0 : Math.sin(t * 3) * 0.02 * rise),
          f.carry.z,
        );
        holder.rotation.z = still ? 0 : Math.sin(t * 2.3) * 0.06;
        holder.rotation.x = still ? 0 : (f.target.x - f.carry.x) * 0.12;
      }
    } else if (f.state === 'placed' || f.state === 'confirm') {
      const k = still ? 1 : clamp01(f.timer / 0.35);
      const bounce =
        k < 1
          ? (1 - k) * 0.6
          : Math.max(0, Math.sin((f.timer - 0.35) * 14) * 0.04 * Math.exp(-(f.timer - 0.35) * 6));
      if (f.state === 'placed') holder.position.set(f.drop.x, SHEET_Y + bounce, f.drop.z);
      holder.rotation.set(0, holder.rotation.y, 0);
      if (f.auto && f.state === 'placed' && f.timer > 1.6) this.choose('march');
      else if (f.auto && f.state === 'confirm' && f.timer > 1.8) this.send();
    } else if (f.state === 'sent') {
      f.route?.reveal(still ? 1 : f.timer / 1.1);
      const walk = still ? 1 : clamp01((f.timer - 0.9) / 4.2);
      const p = along(f.path, walk);
      holder.position.set(p.x, SHEET_Y, p.z);
      holder.rotation.y = headingAt(f.path, Math.min(walk, 0.99));
      const walking = walk > 0 && walk < 1;
      if (f.squad) stride(f.squad.object, walking ? t : null);
      if (walking && Math.floor(t * 5) !== Math.floor((t - dt) * 5))
        this.moments.puff(p.clone().setY(SHEET_Y + 0.067), {
          color: '#b7a27a',
          size: 0.17,
          grow: 1.6,
          life: 1.2,
          rise: 0.1,
          opacity: 0.4,
        });
      if (walk >= 1 && !f.arrived) {
        f.arrived = true;
        if (f.order === 'found') {
          f.reach = ribbon(
            this.scene,
            circle(f.drop, OUTPOST_REACH_KM_BY_LEVEL[1]! / KM_PER_UNIT),
            0.04,
            PALETTE.border,
            { opacity: 0.8 },
          );
        }
        this.moments.stamp(
          f.order === 'found' ? fr.front.founded : fr.stamps.arrived,
          hourOf(FRONT_HOUR + f.minutes),
          f.drop.clone().add(new Vector3(0.8, 0, 0.53)),
        );
      }
      f.reach?.reveal(still ? 1 : (f.timer - 5.1) / 1.2);
      if (f.timer > 11 && f.auto) this.resetFront(true);
    }
    this.setPin('pile', holder.position.clone().setY(0.73), f.state === 'rest');
  }

  private frontStory(): Story['front'] {
    const f = this.front;
    const step =
      f === null
        ? 0
        : { rest: 0, carried: 1, placed: 2, confirm: 3, sent: 4 }[f.state] + (f?.arrived ? 1 : 0);
    return {
      step,
      rose:
        f !== null && f.state === 'placed' && f.timer > (this.still ? 0 : 0.2)
          ? this.screen(f.drop)
          : null,
      confirm: f !== null && f.state === 'confirm' ? f.order : null,
      place: f?.place ?? null,
      km: f?.km ?? 0,
      minutes: Math.round(FRONT_HOUR + (f?.minutes ?? 0)),
      sent: f !== null && f.state === 'sent',
    };
  }

  // ----- page 3 : a column crosses my outpost's reach, and is left as a date -----

  private fog: {
    t: number;
    post: Vector3;
    ring: Ribbon;
    flag: Mesh;
    path: Vector3[];
    first: number;
    last: number;
    trace: Ribbon;
    heading: Ribbon;
    exit: Vector3;
    mark: Mesh<PlaneGeometry, MeshBasicMaterial>;
    objects: Object3D[];
  } | null = null;

  private buildFog(): void {
    const before = new Set(this.scene.children);
    const post = this.at(PLACES.metz, 1.2, -1.6);
    const outpost = mast(INK_BY_NATION.france, 1);
    outpost.group.position.copy(post);
    this.scene.add(outpost.group);
    const reach = OUTPOST_REACH_KM_BY_LEVEL[3]! / KM_PER_UNIT;
    const ring = ribbon(this.scene, circle(post, reach), 0.033, PALETTE.border, {
      opacity: 0.75,
      dash: 0.2,
    });
    const path = bow(
      this.at(PLACES.saarbrucken, 4.2, -2.2),
      this.at(PLACES.nancy, 0.8, 1.6),
      0.08,
      160,
    );
    const seen = path.map((p) => p.distanceTo(post) < reach);
    const first = seen.indexOf(true);
    const last = seen.lastIndexOf(true);
    const trace = ribbon(
      this.scene,
      path.slice(first, last + 1),
      0.087,
      ARC_COLORS.enemyDetected.trace,
      {
        opacity: 0.9,
        dash: 0.23,
      },
    );
    const exit = path[last]!.clone();
    const ahead = exit
      .clone()
      .sub(path[last - 4]!)
      .normalize()
      .multiplyScalar(0.73);
    const heading = ribbon(
      this.scene,
      [exit.clone(), exit.clone().add(ahead)],
      0.04,
      ARC_COLORS.enemyDetected.trace,
      { opacity: 0.8 },
    );
    const mark = surveyMark(fr.front.pages.fog.time, 1.44);
    this.scene.add(mark);
    this.fog = {
      t: 0,
      post,
      ring,
      flag: outpost.cloth,
      path,
      first,
      last,
      trace,
      heading,
      exit,
      mark,
      objects: this.scene.children.filter((child) => !before.has(child)),
    };
    this.showFog(false);
  }

  private showFog(on: boolean): void {
    const fog = this.fog;
    if (fog === null) return;
    fog.t = 0;
    for (const object of fog.objects) object.visible = on;
    fog.mark.visible = false;
    for (const r of [fog.ring, fog.trace, fog.heading]) r.reveal(0);
    this.setPin('post', fog.post.clone().setY(0.97), on);
    this.setPin('survey', fog.exit.clone().setY(1.0), false);
  }

  private tickFog(dt: number, t: number): void {
    const fog = this.fog;
    if (fog === null) return;
    fog.t += dt;
    const T = this.still ? 99 : fog.t;
    fog.ring.reveal(T / 1.2);
    if (!this.still) fog.flag.rotation.y = Math.sin(t * 2.4) * 0.25;
    const move = clamp01((T - 1.2) / 5.5);
    const index = move * (fog.path.length - 1);
    const passed = index > fog.last;
    if (!passed) {
      fog.mark.visible = index >= fog.first;
      fog.mark.position.copy(along(fog.path, move)).setY(SHEET_Y + 0.023);
      fog.trace.reveal((index - fog.first) / (fog.last - fog.first));
      fog.mark.material.opacity = 1;
    } else {
      fog.trace.reveal(1);
      fog.heading.reveal(1);
      fog.mark.visible = true;
      fog.mark.position.copy(fog.exit).setY(SHEET_Y + 0.023);
      const faded = this.age / 24;
      fog.mark.material.opacity = 1 - faded * 0.8;
      fog.trace.material.opacity = 0.9 - faded * 0.6;
      fog.heading.material.opacity = 0.8 - faded * 0.5;
    }
    this.setPin('survey', fog.exit.clone().setY(1.0), passed);
    // Two posters do not fit side by side on a phone: the survey, once written, takes the place.
    this.setPin('post', fog.post.clone().setY(0.97), !(passed && innerWidth <= 760));
  }

  // ----- page 4 : the assault, in open field; then the infantry takes a neutral town -----

  private battle: {
    t: number;
    town: Vector3;
    them: Vector3;
    mine: Vector3;
    squad: Figurine | null;
    squadHome: Vector3;
    tank: Figurine | null;
    foe: Figurine | null;
    foeHome: Vector3;
    foeTank: Figurine | null;
    foeTankHome: Vector3;
    foeMaterials: Material[];
    flag: Group;
    cloth: Mesh;
    shots: { ribbon: Ribbon; delay: number; age: number; to: Vector3; hit: boolean }[];
    path: Vector3[];
    struck: boolean;
    answered: boolean;
    taken: boolean;
    objects: Object3D[];
  } | null = null;

  private buildBattle(): void {
    const before = new Set(this.scene.children);
    const berne = PLACES.berne;
    const town = this.at(berne, 0.2, -0.3);
    const them = this.at(berne, -0.75, 0.55);
    const mine = this.at(berne, -2.35, 0.95);
    this.maquette('billets', 0.8, town, 0.35);
    const toThem = Math.atan2(them.x - mine.x, them.z - mine.z);
    const place = (figurine: Figurine | null, at: Vector3, yaw: number) => {
      if (figurine === null) return;
      figurine.object.position.copy(at);
      figurine.object.rotation.y = yaw;
      this.scene.add(figurine.object);
    };
    const squadHome = mine.clone().add(new Vector3(-0.4, 0, 0.07));
    const squad = this.piece('france', 'infantry', [1, 1, 1]);
    place(squad, squadHome, toThem);
    const tank = this.piece('france', 'armor', [2]);
    place(tank, mine.clone().add(new Vector3(0.43, 0, 0.03)), toThem);
    const foeHome = them.clone().add(new Vector3(-0.37, 0, 0));
    const foe = this.piece('germany', 'infantry', [1, 1, 1]);
    place(foe, foeHome, toThem + Math.PI);
    const foeTankHome = them.clone().add(new Vector3(0.43, 0, -0.07));
    const foeTank = this.piece('germany', 'armor', [2]);
    place(foeTank, foeTankHome, toThem + Math.PI);
    const foeMaterials: Material[] = [];
    // Under fire one sees who one faces — in its own colours, faded as it falls back.
    for (const figurine of [foe, foeTank])
      void figurine?.ready.then(
        () =>
          figurine.object.traverse((part) => {
            const mesh = part as Mesh;
            if (!mesh.isMesh || mesh.userData.ground) return;
            mesh.material = (mesh.material as Material).clone();
            (mesh.material as Material).transparent = true;
            foeMaterials.push(mesh.material as Material);
          }),
        () => undefined,
      );
    const flag = mast(INK_BY_NATION.france, 0.92);
    flag.group.position.copy(town).add(new Vector3(-0.5, 0, 0.3));
    this.scene.add(flag.group);
    this.battle = {
      t: 0,
      town,
      them,
      mine,
      squad,
      squadHome,
      tank,
      foe,
      foeHome,
      foeTank,
      foeTankHome,
      foeMaterials,
      flag: flag.group,
      cloth: flag.cloth,
      shots: [],
      path: this.routeAround(squadHome, town.clone().add(new Vector3(-0.53, 0, 0.67))),
      struck: false,
      answered: false,
      taken: false,
      objects: this.scene.children.filter((child) => !before.has(child)),
    };
    this.showBattle(false);
  }

  private men(figurine: Figurine | null): Object3D[] {
    const men: Object3D[] = [];
    figurine?.object.traverse((part) => {
      if (part.userData.stride !== undefined) men.push(part);
    });
    return men;
  }

  /** Puts the assault back to its first second: « rejouer ». */
  replayAssault(): void {
    this.showBattle(this.current === 'battle');
  }

  private showBattle(on: boolean): void {
    const b = this.battle;
    if (b === null) return;
    b.t = 0;
    b.struck = b.answered = b.taken = false;
    for (const object of b.objects) object.visible = on;
    b.flag.visible = false;
    for (const shot of b.shots) this.scene.remove(shot.ribbon);
    b.shots = [];
    for (const man of [...this.men(b.squad), ...this.men(b.foe)]) {
      man.rotation.x = 0;
      man.visible = true;
    }
    if (b.squad) stride(b.squad.object, null);
    if (b.foe) stride(b.foe.object, null);
    b.squad?.object.position.copy(b.squadHome);
    b.foe?.object.position.copy(b.foeHome);
    b.foeTank?.object.position.copy(b.foeTankHome);
    for (const m of b.foeMaterials) m.opacity = 1;
    this.moments.clear();
    for (const key of ['foe', 'town', 'capture']) this.setPin(key, new Vector3(), false);
  }

  private fire(from: Vector3, to: Vector3, delay: number, width: number): void {
    const points = bow(from, to, (Math.random() - 0.5) * 0.25, 24);
    this.battle!.shots.push({
      ribbon: ribbon(this.scene, points, width, PALETTE.border, { opacity: 0.9, y: SHEET_Y + 0.3 }),
      delay,
      age: 0,
      to,
      hit: false,
    });
  }

  private tickBattle(dt: number, t: number): void {
    const b = this.battle;
    if (b === null) return;
    b.t += dt;
    const T = this.still ? 30 : b.t;
    const foeAt = b.foe?.object.position ?? b.foeHome;
    const foeTankAt = b.foeTank?.object.position ?? b.foeTankHome;
    const squadAt = b.squad?.object.position ?? b.squadHome;
    const tankAt = b.tank?.object.position ?? b.mine;
    if (T >= ASSAULT.strike && !b.struck) {
      b.struck = true;
      [squadAt, tankAt].forEach((from, i) => {
        this.fire(from, foeAt, i * 0.12, 0.027);
        this.fire(from, foeTankAt, 0.22 + i * 0.12, 0.027);
      });
      this.moments.stamp(
        fr.stamps.engaged,
        fr.front.pages.battle.time,
        b.mine
          .clone()
          .lerp(b.them, 0.5)
          .add(new Vector3(-1.13, 0, 0)),
        1.47,
      );
    }
    if (T >= ASSAULT.riposte && !b.answered) {
      b.answered = true;
      this.fire(foeTankAt, tankAt, 0, 0.017);
      this.fire(foeAt, squadAt, 0.15, 0.017);
    }
    for (const shot of b.shots) {
      shot.age += dt;
      const local = this.still ? 2 : shot.age - shot.delay;
      shot.ribbon.reveal(local / 0.35);
      shot.ribbon.material.opacity = local < 0.35 ? 0.9 : Math.max(0, 0.9 - (local - 0.35) * 0.9);
      if (local > 0.3 && !shot.hit) {
        shot.hit = true;
        this.moments.puff(shot.to.clone().setY(SHEET_Y + 0.27), {
          color: '#ffc46b',
          size: 0.3,
          grow: 0.8,
          life: 0.35,
          rise: 0,
          opacity: 0.9,
          glow: true,
        });
        this.moments.puff(shot.to.clone().setY(SHEET_Y + 0.2), {
          color: '#6b625a',
          size: 0.27,
          grow: 2,
          life: 2.2,
          rise: 0.13,
          opacity: 0.4,
        });
      }
    }
    const lost = this.men(b.foe)[1];
    const rout = smooth((T - ASSAULT.rout) / 1.4);
    if (lost) {
      lost.rotation.x = (-smooth((T - 2.4) / 0.5) * Math.PI * 0.98) / 2;
      lost.visible = rout < 0.05;
    }
    if (!this.still && T > 2.6 && T < 6 && Math.floor(t * 3) !== Math.floor((t - dt) * 3))
      this.moments.puff(foeTankAt.clone().setY(SHEET_Y + 0.2), {
        color: '#3a342e',
        size: 0.13,
        grow: 2.4,
        life: 2.4,
        rise: 0.3,
        opacity: 0.4,
      });
    const back = new Vector3(1.4, 0, 0.4).multiplyScalar(rout);
    b.foe?.object.position.copy(b.foeHome).add(back);
    b.foeTank?.object.position.copy(b.foeTankHome).add(back);
    for (const m of b.foeMaterials) m.opacity = 1 - rout * 0.9;
    if (b.foe) stride(b.foe.object, rout > 0 && rout < 1 ? t : null);
    const walk = clamp01((T - ASSAULT.walk) / 1.8);
    const wp = along(b.path, smooth(walk));
    b.squad?.object.position.set(wp.x, SHEET_Y, wp.z);
    if (b.squad && walk > 0 && walk < 1)
      b.squad.object.rotation.y = headingAt(b.path, Math.min(0.99, smooth(walk)));
    if (b.squad) stride(b.squad.object, walk > 0 && walk < 1 ? t : null);
    if (T >= ASSAULT.taken && !b.taken) {
      b.taken = true;
      b.flag.visible = true;
      this.moments.stamp(
        fr.stamps.captured,
        fr.front.pages.battle.takenAt,
        b.town.clone().add(new Vector3(0.87, 0, 0.53)),
        1.53,
      );
    }
    if (b.flag.visible && !this.still) b.cloth.rotation.y = Math.sin(t * 2.4) * 0.25;
    this.setPin('foe', b.them.clone().setY(1.13), T > 0.1 && T < ASSAULT.rout);
    this.setPin('town', b.town.clone().setY(1.2), T > 5.4);
    this.setPin(
      'capture',
      b.town.clone().add(new Vector3(-1.3, 0.6, 0.6)),
      T > ASSAULT.capture && T < ASSAULT.taken + 0.8,
    );
    if (!this.still && T > ASSAULT.again) this.showBattle(true);
  }

  private battleStory(): Story['battle'] {
    const b = this.battle;
    const T = b === null ? 0 : this.still ? 30 : b.t;
    return {
      step: ['order', 'strike', 'riposte', 'rout', 'capture'].indexOf(assaultStepAt(T)),
      order:
        b !== null && this.current === 'battle' && T < ASSAULT.strike ? this.screen(b.them) : null,
      capture: Math.round(captureShareAt(T) * 100) / 100,
      taken: b?.taken ?? false,
    };
  }

  // ----- page 5 : the race for the Seven -----

  private race: { point: RacePoint; group: Group; cloth: Mesh }[] = [];

  private buildRace(): void {
    for (const point of Object.keys(RACE_POINTS) as RacePoint[]) {
      const pennant = mast(PALETTE.paper, 4.2);
      pennant.group.position.copy(this.at(RACE_POINTS[point]));
      pennant.group.visible = false;
      this.scene.add(pennant.group);
      this.race.push({ point, group: pennant.group, cloth: pennant.cloth });
      this.setPin(`race:${point}`, pennant.group.position.clone().setY(3.83), false);
    }
  }

  private showRace(on: boolean): void {
    for (const { point, group } of this.race) {
      group.visible = on;
      this.setPin(`race:${point}`, group.position.clone().setY(3.83), on);
    }
  }

  private tickRace(t: number, progress: number): void {
    const { holders } = raceAt(progress);
    for (const { point, cloth } of this.race) {
      const holder = holders[point];
      ((cloth.material as MeshStandardMaterial).color as Color).set(
        holder === undefined ? PALETTE.paper : INK_BY_NATION[holder],
      );
      if (!this.still) cloth.rotation.y = Math.sin(t * 2 + point.length) * 0.3;
    }
  }

  // ---------- the loop ----------

  private setPin(key: string, anchor: Vector3, on: boolean): void {
    const pin = this.pins.get(key);
    if (pin) {
      pin.anchor.copy(anchor);
      pin.on = on;
    } else this.pins.set(key, { el: null, anchor: anchor.clone(), on, fit: null });
  }

  private screen(point: Vector3): readonly [number, number] {
    const v = point.clone().project(this.camera);
    return [
      Math.round((v.x * 0.5 + 0.5) * innerWidth),
      Math.round((-v.y * 0.5 + 0.5) * innerHeight),
    ];
  }

  private enter(name: SceneName): void {
    if (name === 'front') this.resetFront(true);
    if (name === 'fog') this.showFog(true);
    if (name === 'battle') this.showBattle(true);
    if (name === 'race') this.showRace(true);
  }

  private leave(name: SceneName): void {
    if (name === 'front') this.resetFront(true);
    if (name === 'fog') this.showFog(false);
    if (name === 'battle') this.showBattle(false);
    if (name === 'race') this.showRace(false);
  }

  private keys(): Record<SceneName, Key> {
    const { paris, london, metz, berne, lille, vienna } = PLACES;
    const { lisbon, baku, narvik, suez } = RACE_POINTS;
    return {
      hero: { at: () => this.at(london, 0.6, 2.4), dist: 13.3, phi: 0.98, theta: -0.22 },
      front: { at: () => this.at(paris, 2.2, -0.6), dist: 11, phi: 0.92, theta: 0.12 },
      fog: { at: () => this.at(metz, 1.2, -1.2), dist: 11.3, phi: 0.82, theta: -0.18 },
      battle: { at: () => this.at(berne, -1.0, 0.45), dist: 9, phi: 0.95, theta: -0.25 },
      race: {
        at: () => {
          const west = this.at(lisbon);
          const east = this.at(baku);
          const north = this.at(narvik);
          const south = this.at(suez);
          return new Vector3((west.x + east.x) / 2 + 4, SHEET_Y, (north.z + south.z) / 2 + 1);
        },
        dist: 115,
        phi: 0.2,
        theta: 0,
      },
      night: { at: () => this.at(vienna, 0, 1), dist: 72, phi: 0.36, theta: 0 },
      press: { at: () => this.at(lille, -0.4, 1.3), dist: 10, phi: 0.95, theta: 0.5 },
      bureau: { at: () => this.at(paris, 3, 1), dist: 40, phi: 0.7, theta: 0.2 },
    };
  }

  private readonly keyframes = this.keys();

  private aimCamera(dt: number, name: SceneName, progress: number): number {
    const key = this.keyframes[name];
    const target = key.at();
    const narrow = innerWidth <= 760;
    const zoomOut = name === 'hero' ? 1.9 : name === 'race' ? 2.5 : name === 'night' ? 1.55 : 1.7;
    let dist = key.dist * (narrow ? zoomOut : 1);
    if (name === 'race') dist *= 1 - progress * 0.06;
    const now = performance.now();
    let theta = key.theta;
    if (!this.still && name === 'bureau') theta += Math.sin(now / 14000) * 0.12;
    if (!this.still && name === 'hero') theta += Math.sin(now / 9000) * 0.05;
    const [fx, fy] = this.reading.focus;
    const want = { x: target.x, z: target.z, dist, phi: key.phi, theta, fx, fy };
    const f = !this.camKnown || this.still ? 1 : 1 - Math.exp(-dt * 2.2);
    for (const k of Object.keys(want) as (keyof typeof want)[])
      this.cam[k] =
        (k === 'fx' || k === 'fy') && name === 'hero' ? want[k] : lerp(this.cam[k], want[k], f);
    this.camKnown = true;
    const c = this.cam;
    const look = new Vector3(c.x, SHEET_Y, c.z);
    this.camera.position.set(
      c.x + c.dist * Math.sin(c.phi) * Math.sin(c.theta),
      c.dist * Math.cos(c.phi),
      c.z + c.dist * Math.sin(c.phi) * Math.cos(c.theta),
    );
    this.camera.lookAt(look);
    const w = innerWidth;
    const h = innerHeight;
    this.camera.setViewOffset(w, h, -(c.fx - w / 2), -(c.fy - h / 2), w, h);
    this.lamp.follow(look, c.dist);
    return c.dist;
  }

  private readonly resize = () => {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.lastCam = '';
  };

  private readonly tick = () => {
    if (!this.running) return;
    this.frameId = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const { scene: name, progress } = this.reading;
    if (name !== this.current) {
      if (this.current !== null) this.leave(this.current);
      this.current = name;
      this.prepare(name);
      const order: SceneName[] = ['hero', 'front', 'fog', 'battle', 'race'];
      const next = order[order.indexOf(name) + 1];
      if (next) this.prepare(next);
      this.enter(name);
    }
    if (this.front)
      this.front.holder.visible = name === 'hero' || name === 'front' || name === 'press';
    this.tickHero(dt, t);
    if (name === 'front') this.tickFront(dt, t);
    if (name === 'fog') this.tickFog(dt, t);
    if (name === 'battle') this.tickBattle(dt, t);
    if (name === 'race') this.tickRace(t, progress);
    this.moments.tick(dt);

    const dist = this.aimCamera(dt, name, progress);
    const instant = name === 'night' ? nightInstant(progress, this.today) : dayInstant(this.today);
    const looked = this.lonLatOf(new Vector3(this.cam.x, 0, this.cam.z));
    this.night.apply(instant, looked, dist);
    for (const [city, lonLat] of Object.entries(NIGHT_CITIES))
      this.setPin(
        `city:${city}`,
        this.at(lonLat).setY(0.4),
        name === 'night' && nightAt(instant, lonLat) > 0.6,
      );

    const camKey = [this.camera.position.toArray(), this.cam.fx, this.cam.fy, instant]
      .flat()
      .map((n) => n.toFixed(3))
      .join();
    const moving = camKey !== this.lastCam;
    this.lastCam = camKey;
    if (!this.still || moving || this.moments.busy || PLAYING_SCENES.has(name))
      this.renderer.render(this.scene, this.camera);
    this.placePins();

    const story: Story = { front: this.frontStory(), battle: this.battleStory() };
    const key = JSON.stringify(story);
    if (key !== this.lastStory) {
      this.lastStory = key;
      this.onStory(story);
    }
  };

  /**
   * Moves each shown pin over its anchor. A poster that would leave the screen is held inside
   * it, and its stem (`--stem`, `poster.css`) slants back to the piece.
   */
  private placePins(): void {
    const v = new Vector3();
    for (const pin of this.pins.values()) {
      if (pin.el === null) continue;
      v.copy(pin.anchor).project(this.camera);
      const shown = pin.on && v.z < 1;
      pin.el.style.visibility = shown ? 'visible' : 'hidden';
      if (!shown) continue;
      const card = pin.el.querySelector<HTMLElement>('.map-poster');
      // Measured once, on screen: a `.hud` poster is zoomed, and its stem is written unzoomed.
      pin.fit ??=
        card === null
          ? { half: 0, zoom: 1 }
          : {
              half: card.getBoundingClientRect().width / 2,
              zoom: card.getBoundingClientRect().width / card.offsetWidth,
            };
      const x = (v.x * 0.5 + 0.5) * innerWidth;
      const held = Math.min(Math.max(x, pin.fit.half + 8), innerWidth - pin.fit.half - 8);
      card?.style.setProperty('--stem', `${(x - held) / pin.fit.zoom}px`);
      pin.el.style.transform = `translate(${held}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
    }
  }

  // ---------- the visitor's hand ----------

  private aim(event: PointerEvent): void {
    this.ray.setFromCamera(
      new Vector2((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1),
      this.camera,
    );
  }

  private onPiece(): boolean {
    const f = this.front;
    if (f === null) return false;
    if (this.ray.intersectObject(f.holder, true).length > 0) return true;
    const p = new Vector3();
    return (
      this.ray.ray.intersectPlane(this.ground, p) !== null && p.distanceTo(f.holder.position) < 0.3
    );
  }

  private readonly onDown = (event: PointerEvent) => {
    this.down = [event.clientX, event.clientY];
  };

  private readonly onMove = (event: PointerEvent) => {
    const f = this.front;
    if (this.current !== 'front' || f === null) return;
    this.aim(event);
    if (f.state === 'carried' && !f.auto) this.ray.ray.intersectPlane(this.ground, f.target);
    this.canvas.style.cursor =
      f.state === 'carried' ? 'grabbing' : f.state === 'rest' && this.onPiece() ? 'grab' : '';
  };

  private readonly onUp = (event: PointerEvent) => {
    const down = this.down;
    this.down = null;
    const f = this.front;
    if (down === null || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 6) return;
    if (this.current !== 'front' || f === null) return;
    this.aim(event);
    const onPiece = this.onPiece();
    const point = new Vector3();
    if (this.ray.ray.intersectPlane(this.ground, point) === null) return;
    if (f.state === 'rest' && onPiece) {
      f.auto = false;
      this.lift();
      f.target.copy(f.home);
    } else if (f.state === 'carried') {
      f.auto = false;
      if (onPiece && f.carry.distanceTo(f.home) < 0.5) this.resetFront(false);
      else this.place(point);
    } else if (f.state !== 'rest' && !f.auto) this.resetFront(false);
  };

  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.current === 'front' && this.front?.state !== 'rest')
      this.resetFront(false);
  };
}
