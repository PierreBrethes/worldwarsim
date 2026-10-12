import {
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Vector3,
} from 'three';
import type { LonLat } from '@/domain/geo';
import type { PilePieces } from '@/domain/pile-pieces';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { FIGURINE_SCALE, figurineFor, nearWeight, type Figurine } from './figurines/figurine';

export type StandingPile = {
  /** The pile's label id (`stackLabelId`): the label reads whether its plate gives way. */
  readonly id: string;
  readonly lonLat: LonLat;
  readonly pieces: PilePieces;
};

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

const counterTexts = (pieces: PilePieces): string[] => [
  ...pieces.groups.filter((group) => group.troops > 1).map((group) => `×${group.troops}`),
  ...(pieces.more > 0 ? [`+${pieces.more}`] : []),
];

/** The whole pile as one object at board scale, `null` when it is not dressed. */
export function pileObject(
  nation: string | null,
  pieces: PilePieces,
): { object: Group; ready: Promise<unknown> } | null {
  const figurines = dressedGroups(nation, pieces);
  if (figurines === null) return null;
  const layout = pileLayout(figurines.length, pieces.more > 0);
  const object = new Group();
  figurines.forEach((figurine, k) => {
    const x = layout.groups[k]!;
    figurine.object.position.x = x;
    object.add(figurine.object);
    const troops = pieces.groups[k]!.troops;
    if (troops > 1) object.add(counter(`×${troops}`, x + COUNTER_AT[0], COUNTER_AT[1]));
  });
  if (layout.more !== null) object.add(counter(`+${pieces.more}`, layout.more, 0));
  return { object, ready: Promise.all(figurines.map((figurine) => figurine.ready)) };
}

/**
 * **A painted wooden counter**, the prototype's (`table-etat-major.html`, `counter`): a disc of
 * wood, its top a paper face inked in Bodoni. The face is a canvas, drawn once per text and
 * shared; the layer frees the faces no pile shows any more.
 */
const WOOD = new MeshStandardMaterial({ color: '#6b4a24', roughness: 0.55 });
const DISC = new CylinderGeometry(0.5, 0.53, 0.14, 32);
DISC.translate(0, 0.07, 0);
const FACE = new CircleGeometry(0.47, 32);
FACE.rotateX(-Math.PI / 2);
FACE.translate(0, 0.142, 0);

const faces = new Map<string, MeshStandardMaterial>();
/** Called when a face is redrawn after Bodoni has landed — it was inked in Georgia until then. */
let onFaceRedrawn: () => void = () => {};

function faceOf(text: string): MeshStandardMaterial {
  let face = faces.get(text);
  if (face) return face;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const draw = () => {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#e4d8bd';
    ctx.beginPath();
    ctx.arc(64, 64, 63, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a2118';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(64, 64, 53, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#2a2118';
    ctx.font = `700 ${text.length > 2 ? 46 : 58}px "Bodoni Moda", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 68);
  };
  draw();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  face = new MeshStandardMaterial({ map: texture, roughness: 0.8 });
  faces.set(text, face);
  void document.fonts?.load('700 58px "Bodoni Moda"').then(() => {
    if (faces.get(text) !== face) return;
    draw();
    texture.needsUpdate = true;
    onFaceRedrawn();
  });
  return face;
}

function counter(text: string, x: number, z: number): Group {
  const piece = new Group();
  piece.add(new Mesh(DISC, WOOD), new Mesh(FACE, faceOf(text)));
  piece.scale.setScalar(FIGURINE_SCALE);
  piece.position.set(x, 0, z);
  return piece;
}

type Dressed = { readonly key: string; lonLat: LonLat; readonly object: Group };

/**
 * **My piles standing on the board, in figurines** (ADR 0026 §3 and §5) — the twin of a
 * movement's pawn for what is not moving. Full at the country level, gone beyond the region
 * fade: far away the label's plate is the pile. Nothing here moves on its own, so nothing is
 * declared flowing: a camera that moves already asks for its frames, and a model or a counter
 * face that lands late asks through `changed`.
 */
export class StandingLayer {
  readonly group = new Group();
  private nation: string | null = null;
  private piles: ReadonlyArray<StandingPile> = [];
  private dressed = new Map<string, Dressed>();

  constructor(
    private readonly frame: WorldFrame,
    private readonly changed: () => void,
  ) {
    onFaceRedrawn = changed;
  }

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
      const key = JSON.stringify([this.nation, pile.pieces]);
      const kept = this.dressed.get(pile.id);
      if (kept?.key === key) {
        kept.lonLat = pile.lonLat;
        this.dressed.delete(pile.id);
        next.set(pile.id, kept);
        continue;
      }
      const built = pileObject(this.nation, pile.pieces);
      if (built === null) continue;
      void built.ready.then(this.changed);
      this.group.add(built.object);
      next.set(pile.id, { key, lonLat: pile.lonLat, object: built.object });
    }
    for (const gone of this.dressed.values()) gone.object.removeFromParent();
    this.dressed = next;
    this.rebuild();

    const shown = new Set(
      piles.filter((pile) => next.has(pile.id)).flatMap((pile) => counterTexts(pile.pieces)),
    );
    for (const [text, face] of faces) {
      if (shown.has(text)) continue;
      face.map?.dispose();
      face.dispose();
      faces.delete(text);
    }
  }

  isDressed(id: string): boolean {
    return this.dressed.has(id);
  }

  /** The ground moved under the piles — curvature: set them back on it. */
  rebuild(): void {
    for (const { lonLat, object } of this.dressed.values())
      object.position.copy(this.frame.projectLonLat(lonLat, COUNTRY_THICKNESS));
  }

  orient(cameraPosition: Vector3): void {
    for (const { object } of this.dressed.values()) {
      const near = nearWeight(object.position.distanceTo(cameraPosition));
      object.visible = near > 0;
      object.scale.setScalar(near);
    }
  }

  /** Model geometry is shared with the pawns and the counter disc with every pile: only the
   *  counter faces are this layer's to free. */
  dispose(): void {
    this.group.removeFromParent();
    for (const face of faces.values()) {
      face.map?.dispose();
      face.dispose();
    }
    faces.clear();
  }
}
