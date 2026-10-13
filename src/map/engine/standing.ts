import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
  type Object3D,
  type Raycaster,
  SRGBColorSpace,
  type Vector3,
} from 'three';
import type { LonLat } from '@/domain/geo';
import type { MapMotion } from '@/domain/map-motion';
import type { PilePieces, SpreadPiece } from '@/domain/pile-pieces';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import type { AmbientLayer } from './ambience';
import { FIGURINE_SCALE, figurineFor, nearWeight, type Figurine } from './figurines/figurine';
import { charred, PLUME_BY_WEAR, Smoke } from './smoke';
import { pieceScale } from './piece-scale';
import { footedHit, nearer, type PieceHit } from './piece-pick';

export type StandingPile = {
  /** The pile's label id (`stackLabelId`): the label reads whether its plate gives way. */
  readonly id: string;
  /**
   * A point, or **a building's garrison**: the id of the maquette it stands at the foot of. A
   * garrison is shown, never lifted — its garrison panel is the one way to take it in hand.
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
/** The ×N counter stands at the front right foot of its group. */
const COUNTER_AT = [0.2, 0.22] as const;

/**
 * **Where each group stands around the pile's point**, side by side across the board and
 * centred, the « +N » counter taking the slot after the last group. Positions in board units,
 * before the near weight scales the whole pile.
 */
export function pileLayout(
  groups: number,
  more: boolean,
): { groups: ReadonlyArray<number>; more: number | null } {
  const slots = groups + (more ? 1 : 0);
  const at = (k: number) => (k - (slots - 1) / 2) * GROUP_SPACING;
  return {
    groups: Array.from({ length: groups }, (_, k) => at(k)),
    more: more ? at(groups) : null,
  };
}

/** Troops in a row before the next one starts behind it: four is about a pile's own width. */
const SPREAD_ROW = 4;
const SPREAD_DEPTH = 0.7;

/**
 * **Where each troop of a deployed pile stands** (ADR 0026 §6, 13/10): side by side, centred on
 * the point, rows of four going back from the eye — about the footprint of the grouped pile, so
 * a deployed pile does not walk over the maquettes standing by it. Board units, front at z = 0.
 */
export function spreadLayout(troops: number): ReadonlyArray<{ x: number; z: number }> {
  return Array.from({ length: troops }, (_, k) => {
    const row = Math.floor(k / SPREAD_ROW);
    const inRow = Math.min(SPREAD_ROW, troops - row * SPREAD_ROW);
    return {
      x: ((k % SPREAD_ROW) - (inRow - 1) / 2) * GROUP_SPACING,
      z: row > 0 ? -row * SPREAD_DEPTH : 0,
    };
  });
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

/** The counters' words come from the caller: the engine holds no i18n table. */
export type CounterTexts = {
  readonly count: (troops: number) => string;
  readonly more: (roles: number) => string;
};

/** The one source of a pile's counter words: a ×N per group of several, then the +N. */
export function counterTexts(
  pieces: PilePieces,
  texts: CounterTexts,
): { groups: ReadonlyArray<string | null>; more: string | null } {
  return {
    groups: pieces.groups.map((group) => (group.troops > 1 ? texts.count(group.troops) : null)),
    more: pieces.more > 0 ? texts.more(pieces.more) : null,
  };
}

/**
 * **What a click takes** (ADR 0026 §6): the index of a group, or the whole pile — a counter, the
 * ×N included. It is read on the pile's current pieces, never kept: a pile re-served with the
 * same drawing keeps its objects, not necessarily its troops.
 */
type Grip = number | 'pile';

/** A group is clicked by its footprint, not by its triangles: a rifle is a pixel wide. */
const FOOTPRINT = new BoxGeometry(GROUP_SPACING * 0.9, 0.6, 0.75);
FOOTPRINT.translate(0, 0.3, 0);
const UNSEEN = new MeshBasicMaterial();

function footprint(x: number, grip: Grip): Mesh {
  const target = new Mesh(FOOTPRINT, UNSEEN);
  target.visible = false;
  target.position.x = x;
  target.userData.grip = grip;
  return target;
}

/** The troops a ray takes among `targets`, a counter before the group it stands on. */
export function pickedIn(
  ray: Raycaster,
  targets: ReadonlyArray<Object3D>,
  pieces: PilePieces,
): ReadonlyArray<string> | null {
  const grips = ray
    .intersectObjects([...targets], false)
    .map((hit) => hit.object.userData.grip as Grip);
  const grip = grips.includes('pile') ? 'pile' : grips[0];
  if (grip === undefined) return null;
  return grip === 'pile' ? pieces.troopIds : (pieces.groups[grip]?.troopIds ?? null);
}

/** The whole pile as one object at board scale, `null` when it is not dressed. `targets` are
 *  what a click is cast at. */
export function pileObject(
  nation: string | null,
  pieces: PilePieces,
  texts: CounterTexts,
  faces: Faces,
): {
  object: Group;
  ready: Promise<unknown>;
  smokes: ReadonlyArray<Smoke>;
  targets: ReadonlyArray<Mesh>;
} | null {
  const figurines = dressedGroups(nation, pieces);
  if (figurines === null) return null;
  const layout = pileLayout(figurines.length, pieces.more > 0);
  const words = counterTexts(pieces, texts);
  const object = new Group();
  const smokes: Smoke[] = [];
  const targets: Mesh[] = [];
  const addCounter = (piece: Group) => {
    object.add(piece);
    targets.push(piece.children[0] as Mesh);
  };
  figurines.forEach((figurine, k) => {
    const x = layout.groups[k]!;
    figurine.object.position.x = x;
    object.add(figurine.object);
    const target = footprint(x, k);
    object.add(target);
    targets.push(target);
    const text = words.groups[k];
    if (text) addCounter(counter(faces.of(text), x + COUNTER_AT[0], COUNTER_AT[1]));
    const group = pieces.groups[k]!;
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
  if (layout.more !== null && words.more !== null)
    addCounter(counter(faces.of(words.more), layout.more, 0));
  return {
    object,
    ready: Promise.all(figurines.map((figurine) => figurine.ready)),
    smokes,
    targets,
  };
}

export function blacken(figurine: Object3D): void {
  figurine.traverse((part) => {
    if (part instanceof Mesh && !(part.material instanceof MeshBasicMaterial))
      part.material = Array.isArray(part.material)
        ? part.material.map(charred)
        : charred(part.material);
  });
}

/**
 * **A painted wooden counter**, the prototype's (`table-etat-major.html`, `counter`): a disc of
 * wood, its top a paper face inked in Bodoni. The face is a canvas, drawn once per text and
 * shared by the layer's piles; the layer frees the faces no pile shows any more.
 */
const WOOD = new MeshStandardMaterial({ color: '#5e4020', roughness: 0.6 });
const BEVEL_WOOD = new MeshStandardMaterial({ color: '#9a7440', roughness: 0.45 });
const DISC = new CylinderGeometry(0.5, 0.54, 0.11, 32);
DISC.translate(0, 0.055, 0);
const BEVEL = new CylinderGeometry(0.46, 0.5, 0.035, 32);
BEVEL.translate(0, 0.1275, 0);
const FACE = new CircleGeometry(0.455, 32);
FACE.rotateX(-Math.PI / 2);
FACE.translate(0, 0.146, 0);

export class Faces {
  private readonly faces = new Map<string, MeshStandardMaterial>();
  /** `redrawn` is called when a face is inked again after Bodoni has landed — it was Georgia until then. */
  constructor(private readonly redrawn: () => void) {}

  of(text: string): MeshStandardMaterial {
    let face = this.faces.get(text);
    if (face) return face;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const draw = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 128, 128);
      const paper = ctx.createRadialGradient(56, 52, 8, 64, 64, 64);
      paper.addColorStop(0, '#f1e7cc');
      paper.addColorStop(1, '#dccfae');
      ctx.fillStyle = paper;
      ctx.beginPath();
      ctx.arc(64, 64, 63, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a2118';
      for (const [radius, width] of [
        [54, 4],
        [46, 1.5],
      ] as const) {
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(64, 64, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.font = `700 ${text.length > 2 ? 44 : 56}px "Bodoni Moda", Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 250, 235, 0.7)';
      ctx.fillText(text, 64, 70);
      ctx.fillStyle = '#2a2118';
      ctx.fillText(text, 64, 68);
    };
    draw();
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    face = new MeshStandardMaterial({ map: texture, roughness: 0.8 });
    this.faces.set(text, face);
    void document.fonts?.load('700 58px "Bodoni Moda"').then(() => {
      if (this.faces.get(text) !== face) return;
      draw();
      texture.needsUpdate = true;
      this.redrawn();
    });
    return face;
  }

  /** Frees every face whose text is not in `shown`. */
  keepOnly(shown: ReadonlySet<string>): void {
    for (const [text, face] of this.faces) {
      if (shown.has(text)) continue;
      face.map?.dispose();
      face.dispose();
      this.faces.delete(text);
    }
  }
}

function counter(face: MeshStandardMaterial, x: number, z: number): Group {
  const piece = new Group();
  const disc = new Mesh(DISC, WOOD);
  disc.userData.grip = 'pile' satisfies Grip;
  const bevel = new Mesh(BEVEL, BEVEL_WOOD);
  bevel.userData.grip = 'pile' satisfies Grip;
  piece.add(disc, bevel, new Mesh(FACE, face));
  piece.scale.setScalar(FIGURINE_SCALE);
  piece.position.set(x, 0, z);
  return piece;
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
};

/** A piece in hand: the pile it was lifted from, and the troops lifted (ADR 0026 §6). */
export type PieceHold = { readonly pileId: string; readonly troopIds: ReadonlyArray<string> };

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
    if (!(part instanceof Mesh) || part.userData.grip !== undefined) return;
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

/** The held groups only, the +N with them when a troop beyond the three shown is held. */
function heldPieces(pieces: PilePieces, troopIds: ReadonlyArray<string>): PilePieces {
  const held = new Set(troopIds);
  const groups = pieces.groups.filter((group) => group.troopIds.some((id) => held.has(id)));
  const shown = new Set(pieces.groups.flatMap((group) => group.troopIds));
  return {
    groups,
    more: troopIds.some((id) => !shown.has(id)) ? pieces.more : 0,
    troopIds,
    spread: pieces.spread.filter((piece) => held.has(piece.troopId)),
  };
}

/** Ten notches under a deployed troop, inked as the sheet inks them (`PileSheet`). */
const NOTCH = new BoxGeometry(0.03, 0.02, 0.05);
NOTCH.translate(0, 0.01, 0);
const NOTCH_INK = {
  ink: new MeshStandardMaterial({ color: '#2a2118', roughness: 0.7 }),
  ochre: new MeshStandardMaterial({ color: '#b07434', roughness: 0.7 }),
  red: new MeshStandardMaterial({ color: '#9d4638', roughness: 0.7 }),
} as const;
const NOTCH_BLANK = new MeshStandardMaterial({ color: '#d9ccab', roughness: 0.8 });
/** In front of the figure, towards the eye. */
const LIFE_AT = 0.32;

function lifeBar({ notches, ink }: SpreadPiece): Group {
  const bar = new Group();
  for (let k = 0; k < 10; k++) {
    const notch = new Mesh(NOTCH, k < notches ? NOTCH_INK[ink] : NOTCH_BLANK);
    notch.position.x = (k - 4.5) * 0.04;
    bar.add(notch);
  }
  bar.position.z = LIFE_AT;
  return bar;
}

/** One deployed troop: its figurine, its life, and the footprint a click is cast at. */
type SpreadPart = { readonly object: Group; readonly to: { x: number; z: number } };

/** The pile deployed, `null` when a troop has no figurine — the sheet alone composes then. */
function spreadObject(
  nation: string | null,
  pieces: PilePieces,
  pileId: string,
): { object: Group; parts: Map<string, SpreadPart>; ready: Promise<unknown> } | null {
  const figurines: Figurine[] = [];
  for (const piece of pieces.spread) {
    const figurine = figurineFor(nation, piece.role, piece.figures);
    if (figurine === null) return null;
    figurines.push(figurine);
  }
  const layout = spreadLayout(figurines.length);
  const object = new Group();
  const parts = new Map<string, SpreadPart>();
  figurines.forEach((figurine, k) => {
    const piece = pieces.spread[k]!;
    const part = new Group();
    const target = footprint(0, 'pile');
    target.userData.pileId = pileId;
    target.userData.troopId = piece.troopId;
    part.add(figurine.object, target, lifeBar(piece));
    if (piece.wear === 'burning')
      void figurine.ready.then(
        () => blacken(figurine.object),
        () => {},
      );
    object.add(part);
    parts.set(piece.troopId, { object: part, to: layout[k]! });
  });
  return { object, parts, ready: Promise.all(figurines.map((figurine) => figurine.ready)) };
}

/** How long the pile takes to deploy or close, by the map's motion setting. */
const SPREAD_MS: Readonly<Record<MapMotion, number>> = { full: 250, reduced: 120, off: 0 };

/**
 * **A pile deployed at the foot of the piece in hand.** Its progress is a function of the clock,
 * not a counter stepped by frames: `from` at `since`, going up while it opens, down while it
 * closes — a frame that comes late still shows the right instant.
 */
type Spread = {
  readonly pileId: string;
  readonly object: Group;
  readonly parts: Map<string, SpreadPart>;
  ready: boolean;
  opening: boolean;
  from: number;
  since: number;
};

/** What a pick found: a troop of the deployed pile, or the pile itself. */
export type PiecePick = PieceHold & { readonly spread: boolean };

/** What a pile draws: its nation, and per group the role, the figures, the troop count and the wear, plus `more`. */
export const drawnKey = (nation: string | null, { groups, more }: PilePieces): string =>
  JSON.stringify([nation, groups.map((g) => [g.role, g.figures, g.troops, g.wear]), more]);

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
  private readonly faces: Faces;
  private held: PieceHold | null = null;
  private spread: Spread | null = null;
  motion: MapMotion = 'full';
  /** The copy of what is in hand; `null` when the pile is not dressed. */
  private carried: { readonly object: Group; at: boolean } | null = null;
  /** Set by the first `display`; no pile exists before it. */
  private texts: CounterTexts = { count: String, more: String };

  constructor(
    private readonly frame: WorldFrame,
    private readonly changed: () => void,
    private readonly garrisonAt: GarrisonAt,
  ) {
    this.faces = new Faces(changed);
  }

  setNation(nation: string | null): void {
    this.nation = nation;
    this.display(this.piles);
  }

  /** A pile whose pieces did not change keeps its objects: the view is re-served at every step
   *  of any column, and rebuilding three squads each time would be work for nothing. */
  display(piles: ReadonlyArray<StandingPile>, texts: CounterTexts = this.texts): void {
    this.piles = piles;
    this.texts = texts;
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
      const built = pileObject(this.nation, pile.pieces, this.texts, this.faces);
      if (built === null) continue;
      for (const smoke of built.smokes) smoke.frame(this.time);
      for (const target of built.targets) target.userData.pileId = pile.id;
      const entry: Dressed = {
        key,
        at: pile.at,
        pieces: pile.pieces,
        object: built.object,
        ready: false,
        smokes: built.smokes,
        targets: built.targets,
      };
      next.set(pile.id, entry);
      // A model that fails to load leaves the pile in its plate.
      built.ready.then(
        () => {
          if (this.dressed.get(pile.id) !== entry) return;
          entry.ready = true;
          // After the hull is blackened: that callback was chained before this one.
          if (this.held?.pileId === pile.id) {
            wash(entry.object, true);
            // Redrawn while deployed: the troops' wear and notches are read again.
            this.deploy(this.held);
          }
          this.group.add(entry.object);
          this.changed();
        },
        () => {},
      );
    }
    for (const gone of this.dressed.values()) gone.object.removeFromParent();
    // Redrawn in hand, the deployment is built again from the new pieces once they are in; a
    // closing one closes on what remains.
    if (this.spread?.opening && next.get(this.spread.pileId)?.ready === false) this.fold();
    this.dressed = next;
    // The troops that marched off left the deployed pile; it closes on what remains.
    const spread = this.spread;
    if (spread !== null) {
      const staying = new Set(next.get(spread.pileId)?.pieces.troopIds);
      for (const [troopId, part] of spread.parts)
        if (!staying.has(troopId)) {
          part.object.removeFromParent();
          spread.parts.delete(troopId);
        }
      if (spread.parts.size === 0) this.fold();
    }
    this.rebuild();

    const shown = new Set<string>();
    for (const pile of piles) {
      if (!next.has(pile.id)) continue;
      const words = counterTexts(pile.pieces, this.texts);
      for (const text of [...words.groups, words.more]) if (text) shown.add(text);
    }
    this.faces.keepOnly(shown);
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

  /** The troops of the piece under `ray`, among the piles standing in sight — a troop of the
   *  deployed pile first: the pile it stands for has shrunk away under it. */
  pick(ray: Raycaster): PiecePick | null {
    const spread = this.spread;
    // Half open, the troops have taken over from the groups: before, the pile still answers.
    const deployed =
      spread !== null &&
      spread.opening &&
      spread.ready &&
      this.progressOf(spread, performance.now()) >= 0.5;
    if (spread !== null && deployed && spread.object.visible) {
      // A troop is taken by its whole figurine, its footprint where a rifle is a pixel wide.
      let troop: PieceHit | null = null;
      for (const [troopId, { object }] of spread.parts) {
        const footprints = object.children.filter((child) => child.userData.troopId);
        const distance = footedHit(ray, object, footprints);
        if (distance !== null) troop = nearer(troop, { id: troopId, distance });
      }
      if (troop !== null) return { pileId: spread.pileId, troopIds: [troop.id], spread: true };
    }
    let best: { distance: number; pick: PieceHold } | null = null;
    for (const [pileId, entry] of this.dressed) {
      if (!entry.ready || !entry.object.visible || 'beside' in entry.at) continue;
      if (deployed && spread?.pileId === pileId) continue;
      const distance = ray.intersectObjects([...entry.targets], false)[0]?.distance;
      if (distance === undefined || (best !== null && best.distance <= distance)) continue;
      const troopIds = pickedIn(ray, entry.targets, entry.pieces);
      if (troopIds !== null) best = { distance, pick: { pileId, troopIds } };
    }
    return best === null ? null : { ...best.pick, spread: false };
  }

  /** The pile under `ray`, by its figurines or the footprints it is taken by — a garrison beside
   *  its maquette included: what the pointer is over is not only what it may lift. The pile in
   *  hand is not under the pointer: it is what the pointer carries. */
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
  hold(held: PieceHold | null): void {
    const previous = this.held;
    if (previous?.pileId === held?.pileId && previous?.troopIds.join() === held?.troopIds.join())
      return;
    if (previous !== null) {
      const entry = this.dressed.get(previous.pileId);
      if (entry) wash(entry.object, false);
    }
    this.carried?.object.removeFromParent();
    this.carried = null;
    this.held = held;
    this.deploy(held);
    if (held === null) return;
    const entry = this.dressed.get(held.pileId);
    if (entry === undefined) return;
    if (entry.ready) wash(entry.object, true);
    const copy = pileObject(
      this.nation,
      heldPieces(entry.pieces, held.troopIds),
      this.texts,
      this.faces,
    );
    if (copy === null) return;
    copy.object.position.y = CARRIED_LIFT;
    const object = new Group();
    object.add(copy.object);
    object.visible = false;
    for (const smoke of copy.smokes) smoke.frame(this.time);
    const carried = { object, at: false };
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

  /** 0 folded, 1 deployed, at `now`. */
  private progressOf(spread: Spread, now: number): number {
    const duration = SPREAD_MS[this.motion];
    const step = duration === 0 ? 1 : (now - spread.since) / duration;
    return Math.min(1, Math.max(0, spread.from + (spread.opening ? step : -step)));
  }

  private turn(spread: Spread, opening: boolean): void {
    if (spread.opening === opening) return;
    const now = performance.now();
    spread.from = this.progressOf(spread, now);
    spread.since = now;
    spread.opening = opening;
  }

  private fold(): void {
    this.spread?.object.removeFromParent();
    this.spread = null;
  }

  /**
   * **Deploys the pile in hand, one figurine per troop** (ADR 0026 §6, 13/10), the troops out of
   * hand washed; any other hand folds it back. A pile of one troop has nothing to deploy, and a
   * garrison is never lifted from the board.
   */
  private deploy(held: PieceHold | null): void {
    let spread = this.spread;
    if (spread !== null && spread.pileId !== held?.pileId) {
      if (held === null) this.turn(spread, false);
      else this.fold();
      spread = this.spread;
    }
    if (held === null) return;
    if (spread === null) {
      const entry = this.dressed.get(held.pileId);
      if (!entry?.ready || 'beside' in entry.at || entry.pieces.spread.length < 2) return;
      const built = spreadObject(this.nation, entry.pieces, held.pileId);
      if (built === null) return;
      const fresh: Spread = {
        pileId: held.pileId,
        object: built.object,
        parts: built.parts,
        ready: false,
        opening: true,
        from: 0,
        since: performance.now(),
      };
      spread = this.spread = fresh;
      built.object.visible = false;
      this.group.add(built.object);
      built.ready.then(
        () => {
          if (this.spread !== fresh) return;
          fresh.ready = true;
          // The models landed after the first wash: wash them too.
          const inHand = new Set(this.held?.troopIds);
          for (const [troopId, part] of fresh.parts) wash(part.object, !inHand.has(troopId));
          // The models landed after the click: the opening starts now, not behind their back.
          fresh.from = 0;
          fresh.since = performance.now();
          this.changed();
        },
        () => {},
      );
    }
    this.turn(spread, true);
    const inHand = new Set(held.troopIds);
    for (const [troopId, part] of spread.parts) wash(part.object, !inHand.has(troopId));
  }

  /** A deployment opening or closing wants every frame until it is done (`frame-demand.ts`). */
  get isSpreading(): boolean {
    const spread = this.spread;
    if (spread === null || !spread.ready) return false;
    // Closing runs until the frame that folds it, at 0: one frame short would leave a speck.
    return !spread.opening || this.progressOf(spread, performance.now()) < 1;
  }

  /** The ground under the pointer, `null` off the board or under a finger. */
  carryTo(at: Vector3 | null): void {
    if (this.carried === null) return;
    this.carried.at = at !== null;
    if (at !== null) this.carried.object.position.copy(at);
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
    }
    this.orientSpread(cameraPosition);
    if (this.carried === null) return;
    const { object, at } = this.carried;
    const near = nearWeight(object.position.distanceTo(cameraPosition));
    object.visible = at && near > 0;
    object.scale.setScalar(near * pieceScale.troops);
  }

  /** The deployed troops slide out of the pile's point as its groups shrink into it, the whole
   *  turned to the eye; reduced motion grows them in place, cut motion shows the end. */
  private orientSpread(cameraPosition: Vector3): void {
    const spread = this.spread;
    if (spread === null) return;
    const entry = this.dressed.get(spread.pileId);
    if (entry === undefined || !spread.ready) {
      spread.object.visible = false;
      if (entry === undefined) this.fold();
      return;
    }
    const t = this.progressOf(spread, performance.now());
    if (t === 0 && !spread.opening) {
      this.fold();
      return;
    }
    const eased = t * t * (3 - 2 * t);
    const point = entry.object.position;
    const near = nearWeight(point.distanceTo(cameraPosition));
    entry.object.scale.setScalar(near * (1 - eased));
    spread.object.visible = near > 0;
    spread.object.position.copy(point);
    spread.object.scale.setScalar(near);
    spread.object.rotation.y = Math.atan2(cameraPosition.x - point.x, cameraPosition.z - point.z);
    const travel = this.motion === 'full' ? eased : 1;
    for (const { object, to } of spread.parts.values()) {
      object.position.set(to.x * travel, 0, to.z * travel);
      object.scale.setScalar(Math.max(eased, 1e-3));
    }
  }

  /** Model geometry is shared with the pawns and the counter disc with every pile: only the
   *  counter faces are this layer's to free. */
  dispose(): void {
    this.fold();
    this.group.removeFromParent();
    this.faces.keepOnly(new Set());
  }
}
