import {
  AdditiveBlending,
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
} from 'three';
import type { Medium } from '@/domain/ids';
import type { ReplayFrame, ReplayPiece, ReplayView } from '@/domain/replay';
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
/** A block's half width at board scale: it tips over its far bottom edge, not through the board. */
const BLOCK_HALF = 0.75 * FIGURINE_SCALE;

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
  readonly home: readonly [number, number];
  readonly holder: Group;
  readonly pivot: Group;
  body: Object3D;
  readonly flash: Sprite;
  flashSize: number;
  readonly firing: Smoke;
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
    holder.position.set(home[0], 0, home[1]);
    const built: Piece = {
      side: piece.side,
      burns: piece.side === 'mine' && piece.role !== 'infantry',
      home,
      holder,
      pivot,
      body: new Group(),
      flash: flashSprite,
      flashSize: FLASH_SIZE,
      firing,
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
      // It tips over its far edge, away from my line.
      pivot.position.x = BLOCK_HALF;
      built.body.position.x = -BLOCK_HALF;
      marker.position.set(-BLOCK_HALF * 2, 0.3, 0);
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
      piece.firing.object.visible = step === 'salves';
      piece.firing.frame(still ? 0.4 : progress * 0.9 + 0.05);

      const fall = state.fate === 'fallen' ? ease(state.progress) : 0;
      const retreat = state.fate === 'routed' ? ease(state.progress) : 0;
      const sign = piece.side === 'mine' ? -1 : 1;
      holder.position.x = piece.home[0] + sign * RETREAT * retreat;
      if (piece.burns) {
        pivot.rotation.set(0, 0, 0);
      } else if (piece.side === 'theirs') {
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
  }

  dispose(): void {
    for (const piece of this.pieces) dress(piece.body, null);
    this.object.removeFromParent();
  }
}
