import {
  type Box3,
  BoxGeometry,
  BufferGeometry,
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
  CONTACT,
  contactShadow,
  figurineFor,
  nearWeight,
  type Figurine,
} from './figurines/figurine';
import { dropLift, DROP_DONE, followShare, RETURN_DONE, returnAt, swayAt } from './landing';
import { InkRing, type RingState } from './ink-ring';
import { charred, PLUME_BY_WEAR, Smoke } from './smoke';
import { PALETTE } from './palette';
import { pieceScale } from './piece-scale';
import { boxOfObject, drawnHit, footedHit, nearer, type PieceHit } from './piece-pick';

export type StandingPile = {
  /** The pile's label id (`stackLabelId`): the label reads whether its plate gives way. */
  readonly id: string;
  /**
   * A point, or **a building's garrison**: the id of the maquette it stands at the foot of. It is
   * lifted by its figurines like any pile; the maquette itself opens its site.
   */
  readonly at: { readonly lonLat: LonLat } | { readonly beside: string };
  readonly pieces: PilePieces;
};

/** Where a maquette's garrison stands (`MaquetteLayer.garrisonAt`). */
export type GarrisonAt = (
  maquetteId: string,
) => { at: Vector3; step: readonly [number, number]; facing: number } | null;

/** Board units between two groups: a squad and a tank are both about a third of one wide. */
const GROUP_SPACING = 0.5;
/** **Where each piece stands in a row around the pile's point**, side by side and centred.
 *  Board units, before the near weight scales the whole pile. */
export function pileLayout(pieces: number): ReadonlyArray<number> {
  return Array.from({ length: pieces }, (_, k) => (k - (pieces - 1) / 2) * GROUP_SPACING);
}

type Slot = { readonly x: number; readonly z: number };

/** Board units between two ranks of a formation: a man's height seen at the board's tilt. */
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
 * blocks: a troop on land never stands in the water. Board units, before the near weight scales
 * the whole pile, in the board's own axes.
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
const FOOTPRINT = new BoxGeometry(GROUP_SPACING * 0.9, 0.6, 0.75);
FOOTPRINT.translate(0, 0.3, 0);
const UNSEEN = new MeshBasicMaterial();

function footprint({ x, z }: Slot, grip: Grip): Mesh {
  const target = new Mesh(FOOTPRINT, UNSEEN);
  target.visible = false;
  target.position.set(x, 0, z);
  target.userData.grip = grip;
  return target;
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
 *  with the pieces, its altitude does not. */
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
  /** Half its width and depth, its squad's outline included: the ring is drawn round it. */
  extent: { readonly x: number; readonly z: number };
  ready: Promise<unknown>;
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
  figurines.forEach((figurine, k) => {
    const slot = layout[k]!;
    figurine.object.position.set(slot.x, 0, slot.z);
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
      const shadow = contactShadow();
      shadow.position.set(slot.x, 0, slot.z);
      object.add(shadow);
    }
    // Infantry says its strength by its men (`figuresOf`): only a vehicle smokes.
    const plume = group.role === 'infantry' ? null : PLUME_BY_WEAR[group.wear];
    if (plume === null) return;
    const smoke = new Smoke(plume);
    smokes.push(smoke);
    void figurine.ready.then(
      () => {
        figurine.object.getObjectByName('fx_smoke')?.add(smoke.object);
        if (group.wear === 'burning') blacken(figurine.object);
      },
      () => {},
    );
  });
  if (pieces.squad) object.add(squadMarks(layout, nation));
  const margin = GROUP_SPACING * 0.62;
  return {
    object,
    extent: {
      x: Math.max(...layout.map(({ x }) => Math.abs(x))) + margin,
      z: Math.max(...layout.map(({ z }) => Math.abs(z))) + margin,
    },
    ready: Promise.all(figurines.map((figurine) => figurine.ready)),
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
const flags = new Map<string, MeshStandardMaterial>();
/** The pennant's cloth: the nation's ink — the squad's pieces say how many they are. */
function flagOf(nation: string | null): MeshStandardMaterial {
  const key = String(nation);
  let flag = flags.get(key);
  if (!flag) {
    flag = new MeshStandardMaterial({ color: nationInk(nation), roughness: 0.9, side: DoubleSide });
    flags.set(key, flag);
  }
  return flag;
}

/**
 * **Ce qui fait d'une pile une escouade** (POC « Manipuler les pions », 16/10) : un détourage
 * d'encre autour de ses pièces et un fanion à l'encre de la nation. Pas de socle : le plateau est
 * le papier de la carte.
 */
function squadMarks(layout: ReadonlyArray<Slot>, nation: string | null): Group {
  const margin = GROUP_SPACING * 0.62;
  const rx = Math.max(...layout.map(({ x }) => Math.abs(x))) + margin;
  const rz = Math.max(...layout.map(({ z }) => Math.abs(z))) + margin;
  const marks = new Group();
  const outline = new Mesh(outlineOf(1), OUTLINE_INK);
  outline.scale.set(rx, 1, rz);
  marks.add(outline);
  const pennant = new Group();
  pennant.add(new Mesh(POLE, POLE_WOOD), new Mesh(CLOTH, flagOf(nation)));
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
  ready: boolean;
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

/** The prototype's lift (`LIFT_Y`, `lpHand` at 4.2), in board units at full near weight. */
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
  readonly shadow: { readonly object: Group; readonly materials: MeshBasicMaterial[] };
  /** The ring on the ground where it would land, and the line that drops to it. */
  readonly marks: Marks;
  readonly width: number;
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
const RETICLE_LIFT = 0.006;

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

/** Its own copy of the contact discs: the board's are shared, and this one fades on its own. */
function carriedShadow(): Carried['shadow'] {
  const object = contactShadow();
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

/** What a pile draws: its nation, and per piece the role, the figures, the wear and the riders. */
export const drawnKey = (nation: string | null, { groups }: PilePieces): string =>
  JSON.stringify([nation, groups.map((g) => [g.role, g.figures, g.wear, g.aboard])]);

/**
 * **My piles standing on the board, in figurines** (ADR 0026 §3 and §5) — the twin of a
 * movement's pawn for what is not moving. Full at the country level, gone beyond the region
 * fade: far away the label's plate is the pile. Only a worn vehicle's smoke moves on its own,
 * and it is an ambient layer: it steps on the ambient beat and stands still when motion is
 * reduced or cut — the smoke stays, the wear is information. A model or a counter face that
 * lands late asks for its frame through `changed`.
 */
export class StandingLayer {
  readonly group = new Group();
  private time = 0;
  private nation: string | null = null;
  private piles: ReadonlyArray<StandingPile> = [];
  private dressed = new Map<string, Dressed>();
  private held: PieceHold | null = null;
  motion: MapMotion = 'full';
  /** The copy of what is in hand; `null` when the pile is not dressed. */
  private carried: Carried | null = null;
  /** A refusal announced, waiting for the hand to empty (`refuseDrop`). */
  private refusal: number | null = null;
  private verdict: DropVerdict = 'none';
  /** What each pile is to the hand (`setRings`): hovered, in hand, aimed at, a free seat. */
  private rings: ReadonlyMap<string, RingState> = new Map();
  /** The drop is read on a pile, which its own ring answers: no reticle under the hand. */
  private onPile = false;
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
      if (kept?.key === key) {
        kept.at = pile.at;
        kept.pieces = pile.pieces;
        this.dressed.delete(pile.id);
        next.set(pile.id, kept);
        continue;
      }
      const built = pileObject(
        this.nation,
        pile.pieces,
        'lonLat' in pile.at ? this.seaward(pile.at.lonLat) : null,
      );
      if (built === null) continue;
      for (const smoke of built.smokes) smoke.frame(this.time);
      for (const target of built.targets) target.userData.pileId = pile.id;
      const ring = new InkRing();
      built.object.add(ring);
      const entry: Dressed = {
        key,
        at: pile.at,
        pieces: pile.pieces,
        object: built.object,
        ready: false,
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
    for (const gone of this.dressed.values()) gone.object.removeFromParent();
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
    const entry = this.dressed.get(id);
    return entry?.ready === true && entry.object.visible ? boxOfObject(entry.object) : null;
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
    if (lifted !== null && held === null && !sent && this.motion !== 'off') {
      lifted.back = {
        from: lifted.object.position.clone(),
        since: released,
        carried: lifted.lift,
        into,
        refused: refused && into === null && this.motion === 'full',
      };
      lifted.down = null;
      this.leaving = lifted;
    } else {
      if (lifted !== null) discard(lifted);
      if (previous !== null) {
        const entry = this.dressed.get(previous.pileId);
        if (entry) wash(entry.object, false);
      }
    }
    this.held = held;
    if (held === null) return;
    const entry = this.dressed.get(held.pileId);
    if (entry === undefined) return;
    if (entry.ready) wash(entry.object, true);
    const copy = pileObject(
      this.nation,
      heldPieces(entry.pieces, held.troopIds),
      'lonLat' in entry.at ? this.seaward(entry.at.lonLat) : null,
    );
    if (copy === null) return;
    for (const disc of copy.object.getObjectsByProperty('name', CONTACT)) disc.visible = false;
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
      shadow,
      marks,
      width,
      pointer: null,
      lift: this.motion === 'full' ? 0 : CARRIED_LIFT,
      drag: { x: 0, z: 0 },
      since: now,
      clock: now,
      down: null,
      back: null,
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
    return moving || this.leaving !== null;
  }

  /** **The rings round the piles** (POC, `ringStyle`), by pile; a pile left out has none. */
  setRings(rings: ReadonlyMap<string, RingState>, onPile = false): void {
    this.rings = rings;
    this.onPile = onPile;
  }

  /** The pile a label stands for: a pile's own, or the garrison at a mast's foot. */
  pileOfLabel(labelId: string): string | null {
    if (this.dressed.has(labelId)) return labelId;
    for (const [id, { at }] of this.dressed) if ('beside' in at && at.beside === labelId) return id;
    return null;
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

  /** Every dressed pile set back on its point; a garrison is set at its maquette's foot by `orient`. */
  rebuild(): void {
    for (const { at, object } of this.dressed.values())
      if ('lonLat' in at)
        object.position.copy(this.frame.projectLonLat(at.lonLat, COUNTRY_THICKNESS));
  }

  orient(cameraPosition: Vector3): void {
    for (const { object, at } of this.dressed.values()) {
      if ('beside' in at) {
        const foot = this.garrisonAt(at.beside);
        if (foot === null) {
          object.visible = false;
          continue;
        }
        const near = nearWeight(foot.at.distanceTo(cameraPosition));
        object.position.set(
          foot.at.x + foot.step[0] * near,
          foot.at.y,
          foot.at.z + foot.step[1] * near,
        );
        object.rotation.y = foot.facing;
      }
      const near = nearWeight(object.position.distanceTo(cameraPosition));
      object.visible = near > 0;
      object.scale.setScalar(near * pieceScale.troops);
      hover(object);
    }
    const now = performance.now();
    for (const [id, { ring, extent }] of this.dressed) {
      ring.style(this.rings.get(id) ?? null, now / 1000, this.motion !== 'full');
      const beat = (ring.userData.beat as number | undefined) ?? 1;
      ring.scale.set(extent.x * beat, 1, extent.z * beat);
      ring.position.y = RETICLE_LIFT;
    }
    if (this.leaving !== null) this.orientCarried(this.leaving, cameraPosition, now);
    if (this.carried !== null) this.orientCarried(this.carried, cameraPosition, now);
  }

  /** Its time in seconds since `since`, or past every animation when motion is not full. */
  private seconds(since: number, now: number): number {
    return this.motion === 'full' ? (now - since) / 1000 : Infinity;
  }

  private orientCarried(carried: Carried, cameraPosition: Vector3, now: number): void {
    const { object, piece, down, back } = carried;
    const dt = Math.min(0.1, (now - carried.clock) / 1000);
    carried.clock = now;
    const near = nearWeight(object.position.distanceTo(cameraPosition));
    const scale = near * pieceScale.troops;
    const full = this.motion === 'full';
    let tilt = { x: 0, z: 0 };
    let turn = 0;
    let shrink = 1;
    if (back !== null) {
      const shaking = back.refused ? SHAKE_S : 0;
      const t = this.seconds(back.since, now) - shaking;
      if (t >= RETURN_DONE) {
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
      carried.lift += (CARRIED_LIFT - carried.lift) * (full ? followShare(dt, 12) : 1);
      // The prototype leans 0.012 a unit of lag; its unit is ours over PROTOTYPE_UNIT.
      const lean = 0.012 / PROTOTYPE_UNIT / Math.max(scale, 1e-3);
      carried.drag = { x: gap.x * lean, z: gap.z * lean };
      if (full) tilt = swayAt((now - carried.since) / 1000, carried.drag);
      // The prototype's tremble: a piece over where it cannot go does not hang still.
      if (full && this.verdict === 'refused') turn = Math.sin((now / 1000) * 30) * 0.03;
    }
    piece.position.y = carried.lift;
    piece.rotation.set(tilt.x, turn, tilt.z);
    this.orientMarks(carried, now);
    // The prototype's blob: `radius × (0.8 + h × 0.3)`, `0.42 − h × 0.1`, h in its units.
    const height = (carried.lift / CARRIED_LIFT) * 1.5;
    carried.shadow.object.scale.setScalar(carried.width * 0.6 * (0.8 + height * 0.3));
    const fade = Math.max(0, 0.42 - height * 0.1) / 0.42;
    carried.shadow.materials.forEach(
      (material, k) => (material.opacity = [0.12, 0.06][k]! * fade * 1.5),
    );
    object.visible = near > 0 && (carried.pointer !== null || down !== null || back !== null);
    object.scale.setScalar(scale * shrink);
  }

  /** Following the pointer only: set down, put back or sent, the drop is no longer being read. */
  private orientMarks(carried: Carried, now: number): void {
    const { reticle, plumb } = carried.marks;
    const reading = carried.pointer !== null && carried.down === null && carried.back === null;
    plumb.visible = reading;
    reticle.style(
      reading && !this.onPile ? RETICLE[this.verdict] : null,
      now / 1000,
      this.motion !== 'full',
    );
    if (!reading) return;
    const pulse = this.motion === 'full' ? 1 + 0.06 * Math.sin((now / 1000) * 8) : 1;
    reticle.scale.setScalar(0.49 * carried.width * pulse);
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
    this.boarding = { at, since: performance.now() };
  }

  /** Model geometry is shared with the pawns: nothing here is this layer's to free. */
  dispose(): void {
    this.dropLeaving();
    if (this.carried !== null) discard(this.carried);
    this.carried = null;
    this.group.removeFromParent();
  }
}
