import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Line,
  LineDashedMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
  type Object3D,
  PlaneGeometry,
  type Raycaster,
  RingGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Forbidden } from '@/domain/drop-order';
import { destinationPoint, samePoint, type LonLat } from '@/domain/geo';
import type { MapMotion } from '@/domain/map-motion';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { leaveHiddenPartsUnplaced } from './hidden-parts';
import type { PilePieces } from '@/domain/pile-pieces';
import type { UnitRole, UnitTier } from '@/domain/ids';
import { AIRFIELD } from '@/emblems/kits/manifest';
import { nationInk } from '@/domain/nations';
import { DOMAIN_BY_ROLE } from '@/domain/troops';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import type { AmbientLayer } from './ambience';
import { HOVER_ALTITUDE } from './thread';
import {
  altitudeShadow,
  figurineFor,
  hideAltitudeShadows,
  LAID_OUT_FOR,
  FLOOR_PX,
  floorGrowth,
  floorSpanOf,
  GARRISON_FLOOR_PX,
  troopPinSpan,
  troopScale,
  troopWeight,
  type Figurine,
  type RestPose,
} from './figurines/figurine';
import { dropLift, DROP_DONE, followShare, RETURN_DONE, returnAt, swayAt } from './landing';
import { InkRing, type RingState } from './ink-ring';
import type { SequenceHost } from './sequences';
import type { AirRole } from './timelines/airfield';
import { ease } from './timelines/curves';
import type { SeaRole } from './timelines/port';
import {
  berths,
  type HullPost,
  layout,
  type Place,
  type Plane,
  type Rest,
  settle,
  settleHull,
} from './timelines/rest';
import { playTableSound } from '../table-sound';
import type { MooredHull } from './moorings';
import { charred, DustBurst, PLUME_BY_WEAR, Smoke } from './smoke';
import { PALETTE } from './palette';
import { pieceScale } from './piece-scale';
import { rankLayout } from './rank-layout';
import { block, GROUP_SPACING, SQUAD_SPACING, type Slot } from '@/domain/pile-layout';
import {
  boxOfObject,
  drawnHit,
  footedHit,
  LEAST_TARGET_PX,
  nearer,
  type PieceHit,
} from './piece-pick';

export type StandingPile = {
  /** The pile's label id (`stackLabelId`): the label reads whether its plate gives way. */
  readonly id: string;
  /** The label this pile hangs its tags from and is dropped on, when it is not its own: an
   *  outpost's garrison stands at its point, and the outpost has no maquette to stand beside. */
  readonly label?: string;
  /**
   * A point, or **a building's garrison**: the id of the maquette it stands at the foot of. It is
   * lifted by its figurines like any pile; the maquette itself opens its site.
   */
  readonly at:
    | { readonly lonLat: LonLat }
    /** `quay` : la garnison d'un port, dont les coques **accostent le long du quai**, côté mer,
     *  en rangs le long de la côte (ADR 0028) — et non tournées comme la maquette. */
    | {
        readonly beside: string;
        readonly quay?: LonLat;
        /** Set by `besideSites`: the point this pile was served at, which it falls back to. */
        readonly from?: LonLat;
      };
  readonly pieces: PilePieces;
  /** **The heading it arrived by** (#362), in degrees from north; a pile at a point faces it,
   *  absent it faces the board's south. */
  readonly facing?: number;
};

/** **The label a standing pile is aimed at by**: the mast it stands beside, the label it hangs
 *  from (an outpost's), or its own. The one place a pile and its label are tied. */
export const labelOfPile = (pile: StandingPile | undefined, id: string): string =>
  pile === undefined ? id : (pile.label ?? ('beside' in pile.at ? pile.at.beside : id));

/**
 * **A pile posted at a maquette's point stands at its foot, not under it** (#341): a garrison
 * handed back to the ground by a razed site is a pile at a point, and the point is where the
 * maquette of its neighbour — or the one still falling — stands. The first site found takes it.
 * It keeps its own label (what hovers, drops and carries it is the pile, not the site), and a
 * fleet stays at its point: its hulls dock along a quay, which is no land's foot.
 */
const isNaval = ({ role }: { role: keyof typeof DOMAIN_BY_ROLE }): boolean =>
  DOMAIN_BY_ROLE[role] === 'sea';

export const besideSites = (
  piles: ReadonlyArray<StandingPile>,
  sites: ReadonlyArray<{ readonly id: string; readonly at: LonLat }>,
): ReadonlyArray<StandingPile> =>
  sites.length === 0
    ? piles
    : piles.map((pile) => {
        if (!('lonLat' in pile.at) || pile.pieces.groups.some(isNaval)) return pile;
        const [lon, lat] = pile.at.lonLat;
        const site = sites.find(({ at }) => Math.abs(at[0] - lon) + Math.abs(at[1] - lat) < 1e-9);
        return site === undefined
          ? pile
          : {
              ...pile,
              label: pile.label ?? pile.id,
              at: { beside: site.id, from: pile.at.lonLat },
            };
      });

/** **Newcomers take their place in the order they were formed** (#524): a view served whole stands
 *  as one that grew, whatever order the pile lists its roles in. A view with no date keeps its order. */
const inFormationOrder = <T extends { formedAt?: number | undefined }>(
  members: ReadonlyArray<T>,
): T[] => [...members].sort((a, b) => (a.formedAt ?? 0) - (b.formedAt ?? 0));

/** Where a maquette's garrison stands (`MaquetteLayer.garrisonAt`). */
export type GarrisonAt = (
  maquetteId: string,
  /** The span of the pile's largest piece: it stands that much further off. */
  pile: number,
  /** Hulls docked along a port's quay. */
  quay: boolean,
) => {
  at: Vector3;
  step: readonly [number, number];
  facing: number;
  /** Ranked on a socle's yard (`rankLayout`): piles abreast along `facing`, centred on the
   *  marker, then deeper along `deep`. */
  rank: boolean;
  /** The rank's width, in board units, and the way it deepens, on the board. */
  width: number;
  deep: readonly [number, number];
  /** The size its ring draws the site at: a fleet at its quay is drawn at it (#433). */
  scale: number;
  /** The site's metres to the board, as it is drawn now (#475): where its pieces rest. */
  toBoard(point: Vector3): Vector3;
  /** The site is drawn in mirror (#476): a rest kept from the other side is not where it was. */
  mirrored?: boolean;
} | null;

/**
 * **A pile is laid out in its own units** (ADR 0035): the spacings below were drawn for a tank
 * of `LAID_OUT_FOR`, and the whole pile is drawn at its largest piece's span over that — a pile
 * of men as tight as a pile of tanks, a pile with a cargo as wide as its hull.
 */
const pileUnitOf = (span: number): number => span / LAID_OUT_FOR;

/** How far ahead a pile's heading is read on the board: its point's own scale. */
const FACING_KM = 10;

/** **The rank recentres in half a second** once a newcomer reaches it (décision de Pierre,
 *  #268, 23/10). */
const GLIDE_MS = 500;
/** How long a pile waits for the sequence `expect` promised before it stands at once: past the
 *  engine's own wait for a pile to stand (`SORTIE_WAIT_MS`). */
const EXPECT_MS = 2500;
/** How long where a group stood is kept (`lastSeen`): the view that moved it is long in. */
const SEEN_MS = 3000;
/** **A column joining a pile halts at its edge** (#277): so far out of its footprint, in steps. */
const HALT_STEPS = 0.55;
/** **The staple** (#277, storyboard « une pile vivante ») : a stroke of ink round the squad just
 *  formed, traced in 0.6 s, overlapping its start by an eighth, then paling in 0.3 s. @a-mesurer */
const STAPLE = { trace: 0.6, pale: 0.3, from: Math.PI * 0.62, turn: Math.PI * 2.08 } as const;
const STAPLE_GEOMETRY = new RingGeometry(0.955, 1, 128, 1, STAPLE.from, STAPLE.turn).rotateX(
  -Math.PI / 2,
);

/** Each group of a pile drawn again that stood in the pile before, held where it stood: by how
 *  far from its new place, in pile units, its figurine already moved there. */
function heldWhereTheyStood(
  before: { readonly pieces: PilePieces; readonly figurines: ReadonlyArray<Figurine> },
  pieces: PilePieces,
  figurines: ReadonlyArray<Figurine>,
): Array<{ figurine: Figurine; by: Vector3 }> {
  return pieces.groups.flatMap(({ troopIds }, k) => {
    const was = before.pieces.groups.findIndex((group) => group.troopIds.includes(troopIds[0]!));
    const [figurine, old] = [figurines[k], before.figurines[was]];
    if (figurine === undefined || old === undefined) return [];
    const by = old.object.position.clone().sub(figurine.object.position);
    if (by.lengthSq() === 0) return [];
    figurine.object.position.add(by);
    return [{ figurine, by }];
  });
}
/**
 * **Where each piece of a pile stands around its point** (retours du 15/10, POC du 16/10): a tight
 * formation, one piece per troop. **On a shore** — `seaward`, a unit vector toward the
 * water, `null` inland — hulls stand on the sea side and land troops on the land side, two
 * blocks: a troop on land never stands in the water. In the pile's units, before the near weight
 * scales the whole pile, in the board's own axes.
 */
export function formationOf(
  domains: ReadonlyArray<'land' | 'sea'>,
  seaward: readonly [number, number] | null,
): ReadonlyArray<Slot> {
  const slots = domains.length;
  const afloat = (k: number) => seaward !== null && domains[k] === 'sea';
  const land = Array.from({ length: slots }, (_, k) => k).filter((k) => !afloat(k));
  const sea = Array.from({ length: slots }, (_, k) => k).filter(afloat);
  const placed = new Array<Slot>(slots);
  for (const [members, side] of [
    [land, -1],
    [sea, 1],
  ] as const) {
    if (members.length === 0) continue;
    const slotsOf = block(members.length);
    members.forEach((k, r) => {
      const { x, z } = slotsOf[r]!;
      if (seaward === null) {
        placed[k] = { x, z };
        return;
      }
      // Turned so the rows run along the shore, each block a gap off it on its own side.
      const [sx, sz] = seaward;
      const off = z + side * (Math.max(...slotsOf.map((slot) => Math.abs(slot.z))) + GROUP_SPACING);
      placed[k] = { x: -x * sz + off * sx, z: x * sx + off * sz };
    });
  }
  return placed;
}

/**
 * **A pile is dressed whole or not at all** (ADR 0026 §5): one group without a figurine and
 * the pile keeps its plate — half a pile in figurines would read as half a pile.
 */
/** **The rest pose a group stands at `now`** (ADR 0036 §4): a gun in battery opens its trails. */
const restPoseOf = (group: PilePieces['groups'][number], now: number): RestPose | undefined =>
  group.battery !== undefined && group.battery <= now ? 'emplaced' : undefined;

/** **The next instant a pile changes pose by itself** (#325), `null` when none is due. */
function nextPoseChange(piles: ReadonlyArray<StandingPile>, now: number): number | null {
  const due = piles.flatMap(({ pieces }) =>
    pieces.groups.flatMap(({ battery }) =>
      battery !== undefined && battery > now ? [battery] : [],
    ),
  );
  return due.length === 0 ? null : Math.min(...due);
}

export function dressedGroups(
  nation: string | null,
  pieces: PilePieces,
  now = Date.now(),
): Figurine[] | null {
  const figurines: Figurine[] = [];
  for (const group of pieces.groups) {
    const figurine = figurineFor(nation, group.role, group.figures, restPoseOf(group, now));
    if (figurine === null) return null;
    figurines.push(figurine);
  }
  return figurines.length === 0 ? null : figurines;
}

/**
 * **What a click takes** (ADR 0026 §6): the index of a piece. It is read on the pile's current
 * pieces, never kept: a pile re-served with the same drawing keeps its objects, not necessarily
 * its troops.
 */
type Grip = number;

/** A group is clicked by its footprint, not by its triangles: a rifle is a pixel wide. */
const FOOTPRINT_WIDTH = GROUP_SPACING * 0.9;
const FOOTPRINT = new BoxGeometry(FOOTPRINT_WIDTH, 0.6, 0.75);
FOOTPRINT.translate(0, 0.3, 0);
const UNSEEN = new MeshBasicMaterial();

function footprint({ x, z }: Slot, grip: Grip): Mesh {
  const target = new Mesh(FOOTPRINT, UNSEEN);
  target.visible = false;
  target.position.set(x, 0, z);
  target.userData.grip = grip;
  return target;
}

/** **How much a pile's footprints grow** so as to take at least `LEAST_TARGET_PX` on screen, the
 *  pile drawn at `scale`, `distance` from the eye: never below 1. */
export function targetGrowth(scale: number, distance: number): number {
  const px = (FOOTPRINT_WIDTH * scale * pieceScale.pxPerUnit) / Math.max(distance, 1e-3);
  return Math.max(1, LEAST_TARGET_PX / Math.max(px, 1e-6));
}

/** The troops of the piece a ray takes among `targets`. */
export function pickedIn(
  ray: Raycaster,
  targets: ReadonlyArray<Object3D>,
  pieces: PilePieces,
): ReadonlyArray<string> | null {
  const grip = ray.intersectObjects([...targets], false)[0]?.object.userData.grip as
    Grip | undefined;
  return grip === undefined ? null : (pieces.groups[grip]?.troopIds ?? null);
}

/** **The group whose footprint stands nearest a board point**, its troops — `null` for a pile of
 *  no group. Read on the footprints as they stand in the world. */
export function nearestGroup(
  point: Vector3,
  targets: ReadonlyArray<Object3D>,
  pieces: PilePieces,
): ReadonlyArray<string> | null {
  let nearest: { grip: number; gap: number } | null = null;
  const at = new Vector3();
  for (const target of targets) {
    const grip = target.userData.grip as Grip;
    target.getWorldPosition(at);
    const gap = Math.hypot(at.x - point.x, at.z - point.z);
    if (nearest === null || gap < nearest.gap) nearest = { grip, gap };
  }
  return nearest === null ? null : (pieces.groups[nearest.grip]?.troopIds ?? null);
}

/** **A hovering plane holds its thread's height**, whatever the pile's scale: the plane shrinks
 *  with the pieces, its altitude — three wingspans of the full common scale, drawn at `DRAWN_SHARE` (ADR 0035 §7)
 *  — does not follow the pile's own scale. */
function hover(object: Object3D): void {
  const scale = Math.max(object.scale.y, 1e-3);
  for (const part of object.children)
    if (part.userData.aloft === true) part.position.y = HOVER_ALTITUDE / scale;
}

/** The whole pile as one object at board scale, `null` when it is not dressed. `targets` are
 *  what a click is cast at. */
export function pileObject(
  nation: string | null,
  pieces: PilePieces,
  /** Toward the water from a pile on a shore (`formationOf`), `null` inland. */
  seaward: readonly [number, number] | null = null,
): {
  object: Group;
  /** Its largest piece's span (`troopSpan`): what the pile is laid out and pinned by. */
  span: number;
  /** What its floor is read on (`floorSpanOf`): its largest piece's domain decides, the man's on land. */
  floorSpan: number;
  /** Where its pieces stand round, and half their width and depth: its ring is drawn there. */
  center: { readonly x: number; readonly z: number };
  extent: { readonly x: number; readonly z: number };
  ready: Promise<unknown>;
  /** One per group of the pile, in its order. */
  figurines: ReadonlyArray<Figurine>;
  smokes: ReadonlyArray<Smoke>;
  targets: ReadonlyArray<Mesh>;
} | null {
  const figurines = dressedGroups(nation, pieces);
  if (figurines === null) return null;
  // A piece posted at its site (#475) leaves the formation: the engine stands it at its post.
  const free = pieces.groups.flatMap((group, k) => (group.posted ? [] : [k]));
  const placed = formationOf(
    free.map((k) => (DOMAIN_BY_ROLE[pieces.groups[k]!.role] === 'sea' ? 'sea' : 'land')),
    seaward,
  );
  const layout = pieces.groups.map((_, k) => placed[free.indexOf(k)] ?? { x: 0, z: 0 });
  const object = new Group();
  const smokes: Smoke[] = [];
  const targets: Mesh[] = [];
  const span = Math.max(...figurines.map((figurine) => figurine.span));
  const largest = figurines.findIndex((figurine) => figurine.span === span);
  const floorSpan = floorSpanOf(DOMAIN_BY_ROLE[pieces.groups[largest]!.role], span);
  figurines.forEach((figurine, k) => {
    const slot = layout[k]!;
    figurine.object.position.set(slot.x, 0, slot.z);
    // At its real size inside a pile drawn at its largest piece's (`pileUnitOf`).
    figurine.object.scale.setScalar(1 / pileUnitOf(span));
    object.add(figurine.object);
    const target = footprint(slot, k);
    object.add(target);
    targets.push(target);
    const group = pieces.groups[k]!;
    // A plane that never lands hovers over its shadow, as it flew over it on its thread.
    if (group.aloft) {
      figurine.object.position.y = HOVER_ALTITUDE;
      target.position.y = HOVER_ALTITUDE;
      figurine.object.userData.aloft = true;
      target.userData.aloft = true;
      const shadow = altitudeShadow();
      shadow.position.set(slot.x, 0, slot.z);
      object.add(shadow);
    }
    // Infantry says its strength by its men (`figuresOf`): only a vehicle smokes.
    const plume = group.role === 'infantry' ? null : PLUME_BY_WEAR[group.wear];
    if (plume === null) return;
    const smoke = new Smoke(plume);
    smokes.push(smoke);
    // On the model drawn, and on any copy a sequence stands in for it: the plume follows.
    figurine.dress?.((model, origin) => {
      if (origin) model.getObjectByName('fx_smoke')?.add(smoke.object);
      if (group.wear === 'burning') blacken(model);
    });
  });
  if (pieces.squad && placed.length > 0) object.add(squadMarks(placed, nation, pieces.count));
  const margin = GROUP_SPACING * 0.62;
  const xs = placed.length === 0 ? [0] : placed.map(({ x }) => x);
  const zs = placed.length === 0 ? [0] : placed.map(({ z }) => z);
  return {
    object,
    span,
    floorSpan,
    // A pile on a shore stands inland of its point (`formationOf`): its ring is round its pieces.
    center: {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2,
    },
    extent: {
      x: (Math.max(...xs) - Math.min(...xs)) / 2 + margin,
      z: (Math.max(...zs) - Math.min(...zs)) / 2 + margin,
    },
    ready: Promise.all(figurines.map((figurine) => figurine.ready)),
    figurines,
    smokes,
    targets,
  };
}

/** The squad's outline: dashes of ink round its pieces, a little out from them. */
const OUTLINE_DASHES = 28;
const OUTLINE_INK = new MeshBasicMaterial({
  color: '#2a2118',
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});
const outlines = new Map<number, BufferGeometry>();
function outlineOf(radius: number): BufferGeometry {
  const key = Math.round(radius * 100);
  let geometry = outlines.get(key);
  if (geometry) return geometry;
  const width = 0.03;
  const step = (Math.PI * 2) / OUTLINE_DASHES;
  geometry = mergeGeometries(
    Array.from(
      { length: OUTLINE_DASHES },
      (_, k) => new RingGeometry(radius - width, radius, 4, 1, k * step, step * 0.55),
    ),
  )!;
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0.004, 0);
  outlines.set(key, geometry);
  return geometry;
}

const POLE = new CylinderGeometry(0.009, 0.012, 0.6, 6);
POLE.translate(0, 0.3, 0);
const POLE_WOOD = new MeshStandardMaterial({ color: '#2a1c10', roughness: 0.6 });
const CLOTH = new PlaneGeometry(0.3, 0.19);
CLOTH.translate(0.15, 0.495, 0);
/** A counted pennant flies wider: the count must read at the pile's scale. */
const COUNTED_CLOTH = new PlaneGeometry(0.46, 0.29);
COUNTED_CLOTH.translate(0.23, 0.455, 0);
const flags = new Map<string, MeshStandardMaterial>();
/** The pennant's cloth: the nation's ink — the squad's pieces say how many they are, or past
 *  twelve, the count printed on it in the paper's tone (ADR 0028 §6). */
function flagOf(nation: string | null, count?: number): MeshStandardMaterial {
  const key = `${nation}:${count ?? ''}`;
  let flag = flags.get(key);
  if (!flag) {
    flag = new MeshStandardMaterial({ color: nationInk(nation), roughness: 0.9, side: DoubleSide });
    const printed = count === undefined ? null : countCloth(nationInk(nation), count);
    if (printed !== null) {
      flag.color.set('#ffffff');
      flag.map = printed;
      // The count glows a little through the cloth: it must read by night too.
      flag.emissive.set('#ffffff');
      flag.emissiveMap = printed;
      flag.emissiveIntensity = 0.45;
    }
    flags.set(key, flag);
  }
  return flag;
}

function countCloth(ink: string, count: number): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 100;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, 160, 100);
  ctx.fillStyle = PALETTE.paper;
  ctx.font = '700 84px "Bodoni Moda", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(count), 80, 54);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * **Ce qui fait d'une pile une escouade** (POC « Manipuler les pions », 16/10) : un détourage
 * d'encre autour de ses pièces et un fanion à l'encre de la nation. Pas de socle : le plateau est
 * le papier de la carte.
 */
function squadMarks(
  layout: ReadonlyArray<Slot>,
  nation: string | null,
  count: number | undefined,
): Group {
  const margin = GROUP_SPACING * 0.62;
  const rx = Math.max(...layout.map(({ x }) => Math.abs(x))) + margin;
  const rz = Math.max(...layout.map(({ z }) => Math.abs(z))) + margin;
  const marks = new Group();
  const outline = new Mesh(outlineOf(1), OUTLINE_INK);
  outline.scale.set(rx, 1, rz);
  marks.add(outline);
  const pennant = new Group();
  pennant.add(
    new Mesh(POLE, POLE_WOOD),
    new Mesh(count === undefined ? CLOTH : COUNTED_CLOTH, flagOf(nation, count)),
  );
  pennant.position.set(-rx * Math.SQRT1_2, 0, -rz * Math.SQRT1_2);
  pennant.traverse((part) => (part.castShadow = true));
  marks.add(pennant);
  return marks;
}

export function blacken(figurine: Object3D): void {
  figurine.traverse((part) => {
    if (part instanceof Mesh && !(part.material instanceof MeshBasicMaterial))
      part.material = Array.isArray(part.material)
        ? part.material.map(charred)
        : charred(part.material);
  });
}

/** **A hull that came up to the mole** when the one at the mole left (#487): the group `id` was at
 *  `from`, and rests at `to`, in the site's metres. */
export type Promotion = {
  readonly site: string;
  readonly id: string;
  readonly role: UnitRole;
  readonly from: Rest;
  readonly to: Rest;
};

/** Where a posted piece rests on the board, its heading; `at` null when it has no post. */
type Post = { k: number; at: Vector3 | null; heading: number };
/** A footprint kept out of every ray. */
const OUT_OF_REACH = -1e6;

/** `ready` flips once every figurine is in: until then the pile is not on the layer and its plate stays. */
type Dressed = {
  readonly key: string;
  at: StandingPile['at'];
  facing: number | undefined;
  pieces: PilePieces;
  readonly object: Group;
  readonly span: number;
  readonly floorSpan: number;
  /** **The size of its site it is drawn at** (#433): a port's, at its quay; 1 anywhere else. */
  sized: number;
  ready: boolean;
  /** How much of it stands rather than its pin, at the last `orient`. */
  near: number;
  /** Its first `orient` has run: before, it stands at the size of its models, not the board's. */
  placed: boolean;
  /** It has stood, landed and placed, at a whole `orient`: what no walk claimed by then stands
   *  at once (`arrive`). */
  stood: boolean;
  /** Its groups held where the pile drawn before stood them, by how far from their new places
   *  (pile units), until `arrive` glides them or the next `orient` stands them there. */
  held: ReadonlyArray<{ readonly figurine: Figurine; readonly by: Vector3 }>;
  readonly figurines: ReadonlyArray<Figurine>;
  readonly smokes: ReadonlyArray<Smoke>;
  readonly targets: ReadonlyArray<Mesh>;
  /** What it is to the hand right now (POC, `ringStyle`), round its footprint. */
  readonly ring: InkRing;
  readonly extent: { readonly x: number; readonly z: number };
  /** What its ring, its foot and its halo are drawn round: `extent`, until posted pieces stand
   *  elsewhere than the formation (#475). */
  outline: { readonly x: number; readonly z: number };
};

/** A piece in hand: the pile it was lifted from, and the troops lifted (ADR 0026 §6). */
export type PieceHold = {
  readonly pileId: string;
  readonly troopIds: ReadonlyArray<string>;
  /** Where it cannot go, veiled while it is in hand (`forbiddenGroundOf`). */
  readonly forbidden?: Forbidden;
};

/** The prototype's (`lpLift`): what stays behind is a ghost of the piece. */
const WASHED_OPACITY = 0.35;
const washes = new WeakMap<Material, Material>();
export function washedOf(material: Material): Material {
  let copy = washes.get(material);
  if (copy) return copy;
  copy = material.clone();
  copy.transparent = true;
  copy.opacity *= WASHED_OPACITY;
  copy.depthWrite = false;
  washes.set(material, copy);
  return copy;
}

/** Figurines share their model's materials: the lifted pile wears washed copies, kept in
 *  `userData.unwashed` until it is put back — the same file elsewhere stays whole. */
function wash(object: Object3D, washed: boolean): void {
  object.traverse((part) => {
    if (!(part instanceof Mesh) || part.userData.grip !== undefined || part instanceof InkRing)
      return;
    const kept = part.userData.unwashed as Mesh['material'] | undefined;
    if (!washed) {
      if (kept === undefined) return;
      part.material = kept;
      delete part.userData.unwashed;
      return;
    }
    if (kept !== undefined) return;
    part.userData.unwashed = part.material;
    part.material = Array.isArray(part.material)
      ? part.material.map(washedOf)
      : washedOf(part.material);
  });
}

/** The prototype's lift (`LIFT_Y`, `lpHand` at 4.2), in the pile's units at full near weight. */
const CARRIED_LIFT = 0.25;
/** The prototype's scale: its piece is 1.35 long, a group here about 0.4 — its gestures in our units. */
const PROTOTYPE_UNIT = 0.3;
/** The hop on the way back: the prototype's 1.0 over a lift of 1.5. */
const RETURN_HOP = CARRIED_LIFT * 0.67;
/** A set-down piece slides onto its point while it drops: a moment more to arrive there. */
const SETTLE_TAIL = 0.2;

/**
 * **The piece in hand** (ADR 0026 §6, the prototype's `lp`). It hangs `lift` above the board,
 * follows the pointer a beat late and sways while it does; set down at a pose, it drops and
 * stays; put back, it glides home and drops there. Its shadow is a disc on the board that
 * spreads and pales as the piece rises.
 */
type Carried = {
  readonly pileId: string;
  readonly troopIds: ReadonlyArray<string>;
  /** What a click is cast at: the copy is the piece as it is seen. */
  readonly targets: ReadonlyArray<Mesh>;
  readonly object: Group;
  readonly piece: Group;
  readonly span: number;
  readonly floorSpan: number;
  readonly shadow: { readonly object: Group; readonly materials: MeshBasicMaterial[] };
  /** The ring on the ground where it would land, and the line that drops to it. */
  readonly marks: Marks;
  readonly width: number;
  /** Half its width and depth (`pileObject`): what its reticle and its rings are sized by. */
  readonly radius: number;
  pointer: Vector3 | null;
  lift: number;
  drag: { x: number; z: number };
  readonly since: number;
  clock: number;
  down: { readonly at: Vector3; readonly since: number; readonly from: number } | null;
  back: {
    readonly from: Vector3;
    readonly since: number;
    readonly carried: number;
    /** **Into its transport** (15/10): it glides there and shrinks away, rather than home. */
    readonly into: Vector3 | null;
    /** **A refused drop** shakes its head where it was let go before it goes. */
    readonly refused: boolean;
  } | null;
  /** **Sent** (POC, `settle`): it waits where it was let go, pale, in a turning ochre ring. */
  settled: number | null;
  /** The pile it was set down on: sent, it flies into it rather than waiting (POC, `absorb`). */
  onto: string | null;
};

type Marks = {
  readonly reticle: InkRing;
  readonly plumb: Line<BufferGeometry, LineDashedMaterial>;
};

/** The reticle reads the drop (POC): ochre where an order would leave, red to a fight, red and
 *  dashed where it is refused, none where the piece would only go back. */
const RETICLE: Readonly<Record<DropVerdict, RingState | null>> = {
  order: 'aim',
  fight: 'aimFight',
  refused: 'aimRefused',
  none: null,
};
export type DropVerdict = 'order' | 'fight' | 'refused' | 'none';
/** The prototype's head shake: five half-turns over 0.28 s, fading. */
const SHAKE_S = 0.28;
const SHAKE_TURN = 0.22;
/** A refusal is announced before the hand empties, like a boarding. */
const REFUSAL_MS = 1000;
export const RETICLE_LIFT = 0.006;

function carriedMarks(): Marks {
  const reticle = new InkRing();
  reticle.position.y = RETICLE_LIFT;
  const plumb = new Line(
    new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(0, 1, 0)]),
    new LineDashedMaterial({
      color: PALETTE.border,
      dashSize: 0.14,
      gapSize: 0.1,
      transparent: true,
      opacity: 0.55,
    }),
  );
  plumb.computeLineDistances();
  return { reticle, plumb };
}

/** The prototype's lift (`startCarry`): a stretch upward that settles, as if off the felt. */
const STRETCH_S = 0.4;
/** Over a target the copy hangs higher (`lift + 0.7` of the prototype's 1.6) and hops once. */
const OVER_TARGET = 0.44;
const HOP = (0.35 / 1.6) * CARRIED_LIFT;
/** Sent, the pale copy waits this long at its destination, then fades out. */
const SETTLED_S = 2.4;
const UNSETTLE_S = 0.35;
/** The prototype's squash where a piece lands (`settle`). */
const SQUASH_S = 0.3;

/** A boarding is announced before the hand empties: past this, the next putting back is one. */
const BOARDING_MS = 3000;

/**
 * **The copies a click is taken by**: set down under a rose, or on their way home, a click on them
 * is a click on their pile, never on the board under them. The one following the pointer is not
 * among them: it hangs where the pointer is, so it would take every putting down for a putting
 * back, and the bare ground could never be aimed at.
 */
export function takenCopies<C extends { readonly down: unknown }>(
  carried: C | null,
  leaving: C | null,
): C[] {
  return [carried?.down === null ? null : carried, leaving].filter(
    (copy): copy is C => copy !== null,
  );
}

/** Its own copy of the altitude disc: the board's is shared, and this one fades on its own. */
function carriedShadow(): Carried['shadow'] {
  const object = altitudeShadow();
  const materials: MeshBasicMaterial[] = [];
  object.traverse((part) => {
    if (!(part instanceof Mesh)) return;
    const material = (part.material as MeshBasicMaterial).clone();
    materials.push(material);
    part.material = material;
  });
  return { object, materials };
}

/** Off the board, and its own shadow's materials freed: the rest is shared. */
function discard(carried: Carried): void {
  carried.object.removeFromParent();
  for (const material of carried.shadow.materials) material.dispose();
  const { reticle, plumb } = carried.marks;
  // The reticle's plane is every ring's: only its own material goes.
  reticle.material.dispose();
  plumb.geometry.dispose();
  plumb.material.dispose();
}

/** The held pieces only: a troop taken out of its squad is carried alone, no outline. */
function heldPieces(pieces: PilePieces, troopIds: ReadonlyArray<string>): PilePieces {
  const held = new Set(troopIds);
  // In hand it is carried with the others: no post to stand at.
  const groups = pieces.groups
    .filter((group) => group.troopIds.some((id) => held.has(id)))
    .map(({ posted: _, ...group }) => group);
  return { groups, troopIds, squad: pieces.squad && groups.length > 1 };
}

/** What a pick found: the piece under the pointer, and its pile. */
export type PiecePick = PieceHold & {
  /** The piece stands in a squad: a long press takes it alone. */
  readonly squad?: boolean;
  /** How far from the eye: a maquette in front of the piece takes the click. */
  readonly distance: number;
  /** The piece in hand itself: it is put back wherever it is seen. */
  readonly carried?: true;
};

/** What a pile draws: its nation, its count, and per piece the role, the figures, the wear and the riders. */
export const drawnKey = (
  nation: string | null,
  { groups, count }: PilePieces,
  now = Date.now(),
): string =>
  JSON.stringify([
    nation,
    count,
    groups.map((g) => [g.role, g.figures, g.wear, g.aboard, restPoseOf(g, now), g.posted]),
  ]);

/**
 * **My piles standing on the board, in figurines** (ADR 0026 §3 and §5) — the twin of a
 * movement's pawn for what is not moving. Full at the country level, gone beyond the region
 * fade: far away the label's plate is the pile. Only a worn vehicle's smoke moves on its own,
 * and it is an ambient layer: it steps on the ambient beat and stands still when motion is
 * reduced or cut — the smoke stays, the wear is information. A model or a counter face that
 * lands late asks for its frame through `changed`.
 */
export class StandingLayer implements SequenceHost {
  readonly group = new Group();
  private time = 0;
  private nation: string | null = null;
  private piles: ReadonlyArray<StandingPile> = [];
  /** The dressed pile a label stands for when it is not the pile's own, the first served
   *  (`pileOfLabel`): every label asks at every frame, and a search through the piles for each
   *  was their product. */
  private owned = new Map<string, string>();
  private dressed = new Map<string, Dressed>();
  private held: PieceHold | null = null;
  motion: MapMotion = 'full';
  /** Where a target that is not a pile lies — an enemy camp: sent there, the copy flies in. */
  elsewhere: (id: string) => Vector3 | null = () => null;
  /** The copy of what is in hand; `null` when the pile is not dressed. */
  private carried: Carried | null = null;
  /** A refusal announced, waiting for the hand to empty (`refuseDrop`). */
  private refusal: number | null = null;
  private verdict: DropVerdict = 'none';
  /** What each pile is to the hand (`setRings`): hovered, in hand, aimed at, a free seat. */
  private rings: ReadonlyMap<string, RingState> = new Map();
  /** The pile the drop is read on, whose own ring answers: no reticle under the hand. */
  private aimed: string | null = null;
  private hopSince = 0;
  /** Piles grown under the eyes, not yet told (`merged`). */
  private readonly grown = new Set<string>();
  /** Piles owed a ring of ink at reduced motion, once they stand (`inkArrival`). */
  private readonly inked = new Set<string>();
  /** **Piles a sequence will claim** (`expect`, #277): their held groups wait for `arrive`, they do
   *  not stand at once in their new places. */
  private readonly expected = new Map<string, number>();
  /** **Where each troop's group last stood** (#277), as its pile was drawn again or went: what a
   *  piece set apart walks from, and a man boarding. Kept `SEEN_MS`. */
  private readonly seen = new Map<
    string,
    { readonly at: Vector3; readonly heading: number; readonly since: number }
  >();
  /** **The men boarding a truck** (#277), drawn for their walk to its tailgate, by
   *  `${pileId}/+${troopId}`: a rider is not drawn in its pile any more. */
  private readonly boarders = new Map<
    string,
    { readonly pileId: string; readonly figurine: Figurine; ready: boolean }
  >();
  /** Sent copies waiting at their destination (POC, `settle`). */
  private settling: Carried[] = [];
  /** Ripples of ink and puffs of dust, each on its own clock. */
  private effects: {
    readonly since: number;
    readonly seconds: number;
    readonly step: (k: number) => void;
    readonly end: () => void;
  }[] = [];
  /** The next change of pose a pile makes by itself (`nextPoseChange`). */
  private posing: ReturnType<typeof setTimeout> | null = null;
  /** A boarding announced, waiting for the hand to empty (`boardInto`): where the copy glides
   *  into its transport, or `null` when it goes home and its men board from there (#277). */
  private boarding: { readonly at: Vector3 | null; readonly since: number } | null = null;
  /** The copy put back, on its way home. */
  private leaving: Carried | null = null;

  constructor(
    private readonly frame: WorldFrame,
    private readonly changed: () => void,
    private readonly garrisonAt: GarrisonAt,
    /** Toward the water from a point on a shore, `null` inland (`formationOf`). */
    private readonly seaward: (lonLat: LonLat) => readonly [number, number] | null = () => null,
  ) {
    // A pile gone to its pin keeps its place, and its figurines are not walked at every frame.
    leaveHiddenPartsUnplaced(this.group);
  }

  setNation(nation: string | null): void {
    this.nation = nation;
    this.display(this.piles);
  }

  /** A pile whose pieces did not change keeps its objects: the view is re-served at every step
   *  of any column, and rebuilding three squads each time would be work for nothing. */
  display(piles: ReadonlyArray<StandingPile>): void {
    this.piles = piles;
    const now = Date.now();
    // No view comes as a gun goes into battery: the pile dresses itself again then.
    if (this.posing !== null) clearTimeout(this.posing);
    const change = nextPoseChange(piles, now);
    this.posing =
      change === null ? null : setTimeout(() => this.display(this.piles), change - now + 1);
    const next = new Map<string, Dressed>();
    for (const pile of piles) {
      // A port that turns, or lands, ranks its hulls again along its front (#436).
      const shore = this.shoreOf(pile.at);
      const key = `${drawnKey(this.nation, pile.pieces, now)} ${shore?.map((v) => v.toFixed(3))}`;
      const kept = this.dressed.get(pile.id);
      // A pile grown under the eyes is a squad formed or joined (POC, `merge`): said once it
      // stands, or when the newcomer reaches its rank (`arrive`).
      if (
        kept?.ready === true &&
        kept.object.visible &&
        pile.pieces.troopIds.length > kept.pieces.troopIds.length
      )
        this.grown.add(pile.id);
      if (kept?.key === key) {
        kept.at = pile.at;
        kept.facing = pile.facing;
        kept.pieces = pile.pieces;
        this.dressed.delete(pile.id);
        next.set(pile.id, kept);
        continue;
      }
      const built = pileObject(this.nation, pile.pieces, shore);
      if (built === null) continue;
      for (const smoke of built.smokes) smoke.frame(this.time);
      for (const target of built.targets) target.userData.pileId = pile.id;
      const ring = new InkRing();
      ring.position.set(built.center.x, RETICLE_LIFT, built.center.z);
      built.object.add(ring);
      const extent = {
        x: built.extent.x + (pile.pieces.squad ? 0.08 : 0.02),
        z: built.extent.z + (pile.pieces.squad ? 0.08 : 0.02),
      };
      const entry: Dressed = {
        key,
        at: pile.at,
        facing: pile.facing,
        pieces: pile.pieces,
        object: built.object,
        span: built.span,
        floorSpan: built.floorSpan,
        sized: 1,
        ready: false,
        near: 0,
        placed: false,
        stood: false,
        held: kept === undefined ? [] : heldWhereTheyStood(kept, pile.pieces, built.figurines),
        figurines: built.figurines,
        smokes: built.smokes,
        targets: built.targets,
        ring,
        // Round a squad, outside its dashed outline.
        extent,
        outline: extent,
      };
      next.set(pile.id, entry);
      // A model that fails to load leaves the pile in its plate.
      built.ready.then(
        () => {
          if (this.dressed.get(pile.id) !== entry) return;
          entry.ready = true;
          // After the hull is blackened: that callback was chained before this one.
          if (this.held?.pileId === pile.id) wash(entry.object, true);
          this.group.add(entry.object);
          this.changed();
        },
        () => {},
      );
    }
    for (const [troopId, { since }] of this.seen)
      if (now - since > SEEN_MS) this.seen.delete(troopId);
    for (const [id, gone] of this.dressed) {
      this.remember(id, gone, now);
      gone.object.removeFromParent();
      gone.ring.material.dispose();
    }
    for (const [id, { pileId }] of this.boarders) if (!next.has(pileId)) this.boarders.delete(id);
    this.dressed = next;
    this.owned = new Map();
    for (const pile of piles) {
      const label = labelOfPile(pile, pile.id);
      if (next.has(pile.id) && !this.owned.has(label)) this.owned.set(label, pile.id);
    }
    if (this.held !== null && this.carried === null) this.lift(this.held);
    this.rebuild();
  }

  readonly smoke: AmbientLayer = {
    fx: 'smoke',
    idle: () =>
      ![...this.dressed.values()].some(
        ({ ready, object, smokes }) => ready && object.visible && smokes.length > 0,
      ),
    frame: (time) => {
      this.time = time;
      for (const { ready, smokes } of this.dressed.values())
        if (ready) for (const smoke of smokes) smoke.frame(time);
    },
  };

  isDressed(id: string): boolean {
    return this.dressed.get(id)?.ready === true;
  }

  /** The figurines a sequence has stood a copy in, by `${pileId}/${group}`: a pile dressed again
   *  has other figurines, and the sequence on the old ones is over. */
  private readonly stoodIn = new Map<string, Figurine>();

  /** **The place of each plane at the site it rests on** (#475), by site then troop. */
  private readonly places = new Map<string, Map<string, Place>>();
  /** How the planes just formed or come home reach their places, until they have one. */
  private readonly arrivals = new Map<string, 'formed' | 'returned'>();
  /** **The post of each hull at the port it rests at** (#487), by site then troop: a state of its
   *  troop like a plane's place, kept while it stays; a hull that leaves frees its post. */
  private readonly hullPosts = new Map<string, Map<string, HullPost>>();
  /** Where each posted piece last rested, in its site's metres, and the pile it stood in. */
  private readonly lastRest = new Map<
    string,
    { site: string; rest: Rest; post: HullPost | null }
  >();
  /** **The side each site was last laid out on** (#476): when it turns over, what rested on it
   *  is no longer where it rested, and the rests kept for its departures are dropped. */
  private readonly mirroredSites = new Map<string, boolean>();
  /** **Where a piece rested when it left its site** (#487), for the sequence of its departure:
   *  kept `SEEN_MS`. */
  private readonly left = new Map<
    string,
    { site: string; rest: Rest; post: HullPost | null; since: number }
  >();
  /** The hulls that moved up to the mole when the one there left, not yet played. */
  private promotions: Array<Promotion> = [];

  private figurineOf(id: string): { figurine: Figurine; placed: boolean } | null {
    const at = id.lastIndexOf('/');
    const pileId = id.slice(0, at);
    const entry = this.dressed.get(pileId);
    const boarder = this.boarders.get(id);
    if (boarder !== undefined)
      return entry?.ready && entry.placed && entry.object.visible && boarder.ready
        ? { figurine: boarder.figurine, placed: true }
        : null;
    // A pile in hand is washed out in place: a copy would stand there unwashed.
    if (entry === undefined || this.held?.pileId === pileId) return null;
    // A pile drawn again after a view (a troop stepped down) is loading, then waits for its
    // first `orient`: it is lent unmeasured until then, and `visible` is read once placed.
    const placed = entry.ready && entry.placed;
    if (placed && !entry.object.visible) return null;
    const figurine = entry.figurines[Number(id.slice(at + 1))];
    return figurine === undefined ? null : { figurine, placed };
  }

  /** **What a sequence may borrow** (`SequenceHost`): a group of a pile that stands and is not
   *  in hand, with the one file a copy is cooked from — none for a squad, which moves whole. */
  pieceOf(
    id: string,
  ): { url?: string; pose?: RestPose; box: Box3 | null; length?: number | null } | null {
    const lent = this.figurineOf(id);
    const stood = this.stoodIn.get(id);
    if (lent === null || (stood && stood !== lent.figurine)) return null;
    const { url, pose } = lent.figurine;
    const file = { ...(url === undefined ? {} : { url }), ...(pose === undefined ? {} : { pose }) };
    if (!lent.placed) return { ...file, box: null };
    // A copy just stood in has not been placed yet: its meshes would read at the origin.
    const { object } = lent.figurine;
    object.updateMatrixWorld(true);
    // With the place it stands at: a walk off the screen to a rank on it goes on (#268).
    return {
      ...file,
      box: boxOfObject(object).clone().expandByPoint(object.getWorldPosition(new Vector3())),
      length: this.lengthOf(id),
    };
  }

  /** **The gun in battery nearest `at`** (#325), within `within` on the board: the group a
   *  bombardment's copy stands in for (`BatteryShot`); `null` when none is drawn there. */
  batteryNear(at: Vector3, within: number): string | null {
    const now = Date.now();
    let best: { id: string; gap: number } | null = null;
    for (const [pileId, entry] of this.dressed)
      for (const [k, group] of entry.pieces.groups.entries()) {
        if (group.role !== 'artillery' || restPoseOf(group, now) === undefined) continue;
        const id = `${pileId}/${k}`;
        const place = this.placeOf(id);
        const gap = place === null ? Infinity : Math.hypot(place.at.x - at.x, place.at.z - at.z);
        if (gap <= within && (best === null || gap < best.gap)) best = { id, gap };
      }
    return best?.id ?? null;
  }

  /** What a pile stands, as dressed here. */
  piecesOf(pileId: string): PilePieces | null {
    return this.dressed.get(pileId)?.pieces ?? null;
  }

  /** A clone of the group as drawn, for a sequence that moves it whole: once placed. */
  copyOf(id: string): Object3D | null {
    const lent = this.figurineOf(id);
    return lent?.placed ? (lent.figurine.copy?.() ?? null) : null;
  }

  /** **Where a group stands on the board**, the way it faces, and each man of a squad, front
   *  first: what a walk ends on. `null` until placed, or once it is its pin. */
  placeOf(id: string): { at: Vector3; front: Vector3; men: Vector3[] } | null {
    const lent = this.figurineOf(id);
    if (!lent?.placed) return null;
    const { object } = lent.figurine;
    object.updateWorldMatrix(true, true);
    const men: Object3D[] = [];
    object.traverse((node) => /^man_\d+$/.test(node.name) && men.push(node));
    return {
      at: object.getWorldPosition(new Vector3()),
      front: new Vector3(0, 0, 1).transformDirection(object.matrixWorld),
      men: men
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .map((man) => man.getWorldPosition(new Vector3())),
    };
  }

  /** **How long a group is drawn**, nose to tail along its own front, on the board: a turned
   *  rank does not lengthen it as its world box does (#271). `null` until placed. */
  lengthOf(id: string): number | null {
    const lent = this.figurineOf(id);
    return lent?.placed ? lengthAlong(lent.figurine.object) : null;
  }

  /** The copy takes the group's model's place, at its scale: it is drawn under the same
   *  `model` group. The pile's feet, which a click takes, do not change. */
  standIn(id: string, copy: Object3D | null): void {
    const figurine = copy === null ? this.stoodIn.get(id) : this.figurineOf(id)?.figurine;
    if (figurine === undefined) return;
    figurine.standIn?.(copy);
    if (copy === null) this.stoodIn.delete(id);
    else this.stoodIn.set(id, figurine);
    // A man boarding is under the tarp once his walk is over: he is drawn no more.
    if (copy === null) this.unboard(id);
    this.changed();
  }

  /** Takes back every copy stood in the groups of a pile: its sequence ends on its next step. */
  private recall(pileId: string): void {
    for (const [id, figurine] of this.stoodIn)
      if (id.slice(0, id.lastIndexOf('/')) === pileId) {
        figurine.standIn?.(null);
        this.stoodIn.delete(id);
      }
  }

  /** The troops of the piece under `ray`, among the piles standing in sight. */
  pick(ray: Raycaster, { under = false }: { under?: boolean } = {}): PiecePick | null {
    let copy: { distance: number; pick: PieceHold } | null = null;
    // Carried, the copy is always under the pointer: what it is let go on stands beneath it.
    for (const carried of under ? [] : takenCopies(this.carried, this.leaving)) {
      if (carried.object.parent === null) continue;
      const distance = footedHit(ray, carried.object, carried.targets);
      if (distance !== null && (copy === null || distance < copy.distance))
        copy = { distance, pick: { pileId: carried.pileId, troopIds: carried.troopIds } };
    }
    if (copy !== null) return { ...copy.pick, distance: copy.distance, carried: true };
    type Hit = { distance: number; pick: PieceHold & { squad: boolean } };
    let best: Hit | null = null;
    // Under the hand, the pile it came from is only what nothing else is (POC, `exclude`): its
    // pale home in front of a pile must not take the drop meant for it.
    let home: Hit | null = null;
    for (const [pileId, entry] of this.dressed) {
      if (!entry.ready || !entry.object.visible) continue;
      let distance = ray.intersectObjects([...entry.targets], false)[0]?.distance;
      let troopIds = distance === undefined ? null : pickedIn(ray, entry.targets, entry.pieces);
      // Pressed anywhere on what it draws, a pile gives the piece nearest the pointer: in a Blitz
      // that is the unit (ONE_UNIT_ONLY), in a squad the troop a long press takes out.
      if (distance === undefined) {
        distance = drawnHit(ray, entry.object) ?? undefined;
        if (distance !== undefined)
          troopIds = nearestGroup(ray.ray.at(distance, new Vector3()), entry.targets, entry.pieces);
      }
      if (distance === undefined || troopIds === null) continue;
      const hit = { distance, pick: { pileId, troopIds, squad: entry.pieces.squad } };
      if (under && pileId === this.held?.pileId) home = hit;
      else if (best === null || distance < best.distance) best = hit;
    }
    best ??= home;
    return best === null ? null : { ...best.pick, distance: best.distance };
  }

  /** The world box of the figurines a dressed pile stands in, `null` when it is not drawn. */
  boxOf(id: string): Box3 | null {
    const entry = this.dressed.get(this.pileOfLabel(id) ?? '');
    return entry?.ready === true && entry.object.visible ? boxOfObject(entry.object) : null;
  }

  /** The label a pile under the pointer answers to (`labelOfPile`). */
  labelOfPile(pileId: string): string {
    return labelOfPile(
      this.piles.find((pile) => pile.id === pileId),
      pileId,
    );
  }

  /** The pile under `ray`, by its figurines or the footprints it is taken by — a garrison beside
   *  its maquette included. The pile in hand is not under the pointer: it is what the pointer
   *  carries. */
  under(ray: Raycaster): PieceHit | null {
    let best: PieceHit | null = null;
    for (const [id, entry] of this.dressed) {
      if (!entry.ready || !entry.object.visible || id === this.held?.pileId) continue;
      const distance = footedHit(ray, entry.object, entry.targets);
      if (distance !== null) best = nearer(best, { id, distance });
    }
    return best;
  }

  /**
   * **Lifts a piece, or puts it back with `null`**: the pile washes out where it stands, and a
   * copy of the held groups waits for `carryTo` to follow the pointer. A pile that is not
   * dressed lifts nothing on the board — the cursor alone says a piece is in hand.
   */
  hold(held: PieceHold | null, sent = false): void {
    const previous = this.held;
    if (previous?.pileId === held?.pileId && previous?.troopIds.join() === held?.troopIds.join())
      return;
    this.dropLeaving();
    const lifted = this.carried;
    this.carried = null;
    // Put back, the copy goes home and drops there; sent, its pawn takes over; boarded, it
    // glides into its transport — or onto a truck goes home, its men board from there (#277).
    const released = performance.now();
    const boarded = this.boarding !== null && released - this.boarding.since < BOARDING_MS;
    const into = boarded ? this.boarding!.at : null;
    this.boarding = null;
    const refused = this.refusal !== null && released - this.refusal < REFUSAL_MS;
    this.refusal = null;
    this.verdict = 'none';
    // The wood under the hand (POC): lifted, let go on an order, put back. A boarding and a
    // refusal were heard as they were told (`boardInto`, the engine's `refuseDrop`).
    if (held !== null && previous?.pileId !== held.pileId) {
      playTableSound('lift');
      const foot = this.footOf(held.pileId);
      if (foot !== null) {
        this.ripple(foot.at, foot.radius * 0.9);
        this.dust(foot.at, 3, 0.5, foot.scale);
      }
    }
    if (held === null && previous !== null && !boarded && !refused && !sent)
      playTableSound('whoosh');
    // Sent onto a pile, the copy flies into it (POC, `absorb`); elsewhere it waits there, pale.
    const onto = lifted?.onto ?? null;
    const absorbed = sent && onto !== null ? (this.footOf(onto)?.at ?? this.elsewhere(onto)) : null;
    if (lifted !== null && held === null && (!sent || absorbed !== null) && this.motion !== 'off') {
      lifted.back = {
        from: lifted.object.position.clone(),
        since: released,
        carried: lifted.lift,
        into: into ?? absorbed,
        refused: refused && !boarded && this.motion === 'full',
      };
      lifted.down = null;
      this.leaving = lifted;
    } else if (lifted !== null && held === null && sent && this.motion === 'full') {
      lifted.settled = released;
      lifted.pointer = null;
      wash(lifted.piece, true);
      this.settling.push(lifted);
      if (previous !== null) {
        const entry = this.dressed.get(previous.pileId);
        if (entry) wash(entry.object, false);
      }
    } else {
      if (lifted !== null) discard(lifted);
      if (previous !== null) {
        const entry = this.dressed.get(previous.pileId);
        if (entry) wash(entry.object, false);
      }
    }
    this.held = held;
    if (held === null) {
      this.aimed = null;
      return;
    }
    this.lift(held);
  }

  /** **The copy that follows the hand**, made once the held pile is dressed: a fleet taken at sea
   *  (#449) is dressed by the same answer that takes it. */
  private lift(held: PieceHold): void {
    const entry = this.dressed.get(held.pileId);
    if (entry === undefined) return;
    // A sequence's copy gives the model back first: the model is what is washed out.
    this.recall(held.pileId);
    if (entry.ready) wash(entry.object, true);
    const copy = pileObject(
      this.nation,
      heldPieces(entry.pieces, held.troopIds),
      this.shoreOf(entry.at),
    );
    if (copy === null) return;
    hideAltitudeShadows(copy.object);
    const piece = new Group();
    piece.add(copy.object);
    const shadow = carriedShadow();
    const width = Math.max(1, 0.6 * heldPieces(entry.pieces, held.troopIds).groups.length);
    const marks = carriedMarks();
    const object = new Group();
    object.add(piece, shadow.object, marks.reticle, marks.plumb);
    object.position.copy(entry.object.position);
    copy.object.rotation.y = entry.object.rotation.y;
    object.visible = false;
    for (const smoke of copy.smokes) smoke.frame(this.time);
    const now = performance.now();
    const carried: Carried = {
      pileId: held.pileId,
      troopIds: held.troopIds,
      targets: copy.targets,
      object,
      piece,
      span: copy.span,
      floorSpan: copy.floorSpan,
      shadow,
      marks,
      width,
      radius: Math.max(copy.extent.x, copy.extent.z),
      pointer: null,
      lift: this.motion === 'full' ? 0 : CARRIED_LIFT,
      drag: { x: 0, z: 0 },
      since: now,
      clock: now,
      down: null,
      back: null,
      settled: null,
      onto: null,
    };
    this.carried = carried;
    copy.ready.then(
      () => {
        if (this.carried !== carried) return;
        this.group.add(object);
        this.changed();
      },
      () => {},
    );
  }

  /** The piece in hand sways and trails the pointer, a piece set down or put back drops: every
   *  frame while it lasts, at full motion. */
  get isCarrying(): boolean {
    if (this.motion !== 'full') return false;
    const carried = this.carried;
    // Set down under its rose, it lies still: only its drop wants frames.
    const moving =
      carried !== null &&
      carried.object.parent !== null &&
      carried.object.visible &&
      (carried.down === null
        ? carried.pointer !== null
        : (performance.now() - carried.down.since) / 1000 < DROP_DONE + SETTLE_TAIL);
    return moving || this.leaving !== null || this.settling.length > 0 || this.effects.length > 0;
  }

  /** **The rings round the piles** (POC, `ringStyle`), by pile; a pile left out has none. */
  setRings(rings: ReadonlyMap<string, RingState>, aimed: string | null = null): void {
    this.rings = rings;
    // The copy hops as the hand comes over a target (POC, `bump`).
    if (aimed !== null && aimed !== this.aimed) this.hopSince = performance.now();
    this.aimed = aimed;
  }

  /** **A ring of ink at a point of the board**, in reduced motion (#278): a tour at its quay. */
  rippleAt(at: Vector3, radius: number): void {
    this.ripple(at, radius, false, true);
  }

  /** **A ring of ink spreads where a piece touches down** (POC, `ripple`); at reduced motion
   *  only when it is all there is to see (`reduced`). */
  private ripple(at: Vector3, radius: number, ochre = false, reduced = false): void {
    if (this.motion !== 'full' && !(reduced && this.motion === 'reduced')) return;
    const ring = new InkRing();
    ring.position.set(at.x, at.y + RETICLE_LIFT, at.z);
    this.group.add(ring);
    this.effects.push({
      since: performance.now(),
      seconds: 0.55,
      step: (k) => {
        const e = 1 - (1 - k) ** 3;
        ring.style(ochre ? 'rippleOchre' : 'ripple', 0, true);
        ring.opacity = 0.55 * (1 - e);
        ring.scale.setScalar(radius * (0.8 + 1.4 * e));
      },
      end: () => {
        ring.material.dispose();
        ring.removeFromParent();
      },
    });
  }

  /** **A puff of dust** where a piece leaves or lands (POC, `emit('dust')`), `size` in its units. */
  private dust(at: Vector3, count: number, size: number, scale: number): void {
    if (this.motion !== 'full') return;
    const grain = size * PROTOTYPE_UNIT * scale;
    const burst = new DustBurst(count, grain);
    burst.object.position.set(at.x, at.y + 0.2 * PROTOTYPE_UNIT * scale, at.z);
    this.group.add(burst.object);
    this.effects.push({
      since: performance.now(),
      seconds: 1.2,
      step: (k) => burst.step(k * 1.2, grain),
      end: () => burst.dispose(),
    });
  }

  /** Where a pile stands, and how big it is drawn: what a ripple round it is sized by. */
  private footOf(pileId: string): { at: Vector3; radius: number; scale: number } | null {
    const entry = this.dressed.get(pileId);
    if (entry === undefined || !entry.ready) return null;
    const scale = entry.object.scale.x;
    return {
      at: entry.ring.getWorldPosition(new Vector3()),
      radius: Math.max(entry.outline.x, entry.outline.z) * scale,
      scale,
    };
  }

  /** The pile a label stands for: a pile's own, the garrison at a mast's foot, or the one hung
   *  from it (`StandingPile.label`). */
  pileOfLabel(labelId: string): string | null {
    return this.dressed.has(labelId) ? labelId : (this.owned.get(labelId) ?? null);
  }

  /** A ring turns or pulses: the frames must keep coming. */
  get ringing(): boolean {
    if (this.motion !== 'full') return false;
    for (const { ring, object } of this.dressed.values())
      if (ring.moving && object.visible) return true;
    return false;
  }

  /** The ground under the pointer, `null` off the board or under a finger. */
  carryTo(at: Vector3 | null): void {
    if (this.carried === null) return;
    this.carried.pointer = at === null ? null : at.clone();
  }

  /** **The piece is set down at a pose** (the rose opens there): it drops and waits for the order. */
  setDown(at: Vector3): void {
    const carried = this.carried;
    if (carried === null) return;
    // Set down again elsewhere, it is taken up first: it drops from the carried height.
    const from = carried.down === null ? carried.lift : CARRIED_LIFT;
    carried.down = { at: at.clone(), since: performance.now(), from };
    carried.onto = this.aimed;
    playTableSound('drop');
    const scale = carried.object.scale.x;
    this.ripple(at, carried.radius * scale);
    this.dust(at, 5, 0.7, scale);
  }

  /** The copy on its way home is done with: it goes, and the pile it left is whole again. */
  private dropLeaving(): void {
    const leaving = this.leaving;
    if (leaving === null) return;
    this.leaving = null;
    discard(leaving);
    if (this.held?.pileId === leaving.pileId) return;
    const entry = this.dressed.get(leaving.pileId);
    if (entry) wash(entry.object, false);
  }

  /** Toward the water from a pile on a shore, or from the quay of a port's garrison: its port's
   *  front once it stands, its water edge to the sea (#436). */
  private shoreOf(at: StandingPile['at']): readonly [number, number] | null {
    const port = 'beside' in at && at.quay !== undefined && this.garrisonAt(at.beside, 0, true);
    if (port) return [Math.sin(port.facing), Math.cos(port.facing)];
    const point = 'lonLat' in at ? at.lonLat : at.quay;
    return point === undefined ? null : this.seaward(point);
  }

  /** Every dressed pile set back on its point, facing the way it came — on a shore, the board's
   *  axes: land on one side, water on the other (#362); a garrison is set at its maquette's foot
   *  by `orient`. */
  rebuild(): void {
    for (const { at, facing, object } of this.dressed.values()) {
      if (!('lonLat' in at)) continue;
      object.position.copy(this.frame.projectLonLat(at.lonLat, COUNTRY_THICKNESS));
      const ahead =
        facing === undefined || this.seaward(at.lonLat) !== null
          ? null
          : this.frame
              .projectLonLat(destinationPoint(at.lonLat, FACING_KM, facing), COUNTRY_THICKNESS)
              .sub(object.position);
      object.rotation.y = ahead === null ? 0 : Math.atan2(ahead.x, ahead.z);
    }
  }

  /** Where the night lays a lamp's glow: under each dressed pile that stands, with its share of figurine. */
  lights(emit: (at: Vector3, radius: number, near: number) => void): void {
    const lent = new Set(this.stoodIn.values());
    for (const { object, outline, ready, near, figurines } of this.dressed.values()) {
      // A pile whose every group plays away (a truck backing to its quay) glows with it, not at its rank.
      if (!ready || !object.visible || figurines.every((figurine) => lent.has(figurine))) continue;
      emit(object.position, Math.max(outline.x, outline.z) * object.scale.x, near);
    }
  }

  /** **The span a label's pile is pinned by**, `null` for a pile not dressed here. */
  spanOf(id: string): number | null {
    const entry = this.dressed.get(id);
    return entry === undefined ? null : troopPinSpan(entry.span * entry.sized);
  }

  /** **Where a column joining the pile at `lonLat` halts** (#277): its footprint and a little
   *  more, on the board; 0 where no pile of mine stands drawn. */
  edgeAt(lonLat: LonLat): number {
    for (const { at, ready, object, extent } of this.dressed.values())
      if (ready && object.visible && 'lonLat' in at && samePoint(at.lonLat, lonLat))
        return (Math.max(extent.x, extent.z) + HALT_STEPS * SQUAD_SPACING) * object.scale.x;
    return 0;
  }

  /**
   * **Each newcomer reaches the rank in its `delays` ms** (#268, décision de Pierre du 23/10): the
   * rest of the pile holds where it stood, then glides its share of the way in `GLIDE_MS` at each
   * arrival, and the pile says it grew each time. Out of full motion, it stands at once.
   * **A column deploying** (`opens`, #277) finds the rank open: it glides in the newcomer's last
   * half-second, and its place is free when it gets there. **The squad formed** (`formed`: no
   * column of mine heads there any more) is stapled once its last newcomer stands.
   */
  arrive(
    pileId: string,
    delays: ReadonlyArray<number>,
    { opens = false, formed = false }: { opens?: boolean; formed?: boolean } = {},
  ): void {
    this.expected.delete(pileId);
    const entry = this.dressed.get(pileId);
    if (entry === undefined) return;
    const { held } = entry;
    entry.held = [];
    const grown = this.grown.delete(pileId);
    if (grown && formed) this.staple(entry, Math.max(0, ...delays));
    const bases = held.map(({ figurine, by }) => figurine.object.position.clone().sub(by));
    const stand = (left: number) =>
      held.forEach(({ figurine, by }, n) =>
        figurine.object.position.copy(bases[n]!).addScaledVector(by, left),
      );
    if (this.motion !== 'full' || delays.length === 0) {
      stand(0);
      if (grown) this.merged(pileId);
      return;
    }
    let told = 0;
    const lead = opens ? GLIDE_MS : 0;
    const seconds = (Math.max(...delays) + GLIDE_MS - lead) / 1000;
    this.effects.push({
      since: performance.now(),
      seconds,
      step: (k) => {
        // A setting changed on the way: the rank stands where it ends.
        const elapsed = this.motion === 'full' ? k * seconds * 1000 : Infinity;
        const gone = delays.reduce(
          (sum, delay) =>
            sum + ease.inOut(Math.min(1, Math.max(0, (elapsed - delay + lead) / GLIDE_MS))),
          0,
        );
        stand(1 - gone / delays.length);
        const arrived = delays.filter((delay) => elapsed >= delay).length;
        for (; grown && told < arrived; told++) this.merged(pileId);
      },
      end: () => stand(0),
    });
  }

  /** Where each group of a pile drawn again, or gone, stood: by its troops (`seen`). */
  private remember(pileId: string, entry: Dressed, now: number): void {
    if (!entry.ready || !entry.placed || !entry.object.visible) return;
    entry.pieces.groups.forEach(({ troopIds }, k) => {
      const place = this.placeOf(`${pileId}/${k}`);
      if (place === null) return;
      const heading = Math.atan2(place.front.x, place.front.z);
      for (const troopId of troopIds) this.seen.set(troopId, { at: place.at, heading, since: now });
    });
  }

  /** **Where a troop's group last stood** (#277), and the way it faced, on the board: `null`
   *  when its pile was not drawn then, or long ago. */
  lastSeen(troopId: string): { readonly at: Vector3; readonly heading: number } | null {
    return this.seen.get(troopId) ?? null;
  }

  /** **A sequence will claim this pile's held groups** (#277): they wait for `arrive`, which a
   *  walk computed a frame later calls, rather than standing at once in their new places. */
  expect(pileId: string): void {
    this.expected.set(pileId, performance.now());
  }

  /** **A pile's step on the board** (#277): how far apart its squads stand, at its scale. */
  stepOf(pileId: string): number | null {
    const entry = this.dressed.get(pileId);
    return entry?.placed ? SQUAD_SPACING * entry.object.scale.x : null;
  }

  /** **Dust kicked up** where a vehicle of the pile sets off (#277, U), at its scale. */
  dustAt(pileId: string, at: Vector3): void {
    const foot = this.footOf(pileId);
    if (foot !== null) this.dust(at, 6, 0.6, foot.scale);
  }

  /** **The rank holds on one group** (#277, a landing: the truck): every group of the pile stands
   *  off its place by that group's gap, and glides with it at `arrive`. The men stood on the
   *  truck they rode in (`heldWhereTheyStood`); they stand by it now. */
  anchor(id: string): void {
    const at = id.lastIndexOf('/');
    const entry = this.dressed.get(id.slice(0, at));
    const figurine = entry?.figurines[Number(id.slice(at + 1))];
    if (entry === undefined || figurine === undefined) return;
    const by = entry.held.find((each) => each.figurine === figurine)?.by.clone() ?? new Vector3();
    for (const each of entry.held) each.figurine.object.position.sub(each.by);
    entry.held =
      by.lengthSq() === 0
        ? []
        : entry.figurines.map((each) => {
            each.object.position.add(by);
            return { figurine: each, by: by.clone() };
          });
  }

  /**
   * **Men drawn to board a truck** (#277): a rider is not drawn in its pile, so each one boarding
   * stands where it stood before — in its rank or at the end of its file — as a squad of its own
   * `figures`, for its walk to the tailgate (`${pileId}/+${troopId}`). It goes once its walk ends,
   * or at `unboard`.
   */
  board(
    pileId: string,
    riders: ReadonlyArray<{
      readonly troopId: string;
      readonly figures: ReadonlyArray<UnitTier>;
      readonly at: Vector3;
      readonly heading: number;
    }>,
  ): ReadonlyArray<string> {
    const entry = this.dressed.get(pileId);
    if (entry === undefined || !entry.placed) return [];
    entry.object.updateMatrixWorld(true);
    return riders.flatMap(({ troopId, figures, at, heading }) => {
      const figurine = figurineFor(this.nation, 'infantry', figures);
      if (figurine === null) return [];
      const id = `${pileId}/+${troopId}`;
      this.unboard(id);
      const { object } = figurine;
      object.position.copy(entry.object.worldToLocal(at.clone())).setY(0);
      object.rotation.y = heading - entry.object.rotation.y;
      object.scale.setScalar(1 / pileUnitOf(entry.span));
      entry.object.add(object);
      const boarder = { pileId, figurine, ready: false };
      this.boarders.set(id, boarder);
      figurine.ready.then(
        () => {
          boarder.ready = true;
          this.changed();
        },
        () => this.unboard(id),
      );
      return [id];
    });
  }

  /** The man boarding `id` is drawn no more. */
  unboard(id: string): void {
    const boarder = this.boarders.get(id);
    if (boarder === undefined) return;
    this.boarders.delete(id);
    boarder.figurine.object.removeFromParent();
  }

  /** **The staple round a squad just formed** (#277), `after` ms from now: traced at full motion,
   *  laid whole at reduced, then pale; nothing when cut. Its own mesh, never the pile's ring. */
  private staple(entry: Dressed, after: number): void {
    if (this.motion === 'off') return;
    const material = new MeshBasicMaterial({
      color: PALETTE.border,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const geometry = STAPLE_GEOMETRY.clone();
    const mark = new Mesh(geometry, material);
    mark.position.copy(entry.ring.position);
    mark.scale.set(entry.extent.x + 0.05, 1, entry.extent.z + 0.05);
    entry.object.add(mark);
    const count = geometry.index!.count;
    // At reduced motion it is laid whole at once: no tracing to wait for.
    const trace = this.motion === 'full' ? STAPLE.trace : 0;
    const seconds = trace + STAPLE.pale;
    this.effects.push({
      since: performance.now() + after,
      seconds,
      step: (k) => {
        const t = k * seconds;
        mark.visible = t >= 0;
        const traced = trace > 0 ? ease.out3(Math.min(1, t / trace)) : 1;
        const pale = Math.min(1, Math.max(0, (t - trace) / STAPLE.pale));
        // Whole triangles: six indices a segment.
        geometry.setDrawRange(0, Math.max(6, Math.floor((count * traced) / 6) * 6));
        material.opacity = 0.8 * (1 - 0.6 * pale);
      },
      end: () => {
        mark.removeFromParent();
        geometry.dispose();
        material.dispose();
      },
    });
  }

  /** **A ring of ink where a recruit stands**, at reduced motion: it is already in its rank. At
   *  full motion too (`evenFull`) for what could not play: a crown past the pool (#277). */
  inkArrival(pileId: string, evenFull = false): void {
    if (this.motion === 'reduced' || (evenFull && this.motion === 'full')) this.inked.add(pileId);
  }

  /** The pile grew under the eyes: its sound, a ripple and a puff of dust where it stands. */
  private merged(pileId: string): void {
    playTableSound('merge');
    const foot = this.footOf(pileId);
    if (foot === null) return;
    this.ripple(foot.at, foot.radius + 0.1 * foot.scale, true);
    this.dust(foot.at, 8, 0.8, foot.scale);
  }

  /** Says whether it moved pieces of its own — held ones let go, an effect running: nothing else
   *  asks for the frame they move in, and their shadows must follow them (`loop`). */
  orient(cameraPosition: Vector3): boolean {
    let moved = this.effects.length > 0;
    // What no walk claimed by the frame after its pile first stood stands at once (`arrive`).
    for (const [id, entry] of this.dressed) {
      if (!entry.stood) continue;
      const expected = this.expected.get(id);
      if (expected !== undefined && performance.now() - expected < EXPECT_MS) continue;
      this.expected.delete(id);
      for (const { figurine, by } of entry.held) figurine.object.position.sub(by);
      moved ||= entry.held.length > 0;
      entry.held = [];
      if (this.grown.delete(id)) this.merged(id);
      if (this.inked.delete(id)) {
        const foot = this.footOf(id);
        if (foot !== null) this.ripple(foot.at, foot.radius * 0.9, false, true);
      }
    }
    // How far along a site's foot its piles already stand: a second garrison there stands abreast.
    const abreast = new Map<string, number>();
    // The garrisons the server attached stand first: a pile handed back to the ground stands
    // abreast of them, whatever the order served.
    const attached = (entry: Dressed) =>
      'beside' in entry.at && entry.at.from !== undefined ? 1 : 0;
    const order = [...this.dressed.values()].sort((a, b) => attached(a) - attached(b));
    // On a yard the piles are laid out together, centred on `fx_rang` (`rankLayout`).
    const ranked = new Map<string, Dressed[]>();
    for (const entry of order) {
      if (!('beside' in entry.at) || entry.at.quay !== undefined) continue;
      // What rests at its post does not take a place in the rank (#475).
      if (entry.pieces.groups.every((group) => group.posted)) continue;
      if (this.garrisonAt(entry.at.beside, entry.span, false)?.rank)
        ranked.set(entry.at.beside, [...(ranked.get(entry.at.beside) ?? []), entry]);
    }
    const posts = this.postsOf(order, cameraPosition);
    const laid = new Map<Dressed, { x: number; z: number }>();
    for (const [site, entries] of ranked) {
      const { width } = this.garrisonAt(site, entries[0]!.span, false)!;
      const spots = rankLayout(
        entries.map(({ extent, object }) => {
          const side = 2 * Math.max(extent.x, extent.z) * object.scale.x;
          return { width: side, depth: side };
        }),
        width,
      );
      entries.forEach((entry, k) => laid.set(entry, spots[k]!));
    }
    for (const entry of order) {
      const { object, at, targets, extent } = entry;
      let span = entry.span;
      entry.sized = 1;
      if ('beside' in at) {
        const quay = at.quay !== undefined;
        // At its quay a fleet is drawn at its port's size, pin and floor included (#433).
        entry.sized = quay ? (this.garrisonAt(at.beside, span, quay)?.scale ?? 1) : 1;
        span *= entry.sized;
        const site = this.garrisonAt(at.beside, span, quay);
        // A pile grown by its floor stands off its building by its grown size.
        const foot =
          site &&
          this.garrisonAt(
            at.beside,
            span * floorGrowth(site.at.distanceTo(cameraPosition), span, GARRISON_FLOOR_PX),
            quay,
          );
        if (foot !== null) {
          const half = Math.max(extent.x, extent.z) * object.scale.x;
          const spot = laid.get(entry);
          if (spot !== undefined) {
            // On a yard: abreast along the rank, centred on its marker, deeper by rows.
            object.position.set(
              foot.at.x + foot.step[0] + spot.x * Math.cos(foot.facing) + spot.z * foot.deep[0],
              foot.at.y,
              foot.at.z + foot.step[1] - spot.x * Math.sin(foot.facing) + spot.z * foot.deep[1],
            );
          } else {
            const taken = abreast.get(at.beside) ?? 0;
            // At a site's foot the first pile stands square to it.
            const aside = taken === 0 ? 0 : taken + half;
            abreast.set(at.beside, aside + half);
            object.position.set(
              foot.at.x + foot.step[0] + aside * Math.cos(foot.facing),
              foot.at.y,
              foot.at.z + foot.step[1] - aside * Math.sin(foot.facing),
            );
          }
          object.rotation.y = at.quay === undefined ? foot.facing : 0;
        } else if (at.from === undefined) {
          object.visible = false;
          continue;
        } else {
          // A pile handed back to the ground waits at its own point: it is not the site's to hide.
          object.position.copy(this.frame.projectLonLat(at.from, COUNTRY_THICKNESS));
        }
      }
      const distance = object.position.distanceTo(cameraPosition);
      const near = troopWeight(distance, span);
      entry.near = near;
      entry.placed = true;
      entry.stood ||= entry.ready;
      object.visible = near > 0;
      // A garrison keeps near its site's proportion; a pile in the field, its own floor.
      // A garrison also keeps its pieces' own span: it stays under a third of its barracks (#534).
      const garrisoned = 'beside' in at;
      const floor = garrisoned ? GARRISON_FLOOR_PX : FLOOR_PX;
      const scale =
        troopScale(distance, span, garrisoned ? span : entry.floorSpan, floor) * pileUnitOf(span);
      object.scale.setScalar(scale);
      hover(object);
      this.post(entry, posts.get(entry), scale);
      const growth = targetGrowth(scale, distance);
      for (const target of targets) target.scale.setScalar(growth);
    }
    const now = performance.now();
    for (const [id, { ring, outline }] of this.dressed) {
      ring.style(this.rings.get(id) ?? null, now / 1000, this.motion !== 'full');
      const beat = ring.beat;
      ring.scale.set(outline.x * beat, 1, outline.z * beat);
    }
    if (this.leaving !== null) this.orientCarried(this.leaving, cameraPosition, now);
    if (this.carried !== null) this.orientCarried(this.carried, cameraPosition, now);
    for (const settled of [...this.settling]) this.orientCarried(settled, cameraPosition, now);
    this.effects = this.effects.filter((effect) => {
      const k = (now - effect.since) / 1000 / effect.seconds;
      if (k < 1) {
        effect.step(k);
        return true;
      }
      effect.end();
      return false;
    });
    return moved;
  }

  /**
   * **Where the pieces posted at their site rest, on the board** (#475): the planes of an airfield
   * on its apron, the hulls of a port along its mole, a slot per piece by its rank across the
   * site's piles, the figurines drawn as large as they are up close.
   */
  private postsOf(order: ReadonlyArray<Dressed>, eye: Vector3): Map<Dressed, Post[]> {
    const bySite = new Map<
      string,
      Array<{
        entry: Dressed;
        k: number;
        role: UnitRole;
        troop: string;
        formedAt?: number | undefined;
      }>
    >();
    for (const entry of order) {
      if (!('beside' in entry.at)) continue;
      const { beside } = entry.at;
      entry.pieces.groups.forEach(({ role, posted, troopIds, formedAt }, k) => {
        if (posted)
          bySite.set(beside, [
            ...(bySite.get(beside) ?? []),
            { entry, k, role, troop: troopIds[0]!, formedAt },
          ]);
      });
    }
    const posts = new Map<Dressed, Post[]>();
    const alive = new Set<string>();
    const ids = new Map([...this.dressed].map(([id, entry]) => [entry, id]));
    const standing = new Set<string>();
    for (const [site, members] of bySite) {
      alive.add(site);
      const sea = DOMAIN_BY_ROLE[members[0]!.role] === 'sea';
      const frame = this.garrisonAt(site, members[0]!.entry.span, sea);
      if (frame === null) continue;
      const mirrored = frame.mirrored === true;
      if (this.mirroredSites.get(site) !== undefined && this.mirroredSites.get(site) !== mirrored)
        for (const kept of [this.lastRest, this.left])
          for (const [troop, rest] of kept) if (rest.site === site) kept.delete(troop);
      this.mirroredSites.set(site, mirrored);
      // Each piece is laid out at the growth it is drawn at.
      const growth = members.map(
        ({ entry }) =>
          floorGrowth(frame.at.distanceTo(eye), entry.span, GARRISON_FLOOR_PX) * pieceScale.size,
      );
      const hullPosts = sea ? this.postsOfHulls(site, members) : null;
      const rests = hullPosts
        ? berths(
            members.map(({ role }) => role as SeaRole),
            growth,
            hullPosts.posts,
          )
        : layout(this.planesOf(site, members), growth);
      members.forEach(({ entry, k, role, troop }, n) => {
        const rest = rests[n];
        standing.add(troop);
        if (rest !== null && rest !== undefined) {
          const before = this.lastRest.get(troop);
          if (hullPosts?.promoted.includes(troop) && before !== undefined)
            this.promotions.push({
              site,
              id: `${ids.get(entry)}/${k}`,
              role,
              from: before.rest,
              to: rest,
            });
          this.lastRest.set(troop, { site, rest, post: hullPosts?.posts[n] ?? null });
        }
        let post: Post = { k, at: null, heading: 0 };
        if (rest !== null && rest !== undefined) {
          const y = sea ? 0 : AIRFIELD.top;
          const at = frame.toBoard(new Vector3(rest.x, y, rest.z));
          const ahead = frame
            .toBoard(new Vector3(rest.x + Math.sin(rest.yaw), y, rest.z + Math.cos(rest.yaw)))
            .sub(at);
          post = { k, at, heading: Math.atan2(ahead.x, ahead.z) };
        }
        posts.set(entry, [...(posts.get(entry) ?? []), post]);
      });
    }
    for (const site of this.mirroredSites.keys())
      if (!alive.has(site)) this.mirroredSites.delete(site);
    for (const site of this.places.keys()) if (!alive.has(site)) this.places.delete(site);
    for (const site of this.hullPosts.keys()) if (!alive.has(site)) this.hullPosts.delete(site);
    // What no longer rests is remembered where it rested, for its departure.
    const now = performance.now();
    for (const [troop, { site, rest, post }] of this.lastRest)
      if (!standing.has(troop)) {
        this.left.set(troop, { site, rest, post, since: now });
        this.lastRest.delete(troop);
      }
    for (const [troop, { since }] of this.left) if (now - since > SEEN_MS) this.left.delete(troop);
    return posts;
  }

  /** **The post of each hull of a port** (#487): kept while it stays; a new hull takes the free
   *  post nearest the mole; when the hull at the mole has gone, the one at its side moves up
   *  (`promoted`), and no other hull moves. */
  private postsOfHulls(
    site: string,
    members: ReadonlyArray<{ troop: string; formedAt?: number | undefined }>,
  ): { posts: Array<HullPost | null>; promoted: string[] } {
    const kept = this.hullPosts.get(site) ?? new Map<string, HullPost>();
    this.hullPosts.set(site, kept);
    const present = new Set(members.map(({ troop }) => troop));
    for (const troop of [...kept.keys()]) if (!present.has(troop)) kept.delete(troop);
    for (const troop of this.arrivals.keys()) if (present.has(troop)) kept.delete(troop);
    const promoted: string[] = [];
    const held = () => [...kept.values()];
    if (!held().includes('mole'))
      for (const [troop, post] of kept)
        if (post === 'couple') {
          kept.set(troop, 'mole');
          promoted.push(troop);
          break;
        }
    for (const { troop } of inFormationOrder(members)) {
      if (kept.has(troop)) continue;
      const post = settleHull(held());
      this.arrivals.delete(troop);
      if (post !== null) kept.set(troop, post);
    }
    return { posts: members.map(({ troop }) => kept.get(troop) ?? null), promoted };
  }

  /** **Where a piece rested when it left its site, or rests still** (#487): its place at the site,
   *  in the site's metres. `null` for a view loaded cold, or after `SEEN_MS`. */
  restOf(troopId: string): { site: string; rest: Rest; post: HullPost | null } | null {
    // A troop back at its site rests where it rests now, not where it once left.
    const kept = this.lastRest.get(troopId) ?? this.left.get(troopId);
    return kept === undefined ? null : { site: kept.site, rest: kept.rest, post: kept.post };
  }

  /** **The post of the hull `id` holds at its port** (#477): the mole, the side, the roads; `null`
   *  for a piece that holds none. */
  postOf(id: string): HullPost | null {
    const at = id.lastIndexOf('/');
    const troop = this.dressed.get(id.slice(0, at))?.pieces.groups[Number(id.slice(at + 1))]
      ?.troopIds[0];
    return troop === undefined ? null : (this.lastRest.get(troop)?.post ?? null);
  }

  /**
   * **The hulls that lie at a port's mole or at its side, drawn** (#500): what the hawsers are
   * run from. Not a pile in hand, nor one drawn as its pin, nor a hull the mole has no room for.
   */
  mooredHulls(): MooredHull[] {
    const hulls: MooredHull[] = [];
    for (const [pileId, entry] of this.dressed) {
      if (!entry.ready || !entry.placed || !entry.object.visible || this.held?.pileId === pileId)
        continue;
      entry.pieces.groups.forEach(({ troopIds, posted }, k) => {
        const troop = troopIds[0];
        const kept = troop === undefined || !posted ? undefined : this.lastRest.get(troop);
        const figurine = entry.figurines[k];
        if (
          troop === undefined ||
          kept === undefined ||
          kept.post === null ||
          kept.post === 'roads' ||
          figurine === undefined ||
          !figurine.object.visible
        )
          return;
        hulls.push({
          id: `${pileId}/${k}`,
          troop,
          site: kept.site,
          post: kept.post,
          object: figurine.object,
        });
      });
    }
    return hulls;
  }

  /** The hulls that moved up to the mole since the last call (#487). */
  takePromotions(): Promotion[] {
    return this.promotions.splice(0);
  }

  /** **A posted piece the apron or the mole has no place for** (#487): it is not drawn, so no
   *  sequence plays for it. `false` until the pile stands and is laid out. */
  unposted(id: string): boolean {
    const at = id.lastIndexOf('/');
    const entry = this.dressed.get(id.slice(0, at));
    const k = Number(id.slice(at + 1));
    const figurine = entry?.figurines[k];
    return (
      entry?.ready === true &&
      entry.placed &&
      figurine !== undefined &&
      entry.pieces.groups[k]?.posted === true &&
      !figurine.object.visible
    );
  }

  /**
   * **The apron's planes with their places**: a place is a state of its troop, kept while it
   * stays on the apron; a troop that left frees it and no other moves. A new one takes it by how
   * it came (`arrivedAt`), else as if formed, in the order they were formed (#524).
   */
  private planesOf(
    site: string,
    members: ReadonlyArray<{ role: UnitRole; troop: string; formedAt?: number | undefined }>,
  ): Plane[] {
    const kept = this.places.get(site) ?? new Map<string, Place>();
    this.places.set(site, kept);
    const roles = new Map(members.map(({ role, troop }) => [troop, role as AirRole]));
    for (const troop of [...kept.keys()]) if (!roles.has(troop)) kept.delete(troop);
    for (const troop of this.arrivals.keys()) if (roles.has(troop)) kept.delete(troop);
    const heldNow = (): Plane[] =>
      [...kept].map(([troop, place]) => ({ role: roles.get(troop)!, place }));
    for (const { troop } of inFormationOrder(members)) {
      if (kept.has(troop)) continue;
      const place = settle(heldNow(), roles.get(troop)!, this.arrivals.get(troop) ?? 'formed');
      this.arrivals.delete(troop);
      if (place !== null) kept.set(troop, place);
    }
    return members.map(({ role, troop }) => ({
      role: role as AirRole,
      place: kept.get(troop) ?? null,
    }));
  }

  /** **A plane formed at its hangar, or come home from its runway** (#475): it takes its place by
   *  how it came. Told once its pile is drawn again. */
  arrivedAt(pileId: string, groups: ReadonlyArray<number>, how: 'formed' | 'returned'): void {
    const pieces = this.piecesOf(pileId);
    for (const k of groups) {
      const group = pieces?.groups[k];
      if (group?.posted) this.arrivals.set(group.troopIds[0]!, how);
    }
  }

  /**
   * Stands the posted pieces of a pile at their posts, in the pile's own frame; one with no post
   * (the apron or the mole is full) is not drawn, its label says how many. The pile's ring, foot
   * and halo then fit the pieces as they stand.
   */
  private post(entry: Dressed, posts: ReadonlyArray<Post> | undefined, scale: number): void {
    if (posts === undefined || scale <= 0) return;
    const { object } = entry;
    const [cos, sin] = [Math.cos(object.rotation.y), Math.sin(object.rotation.y)];
    for (const { k, at, heading } of posts) {
      const figurine = entry.figurines[k]!;
      figurine.object.visible = at !== null;
      if (at === null) {
        // Its footprint is out of every ray.
        entry.targets[k]!.position.y = OUT_OF_REACH;
        continue;
      }
      const [dx, dy, dz] = [
        at.x - object.position.x,
        at.y - object.position.y,
        at.z - object.position.z,
      ];
      const [x, y, z] = [(dx * cos - dz * sin) / scale, dy / scale, (dx * sin + dz * cos) / scale];
      figurine.object.position.set(x, y, z);
      figurine.object.rotation.y = heading - object.rotation.y;
      entry.targets[k]!.position.set(x, y, z);
    }
    // The ring, the foot and the halo are round the pieces that are drawn.
    const drawn = entry.figurines.filter((figurine) => figurine.object.visible);
    entry.ring.visible = drawn.length > 0;
    if (drawn.length === 0) return;
    const xs = drawn.map(({ object: { position } }) => position.x);
    const zs = drawn.map(({ object: { position } }) => position.z);
    const margin = GROUP_SPACING * 0.62 + (entry.pieces.squad ? 0.08 : 0.02);
    entry.ring.position.set(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      RETICLE_LIFT,
      (Math.min(...zs) + Math.max(...zs)) / 2,
    );
    entry.outline = {
      x: (Math.max(...xs) - Math.min(...xs)) / 2 + margin,
      z: (Math.max(...zs) - Math.min(...zs)) / 2 + margin,
    };
  }

  /** Its time in seconds since `since`, or past every animation when motion is not full. */
  private seconds(since: number, now: number): number {
    return this.motion === 'full' ? (now - since) / 1000 : Infinity;
  }

  private orientCarried(carried: Carried, cameraPosition: Vector3, now: number): void {
    const { object, piece, down, back } = carried;
    const dt = Math.min(0.1, (now - carried.clock) / 1000);
    carried.clock = now;
    const scale =
      troopScale(object.position.distanceTo(cameraPosition), carried.span, carried.floorSpan) *
      pileUnitOf(carried.span);
    const full = this.motion === 'full';
    let tilt = { x: 0, z: 0 };
    let turn = 0;
    let shrink = 1;
    let squash = 0;
    if (carried.settled !== null) {
      const t = this.seconds(carried.settled, now);
      carried.lift = 0;
      if (t < SQUASH_S) squash = Math.sin(Math.PI * (t / SQUASH_S));
      const fading = Math.min(1, Math.max(0, (t - SETTLED_S) / UNSETTLE_S));
      const { reticle } = carried.marks;
      reticle.style('settled', now / 1000, !full);
      reticle.opacity = 0.9 * (1 - fading);
      reticle.scale.setScalar(1.05 * carried.radius);
      piece.visible = fading < 1;
      piece.scale.set(1 + 0.1 * squash, 1 - 0.16 * squash, 1 + 0.1 * squash);
      piece.position.y = 0;
      carried.shadow.object.visible = false;
      carried.marks.plumb.visible = false;
      object.visible = scale > 0;
      object.scale.setScalar(scale);
      if (fading >= 1) {
        this.settling = this.settling.filter((each) => each !== carried);
        discard(carried);
      }
      return;
    }
    if (back !== null) {
      const shaking = back.refused ? SHAKE_S : 0;
      const t = this.seconds(back.since, now) - shaking;
      if (t >= RETURN_DONE) {
        if (back.into === null) {
          playTableSound('drop');
          const foot = this.footOf(carried.pileId);
          if (foot !== null) this.ripple(foot.at, foot.radius * 0.8);
        }
        this.dropLeaving();
        return;
      }
      if (t < 0) {
        const k = 1 + t / shaking;
        turn = Math.sin(k * Math.PI * 5) * SHAKE_TURN * (1 - k);
      } else {
        const home = back.into ?? this.dressed.get(carried.pileId)?.object.position ?? back.from;
        const at = returnAt(t, back.carried, RETURN_HOP);
        object.position.lerpVectors(back.from, home, at.share);
        carried.lift = at.lift;
        if (back.into !== null) shrink = 1 - at.share * 0.9;
      }
    } else if (down !== null) {
      object.position.lerp(down.at, full ? followShare(dt, 20) : 1);
      const t = this.seconds(down.since, now);
      carried.lift = t >= DROP_DONE ? 0 : dropLift(t, down.from);
    } else if (carried.pointer !== null) {
      const gap = carried.pointer.clone().sub(object.position);
      object.position.addScaledVector(gap, full ? followShare(dt, 14) : 1);
      const goal = CARRIED_LIFT * (this.aimed !== null ? 1 + OVER_TARGET : 1);
      carried.lift += (goal - carried.lift) * (full ? followShare(dt, 12) : 1);
      // The prototype leans 0.012 a unit of lag; its unit is ours over PROTOTYPE_UNIT.
      const lean = 0.012 / PROTOTYPE_UNIT / Math.max(scale, 1e-3);
      carried.drag = { x: gap.x * lean, z: gap.z * lean };
      if (full) tilt = swayAt((now - carried.since) / 1000, carried.drag);
      // The prototype's tremble: a piece over where it cannot go does not hang still.
      if (full && this.verdict === 'refused') turn = Math.sin((now / 1000) * 30) * 0.03;
    }
    // Picked up, a stretch that settles; over a new target, one hop (POC, `startCarry`, `bump`).
    const lifted = full && back === null && down === null ? (now - carried.since) / 1000 : Infinity;
    const stretch =
      lifted < STRETCH_S ? Math.sin(Math.PI * (lifted / STRETCH_S)) * (1 - lifted / STRETCH_S) : 0;
    piece.scale.set(1 - 0.08 * stretch, 1 + 0.16 * stretch, 1 - 0.08 * stretch);
    const hopping =
      full && back === null && down === null && this.aimed !== null
        ? Math.exp(((this.hopSince - now) / 1000) * 7)
        : 0;
    piece.position.y = carried.lift + Math.sin(hopping * Math.PI) * HOP;
    piece.rotation.set(tilt.x, turn, tilt.z);
    this.orientMarks(carried, now);
    // The prototype's blob: `radius × (0.8 + h × 0.3)`, `0.42 − h × 0.1`, h in its units.
    const height = (carried.lift / CARRIED_LIFT) * 1.5;
    carried.shadow.object.scale.setScalar(carried.width * 0.6 * (0.8 + height * 0.3));
    const fade = Math.max(0, 0.42 - height * 0.1) / 0.42;
    for (const material of carried.shadow.materials) material.opacity = fade;
    object.visible = scale > 0 && (carried.pointer !== null || down !== null || back !== null);
    object.scale.setScalar(scale * shrink);
  }

  /** Following the pointer only: set down, put back or sent, the drop is no longer being read. */
  private orientMarks(carried: Carried, now: number): void {
    const { reticle, plumb } = carried.marks;
    const reading = carried.pointer !== null && carried.down === null && carried.back === null;
    plumb.visible = reading;
    reticle.style(
      reading && this.aimed === null ? RETICLE[this.verdict] : null,
      now / 1000,
      this.motion !== 'full',
    );
    if (!reading) return;
    const pulse = this.motion === 'full' ? 1 + 0.06 * Math.sin((now / 1000) * 8) : 1;
    reticle.scale.setScalar(0.95 * carried.radius * pulse);
    plumb.scale.y = Math.max(carried.lift, 1e-3);
  }

  /** **Where the piece in hand comes from, and where it would land**, while the drop is read:
   *  the road the hand draws (`AimRibbon`). `null` set down, put back, or undressed. */
  get reading(): { readonly from: Vector3; readonly to: Vector3 } | null {
    const carried = this.carried;
    if (carried === null || carried.pointer === null || carried.down !== null) return null;
    const home = this.dressed.get(carried.pileId);
    return home?.ready === true ? { from: home.object.position, to: carried.pointer } : null;
  }

  /** **What the drop would do here** (`DropHint`'s reading), told to the ring under the piece. */
  markDrop(verdict: DropVerdict): void {
    this.verdict = verdict;
  }

  /** **The next putting back is a refusal**: the copy shakes its head before it goes home. */
  refuseDrop(): void {
    this.refusal = performance.now();
  }

  /** **The next putting back is a boarding** (15/10): the copy glides to `at` and shrinks away;
   *  with no `at` (a truck, #277) it goes home quietly, and its men board from there. */
  boardInto(at: Vector3 | null): void {
    playTableSound('board');
    this.boarding = { at, since: performance.now() };
  }

  /** Model geometry is shared with the pawns: nothing here is this layer's to free. */
  dispose(): void {
    if (this.posing !== null) clearTimeout(this.posing);
    this.posing = null;
    this.dropLeaving();
    if (this.carried !== null) discard(this.carried);
    this.carried = null;
    for (const settled of this.settling) discard(settled);
    this.settling = [];
    for (const effect of this.effects) effect.end();
    this.effects = [];
    this.group.removeFromParent();
  }
}

/** **How long a piece is drawn**, nose to tail along its own front, on the board: a turned
 *  piece does not lengthen as its world box does (#271). `null` while nothing is drawn. */
export function lengthAlong(object: Object3D): number | null {
  object.updateWorldMatrix(true, true);
  const back = object.matrixWorld.clone().invert();
  const own = new Box3();
  object.traverseVisible((part) => {
    const { geometry } = part as Mesh;
    if ((part as Mesh).isMesh !== true || part.userData.ground === true) return;
    if (geometry.boundingBox === null) geometry.computeBoundingBox();
    own.union(
      geometry
        .boundingBox!.clone()
        .applyMatrix4(new Matrix4().multiplyMatrices(back, part.matrixWorld)),
    );
  });
  return own.isEmpty() ? null : (own.max.z - own.min.z) * object.getWorldScale(new Vector3()).z;
}
