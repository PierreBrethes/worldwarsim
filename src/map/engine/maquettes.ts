import {
  Box3,
  Color,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Plane,
  Quaternion,
  type Object3D,
  type Raycaster,
  Vector3,
} from 'three';
import type { LonLat } from '@/domain/geo';
import type { StampWords } from '@/domain/ink-bursts';
import type { MapMotion } from '@/domain/map-motion';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { ANONYMOUS_SPAN, pieceWeight, sceneOf } from './figurines/figurine';
import { washedOf } from './standing';
import { bakedSite, type Part } from './baking';
import { ARC_COLORS, PALETTE } from './palette';
import { pieceScale } from './piece-scale';
import { nearer, type PieceHit } from './piece-pick';
import type { AmbientLayer } from './ambience';
import type { SequenceHost } from './sequences';
import { Smoke, type Plume } from './smoke';
import { groundFootprint, SOCLE_TOP, WorksDressing, type Works } from './works';

export { SOCLE_TOP };

/**
 * **A factory at work smokes** (`table-etat-major.html`, `fac.userData.stacks`): a slow grey
 * thread from each chimney, leaning downwind. In board units for a maquette `SMOKE_SPAN` wide: it
 * grows with its maquette.
 */
const SMOKE_SPAN = 0.7;
const FACTORY_SMOKE: Plume = {
  puffs: 9,
  life: 4.2,
  rise: 0.9,
  lean: 0.75,
  size: [0.1, 0.5],
  opacity: 0.5,
  color: '#6e685e',
};

/**
 * **What a maquette stands on and as** (ADR 0026 §1): a building, a surveyed installation or a
 * neutral objective, by its label's id — the label reads whether its plate gives way. A region
 * anchor waits for the regions to land, as the label does.
 */
export type StandingMaquette = {
  readonly id: string;
  readonly at: { readonly lonLat: LonLat } | { readonly regionId: string };
  readonly url: string;
  /** Its widest side at the ground, in board units at the common scale (`buildingSpan`). */
  readonly span: number;
  /** Its widest side in metres, for a model drawn in metres (`buildingMetres`): one scale per metre
   *  for all of them. Absent, the model is brought to its box. */
  readonly metres?: number;
  /** Its widest side as built, flagpole left out, in board units: what the ring spaces it by.
   *  Absent, its `span`. */
  readonly footprint?: number;
  /** Known from a survey that has aged, or an emptied objective: a ghost of the building. */
  readonly washed: boolean;
  /** A site at work (mode chantier): its plan, its first level rising, or a raise. */
  readonly works?: Works;
  /** One of my producers at work: a thread of smoke rises from its chimneys. */
  readonly smoking?: boolean;
  /** **Who its socle's liseré says holds it** (ADR 0038 §2-§3): mine in my ink, a survey and a
   *  neutral of the Blitz hollow in the board's ink. Absent for an objective: no liseré. */
  readonly side?: 'mine' | 'seen' | 'neutral';
  /** My ink (`marker.ink`), for a site that is `mine` alone: a survey serves no nation. */
  readonly ink?: string;
};

/** The socle's paper (ADR 0038 §1): a hollow liseré is its ink mixed into it. */
const SOCLE_PAPER = new Color('#ebe1c8');
/** **How much of the paper a hollow liseré takes** (ADR 0038 §3: « son encre mêlée à 60 % au
 *  papier »): its ink at 60 %, the paper at 40 — at 60 % of paper it read as the socle's edge. */
const HOLLOW = 0.4;

/** **The ink of a site's liseré** (ADR 0038 §2-§3): mine full in my ink; a survey hollow in a
 *  survey's ink, as its pin; a neutral of the Blitz hollow in the borders'. `null` for none. */
function lisereOf({ side, ink }: StandingMaquette): Color | null {
  if (side === 'mine') return ink === undefined ? null : new Color(ink);
  if (side === undefined) return null;
  const pen = side === 'seen' ? ARC_COLORS.enemyDetected.trace : PALETTE.border;
  return new Color(pen).lerp(SOCLE_PAPER, HOLLOW);
}

/** A fixed turn per id, so that a row of farms is not a parade, and a building never spins. */
export function yawOf(id: string): number {
  let hash = 2166136261;
  for (let k = 0; k < id.length; k++) hash = Math.imul(hash ^ id.charCodeAt(k), 16777619);
  return ((hash >>> 0) / 2 ** 32) * 2 * Math.PI;
}

/** **What a maquette is drawn as, and where** (`drawnOf`): what a raze outlives it by (#326). */
export type Drawn = {
  readonly parts: ReadonlyArray<Part>;
  readonly matrix: Matrix4;
  readonly box: Box3;
};

type Model = {
  /** Its building: what a site at work cuts, and a plan in the queue does not stand yet. */
  readonly parts: ReadonlyArray<Part>;
  /** Its socle, liseré, yard and sign (ADR 0038): whole in every state. Empty without a socle. */
  readonly dressing: ReadonlyArray<Part>;
  /** Its own units to one board unit, times its span, its size: on its widest side at the ground,
   *  or, for a model drawn in metres, per metre — then `span` is its metres on the board. */
  readonly scale: number;
  /** Its bounds in its own units, ground at zero: its socle's, when it stands on one. */
  readonly box: Box3;
  /** Its building's bounds: how high a site rises, where its scaffold stands, what a raze marks. */
  readonly building: Box3;
  /** Its `fx_rang` on a socle — the first man, and the way the rank runs —, `null` without. */
  readonly rank: { readonly at: Vector3; readonly along: Vector3 } | null;
  /** Its `fx_smoke` markers in its own units — the top of its bounds when it has none. */
  readonly chimneys: ReadonlyArray<Vector3>;
  /** Every `fx_*` marker, in its own units: a door a recruit comes out of (`markersOf`). */
  readonly markers: ReadonlyMap<string, Vector3>;
};
/** By file and width: the scale depends on both. */
const models = new Map<string, Promise<Model>>();
function modelOf(url: string, metres?: number): Promise<Model> {
  const key = `${url} ${metres ?? ''}`;
  let model = models.get(key);
  if (!model) {
    model = sceneOf(url).then((cached) => {
      const scene = cached;
      const { building: parts, dressing } = bakedSite(scene);
      const boundsOf = (of: ReadonlyArray<Part>) => {
        const bounds = new Box3();
        for (const { geometry } of of) {
          geometry.computeBoundingBox();
          bounds.union(geometry.boundingBox!);
        }
        return bounds;
      };
      const building = boundsOf(parts);
      const box = building.clone().union(boundsOf(dressing));
      const chimneys: Vector3[] = [];
      const markers = new Map<string, Vector3>();
      scene.traverse((node) => {
        if (!node.name.startsWith('fx_')) return;
        markers.set(node.name, node.getWorldPosition(new Vector3()));
        if (node.name.startsWith('fx_smoke')) chimneys.push(markers.get(node.name)!.clone());
      });
      if (chimneys.length === 0) {
        const top = box.getCenter(new Vector3());
        chimneys.push(top.setY(box.max.y));
      }
      const ranked = dressing.length > 0 ? scene.getObjectByName('fx_rang') : undefined;
      const rank =
        ranked === undefined
          ? null
          : {
              at: markers.get('fx_rang')!,
              along: new Vector3(0, 0, 1).applyQuaternion(
                ranked.getWorldQuaternion(new Quaternion()),
              ),
            };
      const size = building.getSize(new Vector3());
      // A model in metres is drawn at one constant scale (ADR 0035): its box, bent by a flagpole
      // or a shed, no longer sets the size of its walls.
      return {
        parts,
        dressing,
        scale: 1 / (metres ?? Math.max(size.x, size.z)),
        box,
        building,
        chimneys,
        markers,
        rank,
      };
    });
    // Kept failed: the same file fails again, and it is said once, not at every rebuild.
    model.catch((error: unknown) => console.error(`maquette ${url}`, error));
    models.set(key, model);
  }
  return model;
}

/**
 * **The radius of a ring whose sites, in this order around it, keep their spacings** (ADR 0035
 * §5): each takes a share of the round by its own spacing, so two neighbours stand half their
 * two spacings apart — a port as wide as itself, a barracks as narrow as itself.
 */
function ringRadius(spacings: ReadonlyArray<number>): number {
  if (spacings.length < 2) return 0;
  const round = spacings.reduce((sum, spacing) => sum + spacing, 0);
  return Math.max(
    ...spacings.map((spacing, k) => {
      const pair = spacing + spacings[(k + 1) % spacings.length]!;
      return pair / (4 * Math.sin((Math.PI * pair) / (2 * round)));
    }),
  );
}

type Point = readonly [x: number, z: number];

/** **What a placement may not do** (retours du 15/10): stray far from its own point — further
 *  than `maxShift` times its ring's widest spacing —, or step a site on land, or its garrison,
 *  off the land. */
export type PlacementBounds = {
  readonly maxShift: number;
  readonly onLand: (x: number, z: number) => boolean;
};

export type Placement = {
  readonly at: Point;
  /** Where its garrison stands from it: outward from the ring, inland when the front is sea. */
  readonly facing: number;
  /** A group too tight for its bound shrinks rather than spreads. */
  readonly scale: number;
};

/** The group's sizes tried in turn, before every site falls back on its own point. */
const SHRINK_STEPS = [1, 0.85, 0.7, 0.55, 0.4];

/**
 * **Maquettes clear one another on the board, not on the screen**: sites whose footprints — a
 * disc of half its `spacings`, each its own — overlap are gathered on a ring around their
 * barycentre, and a ring that grows into another site, or another ring, takes it in. Whether
 * their labels fold into one cartouche is the screen's affair: off screen, or before the labels
 * touch, the maquettes already do. Per site, in the order given (the caller sorts, so a ring
 * keeps its order). `feet` are how far each garrison stands in front of its site.
 *
 * **Within `bounds`, a ring never carries a maquette far from its point** (the city of Coimbra
 * drawn in Porto, 15/10): a group that would spread past `maxShift`, or off the land, is ringed
 * again smaller — its maquettes shrink instead of standing away.
 */
export function clusterFootprints(
  points: ReadonlyArray<Point>,
  spacings: number | ReadonlyArray<number>,
  feet?: number | ReadonlyArray<number>,
  bounds: PlacementBounds = { maxShift: Infinity, onLand: () => true },
): Placement[] {
  const spacingOf = (k: number) => (typeof spacings === 'number' ? spacings : spacings[k]!);
  // A footprint reaches its foot at least: half its spacing.
  const footOf = (k: number) =>
    feet === undefined ? spacingOf(k) / 2 : typeof feet === 'number' ? feet : feet[k]!;
  const placed = new Array<Placement>(points.length);
  for (const members of ringed(
    points,
    points.map((_, k) => spacingOf(k)),
  ).clusters) {
    const own = members.map((k) => points[k]!);
    const spaced = members.map(spacingOf);
    const footed = members.map(footOf);
    const within = { ...bounds, maxShift: bounds.maxShift * Math.max(...spaced) };
    let fitted: Placement[] | null = null;
    for (const scale of SHRINK_STEPS) {
      const trial = ringed(
        own,
        spaced.map((spacing) => spacing * scale),
      ).placed.map((place, r) =>
        fitting(own[r]!, place, footed[r]! * scale, spaced[r]! * scale, scale, within, points),
      );
      if (trial.every((place) => place !== null)) {
        fitted = trial as Placement[];
        break;
      }
    }
    const smallest = SHRINK_STEPS.at(-1)!;
    members.forEach((k, r) => {
      placed[k] =
        fitted?.[r] ??
        fitting(
          points[k]!,
          { at: points[k]!, ring: [0, 0] },
          footed[r]! * smallest,
          spaced[r]! * smallest,
          smallest,
          { ...within, onLand: () => true },
          points,
        )!;
    });
  }
  return placed;
}

const FACINGS = [0, 1, -1, 2, -2, 3, -3, 4].map((k) => (k * Math.PI) / 4);

/** The placement as it may stand, `null` when it strays or steps off the land. A lone site turns
 *  its garrison when its front is the sea or a neighbour's maquette — inland, away from the other
 *  sites; a ring's keeps its outward facing. */
function fitting(
  point: Point,
  { at, ring }: { at: Point; ring: Point },
  foot: number,
  span: number,
  scale: number,
  { maxShift, onLand }: PlacementBounds,
  sites: ReadonlyArray<Point>,
): Placement | null {
  if (Math.hypot(at[0] - point[0], at[1] - point[1]) > maxShift + 1e-9) return null;
  const lone = ring[0] === 0 && ring[1] === 0;
  const outward = outwardOf(ring);
  if (!onLand(...point)) return { at, facing: outward, scale };
  if (!onLand(...at)) return null;
  const footAt = (facing: number): Point => [
    at[0] + foot * Math.sin(facing),
    at[1] + foot * Math.cos(facing),
  ];
  const clearance = (facing: number) => {
    const [x, z] = footAt(facing);
    return Math.min(
      Infinity,
      ...sites.filter((site) => site !== point).map(([sx, sz]) => Math.hypot(sx - x, sz - z)),
    );
  };
  const clear = (facing: number) =>
    onLand(...footAt(facing)) && (!lone || clearance(facing) >= span);
  if (clear(outward)) return { at, facing: outward, scale };
  if (!lone) return null;
  const inland = FACINGS.filter((facing) => onLand(...footAt(facing)));
  const facing = inland.reduce<number | null>(
    (best, each) => (best === null || clearance(each) > clearance(best) ? each : best),
    null,
  );
  return { at, facing: facing ?? outward, scale };
}

/** Away from its ring's centre; a lone site faces the front, towards +z. */
const outwardOf = ([x, z]: Point): number => (x === 0 && z === 0 ? 0 : Math.atan2(x, z));

/**
 * **Sites whose maquettes touch, at their own points, ring together** — and only those (retours
 * du 15/10 : un QG et sa caserne à une envergure et demie l'un de l'autre se dessinaient l'un
 * dans l'autre). A ring keeps its members in their order around it, and **never draws one nearer
 * its centre than its own point**: it can only push apart. A ring that grows into another site,
 * or another ring, takes it in.
 */
function ringed(
  points: ReadonlyArray<Point>,
  spacings: ReadonlyArray<number>,
): { placed: Array<{ at: Point; ring: Point }>; clusters: number[][] } {
  type Cluster = {
    members: number[];
    centre: Point;
    /** Its members in the order they stand around it, from the first one's own bearing. */
    around: Array<{ k: number; bearing: number; away: number }>;
    radius: number;
    reach: number;
  };
  const clusterOf = (members: number[]): Cluster => {
    const sum = members.reduce<Point>(
      ([x, z], k) => [x + points[k]![0], z + points[k]![1]],
      [0, 0],
    );
    const centre: Point = [sum[0] / members.length, sum[1] / members.length];
    const offsetOf = (k: number): Point => [points[k]![0] - centre[0], points[k]![1] - centre[1]];
    const around = members
      .map((k) => ({ k, bearing: outwardOf(offsetOf(k)), away: Math.hypot(...offsetOf(k)) }))
      .sort((a, b) => a.bearing - b.bearing);
    const radius = ringRadius(around.map(({ k }) => spacings[k]!));
    const widest = Math.max(...members.map((k) => spacings[k]!));
    const reach = Math.max(radius, ...around.map(({ away }) => away)) + widest / 2;
    return { members, centre, around, radius, reach };
  };
  const clusters = points.map((_, k) => clusterOf([k]));
  const overlapping = (): [number, number] | null => {
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const [a, b] = [clusters[i]!, clusters[j]!];
        const gap = Math.hypot(a.centre[0] - b.centre[0], a.centre[1] - b.centre[1]);
        if (gap < a.reach + b.reach - 1e-9) return [i, j];
      }
    return null;
  };
  for (let pair = overlapping(); pair !== null; pair = overlapping()) {
    const [i, j] = pair;
    const members = [...clusters[i]!.members, ...clusters[j]!.members].sort((a, b) => a - b);
    clusters.splice(j, 1);
    clusters[i] = clusterOf(members);
  }
  const placed = new Array<{ at: Point; ring: Point }>(points.length);
  for (const { members, centre, around, radius } of clusters) {
    if (members.length < 2) {
      placed[members[0]!] = { at: points[members[0]!]!, ring: [0, 0] };
      continue;
    }
    // Each site takes its share of the round by its spacing, its neighbours half their two apart.
    const round = around.reduce((sum, { k }) => sum + spacings[k]!, 0);
    let bearing = around[0]!.bearing;
    around.forEach(({ k, away }, rank) => {
      if (rank > 0) bearing += (Math.PI * (spacings[around[rank - 1]!.k]! + spacings[k]!)) / round;
      const out = Math.max(radius, away);
      const ring: Point = [out * Math.sin(bearing), out * Math.cos(bearing)];
      placed[k] = { at: [centre[0] + ring[0], centre[1] + ring[1]], ring };
    });
  }
  return { placed, clusters: clusters.map(({ members }) => members) };
}

/**
 * **How far from its maquette a building's garrison stands**, in board units at full size: a
 * span and a seventh of its site off its centre — 0.8 for the former 0.7 —, so that its back
 * clears the corner of a model turned any way, and half the pile's largest piece more, so that a
 * cargo stands off its port as a man off his barracks. `@a-mesurer`
 */
export const garrisonFoot = (site: number, pile: number, quay = false): number =>
  (quay ? QUAY_SHARE : 8 / 7) * site + pile / 2;

/** **The hulls of a port dock along its quay** (ADR 0035 §1, « un cargo qui tient le long de son
 *  port »): half its span off its centre, its side, rather than clear of its corners. */
const QUAY_SHARE = 0.5;

/**
 * **Two maquettes of a ring stand this many of their half footprints apart**, centre to centre:
 * a model turned any way reaches half its diagonal, a square's at worst — √2 —, and a little more
 * (retours du 15/10 : un QG et sa caserne se dessinaient l'un dans l'autre). The footprint is the
 * model as built (`buildingFootprint`), not its `span`: a barracks reaches 65 m with its shed
 * when its walls make 50. `@a-mesurer`
 */
export const RING_GAP = 1.45;

/** **How far a ring may carry a maquette from its own point**, in its widest spacings: under one,
 *  so the site reads where it is — 0.55 for the former 0.875. `@a-mesurer` */
export const MAX_SHIFT = 0.63;

type Placed = {
  readonly id: string;
  readonly span: number;
  /** What the ring spaces it by (`StandingMaquette.footprint`, else its span). */
  readonly footprint: number;
  readonly ground: Vector3;
  /** The ground, or its place on the ring it clears its neighbours on. */
  readonly at: Vector3;
  /** Where its garrison stands from it (`Placement.facing`). */
  facing: number;
  /** Its group's size against a lone maquette's: a tight group shrinks rather than spreads. */
  scale: number;
  readonly turn: Quaternion;
  /** Inside a replay's ground: it steps aside, and its plate with it. */
  cleared: boolean;
  near: number;
  /** The weight it was last drawn at (`orient`), kept over a rebuild: a view that loses it
   *  before the next frame still finds it drawn (#326). */
  drawnNear: number;
  readonly smoking: boolean;
  /** One per chimney once the model has landed, empty for a site that does not produce. */
  smokes: Smoke[];
  /** The ink of its liseré (`lisereOf`), `null` for none. */
  readonly lisere: Color | null;
  /** When it stood up under the eyes (`Date.now()`): it bounces once. */
  settledAt: number | null;
};

/** **A site at work**: its lot alone, dressed once its model has landed (`WorksDressing`). */
type AtWork = { readonly works: Works; dressing: WorksDressing | null };

/** The exemplars of one model in one ink, drawn as instances: one draw call per material. */
type Lot = {
  readonly url: string;
  readonly washed: boolean;
  readonly items: Placed[];
  readonly group: Group;
  model: Model | null;
  meshes: InstancedMesh[];
  readonly atWork: AtWork | null;
};

const UP = new Vector3(0, 1, 0);
const WHITE = new Color(1, 1, 1);
/** How near a thread's end must be to an airfield's point to be its runway's. */
const RUNWAY_TOLERANCE = 0.05;
/** A site that stands under the eyes gives a little: up, down, still. */
const BOUNCE_MS = 450;
const matrix = new Matrix4();
const shrunk = new Matrix4();
const scale = new Vector3();
const placedBox = new Box3();

/**
 * **My buildings, the installations I surveyed and the neutral objectives, in maquettes up
 * close** — the twin of `StandingLayer` for what never moves. Full at the country level, gone
 * beyond the region fade: far away the label's plate is the building. A lot appears once its
 * model has landed and asks for its frame through `changed`; until then the plate stays.
 */
export class MaquetteLayer implements SequenceHost {
  readonly group = new Group();
  /** A sequence's articulated copy, standing in for its instance, by the maquette's id. */
  private readonly copies = new Map<string, Object3D>();
  private lots = new Map<string, Lot>();
  private byId = new Map<string, { item: Placed; lot: Lot }>();
  /** **Razed, still falling** (#326): its place on the ring is kept — its neighbours stay — and
   *  nothing of it is drawn, until `release`. */
  private held = new Map<
    string,
    { readonly item: Placed; readonly model: Model; readonly lonLat: LonLat | null }
  >();
  private maquettes: ReadonlyArray<StandingMaquette> = [];
  private drawn = '';
  motion: MapMotion = 'full';

  constructor(
    private readonly frame: WorldFrame,
    private readonly groundOfRegion: (regionId: string) => Vector3 | null,
    private readonly changed: () => void,
    /** A site seen at work has stood up under the player's eyes: the board stamps it. */
    private readonly posed: (at: Vector3, words: StampWords) => void,
    /** Whether a board point is land: a site on land never stands off it. */
    private readonly onLand: (x: number, z: number) => boolean,
  ) {}

  /** Re-served at every step of any column: says whether anything changed, and only then
   *  rebuilds. */
  display(maquettes: ReadonlyArray<StandingMaquette>): boolean {
    const drawn = JSON.stringify(maquettes);
    if (drawn === this.drawn) return false;
    this.drawn = drawn;
    // Seen at work: stood up close, before the rebuild resets every near weight. A plan is
    // not seen standing up — it becomes a rising site, not a building.
    const seen = new Map(
      this.maquettes.flatMap((m) =>
        m.works?.stamp && (this.byId.get(m.id)?.item.near ?? 0) > 0
          ? [[m.id, { stamp: m.works.stamp, level: m.works.level }] as const]
          : [],
      ),
    );
    this.maquettes = maquettes;
    this.rebuild();
    for (const maquette of maquettes) {
      const stood = this.byId.get(maquette.id);
      const was = seen.get(maquette.id);
      // Done, or done and the next level already started on it: either way it stood up.
      const stoodUp = was !== undefined && (!maquette.works || maquette.works.level > was.level);
      if (stood === undefined || was === undefined || !stoodUp) continue;
      this.posed(stood.item.at, was.stamp);
      if (this.motion === 'full') stood.item.settledAt = Date.now();
    }
    return true;
  }

  /** Every maquette set back on its point — the regions landed under the region anchors. A
   *  region anchor that has not landed stands nothing yet. */
  rebuild(): void {
    const drawnNear = new Map([...this.byId].map(([id, { item }]) => [id, item.drawnNear]));
    for (const lot of this.lots.values()) this.clear(lot);
    this.lots.clear();
    this.byId.clear();
    for (const maquette of this.maquettes) {
      this.held.delete(maquette.id);
      const ground =
        'lonLat' in maquette.at
          ? this.frame.projectLonLat(maquette.at.lonLat, COUNTRY_THICKNESS)
          : this.groundOfRegion(maquette.at.regionId);
      if (ground === null) continue;
      ground.setY(COUNTRY_THICKNESS);
      const key = maquette.works
        ? `${maquette.url} works ${maquette.id}`
        : `${maquette.url} ${maquette.washed}`;
      let lot = this.lots.get(key);
      if (lot === undefined) {
        lot = {
          url: maquette.url,
          washed: maquette.washed,
          items: [],
          group: new Group(),
          model: null,
          meshes: [],
          atWork: maquette.works ? { works: maquette.works, dressing: null } : null,
        };
        this.lots.set(key, lot);
        this.group.add(lot.group);
        const landing = lot;
        // A model that fails to load leaves the plates; `modelOf` has said why.
        modelOf(maquette.url, maquette.metres).then(
          (model) => this.landed(landing, model, maquette.washed),
          () => {},
        );
      }
      const item: Placed = {
        id: maquette.id,
        span: maquette.span,
        footprint: maquette.footprint ?? maquette.span,
        ground,
        at: ground.clone(),
        facing: 0,
        scale: 1,
        turn: new Quaternion().setFromAxisAngle(UP, yawOf(maquette.id)),
        cleared: false,
        near: -1,
        drawnNear: drawnNear.get(maquette.id) ?? 0,
        // A site at work and a ghost of a survey do not produce.
        smoking: maquette.smoking === true && !maquette.works && !maquette.washed,
        smokes: [],
        settledAt: null,
        lisere: lisereOf(maquette),
      };
      lot.items.push(item);
      this.byId.set(maquette.id, { item, lot });
    }
    this.place();
  }

  /** Where the airfields stand, as one string: a thread leaves a runway only once its airfield is
   *  placed, and is laid again when this changes. */
  runwaysKey(): string {
    return [...this.byId]
      .filter(([id]) => id.startsWith('building-airfield'))
      .map(([id, { item }]) => `${id}:${item.ground.x.toFixed(3)},${item.ground.z.toFixed(3)}`)
      .sort()
      .join(';');
  }

  /**
   * **The axis of the airfield standing at (`x`, `z`)**, as a unit vector on the board, or `null`
   * for none: its hangar's door faces along it, and so does the runway a plane rolls on (#129).
   * An airfield is read by its label's id, `building-airfield@…`.
   */
  runwayAt(x: number, z: number): readonly [number, number] | null {
    for (const [id, { item }] of this.byId) {
      if (!id.startsWith('building-airfield')) continue;
      if (Math.hypot(item.ground.x - x, item.ground.z - z) > RUNWAY_TOLERANCE) continue;
      const yaw = yawOf(id);
      return [Math.sin(yaw), Math.cos(yaw)];
    }
    return null;
  }

  /** The ring and every matrix follow the size: both are rebuilt on the next `orient`. */
  resize(): void {
    this.place();
  }

  /** **The razed maquette keeps its place** until `release` (#326): read before the view that
   *  lost it is displayed. */
  hold(id: string): void {
    const dressed = this.byId.get(id);
    if (dressed === undefined || dressed.lot.model === null) return;
    const at = this.maquettes.find((maquette) => maquette.id === id)?.at;
    this.held.set(id, {
      item: dressed.item,
      model: dressed.lot.model,
      lonLat: at !== undefined && 'lonLat' in at ? at.lonLat : null,
    });
  }

  /** Its fall is over: its neighbours close in, on the next `orient`. */
  release(id: string): void {
    if (this.held.delete(id)) this.place();
  }

  /** **The point a held maquette stood on**: its garrison is served there now. */
  heldAt(id: string): LonLat | null {
    return this.held.get(id)?.lonLat ?? null;
  }

  /** **The points my buildings' maquettes stand on**: a garrison handed back to the ground there
   *  stands at their foot. An installation or an objective is not mine to garrison. */
  buildingPoints(): ReadonlyArray<{ readonly id: string; readonly at: LonLat }> {
    return this.maquettes.flatMap(({ id, at }) =>
      id.startsWith('building-') && 'lonLat' in at ? [{ id, at: at.lonLat }] : [],
    );
  }

  private place(): void {
    const items = [...this.byId.values(), ...this.held.values()]
      .map(({ item }) => item)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const placed = clusterFootprints(
      items.map(({ ground }) => [ground.x, ground.z] as const),
      items.map(({ footprint }) => footprint * RING_GAP * pieceScale.size),
      // A lone site's garrison stands this far in front: its footprint reaches it. The pile is not
      // known here: a tank's stands for it.
      items.map(({ span }) => garrisonFoot(span, ANONYMOUS_SPAN) * pieceScale.size),
      { maxShift: MAX_SHIFT, onLand: this.onLand },
    );
    items.forEach((item, k) => {
      const { at, facing, scale } = placed[k]!;
      item.facing = facing;
      item.scale = scale;
      item.at.set(at[0], item.ground.y, at[1]);
      item.near = -1;
    });
  }

  private landed(lot: Lot, model: Model, washed: boolean): void {
    if (![...this.lots.values()].includes(lot)) return;
    lot.model = model;
    const atWork = lot.atWork;
    if (atWork !== null) {
      // The building alone is at work: its socle stands whole (ADR 0038 §5).
      atWork.dressing = new WorksDressing(
        atWork.works,
        model.building,
        groundFootprint(
          model.parts.map(({ geometry }) => geometry),
          model.building,
        ),
        model.dressing.length > 0 ? model.box : null,
      );
      lot.group.add(atWork.dressing.object);
    }
    const cut = atWork?.dressing?.cut ?? null;
    const instanced = ({ geometry, material }: Part, cutHere: boolean) => {
      const mesh = new InstancedMesh(
        geometry,
        cutHere && cut !== null ? cutOf(material, cut) : washed ? washedOf(material) : material,
        lot.items.length,
      );
      mesh.matrixAutoUpdate = false;
      // Instances spread over a continent: one sphere around them all would cull nothing.
      mesh.frustumCulled = false;
      return mesh;
    };
    // A plan in the queue has no volume yet.
    const building = atWork?.works.phase === 'queued' ? [] : model.parts;
    const dressing = model.dressing.map((part) => instanced(part, false));
    // One lot for every side: its liseré is inked per instance (ADR 0038 §2).
    for (const mesh of dressing) {
      if ((mesh.material as Material).name !== 'lisere') continue;
      lot.items.forEach((item, k) => mesh.setColorAt(k, item.lisere ?? WHITE));
    }
    lot.meshes = [...building.map((part) => instanced(part, true)), ...dressing];
    if (lot.meshes.length > 0) lot.group.add(...lot.meshes);
    for (const item of lot.items) {
      if (!item.smoking) continue;
      item.smokes = model.chimneys.map(() => new Smoke(FACTORY_SMOKE));
      lot.group.add(...item.smokes.map((smoke) => smoke.object));
      // Its smoke is placed with its matrix: the next `orient` places both.
      item.near = -1;
    }
    this.changed();
  }

  private clear(lot: Lot): void {
    lot.group.removeFromParent();
    // Geometry and materials are the model's, shared by every lot drawn from it — but for a
    // rising site's cut copies, and its works' dressing.
    const cut = lot.atWork?.dressing?.cut ?? null;
    for (const mesh of lot.meshes) {
      mesh.dispose();
      if (cut !== null && (mesh.material as Material).clippingPlanes?.includes(cut))
        (mesh.material as Material).dispose();
    }
    lot.atWork?.dressing?.dispose();
  }

  /** The world box of a maquette as drawn now — its model's bounds under its instance's placement. */
  boxOf(id: string): Box3 | null {
    const dressed = this.byId.get(id);
    const model = dressed?.lot.model;
    if (dressed === undefined || !model || dressed.item.near <= 0 || !dressed.lot.group.visible)
      return null;
    const { item } = dressed;
    matrix.compose(item.at, item.turn, scale.setScalar(item.near * sizeOf(model, item)));
    placedBox.copy(model.box).applyMatrix4(matrix);
    // A rising site is drawn up to its cut only, a plan lies flat: the box the poster clears
    // stops there too — but on a socle, whose sign stands whole and above the building.
    const atWork = model.dressing.length > 0 ? null : dressed.lot.atWork;
    const cut = atWork?.dressing?.cut ?? null;
    if (atWork?.works.phase === 'queued') placedBox.max.y = placedBox.min.y;
    else if (cut !== null)
      placedBox.max.y = Math.max(placedBox.min.y, Math.min(placedBox.max.y, cut.constant));
    return placedBox;
  }

  /** The maquette under `ray`, by the instance it hits: each is tried by its bounds first. */
  under(ray: Raycaster): PieceHit | null {
    let best: PieceHit | null = null;
    for (const lot of this.lots.values()) {
      if (!lot.group.visible) continue;
      const dressing = lot.atWork?.dressing ?? null;
      const plan = dressing?.pick(ray) ?? null;
      const site = lot.items[0];
      if (plan !== null && site !== undefined && site.near > 0 && !site.cleared)
        best = nearer(best, { id: site.id, distance: plan });
      const cut = dressing?.cut ?? null;
      for (const hit of ray.intersectObjects(lot.meshes, false)) {
        const item = hit.instanceId === undefined ? undefined : lot.items[hit.instanceId];
        // A rising site is drawn up to its cut: above it there is nothing to point at — but its
        // socle's sign, which stands whole.
        const whole = (hit.object as InstancedMesh).material as Material;
        const built =
          cut === null || !whole.clippingPlanes?.includes(cut) || hit.point.y <= cut.constant;
        if (item !== undefined && item.near > 0 && !item.cleared && built)
          best = nearer(best, { id: item.id, distance: hit.distance });
      }
    }
    for (const [id, copy] of this.copies) {
      const item = this.byId.get(id)?.item;
      if (item === undefined || item.near <= 0 || item.cleared) continue;
      const [hit] = ray.intersectObject(copy, true);
      if (hit !== undefined) best = nearer(best, { id, distance: hit.distance });
    }
    return best;
  }

  /** **What a sequence may borrow** (`SequenceHost`): not a ghost, a site at work, a pin or a
   *  piece a replay has cleared. Its box is `null` until its lot has been placed. */
  pieceOf(id: string): { url: string; box: Box3 | null } | null {
    const dressed = this.byId.get(id);
    if (
      dressed === undefined ||
      dressed.lot.model === null ||
      dressed.lot.washed ||
      dressed.lot.atWork !== null ||
      dressed.item.cleared ||
      dressed.item.near === 0
    )
      return null;
    return { url: dressed.lot.url, box: this.boxOf(id)?.clone() ?? null };
  }

  /** **What a maquette is drawn as now, and where** (#326): its parts as its lot draws them — a
   *  rising site's cut with it —, its placement, its model's bounds in its own units. `null` when
   *  nothing of it is drawn. Read before the view that lost it is displayed: a raze outlives it. */
  drawnOf(id: string): Drawn | null {
    const dressed = this.byId.get(id);
    const model = dressed?.lot.model;
    if (
      dressed === undefined ||
      !model ||
      this.held.has(id) ||
      dressed.item.drawnNear <= 0 ||
      dressed.lot.meshes.length === 0
    )
      return null;
    const { item, lot } = dressed;
    return {
      parts: lot.meshes.map((mesh) => ({
        geometry: mesh.geometry,
        material: mesh.material as Material,
      })),
      matrix: new Matrix4().compose(
        item.at,
        item.turn,
        new Vector3().setScalar(item.drawnNear * sizeOf(model, item)),
      ),
      box: model.building,
    };
  }

  /** **A maquette's own frame on the board**, drawn whole: its markers (`fx_sortie`…) and
   *  bounds in its model's units — metres, for a model in metres —, and the way between the two.
   *  What a recruit's way out of its door is laid on (#268). */
  siteOf(id: string): {
    marker(name: string): Vector3 | null;
    readonly box: Box3;
    toBoard(point: Vector3): Vector3;
    toModel(point: Vector3): Vector3;
  } | null {
    const dressed = this.byId.get(id);
    const model = dressed?.lot.model;
    if (dressed === undefined || !model) return null;
    const { item } = dressed;
    const placed = new Matrix4().compose(
      item.at,
      item.turn,
      new Vector3().setScalar(sizeOf(model, item)),
    );
    const back = placed.clone().invert();
    return {
      marker: (name) => model.markers.get(name)?.clone() ?? null,
      box: model.box,
      toBoard: (point) => point.clone().applyMatrix4(placed),
      toModel: (point) => point.clone().applyMatrix4(back),
    };
  }

  /** The copy takes the instance's place: the instance shrinks to nothing at its own point, the
   *  copy gets the matrix it would have had. The next `orient` writes both. */
  standIn(id: string, copy: Object3D | null): void {
    const old = this.copies.get(id);
    if (old !== undefined && old !== copy) {
      old.removeFromParent();
      old.traverse((node) => {
        if (node.userData.ownLisere === true) ((node as Mesh).material as Material).dispose();
      });
    }
    if (copy === null) this.copies.delete(id);
    else {
      copy.matrixAutoUpdate = false;
      this.copies.set(id, copy);
      this.group.add(copy);
    }
    const dressed = this.byId.get(id);
    const lisere = dressed?.item.lisere ?? null;
    // Its file's materials are shared by every copy: its liseré wears its own (ADR 0038 §2).
    if (copy !== null && lisere !== null)
      copy.traverse((node) => {
        const mesh = node as Mesh;
        if (!mesh.isMesh || (mesh.material as Material).name !== 'lisere') return;
        const own = (mesh.material as MeshStandardMaterial).clone();
        own.color.copy(lisere);
        mesh.material = own;
        mesh.userData.ownLisere = true;
      });
    if (dressed !== undefined) dressed.item.near = -1;
  }

  /** Its maquette stands, so its plate gives way — not while a replay has cleared it away. */
  isDressed(id: string): boolean {
    const dressed = this.byId.get(id);
    return dressed !== undefined && dressed.lot.model !== null && !dressed.item.cleared;
  }

  /**
   * **Where the garrison of a maquette stands**, `null` while its model has not landed — a pile
   * beside a plate would stand beside nothing — or while a replay has cleared it away. Read at every frame, so that a ring or a region
   * that lands carries the pile along. The step follows the maquette as it is drawn now: it
   * closes in as the maquette gives way to its pin. `pile` is the span of its largest piece.
   */
  garrisonAt(
    id: string,
    pile: number,
    quay = false,
  ): {
    at: Vector3;
    step: readonly [number, number];
    facing: number;
    /** On a socle's yard (ADR 0038 §5): the first pile starts at `fx_rang`, the next along. */
    rank: boolean;
  } | null {
    const held = this.held.get(id);
    const dressed = this.byId.get(id);
    if (held === undefined && (dressed === undefined || dressed.lot.model === null)) return null;
    const item = held?.item ?? dressed!.item;
    if (item.cleared) return null;
    const { at, facing, scale, span } = item;
    // A held site is not oriented any more: its garrison keeps the weight it was drawn at.
    const near = Math.max(held === undefined ? item.near : item.drawnNear, 0);
    const rank = (held?.model ?? dressed!.lot.model)!.rank;
    // The hulls of a port keep its quay.
    if (rank !== null && !quay) {
      const size = near * sizeOf((held?.model ?? dressed!.lot.model)!, item);
      const first = rank.at.clone().setY(0).applyQuaternion(item.turn).multiplyScalar(size);
      const along = rank.along.clone().applyQuaternion(item.turn);
      return {
        at: at.clone().setY(at.y + SOCLE_TOP * size),
        step: [first.x, first.z],
        facing: Math.atan2(-along.z, along.x),
        rank: true,
      };
    }
    const foot = garrisonFoot(span, pile, quay) * pieceScale.size * scale * near;
    return { at, step: [foot * Math.sin(facing), foot * Math.cos(facing)], facing, rank: false };
  }

  /** **The span a label's maquette is pinned by**, `null` for none drawn here. */
  spanOf(id: string): number | null {
    return this.byId.get(id)?.item.span ?? null;
  }

  /** **Where a maquette is drawn when a ring carried it off its point** — the label's fanion stays
   *  on the point, a thread of ink runs to here. `null` while it stands on its point, or is not
   *  drawn. */
  drawnAt(id: string): Vector3 | null {
    const dressed = this.byId.get(id);
    if (dressed === undefined || dressed.lot.model === null || dressed.item.cleared) return null;
    const { at, ground } = dressed.item;
    return at.x === ground.x && at.z === ground.z ? null : at;
  }

  /** Where the night lays a lamp's glow: under each maquette that stands, with its share of building. */
  lights(emit: (at: Vector3, radius: number, near: number) => void): void {
    for (const { model, items, group } of this.lots.values()) {
      if (model === null || !group.visible) continue;
      const reach =
        Math.max(model.box.max.x - model.box.min.x, model.box.max.z - model.box.min.z) / 2;
      for (const item of items) emit(item.at, reach * sizeOf(model, item) * item.near, item.near);
    }
  }

  /** `cleared` is a replay's ground: what stands inside it steps aside while it plays. */
  orient(
    cameraPosition: Vector3,
    cleared: { center: Vector3; reach: number } | null,
    now: number,
  ): void {
    for (const lot of this.lots.values()) {
      if (lot.model === null) continue;
      let moved = false;
      lot.items.forEach((item, k) => {
        item.cleared = cleared !== null && item.at.distanceTo(cleared.center) < cleared.reach;
        const near = item.cleared
          ? 0
          : Math.round(pieceWeight(item.at.distanceTo(cameraPosition), item.span) * 100) / 100;
        const bounce = item.settledAt === null ? null : bounceAt(now - item.settledAt);
        // Its last bounce sets it back on its feet: one more placement, then still.
        const ending = item.settledAt !== null && bounce === null;
        if (ending) item.settledAt = null;
        if (near === item.near && item.settledAt === null && !ending) return;
        item.near = near;
        item.drawnNear = near;
        moved = true;
        const size = near * sizeOf(lot.model!, item);
        matrix.compose(item.at, item.turn, scale.set(size, size * (bounce ?? 1), size));
        const copy = this.copies.get(item.id);
        if (copy === undefined) for (const mesh of lot.meshes) mesh.setMatrixAt(k, matrix);
        else {
          copy.matrix.copy(matrix);
          copy.matrixWorldNeedsUpdate = true;
          const away = shrunk.compose(item.at, item.turn, scale.setScalar(0));
          for (const mesh of lot.meshes) mesh.setMatrixAt(k, away);
        }
        item.smokes.forEach((smoke, c) => {
          smoke.object.position.copy(lot.model!.chimneys[c]!).applyMatrix4(matrix);
          smoke.object.scale.setScalar(
            (near * pieceScale.size * item.scale * item.span) / SMOKE_SPAN,
          );
        });
      });
      const site = lot.items[0];
      if (lot.atWork?.dressing && site !== undefined)
        lot.atWork.dressing.place(
          site.at,
          site.turn,
          Math.max(site.near, 0) * sizeOf(lot.model, site),
          now,
        );
      if (!moved) continue;
      for (const mesh of lot.meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        // The pointer's test reads the bounds first: they must follow the instances.
        mesh.computeBoundingSphere();
      }
      lot.group.visible = lot.items.some((item) => item.near > 0);
    }
  }

  /**
   * **The factories' smoke, an ambience** (`ambience.ts`): it loops for good, so it steps at its
   * own low beat rather than holding the board at sixty frames. Idle when no smoking maquette
   * stands close; still at reduced motion, gone at cut motion.
   */
  readonly smoke: AmbientLayer = {
    fx: 'smoke',
    hz: 8,
    idle: () =>
      ![...this.byId.values()].some(({ item }) => item.smokes.length > 0 && item.near > 0),
    frame: (time, motion) => {
      for (const { item } of this.byId.values())
        for (const smoke of item.smokes) {
          smoke.object.visible = item.near > 0 && motion !== 'off';
          if (smoke.object.visible) smoke.frame(time);
        }
    },
  };

  /** A site stood up under the eyes is bouncing: the board keeps drawing until it is still. */
  get settling(): boolean {
    return [...this.byId.values()].some(({ item }) => item.settledAt !== null);
  }

  dispose(): void {
    for (const lot of this.lots.values()) this.clear(lot);
    this.lots.clear();
    this.byId.clear();
    for (const copy of this.copies.values()) copy.removeFromParent();
    this.copies.clear();
    this.group.removeFromParent();
  }
}

/** **Its own units to the board** at full near weight: its span at the player's size, in its group's. */
const sizeOf = (model: Model, item: Placed): number =>
  model.scale * item.span * pieceScale.size * item.scale;

/** Up a tenth, down a little, still: the vertical give of a site that just stood up. */
const bounceAt = (elapsed: number): number | null =>
  elapsed >= BOUNCE_MS
    ? null
    : 1 + 0.1 * Math.sin((2 * Math.PI * elapsed) / BOUNCE_MS) * (1 - elapsed / BOUNCE_MS);

/** A rising site's own copy of a material, cut above the work — its shadow with it. */
function cutOf(material: Material, cut: Plane): Material {
  const copy = material.clone();
  copy.clippingPlanes = [cut];
  copy.clipShadows = true;
  return copy;
}
