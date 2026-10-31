import { playTableSound } from '../table-sound';
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
import { STEP_MS, VOLLEY_SHARE, type ReplayFrame, type ReplayPiece } from '@/domain/replay';
import type { ReplayView } from '@/domain/player-view';
import { spriteUrl } from '@/emblems/units/manifest';
import {
  Guns,
  GUNS,
  readyOf,
  recoilAt,
  smooth as ease,
  turretLimitOf,
  wrap,
  type GunKind,
} from './articulation';
import { textureOf } from './billboard';
import { blockFigurine } from './blocks';
import { FIGURINE_SCALE, figurineFor, TANK_SHARE } from './figurines/figurine';
import { shoulder } from './figurines/infantry';
import { pieceScale } from './piece-scale';
import { articulatedOf } from './sequences';
import { charred, PLUME_BY_WEAR, Smoke, type Plume } from './smoke';
import { washedOf } from './standing';

/**
 * **The scene is laid out for a tank of `LAID_OUT_FOR`**, and drawn at a tank's real span (ADR
 * 0035): every length below is in its units, and its figurines stand at their real size in it.
 */
export const REPLAY_STAGE = TANK_SHARE;
/** Model units to the scene's: a tank sculpted `TANK_MODEL_UNITS` long stands `LAID_OUT_FOR` long in it. */
const SCENE_FIGURE = FIGURINE_SCALE / REPLAY_STAGE;

/** The scene's units. Each side stands in rows of three, its front rank facing the other across the gap. */
const GAP = 0.6;
const COLUMN = 0.8;
const RANK = 0.6;
const PER_COLUMN = 3;
/** How far a routed piece backs off, and how high a piece is let go above the board. */
const RETREAT = 0.9;
const DROP = 1.2;
/** How far the attacker walks in over the voyage, on the map. @a-mesurer: its last steps read
 *  as an arrival, not a slide? */
const ARRIVAL = 0.5;
/** A block's half thickness at board scale: it tips over its back bottom edge, not through the board. */
const BLOCK_HALF = 0.3 * SCENE_FIGURE;

/**
 * **Where the `count` pieces of a side stand**, in the replay's frame: x across the screen, z
 * towards the eye. Mine on the left, theirs on the right; the first piece in the front rank.
 */
function replayLayout(count: number, side: 'mine' | 'theirs'): Array<[number, number]> {
  const sign = side === 'mine' ? -1 : 1;
  return Array.from({ length: count }, (_, k) => {
    const column = Math.floor(k / PER_COLUMN);
    const inColumn = Math.min(PER_COLUMN, count - column * PER_COLUMN);
    const rank = k % PER_COLUMN;
    return [sign * (GAP + column * COLUMN), (rank - (inColumn - 1) / 2) * RANK];
  });
}

/** **Where a side's line stands across the scene**, its middle on x: on the map, the
 *  defender's is set on its pile's place (#272). */
export function lineCentre(count: number, side: 'mine' | 'theirs'): number {
  const columns = Math.max(1, Math.ceil(count / PER_COLUMN));
  return (side === 'mine' ? -1 : 1) * (GAP + ((columns - 1) * COLUMN) / 2);
}

/**
 * **D'où part le coup d'un bombardement** (B20, A4) : chez le tireur, la batterie à sa place, en
 * unités de la scène ; chez la cible, `unseen` — aucune batterie, le coup tombe du ciel.
 */
export type ReplayFire = { readonly battery: readonly [number, number] } | 'unseen' | null;

/**
 * **La batterie se pose à sa place, à l'échelle de la scène** : sa direction est vraie, sa distance
 * bornée. Au Pacifique, 570 km de portée reculaient la caméra trois à huit fois, et le combat
 * n'était plus qu'un point.
 */
export const BATTERY_REACH = 2;
export function batteryAt([x, z]: readonly [number, number]): readonly [number, number] {
  const far = Math.hypot(x, z);
  return far <= BATTERY_REACH ? [x, z] : [(x / far) * BATTERY_REACH, (z / far) * BATTERY_REACH];
}

const batteryOf = (fire: ReplayFire): readonly [number, number] | null =>
  fire !== null && fire !== 'unseen' ? fire.battery : null;

/** The half width of what both sides take, to frame it and to clear the board around it — the
 *  battery's own place included, where its pile would otherwise stand twice. */
export function replayReach(view: ReplayView, fire: ReplayFire = null): number {
  const troops = Math.max(view.theirs.troops, ...view.mine.map((entry) => entry.troops), 1);
  const sides = GAP + Math.ceil(troops / PER_COLUMN) * COLUMN + RETREAT;
  const battery = batteryOf(fire);
  return battery === null ? sides : Math.max(sides, Math.hypot(...battery) + COLUMN);
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
 * **Each line fires in its own beat** — the attacker in the strike, the defender in the riposte
 * (B16) — and each piece sends one shot of ink across the gap: mine at the blocks, the blocks at
 * mine, the prototype's pairing (`table-etat-major.html`, `updateReplay`). `null` when there is
 * nothing in front to aim at. Indices into the frame's pieces, mine first.
 */
export function salvoTarget(k: number, mine: number, theirs: number): number | null {
  if (k < mine) return theirs === 0 ? null : mine + (k % theirs);
  return mine === 0 ? null : ((k - mine) * 2) % mine;
}

/** **How much of the volley lies between two departures** (storyboard `JITTER`). `@a-mesurer` */
const SHOT_SPREAD = 0.15;
/** Where in the volley the shot of a line's `rank`th piece leaves, 0..1: its flash, smoke, ink
 *  and recoil all start there. The rank counts in its own line (storyboard `i % 3`). */
const departureOf = (rank: number): number => (rank % 3) * SHOT_SPREAD;
const rankOf = (k: number, mine: number): number => (k < mine ? k : k - mine);

/** A shot's share of its flight through the volley, from its departure; `null` before it
 *  leaves and after it lands. Reduced motion holds every shot halfway across. */
export function shotShare(progress: number, k: number, still: boolean): number | null {
  if (still) return 0.5;
  const jitter = departureOf(k);
  const share = (progress - jitter) / (1 - jitter);
  return share > 0 && share < 1 ? share : null;
}

/**
 * **How long since piece `k`'s shot left**, in ms — negative before — in a fire step; `null`
 * outside one. The one source of the flash, the smoke, the ink and the recoil of a shot.
 */
export function sinceDeparture(frame: ReplayFrame, k: number): number | null {
  if (frame.firing === null) return null;
  const volleyMs = STEP_MS[frame.step] * VOLLEY_SHARE;
  return frame.progress * STEP_MS[frame.step] - departureOf(k) * volleyMs;
}

/** The volley's share of a fire step, `null` once the shots have landed or outside one. */
function volleyOf(frame: ReplayFrame): number | null {
  return frame.firing !== null && frame.progress < VOLLEY_SHARE
    ? frame.progress / VOLLEY_SHARE
    : null;
}

/** How long it is since a fire step's shots landed, in ms; negative before, `null` outside one. */
function sinceImpact(frame: ReplayFrame): number | null {
  return frame.firing === null ? null : (frame.progress - VOLLEY_SHARE) * STEP_MS[frame.step];
}

/** How long both lines shake as a volley lands, and how far they lean, in radians. */
const SHAKE_MS = 500;
const SHAKE = 0.05;
export function shakeOf(frame: ReplayFrame, still: boolean): number {
  const since = sinceImpact(frame);
  if (still || since === null || since < 0) return 0;
  const hit = since / SHAKE_MS;
  return hit < 1 ? Math.sin(hit * Math.PI * 3) * SHAKE * (1 - hit) : 0;
}
/** The volley's smoke hangs on into the falls: a puff does not vanish as the shot lands. */
const LINGER_MS = 900;
/** ...and fades over the last of it, rather than being cut. */
const LINGER_FADE_MS = 400;

/** How long a muzzle flash lasts. */
const FLASH_MS = 160;

const SHOT_LENGTH = 0.24;
const SHOT = new BoxGeometry(0.02, 0.02, SHOT_LENGTH);
/** How high above its target an unseen shell is first seen: it falls, it does not come from anyone. */
const SKY = 1.6;
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
  /** A vehicle burns where it stands, mine or seen at the fire; a man and a block go down. */
  readonly burns: boolean;
  /** A card faces the eye: it goes down onto its back, as a block does, never in its own plane. */
  card: boolean;
  readonly home: readonly [number, number];
  /** Its yaw in the scene, facing the other line: what a turn about starts from. */
  yaw: number;
  readonly holder: Group;
  readonly pivot: Group;
  body: Object3D;
  readonly flash: Sprite;
  flashSize: number;
  readonly firing: Smoke;
  readonly shot: Mesh;
  burning: Smoke | null;
  look: Look;
  /** A tank or a gun, drawn as a figurine: its articulated copy aims and recoils (#331). */
  gunKind: GunKind | null;
  /** Its length in the scene's units, what its whole recoil is a share of. */
  length: number;
  /** The tower of its articulated copy, once that has landed. */
  guns: Guns | null;
  /** Its men, once the squad has landed. */
  men: ReadonlyArray<Object3D>;
  /** How far its turret may turn, when it is not free to. */
  turretLimit: number | null;
};

/** How long after the first man the next ones of a squad fire. @a-mesurer */
const SQUAD_LAG_MS = 40;
const FLASH_SIZE = 0.22;

/** How much bigger a node's units are than `root`'s, by the scales between them. */
function scaleWithin(node: Object3D, root: Object3D): number {
  let scale = 1;
  for (let at: Object3D | null = node; at !== null && at !== root; at = at.parent)
    scale *= at.scale.x;
  return scale;
}

/**
 * **A combat played on the table** (surface 4.7, ADR 0026 §7): my figurines by role on the
 * left, the enemy's on the right in its own nation's figurines (F1) — or one block per troop for
 * an account from before the fire was seen — set down at the point and driven by
 * `replayAt`. The scene draws a frame and decides nothing: the timeline is the domain's.
 * Geometry and materials are the modules' (figurines, blocks, smoke): nothing to free but itself.
 */
export class ReplayScene {
  private heard: string | null = null;
  readonly object = new Group();
  private readonly pieces: Piece[];

  /** `medium` is the point's: an enemy block — an account from before the fire was seen — wears
   *  its pictogram, never a role. `foe` is the nation faced at the fire (F1). */
  constructor(
    nation: string | null,
    pieces: ReadonlyArray<ReplayPiece>,
    medium: Medium,
    private readonly fire: ReplayFire = null,
    foe: string | null = null,
    /** **Sur la carte** (#272), le camp qui arrive : il fait ses derniers pas au voyage, rien ne
     *  tombe du ciel, et la déroute est un demi-tour sur place (`turns` de `show`). */
    private readonly onMap: 'mine' | 'theirs' | null = null,
  ) {
    const mine = pieces.filter((piece) => piece.side === 'mine').length;
    const spots = {
      mine: replayLayout(mine, 'mine').map((spot) => batteryOf(fire) ?? spot),
      theirs: replayLayout(pieces.length - mine, 'theirs'),
    };
    this.pieces = pieces.map((piece, k) =>
      this.stand(
        piece,
        piece.side === 'mine' ? nation : foe,
        medium,
        spots[piece.side][piece.side === 'mine' ? k : k - mine]!,
      ),
    );
    // After the holders, which keep the pieces' order.
    this.object.add(...this.pieces.map((piece) => piece.shot));
    this.object.scale.setScalar(REPLAY_STAGE * pieceScale.size);
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
    firing.object.scale.setScalar(SCENE_FIGURE);
    const flashSprite = flash();
    marker.add(flashSprite, firing.object);
    holder.add(pivot);
    // The shake turns about the scene's own z, outermost: both lines lean the same way, whatever
    // their yaw — inner, it rolled mine along their aim and tipped the blocks towards the eye.
    holder.rotation.order = 'ZYX';
    holder.position.set(home[0], 0, home[1]);
    const seen = piece.side === 'mine' ? piece : piece.seen;
    const built: Piece = {
      side: piece.side,
      burns: seen !== undefined && seen.role !== 'infantry',
      card: false,
      home,
      yaw: 0,
      holder,
      pivot,
      body: new Group(),
      flash: flashSprite,
      flashSize: FLASH_SIZE,
      firing,
      shot: new Mesh(SHOT, SHOT_INK),
      burning: null,
      look: 'whole',
      gunKind: null,
      length: 0,
      guns: null,
      men: [],
      turretLimit: null,
    };
    if (built.burns) {
      built.burning = new Smoke(PLUME_BY_WEAR.burning!);
      built.burning.object.scale.setScalar(SCENE_FIGURE);
      marker.add(built.burning.object);
    }

    if (seen === undefined) {
      built.body = blockFigurine(medium).object;
      built.body.scale.setScalar(1 / REPLAY_STAGE);
      // It tips onto its back, away from the eye, its pictogram to the sky: tipped sideways, in
      // the eye's plane, a fallen block looked like a standing one.
      pivot.position.z = -BLOCK_HALF;
      built.body.position.z = BLOCK_HALF;
      marker.position.set(-0.75 * SCENE_FIGURE, 0.3, BLOCK_HALF);
    } else {
      // Its front, +z, towards the other line — or, a battery, towards its target.
      holder.rotation.y =
        piece.side === 'theirs'
          ? -Math.PI / 2
          : batteryOf(this.fire) === null
            ? Math.PI / 2
            : Math.atan2(GAP - home[0], -home[1]);
      marker.position.set(0, 0.25, 0.3);
      const infantry = seen.role === 'infantry';
      const figurine = figurineFor(
        nation,
        seen.role,
        infantry ? [seen.tier, seen.tier, seen.tier] : [seen.tier],
      );
      if (figurine === null) {
        built.card = true;
        const plate = plateOf(spriteUrl(nation, seen.role, seen.tier));
        // Upright to the eye, whichever way the holder faces — a battery faces its target.
        plate.rotation.y = -holder.rotation.y;
        built.body.add(plate);
      } else {
        built.body = figurine.object;
        built.body.scale.setScalar(1 / REPLAY_STAGE);
        built.length = figurine.span / REPLAY_STAGE;
        // A tank turns its turret and a gun draws back its barrel: an articulated copy stands in
        // for the model for the scene, the resting board keeping its own (ADR 0036 §5).
        const rig = Object.hasOwn(GUNS, seen.role) ? (seen.role as GunKind) : undefined;
        if (rig !== undefined && figurine.url !== undefined) {
          built.gunKind = rig;
          built.turretLimit = turretLimitOf(nation, seen.tier);
          articulatedOf(figurine.url, rig).then(
            (cooked) => {
              const copy = cooked.clone(true);
              figurine.standIn?.(copy);
              built.guns = new Guns(copy, rig, built.turretLimit);
              built.look = 'whole';
            },
            () => {},
          );
        }
        // The models' markers are in model units: what hangs there drops the model's scale.
        void figurine.ready.then(
          () => {
            const men: Object3D[] = [];
            built.body.traverse((part) => part.name.startsWith('man_') && men.push(part));
            built.men = men;
            const muzzle = figurine.object.getObjectByName('fx_muzzle');
            if (muzzle) {
              muzzle.add(flashSprite);
              built.flashSize = FLASH_SIZE / scaleWithin(muzzle, pivot);
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
    built.yaw = holder.rotation.y;
    built.shot.visible = false;
    built.shot.userData.ground = true;
    this.object.add(holder);
    return built;
  }

  /**
   * Draws `frame`. `seconds` is the smoke's clock, `still` the reduced motion: no drop from
   * above, a steady flash rather than a pulse.
   */
  show(
    frame: ReplayFrame,
    seconds: number,
    still: boolean,
    turns: ReadonlyArray<number> | null = null,
  ): void {
    const { step, progress } = frame;
    // Each volley is heard once, as it leaves (POC, `fire`).
    const heard = frame.firing === null ? null : `${step}:${frame.firing}`;
    if (heard !== null && heard !== this.heard) playTableSound('fire');
    this.heard = heard;
    const count = this.pieces.length;
    const mineCount = frame.pieces.filter((piece) => piece.side === 'mine').length;
    this.pieces.forEach((piece, k) => {
      const state = frame.pieces[k]!;
      const { holder, pivot } = piece;
      const down =
        this.onMap !== null
          ? 1
          : step === 'voyage'
            ? -1
            : step === 'pose' && !still
              ? progress * 1.6 - k / count
              : 1;
      holder.visible = down >= 0;
      holder.position.y = DROP * (1 - ease(Math.min(1, Math.max(0, down)))) ** 2;

      const fires = frame.firing === piece.side && state.fate !== 'fallen';
      // One instant for the flash, the smoke, the ink and the recoil: this piece's departure.
      const since = fires ? sinceDeparture(frame, rankOf(k, mineCount)) : null;
      const salvo = !fires
        ? 0
        : still
          ? 1
          : since === null || since < 0 || since >= FLASH_MS
            ? 0
            : Math.sin((Math.PI * since) / FLASH_MS);
      piece.flash.visible = salvo > 0.02;
      piece.flash.scale.setScalar(piece.flashSize * salvo);
      const sinceLanded = sinceImpact(frame) ?? Infinity;
      const lingering = sinceLanded >= 0 && sinceLanded < LINGER_MS;
      const fade = lingering ? Math.min(1, (LINGER_MS - sinceLanded) / LINGER_FADE_MS) : 1;
      piece.firing.object.visible =
        fires && (still || (since !== null && since >= 0 && (sinceLanded < 0 || lingering)));
      piece.firing.frame(still ? 0.4 : (since ?? 0) / 1000 + 0.03, fade);

      const fall = state.fate === 'fallen' ? ease(state.progress) : 0;
      const retreat = state.fate === 'routed' ? ease(state.progress) : 0;
      const sign = piece.side === 'mine' ? -1 : 1;
      // On the map the attacker walks its last steps in over the voyage, and a rout turns about.
      const arriving =
        this.onMap === piece.side && step === 'voyage' && !still ? 1 - ease(progress) : 0;
      holder.position.x =
        piece.home[0] + sign * (this.onMap === null ? RETREAT * retreat : ARRIVAL * arriving);
      if (turns !== null) holder.rotation.y = piece.yaw + Math.PI * ease(turns[k] ?? 0);
      holder.rotation.z = shakeOf(frame, still);
      if (piece.burns) {
        // A tank rears and a gun slides back as its shot leaves (`since`); nothing at reduced motion.
        const gun = piece.gunKind === null ? null : GUNS[piece.gunKind];
        const recoil = still ? 0 : recoilAt(since);
        pivot.rotation.set(gun === null ? 0 : ((gun.rock * Math.PI) / 180) * recoil, 0, 0);
        if (gun !== null) piece.body.position.z = -gun.piece * piece.length * recoil;
      } else if (piece.card) {
        // Away from the eye: mine's +x is the scene's -z, theirs' is its +z.
        pivot.rotation.set(0, 0, (piece.side === 'mine' ? -1 : 1) * (Math.PI / 2) * fall);
      } else {
        // Backwards, away from the other line: the holder's +z faces it — a block onto its back.
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
    const volley = volleyOf(frame);
    const battery = batteryOf(this.fire) !== null;
    this.pieces.forEach((piece, k) => {
      piece.shot.scale.z = 1;
      if (this.fire === 'unseen') {
        this.fall(
          piece,
          frame.firing === 'theirs' && volley !== null
            ? shotShare(volley, rankOf(k, mineCount), still)
            : null,
        );
        return;
      }
      const target = this.pieces[salvoTarget(k, mine, count - mine) ?? -1];
      const fires = frame.firing === piece.side && frame.pieces[k]!.fate !== 'fallen';
      /** **La batterie trace un trait** (A4) : il part d'elle, gagne la cible pendant la salve, et
       *  reste posé jusqu'à la fin de la frappe — le coup se lit d'un bout à l'autre. */
      const stroke = battery && piece.side === 'mine';
      const share =
        stroke && fires
          ? still || volley === null
            ? 1
            : volley
          : fires && (still || volley !== null)
            ? shotShare(volley ?? 0, rankOf(k, mine), still)
            : null;
      piece.shot.visible = share !== null && target !== undefined;
      if (!piece.shot.visible) return;
      muzzle.copy(piece.holder.position).setY(piece.holder.position.y + MUZZLE_HEIGHT);
      aim.copy(target!.holder.position).setY(target!.holder.position.y + MUZZLE_HEIGHT * 0.8);
      if (stroke) {
        aim.lerpVectors(muzzle, aim, share!);
        piece.shot.position.lerpVectors(muzzle, aim, 0.5);
        piece.shot.scale.z = Math.max(1e-3, muzzle.distanceTo(aim) / SHOT_LENGTH);
      } else piece.shot.position.lerpVectors(muzzle, aim, share!);
      // In the scene's own frame: `lookAt` would read `to` as a world point.
      piece.shot.quaternion.setFromUnitVectors(FORWARD, aim.sub(muzzle).normalize());
    });
    this.articulate(frame, still);
  }

  /**
   * **Les pièces en joue** (#331) : chaque tourelle pivote vers sa cible au plus court, chaque
   * tube recule à son départ, l'homme de rang 1 s'agenouille et épaule. Tenu à `readyOf`, qui
   * rend la pose de repos exacte à la fin du compte-rendu.
   */
  private articulate(frame: ReplayFrame, still: boolean): void {
    const mine = frame.pieces.filter((piece) => piece.side === 'mine').length;
    const ready = readyOf(frame);
    this.pieces.forEach((piece, k) => {
      if (piece.guns === null && piece.men.length === 0) return;
      const state = frame.pieces[k]!;
      const rout = state.fate === 'routed' ? state.progress : 0;
      const fires = frame.firing === piece.side && state.fate !== 'fallen';
      const since = fires && !still ? sinceDeparture(frame, rankOf(k, mine)) : null;
      if (piece.guns !== null) {
        const target = this.pieces[salvoTarget(k, mine, this.pieces.length - mine) ?? -1];
        const aim =
          target === undefined
            ? 0
            : wrap(
                Math.atan2(
                  target.holder.position.x - piece.holder.position.x,
                  target.holder.position.z - piece.holder.position.z,
                ) - piece.holder.rotation.y,
              );
        piece.guns.point(aim, ready, ready * (1 - Math.min(1, rout / 0.25)), recoilAt(since));
      }
      piece.men.forEach((man, j) =>
        shoulder(
          man,
          ready * (1 - Math.min(1, rout / 0.2)),
          recoilAt(since === null ? null : since - SQUAD_LAG_MS * j),
        ),
      );
    });
  }

  /** **Le coup sans origine** (A4) : bombardée, la cible voit l'obus tomber sur elle, du ciel. */
  private fall(piece: Piece, share: number | null): void {
    piece.shot.visible = piece.side === 'mine' && share !== null;
    if (!piece.shot.visible) return;
    aim.copy(piece.holder.position).setY(piece.holder.position.y + MUZZLE_HEIGHT);
    muzzle.copy(aim).setY(aim.y + SKY);
    piece.shot.position.lerpVectors(muzzle, aim, share!);
    piece.shot.quaternion.setFromUnitVectors(FORWARD, aim.sub(muzzle).normalize());
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
