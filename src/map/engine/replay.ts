import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type Material,
  type Object3D,
  Vector3,
} from 'three';
import type { Medium } from '@/domain/ids';
import { STEP_MS, type ReplayFrame, type ReplayPiece } from '@/domain/replay';
import type { ReplayView } from '@/domain/player-view';
import { spriteUrl } from '@/emblems/units/manifest';
import { textureOf } from './billboard';
import { blockFigurine } from './blocks';
import { contactShadow, FIGURINE_SCALE, figurineFor } from './figurines/figurine';
import { charred, PLUME_BY_WEAR, Smoke, type Plume } from './smoke';
import { washedOf } from './standing';

/** Board units. Each side stands in rows of three, its front rank facing the other across the gap. */
const GAP = 0.6;
const COLUMN = 0.8;
const RANK = 0.6;
const PER_COLUMN = 3;
/** How far a routed piece backs off, and how high a piece is let go above the board. */
const RETREAT = 0.9;
const DROP = 1.2;
/** A block's half thickness at board scale: it tips over its back bottom edge, not through the board. */
const BLOCK_HALF = 0.3 * FIGURINE_SCALE;

/**
 * **Where the `count` pieces of a side stand**, in the replay's frame: x across the screen, z
 * towards the eye. Mine on the left, theirs on the right; the first piece in the front rank.
 */
export function replayLayout(count: number, side: 'mine' | 'theirs'): Array<[number, number]> {
  const sign = side === 'mine' ? -1 : 1;
  return Array.from({ length: count }, (_, k) => {
    const column = Math.floor(k / PER_COLUMN);
    const inColumn = Math.min(PER_COLUMN, count - column * PER_COLUMN);
    const rank = k % PER_COLUMN;
    return [sign * (GAP + column * COLUMN), (rank - (inColumn - 1) / 2) * RANK];
  });
}

/** The half width of what both sides take, to frame it and to clear the board around it. */
export function replayReach(view: ReplayView): number {
  const troops = Math.max(view.theirs.troops, ...view.mine.map((entry) => entry.troops), 1);
  return GAP + Math.ceil(troops / PER_COLUMN) * COLUMN + RETREAT;
}

const FIRING: Plume = {
  puffs: 4,
  life: 1.2,
  rise: 1.4,
  size: [0.3, 1.1],
  opacity: 0.55,
  color: '#8a8478',
};

let flashMaterial: SpriteMaterial | null = null;
function flash(): Sprite {
  flashMaterial ??= new SpriteMaterial({
    map: drawFlash(),
    color: '#ffd27a',
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const sprite = new Sprite(flashMaterial);
  sprite.renderOrder = 4;
  return sprite;
}

function drawFlash(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,240,1)');
  gradient.addColorStop(0.3, 'rgba(255,200,90,.8)');
  gradient.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * **Both salvoes leave at once** (ADR 0014): each piece sends one shot of ink across the gap —
 * mine at the blocks, the blocks at mine, the prototype's pairing (`table-etat-major.html`,
 * `updateReplay`). `null` when there is nothing in front to aim at. Indices into the frame's
 * pieces, mine first.
 */
export function salvoTarget(k: number, mine: number, theirs: number): number | null {
  if (k < mine) return theirs === 0 ? null : mine + (k % theirs);
  return mine === 0 ? null : ((k - mine) * 2) % mine;
}

/** A shot's share of its flight through the salvo step, staggered by its rank; `null` before it
 *  leaves and after it lands. Reduced motion holds every shot halfway across. */
export function shotShare(progress: number, k: number, still: boolean): number | null {
  if (still) return 0.5;
  const jitter = (k % 3) * 0.05;
  const share = (progress - jitter) / (1 - jitter);
  return share > 0 && share < 1 ? share : null;
}

/** How long both lines shake as the salvoes land, and how far they lean, in radians. */
const SHAKE_MS = 500;
const SHAKE = 0.05;
export function shakeOf(step: ReplayFrame['step'], progress: number, still: boolean): number {
  if (still || step !== 'pertes') return 0;
  const hit = (progress * STEP_MS.pertes) / SHAKE_MS;
  return hit < 1 ? Math.sin(hit * Math.PI * 3) * SHAKE * (1 - hit) : 0;
}
/** The salvo's smoke hangs on into the losses: a puff does not vanish as the shot lands. */
const LINGER_MS = 900;

const SHOT = new BoxGeometry(0.02, 0.02, 0.24);
const SHOT_INK = new MeshBasicMaterial({ color: '#2b2118' });
const MUZZLE_HEIGHT = 0.12;
const muzzle = new Vector3();
const aim = new Vector3();
const FORWARD = new Vector3(0, 0, 1);

const PLATE = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
const CARD = new MeshStandardMaterial({ color: '#e4d8bd', roughness: 0.8 });
const plates = new Map<string, MeshBasicMaterial>();

/** No figurine for this role and nation: its plate stands upright instead, or a blank card. */
function plateOf(url: string | null): Mesh {
  let material: Material = CARD;
  if (url !== null) {
    let plate = plates.get(url);
    if (!plate) {
      plate = new MeshBasicMaterial({ map: textureOf(url), transparent: true, alphaTest: 0.1 });
      plates.set(url, plate);
    }
    material = plate;
  }
  const mesh = new Mesh(PLATE, material);
  mesh.scale.setScalar(0.45);
  return mesh;
}

/** Figurines share their model's materials: a piece wears copies, its own kept in `userData.bare`. */
function dress(object: Object3D, copy: ((material: Material) => Material) | null): void {
  object.traverse((part) => {
    if (!(part instanceof Mesh) || part.material instanceof MeshBasicMaterial) return;
    const bare = part.userData.bare as Mesh['material'] | undefined;
    if (bare !== undefined) part.material = bare;
    delete part.userData.bare;
    if (copy === null) return;
    part.userData.bare = part.material;
    part.material = Array.isArray(part.material) ? part.material.map(copy) : copy(part.material);
  });
}

type Look = 'whole' | 'burnt' | 'washed';

type Piece = {
  readonly side: 'mine' | 'theirs';
  /** A vehicle burns where it stands; a man and a block go down. */
  readonly burns: boolean;
  /** A card faces the eye: it goes down onto its back, as a block does, never in its own plane. */
  card: boolean;
  readonly home: readonly [number, number];
  readonly holder: Group;
  readonly pivot: Group;
  body: Object3D;
  readonly flash: Sprite;
  flashSize: number;
  readonly firing: Smoke;
  readonly shot: Mesh;
  burning: Smoke | null;
  look: Look;
};

const FLASH_SIZE = 0.22;

const ease = (k: number) => k * k * (3 - 2 * k);

/**
 * **A combat played on the table** (surface 4.7, ADR 0026 §7): my figurines by role on the
 * left, one block per enemy troop on the right, set down at the point and driven by
 * `replayAt`. The scene draws a frame and decides nothing: the timeline is the domain's.
 * Geometry and materials are the modules' (figurines, blocks, smoke): nothing to free but itself.
 */
export class ReplayScene {
  readonly object = new Group();
  private readonly pieces: Piece[];

  /** `medium` is the point's: the enemy's blocks wear its pictogram, never a role. */
  constructor(nation: string | null, pieces: ReadonlyArray<ReplayPiece>, medium: Medium) {
    const mine = pieces.filter((piece) => piece.side === 'mine').length;
    const spots = {
      mine: replayLayout(mine, 'mine'),
      theirs: replayLayout(pieces.length - mine, 'theirs'),
    };
    this.pieces = pieces.map((piece, k) =>
      this.stand(piece, nation, medium, spots[piece.side][piece.side === 'mine' ? k : k - mine]!),
    );
    // After the holders, which keep the pieces' order.
    this.object.add(...this.pieces.map((piece) => piece.shot));
  }

  private stand(
    piece: ReplayPiece,
    nation: string | null,
    medium: Medium,
    home: readonly [number, number],
  ): Piece {
    const holder = new Group();
    const pivot = new Group();
    const marker = new Group();
    const firing = new Smoke(FIRING);
    firing.object.scale.setScalar(FIGURINE_SCALE);
    const flashSprite = flash();
    marker.add(flashSprite, firing.object);
    holder.add(pivot);
    // The shake turns about the scene's own z, outermost: both lines lean the same way, whatever
    // their yaw — inner, it rolled mine along their aim and tipped the blocks towards the eye.
    holder.rotation.order = 'ZYX';
    holder.position.set(home[0], 0, home[1]);
    const built: Piece = {
      side: piece.side,
      burns: piece.side === 'mine' && piece.role !== 'infantry',
      card: false,
      home,
      holder,
      pivot,
      body: new Group(),
      flash: flashSprite,
      flashSize: FLASH_SIZE,
      firing,
      shot: new Mesh(SHOT, SHOT_INK),
      burning: null,
      look: 'whole',
    };
    if (built.burns) {
      built.burning = new Smoke(PLUME_BY_WEAR.burning!);
      built.burning.object.scale.setScalar(FIGURINE_SCALE);
      marker.add(built.burning.object);
    }

    if (piece.side === 'theirs') {
      built.body = blockFigurine(medium).object;
      // It tips onto its back, away from the eye, its pictogram to the sky: tipped sideways, in
      // the eye's plane, a fallen block looked like a standing one.
      pivot.position.z = -BLOCK_HALF;
      built.body.position.z = BLOCK_HALF;
      marker.position.set(-0.75 * FIGURINE_SCALE, 0.3, BLOCK_HALF);
    } else {
      // Its front, +z, towards the enemy on the right.
      holder.rotation.y = Math.PI / 2;
      marker.position.set(0, 0.25, 0.3);
      const infantry = piece.role === 'infantry';
      const figurine = figurineFor(
        nation,
        piece.role,
        infantry ? [piece.tier, piece.tier, piece.tier] : [piece.tier],
      );
      if (figurine === null) {
        built.card = true;
        const plate = plateOf(spriteUrl(nation, piece.role, piece.tier));
        // Upright to the eye, while the holder faces the enemy.
        plate.rotation.y = -Math.PI / 2;
        built.body.add(plate, contactShadow());
      } else {
        built.body = figurine.object;
        // The models' markers are in model units: what hangs there drops the board scale.
        void figurine.ready.then(
          () => {
            const muzzle = figurine.object.getObjectByName('fx_muzzle');
            if (muzzle) {
              muzzle.add(flashSprite);
              built.flashSize = FLASH_SIZE / FIGURINE_SCALE;
            }
            // The model lands after its fate may have been drawn: dress it again next frame.
            built.look = 'whole';
            const smoke = figurine.object.getObjectByName('fx_smoke');
            if (smoke && built.burning) {
              smoke.add(built.burning.object);
              built.burning.object.scale.setScalar(1);
            }
          },
          () => {},
        );
      }
    }
    pivot.add(built.body, marker);
    built.shot.visible = false;
    this.object.add(holder);
    return built;
  }

  /**
   * Draws `frame`. `seconds` is the smoke's clock, `still` the reduced motion: no drop from
   * above, a steady flash rather than a pulse.
   */
  show(frame: ReplayFrame, seconds: number, still: boolean): void {
    const { step, progress } = frame;
    const count = this.pieces.length;
    this.pieces.forEach((piece, k) => {
      const state = frame.pieces[k]!;
      const { holder, pivot } = piece;
      const down =
        step === 'voyage' ? -1 : step === 'pose' && !still ? progress * 1.6 - k / count : 1;
      holder.visible = down >= 0;
      holder.position.y = DROP * (1 - ease(Math.min(1, Math.max(0, down)))) ** 2;

      const salvo =
        step === 'salves' ? (still ? 1 : Math.sin(Math.PI * Math.min(1, progress / 0.35))) : 0;
      piece.flash.visible = salvo > 0.02;
      piece.flash.scale.setScalar(piece.flashSize * salvo);
      const lingering = step === 'pertes' && progress * STEP_MS.pertes < LINGER_MS;
      piece.firing.object.visible = step === 'salves' || (lingering && !still);
      piece.firing.frame(
        still
          ? 0.4
          : step === 'salves'
            ? progress * 0.9 + 0.05
            : 0.95 + (progress * STEP_MS.pertes) / 1000,
      );

      const fall = state.fate === 'fallen' ? ease(state.progress) : 0;
      const retreat = state.fate === 'routed' ? ease(state.progress) : 0;
      const sign = piece.side === 'mine' ? -1 : 1;
      holder.position.x = piece.home[0] + sign * RETREAT * retreat;
      holder.rotation.z = shakeOf(step, progress, still);
      if (piece.burns) {
        pivot.rotation.set(0, 0, 0);
      } else if (piece.side === 'theirs') {
        pivot.rotation.set(-(Math.PI / 2) * fall, 0, 0);
      } else if (piece.card) {
        // Away from the eye: the holder's +x is the scene's -z.
        pivot.rotation.set(0, 0, -(Math.PI / 2) * fall);
      } else {
        // Backwards, away from the enemy: the holder's +z faces them.
        pivot.rotation.set(-(Math.PI / 2) * fall, 0, 0);
      }
      const burnt = piece.burns && fall > 0;
      if (piece.burning) {
        piece.burning.object.visible = burnt;
        if (burnt) piece.burning.frame(still ? 1 : seconds);
      }
      const look: Look = burnt ? 'burnt' : retreat > 0 ? 'washed' : 'whole';
      if (look !== piece.look) {
        piece.look = look;
        dress(piece.body, look === 'burnt' ? charred : look === 'washed' ? washedOf : null);
      }
    });
    // Aimed once every holder stands where this frame puts it.
    const mine = frame.pieces.filter((piece) => piece.side === 'mine').length;
    this.pieces.forEach((piece, k) => {
      const target = this.pieces[salvoTarget(k, mine, count - mine) ?? -1];
      const share = step === 'salves' ? shotShare(progress, k, still) : null;
      piece.shot.visible = share !== null && target !== undefined;
      if (!piece.shot.visible) return;
      muzzle.copy(piece.holder.position).setY(piece.holder.position.y + MUZZLE_HEIGHT);
      aim.copy(target!.holder.position).setY(target!.holder.position.y + MUZZLE_HEIGHT * 0.8);
      piece.shot.position.lerpVectors(muzzle, aim, share!);
      // In the scene's own frame: `lookAt` would read `to` as a world point.
      piece.shot.quaternion.setFromUnitVectors(FORWARD, aim.sub(muzzle).normalize());
    });
  }

  /** A hull burns on: its smoke wants frames after the replay is held. */
  get smoking(): boolean {
    return this.pieces.some((piece) => piece.burning?.object.visible === true);
  }

  dispose(): void {
    for (const piece of this.pieces) dress(piece.body, null);
    this.object.removeFromParent();
  }
}
