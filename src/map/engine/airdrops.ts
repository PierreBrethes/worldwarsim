import {
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  type Vector3,
} from 'three';
import type { MapMotion } from '@/domain/map-motion';
import { metresOnBoard } from '@/domain/piece-size';
import { CRATE_METRES, CRATE_SLATS, CRATE_WOOD, crateOf } from './crate';
import { FlightCopy, lendFlightCopy } from './flight-copy';
import type { RestPose } from './figurines/figurine';
import { CANOPY, HANG, LINES } from './parachute';
import { pieceScale } from './piece-scale';
import { type Airdrop, airdrop, ENTRY_MS, FLY_ON_MS } from './timelines/airdrop';

/**
 * **What a largage plays, where the view learns it** (#508): the plane and the fall at true size
 * where the plane was just seen and the eye is close; the pixel parachute (`ParachuteLayer`)
 * otherwise, and always at reduced motion; nothing when nothing came down and no plane plays.
 */
export type DropPlan = 'plane' | 'pixels' | 'nothing';

export function airdropPlan(o: {
  readonly delivered: boolean;
  readonly motion: MapMotion;
  /** The pawn of the outward arc was kept (`ArcLayer.takeFlown`), and its model can be copied. */
  readonly flown: boolean;
  /** In the field and near enough for a piece to stand (`seenWhole`). */
  readonly whole: boolean;
}): DropPlan {
  if (o.motion === 'off') return 'nothing';
  if (o.motion === 'full' && o.flown && o.whole) return 'plane';
  return o.delivered ? 'pixels' : 'nothing';
}

/** A board offset (x, z from the target) in the flight's frame, as `airdrop` takes `to`: x along
 *  the flight, y up, z to its right. The inverse of the timeline's own turn. */
export function inFlightFrame(
  [x, z]: readonly [x: number, z: number],
  heading: number,
): readonly [number, number, number] {
  return [
    x * Math.sin(heading) + z * Math.cos(heading),
    0,
    -x * Math.cos(heading) + z * Math.sin(heading),
  ];
}

/** **The piece that takes the crate** (#508): the one nearest `at` within `within`, ties by id. */
export function nearestPiece<T extends { id: string; x: number; z: number }>(
  pieces: ReadonlyArray<T>,
  at: { x: number; z: number },
  within: number,
): T | null {
  let best: { piece: T; gap: number } | null = null;
  for (const piece of pieces) {
    const gap = Math.hypot(piece.x - at.x, piece.z - at.z);
    if (gap > within) continue;
    if (best === null || gap < best.gap || (gap === best.gap && piece.id < best.piece.id))
      best = { piece, gap };
  }
  return best?.piece ?? null;
}

/** How far from the target a piece may stand and take the crate. `@a-mesurer` */
const TAKER_REACH_M = 80;

/** **Where the crate goes to be taken** (#508), as `Airdrops.play` takes `to`: the nearest piece's
 *  offset from the target, in the units the timeline is written in (the pieces stand at `size`
 *  times them); `null` when no piece is near: the pile is gone, and the crate melts where it lies. */
export function takerOffset(
  pieces: ReadonlyArray<{ id: string; x: number; z: number }>,
  at: { x: number; z: number },
  size: number,
): readonly [x: number, z: number] | null {
  const piece = nearestPiece(pieces, at, metresOnBoard(TAKER_REACH_M) * size);
  return piece === null ? null : [(piece.x - at.x) / size, (piece.z - at.z) / size];
}

/**
 * **A largage, wired** (#508): what `dropAt` does once it has the plan. The copy is put in the
 * scene (`play` says whether it came), and only then the plane that flies home is held out of
 * sight, for as long as the copy's pass; if it does not come (no file, a cooking that rejects) the
 * home plane stays, and a delivered packet falls in pixels instead. The piece that takes the crate
 * is asked for only on a delivered drop on a squad: on an outpost the site has no mark for its
 * Magasin (the storyboard's prop), so the crate melts where it lies.
 */
export async function playDrop(o: {
  readonly plan: DropPlan;
  readonly delivered: boolean;
  readonly squad: boolean;
  readonly taker: () => readonly [x: number, z: number] | null;
  readonly play: (to: readonly [x: number, z: number] | null) => Promise<boolean>;
  readonly holdBack: (until: number) => void;
  readonly pixels: () => void;
  readonly now: () => number;
}): Promise<void> {
  if (o.plan === 'pixels') return o.pixels();
  if (o.plan !== 'plane') return;
  const to = o.delivered && o.squad ? o.taker() : null;
  const placed = await o.play(to).catch(() => false);
  if (placed) o.holdBack(o.now() + FLY_ON_MS);
  else if (o.delivered) o.pixels();
}

type Live = {
  readonly origin: Group;
  readonly drop: Airdrop;
  readonly flight: FlightCopy;
  readonly crate: Group;
  readonly chute: Group;
  readonly canopy: Mesh;
  readonly lines: LineSegments;
  readonly paper: MeshStandardMaterial;
  readonly wood: MeshStandardMaterial;
  readonly slats: MeshStandardMaterial;
  readonly rope: LineBasicMaterial;
  readonly start: number;
};

/**
 * **A transport's pass, and its crate falling at true size** (#508, `timelines/airdrop.ts`): the
 * copy of the plane that was a pawn (#507) flies its pass over the target, opens its bay, and the
 * crate leaves under a canopy of 8 m. The pieces are standard-lit and in this layer's `group`,
 * which the engine warms by night with the others. One at a time per target; each is gone when
 * its timeline ends.
 */
export class Airdrops {
  readonly group = new Group();
  private lives: Live[] = [];
  private disposed = false;

  constructor(private readonly changed: () => void) {}

  get active(): boolean {
    return this.lives.length > 0;
  }

  /**
   * Plays one transport's pass over `at` at `heading`, from the model the pawn wore. `to` is the
   * board offset of the piece that takes the crate, from `at`; `null` for a crate that lies and
   * melts. Starts when the copy is cooked; `false` when it does not come.
   */
  async play(o: {
    readonly piece: { readonly url?: string; readonly pose?: RestPose };
    readonly at: Vector3;
    readonly heading: number;
    readonly delivered: boolean;
    readonly to: readonly [x: number, z: number] | null;
  }): Promise<boolean> {
    const flight = await lendFlightCopy(o.piece);
    // Cooked after the engine was gone: nothing is left to put it in.
    if (flight === null || this.disposed) return false;
    const release = flight.release() ?? undefined;
    const drop = airdrop({
      delivered: o.delivered,
      motion: 'full',
      heading: o.heading,
      ...(release === undefined ? {} : { release }),
      ...(o.to === null ? {} : { to: inFlightFrame(o.to, o.heading) }),
    });
    const paper = new MeshStandardMaterial({ color: '#efe6cf', transparent: true });
    const wood = new MeshStandardMaterial({ color: CRATE_WOOD, transparent: true });
    const slats = new MeshStandardMaterial({ color: CRATE_SLATS, transparent: true });
    const rope = new LineBasicMaterial({ color: '#5e4526', transparent: true, toneMapped: false });
    const canopy = new Mesh(CANOPY, paper);
    canopy.castShadow = true;
    const lines = new LineSegments(LINES, rope);
    const chute = new Group();
    chute.add(canopy, lines);
    const crate = crateOf(wood, slats, true);
    const origin = new Group();
    origin.position.copy(o.at);
    origin.add(flight.copy, crate, chute);
    flight.copy.traverse((node) => (node.castShadow = true));
    this.group.add(origin);
    this.lives.push({
      origin,
      drop,
      flight,
      crate,
      chute,
      canopy,
      lines,
      paper,
      wood,
      slats,
      rope,
      start: performance.now(),
    });
    this.changed();
    return true;
  }

  animate(now: number): void {
    this.lives = this.lives.filter((live) => this.place(live, now));
  }

  private place(live: Live, now: number): boolean {
    const { drop, flight, crate, chute, canopy, lines, origin } = live;
    const t = now - live.start + ENTRY_MS;
    if (t >= drop.ms) {
      this.group.remove(origin);
      for (const material of [live.paper, live.wood, live.slats, live.rope]) material.dispose();
      return false;
    }
    // Every length of the timeline is at the full common scale, like the figurines.
    origin.scale.setScalar(pieceScale.size);
    const pose = drop.plane(t);
    flight.copy.visible = pose.root !== undefined;
    flight.pose(pose);
    const packet = drop.packet(t);
    crate.visible = chute.visible = packet !== null;
    if (packet === null) return true;
    const [x, y, z] = packet.at;
    crate.position.set(x, y, z);
    crate.scale.setScalar(packet.crate / CRATE_METRES);
    // The canopy hangs `HANG` of its width above the crate's foot, and sinks onto it as it lies.
    const w = Math.max(packet.canopy, 1e-6);
    chute.visible = packet.canopy > 0;
    chute.scale.setScalar(w);
    chute.position.set(x, y + HANG * w, z);
    canopy.scale.y = 1 - 0.85 * packet.collapse;
    canopy.position.y = 0.2 - (0.2 + HANG) * packet.collapse;
    lines.visible = packet.collapse < 0.5;
    for (const material of [live.paper, live.wood, live.slats, live.rope])
      material.opacity = packet.opacity;
    return true;
  }

  dispose(): void {
    this.disposed = true;
    for (const live of this.lives)
      for (const material of [live.paper, live.wood, live.slats, live.rope]) material.dispose();
    this.group.clear();
    this.lives = [];
  }
}
