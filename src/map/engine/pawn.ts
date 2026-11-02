import {
  DoubleSide,
  type Frustum,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Shape,
  ShapeGeometry,
  Sphere,
  Vector3,
} from 'three';
import type { Wear } from '@/domain/pile-pieces';
import type { UnitRole } from '@/domain/ids';
import type { Medium } from '@/domain/routing';
import { faceCamera } from './billboard';
import {
  altitudeShadow,
  ANONYMOUS_SPAN,
  FIGURINE_SCALE,
  LAID_OUT_FOR,
  troopScale,
  troopWeight,
  type Figurine,
} from './figurines/figurine';
import { PLATE_WIDTH, SILHOUETTES } from './silhouettes';
import { PLUME_BY_WEAR, Smoke, Wake, type Plume } from './smoke';
import { gaitOf, swayOf, type Gait } from './sway';
import { blacken } from './standing';
import { releaseInk } from './annotations';
import { strideOf } from './figurines/infantry';
import { pointOnLeg, type ThreadLeg } from './thread';

/** A share of the camera distance: the silhouette keeps its size on screen. */
const PAWN_SILHOUETTE_SHARE = 0.018;

/** Below this gap a plane is on the ground: a shadow glued under it would say nothing. */
const AIRBORNE_GAP = 0.05;

/**
 * **The dust a vehicle raises on the road** (`table-etat-major.html`, `dust`): low, short-lived,
 * thrown back behind it. In model units, from the rear of a tank 2.6 long.
 */
const DUST: Plume = {
  puffs: 7,
  life: 1.1,
  rise: 0.55,
  lean: 3.6,
  size: [0.5, 1.6],
  opacity: 0.5,
  color: '#b9a684',
};
const DUST_REAR = 1.1;

/** **One piece of my column on the road** (#276): a group of the pile at rest, dressed. */
export type ColumnPiece = {
  readonly figurine: Figurine;
  readonly role: UnitRole;
  readonly wear: Wear;
  /** Its group's first troop: what the pile at rest finds it by at the arrival (#362). */
  readonly troopId: string;
};

/** The leg the head walks and its share of it: the file is sampled behind it on the same leg. */
export type Road = { readonly leg: ThreadLeg; readonly local: number };

/** How a man stands in the file: once posed still, he is not posed again until he walks. */
type Posed = 'walking' | 'held' | 'still' | null;

type Marcher = {
  readonly figurine: Figurine;
  readonly troopId: string;
  readonly gait: Gait | null;
  readonly smoke: Smoke | null;
  /** To the right of the file's axis, in board units at the figurine's own size. */
  readonly side: number;
  /** Its men, found once their files have landed; none for a vehicle. */
  men: ReadonlyArray<Object3D>;
  posed: Posed;
};

/** A rank of the file, and how far behind the head it walks at the figurines' own size. */
type Rank = { readonly back: number; readonly marchers: ReadonlyArray<Marcher> };

/** **A piece of my file as last laid out** (#362), on the board (`lastFile`). */
export type FilePiece = {
  readonly troopId: string;
  readonly at: Vector3;
  readonly heading: number;
  readonly back: number;
  readonly side: number;
};
/** The road a closed file leaves, sampled from its head to its last piece. */
const ROAD_SAMPLES = 24;

/** **Au-delà de quatre pièces, la file se double** (storyboard, 31/10). */
const SINGLE_FILE = 4;
/**
 * **The file's spacing** (`storyboard-marche/commun/marche.js`, `plan`): between two ranks, half
 * of each one's length and `RANK_GAP` of `g`, itself `GAP_PER_LONGEST` of the longest piece; a
 * lane `LANE_SIDE` of `g` off the axis.
 */
const RANK_GAP = 0.35;
const GAP_PER_LONGEST = 1.35;
const LANE_SIDE = 0.42;
/** A squad keeps its triangle on the road (`squadOf`): this deep, in its men's height.
 *  @a-mesurer */
const SQUAD_DEPTH = 0.8;
/** The storyboard reckons men 1.92 of their height long against `g` (`1.6 × manH × 1.2`). */
const SQUAD_REACH = 1.92;

/** **Where each piece walks behind the head**, by its length: ranks of one, or two abreast
 *  beyond `SINGLE_FILE`; in board units at the figurines' own size. */
function fileOf(
  pieces: ReadonlyArray<{ readonly span: number; readonly infantry: boolean }>,
): ReadonlyArray<{ readonly back: number; readonly side: number; readonly rank: number }> {
  const lanes = pieces.length > SINGLE_FILE ? 2 : 1;
  const lengthOf = ({ span, infantry }: (typeof pieces)[number]) =>
    infantry ? SQUAD_DEPTH * span : span;
  const g =
    GAP_PER_LONGEST *
    Math.max(...pieces.map(({ span, infantry }) => (infantry ? SQUAD_REACH * span : span)));
  const ranks = Math.ceil(pieces.length / lanes);
  const lengths = Array.from({ length: ranks }, (_, r) =>
    Math.max(...pieces.slice(r * lanes, (r + 1) * lanes).map(lengthOf)),
  );
  const backs = [0];
  for (let r = 1; r < ranks; r++)
    backs.push(backs[r - 1]! + (lengths[r - 1]! + lengths[r]!) / 2 + RANK_GAP * g);
  return pieces.map((_, k) => ({
    back: backs[Math.floor(k / lanes)]!,
    side: lanes === 1 ? 0 : (k % 2 === 0 ? -1 : 1) * LANE_SIDE * g,
    rank: Math.floor(k / lanes),
  }));
}
/** **En réduites, les hommes tenus en mi-foulée** : the storyboard's frozen phase, 1.2 rad on
 *  each man's own, in seconds of `stride` (9 rad/s). */
const HELD_STRIDE_S = 1.2 / 9;
/** A piece still walks this long after its head last moved: two views served in one instant
 *  must not snap its men upright for a frame. */
const WALKING_MS = 250;

const AT = new Vector3();
const AHEAD = new Vector3();
const BEFORE = new Vector3();
const REACH = new Sphere();

/** A vehicle's dust on the road, thrown back behind it. */
function dustOn(figurine: Figurine): Smoke {
  const dust = new Smoke(DUST);
  dust.object.scale.setScalar(FIGURINE_SCALE);
  dust.object.position.set(0, 0.1 * FIGURINE_SCALE, -DUST_REAR * FIGURINE_SCALE);
  // A puff leans along its +x: turned, it is thrown back behind the vehicle.
  dust.object.rotation.y = Math.PI / 2;
  dust.object.visible = false;
  figurine.object.add(dust.object);
  return dust;
}

/** A worn vehicle smokes on the move as it does standing (ADR 0026 §5); `null` for none. */
function smokeOn(figurine: Figurine, worn: Wear): Smoke | null {
  const plume = PLUME_BY_WEAR[worn];
  if (plume === null) return null;
  const smoke = new Smoke(plume);
  void figurine.ready.then(
    () => {
      figurine.object.getObjectByName('fx_smoke')?.add(smoke.object);
      if (worn === 'burning') blacken(figurine.object);
    },
    () => {},
  );
  return smoke;
}

/**
 * A movement's pawn: a single piece over the whole route, changing costume at the dock and
 * standing still during the transfer.
 *
 * **Up close each medium wears its figurine** (ADR 0026 §3), at its real size (ADR 0035), until
 * it is too small on screen (`troopWeight`); a medium with none wears the anonymous silhouette
 * in its place. **Far away the
 * pawn is gone**: the movement's pin stands at its head (#234, `pins.ts`).
 */
export class Pawn {
  readonly object = new Group();
  private readonly costumes = new Map<Medium, Group>();
  private readonly figurines = new Map<Medium, Figurine>();
  private readonly color: string;
  private readonly smokes = new Map<Medium, Smoke>();
  private readonly gaits = new Map<Medium, Gait>();
  /** Raised by a vehicle that rolls on land, `null` for any other piece. */
  private dust: Smoke | null = null;
  /** Its road bends here — positive to the left —, and it has gone forward since the last frame. */
  private turn = 0;
  private moving = false;
  /** Full motion only: reduced and cut motion leave every piece upright and the road clear. */
  private lively = false;
  private readonly wake = new Wake();
  private readonly shadow = altitudeShadow();
  /** Height of the ground under the pawn, relative to it: zero, or below a plane. */
  private groundBelow = 0;
  private medium: Medium = 'land';
  private westward = false;
  private heading = 0;
  /** The effects' clock: it only runs while `step` is called, so reduced motion stills them. */
  private clock = 0;
  /** Reduced motion: the men hold mid-stride rather than standing. */
  private held = false;
  /** **My column on land** (#276), in the order of the pile at rest; `null` wears one figurine. */
  private readonly file: Group | null = null;
  private readonly ranks: ReadonlyArray<Rank> = [];
  private readonly marchers: ReadonlyArray<Marcher> = [];
  private readonly fileSpan: number = ANONYMOUS_SPAN;
  /** From the head to its last piece's far side, at the figurines' own size. */
  private readonly fileReach: number = 0;
  private road: Road | null = null;
  private movedAt = -Infinity;
  /** Its file was laid out at the last `orient`: in the field, and not yet its pin. */
  private laidOut = false;
  /** The figurines' size on the board at that `orient` (`troopScale`). */
  private drawn = 1;

  constructor(
    color: string,
    figurines: Readonly<Record<Medium, Figurine | null>> | null = null,
    /** My movement's wear per medium (`movementWear`); `null` for anything not mine. */
    wear: Readonly<Record<Medium, Wear>> | null = null,
    /** My movement's roles per medium (`movementRoles`), what says how each rides; `null` for
     *  anything not mine — an enemy block neither jolts nor banks. */
    roles: Readonly<Record<Medium, UnitRole | null>> | null = null,
    /** My column's pieces on land (#276), dressed; `null` or empty wears the land figurine. */
    column: ReadonlyArray<ColumnPiece> | null = null,
  ) {
    this.color = color;
    const marching = column !== null && column.length > 0;
    for (const medium of ['land', 'sea', 'air'] as const) {
      if (medium === 'land' && marching) continue;
      const figurine = figurines?.[medium] ?? null;
      if (figurine === null) {
        const costume = this.buildSilhouette(medium);
        costume.visible = medium === this.medium;
        this.costumes.set(medium, costume);
        this.object.add(costume);
      } else {
        figurine.object.visible = false;
        this.figurines.set(medium, figurine);
        this.object.add(figurine.object);
        figurine.object.rotation.order = 'YXZ';
        const gait = gaitOf(roles?.[medium] ?? null);
        if (gait !== null) this.gaits.set(medium, gait);
        if (gait === 'rolling') this.dust = dustOn(figurine);
        const smoke = smokeOn(figurine, wear?.[medium] ?? 'whole');
        if (smoke !== null) this.smokes.set(medium, smoke);
      }
    }
    if (marching) {
      const file = new Group();
      file.visible = false;
      this.object.add(file);
      this.file = file;
      this.fileSpan = Math.max(...column.map(({ figurine }) => figurine.span));
      const places = fileOf(
        column.map(({ figurine, role }) => ({
          span: figurine.span,
          infantry: role === 'infantry',
        })),
      );
      this.marchers = column.map(({ figurine, role, wear: worn, troopId }, k) => {
        figurine.object.rotation.order = 'YXZ';
        file.add(figurine.object);
        const gait = gaitOf(role);
        // One dust for the column, raised by its first vehicle: a plume each would cost a call a puff.
        if (gait === 'rolling' && this.dust === null) this.dust = dustOn(figurine);
        const marcher: Marcher = {
          figurine,
          troopId,
          gait,
          // Infantry says its strength by its men (`figuresOf`): only a vehicle smokes.
          smoke: role === 'infantry' ? null : smokeOn(figurine, worn),
          side: places[k]!.side,
          men: [],
          posed: null,
        };
        if (role === 'infantry')
          void figurine.ready.then(
            () => {
              const men: Object3D[] = [];
              figurine.object.traverse((node) => {
                if (node.userData.stride !== undefined) men.push(node);
              });
              marcher.men = men;
              marcher.posed = null;
            },
            () => {},
          );
        return marcher;
      });
      this.ranks = [...new Set(places.map(({ rank }) => rank))].map((rank) => ({
        back: places.find((place) => place.rank === rank)!.back,
        marchers: this.marchers.filter((_, k) => places[k]!.rank === rank),
      }));
      this.fileReach =
        places.at(-1)!.back + Math.max(...places.map(({ side }) => Math.abs(side))) + this.fileSpan;
    }
    this.wake.object.name = 'wake';
    this.wake.object.visible = false;
    this.object.add(this.wake.object);
    this.shadow.name = 'shadow';
    this.shadow.visible = false;
    this.object.add(this.shadow);
  }

  set visible(value: boolean) {
    this.object.visible = value;
  }

  /** Its figurine or silhouette stands on the board, not yet given way to its pin. */
  get standing(): boolean {
    const worn =
      this.medium === 'land' && this.file !== null
        ? this.file
        : (this.figurines.get(this.medium)?.object ?? this.costumes.get(this.medium));
    return this.object.visible && worn?.visible === true;
  }

  /** The span it gives way to its pin by: its worn figurine's, a tank's for a silhouette. */
  get span(): number {
    if (this.medium === 'land' && this.file !== null) return this.fileSpan;
    return this.figurines.get(this.medium)?.span ?? ANONYMOUS_SPAN;
  }

  /**
   * The pawn's costume follows the medium of the segment beneath it. For an enemy movement
   * it is a silhouette and nothing else — land, sea or air, never the type nor the
   * composition (sheet 04): an identified movement's detail reads on its timeline card,
   * not here.
   */
  wear(medium: Medium): void {
    if (medium === this.medium) return;
    const leaving = this.costumes.get(this.medium);
    if (leaving) leaving.visible = false;
    const leavingFigurine = this.figurines.get(this.medium);
    if (leavingFigurine) leavingFigurine.object.visible = false;
    if (this.medium === 'land' && this.file !== null) this.file.visible = false;
    this.medium = medium;
    const entering = this.costumes.get(medium);
    if (entering) entering.visible = true;
  }

  /** `groundY` is the board's height under the point: a plane flies above it (`flightAltitude`). */
  place(
    position: Vector3,
    pointAhead: Vector3,
    groundY = position.y,
    turn = 0,
    /** The leg under the head, for the file behind it; `null` at a dock or on site. */
    road: Road | null = null,
  ): void {
    this.moving = !position.equals(this.object.position);
    if (this.moving) this.movedAt = performance.now();
    this.road = road;
    this.turn = turn;
    this.object.position.copy(position);
    this.groundBelow = groundY - position.y;
    this.westward = pointAhead.x < position.x;
    const dx = pointAhead.x - position.x;
    const dz = pointAhead.z - position.z;
    // At the end of its thread the point ahead is the point itself: the piece keeps the road it came by.
    if (dx !== 0 || dz !== 0) this.heading = Math.atan2(dx, dz);
  }

  /** What spins, sways and smokes on the worn figurine; `null` is motion not full — all still,
   *  the men `held` mid-stride in reduced motion. */
  step(elapsedSeconds: number | null, held = false): void {
    this.lively = elapsedSeconds !== null;
    this.held = held;
    if (elapsedSeconds === null) return;
    for (const { smoke } of this.marchers) smoke?.frame(this.clock);
    this.figurines.get(this.medium)?.spin(elapsedSeconds);
    this.clock += elapsedSeconds;
    if (this.wake.object.visible) this.wake.frame(this.clock);
    this.smokes.get(this.medium)?.frame(this.clock);
    if (this.dust?.object.visible) this.dust.frame(this.clock);
  }

  /**
   * The size is carried by the costume, not by `object`: the sprite and the silhouette have
   * neither the same screen share nor the same frame — one hangs under its point, the other
   * stands on it — and a common scale would make the pawn's size jump at the dock.
   */
  orient(
    cameraPosition: Vector3,
    yaw: number,
    /** The eye's field: a file wholly outside it is not laid out again. */
    inView: Frustum | null = null,
  ): void {
    const distance = this.object.position.distanceTo(cameraPosition);
    const figurine = this.figurines.get(this.medium);
    const span = this.span;
    const drawn = troopScale(distance, span);
    // The silhouette fades with it: its own size is a share of the screen.
    const close = troopWeight(distance, span);
    // The wake and the altitude disc are drawn for a tank: they follow the piece's own size.
    const around = drawn * (span / LAID_OUT_FOR);
    // Figurine or silhouette, a hull at sea up close stirs the water: the wake says « at sea ».
    this.wake.object.visible = this.medium === 'sea' && close > 0;
    this.wake.object.rotation.set(0, this.heading, 0);
    this.wake.object.scale.setScalar(around);
    // The gap between a plane and its shadow is its altitude: it opens at take-off and closes on landing.
    this.shadow.visible = this.medium === 'air' && close > 0 && -this.groundBelow > AIRBORNE_GAP;
    this.shadow.position.y = this.groundBelow;
    this.shadow.scale.setScalar(around);
    if (this.file !== null) {
      this.file.visible = this.medium === 'land' && close > 0;
      this.laidOut =
        this.file.visible &&
        (inView === null ||
          inView.intersectsSphere(REACH.set(this.object.position, this.fileReach * drawn)));
      if (this.laidOut) this.march(drawn);
    }
    const near = figurine === undefined ? 0 : close;
    if (figurine !== undefined) {
      figurine.object.visible = near > 0;
      const scale = drawn;
      const sway = swayOf(
        this.lively ? (this.gaits.get(this.medium) ?? null) : null,
        this.clock,
        this.moving,
        this.turn,
      );
      figurine.object.rotation.set(sway.pitch, figurine.facesEye ? yaw : this.heading, sway.roll);
      figurine.object.position.y = sway.lift * FIGURINE_SCALE * scale;
      figurine.object.scale.setScalar(scale);
      if (this.dust !== null)
        this.dust.object.visible =
          this.lively && this.moving && this.gaits.get(this.medium) === 'rolling';
    }
    // A medium with no figurine wears its silhouette in its place, up close only: far away
    // the pin is the piece (#234).
    const costume = this.costumes.get(this.medium);
    if (costume === undefined) return;
    costume.visible = close > 0;
    faceCamera(costume, cameraPosition, this.object.position);
    const size = distance * PAWN_SILHOUETTE_SHARE * close;
    costume.scale.set(size * (this.westward ? -1 : 1), size, size);
  }

  /**
   * **The file behind the head** (#276): each rank sampled on its leg at its distance back, by
   * the figurines' own size (`troopScale`); one that would fall before the leg's start waits at
   * its end. A rank faces the rank ahead of it, the first the road. The men step on the pawn's
   * clock, each vehicle sways (`swayOf`).
   */
  private march(drawn: number): void {
    this.drawn = drawn;
    const head = this.object.position;
    const road = this.road !== null && this.road.leg.length > 0 ? this.road : null;
    const going = performance.now() - this.movedAt < WALKING_MS;
    let heading = this.heading;
    if (road !== null) {
      pointOnLeg(road.leg, Math.max(0, road.local), AT);
      pointOnLeg(road.leg, Math.max(0, road.local) + 0.01, AHEAD);
      if (AHEAD.x !== AT.x || AHEAD.z !== AT.z)
        heading = Math.atan2(AHEAD.x - AT.x, AHEAD.z - AT.z);
    }
    for (const [r, { back: rankBack, marchers }] of this.ranks.entries()) {
      const back = rankBack * drawn;
      let walking = going;
      if (road !== null) {
        const local = road.local - back / road.leg.length;
        walking &&= local > 0;
        pointOnLeg(road.leg, local, AT);
      } else AT.set(head.x - Math.sin(heading) * back, head.y, head.z - Math.cos(heading) * back);
      if (r > 0 && (BEFORE.x !== AT.x || BEFORE.z !== AT.z))
        heading = Math.atan2(BEFORE.x - AT.x, BEFORE.z - AT.z);
      BEFORE.copy(AT);
      const posed: Posed = !walking
        ? 'still'
        : this.lively
          ? 'walking'
          : this.held
            ? 'held'
            : 'still';
      for (const marcher of marchers) {
        const { object } = marcher.figurine;
        const side = marcher.side * drawn;
        const sway = swayOf(this.lively ? marcher.gait : null, this.clock, walking);
        object.position.set(
          AT.x + Math.cos(heading) * side - head.x,
          AT.y - head.y + sway.lift * FIGURINE_SCALE * drawn,
          AT.z - Math.sin(heading) * side - head.z,
        );
        object.rotation.set(sway.pitch, heading, sway.roll);
        object.scale.setScalar(drawn);
        // A still or held pose is put once, when the man comes to it.
        if (posed === marcher.posed && posed !== 'walking') continue;
        marcher.posed = posed;
        const seconds = posed === 'walking' ? this.clock : posed === 'held' ? HELD_STRIDE_S : null;
        for (const man of marcher.men) strideOf(man, seconds);
      }
    }
    if (this.dust !== null) this.dust.object.visible = this.lively && going;
  }

  /** **Where each piece of my file stood when last laid out** (#362), by its group's first troop,
   *  how far behind the head and to the right of its road, and the road it came by from the head
   *  back, on the board: what the pile at rest deploys from. `null` when it was not laid out. */
  lastFile(): {
    readonly road: ReadonlyArray<Vector3>;
    readonly pieces: ReadonlyArray<FilePiece>;
  } | null {
    if (!this.laidOut || !this.object.visible) return null;
    const drawn = this.drawn;
    const reach = this.fileReach * drawn;
    const head = this.object.getWorldPosition(new Vector3());
    const road = this.road !== null && this.road.leg.length > 0 ? this.road : null;
    const behind = (d: number) =>
      road === null
        ? head.clone().add(new Vector3(-Math.sin(this.heading) * d, 0, -Math.cos(this.heading) * d))
        : (() => {
            const at = new Vector3();
            pointOnLeg(road.leg, road.local - d / road.leg.length, at);
            return at;
          })();
    return {
      road: Array.from({ length: ROAD_SAMPLES + 1 }, (_, k) =>
        k === 0 ? head : behind((reach * k) / ROAD_SAMPLES),
      ),
      pieces: this.ranks.flatMap(({ back, marchers }) =>
        marchers.map(({ figurine, troopId, side }) => ({
          troopId,
          at: figurine.object.getWorldPosition(new Vector3()),
          heading: figurine.object.rotation.y,
          back: back * drawn,
          side: side * drawn,
        })),
      ),
    };
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const figurine of this.figurines.values()) releaseInk(figurine.object);
    for (const costume of this.costumes.values()) {
      for (const child of costume.children) {
        const mesh = child as Mesh<ShapeGeometry, MeshBasicMaterial>;
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
  }

  private buildSilhouette(medium: Medium): Group {
    const group = new Group();
    for (const outline of SILHOUETTES[medium]) {
      const shape = new Shape();
      outline.forEach(([x, y], index) => {
        const [px, py] = [x / PLATE_WIDTH, -y / PLATE_WIDTH];
        if (index === 0) shape.moveTo(px, py);
        else shape.lineTo(px, py);
      });
      shape.closePath();
      const mesh = new Mesh(
        new ShapeGeometry(shape),
        new MeshBasicMaterial({
          color: this.color,
          side: DoubleSide,
          transparent: true,
          depthTest: false,
        }),
      );
      // The pawn passes over its own thread: it is the head, not one more node.
      mesh.renderOrder = 13;
      group.add(mesh);
    }
    return group;
  }
}
