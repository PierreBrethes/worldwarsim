import { Group, Vector3, type Camera, type Raycaster } from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import {
  pawnTarget,
  temporalPosition,
  unrollRoute,
  type UnrolledSegment,
} from '@/domain/route-timing';
import type { ArcView } from '@/domain/player-view';
import { movementSprites } from '@/emblems/units/manifest';
import { buildThread, pointOnLeg, projectOnGround, stretchTether, type Thread } from './thread';
import { Pawn } from './pawn';
import { ARC_COLORS } from './palette';
import type { MapMotion } from '@/domain/map-motion';
import type { WorldFrame } from './frame';

type RenderedArc = {
  arc: ArcView;
  thread: Thread;
  unrolled: ReadonlyArray<UnrolledSegment>;
  pawn: Pawn;
  /** Rewritten in place every frame: it is the movement-head label's anchor. */
  headPosition: Vector3;
  /**
   * **The share walked, advanced by the loop and not by React.** `arc.progress` is a snapshot
   * taken the instant the server's answer was adapted; reading it every frame renders a column
   * that never moves until something else happens to re-render the board. The widget already
   * counts down against its own clock, and the map has to do the same — with the difference
   * that here it costs no re-render at all.
   */
  progress: number;
  /** Share of the trip per millisecond, zero for anything that is not travelling. */
  pace: number;
};

/**
 * Thickness carries the hierarchy between movements, in pixels and not world units: what is
 * not mine does not push to the foreground. Within a thread it says nothing — covered and
 * remaining are the same stroke, and the dashes tell them apart.
 */
const THICKNESSES: Readonly<Record<ArcView['state'], number>> = {
  mine: 2.5,
  enemyDetected: 2,
  lastKnown: 2,
  seaControl: 2,
};

const TRACE_OPACITY = 0.55;

/**
 * The accent is a matter of intensity, never of color: a thread's color says whose it is,
 * changing it on hover would say something else. The designated thread rises, the others
 * fade — it is the gap that reads, not the absolute value.
 */
const ACCENT_DESIGNATED = 1.6;
const ACCENT_OTHERS = 0.4;
/** A thread's pointer pick radius, in pixels: a fat line is aimed at on screen. */
export const ARC_HOVER_THRESHOLD = 6;

export class ArcLayer {
  readonly group = new Group();
  /** The head labels' screen positions read here: they move every frame. */
  readonly headPositions = new Map<string, Vector3>();
  private readonly pawnPoint = new Vector3();
  private readonly aheadPoint = new Vector3();
  private readonly groundPoint = new Vector3();
  private readonly cameraPosition = new Vector3();
  private playerNation: string | null = null;
  private rendered: RenderedArc[] = [];
  private targets: Line2[] = [];
  private accented: string | null = null;
  private width = 1;
  private height = 1;
  private unitsPerPixel = 1;
  /** The dash drift's clock: it lives in the loop, never in React state. */
  private lastFrameMs = 0;
  /** `off` stops the dashes drifting, so a displayed thread no longer forces continuous rendering. */
  motion: MapMotion = 'full';

  constructor(private readonly frame: WorldFrame) {}

  setPlayerNation(nation: string | null): void {
    if (nation === this.playerNation) return;
    this.playerNation = nation;
    this.rebuild();
  }

  /**
   * A fat line thickens in pixels: it needs the canvas size to convert. Keeping it here
   * prevents a thread built after a resize from being born at the wrong scale — the kind of
   * bug that only shows after moving the window.
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    for (const rendered of this.rendered) rendered.thread.setResolution(width, height);
  }

  display(arcs: ReadonlyArray<ArcView>, carried?: ReadonlyMap<string, number>): void {
    this.clear();
    for (const arc of arcs) {
      const stale = arc.state === 'lastKnown';
      const thread = buildThread(
        arc.route,
        this.frame,
        ARC_COLORS[arc.state],
        THICKNESSES[arc.state],
        {
          trace: TRACE_OPACITY,
          progress: stale ? 0.45 : 1,
        },
      );
      thread.setResolution(this.width, this.height);
      thread.setScale(this.unitsPerPixel);
      this.group.add(thread.object);
      for (const target of thread.targets) {
        target.userData.arc = arc.id;
        this.targets.push(target);
      }

      const pawn = new Pawn(
        movementSprites(arc, this.playerNation),
        ARC_COLORS[arc.state].progress,
      );
      pawn.visible = !stale;
      this.group.add(pawn.object);

      const headPosition = new Vector3();
      this.headPositions.set(arc.id, headPosition);

      this.rendered.push({
        arc,
        thread,
        unrolled: unrollRoute(arc.route),
        pawn,
        headPosition,
        /** A column the server says is at the end of its thread wins over the value the loop
         *  carried: held at the border, its pace is nil, and a pawn carried to 0,98 would
         *  otherwise stand there for good. */
        progress: arc.progress >= 1 ? 1 : (carried?.get(arc.id) ?? arc.progress),
        pace: paceOf(arc),
      });
    }
    this.applyAccent();
    this.animate();
  }

  /** Un fil affiché n'est jamais immobile : ses tirets dérivent vers l'arrivée et son pion
   *  marche. Tant qu'il y en a un, chaque image est due (`frame-demand.ts`). */
  get isFlowing(): boolean {
    return this.motion !== 'off' && this.rendered.length > 0;
  }

  /**
   * Hover comes from the timeline or the pointer, but the accent never climbs back to
   * React: an id comes in, opacities change, the loop keeps running at sixty frames.
   */
  accent(id: string | null): void {
    if (id === this.accented) return;
    this.accented = id;
    this.applyAccent();
  }

  /** The movement id under the pointer, so the timeline highlights its card. */
  hover(ray: Raycaster): string | null {
    const hit = ray.intersectObjects(this.targets, false)[0];
    return (hit?.object.userData.arc as string | undefined) ?? null;
  }

  /**
   * The thread is baked once; per frame only an `instanceCount` advances and a pawn moves.
   * The position comes from time, not distance: a movement straddling three mediums does
   * not cross the sea at road speed, and it stops at the dock.
   */
  animate(camera?: Camera, unitsPerPixel?: number): void {
    if (camera) this.cameraPosition.copy(camera.position);
    if (unitsPerPixel !== undefined) this.unitsPerPixel = unitsPerPixel;

    const now = performance.now();
    const sinceLastFrame = this.lastFrameMs === 0 ? 0 : now - this.lastFrameMs;
    const elapsed = sinceLastFrame / 1000;
    this.lastFrameMs = now;

    for (const rendered of this.rendered) {
      if (unitsPerPixel !== undefined) rendered.thread.setScale(unitsPerPixel);
      if (this.motion !== 'off') rendered.thread.drift(elapsed);

      rendered.progress = Math.min(1, rendered.progress + sinceLastFrame * rendered.pace);
      const position = temporalPosition(rendered.unrolled, rendered.progress);
      const { legIndex, local } = pawnTarget(position);

      rendered.thread.cut(legIndex, local);

      const leg = rendered.thread.legs[legIndex];
      if (leg === undefined) continue;
      pointOnLeg(leg, local, this.pawnPoint);
      pointOnLeg(leg, Math.min(1, local + 0.01), this.aheadPoint);

      // At the dock, the pawn already wears the silhouette of what it is about to become:
      // it is the embarkation itself that shows, and the stop that reads.
      rendered.pawn.wear(
        position.kind === 'dock'
          ? (rendered.thread.legs[position.legIndex]?.medium ?? leg.medium)
          : leg.medium,
      );
      rendered.pawn.place(this.pawnPoint, this.aheadPoint);
      rendered.pawn.orient(this.cameraPosition);
      rendered.headPosition.copy(this.pawnPoint);

      if (rendered.thread.tether !== null) {
        projectOnGround(this.pawnPoint, this.frame, this.groundPoint);
        stretchTether(rendered.thread.tether, this.pawnPoint, this.groundPoint);
      }
    }
  }

  /**
   * A rebuild is a change of geometry — the curvature moved, the player's nation landed — never
   * a change of hour. The share walked is carried over, otherwise a nudge of the curvature
   * slider would snap every column back to where the last server answer found it.
   */
  rebuild(): void {
    this.display(
      this.rendered.map((rendered) => rendered.arc),
      new Map(this.rendered.map((rendered) => [rendered.arc.id, rendered.progress])),
    );
  }

  /** Frees every thread and pawn, and detaches them from the scene. */
  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }

  private applyAccent(): void {
    for (const rendered of this.rendered) {
      rendered.thread.setAccent(
        this.accented === null
          ? 1
          : rendered.arc.id === this.accented
            ? ACCENT_DESIGNATED
            : ACCENT_OTHERS,
      );
    }
  }

  private clear(): void {
    for (const rendered of this.rendered) {
      rendered.thread.dispose();
      rendered.pawn.dispose();
    }
    this.rendered = [];
    this.targets = [];
    this.headPositions.clear();
  }
}

/**
 * How fast a column walks its own thread, as a share of the thread per millisecond — derived from
 * the one thing the server dates. For a movement of mine that is the arrival; **for a sighting it
 * is the close of the window**, because the thread drawn is the watched stretch and the pawn is
 * due at its end when the watch ends, not when the column lands somewhere nobody was shown.
 *
 * **Zero is a still pawn and not a bug**: a last known position is a memory and a sea control a
 * standing fact. The map must not invent a pace to fill a `null`.
 */
function paceOf(arc: ArcView): number {
  const left =
    arc.state === 'mine'
      ? arc.minutesLeft
      : arc.state === 'enemyDetected'
        ? arc.watchMinutesLeft
        : null;
  if (left === null || left <= 0 || arc.progress >= 1) return 0;
  return (1 - arc.progress) / (left * 60_000);
}
