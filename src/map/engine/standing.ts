import {
  type Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Line,
  LineDashedMaterial,
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
import type { LonLat } from '@/domain/geo';
import type { MapMotion } from '@/domain/map-motion';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PilePieces } from '@/domain/pile-pieces';
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
  floorGrowth,
  troopPinSpan,
  troopScale,
  troopWeight,
  type Figurine,
} from './figurines/figurine';
import { dropLift, DROP_DONE, followShare, RETURN_DONE, returnAt, swayAt } from './landing';
import { InkRing, type RingState } from './ink-ring';
import type { SequenceHost } from './sequences';
import { ease } from './timelines/curves';
import { playTableSound } from '../table-sound';
import { charred, DustBurst, PLUME_BY_WEAR, Smoke } from './smoke';
import { PALETTE } from './palette';
import { pieceScale } from './piece-scale';
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
    | { readonly beside: string; readonly quay?: LonLat };
  readonly pieces: PilePieces;
};

/** **The label a standing pile is aimed at by**: the mast it stands beside, the label it hangs
 *  from (an outpost's), or its own. The one place a pile and its label are tied. */
export const labelOfPile = (pile: StandingPile | undefined, id: string): string =>
  pile === undefined ? id : 'beside' in pile.at ? pile.at.beside : (pile.label ?? id);

/** Where a maquette's garrison stands (`MaquetteLayer.garrisonAt`). */
export type GarrisonAt = (
  maquetteId: string,
  /** The span of the pile's largest piece: it stands that much further off. */
  pile: number,
  /** Hulls docked along a port's quay. */
  quay: boolean,
) => { at: Vector3; step: readonly [number, number]; facing: number } | null;

/**
 * **A pile is laid out in its own units** (ADR 0035): the spacings below were drawn for a tank
 * of `LAID_OUT_FOR`, and the whole pile is drawn at its largest piece's span over that — a pile
 * of men as tight as a pile of tanks, a pile with a cargo as wide as its hull.
 */
const pileUnitOf = (span: number): number => span / LAID_OUT_FOR;

/** Between two groups, in the pile's units: a squad and a tank are both about a third of one wide. */
const GROUP_SPACING = 0.5;
/** **The rank recentres in half a second** once a newcomer reaches it (décision de Pierre,
 *  #268, 23/10). */
const GLIDE_MS = 500;

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
/** **Where each piece stands in a row around the pile's point**, side by side and centred.
 *  In the pile's units, before the near weight scales the whole pile. */
export function pileLayout(pieces: number): ReadonlyArray<number> {
  return Array.from({ length: pieces }, (_, k) => (k - (pieces - 1) / 2) * GROUP_SPACING);
}

type Slot = { readonly x: number; readonly z: number };

/** Between two ranks of a formation, in the pile's units: a man's height seen at the board's tilt. */
const RANK_DEPTH = 0.85;
/** Between two pieces of a squad: three men abreast fill a group's width, a gap stays between. */
const SQUAD_SPACING = 0.62;

/** A block of `count` slots around its centre: one row up to four — a man's figure would hide
 *  the one behind him at the board's tilt —, then ranks far enough apart to read. */
function block(count: number): Slot[] {
  if (count <= 4)
    return pileLayout(count).map((x) => ({ x: (x * SQUAD_SPACING) / GROUP_SPACING, z: 0 }));
  const columns = Math.ceil(Math.sqrt(count));
  const ranks = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, k) => {
    const rank = Math.floor(k / columns);
    const inRank = Math.min(columns, count - rank * columns);
    return {
      x: ((k % columns) - (inRank - 1) / 2) * SQUAD_SPACING,
      z: ((ranks - 1) / 2 - rank) * RANK_DEPTH,
    };
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
export function dressedGroups(nation: string | null, pieces: PilePieces): Figurine[] | null {
  const figurines: Figurine[] = [];
  for (const group of pieces.groups) {
    const figurine = figurineFor(nation, group.role, group.figures);
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
 *  with the pieces, its altitude — three wingspans (ADR 0035 §7) — does not. */
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
  const layout = formationOf(
    pieces.groups.map(({ role }) => (DOMAIN_BY_ROLE[role] === 'sea' ? 'sea' : 'land')),
    seaward,
  );
  const object = new Group();
  const smokes: Smoke[] = [];
  const targets: Mesh[] = [];
  const span = Math.max(...figurines.map((figurine) => figurine.span));
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
  if (pieces.squad) object.add(squadMarks(layout, nation, pieces.count));
  const margin = GROUP_SPACING * 0.62;
  const xs = layout.map(({ x }) => x);
  const zs = layout.map(({ z }) => z);
  return {
    object,
    span,
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

/** `ready` flips once every figurine is in: until then the pile is not on the layer and its plate stays. */
type Dressed = {
  readonly key: string;
  at: StandingPile['at'];
  pieces: PilePieces;
  readonly object: Group;
  readonly span: number;
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
  const groups = pieces.groups.filter((group) => group.troopIds.some((id) => held.has(id)));
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
export const drawnKey = (nation: string | null, { groups, count }: PilePieces): string =>
  JSON.stringify([nation, count, groups.map((g) => [g.role, g.figures, g.wear, g.aboard])]);

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
  /** Sent copies waiting at their destination (POC, `settle`). */
  private settling: Carried[] = [];
  /** Ripples of ink and puffs of dust, each on its own clock. */
  private effects: {
    readonly since: number;
    readonly seconds: number;
    readonly step: (k: number) => void;
    readonly end: () => void;
  }[] = [];
  /** A boarding announced, waiting for the hand to empty (`boardInto`). */
  private boarding: { readonly at: Vector3; readonly since: number } | null = null;
  /** The copy put back, on its way home. */
  private leaving: Carried | null = null;

  constructor(
    private readonly frame: WorldFrame,
    private readonly changed: () => void,
    private readonly garrisonAt: GarrisonAt,
    /** Toward the water from a point on a shore, `null` inland (`formationOf`). */
    private readonly seaward: (lonLat: LonLat) => readonly [number, number] | null = () => null,
  ) {}

  setNation(nation: string | null): void {
    this.nation = nation;
    this.display(this.piles);
  }

  /** A pile whose pieces did not change keeps its objects: the view is re-served at every step
   *  of any column, and rebuilding three squads each time would be work for nothing. */
  display(piles: ReadonlyArray<StandingPile>): void {
    this.piles = piles;
    const next = new Map<string, Dressed>();
    for (const pile of piles) {
      const key = drawnKey(this.nation, pile.pieces);
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
        kept.pieces = pile.pieces;
        this.dressed.delete(pile.id);
        next.set(pile.id, kept);
        continue;
      }
      const built = pileObject(this.nation, pile.pieces, this.shoreOf(pile.at));
      if (built === null) continue;
      for (const smoke of built.smokes) smoke.frame(this.time);
      for (const target of built.targets) target.userData.pileId = pile.id;
      const ring = new InkRing();
      ring.position.set(built.center.x, RETICLE_LIFT, built.center.z);
      built.object.add(ring);
      const entry: Dressed = {
        key,
        at: pile.at,
        pieces: pile.pieces,
        object: built.object,
        span: built.span,
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
        extent: {
          x: built.extent.x + (pile.pieces.squad ? 0.08 : 0.02),
          z: built.extent.z + (pile.pieces.squad ? 0.08 : 0.02),
        },
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
    for (const gone of this.dressed.values()) {
      gone.object.removeFromParent();
      gone.ring.material.dispose();
    }
    this.dressed = next;
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

  private figurineOf(id: string): { figurine: Figurine; placed: boolean } | null {
    const at = id.lastIndexOf('/');
    const pileId = id.slice(0, at);
    const entry = this.dressed.get(pileId);
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
  pieceOf(id: string): { url?: string; box: Box3 | null } | null {
    const lent = this.figurineOf(id);
    const stood = this.stoodIn.get(id);
    if (lent === null || (stood && stood !== lent.figurine)) return null;
    const { url } = lent.figurine;
    const file = url === undefined ? {} : { url };
    if (!lent.placed) return { ...file, box: null };
    // A copy just stood in has not been placed yet: its meshes would read at the origin.
    const { object } = lent.figurine;
    object.updateMatrixWorld(true);
    // With the place it stands at: a walk off the screen to a rank on it goes on (#268).
    return {
      ...file,
      box: boxOfObject(object).clone().expandByPoint(object.getWorldPosition(new Vector3())),
    };
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

  /** The copy takes the group's model's place, at its scale: it is drawn under the same
   *  `model` group. The pile's feet, which a click takes, do not change. */
  standIn(id: string, copy: Object3D | null): void {
    const figurine = copy === null ? this.stoodIn.get(id) : this.figurineOf(id)?.figurine;
    if (figurine === undefined) return;
    figurine.standIn?.(copy);
    if (copy === null) this.stoodIn.delete(id);
    else this.stoodIn.set(id, figurine);
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
    // glides into its transport.
    const released = performance.now();
    const into =
      this.boarding !== null && released - this.boarding.since < BOARDING_MS
        ? this.boarding.at
        : null;
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
    if (held === null && previous !== null && into === null && !refused && !sent)
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
        refused: refused && into === null && this.motion === 'full',
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
      radius: Math.max(entry.extent.x, entry.extent.z) * scale,
      scale,
    };
  }

  /** The pile a label stands for: a pile's own, the garrison at a mast's foot, or the one hung
   *  from it (`StandingPile.label`). */
  pileOfLabel(labelId: string): string | null {
    if (this.dressed.has(labelId)) return labelId;
    const owned = this.piles.find(
      (pile) => this.dressed.has(pile.id) && labelOfPile(pile, pile.id) === labelId,
    );
    return owned?.id ?? null;
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

  /** Toward the water from a pile on a shore, or from the quay of a port's garrison. */
  private shoreOf(at: StandingPile['at']): readonly [number, number] | null {
    const point = 'lonLat' in at ? at.lonLat : at.quay;
    return point === undefined ? null : this.seaward(point);
  }

  /** Every dressed pile set back on its point; a garrison is set at its maquette's foot by `orient`. */
  rebuild(): void {
    for (const { at, object } of this.dressed.values())
      if ('lonLat' in at)
        object.position.copy(this.frame.projectLonLat(at.lonLat, COUNTRY_THICKNESS));
  }

  /** Where the night lays a lamp's glow: under each dressed pile that stands, with its share of figurine. */
  lights(emit: (at: Vector3, radius: number, near: number) => void): void {
    for (const { object, extent, ready, near } of this.dressed.values()) {
      if (!ready || !object.visible) continue;
      emit(object.position, Math.max(extent.x, extent.z) * object.scale.x, near);
    }
  }

  /** **The span a label's pile is pinned by**, `null` for a pile not dressed here. */
  spanOf(id: string): number | null {
    const span = this.dressed.get(id)?.span;
    return span === undefined ? null : troopPinSpan(span);
  }

  /**
   * **Each newcomer reaches the rank in its `delays` ms** (#268, décision de Pierre du 23/10): the
   * rest of the pile holds where it stood, then glides its share of the way in `GLIDE_MS` at each
   * arrival, and the pile says it grew each time. Out of full motion, it stands at once.
   */
  arrive(pileId: string, delays: ReadonlyArray<number>): void {
    const entry = this.dressed.get(pileId);
    if (entry === undefined) return;
    const { held } = entry;
    entry.held = [];
    const grown = this.grown.delete(pileId);
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
    const seconds = (Math.max(...delays) + GLIDE_MS) / 1000;
    this.effects.push({
      since: performance.now(),
      seconds,
      step: (k) => {
        // A setting changed on the way: the rank stands where it ends.
        const elapsed = this.motion === 'full' ? k * seconds * 1000 : Infinity;
        const gone = delays.reduce(
          (sum, delay) => sum + ease.inOut(Math.min(1, Math.max(0, (elapsed - delay) / GLIDE_MS))),
          0,
        );
        stand(1 - gone / delays.length);
        const arrived = delays.filter((delay) => elapsed >= delay).length;
        for (; grown && told < arrived; told++) this.merged(pileId);
      },
      end: () => stand(0),
    });
  }

  /** **A ring of ink where a recruit stands**, at reduced motion: it is already in its rank. */
  inkArrival(pileId: string): void {
    if (this.motion === 'reduced') this.inked.add(pileId);
  }

  /** The pile grew under the eyes: its sound, a ripple and a puff of dust where it stands. */
  private merged(pileId: string): void {
    playTableSound('merge');
    const foot = this.footOf(pileId);
    if (foot === null) return;
    this.ripple(foot.at, foot.radius + 0.1 * foot.scale, true);
    this.dust(foot.at, 8, 0.8, foot.scale);
  }

  orient(cameraPosition: Vector3): void {
    // What no walk claimed by the frame after its pile first stood stands at once (`arrive`).
    for (const [id, entry] of this.dressed) {
      if (!entry.stood) continue;
      for (const { figurine, by } of entry.held) figurine.object.position.sub(by);
      entry.held = [];
      if (this.grown.delete(id)) this.merged(id);
      if (this.inked.delete(id)) {
        const foot = this.footOf(id);
        if (foot !== null) this.ripple(foot.at, foot.radius * 0.9, false, true);
      }
    }
    for (const entry of this.dressed.values()) {
      const { object, at, span, targets } = entry;
      if ('beside' in at) {
        const quay = at.quay !== undefined;
        const site = this.garrisonAt(at.beside, span, quay);
        // A pile grown by its floor stands off its building by its grown size.
        const foot =
          site &&
          this.garrisonAt(
            at.beside,
            span * floorGrowth(site.at.distanceTo(cameraPosition), span),
            quay,
          );
        if (foot === null) {
          object.visible = false;
          continue;
        }
        object.position.set(foot.at.x + foot.step[0], foot.at.y, foot.at.z + foot.step[1]);
        object.rotation.y = at.quay === undefined ? foot.facing : 0;
      }
      const distance = object.position.distanceTo(cameraPosition);
      const near = troopWeight(distance, span);
      entry.near = near;
      entry.placed = true;
      entry.stood ||= entry.ready;
      object.visible = near > 0;
      const scale = troopScale(distance, span) * pileUnitOf(span);
      object.scale.setScalar(scale);
      hover(object);
      const growth = targetGrowth(scale, distance);
      for (const target of targets) target.scale.setScalar(growth);
    }
    const now = performance.now();
    for (const [id, { ring, extent }] of this.dressed) {
      ring.style(this.rings.get(id) ?? null, now / 1000, this.motion !== 'full');
      const beat = ring.beat;
      ring.scale.set(extent.x * beat, 1, extent.z * beat);
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
      troopScale(object.position.distanceTo(cameraPosition), carried.span) *
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

  /** **The next putting back is a boarding** (15/10): the copy glides to `at` and shrinks away. */
  boardInto(at: Vector3): void {
    playTableSound('board');
    this.boarding = { at, since: performance.now() };
  }

  /** Model geometry is shared with the pawns: nothing here is this layer's to free. */
  dispose(): void {
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
